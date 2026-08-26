# Ionic Signal Forms

This entry point targets Angular 22 Signal Forms.

Import Angular's `FormField` together with the kit adapter in each standalone component that binds Signal Forms to Ionic controls.

```ts
import { FormField } from '@angular/forms/signals';
import { KitIonicFormField } from '@rdlabo/ionic-angular-kit/forms';

@Component({
  imports: [FormField, KitIonicFormField],
})
export class ProfilePage {}
```

The adapter copies the first non-empty string validation message to Ionic's `errorText` property for `ion-input`, `ion-textarea`, `ion-select`, `ion-checkbox`, `ion-radio-group`, and `ion-toggle`. Validation wording and localization remain the application's responsibility. An explicit `errorText` or `[errorText]` binding takes precedence and prevents the adapter from being instantiated.

Install the state-class configuration once at application bootstrap:

```ts
import { provideKitIonicSignalForms } from '@rdlabo/ionic-angular-kit/forms';

export const appConfig: ApplicationConfig = {
  providers: [provideKitIonicSignalForms()],
};
```

Angular does not merge multiple `provideSignalFormsConfig` class configurations. If the application provides its own configuration, combine all required class mappings in one provider instead of registering both providers and relying on their order.

When using `@rdlabo/eslint-plugin-rules`, enable its adapter-aware mode only after every relevant standalone component has imported the adapter:

```js
{
  files: ['**/*.html'],
  rules: {
    '@rdlabo/rules/require-ion-error-text': ['error', { formFieldProvidesErrorText: true }],
  },
}
```
