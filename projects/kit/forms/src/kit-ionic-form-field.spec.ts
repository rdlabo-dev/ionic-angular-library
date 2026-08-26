import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, FormField, required, validate } from '@angular/forms/signals';
import { IonCheckbox, IonInput, IonRadioGroup, IonSelect, IonTextarea, IonToggle } from '@ionic/angular';
import { KitIonicFormField } from './kit-ionic-form-field';
import { provideKitIonicSignalForms } from './provide-kit-ionic-signal-forms';

@Component({
  imports: [FormField, KitIonicFormField, IonInput, IonTextarea, IonSelect, IonCheckbox, IonRadioGroup, IonToggle],
  template: `
    <input [formField]="fields.native" />
    <ion-input [formField]="fields.input"></ion-input>
    <ion-textarea [formField]="fields.textarea"></ion-textarea>
    <ion-select [formField]="fields.select"></ion-select>
    <ion-checkbox [formField]="fields.checkbox"></ion-checkbox>
    <ion-radio-group [formField]="fields.radio"></ion-radio-group>
    <ion-toggle [formField]="fields.toggle"></ion-toggle>
    <ion-input [formField]="fields.custom"></ion-input>
    <ion-input [formField]="fields.unknown"></ion-input>
    <ion-input data-testid="static-error" [formField]="fields.explicit" errorText="Cross-field error"></ion-input>
    <ion-input data-testid="bound-error" [formField]="fields.explicit" [errorText]="boundError"></ion-input>
  `,
})
class Host {
  readonly boundError = 'Bound cross-field error';
  readonly model = signal({
    native: '',
    input: '',
    textarea: '',
    select: '',
    checkbox: false,
    radio: '',
    toggle: false,
    custom: '',
    unknown: '',
    explicit: '',
  });
  readonly fields = form(this.model, (path) => {
    required(path.input);
    required(path.textarea);
    required(path.select);
    required(path.checkbox);
    required(path.radio);
    required(path.toggle);
    required(path.custom, { message: 'Localized required' });
    validate(path.unknown, ({ value }) => (value() ? undefined : { kind: 'domain-error' }));
    required(path.explicit, { message: 'Generated error' });
  });
}

describe('KitIonicFormField', () => {
  it('adapts all supported Ionic controls without replacing Angular FormField', () => {
    TestBed.configureTestingModule({ providers: [...provideKitIonicSignalForms()] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    expect(
      [...fixture.nativeElement.querySelectorAll('ion-input, ion-textarea, ion-select, ion-checkbox, ion-radio-group, ion-toggle')]
        .slice(0, 8)
        .map((element: { errorText?: string }) => element.errorText),
    ).toEqual([
      'This field is required.',
      'This field is required.',
      'This field is required.',
      'This field is required.',
      'This field is required.',
      'This field is required.',
      'Localized required',
      'Enter a valid value.',
    ]);
    expect(fixture.nativeElement.querySelector('[data-testid="static-error"]').errorText).toBe('Cross-field error');
    expect(fixture.nativeElement.querySelector('[data-testid="bound-error"]').errorText).toBe('Bound cross-field error');

    const input = fixture.nativeElement.querySelector('ion-input');
    expect(input.classList.contains('ion-invalid')).toBe(true);
    expect(input.classList.contains('ng-invalid')).toBe(true);
    input.dispatchEvent(new CustomEvent('ionBlur'));
    fixture.detectChanges();
    expect(input.classList.contains('ion-touched')).toBe(true);

    fixture.componentInstance.model.update((value) => ({ ...value, input: 'value' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('ion-input').errorText).toBeUndefined();
    expect(input.classList.contains('ion-valid')).toBe(true);
    expect(input.classList.contains('ng-valid')).toBe(true);
    expect(fixture.nativeElement.querySelector('input').getAttribute('errorText')).toBeNull();
  });
});
