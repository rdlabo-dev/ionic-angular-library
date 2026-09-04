import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OfflineNetworkService } from './offline-network.service';
import { OFFLINE_BYPASS, OFFLINE_IGNORE_TRANSPORT_FAILURE } from './offline-request-policy';

describe('OfflineNetworkService connection verification', () => {
  let http: HttpTestingController;
  let service: OfflineNetworkService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [OfflineNetworkService, provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(OfflineNetworkService);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('bypasses local fallback and records a successful API check', async () => {
    const markApiSuccess = vi.spyOn(service, 'markApiSuccess');
    const result = service.verifyConnection('/status');
    expect(service.checkingConnection()).toBe(true);
    const request = http.expectOne('/status');
    expect(request.request.context.get(OFFLINE_BYPASS)).toBe(true);
    expect(request.request.context.get(OFFLINE_IGNORE_TRANSPORT_FAILURE)).toBe(true);
    request.flush({});

    await expect(result).resolves.toBe(true);
    expect(markApiSuccess).toHaveBeenCalledOnce();
    expect(service.checkingConnection()).toBe(false);
  });

  it('shares the service-wide in-flight check and permits another check after it settles', async () => {
    const first = service.verifyConnection('/status');
    const second = service.verifyConnection('/another-status');
    expect(second).toBe(first);
    http.expectOne('/status').flush({});
    http.expectNone('/another-status');
    await Promise.all([first, second]);

    const third = service.verifyConnection('/status');
    http.expectOne('/status').flush({});
    await expect(third).resolves.toBe(true);
  });

  it('does not classify an HTTP error as a disconnected transport', async () => {
    const markApiFailure = vi.spyOn(service, 'markApiFailure');
    const result = service.verifyConnection('/status');
    http.expectOne('/status').flush({}, { status: 500, statusText: 'Server Error' });

    await expect(result).resolves.toBe(false);
    expect(markApiFailure).not.toHaveBeenCalled();
    expect(service.checkingConnection()).toBe(false);
  });

  it('records a status-zero failure when no newer API observation exists and permits retry', async () => {
    const markApiFailure = vi.spyOn(service, 'markApiFailure');
    const first = service.verifyConnection('/status');
    http.expectOne('/status').error(new ProgressEvent('error'));
    await expect(first).resolves.toBe(false);
    expect(markApiFailure).toHaveBeenCalledOnce();
    expect(service.state()).toBe('offline');

    const second = service.verifyConnection('/status');
    http.expectOne('/status').flush({});
    await expect(second).resolves.toBe(true);
  });

  it('does not let an older probe failure overwrite a newer successful API observation', async () => {
    const markApiFailure = vi.spyOn(service, 'markApiFailure');
    const verification = service.verifyConnection('/status');
    service.markApiSuccess();
    http.expectOne('/status').error(new ProgressEvent('error'));

    await expect(verification).resolves.toBe(false);
    expect(markApiFailure).not.toHaveBeenCalled();
    expect(service.state()).toBe('unverified');
  });

  it('does not overwrite reachability when a stalled check times out and permits retry', async () => {
    vi.useFakeTimers();
    const markApiFailure = vi.spyOn(service, 'markApiFailure');
    const first = service.verifyConnection('/status', 10);
    http.expectOne('/status');
    await vi.advanceTimersByTimeAsync(10);

    await expect(first).resolves.toBe(false);
    expect(markApiFailure).not.toHaveBeenCalled();
    expect(service.checkingConnection()).toBe(false);

    const second = service.verifyConnection('/status', 10);
    http.expectOne('/status').flush({});
    await expect(second).resolves.toBe(true);
  });
});
