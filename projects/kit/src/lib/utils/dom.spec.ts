import { disableHandler } from './dom';

const nextMicrotask = (): Promise<void> => new Promise((resolve) => queueMicrotask(resolve));

describe('disableHandler', () => {
  function clickEvent() {
    const button = document.createElement('button');
    return { button, event: { target: button } as unknown as Event };
  }

  it('disables the button while the work runs and re-enables it after', async () => {
    const { button, event } = clickEvent();
    let disabledDuringWork = false;
    const work = (async () => {
      await nextMicrotask();
      disabledDuringWork = button.disabled;
    })();
    await disableHandler(event, work);
    expect(disabledDuringWork).toBe(true);
    expect(button.disabled).toBe(false);
  });

  it('re-enables the button even when the work rejects', async () => {
    const { button, event } = clickEvent();
    const result: Promise<void> = disableHandler(event, Promise.reject(new Error('boom')));
    await expect(result).resolves.toBeUndefined();
    expect(button.disabled).toBe(false);
  });

  it('restores the button when reading a foreign thenable throws', async () => {
    const { button, event } = clickEvent();
    const work = Object.defineProperty({}, 'then', {
      get: () => {
        throw new Error('invalid thenable');
      },
    }) as PromiseLike<void>;

    await expect(disableHandler(event, work)).resolves.toBeUndefined();
    expect(button.disabled).toBe(false);
  });

  it('keeps the button disabled until overlapping work has settled', async () => {
    const { button, event } = clickEvent();
    let finishFirst!: () => void;
    let finishSecond!: () => void;
    const first = new Promise<void>((resolve) => (finishFirst = resolve));
    const second = new Promise<void>((resolve) => (finishSecond = resolve));

    const firstResult = disableHandler(event, first);
    const secondResult = disableHandler(event, second);
    finishFirst();
    await firstResult;

    expect(button.disabled).toBe(true);

    finishSecond();
    await secondResult;
    expect(button.disabled).toBe(false);
  });

  it('restores an initially disabled button after overlapping work settles in reverse order', async () => {
    const { button, event } = clickEvent();
    button.disabled = true;
    let finishFirst!: () => void;
    let rejectSecond!: (reason: unknown) => void;
    const first = new Promise<void>((resolve) => (finishFirst = resolve));
    const second = new Promise<void>((_, reject) => (rejectSecond = reject));

    const firstResult = disableHandler(event, first);
    const secondResult = disableHandler(event, second);
    rejectSecond(new Error('second failed'));
    await secondResult;

    expect(button.disabled).toBe(true);

    finishFirst();
    await firstResult;
    expect(button.disabled).toBe(true);
  });

  it('accepts work whose type can be either synchronous or asynchronous', async () => {
    const { event } = clickEvent();
    const invoke = (work: void | PromiseLike<void>): void | Promise<void> => disableHandler(event, work);

    await invoke(nextMicrotask());
  });

  it('supports thenables without requiring a finally method', async () => {
    const { button, event } = clickEvent();
    const pending = nextMicrotask();
    const work: PromiseLike<void> = {
      then: pending.then.bind(pending),
    };

    const result = disableHandler(event, work);

    expect(button.disabled).toBe(true);
    await result;
    expect(button.disabled).toBe(false);
  });

  it('accepts synchronous click work without changing the disabled state', () => {
    const { button, event } = clickEvent();

    const result: void = disableHandler(event, undefined);

    expect(result).toBeUndefined();
    expect(button.disabled).toBe(false);
  });

  it('uses the current target when a nested element is clicked', async () => {
    const button = document.createElement('button');
    const icon = document.createElement('span');
    button.appendChild(icon);
    const event = { target: icon, currentTarget: button } as unknown as Event;

    const result = disableHandler(event, nextMicrotask());
    expect(button.disabled).toBe(true);
    await result;
    expect(button.disabled).toBe(false);
  });

  it('restores a detached target after work settles', async () => {
    const { button, event } = clickEvent();
    document.body.appendChild(button);
    const result = disableHandler(event, nextMicrotask());
    button.remove();

    await result;
    expect(button.disabled).toBe(false);
  });

  it('prevents form navigation for synchronous submit work', () => {
    const form = document.createElement('form');
    const preventDefault = vi.fn();
    const event = { type: 'submit', target: form, currentTarget: form, preventDefault } as unknown as SubmitEvent;

    const result = disableHandler(event, undefined);

    expect(result).toBeUndefined();
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it('prevents form navigation and disables a native submitter', async () => {
    const form = document.createElement('form');
    const button = document.createElement('button');
    button.type = 'submit';
    form.appendChild(button);
    const preventDefault = vi.fn();
    const event = {
      type: 'submit',
      target: form,
      currentTarget: form,
      submitter: button,
      preventDefault,
    } as unknown as SubmitEvent;
    let disabledDuringWork = false;

    const work = (async () => {
      await nextMicrotask();
      disabledDuringWork = button.disabled;
    })();
    await disableHandler(event, work);

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(disabledDuringWork).toBe(true);
    expect(button.disabled).toBe(false);
  });

  it('disables an external ion-button associated with the submitted form', async () => {
    const form = document.createElement('form');
    const proxy = document.createElement('button');
    proxy.type = 'submit';
    proxy.style.display = 'none';
    form.appendChild(proxy);
    const ionButton = document.createElement('ion-button') as HTMLElement & {
      disabled: boolean;
      form: HTMLFormElement;
    };
    ionButton.setAttribute('type', 'submit');
    ionButton.disabled = false;
    ionButton.form = form;
    document.body.append(form, ionButton);
    const event = {
      type: 'submit',
      target: form,
      currentTarget: form,
      submitter: proxy,
      preventDefault: vi.fn(),
    } as unknown as SubmitEvent;
    let disabledDuringWork = false;

    const work = (async () => {
      await nextMicrotask();
      disabledDuringWork = ionButton.disabled;
    })();
    await disableHandler(event, work);

    expect(disabledDuringWork).toBe(true);
    expect(ionButton.disabled).toBe(false);
    form.remove();
    ionButton.remove();
  });

  it('restores the original disabled state of every submitter for the form', async () => {
    const form = document.createElement('form');
    const first = document.createElement('ion-button') as HTMLElement & {
      disabled: boolean;
      form: HTMLFormElement;
    };
    const second = document.createElement('ion-button') as typeof first;
    [first, second].forEach((button) => {
      button.setAttribute('type', 'submit');
      button.form = form;
    });
    first.disabled = false;
    second.disabled = true;
    document.body.append(form, first, second);
    const event = {
      type: 'submit',
      target: form,
      submitter: document.createElement('button'),
      preventDefault: vi.fn(),
    } as unknown as SubmitEvent;

    await disableHandler(event, nextMicrotask());

    expect(first.disabled).toBe(false);
    expect(second.disabled).toBe(true);
    form.remove();
    first.remove();
    second.remove();
  });
});
