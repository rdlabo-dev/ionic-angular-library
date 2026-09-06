Call this after [Installation](../README.md#installation). Reuse the [Simple Usage](./simple.md) viewport, CDK imports, `trackBy`, and size-model rules. Replace known `itemSize` values with measured heights.

> Measure each scroll item as a separate component, then write the result into the size model that drives `[itemDynamicSizes]`.

- Demo: https://rdlabo-ionic-angular-library.netlify.app/main/scroll-strategies/advanced
- Source: https://github.com/rdlabo-dev/ionic-angular-library/tree/v22.0.0/projects/demo/src/app/scroll-strategies/pages/scroll-advanced

Keep a measurement cache keyed by `trackId`. After the item renders, read its height and update the cache. A parent `computed` maps items to `itemDynamicSize[]`, using the cache when present and a temporary estimate until the first measurement lands:

```ts
import { afterRenderEffect, Component, computed, ElementRef, inject, Injectable, input, signal, untracked } from '@angular/core';
import { CdkVirtualForOf, CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { CdkDynamicSizeVirtualScroll, itemDynamicSize } from '@rdlabo/ngx-cdk-scroll-strategies';

type Row = { trackId: string; body: string };
type SizeCache = { trackId: string; itemSize: number };

@Injectable()
export class RowSizeCache {
  readonly entries = signal<SizeCache[]>([]);
}

@Component({
  selector: 'app-measured-row',
  template: `<div class="row">{{ item().body }}</div>`,
  styles: `:host { display: block; } .row { white-space: pre-wrap; padding: 12px; }`,
})
export class MeasuredRow {
  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly sizes = inject(RowSizeCache);
  readonly item = input.required<Row>();

  constructor() {
    afterRenderEffect((onCleanup) => {
      const trackId = this.item().trackId;
      const element = this.el.nativeElement;
      const measure = () => {
        const itemSize = Math.ceil(element.getBoundingClientRect().height);
        if (itemSize <= 0) return;
        untracked(() => this.sizes.entries.update((cache) => {
          const previous = cache.find((entry) => entry.trackId === trackId);
          if (previous?.itemSize === itemSize) return cache;
          return [...cache.filter((entry) => entry.trackId !== trackId), { trackId, itemSize }];
        }));
      };
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      measure();
      onCleanup(() => observer.disconnect());
    });
  }
}

@Component({
  selector: 'app-scroll-advanced',
  providers: [RowSizeCache],
  styles: `cdk-virtual-scroll-viewport { height: 320px; width: 100%; }`,
  imports: [CdkVirtualScrollViewport, CdkVirtualForOf, CdkDynamicSizeVirtualScroll, MeasuredRow],
  template: `
    <cdk-virtual-scroll-viewport
      [itemDynamicSizes]="dynamicSize()"
      minBufferPx="900"
      maxBufferPx="1350"
    >
      <app-measured-row
        *cdkVirtualFor="let item of items(); trackBy: trackByFn"
        [item]="item"
      />
    </cdk-virtual-scroll-viewport>
  `,
})
export class ScrollAdvancedPage {
  private readonly sizes = inject(RowSizeCache);
  readonly items = signal<Row[]>(
    Array.from({ length: 20 }, (_, index) => ({
      trackId: String(index),
      body: `Row ${index + 1}\n`.repeat(1 + (index % 4)),
    })),
  );
  readonly dynamicSize = computed<itemDynamicSize[]>(() =>
    this.items().map((item) => {
      const cached = this.sizes.entries().find((entry) => entry.trackId === item.trackId)?.itemSize;
      return {
        trackId: item.trackId,
        itemSize: cached ?? 80,
        source: cached === undefined ? 'temporary' : 'cache',
      };
    }),
  );
  trackByFn = (_: number, item: Row) => item.trackId;
}
```

Each `itemSize` must remain a finite number greater than zero. Until measurement arrives, pass a temporary positive estimate so lengths stay aligned; replace it when the cache updates. See the demo source for Infinite Scroll, refresher, and `DynamicSizeVirtualScrollService` helpers around this same measurement flow.
