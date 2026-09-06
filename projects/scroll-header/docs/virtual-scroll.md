Extend an existing CDK virtual-scroll viewport with scroll-aware headers. Start from [IonContent](./ion-content.md) for the header/safe-area pattern, then replace the scroll host with a viewport. Call this after [Installation](../README.md#installation).

- Demo: https://rdlabo-ionic-angular-library.netlify.app/main/virtual-scroll-header
- Source: https://github.com/rdlabo-dev/ionic-angular-library/blob/v22.0.0/projects/demo/src/app/virtual-scroll-header/virtual-scroll-header.page.html

```ts
import { Component } from '@angular/core';
import { CdkFixedSizeVirtualScroll, CdkVirtualForOf, CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';
import { VirtualScrollHeaderDirective } from '@rdlabo/ionic-angular-scroll-header';

@Component({
  selector: 'app-virtual-scroll-header',
  imports: [
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    CdkVirtualScrollViewport,
    CdkVirtualForOf,
    CdkFixedSizeVirtualScroll,
    VirtualScrollHeaderDirective,
  ],
  template: `
    <ion-header class="hidden">
      <ion-toolbar></ion-toolbar>
    </ion-header>
    <ion-content rdlaboVirtualScrollHeader>
      <ion-header>
        <ion-toolbar>
          <ion-title>Virtual scroll header</ion-title>
        </ion-toolbar>
      </ion-header>
      <cdk-virtual-scroll-viewport
        minBufferPx="900"
        maxBufferPx="1350"
        [itemSize]="44"
        class="ion-content-scroll-host"
      >
        <div *cdkVirtualFor="let item of items; trackBy: trackByFn" style="height: 44px">
          {{ item }}
        </div>
      </cdk-virtual-scroll-viewport>
    </ion-content>
  `,
})
export class VirtualScrollHeaderPage {
  readonly items = Array.from({ length: 80 }, (_, index) => `Row ${index + 1}`);
  trackByFn = (_: number, item: string) => item;
}
```

Give the viewport a definite height via the global CSS from [Installation](../README.md#installation).

### Prevent scroll jump / flicker at the top

Addresses [angular/components#27104](https://github.com/angular/components/issues/27104) when an existing CDK viewport jumps back while scrolling.

Add the directive to the `imports` of the component above, then add its attribute to the existing viewport. Keep the CDK imports and data from that example.

```ts
import { FixVirtualScrollElementDirective } from '@rdlabo/ionic-angular-scroll-header';

```

```html
<ion-content>
  <cdk-virtual-scroll-viewport
    rdlaboFixVirtualScrollElement
    minBufferPx="900"
    maxBufferPx="1350"
    [itemSize]="44"
    class="ion-content-scroll-host"
  >
    <div *cdkVirtualFor="let item of items; trackBy: trackByFn" style="height: 44px">
      {{ item }}
    </div>
  </cdk-virtual-scroll-viewport>
</ion-content>
```
