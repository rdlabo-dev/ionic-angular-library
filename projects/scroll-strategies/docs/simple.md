Call this after [Installation](https://docs.rdlabo.dev/projects/ngx-cdk-scroll-strategies/docs/readme#installation).

> For items whose variable heights are already known.

- Demo: https://rdlabo-ionic-angular-library.netlify.app/main/scroll-strategies/simple
- Source: https://github.com/rdlabo-dev/ionic-angular-library/tree/v22.0.0/projects/demo/src/app/scroll-strategies/pages/scroll-simple

Give the viewport a definite height in global CSS:

```css
cdk-virtual-scroll-viewport {
  width: 100%;
  height: 320px;
}
```

```ts
import { Component, computed, signal } from '@angular/core';
import { CdkVirtualForOf, CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { CdkDynamicSizeVirtualScroll, itemDynamicSize } from '@rdlabo/ngx-cdk-scroll-strategies';

type Item = itemDynamicSize & { trackId: number };

@Component({
  selector: 'app-scroll-simple',
  imports: [CdkVirtualScrollViewport, CdkVirtualForOf, CdkDynamicSizeVirtualScroll],
  template: `
    <cdk-virtual-scroll-viewport
      [itemDynamicSizes]="dynamicSize()"
      minBufferPx="900"
      maxBufferPx="1350"
    >
      <div
        *cdkVirtualFor="let item of items(); trackBy: trackByFn"
        class="dynamic-item"
        [style.height.px]="item.itemSize"
      >
        itemSize: {{ item.itemSize }}
      </div>
    </cdk-virtual-scroll-viewport>
  `,
})
export class ScrollSimplePage {
  readonly items = signal<Item[]>(
    Array.from({ length: 20 }, (_, index) => ({
      trackId: index,
      itemSize: 40 + (index % 5) * 16,
    })),
  );
  readonly dynamicSize = computed<itemDynamicSize[]>(() =>
    this.items().map((item) => ({ trackId: item.trackId, itemSize: item.itemSize })),
  );
  trackByFn = (_: number, item: Item) => item.trackId;
}
```

Rows use different heights so scrolling changes which sizes stay in view. Other than `[itemDynamicSizes]`, it works the same way as `@angular/cdk/scrolling`.
