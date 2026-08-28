import { DOCUMENT } from '@angular/common';
import type { EnvironmentProviders } from '@angular/core';
import { Injectable, afterNextRender, inject, makeEnvironmentProviders, provideAppInitializer } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import type { UnrecoverableStateEvent, VersionEvent } from '@angular/service-worker';
import { filter, take } from 'rxjs';

const UPDATE_CHECK_TIMEOUT_MS = 10_000;
const UNRECOVERABLE_RELOAD_KEY = 'kit_sw_unrecoverable_reload';

/** Configuration for Angular service-worker application updates. */
export interface KitAppUpdateOptions {
  /** `blocking` preserves startup safety; `background` never delays bootstrap and reloads only before interaction. */
  strategy?: 'blocking' | 'background';
}

/** Checks for a complete Angular service-worker update before users can interact with the application. */
@Injectable({ providedIn: 'root' })
export class KitAppUpdateService {
  readonly #document = inject(DOCUMENT);
  readonly #updates = inject(SwUpdate);
  #initialization: Promise<void> | null = null;
  #backgroundStarted = false;
  #interactive = false;
  #reloading = false;

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
    if (this.#backgroundStarted || !this.#canCheckForUpdate()) {
      return;
    }
    this.#backgroundStarted = true;
    this.#updates.versionUpdates
      .pipe(
        filter((event: VersionEvent) => event.type === 'VERSION_READY'),
        take(1),
      )
      .subscribe(() => this.#reloadBeforeInteraction());
    this.#updates.unrecoverable.pipe(take(1)).subscribe((event: UnrecoverableStateEvent) => {
      console.error('Angular service-worker state is unrecoverable', event.reason);
      this.#recoverBeforeInteraction(event.reason);
    });
    void this.#updates
      .checkForUpdate()
      .then((available) => {
        if (available) {
          this.#reloadBeforeInteraction();
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
 * Provides a startup check that reloads into the latest complete web application version.
 *
 * @remarks
 * The check finishes before application bootstrap so a delayed update cannot discard user input. It times out rather
 * than preventing offline startup. API deployments must remain backward compatible while a newly adopted updater is
 * rolling out because code already running in older application versions cannot gain this behavior retroactively.
 */
export function provideKitAppUpdate(options: KitAppUpdateOptions = {}): EnvironmentProviders {
  const initializer =
    options.strategy === 'background'
      ? provideAppInitializer(() => {
          const updates = inject(KitAppUpdateService);
          updates.startBackground();
          afterNextRender(() => updates.markInteractive());
        })
      : provideAppInitializer(() => inject(KitAppUpdateService).initialize());
  return makeEnvironmentProviders([initializer]);
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
