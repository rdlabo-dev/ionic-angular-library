import { describe, expect, it } from 'vitest';
import { isTransientSqliteLockError, normalizeOfflineReplicaTransientWriteError } from './offline-repository-concurrency';

describe('offline repository concurrency', () => {
  it('finds a transient SQLite lock through causes and aggregate errors', () => {
    const locked = new Error('Execute: execute failed rc: 5 message: database is locked');
    const wrapped = new Error('native operation failed', { cause: new AggregateError([new Error('SQLITE_BUSY'), locked]) });

    expect(isTransientSqliteLockError(wrapped)).toBe(true);
    expect(normalizeOfflineReplicaTransientWriteError(wrapped)).toMatchObject({
      name: 'OfflineReplicaTransientWriteError',
      reason: 'sqlite_busy',
      cause: wrapped,
    });
  });

  it('does not classify a mixed aggregate failure as a transient SQLite lock', () => {
    const mixed = new AggregateError([new Error('disk full'), new Error('SQLITE_BUSY')]);

    expect(isTransientSqliteLockError(mixed)).toBe(false);
    expect(normalizeOfflineReplicaTransientWriteError(mixed)).toBe(mixed);
  });

  it('classifies an aggregate failure whose branches share one lock cause as transient', () => {
    const nativeLock = new Error('Execute: execute failed rc: 5 message: database is locked');
    const aggregate = new AggregateError([
      new Error('delete failed', { cause: nativeLock }),
      new Error('close failed', { cause: nativeLock }),
    ]);

    expect(isTransientSqliteLockError(aggregate)).toBe(true);
    expect(normalizeOfflineReplicaTransientWriteError(aggregate)).toMatchObject({
      name: 'OfflineReplicaTransientWriteError',
      reason: 'sqlite_locked',
      cause: aggregate,
    });
  });

  it('classifies an aggregate failure repeating one lock error as transient', () => {
    const locked = new Error('SQLITE_BUSY');

    expect(isTransientSqliteLockError(new AggregateError([locked, locked]))).toBe(true);
  });

  it('terminates safely when error causes contain a cycle', () => {
    const cyclic = new Error('outer failure');
    Object.defineProperty(cyclic, 'cause', { value: cyclic });

    expect(isTransientSqliteLockError(cyclic)).toBe(false);
    expect(normalizeOfflineReplicaTransientWriteError(cyclic)).toBe(cyclic);
  });
});
