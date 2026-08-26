import { Directive, effect, ElementRef, inject, Renderer2 } from '@angular/core';
import { FORM_FIELD } from '@angular/forms/signals';

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

  constructor() {
    effect(() => {
      const message = this.#field
        .errors()
        .map((error) => error.message)
        .find((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0);
      this.#renderer.setProperty(this.#element.nativeElement, 'errorText', message);
    });
  }
}
