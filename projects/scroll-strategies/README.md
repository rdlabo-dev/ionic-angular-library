# @rdlabo/ngx-cdk-scroll-strategies

> Angular CDK virtual scroll with variable and dynamic item heights.

## Overview

`@rdlabo/ngx-cdk-scroll-strategies` is an Angular CDK virtual scroll strategy for lists with variable item heights. It lets you supply the exact pixel size of every item instead of requiring one fixed `[itemSize]` for the whole list.

Use `[itemDynamicSizes]` with known or measured item heights. Unlike the experimental `[autosize]` strategy, this library does not estimate unmeasured items from an average size. It works with `@angular/cdk/scrolling` and does not depend on Ionic.

## When to use this strategy

Use this library when:

- list items or rows have different heights;
- dynamic item heights can be calculated from data or measured from rendered components;
- `scrollToIndex` and scroll positions must use exact variable-height geometry; or
- a chat UI needs reverse virtual scrolling.

If an item height is not known in advance, measure it and pass the result as shown in [Advanced Usage](https://docs.rdlabo.dev/projects/ngx-cdk-scroll-strategies/docs/advanced). This is not a drop-in strategy that discovers every unknown DOM height automatically.

The basic Angular CDK variable-height virtual scroll setup is:

```html
<cdk-virtual-scroll-viewport
  [itemDynamicSizes]="[{ itemSize: 100 } , { itemSize: 80} , { itemSize: 90 } , { itemSize: 100}]"
>
  <div *cdkVirtualFor="let item of [100, 80, 90, 100]; trackBy: trackByFn" [style.height.px]="item">
    itemSize: {{ item }}
  </div>
</cdk-virtual-scroll-viewport>
```

Use the `[itemDynamicSizes]` directive instead of `[itemSize]` or `[autosize]`. Its value has the type `itemDynamicSize[]`.

Every data item must have one corresponding `itemDynamicSizes` entry in the same order. Each `itemSize` must be a finite number greater than zero. If Angular updates the data and size signals in separate turns, the strategy keeps the last complete geometry until their lengths match; it never estimates unknown heights.

This library is based largely on [Virtual scrolling of content with variable height with Angular](https://dev.to/georgii/virtual-scrolling-of-content-with-variable-height-with-angular-3a52).

## Features

### Choose by scrolling goal

| Goal | Guide |
| --- | --- |
| Specify each item height | [Simple Usage](https://docs.rdlabo.dev/projects/ngx-cdk-scroll-strategies/docs/simple) |
| Measure item components | [Advanced Usage](https://docs.rdlabo.dev/projects/ngx-cdk-scroll-strategies/docs/advanced) |
| Reverse chat-style scrolling | [Reverse Scroll](https://docs.rdlabo.dev/projects/ngx-cdk-scroll-strategies/docs/reverse) |

## Quick start

After [Installation](#installation), bind `[itemDynamicSizes]` instead of `[itemSize]`. See [Simple Usage](https://docs.rdlabo.dev/projects/ngx-cdk-scroll-strategies/docs/simple).

## Installation

```bash
npm install @rdlabo/ngx-cdk-scroll-strategies
```


## Documentation

Start with [Installation](#installation), then pick a guide.

- [Simple Usage](https://docs.rdlabo.dev/projects/ngx-cdk-scroll-strategies/docs/simple) — per-item heights.
- [Advanced Usage](https://docs.rdlabo.dev/projects/ngx-cdk-scroll-strategies/docs/advanced) — measured item components.
- [Reverse Scroll](https://docs.rdlabo.dev/projects/ngx-cdk-scroll-strategies/docs/reverse) — chat-style reverse lists.
- [FAQ](https://docs.rdlabo.dev/projects/ngx-cdk-scroll-strategies/docs/faq) — why not `autosize`.

<!-- rdlabo-docs-omit -->
**Full documentation:** [https://docs.rdlabo.dev/projects/ngx-cdk-scroll-strategies](https://docs.rdlabo.dev/projects/ngx-cdk-scroll-strategies)
<!-- /rdlabo-docs-omit -->
