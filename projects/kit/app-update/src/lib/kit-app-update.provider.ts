import { DOCUMENT } from '@angular/common';
import type { EnvironmentProviders } from '@angular/core';
import {
  EnvironmentInjector,
  Injectable,
  afterNextRender,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
  runInInjectionContext,
} from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import type { UnrecoverableStateEvent, VersionEvent } from '@angular/service-worker';
import { filter, take } from 'rxjs';

const UPDATE_CHECK_TIMEOUT_MS = 10_000;
const UPDATE_PROMPT_RETRY_MS = 1_000;
const UNRECOVERABLE_RELOAD_KEY = 'kit_sw_unrecoverable_reload';

/** Asks whether a downloaded service-worker update should be applied now. `undefined` requests a later retry. */
export type KitAppUpdatePrompt = () => Promise<boolean | undefined>;

/** Existing configuration for startup-blocking or background service-worker updates. */
export interface KitAppUpdateOptions {
  strategy?: 'blocking' | 'background';
}

/** Uses a non-blocking update check and asks the user before reloading. */
export interface KitConfirmAppUpdateOptions {
  strategy: 'confirm';
  /**
   * Runs after the first render when a complete update is ready.
   *
   * Resolve `true` to reload, `false` when the user explicitly defers, or `undefined` when UI could not be presented and
   * should be retried. The provider supplies an Angular injection context only for the callback's synchronous execution,
   * so resolve injected dependencies before crossing an async boundary.
   */
  promptForUpdate: KitAppUpdatePrompt;
}

/** Configuration accepted by {@link provideKitAppUpdate}. */
export type KitAppUpdateProviderOptions = (KitAppUpdateOptions & { promptForUpdate?: never }) | KitConfirmAppUpdateOptions;

/** Coordinates complete Angular service-worker updates using blocking, background, or user-confirmed application. */
@Injectable({ providedIn: 'root' })
export class KitAppUpdateService {
  readonly #document = inject(DOCUMENT);
  readonly #updates = inject(SwUpdate);
  #initialization: Promise<void> | null = null;
  #backgroundStarted = false;
  #interactive = false;
  #reloading = false;
  #updateReady = false;
  #prompting = false;
  #prompted = false;
  #promptRetryScheduled = false;
  #promptForUpdate: KitAppUpdatePrompt | undefined;

  /** Runs one startup update check and reloads directly into a downloaded version when one is available. */
  initialize(): Promise<void> {
    this.#initialization ??= this.#initialize();
    return this.#initialization;
  }

  async #initialize(): Promise<void> {
    if (!this.#canCheckForUpdate()) {
      return;
    }
    const checkForUpdate = async (): Promise<boolean | undefined> => withTimeout(this.#updates.checkForUpdate(), UPDATE_CHECK_TIMEOUT_MS);
    await checkForUpdate()
      .then((available) => {
        if (available) this.#document.location?.reload();
      })
      .catch((error: unknown) => console.error('Angular service-worker update check failed', error));
  }

  /** Starts an update check that never blocks bootstrap or reloads after the application becomes interactive. */
  startBackground(): void {
    this.#startNonBlocking();
  }

  /** Starts a non-blocking update check and asks after the first render before applying a ready update. */
  startConfirm(promptForUpdate: KitAppUpdatePrompt): void {
    this.#startNonBlocking(promptForUpdate);
  }

  #startNonBlocking(promptForUpdate?: KitAppUpdatePrompt): void {
    if (this.#backgroundStarted || !this.#canCheckForUpdate()) {
      return;
    }
    this.#backgroundStarted = true;
    this.#promptForUpdate = promptForUpdate;
    this.#updates.versionUpdates
      .pipe(
        filter((event: VersionEvent) => event.type === 'VERSION_READY'),
        take(1),
      )
      .subscribe(() => this.#handleUpdateReady());
    this.#updates.unrecoverable.pipe(take(1)).subscribe((event: UnrecoverableStateEvent) => {
      console.error('Angular service-worker state is unrecoverable', event.reason);
      this.#recoverBeforeInteraction(event.reason);
    });
    void this.#updates
      .checkForUpdate()
      .then((available) => {
        if (available) {
          this.#handleUpdateReady();
        }
      })
      .catch((error: unknown) => console.error('Angular service-worker update check failed', error));
  }

  /** Marks the first rendered application as interactive. Used by the provider's render hook. */
  markInteractive(): void {
    this.#interactive = true;
    if (!this.#reloading) {
      this.#clearRecoveryBypass();
    }
    this.#promptWhenReady();
  }

  #canCheckForUpdate(): boolean {
    return this.#updates.isEnabled && Boolean(this.#document.defaultView?.navigator.serviceWorker?.controller);
  }

  #reloadBeforeInteraction(): void {
    if (this.#interactive || this.#reloading) {
      return;
    }
    this.#reloading = true;
    this.#document.location?.reload();
  }

  #handleUpdateReady(): void {
    if (!this.#promptForUpdate) {
      this.#reloadBeforeInteraction();
      return;
    }
    this.#updateReady = true;
    this.#promptWhenReady();
  }

  #promptWhenReady(): void {
    const promptForUpdate = this.#promptForUpdate;
    if (
      !this.#interactive ||
      !this.#updateReady ||
      !promptForUpdate ||
      this.#prompting ||
      this.#prompted ||
      this.#promptRetryScheduled ||
      this.#reloading
    ) {
      return;
    }
    this.#prompting = true;
    void runUpdatePrompt(promptForUpdate)
      .then((confirmed) => {
        this.#prompting = false;
        if (confirmed === undefined) {
          this.#schedulePromptRetry();
          return;
        }
        this.#prompted = true;
        this.#applyPromptResult(confirmed);
      })
      .catch((error: unknown) => {
        this.#prompting = false;
        this.#prompted = true;
        console.error('Angular service-worker update prompt failed', error);
      });
  }

  #schedulePromptRetry(): void {
    if (this.#promptRetryScheduled || this.#prompted || this.#reloading) {
      return;
    }
    this.#promptRetryScheduled = true;
    globalThis.setTimeout(() => {
      this.#promptRetryScheduled = false;
      this.#promptWhenReady();
    }, UPDATE_PROMPT_RETRY_MS);
  }

  #applyPromptResult(confirmed: boolean): void {
    if (!confirmed || this.#reloading) {
      return;
    }
    this.#reloading = true;
    this.#document.location?.reload();
  }

  #recoverBeforeInteraction(reason: string): void {
    const location = this.#document.location;
    if (this.#interactive || this.#reloading || !location) {
      return;
    }
    const url = new URL(location.href);
    if (url.searchParams.has('sw_reload')) {
      return;
    }
    const storage = this.#document.defaultView?.sessionStorage;
    const remembered = rememberFailure(storage, reason);
    if (remembered === 'same') {
      return;
    }
    url.searchParams.set('ngsw-bypass', 'true');
    url.searchParams.set('sw_reload', '1');
    this.#reloading = true;
    location.replace(url.toString());
  }

  #clearRecoveryBypass(): void {
    const location = this.#document.location;
    const history = this.#document.defaultView?.history;
    if (!location || !history) {
      return;
    }
    const url = new URL(location.href);
    if (!url.searchParams.has('sw_reload')) {
      return;
    }
    url.searchParams.delete('ngsw-bypass');
    const storage = this.#document.defaultView?.sessionStorage;
    if (readFailure(storage)) {
      url.searchParams.delete('sw_reload');
      clearFailure(storage);
    }
    history.replaceState(history.state, '', url.toString());
  }
}

function rememberFailure(storage: Storage | undefined, reason: string): 'stored' | 'same' | 'unavailable' {
  if (!storage) {
    return 'unavailable';
  }
  let existing: string | null;
  try {
    existing = storage.getItem(UNRECOVERABLE_RELOAD_KEY);
  } catch {
    return 'unavailable';
  }
  if (existing === reason) {
    return 'same';
  }
  try {
    storage.setItem(UNRECOVERABLE_RELOAD_KEY, reason);
    return 'stored';
  } catch {
    return 'unavailable';
  }
}

function readFailure(storage: Storage | undefined): string | null {
  if (!storage) {
    return null;
  }
  try {
    return storage.getItem(UNRECOVERABLE_RELOAD_KEY);
  } catch {
    return null;
  }
}

function clearFailure(storage: Storage | undefined): void {
  try {
    storage?.removeItem(UNRECOVERABLE_RELOAD_KEY);
  } catch {
    // A retained value only suppresses the same recovery reason in this tab.
  }
}

/**
 * Provides blocking, background, or user-confirmed adoption of complete Angular service-worker updates.
 *
 * @remarks
 * The default `blocking` strategy checks before bootstrap and times out rather than preventing offline startup. The
 * existing `background` strategy never delays bootstrap and reloads only before the first render. The opt-in `confirm`
 * strategy also checks in the background, but waits until after the first render and reloads only with user approval.
 * API deployments must remain backward compatible while an updater is rolling out because already-running older code
 * cannot gain this behavior retroactively.
 */
export function provideKitAppUpdate(options: KitAppUpdateProviderOptions = {}): EnvironmentProviders {
  if (options.strategy === 'confirm') {
    const promptForUpdate = options.promptForUpdate;
    if (typeof promptForUpdate !== 'function') {
      throw new Error('provideKitAppUpdate confirm strategy requires promptForUpdate');
    }
    return makeEnvironmentProviders([
      provideAppInitializer(() => {
        const updates = inject(KitAppUpdateService);
        const injector = inject(EnvironmentInjector);
        updates.startConfirm(() => runInInjectionContext(injector, promptForUpdate));
        afterNextRender(() => updates.markInteractive());
      }),
    ]);
  }
  if (options.promptForUpdate !== undefined) {
    throw new Error('provideKitAppUpdate promptForUpdate is only valid with the confirm strategy');
  }
  if (options.strategy === 'background') {
    return makeEnvironmentProviders([
      provideAppInitializer(() => {
        const updates = inject(KitAppUpdateService);
        updates.startBackground();
        afterNextRender(() => updates.markInteractive());
      }),
    ]);
  }
  return makeEnvironmentProviders([provideAppInitializer(() => inject(KitAppUpdateService).initialize())]);
}

async function runUpdatePrompt(promptForUpdate: KitAppUpdatePrompt): Promise<boolean | undefined> {
  return promptForUpdate();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => resolve(undefined), timeoutMs);
    void promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
