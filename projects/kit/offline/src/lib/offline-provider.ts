import type { EnvironmentProviders, Provider, Type } from '@angular/core';
import { ErrorHandler, inject, Injectable, makeEnvironmentProviders, provideAppInitializer } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import type { OfflineCommandExecutor, OfflineCommandResult } from './offline-command-executor';
import { OFFLINE_COMMAND_EXECUTOR, OFFLINE_SYNC_CONTEXT } from './offline-command-executor';
import type { OfflineCommandHooks } from './offline-command-hooks';
import { DEFAULT_OFFLINE_COMMAND_HOOKS, OFFLINE_COMMAND_HOOKS } from './offline-command-hooks';
import type { OfflineKitEncryptionOptions, OfflineKitOptions } from './offline-kit-options';
import { OFFLINE_KIT_OPTIONS } from './offline-kit-options';
import { OfflineCoordinatorService } from './offline-coordinator.service';
import { OfflineMutationAdmissionService } from './offline-mutation-admission.service';
import {
  OFFLINE_MUTATION_PERSISTENCE_ADAPTER,
  OFFLINE_MUTATION_PERSISTENCE_ENABLED,
  OfflineMutationPersistenceService,
} from './offline-mutation-persistence.service';
import {
  IonicOfflineRepository,
  OFFLINE_REPOSITORY,
  selectOfflineRepository,
  supportsSynchronizedOfflineRepository,
} from './offline-repository';
import type { OfflineMutationRequestPolicy, OfflineRequestPolicy } from './offline-request-policy';
import {
  OFFLINE_MUTATION_REQUEST_POLICIES,
  OFFLINE_REQUEST_POLICIES,
  OfflineMutationRequestPolicyRegistry,
  OfflineRequestPolicyRegistry,
  provideOfflineMutationRequestPolicy,
  provideOfflineRequestPolicy,
} from './offline-request-policy';
import type { OfflineAggregateIntentProjector } from './offline-aggregate-intent-projector';
import { OFFLINE_AGGREGATE_INTENT_PROJECTOR } from './offline-aggregate-intent-projector';
import type { OfflineReplicaProjector, OfflineReplicaPuller } from './offline-replica-puller';
import { OFFLINE_REPLICA_PROJECTOR, OFFLINE_REPLICA_PULLER } from './offline-replica-puller';
import { OfflineSessionService } from './offline-session.service';
import { OfflineNetworkService } from './offline-network.service';
import { OfflineReplicaPullService } from './offline-replica-pull.service';
import { OfflineReplicaMutationCoordinator } from './offline-replica-mutation-coordinator';
import { OfflineSyncService } from './offline-sync.service';
import { OfflineRequestFallbackService } from './offline.interceptor';
import {
  COMMUNITY_SQLITE,
  type CommunitySqliteConnection,
  createCommunitySqliteDriver,
  SqliteOfflineRepository,
} from './sqlite-offline-repository';

/** Configuration for the standard offline repository, outbox, and request-policy runtime. */
interface ProvideOfflineOptionsBase extends Omit<OfflineKitOptions, 'databaseEncryption' | 'createEncryptionKey'> {
  /** Product policies that map URLs and DTOs to generic replica/outbox operations. */
  requestPolicies: readonly Type<OfflineRequestPolicy>[];
  /** Optional product hooks for entity projection and command cleanup. */
  commandHooks?: Type<OfflineCommandHooks>;
  /** Optional additional providers required by product adapters. */
  providers?: readonly Provider[];
  /** Optional pure adapter for product-owned local-only projections applied inside the Kit pull transaction. */
  replicaProjector?: Type<OfflineReplicaProjector>;
  /** Application-installed `@capacitor-community/sqlite` connection. Required only on iOS and Android. */
  sqliteConnection?: CommunitySqliteConnection;
}

/** Full replica pull and durable Outbox synchronization. */
export type ProvideSynchronizedOfflineOptions = ProvideOfflineOptionsBase &
  OfflineKitEncryptionOptions & {
    mode?: 'synchronized';
    /** Product policies that replace matched writes with atomic local-first mutations. */
    mutationPolicies?: readonly Type<OfflineMutationRequestPolicy>[];
    /** Product adapter that sends opaque commands to its API. */
    commandExecutor: Type<OfflineCommandExecutor>;
    /** Product transport for explicit cursor-based server delta pulls. */
    replicaPuller: Type<OfflineReplicaPuller>;
    /**
     * Required pure adapter that rematerializes one aggregate from its
     * authoritative confirmed base/localOnly values and remaining Outbox intents.
     *
     * Kit calls it inside {@link OfflineReplicaMutationCoordinator} after enqueue,
     * replacement, discard, transport success, and pull acknowledgement. Do not
     * call the projector from product code.
     */
    aggregateIntentProjector: Type<OfflineAggregateIntentProjector>;
  };

/** Server- or external-source read cache with no mutation transport or Outbox. */
export type ProvideReadCacheOfflineOptions = ProvideOfflineOptionsBase &
  OfflineKitEncryptionOptions & {
    mode: 'readCacheOnly';
    mutationPolicies?: never;
    mutationPersistence?: never;
    commandExecutor?: never;
    replicaPuller?: never;
  };

export type ProvideOfflineOptions = ProvideSynchronizedOfflineOptions | ProvideReadCacheOfflineOptions;

const READ_CACHE_ONLY_COMMAND_EXECUTOR: OfflineCommandExecutor = {
  execute: async (): Promise<OfflineCommandResult> => {
    throw new Error('This offline provider is configured as a read-only cache.');
  },
};

const READ_CACHE_ONLY_REPLICA_PULLER: OfflineReplicaPuller = {
  pull: async (request) => ({
    schemaVersion: request.schemaVersion,
    schemaHash: request.schemaHash,
    changes: [],
    nextCursor: request.cursor,
    hasMore: false,
  }),
};

/** Starts one route-scoped offline runtime after product-owned local recovery has completed. */
@Injectable()
export class OfflineRouteInitializerService {
  readonly #coordinator = inject(OfflineCoordinatorService);
  readonly #errorHandler = inject(ErrorHandler);
  readonly #options = inject(OFFLINE_KIT_OPTIONS);
  #initialization: Promise<void> | null = null;

  /** Initialize local storage once, optionally continuing transport initialization in the background. */
  initialize(options: { remote?: 'background' | 'deferred' } = {}): Promise<void> {
    return (this.#initialization ??= this.#initialize(options.remote ?? 'background'));
  }

  /** Starts deferred network discovery and synchronization without delaying the caller on transport. */
  startRemoteRuntime(): Promise<void> {
    assertSupportedOfflineMode(Capacitor.getPlatform(), this.#options.mode ?? 'synchronized');
    return initializeOfflineRuntime(this.#coordinator, this.#errorHandler);
  }

  #initialize(remote: 'background' | 'deferred'): Promise<void> {
    assertSupportedOfflineMode(Capacitor.getPlatform(), this.#options.mode ?? 'synchronized');
    return remote === 'deferred' ? this.#coordinator.initializeLocal() : initializeOfflineRuntime(this.#coordinator, this.#errorHandler);
  }
}

/**
 * Provide the standard scoped offline runtime.
 *
 * @remarks
 * Web uses Ionic Storage. Native iOS/Android uses `@capacitor-community/sqlite`, encrypted by default. The application owns
 * URL/DTO policy and command execution; the kit owns persistence, ordering, retries, and session
 * isolation.
 *
 * Optional {@link OfflineKitOptions.onStorageUnavailable} opts into online-only startup when
 * local storage cannot be opened; without it, the app initializer still throws.
 */
export function provideOffline(options: ProvideOfflineOptions): EnvironmentProviders {
  return makeEnvironmentProviders([
    ...offlineConfigurationProviders(options),
    provideAppInitializer(() => {
      assertSupportedOfflineMode(Capacitor.getPlatform(), options.mode ?? 'synchronized');
      return initializeOfflineRuntime(inject(OfflineCoordinatorService), inject(ErrorHandler));
    }),
  ]);
}

/**
 * Provide an isolated offline runtime in a lazy route `EnvironmentInjector`.
 *
 * @remarks
 * This is an additive route-scoped counterpart to {@link provideOffline}. It re-provides every Kit
 * runtime service so their dependencies resolve from the route injector instead of the application
 * root. It deliberately does not register an application initializer: the route owns when local
 * recovery has completed and may then await `OfflineCoordinatorService.initializeLocal()` before
 * allowing activation. Existing root applications should continue using {@link provideOffline}.
 */
export function provideRouteScopedOffline(options: ProvideOfflineOptions): EnvironmentProviders {
  return makeEnvironmentProviders([
    IonicOfflineRepository,
    SqliteOfflineRepository,
    OfflineNetworkService,
    OfflineMutationAdmissionService,
    OfflineMutationPersistenceService,
    OfflineSessionService,
    OfflineReplicaPullService,
    OfflineReplicaMutationCoordinator,
    OfflineSyncService,
    OfflineCoordinatorService,
    OfflineRequestPolicyRegistry,
    OfflineMutationRequestPolicyRegistry,
    OfflineRequestFallbackService,
    OfflineRouteInitializerService,
    ...routeScopedOptionalDefaults(options),
    ...offlineConfigurationProviders(options),
  ]);
}

/**
 * Child-local defaults for every optional offline token the route did not configure.
 *
 * @remarks
 * Without them a parent injector that already ran {@link provideOffline} would leak its own hooks,
 * projectors, persistence adapter, and policies into the route runtime. Defaults are emitted only
 * for tokens the route leaves unspecified, so route overrides and multi policies still win.
 */
function routeScopedOptionalDefaults(options: ProvideOfflineOptions): Provider[] {
  const synchronized = options.mode !== 'readCacheOnly';
  return [
    ...(options.commandHooks ? [] : [{ provide: OFFLINE_COMMAND_HOOKS, useValue: DEFAULT_OFFLINE_COMMAND_HOOKS }]),
    ...(options.replicaProjector ? [] : [{ provide: OFFLINE_REPLICA_PROJECTOR, useValue: null }]),
    ...(synchronized && 'aggregateIntentProjector' in options && options.aggregateIntentProjector
      ? []
      : [{ provide: OFFLINE_AGGREGATE_INTENT_PROJECTOR, useValue: null }]),
    ...(options.mutationPersistence ? [] : [{ provide: OFFLINE_MUTATION_PERSISTENCE_ADAPTER, useValue: null }]),
    ...(options.requestPolicies.length > 0 ? [] : [{ provide: OFFLINE_REQUEST_POLICIES, useValue: [] }]),
    ...((options.mutationPolicies ?? []).length > 0 ? [] : [{ provide: OFFLINE_MUTATION_REQUEST_POLICIES, useValue: [] }]),
  ];
}

function initializeOfflineRuntime(
  coordinator: Pick<OfflineCoordinatorService, 'initialize' | 'initializeLocal'>,
  errorHandler: Pick<ErrorHandler, 'handleError'>,
): Promise<void> {
  const localInitialization = coordinator.initializeLocal();
  void coordinator.initialize().catch(async (error: unknown) => {
    const localSucceeded = await localInitialization.then(
      () => true,
      () => false,
    );
    if (!localSucceeded) return;
    try {
      errorHandler.handleError(error);
    } catch {
      // Error reporting must not create an unhandled background rejection.
    }
  });
  return localInitialization;
}

function offlineConfigurationProviders(options: ProvideOfflineOptions): Provider[] {
  const synchronized = options.mode !== 'readCacheOnly';
  const kitOptions: OfflineKitOptions =
    options.databaseEncryption === false
      ? {
          mode: options.mode ?? 'synchronized',
          databaseName: options.databaseName,
          databaseEncryption: false,
          createEncryptionKey: options.createEncryptionKey,
          replicaSchema: options.replicaSchema,
          wireProtocol: options.wireProtocol,
          outboxLimits: options.outboxLimits,
          mutationPersistence: options.mutationPersistence,
          onStorageUnavailable: options.onStorageUnavailable,
        }
      : {
          mode: options.mode ?? 'synchronized',
          databaseName: options.databaseName,
          databaseEncryption: options.databaseEncryption ?? true,
          createEncryptionKey: options.createEncryptionKey,
          replicaSchema: options.replicaSchema,
          wireProtocol: options.wireProtocol,
          outboxLimits: options.outboxLimits,
          mutationPersistence: options.mutationPersistence,
          onStorageUnavailable: options.onStorageUnavailable,
        };
  return [
    ...(synchronized ? [options.commandExecutor, options.replicaPuller] : []),
    {
      provide: OFFLINE_KIT_OPTIONS,
      useValue: kitOptions,
    },
    {
      provide: COMMUNITY_SQLITE,
      useValue: options.sqliteConnection ? createCommunitySqliteDriver(options.sqliteConnection, options.databaseEncryption ?? true) : null,
    },
    {
      provide: OFFLINE_REPOSITORY,
      useFactory: () => selectOfflineRepository(Capacitor.getPlatform(), inject(IonicOfflineRepository), inject(SqliteOfflineRepository)),
    },
    {
      provide: OFFLINE_MUTATION_PERSISTENCE_ENABLED,
      useFactory: () => inject(OfflineMutationPersistenceService).enabled,
    },
    ...(options.mutationPersistence
      ? [
          options.mutationPersistence.adapter,
          { provide: OFFLINE_MUTATION_PERSISTENCE_ADAPTER, useExisting: options.mutationPersistence.adapter },
        ]
      : []),
    { provide: OFFLINE_SYNC_CONTEXT, useExisting: OfflineSessionService },
    synchronized
      ? { provide: OFFLINE_COMMAND_EXECUTOR, useExisting: options.commandExecutor }
      : { provide: OFFLINE_COMMAND_EXECUTOR, useValue: READ_CACHE_ONLY_COMMAND_EXECUTOR },
    synchronized
      ? { provide: OFFLINE_REPLICA_PULLER, useExisting: options.replicaPuller }
      : { provide: OFFLINE_REPLICA_PULLER, useValue: READ_CACHE_ONLY_REPLICA_PULLER },
    ...(options.commandHooks ? [options.commandHooks, { provide: OFFLINE_COMMAND_HOOKS, useExisting: options.commandHooks }] : []),
    ...(options.replicaProjector
      ? [options.replicaProjector, { provide: OFFLINE_REPLICA_PROJECTOR, useExisting: options.replicaProjector }]
      : []),
    ...(synchronized && 'aggregateIntentProjector' in options && options.aggregateIntentProjector
      ? [options.aggregateIntentProjector, { provide: OFFLINE_AGGREGATE_INTENT_PROJECTOR, useExisting: options.aggregateIntentProjector }]
      : []),
    ...options.requestPolicies.flatMap((policy) => provideOfflineRequestPolicy(policy)),
    ...(options.mutationPolicies ?? []).flatMap((policy) => provideOfflineMutationRequestPolicy(policy)),
    ...(options.providers ?? []),
  ];
}

/** Prevents unsupported multi-tab Web writes from silently losing Outbox state. */
export function assertSupportedOfflineMode(platform: string, mode: 'synchronized' | 'readCacheOnly'): void {
  if (!supportsSynchronizedOfflineRepository(platform) && mode === 'synchronized') {
    throw new Error(
      'Offline synchronized mode is supported only by native repositories. Use readCacheOnly until the selected repository provides cross-context locking.',
    );
  }
}
