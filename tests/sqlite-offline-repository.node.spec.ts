import '@angular/compiler';
import { createEnvironmentInjector, Injector, type EnvironmentInjector } from '@angular/core';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { OFFLINE_KIT_OPTIONS } from '../projects/kit/offline/src/lib/offline-kit-options';
import { defineOfflineReplicaSchema, defineReplicaEntity, generatedId, text } from '../projects/kit/offline/src/lib/offline-replica-schema';
import type { OfflineCommand, OfflineReplicaRow } from '../projects/kit/offline/src/lib/offline-repository';
import {
  COMMUNITY_SQLITE,
  type CommunitySqliteDriver,
  SqliteOfflineRepository,
} from '../projects/kit/offline/src/lib/sqlite-offline-repository';

const itemEntity = defineReplicaEntity<{ id: number; title: string }>()({
  table: 'contract_items',
  sourceKey: 'contract_items',
  scope: 'partition',
  fields: { id: generatedId('integer'), title: text() },
});

const replicaSchema = defineOfflineReplicaSchema({ version: 1, entities: [itemEntity], migrations: [] });

/** Test-only adapter that runs production repository SQL against Node's SQLite engine. */
class NodeSqliteDriver implements CommunitySqliteDriver {
  readonly #databases = new Map<string, DatabaseSync>();

  async open(options: { databaseName: string }): Promise<{ databaseId: string }> {
    if (!this.#databases.has(options.databaseName)) {
      this.#databases.set(options.databaseName, new DatabaseSync(':memory:'));
    }
    return { databaseId: options.databaseName };
  }

  async executeBatch(options: { databaseId: string; statements: readonly string[] }): Promise<void> {
    this.#database(options.databaseId).exec(options.statements.join(';\n'));
  }

  async execute(options: { databaseId: string; statement: string; values?: (string | number | null)[] }): Promise<void> {
    this.#database(options.databaseId)
      .prepare(options.statement)
      .run(...this.#values(options.values));
  }

  async query(options: { databaseId: string; statement: string; values?: (string | number | null)[] }): Promise<{ rows: unknown[] }> {
    const rows = this.#database(options.databaseId)
      .prepare(options.statement)
      .all(...this.#values(options.values));
    return { rows };
  }

  async beginTransaction(options: { databaseId: string }): Promise<void> {
    this.#database(options.databaseId).exec('BEGIN IMMEDIATE');
  }

  async commitTransaction(options: { databaseId: string }): Promise<void> {
    this.#database(options.databaseId).exec('COMMIT');
  }

  async rollbackTransaction(options: { databaseId: string }): Promise<void> {
    this.#database(options.databaseId).exec('ROLLBACK');
  }

  close(): void {
    for (const database of this.#databases.values()) database.close();
    this.#databases.clear();
  }

  #database(databaseId: string): DatabaseSync {
    const database = this.#databases.get(databaseId);
    if (!database) throw new Error(`SQLite database "${databaseId}" is not open.`);
    return database;
  }

  #values(values: (string | number | null)[] | undefined): SQLInputValue[] {
    return values ?? [];
  }
}

describe('SqliteOfflineRepository real SQLite contract', () => {
  let driver: NodeSqliteDriver | null = null;
  let injector: EnvironmentInjector | null = null;

  afterEach(() => {
    injector?.destroy();
    injector = null;
    driver?.close();
    driver = null;
  });

  function createRepository(): SqliteOfflineRepository {
    driver = new NodeSqliteDriver();
    injector = createEnvironmentInjector(
      [
        SqliteOfflineRepository,
        { provide: COMMUNITY_SQLITE, useValue: driver },
        {
          provide: OFFLINE_KIT_OPTIONS,
          useValue: { databaseName: 'real-sqlite-contract', databaseEncryption: false, replicaSchema },
        },
      ],
      Injector.NULL as EnvironmentInjector,
    );
    return injector.get(SqliteOfflineRepository);
  }

  function outboxCommand(overrides: Partial<OfflineCommand> = {}): OfflineCommand {
    return {
      userId: 7,
      scopeId: 'demo',
      commandId: 'command-1',
      aggregateType: 'contract_items',
      sourceKey: 'contract_items',
      identity: { kind: 'generated', localId: 'local-1' },
      operation: 'contract_items.update',
      payload: { title: 'Changed' },
      baseRevision: 1,
      state: 'pending',
      attempts: 0,
      retryAt: null,
      createdAt: 1,
      lastErrorCode: null,
      ...overrides,
    };
  }

  it('creates real tables and atomically round-trips a row, cursor, and Outbox command', async () => {
    const repository = createRepository();
    await repository.initialize();
    const scope = { userId: 7 as const, scopeId: 'demo' };
    const row: OfflineReplicaRow = {
      ...scope,
      sourceKey: 'contract_items',
      identity: { kind: 'generated', localId: 'local-1', remoteId: 101 },
      values: { id: 101, title: 'Demo' },
      confirmedValues: { id: 101, title: 'Demo' },
      serverRevision: 1,
      fetchedAt: 1,
      syncState: 'confirmed',
    };
    const command = outboxCommand();

    await repository.transactReplica({
      putRows: [row],
      putCursors: [{ ...scope, cursor: 'cursor-1' }],
      putCommands: [command],
    });

    await expect(repository.getReplicaRow(scope, 'contract_items', command.identity)).resolves.toMatchObject({
      ...row,
      values: { title: 'Demo' },
      confirmedValues: { title: 'Demo' },
    });
    await expect(repository.getReplicaCursor(scope)).resolves.toEqual({ ...scope, cursor: 'cursor-1' });
    await expect(repository.getCommands(scope)).resolves.toMatchObject([command]);
  });

  it('rolls back earlier writes when a real SQLite constraint rejects the transaction', async () => {
    const repository = createRepository();
    await repository.initialize();
    const scope = { userId: 7 as const, scopeId: 'demo' };

    await expect(
      repository.transactReplica({
        putCursors: [
          { ...scope, cursor: 'first' },
          { ...scope, cursor: null as unknown as string },
        ],
      }),
    ).rejects.toThrow();

    await expect(repository.getReplicaCursor(scope)).resolves.toBeNull();
  });

  it('round-trips every durable Outbox field and keeps ordering and user/scope isolation', async () => {
    const repository = createRepository();
    await repository.initialize();
    const scope = { userId: 7 as const, scopeId: 'demo' };
    const footprint = [{ ...scope, sourceKey: 'contract_items', identity: { kind: 'generated' as const, localId: 'local-1' } }];
    const richCommand = outboxCommand({
      commandId: 'command-z',
      operation: 'contract_items.delete',
      payload: { title: 'Changed', nested: { enabled: true }, values: [1, null, 'x'] },
      legacyOptimisticValue: { title: 'Legacy' },
      legacyOptimisticCompanions: [{ id: 1 }],
      legacyPayloadHash: 'legacy-hash',
      localOnlyFootprint: footprint,
      replicaMutation: 'delete',
      baseRevision: 'revision-1',
      state: 'retry_wait',
      attempts: 3,
      retryAt: 500,
      createdAt: 20,
      lastErrorCode: 'network',
      serverCommitUnknown: true,
      reconciliationIdentity: { remoteId: 101 },
    });
    const earlier: OfflineCommand = {
      ...richCommand,
      commandId: 'command-a',
      createdAt: 10,
      payload: { title: 'Earlier' },
    };
    const otherScope = { ...richCommand, commandId: 'command-m', scopeId: 'other', createdAt: 20 };
    const otherUser = { ...richCommand, commandId: 'command-user-8', userId: 8, createdAt: 1 };

    await repository.putCommand(richCommand);
    await repository.putCommand(earlier);
    await repository.putCommand(otherScope);
    await repository.putCommand(otherUser);

    await expect(repository.getCommands(scope)).resolves.toEqual([earlier, richCommand]);
    await expect(repository.getCommandsForUser(7)).resolves.toEqual([earlier, otherScope, richCommand]);
    await expect(repository.getCommandsForUser(8)).resolves.toEqual([otherUser]);
  });

  it('replaces an Outbox state without retaining optional values, then removes it', async () => {
    const repository = createRepository();
    await repository.initialize();
    const scope = { userId: 7 as const, scopeId: 'demo' };
    const command = outboxCommand({
      legacyOptimisticValue: { title: 'Legacy' },
      legacyOptimisticCompanions: [{ id: 1 }],
      legacyPayloadHash: 'legacy-hash',
      localOnlyFootprint: [{ ...scope, sourceKey: 'contract_items', identity: { kind: 'generated', localId: 'local-1' } }],
      replicaMutation: 'delete',
      baseRevision: 1,
      state: 'sending',
      attempts: 1,
      retryAt: 100,
      createdAt: 1,
      lastErrorCode: 'network',
      serverCommitUnknown: true,
      reconciliationIdentity: { remoteId: 101 },
    });
    await repository.putCommand(command);

    const replacement = outboxCommand({
      commandId: command.commandId,
      payload: { title: 'Retry' },
      baseRevision: null,
      state: 'pending',
      attempts: 0,
      retryAt: null,
      createdAt: command.createdAt,
      lastErrorCode: null,
    });
    await repository.replaceCommand(replacement);

    await expect(repository.getCommands(scope)).resolves.toEqual([
      { ...replacement, replicaMutation: 'upsert', serverCommitUnknown: false },
    ]);
    await repository.removeCommand(command.commandId);
    await expect(repository.getCommands(scope)).resolves.toEqual([]);
  });

  it('atomically rolls back an Outbox enqueue when a later real SQLite write fails', async () => {
    const repository = createRepository();
    await repository.initialize();
    const scope = { userId: 7 as const, scopeId: 'demo' };
    const command = outboxCommand({
      commandId: 'command-rollback',
    });

    await expect(
      repository.transactReplica({
        putCommands: [command],
        putCursors: [{ ...scope, cursor: null as unknown as string }],
      }),
    ).rejects.toThrow();

    await expect(repository.getCommands(scope)).resolves.toEqual([]);
  });

  it('does not lose or reorder rapid concurrent Outbox enqueues', async () => {
    const repository = createRepository();
    await repository.initialize();
    const scope = { userId: 7 as const, scopeId: 'demo' };
    const commands = Array.from({ length: 32 }, (_, index) =>
      outboxCommand({
        commandId: `command-${String(31 - index).padStart(2, '0')}`,
        identity: { kind: 'generated', localId: `local-${index}` },
        operation: index % 2 === 0 ? 'contract_items.consume' : 'contract_items.add',
        payload: { quantity: index + 1 },
        baseRevision: index,
      }),
    );

    await Promise.all(commands.map((command) => repository.putCommand(command)));

    const stored = await repository.getCommands(scope);
    expect(stored).toHaveLength(commands.length);
    expect(stored.map(({ commandId }) => commandId)).toEqual(
      commands.map(({ commandId }) => commandId).sort((left, right) => left.localeCompare(right)),
    );
    expect(new Set(stored.map(({ identity }) => JSON.stringify(identity))).size).toBe(commands.length);
  });

  it('clears only the requested Outbox scope and user', async () => {
    const repository = createRepository();
    await repository.initialize();
    const base = outboxCommand({
      commandId: 'demo-command',
    });
    const otherScope = { ...base, scopeId: 'other', commandId: 'other-command' };
    const otherUser = { ...base, userId: 8, commandId: 'other-user-command' };
    await repository.putCommand(base);
    await repository.putCommand(otherScope);
    await repository.putCommand(otherUser);

    await repository.clearScope({ userId: 7, scopeId: 'demo' });
    await expect(repository.getCommandsForUser(7).then((commands) => commands.map(({ commandId }) => commandId))).resolves.toEqual([
      otherScope.commandId,
    ]);
    await expect(repository.getCommandsForUser(8).then((commands) => commands.map(({ commandId }) => commandId))).resolves.toEqual([
      otherUser.commandId,
    ]);

    await repository.clearUser(7);
    await expect(repository.getCommandsForUser(7)).resolves.toEqual([]);
    await expect(repository.getCommandsForUser(8).then((commands) => commands.map(({ commandId }) => commandId))).resolves.toEqual([
      otherUser.commandId,
    ]);
  });
});
