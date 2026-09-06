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
