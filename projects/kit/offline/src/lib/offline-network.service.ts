import { HttpClient, HttpContext } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { catchError, firstValueFrom, map, of, timeout } from 'rxjs';
import { OFFLINE_BYPASS, OFFLINE_IGNORE_TRANSPORT_FAILURE } from './offline-request-policy';

export const DEFAULT_OFFLINE_CONNECTION_VERIFICATION_TIMEOUT_MS = 8_000;

export type OfflineNetworkState = 'online' | 'offline' | 'unverified';

/** transport不能(status=0)だけをlocal replica fallback対象にし、HTTPエラーは隠さない。 */
export function isOfflineFallbackError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { status?: unknown }).status === 0;
}

/** Combines operating-system connectivity with observed API reachability. */
@Injectable({ providedIn: 'root' })
export class OfflineNetworkService {
  readonly #osConnected = signal<boolean | null>(null);
  readonly #apiReachable = signal<boolean | null>(null);
  readonly #appActive = signal(true);
  readonly #lifecycleRevision = signal(0);
  #apiReachabilityRevision = 0;
  #networkRevision = 0;
  readonly #listeners: PluginListenerHandle[] = [];
  #initialized = false;
  readonly #checkingConnection = signal(false);
  #connectionVerification: Promise<boolean> | null = null;

  readonly #http = inject(HttpClient);

  readonly state = computed<OfflineNetworkState>(() => {
    if (this.#osConnected() === false || this.#apiReachable() === false) return 'offline';
    if (this.#osConnected() === true && this.#apiReachable() === true) return 'online';
    return 'unverified';
  });
  readonly connected = computed(() => this.state() !== 'offline');
  /** Whether Capacitor currently permits foreground transport work. */
  readonly appActive = this.#appActive.asReadonly();
  /** Changes on every foreground/background transition, even when connectivity is unchanged. */
  readonly lifecycleRevision = this.#lifecycleRevision.asReadonly();
  /** Whether an explicit remote API reachability check is running. */
  readonly checkingConnection = this.#checkingConnection.asReadonly();

  async initialize(): Promise<void> {
    if (this.#initialized) return;
    this.#initialized = true;
    const [networkListener, appListener] = await Promise.all([
      this.addNetworkStatusListener(({ connected }) => {
        this.#networkRevision += 1;
        this.#osConnected.set(connected);
        this.#apiReachable.set(connected ? null : false);
      }),
      this.addAppStateListener(({ isActive }) => {
        this.#lifecycleRevision.update((revision) => revision + 1);
        this.#appActive.set(isActive);
        if (isActive) void this.#refreshOsStatus();
      }),
    ]);
    this.#listeners.push(networkListener, appListener);
    const networkRevision = this.#networkRevision;
    const lifecycleRevision = this.#lifecycleRevision();
    const [network, app] = await Promise.all([this.getNetworkStatus(), this.getAppState()]);
    if (this.#networkRevision === networkRevision) this.#osConnected.set(network.connected);
    if (this.#lifecycleRevision() === lifecycleRevision) this.#appActive.set(app.isActive);
  }

  markApiSuccess(): void {
    this.#apiReachabilityRevision += 1;
    this.#apiReachable.set(true);
  }

  markApiFailure(): void {
    this.#apiReachabilityRevision += 1;
    this.#apiReachable.set(false);
  }

  /**
   * Runs one remote-only reachability check for this service instance and updates the observed API state.
   * While it is running, every caller shares that check; products should therefore use one stable health endpoint.
   */
  verifyConnection(url: string, timeoutMs = DEFAULT_OFFLINE_CONNECTION_VERIFICATION_TIMEOUT_MS): Promise<boolean> {
    if (this.#connectionVerification) return this.#connectionVerification;

    const startingApiReachabilityRevision = this.#apiReachabilityRevision;
    this.#checkingConnection.set(true);
    const verification = firstValueFrom(
      this.#http
        .get(url, {
          context: new HttpContext().set(OFFLINE_BYPASS, true).set(OFFLINE_IGNORE_TRANSPORT_FAILURE, true),
          observe: 'response',
        })
        .pipe(
          timeout({ first: timeoutMs }),
          map(() => {
            this.markApiSuccess();
            return true;
          }),
          catchError((error: unknown) => {
            if (isOfflineFallbackError(error) && this.#apiReachabilityRevision === startingApiReachabilityRevision) {
              this.markApiFailure();
            }
            return of(false);
          }),
        ),
    ).finally(() => {
      this.#checkingConnection.set(false);
      this.#connectionVerification = null;
    });
    this.#connectionVerification = verification;
    return verification;
  }

  /** Factory seam for Capacitor app-state discovery and deterministic tests. */
  protected getAppState(): Promise<{ isActive: boolean }> {
    return App.getState();
  }

  /** Factory seam for Capacitor app-state listeners and deterministic tests. */
  protected addAppStateListener(listener: (state: { isActive: boolean }) => void): Promise<PluginListenerHandle> {
    return App.addListener('appStateChange', listener);
  }

  /** Factory seam for Capacitor network discovery and deterministic tests. */
  protected getNetworkStatus(): Promise<{ connected: boolean }> {
    return Network.getStatus();
  }

  /** Factory seam for Capacitor network listeners and deterministic tests. */
  protected addNetworkStatusListener(listener: (state: { connected: boolean }) => void): Promise<PluginListenerHandle> {
    return Network.addListener('networkStatusChange', listener);
  }

  async #refreshOsStatus(): Promise<void> {
    const revision = this.#networkRevision;
    const status = await this.getNetworkStatus();
    if (this.#networkRevision === revision) this.#osConnected.set(status.connected);
  }
}
