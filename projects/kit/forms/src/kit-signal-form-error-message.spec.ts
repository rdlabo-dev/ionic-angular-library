import {
  emailError,
  maxDateError,
  maxError,
  maxLengthError,
  minDateError,
  minError,
  minLengthError,
  patternError,
  requiredError,
} from '@angular/forms/signals';
import { kitDefaultSignalFormErrorMessage } from './kit-signal-form-error-message';

describe('kitDefaultSignalFormErrorMessage', () => {
  it.each([
    [requiredError(), 'This field is required.'],
    [emailError(), 'Enter a valid email address.'],
    [minError(2), 'Enter a value of at least 2.'],
    [maxError(5), 'Enter a value of no more than 5.'],
    [minLengthError(3), 'Enter at least 3 characters.'],
    [maxLengthError(10), 'Enter no more than 10 characters.'],
    [minDateError(new Date('2026-01-02T00:00:00.000Z')), 'Enter a date on or after 2026-01-02.'],
    [maxDateError(new Date('2026-12-31T00:00:00.000Z')), 'Enter a date on or before 2026-12-31.'],
    [minDateError(new Date(Number.NaN)), 'Enter a date on or after a valid date.'],
    [patternError(/\d+/u), 'Enter a value in the required format.'],
    [{ kind: 'custom' }, 'Enter a valid value.'],
  ])('resolves $kind without a configured message', (error, expected) => {
    expect(kitDefaultSignalFormErrorMessage(error)).toBe(expected);
  });
});
