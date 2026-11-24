import type { OfflineCommand } from './offline-repository';

/** Recorded only when a read-only receipt lookup for this command returns a conflict. */
export const RECEIPT_CONFLICT = 'receipt_conflict';

/** Normalizes Kit's historical terminal timeouts and delegates legacy product payloads to the app. */
export function recoverOfflineCommand(command: OfflineCommand, recover?: (command: OfflineCommand) => OfflineCommand): OfflineCommand {
  if (command.state === 'rejected' && command.lastErrorCode === '408') {
    command = { ...command, state: 'retry_wait', retryAt: null, serverCommitUnknown: true };
  }
  return recover?.(command) ?? command;
}
