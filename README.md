These libraries are a collection of components and services for Ionic Angular applications.

Documentation: [Ionic Angular Kit](https://docs.rdlabo.dev/projects/ionic-angular-kit) · [Photo Editor](https://docs.rdlabo.dev/projects/ionic-angular-photo-editor) · [Scroll Header](https://docs.rdlabo.dev/projects/ionic-angular-scroll-header) · [Scroll Strategies](https://docs.rdlabo.dev/projects/ngx-cdk-scroll-strategies)

Upgrading from an earlier release? Read the [library migration guide](docs/migration.md).

[Demo site is here.](https://rdlabo-ionic-angular-library.netlify.app/)

## Support Version

| Angular | Ionic | Package version |
| ------- | ----- | --------------- |
| v21–22  | v9    | 22.x.x          |
| v20     | v8    | 20.x.x          |
| v19     | v8    | 19.x.x          |
| v18     | v8    | 2.x.x           |

The compatibility table describes package requirements, not application-framework migration steps. Follow the upstream Angular, Ionic, and Capacitor guides separately, then apply this repository's [library-specific migrations](docs/migration.md).

Native v22 applications require an iOS/iPadOS deployment target of 16.4 or later.

## packages

| package name                        | description                                                                                                                                                       | path                                                                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| @rdlabo/ionic-angular-kit           | Auth, storage, overlays, HTTP, offline/realtime, Signal Forms, updates, and native utilities.                                                                     | [/projects/kit](https://github.com/rdlabo-dev/ionic-angular-library/tree/main/projects/kit#readme)                             |
| @rdlabo/ionic-angular-photo-editor  | Photo editor/viewer modals and camera or album file loading. Root import: types and `providePhotoEditor`. Components and services: `/editor`, `/viewer`, `/file`. | [/projects/photo-editor](https://github.com/rdlabo-dev/ionic-angular-library/tree/main/projects/photo-editor#readme)           |
| @rdlabo/ionic-angular-scroll-header | Directives for scroll-linked Ionic headers.                                                                                                                       | [/projects/scroll-header](https://github.com/rdlabo-dev/ionic-angular-library/tree/main/projects/scroll-header#readme)         |
| @rdlabo/ngx-cdk-scroll-strategies   | Dynamic-size virtual scroll strategies for Angular CDK.                                                                                                           | [/projects/scroll-strategies](https://github.com/rdlabo-dev/ionic-angular-library/tree/main/projects/scroll-strategies#readme) |

### Release

All libraries (including kit) share one version line and are released together via `npm run release` (`np --no-tests --no-publish`) → `v*` tag → GitHub Actions `release.yml`.

- Stable `vX.Y.Z` → npm `latest`
- Prerelease `vX.Y.Z-N` (np style) → npm dist-tag **`next`** (version string stays `X.Y.Z-N`)

### Kit Auth demo

The demo app includes a **Kit** tab with a Firebase Auth harness (`/main/kit/auth`).

1. Fill `projects/demo/src/environments/environment.ts` (`firebase`).
2. `npm start` — open the Kit tab.
3. `npm run e2e` — Playwright signs up with a UUID email; `window.__E2E__` skips email confirmation.
4. `npm run cap` — copy a production build to iOS/Android for device checks (for example, `kitAuthInput="email"` persistence).

<!-- rdlabo-docs-omit -->

## Prerelease channels

This repository publishes its four Angular library projects as one npm candidate set. An open, non-draft pull request can publish all four packages to the npm `beta` dist-tag after its `Lint` and `Package Candidate` workflows pass. A repository owner or maintainer must add a comment whose entire body is:

```text
/beta
```

The request authorizes only the pull request head SHA that existed when the comment was added. Any new commit requires CI to pass again and a fresh owner or maintainer `/beta` comment. Fork pull requests are supported. A pull request that changes a release-gating workflow cannot be beta-published until those workflow changes land on `main`.

Before publishing begins, the release workflow verifies that the immutable artifact contains exactly `@rdlabo/ionic-angular-kit`, `@rdlabo/ionic-angular-photo-editor`, `@rdlabo/ionic-angular-scroll-header`, and `@rdlabo/ngx-cdk-scroll-strategies`, all at the same `<base>-beta.pr<PR number>.sha<12-character SHA>` version. Notification failures cannot invalidate a successful npm publish.

When a pull request is merged into `main`, the same package set is automatically published to `beta` only after `Lint` and `Package Candidate` succeed for that exact merge commit. Direct pushes to `main` do not publish a candidate.

Only `npm run release` creates a release tag. Stable `vX.Y.Z` tags publish every library to npm `latest`; revision/prerelease tags publish every library to `next`. Neither `beta` nor `next` publishing changes the npm `latest` dist-tag.

<!-- /rdlabo-docs-omit -->

## Maintainers

- [rdlabo](https://rdlabo.dev/)
