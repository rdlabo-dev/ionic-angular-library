import type { OfflineCommand } from './offline-repository';

/** Normalizes Kit's historical terminal timeouts and delegates legacy product payloads to the app. */
export function recoverOfflineCommand(command: OfflineCommand, recover?: (command: OfflineCommand) => OfflineCommand): OfflineCommand {
  if (command.state === 'rejected' && command.lastErrorCode === '408') {
    return { ...command, state: 'retry_wait', retryAt: null, serverCommitUnknown: true };
  }
  return recover?.(command) ?? command;
}
