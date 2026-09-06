# Ionic Signal Forms

This entry point targets Angular 22 Signal Forms.

Register the adapter once at bootstrap, then bind Signal Forms to Ionic controls with Angular's `FormField` and `KitIonicFormField`:

```ts
import { Component, signal } from '@angular/core';
import type { ApplicationConfig } from '@angular/core';
import { FormField, form, required, email, maxLength } from '@angular/forms/signals';
import { IonInput } from '@ionic/angular';
import { KitIonicFormField, provideKitIonicSignalForms } from '@rdlabo/ionic-angular-kit/forms';

export const appConfig: ApplicationConfig = {
  providers: [provideKitIonicSignalForms()],
};

@Component({
  selector: 'app-profile',
  imports: [FormField, KitIonicFormField, IonInput],
  template: `
    <ion-input label="Name" [formField]="profileForm.name"></ion-input>
    <ion-input label="Email" type="email" [formField]="profileForm.email"></ion-input>
  `,
})
export class ProfilePage {
  readonly profile = signal({ name: '', email: '' });
  readonly profileForm = form(this.profile, (path) => {
    required(path.name);
    email(path.email);
    maxLength(path.name, 200);
  });
}
```

Leave a required field empty and blur it — Ionic shows `errorText`, and the control becomes invalid and touched. The adapter copies the first non-empty explicit validation message to `errorText` for `ion-input`, `ion-textarea`, `ion-select`, `ion-checkbox`, `ion-radio-group`, and `ion-toggle`. When Angular's validator does not provide a message, the adapter derives a generic English message from the validation error `kind` and its constraint metadata. Built-in validators therefore need no message configuration.

Unknown custom error kinds fall back to `Enter a valid value.`. Keep business-rule failures outside field validation. An explicit validation message still takes precedence for compatibility, and an explicit `errorText` or `[errorText]` binding prevents the adapter from being instantiated.

Applications may replace the fallback resolver for localization without changing validator definitions:

```ts
import type { ValidationError } from '@angular/forms/signals';
import { KIT_SIGNAL_FORM_ERROR_MESSAGE_RESOLVER } from '@rdlabo/ionic-angular-kit/forms';

export const appConfig: ApplicationConfig = {
  providers: [
    provideKitIonicSignalForms(),
    {
      provide: KIT_SIGNAL_FORM_ERROR_MESSAGE_RESOLVER,
      useValue: (error: ValidationError) => localizedMessageFor(error),
    },
  ],
};
```

Angular does not merge multiple `provideSignalFormsConfig` class configurations. If the application provides its own configuration, combine all required class mappings in one provider instead of registering both providers and relying on their order.

For the matching lint configuration, see [Check your Kit integration with ESLint](./eslint.md).
