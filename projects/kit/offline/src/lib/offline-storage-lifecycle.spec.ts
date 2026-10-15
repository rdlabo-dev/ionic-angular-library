import { Injector } from '@angular/core';
import { KitStorageService } from '@rdlabo/ionic-angular-kit';
import { IonicOfflineRepository } from './offline-repository';
import { OFFLINE_KIT_OPTIONS } from './offline-kit-options';
import { defineOfflineReplicaSchema } from './offline-replica-schema';
import { describe, expect, it, vi } from 'vitest';
import {
  OfflineStorageLifecycle,
  OfflineStorageGenerationChangedError,
  type OfflineStorageLifecycleOptions,
} from './offline-storage-lifecycle';

function fixture() {
  const markers = new Map<string, string>();
  const rows = new Map<string, unknown>([
    ['offline:outbox:commands', { pending: true }],
    ['token', 'keep'],
  ]);
  const markerStore = {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: markers.get(key) ?? null })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      markers.set(key, value);
    }),
    remove: vi.fn(async ({ key }: { key: string }) => {
      markers.delete(key);
    }),
  };
  const storage = {
    get: async <T>(key: string): Promise<T | null> => structuredClone((rows.get(key) as T) ?? null),
    set: async <T>(key: string, value: T): Promise<T> => {
      rows.set(key, structuredClone(value));
      return value;
    },
    keys: vi.fn(async () => [...rows.keys()]),
    remove: vi.fn(async (key: string) => {
      rows.delete(key);
    }),
  };
  // Deterministic exclusive queue, shared by simulated tabs. Real Web Locks are exercised in browser verification.
  let tail: Promise<void> | undefined;
  const locks = {
    request: <T>(_name: string, _options: unknown, callback: () => Promise<T>) => {
      const result = tail ? tail.then(callback) : callback();
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  } as Pick<LockManager, 'request'>;
  const options: OfflineStorageLifecycleOptions = {
    markerStore,
    generationKey: 'generation',
    markerKey: 'reset',
    generation: 'current',
    discardPendingCommands: true,
    target: { kind: 'web', storage, locks },
  };
  return { markers, rows, markerStore, storage, options, lifecycle: () => new OfflineStorageLifecycle(options) };
}

describe('disposable storage lifecycle', () => {
  it('retries a failed cold reload even when the reset intent is already persisted', async () => {
    const f = fixture();
    const lifecycle = f.lifecycle();
    const ready = vi.fn(async () => undefined);
    const reload = vi.fn().mockImplementationOnce(() => {
      throw new Error('reload failed');
    });
    await expect(lifecycle.requestRebuildAfterBootstrap(ready, { reload })).rejects.toThrow('reload failed');
    expect(f.markers.get('reset')).toBe('requested');
    expect(await lifecycle.requestRebuildAfterBootstrap(ready, { reload })).toBe(true);
    expect(ready).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('cleans orphaned product files without a database and retries failure before completing adoption', async () => {
    const f = fixture();
    const cleanup = vi.fn(async () => undefined).mockRejectedValueOnce(new Error('files locked'));
    const ready = vi.fn(async () => undefined);
    const lifecycle = new OfflineStorageLifecycle({
      ...f.options,
      rebuild: 'after-reload',
      beforeCleanup: ready,
      target: {
        kind: 'sqlite',
        databaseNames: ['replica'],
        databaseEncryption: false,
        additionalCleanup: cleanup,
        sqliteConnection: {
          checkConnectionsConsistency: vi.fn(async () => ({})),
          isDatabase: vi.fn(async () => ({ result: false })),
          createConnection: vi.fn(),
          closeConnection: vi.fn(),
        },
      },
    });
    await expect(lifecycle.prepare()).rejects.toThrow('files locked');
    expect(f.markers.get('reset')).toBe('requested');
    expect(f.markers.has('generation')).toBe(false);
    expect(ready.mock.invocationCallOrder[0]).toBeLessThan(cleanup.mock.invocationCallOrder[0]!);
    expect(await lifecycle.prepare()).toBe('rebuilt');
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(f.markers.get('generation')).toBe('current');
    expect(f.markers.has('reset')).toBe(false);
  });

  it('adopts an existing matching marker without discarding pending commands or authentication', async () => {
    const f = fixture();
    f.markers.set('generation', 'current');
    expect(await f.lifecycle().prepare()).toBe('ready');
    expect(f.storage.remove).not.toHaveBeenCalled();
    expect(f.rows.has('offline:outbox:commands')).toBe(true);
  });

  it('discards the whole replica once on first adoption but preserves other storage', async () => {
    const f = fixture();
    expect(await f.lifecycle().prepare()).toBe('rebuilt');
    expect([...f.rows.entries()]).toEqual([['token', 'keep']]);
    expect(f.markers.get('generation')).toBe('current');
    expect(f.markers.has('reset')).toBe(false);
    expect(await f.lifecycle().prepare()).toBe('ready');
    expect(f.storage.remove).toHaveBeenCalledOnce();
  });

  it('keeps the reset intent and retries a partially failed deletion before opening storage', async () => {
    const f = fixture();
    f.markers.set('generation', 'old');
    f.storage.remove.mockRejectedValueOnce(new Error('locked'));
    const lifecycle = f.lifecycle();
    const open = vi.fn(async () => undefined);
    await expect(lifecycle.run('exclusive', open)).rejects.toThrow('locked');
    expect(open).not.toHaveBeenCalled();
    expect(f.markers.get('generation')).toBe('old');
    expect(f.markers.get('reset')).toBe('requested');
    await lifecycle.run('exclusive', open);
    expect(open).toHaveBeenCalledOnce();
  });

  it('retries cleanup if writing the generation or consuming the marker fails', async () => {
    const f = fixture();
    f.markerStore.remove.mockRejectedValueOnce(new Error('marker failure'));
    await expect(f.lifecycle().prepare()).rejects.toThrow('marker failure');
    expect(f.markers.get('reset')).toBe('requested');
    f.rows.set('offline:replica:rows', {});
    expect(await f.lifecycle().prepare()).toBe('rebuilt');
    expect(f.rows.has('offline:replica:rows')).toBe(false);
  });

  it('serializes competing tabs and rechecks the marker instead of deleting new cache twice', async () => {
    const f = fixture();
    const a = f.lifecycle();
    const b = f.lifecycle();
    expect(await Promise.all([a.prepare(), b.prepare()])).toEqual(['rebuilt', 'ready']);
    await a.run('exclusive', async () => {
      f.rows.set('offline:replica:rows', 'new');
    });
    await b.run('shared', async () => expect(f.rows.get('offline:replica:rows')).toBe('new'));
    expect(f.storage.remove).toHaveBeenCalledOnce();
  });

  it.each(['new-generation', 'manual-reset'])('rejects stale readers and writers after %s', async (reason) => {
    const f = fixture();
    const old = f.lifecycle();
    await old.prepare();
    if (reason === 'manual-reset') f.markers.set('reset', 'requested');
    const next = new OfflineStorageLifecycle({ ...f.options, generation: reason === 'manual-reset' ? 'current' : 'next' });
    await next.prepare();
    const write = vi.fn(async () => {
      f.rows.set('offline:replica:rows', 'stale');
    });
    await expect(old.run('exclusive', write)).rejects.toBeInstanceOf(OfflineStorageGenerationChangedError);
    await expect(old.run('shared', write)).rejects.toBeInstanceOf(OfflineStorageGenerationChangedError);
    expect(write).not.toHaveBeenCalled();
  });

  it('waits for an active operation to finish before rebuilding', async () => {
    const f = fixture();
    const old = f.lifecycle();
    await old.prepare();
    let release!: () => void;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const write = old.run('exclusive', async () => {
      started();
      await blocked;
      f.rows.set('offline:replica:rows', 'old');
    });
    await entered;
    const next = new OfflineStorageLifecycle({ ...f.options, generation: 'next' });
    const rebuild = next.prepare();
    expect(f.markers.get('generation')).toBe('current');
    release();
    await write;
    await rebuild;
    expect(f.rows.has('offline:replica:rows')).toBe(false);
  });

  it('computes the bundled generation once rather than hashing the schema on every read', async () => {
    const f = fixture();
    const generation = vi.fn(async () => 'current');
    const lifecycle = new OfflineStorageLifecycle({ ...f.options, generation });
    await lifecycle.run('shared', async () => undefined);
    await lifecycle.run('shared', async () => undefined);
    expect(generation).toHaveBeenCalledOnce();
  });

  it('keeps the old generation and reset intent if recording completion fails', async () => {
    const f = fixture();
    f.markers.set('generation', 'old');
    const originalSet = f.markerStore.set.getMockImplementation()!;
    f.markerStore.set.mockImplementation(async (entry) => {
      if (entry.key === 'generation') throw new Error('generation write failed');
      await originalSet(entry);
    });
    await expect(f.lifecycle().prepare()).rejects.toThrow('generation write failed');
    expect(f.markers.get('generation')).toBe('old');
    expect(f.markers.get('reset')).toBe('requested');
    f.markerStore.set.mockImplementation(originalSet);
    expect(await f.lifecycle().prepare()).toBe('rebuilt');
  });

  it('does not delete anything in response to an operation failure', async () => {
    const f = fixture();
    const lifecycle = f.lifecycle();
    await lifecycle.prepare();
    f.rows.set('offline:replica:rows', 'keep');
    await expect(
      lifecycle.run('shared', async () => {
        throw new Error('wire mismatch');
      }),
    ).rejects.toThrow('wire mismatch');
    expect(f.rows.get('offline:replica:rows')).toBe('keep');
    expect(f.markers.has('reset')).toBe(false);
  });

  it('guards real repository initialization, reads and queued writes across a rebuild', async () => {
    const f = fixture();
    const createRepository = (generation: string) =>
      Injector.create({
        providers: [
          IonicOfflineRepository,
          { provide: KitStorageService, useValue: f.storage },
          {
            provide: OFFLINE_KIT_OPTIONS,
            useValue: {
              databaseName: 'test',
              databaseEncryption: false,
              replicaSchema: defineOfflineReplicaSchema({ version: 1, entities: [], migrations: [] }),
              storageLifecycle: new OfflineStorageLifecycle({ ...f.options, generation }),
            },
          },
        ],
      }).get(IonicOfflineRepository);
    const old = createRepository('current');
    await old.setLastUserId('user-a');
    expect(await old.getLastUserId()).toBe('user-a');
    const next = createRepository('next');
    await next.setLastUserId('user-b');
    await expect(old.setLastUserId('stale')).rejects.toBeInstanceOf(OfflineStorageGenerationChangedError);
    await expect(old.getLastUserId()).rejects.toBeInstanceOf(OfflineStorageGenerationChangedError);
    expect(await next.getLastUserId()).toBe('user-b');
  });

  it('defers native deletion until readiness and a cold restart, retaining the existing generation format', async () => {
    const f = fixture();
    const deleted = vi.fn(async () => undefined);
    const ready = vi.fn(async () => undefined);
    const options: OfflineStorageLifecycleOptions = {
      ...f.options,
      generation: '4',
      rebuild: 'after-reload',
      beforeCleanup: ready,
      target: {
        kind: 'sqlite',
        databaseNames: ['replica', 'media'],
        databaseEncryption: false,
        sqliteConnection: {
          checkConnectionsConsistency: vi.fn(async () => ({})),
          isDatabase: vi.fn(async () => ({ result: true })),
          createConnection: vi.fn(async () => ({ delete: deleted })),
          closeConnection: vi.fn(async () => undefined),
        },
      },
    };
    const first = new OfflineStorageLifecycle(options);
    expect(await first.prepare()).toBe('reload-required');
    await expect(first.run('exclusive', vi.fn())).rejects.toThrow('cold reload');
    expect(deleted).not.toHaveBeenCalled();
    const reload = vi.fn();
    await first.requestRebuildAfterBootstrap(ready, { reload });
    expect(reload).toHaveBeenCalledOnce();
    expect(f.markers.get('reset')).toBe('requested');
    expect(await new OfflineStorageLifecycle(options).prepare()).toBe('rebuilt');
    expect(deleted).toHaveBeenCalledTimes(2);
    expect(f.markers.get('generation')).toBe('4');
    expect(ready.mock.invocationCallOrder[1]).toBeLessThan(deleted.mock.invocationCallOrder[0]!);
  });
});
