type DisableableElement = HTMLElement & { disabled: boolean };
interface DisableState {
  count: number;
  original: boolean;
}

const disableStates = new WeakMap<DisableableElement, DisableState>();

const isDisableable = (element: EventTarget | null): element is DisableableElement =>
  element instanceof HTMLElement && 'disabled' in element;

const getIonicSubmitButtons = (form: HTMLFormElement): DisableableElement[] =>
  Array.from(document.querySelectorAll<HTMLElement>('ion-button[type="submit"]')).filter((button): button is DisableableElement => {
    if (!isDisableable(button)) return false;

    const associatedForm = (button as HTMLElement & { form?: HTMLFormElement | string }).form;
    return (
      associatedForm === form ||
      (typeof associatedForm === 'string' && associatedForm === form.id) ||
      (form.id !== '' && button.getAttribute('form') === form.id) ||
      button.closest('form') === form
    );
  });

const getDisableTargets = (event: Event): DisableableElement[] => {
  const submitter = 'submitter' in event ? (event as SubmitEvent).submitter : null;
  const form = event.target instanceof HTMLFormElement ? event.target : null;
  const targets: DisableableElement[] = [];

  if (event.type === 'submit' && form) {
    targets.push(...getIonicSubmitButtons(form));
  }

  if (isDisableable(submitter)) {
    const root = submitter.getRootNode();
    const target = root instanceof ShadowRoot ? root.host : submitter;
    if (isDisableable(target)) targets.push(target);
  }

  if (targets.length === 0 && isDisableable(event.currentTarget)) targets.push(event.currentTarget);
  if (targets.length === 0 && isDisableable(event.target)) targets.push(event.target);
  return [...new Set(targets)];
};

const acquireDisableTarget = (target: DisableableElement): void => {
  const state = disableStates.get(target);
  if (state) {
    state.count += 1;
    return;
  }
  disableStates.set(target, { count: 1, original: target.disabled });
  target.disabled = true;
};

const releaseDisableTarget = (target: DisableableElement): void => {
  const state = disableStates.get(target);
  if (!state) return;
  state.count -= 1;
  if (state.count > 0) return;
  target.disabled = state.original;
  disableStates.delete(target);
};

/**
 * Disable the controls that triggered an event while an async operation runs.
 *
 * @remarks
 * For a click event, the clicked control is disabled. For a submit event, the submitter is
 * disabled and the browser's default form navigation is prevented. Ionic's external
 * `ion-button[form]` uses a hidden native submitter, so buttons associated with the submitted form
 * are resolved through their `form` property and disabled instead. Rejections are swallowed so
 * controls always recover; handle errors inside `work` when the caller needs to react.
 *
 * @param event - The click or submit event that triggered the operation.
 * @param work - The operation result. Promise-like work keeps controls disabled until it settles;
 * void work still shares this entry point and submit prevention without a synthetic async boundary.
 * @returns A Promise for asynchronous work, otherwise void.
 * @example
 * ```html
 * <form #formRef (submit)="helper.disableHandler($event, save())"></form>
 * <ion-button type="submit" [form]="formRef">Save</ion-button>
 * ```
 */
export function disableHandler(event: Event, work: void): void;
export function disableHandler(event: Event, work: PromiseLike<unknown>): Promise<void>;
export function disableHandler(event: Event, work: void | PromiseLike<unknown>): void | Promise<void>;
export function disableHandler(event: Event, work: void | PromiseLike<unknown>): void | Promise<void> {
  if (event.type === 'submit') event.preventDefault();

  if (work === undefined) return;

  const targets = getDisableTargets(event);
  targets.forEach(acquireDisableTarget);

  const restore = () => targets.forEach(releaseDisableTarget);
  return new Promise<unknown>((resolve) => resolve(work)).then(restore, restore);
}
