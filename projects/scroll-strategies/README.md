# @rdlabo/ngx-cdk-scroll-strategies

> Angular CDK virtual scroll with variable and dynamic item heights.

`@rdlabo/ngx-cdk-scroll-strategies` is an Angular CDK virtual scroll strategy for lists with variable item heights. It lets you supply the exact pixel size of every item instead of requiring one fixed `[itemSize]` for the whole list.

Use `[itemDynamicSizes]` with known or measured item heights. Unlike the experimental `[autosize]` strategy, this library does not estimate unmeasured items from an average size. It works with `@angular/cdk/scrolling` and does not depend on Ionic.

## Installation

```bash
npm install @rdlabo/ngx-cdk-scroll-strategies
```

Then follow [Simple Usage](https://docs.rdlabo.dev/projects/ngx-cdk-scroll-strategies/docs/simple) for a complete viewport with known heights.

Every data item must have one corresponding `itemDynamicSizes` entry in the same order. Each `itemSize` must be a finite number greater than zero. If Angular updates the data and size signals in separate turns, the strategy keeps the last complete geometry until their lengths match; it never estimates unknown heights.

## When to use this strategy

Use this library when:

- list items or rows have different heights;
- dynamic item heights can be calculated from data or measured from rendered components;
- `scrollToIndex` and scroll positions must use exact variable-height geometry; or
- a chat UI needs reverse virtual scrolling.

If an item height is not known in advance, measure it and pass the result as shown in [Advanced Usage](https://docs.rdlabo.dev/projects/ngx-cdk-scroll-strategies/docs/advanced). This is not a drop-in strategy that discovers every unknown DOM height automatically.

This library is based largely on [Virtual scrolling of content with variable height with Angular](https://dev.to/georgii/virtual-scrolling-of-content-with-variable-height-with-angular-3a52).

## Choose by scrolling goal

| Goal | Guide |
| --- | --- |
| Specify each item height | [Simple Usage](https://docs.rdlabo.dev/projects/ngx-cdk-scroll-strategies/docs/simple) |
| Measure item components | [Advanced Usage](https://docs.rdlabo.dev/projects/ngx-cdk-scroll-strategies/docs/advanced) |
| Reverse chat-style scrolling | [Reverse Scroll](https://docs.rdlabo.dev/projects/ngx-cdk-scroll-strategies/docs/reverse) |

<!-- rdlabo-docs-omit -->
**Full documentation:** [https://docs.rdlabo.dev/projects/ngx-cdk-scroll-strategies](https://docs.rdlabo.dev/projects/ngx-cdk-scroll-strategies)
<!-- /rdlabo-docs-omit -->
