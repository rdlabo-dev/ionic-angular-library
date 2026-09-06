# @rdlabo/ionic-angular-photo-editor

Photo editor and viewer modal pages for Ionic Angular applications, with browser file selection and optional Capacitor camera/album support.

## Installation

```bash
npm install @rdlabo/ionic-angular-photo-editor tui-image-editor
```

## Select and display a photo in the browser

Register the TUI resize adapter (required for `loadPhoto` resizing), then pick a file and show the returned data URL:

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
      const files = await this.photoFileService.loadPhoto({ limit: 1 });
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

Click Select photo, choose an image — the preview appears. Native camera/album setup comes later under [PhotoFileService](https://docs.rdlabo.dev/projects/ionic-angular-photo-editor/docs/photo-file).

## Add a viewer or native camera

Install the dependencies for the features you add:

```bash
# viewer
npm install swiper

# native camera and album selection
npm install @capacitor/camera
```

For native camera access, configure [Camera permissions](https://capacitorjs.com/docs/apis/camera#android-configuration) and the adapter in [PhotoFileService](./docs/photo-file.md). Native iOS apps require iOS/iPadOS 16.4 or later.

## Package entry points

| Import path                                         | Exports                                                              |
| --------------------------------------------------- | -------------------------------------------------------------------- |
| `@rdlabo/ionic-angular-photo-editor`                | Types, `providePhotoEditor`, `PHOTO_EDITOR_CONFIG`, `PhotoLoadError` |
| `@rdlabo/ionic-angular-photo-editor/editor`         | `PhotoEditorPage`                                                    |
| `@rdlabo/ionic-angular-photo-editor/editor/tui`     | opt-in `createTuiImageEditor` adapter                                |
| `@rdlabo/ionic-angular-photo-editor/viewer`         | `PhotoViewerPage`                                                    |
| `@rdlabo/ionic-angular-photo-editor/file`           | `PhotoFileService`                                                   |
| `@rdlabo/ionic-angular-photo-editor/file/capacitor` | opt-in `loadCapacitorPhotoCamera` adapter                            |

Import components and services only from their entry point. Import shared types and configuration from the root package.

## Choose by editing goal

| Goal                              | Guide                                                                                                                               |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Load a photo from camera or album | [PhotoFileService](https://docs.rdlabo.dev/projects/ionic-angular-photo-editor/docs/photo-file)                                     |
| Crop and edit in a modal          | [Photo Editor](https://docs.rdlabo.dev/projects/ionic-angular-photo-editor/docs/editor)                                             |
| Browse images in a modal          | [Photo Viewer](https://docs.rdlabo.dev/projects/ionic-angular-photo-editor/docs/viewer)                                             |
| Override editor colors            | [Theme](https://docs.rdlabo.dev/projects/ionic-angular-photo-editor/docs/theme)                                                     |
| Upgrade from an earlier release   | [Migration guide](https://github.com/rdlabo-dev/ionic-angular-library/blob/main/docs/migration.md#rdlaboionic-angular-photo-editor) |

<!-- rdlabo-docs-omit -->

**Full documentation:** [https://docs.rdlabo.dev/projects/ionic-angular-photo-editor](https://docs.rdlabo.dev/projects/ionic-angular-photo-editor)

<!-- /rdlabo-docs-omit -->
