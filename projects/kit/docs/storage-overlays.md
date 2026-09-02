## Typed storage

Provide Ionic Storage once. `KitStorageService` initializes it lazily and every public operation waits for that initialization, so writes made immediately after service creation are not dropped.

```ts
import { importProvidersFrom, type ApplicationConfig } from '@angular/core';
import { IonicStorageModule } from '@ionic/storage-angular';

export const appConfig: ApplicationConfig = {
  providers: [importProvidersFrom(IonicStorageModule.forRoot({ name: '__mydb' }))],
};
```

```ts
import { inject, Injectable } from '@angular/core';
import { KitStorageService } from '@rdlabo/ionic-angular-kit';

@Injectable({ providedIn: 'root' })
export class TokenStore {
  readonly #storage = inject(KitStorageService);

  async save(token: string): Promise<void> {
    await this.#storage.set('token', token);
  }

  get(): Promise<string | null> {
    return this.#storage.get<string>('token');
  }

  remove(): Promise<void> {
    return this.#storage.remove('token');
  }
}
```

`get<T>()` returns `null` for a missing key. `kitClearStoragePreservingKeys()` clears application data while restoring selected values such as the last authentication email or theme.

## Typed overlays

Configure application-owned labels with `provideKitOverlay()` and inject `KitOverlayController`. The kit does not hard-code localized copy.

```ts
provideKitOverlay({
  labels: {
    close: $localize`Close`,
    cancel: $localize`Cancel`,
  },
});
```

```ts
export class DetailPage {
  declare static readonly modalReturn: DetailResult;
  readonly item = input.required<Item>();
}

export const launchDetailPage = (overlay: KitOverlayController, props: { item: Item }): Promise<DetailResult | undefined> =>
  overlay.presentModal(DetailPage, props, { backdropDismiss: false });
```

Component props are inferred from Angular `input()` fields and dismiss data from the component's static `modalReturn` declaration. Keep a typed launcher beside each modal or popover instead of calling an Ionic controller inline.

The same controller provides `presentPopover()`, `presentToast()`, `alertClose()`, and `alertConfirm()`. Modal option `watchKeyboard: true` expands a bottom sheet while the native keyboard is visible.
