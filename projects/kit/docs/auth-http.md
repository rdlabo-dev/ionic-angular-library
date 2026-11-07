## Access capability

`provideKitAuth()` configures functional route guards for `user`, `confirm`, `required`, `anonymous`, and `unavailable` authentication states. Redirect routes and application side effects remain in the app. `AuthService` in the examples below is application-owned; supply your own `authState` observable and optional lifecycle callbacks.

`KitAuthAccessService` publishes what the current session may do:

| Mode     | Local replica and outbox | Authenticated HTTP, realtime, and sync |
| -------- | ------------------------ | -------------------------------------- |
| `none`   | Blocked                  | Blocked                                |
| `local`  | Allowed                  | Blocked                                |
| `remote` | Allowed                  | Allowed                                |

An authoritative `required` result is signed out and must not become offline access. Only an `unavailable` transport result may activate a previously verified local session.

```ts
import { inject } from '@angular/core';
import type { Routes } from '@angular/router';
import {
  kitRequireAuthorizedGuard,
  kitRequireConfirmingGuard,
  kitRequiredUnauthorizedGuard,
  provideKitAuth,
} from '@rdlabo/ionic-angular-kit';
import { AuthService } from './auth.service';

provideKitAuth(() => {
  const auth = inject(AuthService);
  return {
    authState: () => auth.state$,
    redirects: {
      whenAuthorized: '/home',
      whenConfirming: '/auth/confirm',
      whenNotConfirming: '/auth/signin',
      whenUnauthorized: '/auth',
    },
  };
});

export const routes: Routes = [
  { path: 'auth/signin', canActivate: [kitRequiredUnauthorizedGuard], loadComponent: () => import('./signin.page').then((m) => m.SigninPage) },
  { path: 'auth/confirm', canActivate: [kitRequireConfirmingGuard], loadComponent: () => import('./confirm.page').then((m) => m.ConfirmPage) },
  { path: 'home', canActivate: [kitRequireAuthorizedGuard], loadComponent: () => import('./home.page').then((m) => m.HomePage) },
];
```

Use `kitRequiredUnauthorizedGuard`, `kitRequireConfirmingGuard`, and `kitRequireAuthorizedGuard` in route definitions. A protected asynchronous decision suspends previously published remote capability until the current authorization lease succeeds.

## Share startup login requests

`KitAuthLoginExchange<Identity, Result>` shares a pending backend login request. A preloaded result (including failure) can be consumed once by authorization while the originating navigation is current, for up to 30 seconds after completion. Later authorization calls make a fresh request; this is not a permissions cache.

Keep one instance in the application authentication service. Capture the Firebase user when constructing the request, reject responses for a replaced user, and call `clear()` on sign-out. Provider eligibility, deletion recovery, terms acceptance, and response handling remain application-owned.

For applications that initialize a local runtime before authorization, call `kitPreloadAuthLoginForNavigation(router, isCurrent => auth.preloadTokenLogin(isCurrent))` after Firebase readiness and required account recovery, before awaiting runtime initialization. Invoke its returned cleanup if initialization fails. It discards unconsumed work when that navigation ends or is canceled. Applications without useful startup work to overlap can use `run(identity, request)` alone.

## HTTP policy

`provideKitHttp()` configures `kitAuthInterceptor` for credential injection, bypass rules, transient failure handling, and application error hooks. Register the interceptor separately with `provideHttpClient`. Only `getAuthHeaders` is required; every other hook is optional and application-owned.

```ts
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { inject } from '@angular/core';
import type { ApplicationConfig } from '@angular/core';
import { kitAuthInterceptor, provideKitAuth, provideKitHttp } from '@rdlabo/ionic-angular-kit';
import { AuthService } from './auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([kitAuthInterceptor])),
    provideKitAuth(() => {
      const auth = inject(AuthService);
      return {
        authState: () => auth.state$,
        redirects: {
          whenAuthorized: '/home',
          whenConfirming: '/auth/confirm',
          whenNotConfirming: '/auth/signin',
          whenUnauthorized: '/auth',
        },
      };
    }),
    provideKitHttp(() => {
      const auth = inject(AuthService);
      return {
        getAuthHeaders: async () => ({ Authorization: `Bearer ${await auth.token()}` }),
        onUnauthorized: () => auth.signOut(),
      };
    }),
  ],
};
```

Automatic retry is limited to `GET`, `HEAD`, `OPTIONS`, or requests carrying an `Idempotency-Key`. Ordinary writes are never retried automatically. Retries cover transient statuses `0`, `408`, `429`, `502`, `503`, and `504`, and honor `Retry-After`.

When offline support is enabled, register `offlineInterceptor` before `kitAuthInterceptor`. Local mode then prevents credential generation and network transport while allowing a matched read policy to serve the scoped replica.

### Request-owned error notifications

`onServerError` receives the server body message for HTTP 400, 409, 422, and 500.
For requests whose caller displays its own error UI, set the public boolean context token
`KIT_SKIP_ERROR_NOTIFICATIONS` (default `false`):

```ts
import { HttpContext } from '@angular/common/http';
import { KIT_SKIP_ERROR_NOTIFICATIONS } from '@rdlabo/ionic-angular-kit';

http.post('/applications', payload, {
  context: new HttpContext().set(KIT_SKIP_ERROR_NOTIFICATIONS, true),
});
```

This suppresses only response-error notification hooks: `onUnauthorized`, `onForbidden`,
`onNetworkError`, `onRateLimited`, `onMaintenance`, `onServerBusy`, and `onServerError`.
The original error still rejects to the caller. It does not bypass authentication, stop
401 recovery/replay, change retry or offline-fallback behavior, prevent access revocation
(`onAuthAccessDenial`), or suppress auth-header failures (`onAuthError`).
