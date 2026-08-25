### Does Angular CDK virtual scroll support variable or dynamic item heights?

The standard `[itemSize]` strategy assumes that every item has the same fixed size. Use this library's `[itemDynamicSizes]` directive to provide a different known or measured height for each item.

### How is this different from the `autosize` strategy?

Angular CDK Experimental's `autosize` strategy measures rendered items and estimates unmeasured items from the average item size. `[itemDynamicSizes]` calculates scroll ranges and offsets from the per-item sizes supplied by your application.

https://github.com/angular/components/blob/main/src/cdk-experimental/scrolling/auto-size-virtual-scroll.ts#L49C3-L59

When each item height is known or can be measured after rendering, this avoids average-size estimation and keeps the virtual scroll geometry exact.

### Does this set a dynamic height on `cdk-virtual-scroll-viewport` itself?

No. This library handles variable heights for the items inside the viewport. Setting the viewport container's own height or `max-height` based on its content is a separate problem.
