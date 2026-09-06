---
title: Check your Kit integration with ESLint
---

Keep modal launchers, async action handlers, and form errors consistent as your Ionic Angular app grows. `@rdlabo/eslint-plugin-rules` checks the call patterns that work with `@rdlabo/ionic-angular-kit`.

## Enable the checks you use

In an Ionic Angular 9 app with Angular / Angular ESLint 21–22 configured:

```sh
npm install --save-dev @rdlabo/eslint-plugin-rules@22
```

Merge these entries into `eslint.config.mjs`, retaining your existing checks. They enable four focused rules; choose the ones that match the Kit features in your app.

```js
import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';
import rdlabo from '@rdlabo/eslint-plugin-rules';

export default tseslint.config(
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    processor: angular.processInlineTemplates,
    plugins: { '@rdlabo/rules': rdlabo },
    rules: {
      '@rdlabo/rules/deny-overlay-create': 'error',
      '@rdlabo/rules/prefer-modal-launcher': 'error',
    },
  },
  {
    files: ['**/*.html'],
    languageOptions: { parser: angular.templateParser },
    plugins: { '@rdlabo/rules': rdlabo },
    rules: {
      '@rdlabo/rules/prefer-disable-handler': 'error',
      '@rdlabo/rules/require-ion-error-text': 'error',
    },
  },
);
```

These rules are also included in `rdlabo.configs.recommended`.

## Keep modal creation in a launcher

`deny-overlay-create` reports direct Ionic modal and popover controller creation. `prefer-modal-launcher` checks that `presentModal` calls live in `launch*` functions.

With `overlay` and `DetailPage` from your [overlay setup](./storage-overlays.md), this is reported:

```ts
export const openDetail = () => overlay.presentModal(DetailPage);
```

Use a launcher:

```ts
export const launchDetail = () => overlay.presentModal(DetailPage);
```

## Keep async actions wrapped

`prefer-disable-handler` reports an unwrapped action:

```html
<ion-button type="button" (click)="vm.refresh()">Refresh</ion-button>
```

Expose the Kit's `disableHandler` helper on your component or ViewModel, then pass the event and async work:

```ts
import { disableHandler } from '@rdlabo/ionic-angular-kit';

// Inside the component or ViewModel:
readonly disableHandler = disableHandler;
```

```html
<ion-button type="button" (click)="vm.disableHandler($event, vm.refresh())">Refresh</ion-button>
```

The rule checks the wrapper call, not the async work's behavior. Keep submit actions on the form's `(submit)` with `ion-button type="submit"`.

## Match the Signal Forms adapter

By default, `require-ion-error-text` requires an error text source on Ionic controls with `[formField]`.

For Angular 22 apps using [Kit Signal Forms](./forms.md), import `FormField` and `KitIonicFormField` in each relevant component and install `provideKitIonicSignalForms()`. Then override this entry in the HTML config's `rules`:

```js
'@rdlabo/rules/require-ion-error-text': [
  'error',
  { formFieldProvidesErrorText: true },
],
```

This option declares that the adapter supplies error text; ESLint does not verify the adapter's imports or providers.

## Add ViewModel policy when you use it

If your app uses a `ViewModelStore` architecture, add [require-viewmodel](https://docs.rdlabo.dev/projects/eslint-plugin-rules/docs/rules/require-viewmodel) and [no-component-writable-signal](https://docs.rdlabo.dev/projects/eslint-plugin-rules/docs/rules/no-component-writable-signal). Configure them around your app's ViewModel base; `ViewModelStore` is not a Kit export.

## Run it in CI

After installing dependencies, run locally and in CI:

```sh
npx eslint 'src/**/*.{ts,html}' --max-warnings 0
```

Adjust the source path for your app. See [ESLint configuration](https://docs.rdlabo.dev/projects/eslint-plugin-rules/docs/configuration) for the complete recommended policy and [rule options](https://docs.rdlabo.dev/projects/eslint-plugin-rules/docs/rules) for other conventions.
