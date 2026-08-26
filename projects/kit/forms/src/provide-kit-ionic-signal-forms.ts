import { provideSignalFormsConfig } from '@angular/forms/signals';

/** Adds Angular and Ionic validity state classes to Signal Forms controls. */
export const provideKitIonicSignalForms = () =>
  provideSignalFormsConfig({
    classes: {
      'ng-dirty': ({ state }) => state().dirty(),
      'ng-invalid': ({ state }) => state().invalid(),
      'ng-pending': ({ state }) => state().pending(),
      'ng-pristine': ({ state }) => !state().dirty(),
      'ng-touched': ({ state }) => state().touched(),
      'ng-untouched': ({ state }) => !state().touched(),
      'ng-valid': ({ state }) => state().valid(),
      'ion-invalid': ({ state }) => state().invalid(),
      'ion-touched': ({ state }) => state().touched(),
      'ion-valid': ({ state }) => state().valid(),
    },
  });
