# @rdlabo/ionic-angular-scroll-header

## Overview

This is directive for scroll with Header.

## Features

### Choose by header layout

| Goal | Guide |
| --- | --- |
| Hide and reveal headers on IonContent | [IonContent](https://docs.rdlabo.dev/projects/ionic-angular-scroll-header/docs/ion-content) |
| Coordinate headers with CDK virtual scroll | [Virtual Scroll](https://docs.rdlabo.dev/projects/ionic-angular-scroll-header/docs/virtual-scroll) |
| Keep a native header always visible | [Safe Area](https://docs.rdlabo.dev/projects/ionic-angular-scroll-header/docs/safe-area) |

## Quick start

After [Installation](#installation), attach the directive to `ion-content`. See [IonContent](https://docs.rdlabo.dev/projects/ionic-angular-scroll-header/docs/ion-content).

## Installation

```bash
npm install @rdlabo/ionic-angular-scroll-header
```

And import CSS for directive:

```diff
+ @import '@rdlabo/ionic-angular-scroll-header/css/scroll-header.directive.css';

+ /* If you use cdk virtual scroll */
+ cdk-virtual-scroll-viewport {
+   width: 100%;
+   height: 100%;
+   .cdk-virtual-scroll-content-wrapper {
+     padding-top: inherit;
+   }
+ }
```


## Documentation

Start with [Installation](#installation), then pick a guide.

- [IonContent](https://docs.rdlabo.dev/projects/ionic-angular-scroll-header/docs/ion-content) — scroll-aware Ionic headers.
- [Virtual Scroll](https://docs.rdlabo.dev/projects/ionic-angular-scroll-header/docs/virtual-scroll) — CDK viewports and the flicker fix.
- [Safe Area](https://docs.rdlabo.dev/projects/ionic-angular-scroll-header/docs/safe-area) — hidden and native headers.

<!-- rdlabo-docs-omit -->
**Full documentation:** [https://docs.rdlabo.dev/projects/ionic-angular-scroll-header](https://docs.rdlabo.dev/projects/ionic-angular-scroll-header)
<!-- /rdlabo-docs-omit -->
