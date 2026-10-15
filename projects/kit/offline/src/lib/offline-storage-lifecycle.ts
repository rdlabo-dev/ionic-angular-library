import {
  inspectOfflineStorageGeneration,
  type OfflineStorageGenerationOptions,
} from '@rdlabo/ionic-angular-kit/offline/storage-generation';
import type { KitStorageService } from '@rdlabo/ionic-angular-kit';
import {
  clearOfflineLocalDatabases,
  type OfflineLocalDatabaseResetOptions,
  type OfflineLocalResetMarkerStore,
  type OfflineLocalResetReloadTarget,
} from './offline-local-reset';

/** Destructive storage preparation configured by the consuming product. */
export interface OfflineStorageLifecycleOptions extends OfflineStorageGenerationOptions {
  markerStore: OfflineLocalResetMarkerStore;
  /** Explicit acknowledgement that the replica and all pending Outbox commands may be discarded. */
  discardPendingCommands: true;
  target:
    | ({ kind: 'sqlite' } & OfflineLocalDatabaseResetOptions)
    | { kind: 'web'; storage: Pick<KitStorageService, 'keys' | 'remove'>; locks?: Pick<LockManager, 'request'> };
  /** Defer existing storage to a cold reload after the product renders its update UI. */
  rebuild?: 'immediate' | 'after-reload';
  /** Product hook, e.g. Live Update readiness, awaited before any destructive operation. */
  beforeCleanup?: () => Promise<unknown>;
}

/** Preparation result; callers must not open a repository while a reload is required. */
export type OfflineStoragePreparation = 'ready' | 'rebuilt' | 'reload-required';

/** A different runtime has rebuilt this storage. Reload before using the local replica again. */
export class OfflineStorageGenerationChangedError extends Error {
  constructor() {
    super('Offline storage changed in another runtime. Reload the application before using the local replica.');
    this.name = 'OfflineStorageGenerationChangedError';
  }
}

const nativeOperations = new WeakMap<OfflineLocalResetMarkerStore, Map<string, Promise<void>>>();

/**
 * Opt-in lifecycle for disposable local replicas. Never infer a reset from a network, auth,
 * wire-protocol or generic storage error. Use one instance for preparation and repository access.
 */
export class OfflineStorageLifecycle {
  #preparation: Promise<OfflineStoragePreparation> | null = null;
  #generation: string | null = null;
  #revision: string | null = null;

  constructor(private readonly options: OfflineStorageLifecycleOptions) {
    if (options.discardPendingCommands !== true)
      throw new Error('Storage rebuild requires explicit permission to discard pending commands.');
  }

  /** Prepares storage once, before the repository is opened; failed attempts remain retryable. */
  prepare(): Promise<OfflineStoragePreparation> {
    this.#preparation ??= this.#lock('exclusive', () => this.#prepare()).then(
      (result) => {
        if (result === 'reload-required') this.#preparation = null;
        return result;
      },
      (error: unknown) => {
        this.#preparation = null;
        throw error;
      },
    );
    return this.#preparation;
  }

  /**
   * Holds the same Web Lock used for reset throughout one repository operation.
   * A stale runtime fails before it can read or write the newly rebuilt storage.
   */
  async run<T>(mode: 'shared' | 'exclusive', operation: () => Promise<T>): Promise<T> {
    if ((await this.prepare()) === 'reload-required') throw new Error('Offline storage requires a cold reload before opening.');
    return this.#lock(mode, async () => {
      const state = await inspectOfflineStorageGeneration({ ...this.options, generation: this.#generation! });
      const revision = await this.options.markerStore.get({ key: this.#revisionKey });
      if (!state.matches || state.requested || state.generation !== this.#generation || revision.value !== this.#revision) {
        throw new OfflineStorageGenerationChangedError();
      }
      return operation();
    });
  }

  /** Waits for product readiness, rechecks the state, persists intent, then requests a cold reload. */
  async requestRebuildAfterBootstrap(
    waitUntilReady: () => Promise<unknown>,
    reloadTarget: OfflineLocalResetReloadTarget,
  ): Promise<boolean> {
    const state = await inspectOfflineStorageGeneration(this.options);
    if (state.matches && !state.requested) return false;
    await waitUntilReady();
    const requested = await this.#lock('exclusive', async () => {
      const current = await inspectOfflineStorageGeneration(this.options);
      if (current.matches && !current.requested) return false;
      if (!current.requested) await this.options.markerStore.set({ key: this.options.markerKey, value: 'requested' });
      return true;
    });
    if (requested) reloadTarget.reload();
    return requested;
  }

  get #revisionKey(): string {
    return `${this.options.generationKey}:revision`;
  }

  async #prepare(): Promise<OfflineStoragePreparation> {
    const options = this.options;
    const state = await inspectOfflineStorageGeneration(options);
    this.#generation = state.generation;
    if (state.matches && !state.requested) {
      this.#revision = (await options.markerStore.get({ key: this.#revisionKey })).value;
      return 'ready';
    }
    if (!state.requested && options.rebuild === 'after-reload') {
      if (await this.#hasStorage()) return 'reload-required';
      // Database absence does not imply product-owned media is absent as well.
      const cleanup = options.target.kind === 'sqlite' ? options.target.additionalCleanup : undefined;
      if (cleanup) {
        await options.beforeCleanup?.();
        await options.markerStore.set({ key: options.markerKey, value: 'requested' });
        await cleanup();
      }
      await options.markerStore.set({ key: options.generationKey, value: state.generation });
      if (cleanup) await options.markerStore.remove({ key: options.markerKey });
      this.#revision = (await options.markerStore.get({ key: this.#revisionKey })).value;
      return 'ready';
    }
    await options.beforeCleanup?.();
    if (!state.requested) await options.markerStore.set({ key: options.markerKey, value: 'requested' });
    if (options.target.kind === 'sqlite') {
      await clearOfflineLocalDatabases(options.target);
    } else {
      const keys = (await options.target.storage.keys()).filter((key) => key.startsWith('offline:'));
      for (const key of keys) await options.target.storage.remove(key);
    }
    // Keep the reset intent until *all* completion writes succeed. A crash retries cleanup.
    const revision = options.target.kind === 'web' ? crypto.randomUUID() : null;
    if (revision !== null) await options.markerStore.set({ key: this.#revisionKey, value: revision });
    await options.markerStore.set({ key: options.generationKey, value: state.generation });
    await options.markerStore.remove({ key: options.markerKey });
    this.#revision = revision;
    return 'rebuilt';
  }

  async #hasStorage(): Promise<boolean> {
    const target = this.options.target;
    if (target.kind === 'web') return (await target.storage.keys()).some((key) => key.startsWith('offline:'));
    await target.sqliteConnection.checkConnectionsConsistency();
    const databases = await Promise.all(target.databaseNames.map((name) => target.sqliteConnection.isDatabase(name)));
    return databases.some(({ result }) => result === true);
  }

  async #lock<T>(mode: 'shared' | 'exclusive', operation: () => Promise<T>): Promise<T> {
    if (this.options.target.kind === 'sqlite') {
      let operations = nativeOperations.get(this.options.markerStore);
      if (!operations) {
        operations = new Map();
        nativeOperations.set(this.options.markerStore, operations);
      }
      const key = this.options.generationKey;
      const previous = operations.get(key);
      const result = previous ? previous.then(operation) : operation();
      const settled = result.then(
        () => undefined,
        () => undefined,
      );
      operations.set(key, settled);
      void settled.then(() => {
        if (operations.get(key) === settled) operations.delete(key);
      });
      return result;
    }
    const locks = this.options.target.locks ?? globalThis.navigator?.locks;
    if (!locks) return Promise.reject(new Error('Web Locks are required to safely rebuild shared offline storage.'));
    // One origin-wide lock matches the existing shared `offline:` namespace, even across products.
    return await locks.request('kit:offline:storage', { mode }, operation);
  }
}
