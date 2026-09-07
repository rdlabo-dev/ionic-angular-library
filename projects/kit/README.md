# @rdlabo/ionic-angular-kit

`@rdlabo/ionic-angular-kit` provides typed storage, typed overlays, and Ionic Signal Forms adapters for Ionic Angular applications. Product-specific screens, domain policy, and translations stay in the consuming app.

```sh
npm install @rdlabo/ionic-angular-kit
```

## First try: save a preference

In an existing Ionic Angular application, merge the Ionic Storage provider into your existing app config. Do not replace other providers.

```ts
import { importProvidersFrom, type ApplicationConfig } from '@angular/core';
import { IonicStorageModule } from '@ionic/storage-angular';

export const appConfig: ApplicationConfig = {
  providers: [importProvidersFrom(IonicStorageModule.forRoot({ name: '__mydb' }))],
};
```

Then add this standalone component:

```ts
import { Component, inject, signal } from '@angular/core';
import { IonButton } from '@ionic/angular';
import { disableHandler, KitStorageService } from '@rdlabo/ionic-angular-kit';

@Component({
  selector: 'app-preferences-demo',
  imports: [IonButton],
  template: `<ion-button type="button" (click)="disableHandler($event, save())">Save preference</ion-button>
    <p>{{ result() }}</p>`,
})
export class PreferencesDemo {
  private readonly storage = inject(KitStorageService);
  readonly result = signal('');
  readonly disableHandler = disableHandler;

  async save(): Promise<void> {
    await this.storage.set('theme', 'dark');
    this.result.set((await this.storage.get<string>('theme')) ?? '');
  }
}
```

Render `<app-preferences-demo>` on an existing page (import `PreferencesDemo` into that standalone page's `imports`). Click Save preference — `dark` appears. `KitStorageService` initializes storage automatically; no manual initialization is required.

## Requirements

| Package                                         | Supported version |
| ----------------------------------------------- | ----------------- |
| Angular                                         | 21.x–22.x         |
| Ionic Angular                                   | 9.x               |
| RxJS                                            | 7.8.x             |
| Capacitor Core, App, Haptics, Keyboard, Network | 7.x–8.x           |
| iOS/iPadOS deployment target                    | 16.4 or later     |

The core package declares `@ionic/storage-angular` and Capacitor Core, App, Haptics, Keyboard, and Network as required peers. Keep compatible versions installed even when an application uses only part of the core entry point. Native applications using `/offline` must additionally install and configure the `@capacitor-community/sqlite` major matching their Capacitor major; it is application-owned and is not installed by the kit.

Firebase, social login, Live Update, Preferences, Status Bar, in-app review, and printer/PDF dependencies are optional feature peers. Install only the dependencies used by the selected secondary entry points and follow each plugin's own compatibility range; some optional plugins support only Capacitor 8.

The `/auth-firebase/google` entry point uses `@capawesome/capacitor-google-sign-in` 0.1.x and therefore requires Capacitor 8. Applications remaining on Capacitor 7 can continue to use the core Kit and other compatible entry points, but cannot use this Google entry point.

## Entry points

| Import                                           | Responsibility                                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `@rdlabo/ionic-angular-kit`                      | Storage, overlays, guards, HTTP, realtime, directives, keyboard, and utilities     |
| `@rdlabo/ionic-angular-kit/offline`              | **Experimental.** Scoped local replica, outbox, pull, replay, and request policies |
| `@rdlabo/ionic-angular-kit/theme`                | Persisted light/dark theme and native status bar sync                              |
| `@rdlabo/ionic-angular-kit/forms`                | Ionic error text and state classes for Angular Signal Forms                        |
| `@rdlabo/ionic-angular-kit/review`               | Throttled native in-app review requests                                            |
| `@rdlabo/ionic-angular-kit/printer`              | DOM-to-PNG, Brother label, and PDF helpers                                         |
| `@rdlabo/ionic-angular-kit/auth-firebase`        | Firebase dependency wiring and authentication flows                                |
| `@rdlabo/ionic-angular-kit/auth-firebase/google` | Google popup/native sign-in, Firebase session linking, and logout                  |
| `@rdlabo/ionic-angular-kit/auth-firebase/social` | Apple and Facebook Firebase social-auth helpers                                    |
| `@rdlabo/ionic-angular-kit/app-update`           | Atomic Angular service-worker update transitions                                   |
| `@rdlabo/ionic-angular-kit/live-update`          | Capawesome Live Update readiness provider                                          |

Secondary entry points isolate optional native and SDK dependencies from the core bundle.

The entire `/offline` entry point is experimental and is not covered by the kit's SemVer compatibility guarantee. Its public APIs, persistence schema, and synchronization behavior may change incompatibly in a minor or patch release before stabilization. Pin the kit to an exact version when adopting it, and review the migration guide before every upgrade.

## Configure only what you use

Most features expose a provider whose callbacks keep routes, copy, credentials, and application side effects outside the kit. Start with [Storage and Overlays](https://docs.rdlabo.dev/projects/ionic-angular-kit/docs/storage-overlays) and [Forms](https://docs.rdlabo.dev/projects/ionic-angular-kit/docs/forms).

## Documentation

- [Storage and Overlays](https://docs.rdlabo.dev/projects/ionic-angular-kit/docs/storage-overlays)
- [Forms](https://docs.rdlabo.dev/projects/ionic-angular-kit/docs/forms)
- [Check your Kit integration with ESLint](./docs/eslint.md)
- [Authentication and HTTP](https://docs.rdlabo.dev/projects/ionic-angular-kit/docs/auth-http)
- [Offline and Realtime](https://docs.rdlabo.dev/projects/ionic-angular-kit/docs/offline-realtime)
- [Optional Features](https://docs.rdlabo.dev/projects/ionic-angular-kit/docs/optional-features)

<!-- rdlabo-docs-omit -->

**Full documentation:** [https://docs.rdlabo.dev/projects/ionic-angular-kit](https://docs.rdlabo.dev/projects/ionic-angular-kit)

<!-- /rdlabo-docs-omit -->
