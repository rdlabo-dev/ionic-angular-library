Optional features use secondary entry points so their native plugins and SDKs do not enter applications that do not use them.

## Web application updates

`provideKitAppUpdate()` from `/app-update` checks for a complete Angular service-worker version before bootstrap. This blocking
strategy remains the default for applications where preserving all in-progress input is more important than a slow update check.

Applications that prefetch every executable application chunk can opt into a non-blocking startup check:

```ts
provideKitAppUpdate({ strategy: 'background' });
```

The background strategy reloads only before Angular completes its first render. A later update is left for the next natural page
load so user input is not discarded. It never calls `activateUpdate()`, which could mix a running shell with lazy chunks from
another version. An unrecoverable startup generation is retried once with `ngsw-bypass`; the current history state and an
offline-safe loop guard are retained.

## Theme and review

`provideKitTheme()` and `KitThemeController` persist a user preference, follow `prefers-color-scheme` until overridden, toggle app-provided palette classes, and synchronize the Android status bar.

```ts
provideKitTheme({
  storageKey: 'theme',
  darkClasses: ['ion-palette-dark'],
  lightClasses: ['ion-palette-light'],
});
```

Import `kitRequestReview()` from `/review` to request the native review dialog at most once per application-defined window. It is a no-op on the web.

## Printer

The `/printer` entry point contains pure helpers for DOM-to-PNG rendering, image rotation, Brother print settings, multi-page label layout, and PDF generation. The consuming app owns paper-selection UI, loading overlays, storage, transport, and copy policy.

## Firebase authentication

The `/auth-firebase` entry point initializes `firebase/auth` through `provideKitFirebase()` and exposes `KIT_FIREBASE_AUTH` plus flow helpers such as `kitSignIn`, `kitSignUp`, `kitSignOut`, `kitResolveAuthStatus`, and `kitReauthWithRetry`.

The kit performs no UI. Hooks carry loading, navigation, and error presentation back to the application. Social providers are isolated further under `/auth-firebase/social`.

## Live Update

`provideLiveUpdateReadiness()` from `/live-update` waits for Angular stability, the first completed route, and one animation frame before calling Capawesome `LiveUpdate.ready()`. It is a no-op on the web.

A Live Update replaces only the web layer of an existing native binary. Native code, Capacitor configuration, or plugin version changes require a store build and a new build-number-specific channel.
