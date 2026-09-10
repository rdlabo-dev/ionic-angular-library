Load photos from the browser file picker or, on native platforms, from the camera or album. Call this after [Installation](https://docs.rdlabo.dev/projects/ionic-angular-photo-editor/docs/readme#installation).

## Browser: select and display

`createImageEditor` is required because `loadPhoto` always resizes through the image-editor adapter. Omit `loadCamera` for web-only apps.

```typescript
import { Component, inject, signal } from '@angular/core';
import type { ApplicationConfig } from '@angular/core';
import { IonButton, IonImg } from '@ionic/angular';
import { providePhotoEditor, PhotoLoadError } from '@rdlabo/ionic-angular-photo-editor';
import { createTuiImageEditor } from '@rdlabo/ionic-angular-photo-editor/editor/tui';
import { PhotoFileService } from '@rdlabo/ionic-angular-photo-editor/file';

export const appConfig: ApplicationConfig = {
  providers: [
    providePhotoEditor({
      maxSize: 1000,
      createImageEditor: createTuiImageEditor,
    }),
  ],
};

@Component({
  selector: 'app-photo-pick',
  imports: [IonButton, IonImg],
  template: `
    <ion-button type="button" (click)="pick()">Select photo</ion-button>
    @if (previewUrl()) {
      <ion-img [src]="previewUrl()" alt="Selected photo"></ion-img>
    }
  `,
})
export class PhotoPickPage {
  private readonly photoFileService = inject(PhotoFileService);
  readonly previewUrl = signal('');

  async pick(): Promise<void> {
    try {
      const files = await this.photoFileService.loadPhoto({
        limit: 1,
        maxSize: 1000,
      });
      this.previewUrl.set(files[0] ?? '');
    } catch (error) {
      if (error instanceof PhotoLoadError && error.code === 'cancelled') {
        return;
      }
      throw error;
    }
  }
}
```

## Native camera and album

Install `@capacitor/camera`, configure platform permissions, and register `loadCapacitorPhotoCamera`. On native platforms, an action sheet asks the user to choose camera or album. Per-request `labels` merge over values from `providePhotoEditor({ labels })`.

```typescript
import { providePhotoEditor } from '@rdlabo/ionic-angular-photo-editor';
import { createTuiImageEditor } from '@rdlabo/ionic-angular-photo-editor/editor/tui';
import { loadCapacitorPhotoCamera } from '@rdlabo/ionic-angular-photo-editor/file/capacitor';

export const appConfig = {
  providers: [
    providePhotoEditor({
      maxSize: 1000,
      labels: {
        camera: 'Camera',
        album: 'Album',
        cancel: 'Cancel',
      },
      createImageEditor: createTuiImageEditor,
      loadCamera: loadCapacitorPhotoCamera,
    }),
  ],
};
```

## loadPhoto(options?)

Opens the platform photo picker and returns normalized data URLs.

| Option    | Default                        | Description                                    |
| --------- | ------------------------------ | ---------------------------------------------- |
| `limit`   | `1`                            | Maximum number of images (album and web only). |
| `maxSize` | configured `maxSize` or `1000` | Longest edge in pixels after resize.           |
| `labels`  | configured `labels`            | Action sheet button text (Capacitor only).     |

### Browser behavior

On web, `loadPhoto()` synchronously creates a hidden `<input type="file">`, attaches it to `document.body`, and calls `click()` in the same turn as the caller's gesture. This preserves WebKit transient user activation. The input has no fixed id; it is removed after selection or cancellation.

Do not add a static file input to `index.html`.

### Capacitor behavior

Register `loadCapacitorPhotoCamera` from `/file/capacitor`; the base `/file` entry point stays usable by browser-only applications without `@capacitor/camera`.

### Errors

Expected failures throw `PhotoLoadError`:

| Code           | When                                                     |
| -------------- | -------------------------------------------------------- |
| `cancelled`    | User dismissed the picker or action sheet                |
| `invalid-type` | Selected file is not an image (web only)                 |
| `unavailable`  | Permission, plugin, picker, file-read, or resize failure |

## Default labels (ja)

When no global or per-request `labels` are supplied:

| Key    | Default (ja)     |
| ------ | ---------------- |
| camera | カメラ撮影       |
| album  | アルバムから選択 |
| cancel | キャンセル       |

## providePhotoEditor(config?)

Register application-wide defaults in `app.config.ts`. `PhotoFileService` reads these adapters plus the global `maxSize` and `labels` defaults from this configuration. Per-request values with the same names override them for a single call. A resize requires `createImageEditor`; a native picker requires `loadCamera`. Missing adapters throw `PhotoLoadError` with `code: 'unavailable'`.
