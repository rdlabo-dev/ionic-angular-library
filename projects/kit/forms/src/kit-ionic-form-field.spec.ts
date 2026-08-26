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
    <ion-input [formField]="fields.explicit" errorText="Cross-field error"></ion-input>
    <ion-input [formField]="fields.explicit" [errorText]="boundError"></ion-input>
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
    explicit: '',
  });
  readonly fields = form(this.model, (path) => {
    validate(path.input, ({ value }) =>
      value() ? undefined : { kind: 'non-string', message: 123 as unknown as string },
    );
    validate(path.input, ({ value }) => (value() ? undefined : { kind: 'empty', message: '  ' }));
    required(path.input, { message: 'Input required' });
    required(path.textarea, { message: 'Textarea required' });
    required(path.select, { message: 'Select required' });
    required(path.checkbox, { message: 'Checkbox required' });
    required(path.radio, { message: 'Radio required' });
    required(path.toggle, { message: 'Toggle required' });
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
        .slice(0, 6)
        .map((element: { errorText?: string }) => element.errorText),
    ).toEqual(['Input required', 'Textarea required', 'Select required', 'Checkbox required', 'Radio required', 'Toggle required']);
    expect(fixture.nativeElement.querySelectorAll('ion-input')[1].errorText).toBe('Cross-field error');
    expect(fixture.nativeElement.querySelectorAll('ion-input')[2].errorText).toBe('Bound cross-field error');

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
