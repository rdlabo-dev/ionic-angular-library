import type { OfflineCommand } from './offline-repository';

/** Restore timeouts stored as permanent rejections by older versions of the outbox. */
export function recoverOfflineCommand(command: OfflineCommand): OfflineCommand {
  return command.state === 'rejected' && command.lastErrorCode === '408'
    ? { ...command, state: 'retry_wait', retryAt: null, serverCommitUnknown: true }
    : command;
}
