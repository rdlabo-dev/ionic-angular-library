import { InjectionToken } from '@angular/core';
import type {
  MaxLengthValidationError,
  MaxValidationError,
  MinLengthValidationError,
  MinValidationError,
  ValidationError,
} from '@angular/forms/signals';

export type KitSignalFormErrorMessageResolver = (error: ValidationError) => string | undefined;

const formatDate = (value: Date): string => (Number.isNaN(value.getTime()) ? 'a valid date' : value.toISOString().slice(0, 10));

/** Resolves Angular Signal Forms built-in validation errors to generic English messages. */
export const kitDefaultSignalFormErrorMessage: KitSignalFormErrorMessageResolver = (error) => {
  switch (error.kind) {
    case 'required':
      return 'This field is required.';
    case 'email':
      return 'Enter a valid email address.';
    case 'min':
      return `Enter a value of at least ${(error as MinValidationError).min}.`;
    case 'max':
      return `Enter a value of no more than ${(error as MaxValidationError).max}.`;
    case 'minLength':
      return `Enter at least ${(error as MinLengthValidationError).minLength} characters.`;
    case 'maxLength':
      return `Enter no more than ${(error as MaxLengthValidationError).maxLength} characters.`;
    case 'minDate':
      return `Enter a date on or after ${formatDate((error as ValidationError & { minDate: Date }).minDate)}.`;
    case 'maxDate':
      return `Enter a date on or before ${formatDate((error as ValidationError & { maxDate: Date }).maxDate)}.`;
    case 'pattern':
      return 'Enter a value in the required format.';
    case 'parse':
      return 'Enter a valid value.';
    default:
      return 'Enter a valid value.';
  }
};

/** Override to localize or otherwise customize Signal Forms fallback messages. */
export const KIT_SIGNAL_FORM_ERROR_MESSAGE_RESOLVER = new InjectionToken<KitSignalFormErrorMessageResolver>(
  'KIT_SIGNAL_FORM_ERROR_MESSAGE_RESOLVER',
  {
    providedIn: 'root',
    factory: () => kitDefaultSignalFormErrorMessage,
  },
);
