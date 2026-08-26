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

The adapter copies the first non-empty explicit validation message to Ionic's `errorText` property for `ion-input`, `ion-textarea`, `ion-select`, `ion-checkbox`, `ion-radio-group`, and `ion-toggle`. When Angular's validator does not provide a message, the adapter derives a generic English message from the validation error `kind` and its constraint metadata. Built-in validators therefore need no message configuration:

```ts
readonly profileForm = form(this.profile, (path) => {
  required(path.name);
  email(path.email);
  maxLength(path.name, 200);
});
```

Unknown custom error kinds fall back to `Enter a valid value.`. Keep business-rule failures outside field validation. An explicit validation message still takes precedence for compatibility, and an explicit `errorText` or `[errorText]` binding prevents the adapter from being instantiated.

Applications may replace the fallback resolver for localization without changing validator definitions:

```ts
import type { ValidationError } from '@angular/forms/signals';
import { KIT_SIGNAL_FORM_ERROR_MESSAGE_RESOLVER } from '@rdlabo/ionic-angular-kit/forms';

export const appConfig: ApplicationConfig = {
  providers: [
    {
      provide: KIT_SIGNAL_FORM_ERROR_MESSAGE_RESOLVER,
      useValue: (error: ValidationError) => localizedMessageFor(error),
    },
  ],
};
```

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
