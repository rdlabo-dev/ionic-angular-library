Attach scroll-aware headers to Ionic content. Call this after [Installation](https://docs.rdlabo.dev/projects/ionic-angular-scroll-header/docs/readme#installation). Import the package CSS globally first. Safe-area hidden headers and always-visible native headers are covered on [Safe Area](https://docs.rdlabo.dev/projects/ionic-angular-scroll-header/docs/safe-area).

- Demo: https://rdlabo-ionic-angular-library.netlify.app/main/scroll-header
- Source: https://github.com/rdlabo-dev/ionic-angular-library/blob/v22.0.0/projects/demo/src/app/scroll-header/scroll-header.page.html

```ts
import { Component } from '@angular/core';
import { IonContent, IonHeader, IonItem, IonLabel, IonList, IonTitle, IonToolbar } from '@ionic/angular';
import { ScrollHeaderDirective } from '@rdlabo/ionic-angular-scroll-header';

@Component({
  selector: 'app-scroll-header',
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonList, IonItem, IonLabel, ScrollHeaderDirective],
  template: `
    <ion-header class="hidden">
      <ion-toolbar></ion-toolbar>
    </ion-header>
    <ion-content rdlaboScrollHeader>
      <ion-header>
        <ion-toolbar>
          <ion-title>Scroll header</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-list>
        @for (item of items; track item) {
          <ion-item>
            <ion-label>{{ item }}</ion-label>
          </ion-item>
        }
      </ion-list>
    </ion-content>
  `,
})
export class ScrollHeaderPage {
  readonly items = Array.from({ length: 40 }, (_, index) => `Row ${index + 1}`);
}
```

Scroll down — the content header hides. Scroll up — it returns. The outer `ion-header.hidden` reserves safe-area space; see [Safe Area](https://docs.rdlabo.dev/projects/ionic-angular-scroll-header/docs/safe-area) when you need a different header layout.
