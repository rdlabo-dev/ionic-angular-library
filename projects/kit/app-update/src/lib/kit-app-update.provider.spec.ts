import { DOCUMENT } from '@angular/common';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SwUpdate } from '@angular/service-worker';
import type { UnrecoverableStateEvent, VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KitAppUpdateService, provideKitAppUpdate } from './kit-app-update.provider';

describe('provideKitAppUpdate', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reloads directly into a complete update before startup continues', async () => {
    const { service, checkForUpdate, reload } = setup(true);

    await service.initialize();

    expect(checkForUpdate).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('does not reload when the installed version is current', async () => {
    const { service, checkForUpdate, reload } = setup(false);

    await service.initialize();

    expect(checkForUpdate).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
  });

  it('does nothing when Angular service workers are disabled', async () => {
    const { service, checkForUpdate, reload } = setup(false, false);

    await service.initialize();

    expect(checkForUpdate).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not delay startup when no service worker controls the page', async () => {
    const { service, checkForUpdate, reload } = setup(new Promise<boolean>(() => undefined), true, false);

    await expect(service.initialize()).resolves.toBeUndefined();

    expect(checkForUpdate).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('continues startup without reloading when the update check fails', async () => {
    const error = new Error('offline');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { service, checkForUpdate, reload } = setup(error);

    await expect(service.initialize()).resolves.toBeUndefined();

    expect(checkForUpdate).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith('Angular service-worker update check failed', error);
  });

  it('continues startup after ten seconds when the update server does not respond', async () => {
    vi.useFakeTimers();
    const { service, reload } = setup(new Promise<boolean>(() => undefined));
    const initialization = service.initialize();

    await vi.advanceTimersByTimeAsync(10_000);

    await expect(initialization).resolves.toBeUndefined();
    expect(reload).not.toHaveBeenCalled();
  });

  it('shares one update check across repeated initialization', async () => {
    const { service, checkForUpdate } = setup(false);

    await Promise.all([service.initialize(), service.initialize()]);

    expect(checkForUpdate).toHaveBeenCalledOnce();
  });

  it('background strategy does not block bootstrap while the update check is pending', () => {
    const { checkForUpdate, reload } = setupBackground(new Promise<boolean>(() => undefined));

    expect(checkForUpdate).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
  });

  it('background strategy reloads a complete update before the first render', async () => {
    const { reload } = setupBackground(true);

    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
  });

  it('background strategy does not discard input after the first render', async () => {
    let finishUpdate: ((available: boolean) => void) | undefined;
    const update = new Promise<boolean>((resolve) => (finishUpdate = resolve));
    const { service, reload } = setupBackground(update);
    service.markInteractive();

    finishUpdate?.(true);
    await update;

    expect(reload).not.toHaveBeenCalled();
  });

  it('does not clear a recovery guard in the page that started navigation', () => {
    const unrecoverable$ = new Subject<UnrecoverableStateEvent>();
    const storage = new Map<string, string>();
    const first = setupBackground(false, { unrecoverable$, stored: storage });
    unrecoverable$.next({ type: 'UNRECOVERABLE_STATE', reason: 'version-one' });
    expect(first.replace).toHaveBeenCalledWith('https://example.test/main?ngsw-bypass=true&sw_reload=1');
    first.service.markInteractive();
    expect(first.replaceState).not.toHaveBeenCalled();
    expect(storage.get('kit_sw_unrecoverable_reload')).toBe('version-one');

    const recoveryPage$ = new Subject<UnrecoverableStateEvent>();
    const recoveryPage = setupBackground(false, {
      unrecoverable$: recoveryPage$,
      stored: storage,
      href: first.location.href,
    });
    recoveryPage$.next({ type: 'UNRECOVERABLE_STATE', reason: 'version-two' });
    expect(recoveryPage.replace).not.toHaveBeenCalled();
  });

  it('clears a successful recovery guard so the same reason can recover in a future version', () => {
    const reason = 'cached application file is missing';
    const stored = new Map([['kit_sw_unrecoverable_reload', reason]]);
    const recovered = setupBackground(false, {
      stored,
      href: 'https://example.test/main?ngsw-bypass=true&sw_reload=1',
    });
    recovered.service.markInteractive();

    expect(stored.has('kit_sw_unrecoverable_reload')).toBe(false);
    expect(recovered.replaceState).toHaveBeenCalledWith(recovered.historyState, '', 'https://example.test/main');

    const future$ = new Subject<UnrecoverableStateEvent>();
    const future = setupBackground(false, { unrecoverable$: future$, stored });
    future$.next({ type: 'UNRECOVERABLE_STATE', reason });
    expect(future.replace).toHaveBeenCalledOnce();
  });

  it.each(['get', 'set'] as const)('retains the URL loop guard and history state when sessionStorage.%sItem fails', (failure) => {
    const unavailableStorage = {
      getItem: () => {
        if (failure === 'get') throw new Error('storage unavailable');
        return null;
      },
      setItem: () => {
        if (failure === 'set') throw new Error('storage unavailable');
      },
      removeItem: vi.fn(),
    };
    const unrecoverable$ = new Subject<UnrecoverableStateEvent>();
    const first = setupBackground(false, { unrecoverable$, storage: unavailableStorage });
    unrecoverable$.next({ type: 'UNRECOVERABLE_STATE', reason: 'broken version' });
    expect(first.replace).toHaveBeenCalledOnce();

    const next$ = new Subject<UnrecoverableStateEvent>();
    const guarded = setupBackground(false, {
      unrecoverable$: next$,
      storage: unavailableStorage,
      href: 'https://example.test/main?ngsw-bypass=true&sw_reload=1',
    });
    next$.next({ type: 'UNRECOVERABLE_STATE', reason: 'broken version' });
    expect(guarded.replace).not.toHaveBeenCalled();

    guarded.service.markInteractive();
    expect(guarded.replaceState).toHaveBeenCalledWith(guarded.historyState, '', 'https://example.test/main?sw_reload=1');
  });
});

function setup(result: boolean | Error | Promise<boolean>, isEnabled = true, isControlled = true) {
  const checkForUpdate = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  const reload = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideKitAppUpdate(),
      { provide: SwUpdate, useValue: { isEnabled, checkForUpdate } },
      {
        provide: DOCUMENT,
        useValue: {
          defaultView: { navigator: { serviceWorker: { controller: isControlled ? {} : null } } },
          location: { reload },
        },
      },
    ],
  });
  return { service: TestBed.inject(KitAppUpdateService), checkForUpdate, reload };
}

interface BackgroundSetupOptions {
  unrecoverable$?: Subject<UnrecoverableStateEvent>;
  stored?: Map<string, string>;
  storage?: { getItem(key: string): string | null; setItem(key: string, value: string): unknown; removeItem(key: string): unknown };
  href?: string;
}

function setupBackground(result: boolean | Promise<boolean>, options: BackgroundSetupOptions = {}) {
  TestBed.resetTestingModule();
  const unrecoverable$ = options.unrecoverable$ ?? new Subject<UnrecoverableStateEvent>();
  const stored = options.stored ?? new Map<string, string>();
  const checkForUpdate = vi.fn(async () => result);
  const reload = vi.fn();
  const location = {
    href: options.href ?? 'https://example.test/main',
    reload,
    replace: vi.fn((url: string) => (location.href = url)),
  };
  const replaceState = vi.fn();
  const historyState = { navigationId: 1 };
  const versionUpdates$ = new Subject<VersionEvent>();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideKitAppUpdate({ strategy: 'background' }),
      {
        provide: SwUpdate,
        useValue: { isEnabled: true, checkForUpdate, versionUpdates: versionUpdates$, unrecoverable: unrecoverable$ },
      },
      {
        provide: DOCUMENT,
        useValue: {
          defaultView: {
            navigator: { serviceWorker: { controller: {} } },
            history: { state: historyState, replaceState },
            sessionStorage: options.storage ?? {
              getItem: (key: string) => stored.get(key) ?? null,
              setItem: (key: string, value: string) => stored.set(key, value),
              removeItem: (key: string) => stored.delete(key),
            },
          },
          location,
        },
      },
    ],
  });
  const service = TestBed.inject(KitAppUpdateService);
  return {
    service,
    checkForUpdate,
    reload,
    replace: location.replace,
    replaceState,
    historyState,
    location,
    versionUpdates$,
  };
}
