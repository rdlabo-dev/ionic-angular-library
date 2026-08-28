import { ApplicationInitStatus, createEnvironmentInjector, EnvironmentInjector, ErrorHandler, Injectable } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OFFLINE_AGGREGATE_INTENT_PROJECTOR } from './offline-aggregate-intent-projector';
import type { OfflineCommandHooks } from './offline-command-hooks';
import { DEFAULT_OFFLINE_COMMAND_HOOKS, OFFLINE_COMMAND_HOOKS } from './offline-command-hooks';
import { OfflineCoordinatorService } from './offline-coordinator.service';
import { OFFLINE_KIT_OPTIONS } from './offline-kit-options';
import { OFFLINE_MUTATION_PERSISTENCE_ADAPTER } from './offline-mutation-persistence.service';
import { OfflineRouteInitializerService, provideOffline, provideRouteScopedOffline } from './offline-provider';
import type { OfflineReplicaProjector } from './offline-replica-puller';
import { OFFLINE_REPLICA_PROJECTOR } from './offline-replica-puller';
import { defineOfflineReplicaSchema } from './offline-replica-schema';
import { OFFLINE_REPOSITORY } from './offline-repository';
import type { OfflineRequestPolicy } from './offline-request-policy';
import { OFFLINE_MUTATION_REQUEST_POLICIES, OFFLINE_REQUEST_POLICIES } from './offline-request-policy';

describe('provideOffline', () => {
  afterEach(() => TestBed.resetTestingModule());

  const runInitializers = (status: ApplicationInitStatus): void => (status as unknown as { runInitializers(): void }).runInitializers();

  function setup(coordinator: Pick<OfflineCoordinatorService, 'initialize' | 'initializeLocal'>) {
    const handleError = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideOffline({
          mode: 'readCacheOnly',
          databaseName: 'provider-test',
          createEncryptionKey: async () => 'test-key',
          replicaSchema: defineOfflineReplicaSchema({ version: 1, entities: [], migrations: [] }),
          requestPolicies: [],
        }),
        { provide: OfflineCoordinatorService, useValue: coordinator },
        { provide: ErrorHandler, useValue: { handleError } },
      ],
    });
    return { applicationInit: TestBed.inject(ApplicationInitStatus), handleError };
  }

  it('starts runtime initialization immediately but gates bootstrap only on the local substrate', async () => {
    let releaseLocal: (() => void) | undefined;
    let releaseRuntime: (() => void) | undefined;
    const local = new Promise<void>((resolve) => {
      releaseLocal = resolve;
    });
    const runtime = new Promise<void>((resolve) => {
      releaseRuntime = resolve;
    });
    const coordinator = {
      initialize: vi.fn(() => runtime),
      initializeLocal: vi.fn(() => local),
    };
    const { applicationInit } = setup(coordinator);

    runInitializers(applicationInit);
    expect(coordinator.initialize).toHaveBeenCalledOnce();
    expect(coordinator.initializeLocal).toHaveBeenCalledOnce();
    expect(applicationInit.done).toBe(false);

    releaseLocal?.();
    await applicationInit.donePromise;
    expect(applicationInit.done).toBe(true);

    releaseRuntime?.();
    await runtime;
  });

  it('reports background runtime failure without failing local bootstrap', async () => {
    let rejectRuntime: ((error: Error) => void) | undefined;
    const runtime = new Promise<void>((_resolve, reject) => {
      rejectRuntime = reject;
    });
    const coordinator = {
      initialize: vi.fn(() => runtime),
      initializeLocal: vi.fn(async () => undefined),
    };
    const { applicationInit, handleError } = setup(coordinator);
    const failure = new Error('network initialization failed');

    runInitializers(applicationInit);
    rejectRuntime?.(failure);
    await applicationInit.donePromise;
    await runtime.catch(() => undefined);

    expect(handleError).toHaveBeenCalledExactlyOnceWith(failure);
  });

  it('leaves local initialization failures to the bootstrap error boundary', async () => {
    const failure = new Error('local storage unavailable');
    const local = Promise.reject(failure);
    const coordinator = {
      initialize: vi.fn(() => local),
      initializeLocal: vi.fn(() => local),
    };
    const { applicationInit, handleError } = setup(coordinator);

    runInitializers(applicationInit);
    await expect(applicationInit.donePromise).rejects.toBe(failure);

    expect(handleError).not.toHaveBeenCalled();
  });

  it('does not turn a reporting failure into an unhandled background rejection', async () => {
    const failure = new Error('network initialization failed');
    const reportingFailure = new Error('reporting failed');
    const coordinator = {
      initialize: vi.fn(async () => Promise.reject(failure)),
      initializeLocal: vi.fn(async () => undefined),
    };
    const { applicationInit, handleError } = setup(coordinator);
    handleError.mockImplementationOnce(() => {
      throw reportingFailure;
    });

    runInitializers(applicationInit);
    await applicationInit.donePromise;
    await vi.waitFor(() => expect(handleError).toHaveBeenCalledExactlyOnceWith(failure));

    expect(handleError).toHaveBeenCalledOnce();
  });

  it('creates a complete isolated runtime for a lazy route injector without running an app initializer', () => {
    TestBed.configureTestingModule({});
    const parent = TestBed.inject(EnvironmentInjector);
    const child = createEnvironmentInjector(
      [
        provideRouteScopedOffline({
          mode: 'readCacheOnly',
          databaseName: 'route-provider-test',
          createEncryptionKey: async () => 'test-key',
          replicaSchema: defineOfflineReplicaSchema({ version: 1, entities: [], migrations: [] }),
          requestPolicies: [],
        }),
        { provide: OFFLINE_REPOSITORY, useValue: {} },
      ],
      parent,
      'offline-route-test',
    );

    expect(child.get(OfflineCoordinatorService)).toBeInstanceOf(OfflineCoordinatorService);
    expect(child.get(OfflineRouteInitializerService)).toBeInstanceOf(OfflineRouteInitializerService);
    expect(child.get(ApplicationInitStatus, null)).toBe(parent.get(ApplicationInitStatus));
    child.destroy();
  });

  it('does not inherit parent offline configuration into a route-scoped runtime', () => {
    @Injectable()
    class ParentCommandHooks implements OfflineCommandHooks {
      entityType = vi.fn(() => 'parent-entity');
    }
    @Injectable()
    class ParentReplicaProjector implements OfflineReplicaProjector {
      project = vi.fn(async () => ({ putRows: [], removeRows: [] }));
    }
    @Injectable()
    class ParentRequestPolicy implements OfflineRequestPolicy {
      resolve = vi.fn(() => null);
    }

    TestBed.configureTestingModule({
      providers: [
        provideOffline({
          mode: 'readCacheOnly',
          databaseName: 'parent-provider-test',
          createEncryptionKey: async () => 'test-key',
          replicaSchema: defineOfflineReplicaSchema({ version: 1, entities: [], migrations: [] }),
          requestPolicies: [ParentRequestPolicy],
          commandHooks: ParentCommandHooks,
          replicaProjector: ParentReplicaProjector,
        }),
        {
          provide: OfflineCoordinatorService,
          useValue: { initialize: vi.fn(async () => undefined), initializeLocal: vi.fn(async () => undefined) },
        },
      ],
    });
    const parent = TestBed.inject(EnvironmentInjector);
    expect(parent.get(OFFLINE_COMMAND_HOOKS)).toBeInstanceOf(ParentCommandHooks);

    const child = createEnvironmentInjector(
      [
        provideRouteScopedOffline({
          mode: 'readCacheOnly',
          databaseName: 'route-provider-test',
          createEncryptionKey: async () => 'test-key',
          replicaSchema: defineOfflineReplicaSchema({ version: 1, entities: [], migrations: [] }),
          requestPolicies: [],
        }),
        { provide: OFFLINE_REPOSITORY, useValue: {} },
      ],
      parent,
      'offline-route-isolation-test',
    );

    expect(child.get(OFFLINE_COMMAND_HOOKS)).toBe(DEFAULT_OFFLINE_COMMAND_HOOKS);
    expect(child.get(OFFLINE_REPLICA_PROJECTOR, null)).toBeNull();
    expect(child.get(OFFLINE_AGGREGATE_INTENT_PROJECTOR, null)).toBeNull();
    expect(child.get(OFFLINE_MUTATION_PERSISTENCE_ADAPTER)).toBeNull();
    expect(child.get(OFFLINE_REQUEST_POLICIES)).toEqual([]);
    expect(child.get(OFFLINE_MUTATION_REQUEST_POLICIES)).toEqual([]);
    expect(child.get(OFFLINE_KIT_OPTIONS).databaseName).toBe('route-provider-test');
    child.destroy();
  });

  it('keeps route-scoped policy and hook overrides when a parent runtime exists', () => {
    @Injectable()
    class RouteCommandHooks implements OfflineCommandHooks {
      entityType = vi.fn(() => 'route-entity');
    }
    @Injectable()
    class RouteRequestPolicy implements OfflineRequestPolicy {
      resolve = vi.fn(() => null);
    }

    TestBed.configureTestingModule({});
    const parent = TestBed.inject(EnvironmentInjector);
    const child = createEnvironmentInjector(
      [
        provideRouteScopedOffline({
          mode: 'readCacheOnly',
          databaseName: 'route-override-test',
          createEncryptionKey: async () => 'test-key',
          replicaSchema: defineOfflineReplicaSchema({ version: 1, entities: [], migrations: [] }),
          requestPolicies: [RouteRequestPolicy],
          commandHooks: RouteCommandHooks,
        }),
        { provide: OFFLINE_REPOSITORY, useValue: {} },
      ],
      parent,
      'offline-route-override-test',
    );

    expect(child.get(OFFLINE_COMMAND_HOOKS)).toBeInstanceOf(RouteCommandHooks);
    expect(child.get(OFFLINE_REQUEST_POLICIES)).toHaveLength(1);
    child.destroy();
  });

  it('initializes one route runtime once when multiple guards or resolvers wait for it', async () => {
    const coordinator = {
      initialize: vi.fn(async () => undefined),
      initializeLocal: vi.fn(async () => undefined),
    };
    TestBed.configureTestingModule({
      providers: [
        OfflineRouteInitializerService,
        { provide: OfflineCoordinatorService, useValue: coordinator },
        { provide: ErrorHandler, useValue: { handleError: vi.fn() } },
        { provide: OFFLINE_KIT_OPTIONS, useValue: { mode: 'readCacheOnly' } },
      ],
    });

    const initializer = TestBed.inject(OfflineRouteInitializerService);
    await Promise.all([initializer.initialize(), initializer.initialize()]);

    expect(coordinator.initializeLocal).toHaveBeenCalledOnce();
    expect(coordinator.initialize).toHaveBeenCalledOnce();
  });

  it('can defer route transport initialization while still opening local storage once', async () => {
    const coordinator = {
      initialize: vi.fn(async () => undefined),
      initializeLocal: vi.fn(async () => undefined),
    };
    TestBed.configureTestingModule({
      providers: [
        OfflineRouteInitializerService,
        { provide: OfflineCoordinatorService, useValue: coordinator },
        { provide: ErrorHandler, useValue: { handleError: vi.fn() } },
        { provide: OFFLINE_KIT_OPTIONS, useValue: { mode: 'readCacheOnly' } },
      ],
    });

    const initializer = TestBed.inject(OfflineRouteInitializerService);
    await initializer.initialize({ remote: 'deferred' });

    expect(coordinator.initializeLocal).toHaveBeenCalledOnce();
    expect(coordinator.initialize).not.toHaveBeenCalled();
  });

  it('can start network discovery after deferred local initialization', async () => {
    const coordinator = {
      initialize: vi.fn(async () => undefined),
      initializeLocal: vi.fn(async () => undefined),
    };
    TestBed.configureTestingModule({
      providers: [
        OfflineRouteInitializerService,
        { provide: OfflineCoordinatorService, useValue: coordinator },
        { provide: ErrorHandler, useValue: { handleError: vi.fn() } },
        { provide: OFFLINE_KIT_OPTIONS, useValue: { mode: 'readCacheOnly' } },
      ],
    });

    const initializer = TestBed.inject(OfflineRouteInitializerService);
    await initializer.initialize({ remote: 'deferred' });
    await initializer.startRemoteRuntime();

    expect(coordinator.initializeLocal).toHaveBeenCalledTimes(2);
    expect(coordinator.initialize).toHaveBeenCalledOnce();
  });
});
