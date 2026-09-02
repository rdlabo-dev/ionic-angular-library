# @rdlabo/ionic-angular-kit

`@rdlabo/ionic-angular-kit` provides shared application infrastructure for Ionic Angular applications. It keeps product-specific screens, domain policy, and translations in the consuming app.

```sh
npm install @rdlabo/ionic-angular-kit
```

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

## Entry points

| Import                                    | Responsibility                                                                     |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `@rdlabo/ionic-angular-kit`               | Storage, overlays, guards, HTTP, realtime, directives, keyboard, and utilities     |
| `@rdlabo/ionic-angular-kit/offline`       | **Experimental.** Scoped local replica, outbox, pull, replay, and request policies |
| `@rdlabo/ionic-angular-kit/theme`         | Persisted light/dark theme and native status bar sync                              |
| `@rdlabo/ionic-angular-kit/forms`         | Ionic error text and state classes for Angular Signal Forms                        |
| `@rdlabo/ionic-angular-kit/review`        | Throttled native in-app review requests                                            |
| `@rdlabo/ionic-angular-kit/printer`       | DOM-to-PNG, Brother label, and PDF helpers                                         |
| `@rdlabo/ionic-angular-kit/auth-firebase` | Firebase dependency wiring and authentication flows                                |
| `@rdlabo/ionic-angular-kit/app-update`    | Atomic Angular service-worker update transitions                                   |
| `@rdlabo/ionic-angular-kit/live-update`   | Capawesome Live Update readiness provider                                          |

Secondary entry points isolate optional native and SDK dependencies from the core bundle.

The entire `/offline` entry point is experimental and is not covered by the kit's SemVer compatibility guarantee. Its public APIs, persistence schema, and synchronization behavior may change incompatibly in a minor or patch release before stabilization. Pin the kit to an exact version when adopting it, and review the migration guide before every upgrade.

## Configure only what you use

Most features expose a provider whose callbacks keep routes, copy, credentials, and application side effects outside the kit. Start with [Storage and Overlays](https://docs.rdlabo.dev/projects/ionic-angular-kit/docs/storage-overlays), then add authentication, offline, or native features as your app needs them. The [Offline and Realtime](https://docs.rdlabo.dev/projects/ionic-angular-kit/docs/offline-realtime) guide includes the required SQLite connection, provider/interceptor order, read strategies, durable Outbox flow, and repository concurrency rules.

## Documentation

- [Storage and Overlays](https://docs.rdlabo.dev/projects/ionic-angular-kit/docs/storage-overlays)
- [Authentication and HTTP](https://docs.rdlabo.dev/projects/ionic-angular-kit/docs/auth-http)
- [Offline and Realtime](https://docs.rdlabo.dev/projects/ionic-angular-kit/docs/offline-realtime)
- [Optional Features](https://docs.rdlabo.dev/projects/ionic-angular-kit/docs/optional-features)

<!-- rdlabo-docs-omit -->

**Full documentation:** [https://docs.rdlabo.dev/projects/ionic-angular-kit](https://docs.rdlabo.dev/projects/ionic-angular-kit)

<!-- /rdlabo-docs-omit -->
