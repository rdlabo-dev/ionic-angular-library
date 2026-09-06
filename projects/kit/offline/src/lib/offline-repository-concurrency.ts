/**
 * Internal repository capability used to detect commits made through another
 * native SQLite connection during a local read/derive/write operation.
 *
 * This symbol is intentionally not re-exported from the package entry point.
 */
export const OFFLINE_REPOSITORY_ATOMIC_MUTATION: unique symbol = Symbol('OFFLINE_REPOSITORY_ATOMIC_MUTATION');

export type OfflineReplicaTransientWriteReason = 'concurrent_revision' | 'sqlite_busy' | 'sqlite_locked';

/** Internal typed boundary for a local write that is safe to recompute once from a fresh snapshot. */
export class OfflineReplicaTransientWriteError extends Error {
  constructor(
    readonly reason: OfflineReplicaTransientWriteReason,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'OfflineReplicaTransientWriteError';
  }
}

function transientSqliteLockReason(error: unknown): Extract<OfflineReplicaTransientWriteReason, 'sqlite_busy' | 'sqlite_locked'> | null {
  const code =
    typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code.toUpperCase()
      : '';
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const normalizedMessage = message.toUpperCase();
  if (code.includes('SQLITE_BUSY') || normalizedMessage.includes('SQLITE_BUSY')) {
    return 'sqlite_busy';
  }
  if (
    code.includes('SQLITE_LOCKED') ||
    normalizedMessage.includes('SQLITE_LOCKED') ||
    message.includes('database is locked') ||
    message.includes('database table is locked')
  ) {
    return 'sqlite_locked';
  }
  return null;
}

/** Returns whether SQLite reported a transient busy/locked condition in any supported error shape. */
export function isTransientSqliteLockError(error: unknown): boolean {
  return error instanceof OfflineReplicaTransientWriteError
    ? error.reason === 'sqlite_busy' || error.reason === 'sqlite_locked'
    : transientSqliteLockReason(error) !== null;
}

export function normalizeOfflineReplicaTransientWriteError(error: unknown): unknown {
  if (error instanceof OfflineReplicaTransientWriteError) return error;
  const reason = transientSqliteLockReason(error);
  if (reason) {
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
    return new OfflineReplicaTransientWriteError(
      reason,
      message || (reason === 'sqlite_busy' ? 'SQLite is busy.' : 'SQLite database is locked.'),
      { cause: error },
    );
  }
  return error;
}
