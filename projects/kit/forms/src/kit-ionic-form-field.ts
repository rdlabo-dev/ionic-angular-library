import { Directive, effect, ElementRef, inject, Renderer2 } from '@angular/core';
import { FORM_FIELD } from '@angular/forms/signals';
import { KIT_SIGNAL_FORM_ERROR_MESSAGE_RESOLVER } from './kit-signal-form-error-message';

@Directive({
  // Angular's FormField owns [formField]. This sibling directive only adapts its validation message to Ionic.
  selector: `
    ion-input[formField]:not([errorText]),
    ion-textarea[formField]:not([errorText]),
    ion-select[formField]:not([errorText]),
    ion-checkbox[formField]:not([errorText]),
    ion-radio-group[formField]:not([errorText]),
    ion-toggle[formField]:not([errorText])
  `,
})
export class KitIonicFormField {
  readonly #field = inject(FORM_FIELD, { self: true });
  readonly #element = inject(ElementRef<HTMLElement>);
  readonly #renderer = inject(Renderer2);
  readonly #resolveErrorMessage = inject(KIT_SIGNAL_FORM_ERROR_MESSAGE_RESOLVER);

  constructor() {
    effect(() => {
      const message = this.#field
        .errors()
        .map((error) => {
          if (typeof error.message === 'string' && error.message.trim().length > 0) {
            return error.message;
          }
          return this.#resolveErrorMessage(error);
        })
        .find((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0);
      this.#renderer.setProperty(this.#element.nativeElement, 'errorText', message);
    });
  }
}
