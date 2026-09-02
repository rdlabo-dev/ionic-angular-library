## Scoped offline runtime

> **Experimental:** The entire `@rdlabo/ionic-angular-kit/offline` entry point is experimental and is not covered by the kit's SemVer compatibility guarantee. Its public APIs, persistence schema, and synchronization behavior may change incompatibly in a minor or patch release before stabilization. Pin the kit to an exact version when adopting it, and review the migration guide before every upgrade.

The `/offline` entry point provides a user- and partition-scoped local replica, durable outbox, cursor-based delta pull, aggregate-ordered replay, optimistic mutation policies, and request-policy interception.

Use `mode: 'readCacheOnly'` for external-source or HTTP caches. Synchronized mode uses encrypted `@capacitor-community/sqlite` on iOS and Android; it fails fast on the web because the current runtime has no cross-tab synchronization lock.

### Install and provide the runtime

Provide Ionic Storage once for the kit's storage infrastructure. Web read-cache installations also use it as the offline repository. Native synchronized applications additionally own the Community SQLite connection passed to the kit. The SQLite install and native sync below are required only for synchronized iOS and Android applications:

```sh
npm install @ionic/storage-angular @capacitor-community/sqlite@^8
npx cap sync
```

The SQLite plugin major must match Capacitor: use `@capacitor-community/sqlite@^7` in a Capacitor 7 application and `@^8` in a Capacitor 8 application.

```ts
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { importProvidersFrom } from '@angular/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import { IonicStorageModule } from '@ionic/storage-angular';
import { kitAuthInterceptor } from '@rdlabo/ionic-angular-kit';
import { offlineInterceptor, provideOffline } from '@rdlabo/ionic-angular-kit/offline';

const sqliteConnection = new SQLiteConnection(CapacitorSQLite);

export const appConfig = {
  providers: [
    importProvidersFrom(IonicStorageModule.forRoot({ name: '__kit_storage' })),
    provideHttpClient(withInterceptors([offlineInterceptor, kitAuthInterceptor])),
    provideOffline({
      databaseName: 'product_offline',
      replicaSchema,
      sqliteConnection,
      createEncryptionKey: () => secureKeyStore.getOrCreateOfflineKey(),
      requestPolicies: [ProductReadPolicy],
      mutationPolicies: [ProductMutationPolicy],
      commandExecutor: ProductCommandExecutor,
      replicaPuller: ProductReplicaPuller,
      aggregateIntentProjector: ProductAggregateIntentProjector,
    }),
  ],
};
```

Register `offlineInterceptor` before `kitAuthInterceptor`. Product adapters own URL and DTO mapping, replica schemas, encryption-key storage, server pull/command protocols, and optimistic projection. The kit owns persistence, session isolation, FIFO ordering, retries, and reconciliation. Set `databaseEncryption: false` only for an intentional plaintext native database; encryption is otherwise the default and requires `createEncryptionKey` on first open.

For `mode: 'readCacheOnly'`, omit mutation policies, the command executor, replica puller, and aggregate intent projector. Web supports this read-cache mode through Ionic Storage. Web synchronized mode is rejected until its repository can provide cross-context locking.

```ts
provideOffline({
  mode: 'readCacheOnly',
  databaseName: 'product_cache',
  databaseEncryption: false,
  replicaSchema,
  requestPolicies: [ProductReadPolicy],
});
```

The web read-cache configuration does not import or pass Community SQLite. `databaseEncryption: false` is explicit because SQLCipher applies only to the native repository.

Cold-start offline access restores only a manifest bound to a non-null authentication-provider subject. Remote work follows this order:

1. Prepare the verified remote session.
2. Publish `remote` access.
3. Resume pull, outbox replay, and realtime work.

`createOfflineAuthBridge()` connects this ordering to `provideKitAuth()` while leaving consent, error UI, and credential exchange in the app.

```ts
import { provideKitAuth } from '@rdlabo/ionic-angular-kit';
import { createOfflineAuthBridge, isOfflineFallbackError } from '@rdlabo/ionic-angular-kit/offline';

provideKitAuth(() => ({
  authState: () => auth.state$,
  ...createOfflineAuthBridge({
    exchange: async (context) => exchangeCredential(context),
    currentAuthSubject: () => auth.currentSubject(),
    isUnavailableError: isOfflineFallbackError,
    availability: () => auth.authorityAvailable$,
  }),
  redirects,
}));
```

On explicit sign-out, clear `KitAuthAccessService` first, then await offline session cleanup so in-flight leases are invalidated before persisted user data is removed.

### Read request strategies

An `OfflineRequestPolicy` resolves a matched GET to `kind: 'read'`, a `readLocal()` function, and an optional shared `projectResponse()` function. `readStrategy` controls settlement:

| Strategy        | Behavior                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `network-first` | Default. Uses transport first and falls back to the local response for an offline/unavailable transport error.                                   |
| `local-first`   | Starts local and remote work together, emits a usable local response first, then emits remote revalidation.                                      |
| `fastest-first` | Emits whichever usable response settles first. A local winner is followed by remote revalidation; a remote winner cancels the slower local read. |
| `local-only`    | Never starts HTTP transport. Use it for provisional identities that cannot exist remotely.                                                       |

`local-first` and a locally winning `fastest-first` can emit twice. Keep the HTTP observable subscribed through revalidation; `firstValueFrom()` and `take(1)` cancel the transport after the first emission. Use `offlineReadEmission()` and `shouldCommitOfflineCollection()` when UI state needs to distinguish a complete remote collection from an incomplete empty local snapshot.

`projectResponse(response, source)` runs for both remote and local responses. Persist only when `source === 'remote'`. Set `serializeResponseProjection: true` when the projector performs read-only derivation that must wait behind replica mutations. Do not enable it when the projector starts a replica mutation itself; use `OfflineSyncService.runSerializedReplicaMutation()` for a read/derive/write sequence instead.

### Durable mutations and immediate generated creates

Mutation policies prepare the optimistic `HttpResponse`; the product implementation should enqueue the corresponding durable intent before returning it. `enqueue()` generates a UUID by default. Supply a stable `commandId` when product code must correlate the durable intent with surrounding work or immediately send a newly created generated identity. Kit preserves that ID across transport retries.

```ts
import type { OfflineGeneratedCommandLocator } from '@rdlabo/ionic-angular-kit/offline';

const commandId = crypto.randomUUID();
const localId = crypto.randomUUID();

await offlineSync.enqueue(
  {
    commandId,
    scopeId,
    aggregateType: 'photo',
    identity: { kind: 'generated', localId },
    operation: 'create',
    payload: createPayload,
  },
  { flush: false },
);

const locator = {
  scopeId,
  sourceKey: 'photo',
  localId,
} satisfies OfflineGeneratedCommandLocator;

const remoteId = await offlineSync.sendGeneratedCommandNow(commandId, locator);
```

The second argument has type `OfflineGeneratedCommandLocator`. `sendGeneratedCommandNow()` is deliberately limited to the first pending intent of a new generated aggregate with no confirmed baseline or remote ID. It skips the normal pre-send pull and commits the local acknowledgement. When it obtains a confirmed remote ID, it schedules authoritative pull reconciliation in the background. It returns `null` when transport is unavailable or no confirmed ID is produced. A terminal `blocked_auth`, `rejected`, or `conflict` result throws `OfflineImmediateCommandRejectedError`. Existing aggregates and later intents must use `flush()` so the pre-pull conflict barrier remains in place.

Command payloads must be losslessly JSON-serializable. Caller-owned command IDs must contain 1–255 characters and must not be reused during the application/server idempotency-retention period. Kit can reject only collisions with commands that are still retained locally; the server may still deduplicate a reused ID after its local command has been reconciled and removed.

### Repository consistency boundary

Treat `OfflineSyncService` as the product mutation owner. For a product read/derive/write operation, use `runSerializedReplicaMutation()`. Inside its callback, use only the supplied repository and finish the write with that repository's `transactReplica()`; do not start a nested `OfflineSyncService` mutation or another coordinator lane. Commit replica rows, Outbox commands, cursors, and pull-attention changes together in that transaction.

For a read-only multi-query snapshot, use `repository.runReadSnapshot()` and perform all reads through the supplied reader. Do not mutate the repository or nest another `runReadSnapshot()` inside that callback. Direct `replaceCommand()`, `removeCommand()`, `putPullAttention()`, and `removePullAttention()` repository methods are deprecated; use the corresponding `putCommands`, `removeCommandIds`, `putPullAttentions`, and `removePullAttentions` fields of `transactReplica()`.

### Lazy authenticated routes

Use `provideRouteScopedOffline()` when the offline runtime and product schema must not enter the
unauthenticated application graph. Unlike the root `provideOffline()` API, the route-scoped provider
creates isolated Kit service instances and does not start them automatically. This lets the product
finish native reset recovery before opening SQLite or IndexedDB.

```ts
import { inject } from '@angular/core';
import type { CanActivateFn, Routes } from '@angular/router';
import { OfflineRouteInitializerService, provideRouteScopedOffline } from '@rdlabo/ionic-angular-kit/offline';

const offlineReadyGuard: CanActivateFn = async () => {
  await recoverProductOwnedLocalReset();
  await inject(OfflineRouteInitializerService).initialize();
  return true;
};

export const routes: Routes = [
  {
    path: '',
    providers: [provideRouteScopedOffline(options)],
    canActivate: [offlineReadyGuard],
    children: [
      {
        path: '',
        canActivate: [authorizedGuard],
        loadComponent: () => import('./authenticated.page').then((module) => module.AuthenticatedPage),
      },
    ],
  },
];
```

Use a parent/child route boundary when authorization depends on the initialized offline bridge. Do
not rely on ordering between guards declared in the same `canActivate` array.

Keep `provideOffline()` for existing root installations. Moving a provider is an application design
choice; adopting the new API is not a required migration.

### Defer remote work until authenticated content is visible

Route-scoped applications can open only the local substrate on the activation path, then resume
pull and Outbox transport after their first useful content has rendered. Existing applications keep
the blocking behavior unless they opt in to both settings below.

```ts
const offlineReadyGuard: CanActivateFn = async () => {
  await inject(OfflineRouteInitializerService).initialize({ remote: 'deferred' });
  return true;
};

createOfflineAuthBridge({
  exchange,
  currentAuthSubject,
  isUnavailableError,
  resumeMode: 'background',
  beforeRemoteResume: () => authenticatedContentReady.wait(),
});
```

`activate` still installs and lease-checks the remotely verified identity before the guard grants
access. Only `resumeRemoteSession()` is deferred. Keep `resumeMode: 'blocking'` when the route needs
the first pull or Outbox replay before it can render safely. A readiness promise should include a
bounded fallback so a deep link that does not render the primary content cannot suspend transport
indefinitely. Always call `startRemoteRuntime()` after that same boundary, including when the
credential exchange falls back to local access. This installs network discovery so an offline start
can recover immediately when connectivity returns. Start the fallback timer only after local access
has been granted; starting it in the local initializer can launch the remote runtime while a slow
credential exchange is still pending.

## Realtime connection

Subclass `KitRealtimeConnection` to supply connection intent and `{ url, protocols }` targets. The kit owns foreground and network suspension, target-scoped reconnect, exponential backoff, ping/pong detection, self-echo annotation, and `reconnected$` resync signaling.

Use `kitRealtimeProtocols()` to carry authentication and the stable `KIT_REALTIME_CLIENT_ID` in WebSocket subprotocols instead of URL parameters. Offline-capable authenticated clients set `requireRemoteAccess: true`; sockets then remain closed in `none` and `local` modes.
