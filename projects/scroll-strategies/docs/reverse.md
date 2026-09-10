Call this after [Installation](https://docs.rdlabo.dev/projects/ngx-cdk-scroll-strategies/docs/readme#installation).

> Reuse the data model, `dynamicSize` computed, `trackBy`, and viewport imports from [Simple Usage](https://docs.rdlabo.dev/projects/ngx-cdk-scroll-strategies/docs/simple). This page adds reverse layout CSS and `[isReverse]="true"` for a chat-style list.

- Demo: https://rdlabo-ionic-angular-library.netlify.app/main/scroll-strategies/reverse
- Source: https://github.com/rdlabo-dev/ionic-angular-library/tree/v22.0.0/projects/demo/src/app/scroll-strategies/pages/scroll-reverse

If reverse scroll, add `isReverse` directive to `cdk-virtual-scroll-viewport` tag.

```html
<cdk-virtual-scroll-viewport
  [itemDynamicSizes]="dynamicSize()"
  [isReverse]="true"
  minBufferPx="900"
  maxBufferPx="1350"
>
  <div class="reverse-items">
    <div
      *cdkVirtualFor="let item of items(); trackBy: trackByFn"
      class="dynamic-item"
      [style.height.px]="item.itemSize"
    >
      itemSize: {{ item.itemSize }}
    </div>
  </div>
</cdk-virtual-scroll-viewport>
```

Add css to `cdk-virtual-scroll-viewport.reverse-scroll` at global css file like `styles.css`.

```css
cdk-virtual-scroll-viewport {
  width: 100%;
  height: 320px;

  /* .reverse-scroll class is added from this directive. */
  &.reverse-scroll {
    display: flex;
    flex-direction: column-reverse;

    .cdk-virtual-scroll-content-wrapper {
      top: auto;
      bottom: 0;
    }
  }
}
```

And add item wrapper. `div.reverse-items` class is example. You can decide this.

```css
div.reverse-items {
  height: 100%;
  display: flex;
  flex-direction: column-reverse;

  position: relative;
  bottom: 0;
}
```

**In Reverse Scroll, CdkVirtualScrollViewport's measureScrollOffset does not work. Please use the scrollOffset of this directive.**
https://github.com/rdlabo-dev/ionic-angular-library/blob/v22.0.0/projects/scroll-strategies/src/lib/dynamic-size-virtual-scroll-strategy.ts

The reverse layout uses negative native `scrollTop` values. `scrollToIndex()` accepts a logical item index as usual and converts its cumulative offset to that native coordinate internally.

### Optional

This package contains a Helper Service that simplifies development with Virtual Scroll.

```ts
import { DynamicSizeVirtualScrollService } from '@rdlabo/ngx-cdk-scroll-strategies';
```

Detail is here: https://github.com/rdlabo-dev/ionic-angular-library/blob/v22.0.0/projects/scroll-strategies/src/lib/dynamic-size-virtual-scroll.service.ts
