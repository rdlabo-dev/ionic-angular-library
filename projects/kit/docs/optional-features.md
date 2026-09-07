Optional features use secondary entry points so their native plugins and SDKs do not enter applications that do not use them.

## Web application updates

`provideKitAppUpdate()` from `/app-update` checks for a complete Angular service-worker version before bootstrap. This blocking
strategy remains the default for applications where preserving all in-progress input is more important than a slow update check.

Applications that prefetch every executable application chunk can opt into a non-blocking startup check:

```ts
provideKitAppUpdate({ strategy: 'background' });
```

The existing background strategy reloads only before Angular completes its first render. A later update is left for the next
natural page load so user input is not discarded.

Applications can select the separate `confirm` strategy to offer an immediate, user-controlled update. The prompt runs after
the first render and in an Angular injection context. Resolve dependencies synchronously before crossing an async boundary.
Resolving `true` reloads into the complete downloaded version, `false` leaves it for the next natural page load, and `undefined`
retries later because the prompt could not be presented (for example, while another alert is active).

```ts
provideKitAppUpdate({
  strategy: 'confirm',
  promptForUpdate: () =>
    inject(KitOverlayController).tryAlertConfirm({
      header: 'The latest version is ready',
      message: 'Reload now to update?',
      okText: 'Reload and update',
    }),
});
```

Neither non-blocking strategy calls `activateUpdate()`, which could mix a running shell with lazy chunks from another version.
An unrecoverable startup generation is retried once with `ngsw-bypass`; the current history state and an offline-safe loop guard
are retained.

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

The kit performs no UI. Hooks carry loading, navigation, and error presentation back to the application. Social providers have separate `/auth-firebase/apple`, `/auth-firebase/facebook`, and `/auth-firebase/google` entry points, so each provider needs only its own optional plugin. The combined `/auth-firebase/social` entry point is **deprecated and retained for backwards compatibility**; migrate its Apple imports to `/apple` and its Facebook imports to `/facebook`.

The compatibility entry point still loads both Apple and Facebook plugins. Its functions retain the same runtime identity, and existing Apple response objects remain source-compatible.

Social helpers capture the current Firebase user before `before` runs and check that identity around asynchronous work. Success hooks receive the exact authenticated `user`; use it to bind backend requests to the same session. An overlapping Apple, Facebook, or Google flow for the same `Auth` is rejected through `error('other', error)` with `status: false`, before its `before` hook or SDK call starts. The guard stays active through cleanup. Different `Auth` instances are independent.

Applications must also coordinate email/password authentication, sign-out, and direct Firebase calls with these flows. The guard covers kit social helpers in this JavaScript context; it cannot cancel an already-started Firebase request, roll back a completed provider link, or serialize changes from another browser tab.

Failures in `before`, exchange, or `success` run the error hook and return `status: false`. `finally` always runs, including on overlapping calls; errors from `error` or `finally` reject the promise. Hooks own their UI cleanup.

Apple consumers must install `@capawesome/capacitor-apple-sign-in` (`>=0.1.4 <1`) and run `npx cap sync` after replacing `@capacitor-community/apple-sign-in`. This native dependency migration also applies when using the deprecated `/social` entry point; its import and response types remain compatible. Native plugin changes require a new native binary.

The Apple helper uses native sign-in on iOS and the Firebase popup on web. Android Service ID and redirect configuration are not exposed by this helper. Capawesome's typed `SIGN_IN_CANCELED` error is reported as cancellation; other native errors remain operational failures. The native `idToken` maps to the existing `identityToken` response field. On web, `authorizationCode` is `null`, and the popup access token is returned separately as `accessToken`.

## Live Update

`provideLiveUpdateReadiness()` from `/live-update` waits for Angular stability, the first completed route, and one animation frame before calling Capawesome `LiveUpdate.ready()`. It is a no-op on the web.

A Live Update replaces only the web layer of an existing native binary. Native code, Capacitor configuration, or plugin version changes require a store build and a new build-number-specific channel.
