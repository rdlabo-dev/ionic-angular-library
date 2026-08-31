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
    const command: OfflineCommand = {
      ...scope,
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
    };

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
});
