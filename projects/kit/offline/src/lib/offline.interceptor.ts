import type { HttpEvent, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { HttpResponse as AngularHttpResponse } from '@angular/common/http';
import { ErrorHandler, inject, Injectable } from '@angular/core';
import type { Notification, ObservableNotification } from 'rxjs';
import {
  catchError,
  concat,
  concatMap,
  connect,
  defer,
  dematerialize,
  EMPTY,
  filter,
  from,
  map,
  materialize,
  NEVER,
  of,
  Observable,
  race,
  ReplaySubject,
  take,
  tap,
  throwError,
} from 'rxjs';
import { isOfflineFallbackError, OfflineNetworkService } from './offline-network.service';
import { OfflineReplicaMutationCoordinator } from './offline-replica-mutation-coordinator';
import { OFFLINE_MUTATION_PERSISTENCE_ENABLED } from './offline-mutation-persistence.service';
import {
  OFFLINE_BYPASS,
  OFFLINE_RESPONSE_HEADER,
  OfflineMutationRequestPolicyRegistry,
  OfflineRequestPolicyRegistry,
  type OfflineReadRequestPlan,
} from './offline-request-policy';

const LOCAL_FIRST_MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

type MaterializedTransport = Notification<HttpEvent<unknown>> & ObservableNotification<HttpEvent<unknown>>;

/** Applies product read and local-first mutation policies while observing real API reachability. */
export const offlineInterceptor: HttpInterceptorFn = (request, next) => {
  const network = inject(OfflineNetworkService);
  const transport = () => observeTransport(next(request), network);
  if (request.context.get(OFFLINE_BYPASS)) return transport();
  if (request.method === 'GET') {
    const registry = inject(OfflineRequestPolicyRegistry);
    const fallback = inject(OfflineRequestFallbackService);
    const plan = registry.resolve(request);
    if (!plan) return transport();
    if (plan.readStrategy === 'local-only') {
      return readLocalOnly(plan, inject(ErrorHandler), inject(OfflineReplicaMutationCoordinator));
    }
    if (plan.readStrategy === 'local-first') {
      return readLocalFirst(request, plan, transport, fallback, inject(ErrorHandler), inject(OfflineReplicaMutationCoordinator));
    }
    if (plan.readStrategy === 'fastest-first') {
      return readFastestFirst(request, plan, transport, fallback, inject(ErrorHandler), inject(OfflineReplicaMutationCoordinator));
    }
    return readNetworkFirst(request, plan, transport, fallback, inject(OfflineReplicaMutationCoordinator));
  }
  if (LOCAL_FIRST_MUTATION_METHODS.has(request.method)) {
    if (!inject(OFFLINE_MUTATION_PERSISTENCE_ENABLED)()) return transport();
    const plan = inject(OfflineMutationRequestPolicyRegistry).resolve(request);
    if (plan) {
      return defer(() => from(plan.prepare())).pipe(
        map((response) => response.clone({ headers: response.headers.set(OFFLINE_RESPONSE_HEADER, 'optimistic') })),
      );
    }
  }
  return transport();
};

/** Resolves a provisional/local identity without starting remote transport. */
function readLocalOnly(
  plan: OfflineReadRequestPlan,
  errorHandler: ErrorHandler,
  replicaMutations: OfflineReplicaMutationCoordinator,
): Observable<HttpEvent<unknown>> {
  return resolveLocalAttempt(plan, errorHandler, replicaMutations).pipe(concatMap((response) => (response ? of(response) : EMPTY)));
}

function readNetworkFirst(
  request: HttpRequest<unknown>,
  plan: OfflineReadRequestPlan,
  transport: () => Observable<HttpEvent<unknown>>,
  fallback: OfflineRequestFallbackService,
  replicaMutations: OfflineReplicaMutationCoordinator,
): Observable<HttpEvent<unknown>> {
  return defer(transport).pipe(
    catchError((error: unknown) => fallback.handle(request, error, plan) ?? throwError(() => error)),
    concatMap((event) => projectReadResponse(event, plan, replicaMutations)),
  );
}

/**
 * Stale-while-revalidate local-first GET handling.
 *
 * @remarks
 * Starts raw transport and `readLocal()` concurrently at outer subscription,
 * buffers materialized remote notifications until the local attempt settles,
 * emits a projected local response first on hit, then drains/projects the
 * buffered transport. Remote projection begins only after the local decision.
 *
 * Consumers must keep the returned observable subscribed through revalidation;
 * `firstValueFrom` and `take(1)` cancel in-flight transport and suppress
 * further emissions.
 */
function readLocalFirst(
  request: HttpRequest<unknown>,
  plan: OfflineReadRequestPlan,
  transport: () => Observable<HttpEvent<unknown>>,
  fallback: OfflineRequestFallbackService,
  errorHandler: ErrorHandler,
  replicaMutations: OfflineReplicaMutationCoordinator,
): Observable<HttpEvent<unknown>> {
  return defer(transport).pipe(
    materialize(),
    connect(
      (bufferedTransport$) =>
        resolveLocalAttempt(plan, errorHandler, replicaMutations).pipe(
          concatMap((localResponse) =>
            localResponse
              ? concat(of(localResponse), drainRemoteAfterLocal(bufferedTransport$, plan, replicaMutations))
              : drainRemoteNetworkFirst(bufferedTransport$, request, plan, fallback, replicaMutations),
          ),
        ),
      { connector: () => new ReplaySubject<MaterializedTransport>() },
    ),
  );
}

/** Races a serialized local replica read against remote transport without allowing stale local data to follow remote. */
function readFastestFirst(
  request: HttpRequest<unknown>,
  plan: OfflineReadRequestPlan,
  transport: () => Observable<HttpEvent<unknown>>,
  fallback: OfflineRequestFallbackService,
  errorHandler: ErrorHandler,
  replicaMutations: OfflineReplicaMutationCoordinator,
): Observable<HttpEvent<unknown>> {
  return defer(transport).pipe(
    materialize(),
    connect(
      (bufferedTransport$) => {
        const localDecision$ = resolveLocalAttempt(plan, errorHandler, replicaMutations).pipe(
          concatMap((localResponse) =>
            localResponse
              ? concat(of(localResponse), drainRemoteAfterLocal(bufferedTransport$, plan, replicaMutations))
              : drainRemoteNetworkFirst(bufferedTransport$, request, plan, fallback, replicaMutations),
          ),
        );
        // Angular transport emits Sent/progress events before the response.
        // They are not usable read results and therefore must not win the race.
        const remoteWinner$ = drainRemoteNetworkFirst(bufferedTransport$, request, plan, fallback, replicaMutations).pipe(
          filter((event) => event instanceof AngularHttpResponse),
          // A remote error is not a usable response. Keep it buffered until the
          // local attempt decides whether it can satisfy the read.
          catchError(() => NEVER),
        );
        return race(localDecision$, remoteWinner$);
      },
      { connector: () => new ReplaySubject<MaterializedTransport>() },
    ),
  );
}

function resolveLocalAttempt(
  plan: OfflineReadRequestPlan,
  errorHandler: ErrorHandler,
  replicaMutations: OfflineReplicaMutationCoordinator,
): Observable<HttpEvent<unknown> | null> {
  return serializedLocalRead(plan, replicaMutations).pipe(
    catchError((localError: unknown) => {
      errorHandler.handleError(localError);
      return of(null);
    }),
    concatMap((local) => (local ? tryProjectLocal(local, plan, errorHandler, replicaMutations) : of(null))),
    take(1),
  );
}

/** Skips a queued local read when its HTTP subscriber leaves before the lane opens. */
function serializedLocalRead(
  plan: OfflineReadRequestPlan,
  replicaMutations: OfflineReplicaMutationCoordinator,
): Observable<AngularHttpResponse<unknown> | null> {
  return new Observable((subscriber) => {
    let cancelled = false;
    void replicaMutations
      .runSerializedRead(async () => (cancelled ? null : plan.readLocal()))
      .then(
        (response) => {
          if (cancelled) return;
          subscriber.next(response);
          subscriber.complete();
        },
        (error: unknown) => {
          if (!cancelled) subscriber.error(error);
        },
      );
    return () => {
      cancelled = true;
    };
  });
}

function tryProjectLocal(
  cached: AngularHttpResponse<unknown>,
  plan: OfflineReadRequestPlan,
  errorHandler: ErrorHandler,
  replicaMutations: OfflineReplicaMutationCoordinator,
): Observable<HttpEvent<unknown> | null> {
  return emitTaggedLocalResponse(cached, plan, replicaMutations).pipe(
    catchError((error: unknown) => {
      errorHandler.handleError(error);
      return of(null);
    }),
  );
}

function emitTaggedLocalResponse(
  cached: AngularHttpResponse<unknown>,
  plan: OfflineReadRequestPlan,
  replicaMutations: OfflineReplicaMutationCoordinator,
): Observable<HttpEvent<unknown>> {
  return projectReadResponse(cached.clone({ headers: cached.headers.set(OFFLINE_RESPONSE_HEADER, 'local') }), plan, replicaMutations);
}

function drainRemoteAfterLocal(
  bufferedTransport$: Observable<MaterializedTransport>,
  plan: OfflineReadRequestPlan,
  replicaMutations: OfflineReplicaMutationCoordinator,
): Observable<HttpEvent<unknown>> {
  return bufferedTransport$.pipe(
    dematerialize(),
    catchError((error: unknown) => (isOfflineFallbackError(error) ? EMPTY : throwError(() => error))),
    concatMap((event) => projectReadResponse(event, plan, replicaMutations)),
  );
}

function drainRemoteNetworkFirst(
  bufferedTransport$: Observable<MaterializedTransport>,
  request: HttpRequest<unknown>,
  plan: OfflineReadRequestPlan,
  fallback: OfflineRequestFallbackService,
  replicaMutations: OfflineReplicaMutationCoordinator,
): Observable<HttpEvent<unknown>> {
  return bufferedTransport$.pipe(
    dematerialize(),
    catchError((error: unknown) => fallback.handle(request, error, plan) ?? throwError(() => error)),
    concatMap((event) => projectReadResponse(event, plan, replicaMutations)),
  );
}

function projectReadResponse(
  event: HttpEvent<unknown>,
  plan: OfflineReadRequestPlan,
  replicaMutations: OfflineReplicaMutationCoordinator,
): Observable<HttpEvent<unknown>> {
  if (!(event instanceof AngularHttpResponse) || !plan.projectResponse) return of(event);
  const source = event.headers.get(OFFLINE_RESPONSE_HEADER) === 'local' ? 'local' : 'remote';
  const projection = plan.serializeResponseProjection
    ? replicaMutations.runSerializedRead(() => plan.projectResponse!(event, source))
    : plan.projectResponse(event, source);
  return from(projection).pipe(
    map((response) =>
      source === 'local' ? response.clone({ headers: response.headers.set(OFFLINE_RESPONSE_HEADER, 'local') }) : response,
    ),
  );
}

function observeTransport(source: Observable<HttpEvent<unknown>>, network: OfflineNetworkService): Observable<HttpEvent<unknown>> {
  return source.pipe(
    tap({
      next: (event) => {
        if (!(event instanceof AngularHttpResponse)) return;
        if (event.headers.get(OFFLINE_RESPONSE_HEADER) === 'local') {
          network.markApiFailure();
          return;
        }
        network.markApiSuccess();
      },
      error: (error: unknown) => {
        if (isOfflineFallbackError(error)) network.markApiFailure();
      },
    }),
  );
}

/** Resolves transport failures from the local replica without hiding HTTP errors. */
@Injectable({ providedIn: 'root' })
export class OfflineRequestFallbackService {
  readonly #registry = inject(OfflineRequestPolicyRegistry);
  readonly #errorHandler = inject(ErrorHandler);
  readonly #replicaMutations = inject(OfflineReplicaMutationCoordinator);

  handle(
    request: HttpRequest<unknown>,
    error: unknown,
    resolvedPlan?: ReturnType<OfflineRequestPolicyRegistry['resolve']>,
  ): Observable<HttpEvent<unknown>> | null {
    if (request.context.get(OFFLINE_BYPASS) || request.method !== 'GET' || !isOfflineFallbackError(error)) return null;
    const plan = resolvedPlan ?? this.#registry.resolve(request);
    if (!plan || plan.kind !== 'read') return null;
    return serializedLocalRead(plan, this.#replicaMutations).pipe(
      catchError((localError: unknown) => {
        this.#errorHandler.handleError(localError);
        return throwError(() => error);
      }),
      concatMap((cached) =>
        cached ? of(cached.clone({ headers: cached.headers.set(OFFLINE_RESPONSE_HEADER, 'local') })) : throwError(() => error),
      ),
    );
  }
}
