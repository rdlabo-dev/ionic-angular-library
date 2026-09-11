import { describe, expect, it } from 'vitest';
import { isTransientSqliteLockError, normalizeOfflineReplicaTransientWriteError } from './offline-repository-concurrency';

describe('offline repository concurrency', () => {
  it('finds a transient SQLite lock through causes and aggregate errors', () => {
    const locked = new Error('Execute: execute failed rc: 5 message: database is locked');
    const wrapped = new Error('native operation failed', { cause: new AggregateError([new Error('other failure'), locked]) });

    expect(isTransientSqliteLockError(wrapped)).toBe(true);
    expect(normalizeOfflineReplicaTransientWriteError(wrapped)).toMatchObject({
      name: 'OfflineReplicaTransientWriteError',
      reason: 'sqlite_locked',
      cause: wrapped,
    });
  });

  it('terminates safely when error causes contain a cycle', () => {
    const cyclic = new Error('outer failure');
    Object.defineProperty(cyclic, 'cause', { value: cyclic });

    expect(isTransientSqliteLockError(cyclic)).toBe(false);
    expect(normalizeOfflineReplicaTransientWriteError(cyclic)).toBe(cyclic);
  });
});
