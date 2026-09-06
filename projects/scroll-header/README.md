# @rdlabo/ionic-angular-scroll-header

Directives that hide and reveal Ionic headers while scrolling.

## Installation

```bash
npm install @rdlabo/ionic-angular-scroll-header
```

Import the directive CSS globally (for example in `styles.css`):

```css
@import '@rdlabo/ionic-angular-scroll-header/css/scroll-header.directive.css';
```

When using CDK virtual scroll, also set a bounded viewport:

```css
cdk-virtual-scroll-viewport {
  width: 100%;
  height: 100%;
  .cdk-virtual-scroll-content-wrapper {
    padding-top: inherit;
  }
}
```

## First success: IonContent

Build a page with enough scrollable rows and a header that can leave the viewport. See the complete example on [IonContent](https://docs.rdlabo.dev/projects/ionic-angular-scroll-header/docs/ion-content).

Scroll down — the content header hides. Scroll up — it returns. Safe-area and always-visible native headers are covered on [Safe Area](https://docs.rdlabo.dev/projects/ionic-angular-scroll-header/docs/safe-area). CDK viewports use [Virtual Scroll](https://docs.rdlabo.dev/projects/ionic-angular-scroll-header/docs/virtual-scroll).

## Choose by header layout

| Goal | Guide |
| --- | --- |
| Hide and reveal headers on IonContent | [IonContent](https://docs.rdlabo.dev/projects/ionic-angular-scroll-header/docs/ion-content) |
| Coordinate headers with CDK virtual scroll | [Virtual Scroll](https://docs.rdlabo.dev/projects/ionic-angular-scroll-header/docs/virtual-scroll) |
| Keep a native header always visible | [Safe Area](https://docs.rdlabo.dev/projects/ionic-angular-scroll-header/docs/safe-area) |

<!-- rdlabo-docs-omit -->
**Full documentation:** [https://docs.rdlabo.dev/projects/ionic-angular-scroll-header](https://docs.rdlabo.dev/projects/ionic-angular-scroll-header)
<!-- /rdlabo-docs-omit -->
