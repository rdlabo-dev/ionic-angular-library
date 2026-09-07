import { kitAppleLogin } from '@rdlabo/ionic-angular-kit/auth-firebase/apple';
import { kitFacebookLogin } from '@rdlabo/ionic-angular-kit/auth-firebase/facebook';
import { kitGoogleLogin } from '@rdlabo/ionic-angular-kit/auth-firebase/google';
import { runOAuthOperation } from '@rdlabo/ionic-angular-kit/auth-firebase/internal';
import type { Auth, User } from 'firebase/auth';

const signInWithCredential = vi.fn();
const linkWithCredential = vi.fn();
const reauthenticateWithCredential = vi.fn();
const signInWithPopup = vi.fn();
const linkWithPopup = vi.fn();
const reauthenticateWithPopup = vi.fn();

const isNativePlatform = vi.fn();
const getPlatform = vi.fn();
const facebookLogin = vi.fn();
const facebookLogout = vi.fn();
const facebookGetCurrentAccessToken = vi.fn();
const appleAuthorize = vi.fn();
const googleInitialize = vi.fn();
const googleSignIn = vi.fn();
const googleSignOut = vi.fn();

vi.mock('firebase/auth', () => ({
  signInWithCredential: (...a: unknown[]) => signInWithCredential(...a),
  linkWithCredential: (...a: unknown[]) => linkWithCredential(...a),
  reauthenticateWithCredential: (...a: unknown[]) => reauthenticateWithCredential(...a),
  signInWithPopup: (...a: unknown[]) => signInWithPopup(...a),
  linkWithPopup: (...a: unknown[]) => linkWithPopup(...a),
  reauthenticateWithPopup: (...a: unknown[]) => reauthenticateWithPopup(...a),
  EmailAuthProvider: { credential: (email: string, password: string) => ({ email, password }) },
  FacebookAuthProvider: { credential: (t: string) => ({ fb: t }) },
  GoogleAuthProvider: class {
    static credential(idToken: string) {
      return { idToken };
    }
    static credentialFromResult(result: { idToken?: string }) {
      return result.idToken ? { idToken: result.idToken } : null;
    }
  },
  OAuthProvider: class {
    id: string;
    constructor(id: string) {
      this.id = id;
    }
    credential(o: unknown) {
      return { oauth: o, providerId: this.id };
    }
    addScope() {}
    static credentialFromResult() {
      return { idToken: 'id-token', accessToken: 'access-token' };
    }
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => isNativePlatform(), getPlatform: () => getPlatform() },
}));
vi.mock('@capacitor-community/facebook-login', () => ({
  FacebookLogin: {
    login: (...a: unknown[]) => facebookLogin(...a),
    logout: (...a: unknown[]) => facebookLogout(...a),
    getCurrentAccessToken: (...a: unknown[]) => facebookGetCurrentAccessToken(...a),
  },
}));
vi.mock('@capawesome/capacitor-apple-sign-in', () => ({
  AppleSignIn: { signIn: (...a: unknown[]) => appleAuthorize(...a) },
  ErrorCode: { SignInCanceled: 'SIGN_IN_CANCELED' },
  SignInScope: { Email: 'EMAIL', FullName: 'FULL_NAME' },
}));
vi.mock('@capawesome/capacitor-google-sign-in', () => ({
  ErrorCode: { SignInCanceled: 'SIGN_IN_CANCELED' },
  GoogleSignIn: {
    initialize: (...a: unknown[]) => googleInitialize(...a),
    signIn: (...a: unknown[]) => googleSignIn(...a),
    signOut: (...a: unknown[]) => googleSignOut(...a),
  },
}));

type ProviderName = 'apple' | 'facebook' | 'google';
type OAuthModeName = 'new' | 'link' | 'credential' | 'reauthenticate';

const deferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

const authWith = (currentUser: unknown): Auth => ({ currentUser }) as unknown as Auth;
const setCurrentUser = (auth: Auth, user: User | null) => {
  (auth as unknown as { currentUser: User | null }).currentUser = user;
};

const hooks = () => ({
  before: vi.fn().mockResolvedValue(undefined),
  success: vi.fn().mockResolvedValue(undefined),
  error: vi.fn().mockResolvedValue(undefined),
  finally: vi.fn().mockResolvedValue(undefined),
});

const armNativePlugin = (provider: ProviderName) => {
  if (provider === 'apple') {
    appleAuthorize.mockResolvedValueOnce({
      idToken: 'apple-token',
      email: 'a@b.com',
      user: 'apple-user',
      givenName: null,
      familyName: null,
      authorizationCode: 'apple-code',
    });
    return;
  }
  if (provider === 'facebook') {
    facebookLogin.mockResolvedValueOnce({ accessToken: { token: 'fb-token' } });
    return;
  }
  googleInitialize.mockResolvedValue(undefined);
  googleSignIn.mockResolvedValueOnce({ idToken: 'google-token' });
};

const hangFirebase = (mode: OAuthModeName, auth: Auth, user: User) => {
  const gate = deferred();
  const entered = deferred();
  const hold = async <T>(value: T): Promise<T> => {
    entered.resolve();
    await gate.promise;
    return value;
  };

  if (mode === 'new') {
    signInWithCredential.mockImplementationOnce(async () => {
      setCurrentUser(auth, user);
      return hold({ user });
    });
  } else if (mode === 'link') {
    linkWithCredential.mockImplementationOnce(async () => hold({}));
  } else {
    reauthenticateWithCredential.mockImplementationOnce(async () => hold({ user }));
    if (mode === 'credential') linkWithCredential.mockResolvedValueOnce({});
  }

  return { entered: entered.promise, release: () => gate.resolve() };
};

const pluginSnapshot = () => ({
  apple: appleAuthorize.mock.calls.length,
  facebook: facebookLogin.mock.calls.length,
  googleSignIn: googleSignIn.mock.calls.length,
  googleInitialize: googleInitialize.mock.calls.length,
  signIn: signInWithCredential.mock.calls.length,
  link: linkWithCredential.mock.calls.length,
  reauth: reauthenticateWithCredential.mock.calls.length,
});

const expectNoSecondEffects = (provider: ProviderName, before: ReturnType<typeof pluginSnapshot>, h: ReturnType<typeof hooks>) => {
  expect(h.before).not.toHaveBeenCalled();
  expect(h.success).not.toHaveBeenCalled();
  const after = pluginSnapshot();
  if (provider === 'apple') expect(after.apple).toBe(before.apple);
  if (provider === 'facebook') expect(after.facebook).toBe(before.facebook);
  if (provider === 'google') {
    expect(after.googleSignIn).toBe(before.googleSignIn);
    expect(after.googleInitialize).toBe(before.googleInitialize);
  }
  expect(after.signIn).toBe(before.signIn);
  expect(after.link).toBe(before.link);
  expect(after.reauth).toBe(before.reauth);
};

const startLogin = (provider: ProviderName, auth: Auth, mode: OAuthModeName, h: ReturnType<typeof hooks>) => {
  if (provider === 'apple') {
    if (mode === 'reauthenticate') throw new Error('Apple has no reauthenticate mode');
    if (mode === 'credential') return kitAppleLogin(auth, { mode: 'credential', emailLogin: { email: 'e@x.com', password: 'pw' }, ...h });
    return kitAppleLogin(auth, { mode, ...h });
  }
  if (provider === 'facebook') {
    if (mode === 'reauthenticate') throw new Error('Facebook has no reauthenticate mode');
    if (mode === 'credential') {
      return kitFacebookLogin(auth, { mode: 'credential', emailLogin: { email: 'e@x.com', password: 'pw' }, permissions: [], ...h });
    }
    return kitFacebookLogin(auth, { mode, permissions: [], ...h });
  }
  if (mode === 'credential') {
    return kitGoogleLogin(auth, {
      mode: 'credential',
      clientId: 'concurrency-client',
      emailLogin: { email: 'e@x.com', password: 'pw' },
      ...h,
    });
  }
  return kitGoogleLogin(auth, { mode, clientId: 'concurrency-client', ...h });
};

beforeEach(() => {
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
    queueMicrotask(() => callback(0));
    return 0;
  });
  isNativePlatform.mockReturnValue(true);
  getPlatform.mockReturnValue('ios');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const crossProviderPairs: { first: ProviderName; second: ProviderName }[] = [
  { first: 'apple', second: 'google' },
  { first: 'google', second: 'facebook' },
  { first: 'facebook', second: 'apple' },
];

const sharedModes: OAuthModeName[] = ['new', 'link', 'credential'];

describe('cross-provider concurrency through public entrypoints', () => {
  it.each(
    crossProviderPairs.flatMap(({ first, second }) =>
      sharedModes.map((mode) => ({ first, second, mode, label: `${first}(${mode}) → ${second}` })),
    ),
  )('blocks $label while the first Firebase credential call is pending', async ({ first, second, mode }) => {
    const user = { uid: 'held' } as User;
    const auth = authWith(mode === 'new' ? null : user);
    armNativePlugin(first);
    const { entered, release } = hangFirebase(mode, auth, user);
    const firstHooks = hooks();
    const firstPromise = startLogin(first, auth, mode, firstHooks);

    await entered;
    const beforeSecond = pluginSnapshot();
    const secondHooks = hooks();
    const secondResult = await startLogin(second, auth, 'new', secondHooks);

    expect(secondResult).toEqual({ status: false });
    expect(secondHooks.error).toHaveBeenCalledWith(
      'other',
      expect.objectContaining({ message: 'kit social: authentication already in progress' }),
    );
    expectNoSecondEffects(second, beforeSecond, secondHooks);

    release();
    await expect(firstPromise).resolves.toEqual({ status: true });
    expect(firstHooks.error).not.toHaveBeenCalled();
    expect(firstHooks.finally).toHaveBeenCalledOnce();
  });

  it.each(crossProviderPairs.filter(({ first }) => first === 'google'))(
    'blocks $second while google(reauthenticate) is pending on the same Auth',
    async ({ second }) => {
      const user = { uid: 'reauth' } as User;
      const auth = authWith(user);
      armNativePlugin('google');
      const { entered, release } = hangFirebase('reauthenticate', auth, user);
      const firstHooks = hooks();
      const firstPromise = startLogin('google', auth, 'reauthenticate', firstHooks);

      await entered;
      const beforeSecond = pluginSnapshot();
      const secondHooks = hooks();
      const secondResult = await startLogin(second, auth, 'new', secondHooks);

      expect(secondResult).toEqual({ status: false });
      expect(secondHooks.error).toHaveBeenCalledWith(
        'other',
        expect.objectContaining({ message: 'kit social: authentication already in progress' }),
      );
      expectNoSecondEffects(second, beforeSecond, secondHooks);

      release();
      await expect(firstPromise).resolves.toEqual({ status: true });
    },
  );
});

describe('Auth instance isolation and reuse', () => {
  it('allows overlapping flows on independent Auth instances', async () => {
    const userA = { uid: 'a' } as User;
    const userB = { uid: 'b' } as User;
    const authA = authWith(null);
    const authB = authWith(null);
    armNativePlugin('apple');
    armNativePlugin('google');
    const hangA = hangFirebase('new', authA, userA);
    const hangB = hangFirebase('new', authB, userB);

    const first = startLogin('apple', authA, 'new', hooks());
    const second = startLogin('google', authB, 'new', hooks());
    await Promise.all([hangA.entered, hangB.entered]);

    hangA.release();
    hangB.release();
    await expect(Promise.all([first, second])).resolves.toEqual([{ status: true }, { status: true }]);
  });

  it('reuses the same Auth after the first operation settles', async () => {
    const user = { uid: 'reuse' } as User;
    const auth = authWith(null);
    armNativePlugin('facebook');
    signInWithCredential.mockImplementationOnce(async () => {
      setCurrentUser(auth, user);
      return { user };
    });
    await expect(startLogin('facebook', auth, 'new', hooks())).resolves.toEqual({ status: true });

    armNativePlugin('apple');
    signInWithCredential.mockImplementationOnce(async () => {
      setCurrentUser(auth, user);
      return { user };
    });
    await expect(startLogin('apple', auth, 'new', hooks())).resolves.toEqual({ status: true });
  });
});

describe('runOAuthOperation guard lifecycle', () => {
  it('holds the guard while the error hook is pending', async () => {
    const auth = authWith(null);
    const gate = deferred();
    const entered = deferred();
    const first = runOAuthOperation(
      auth,
      async () => {
        throw new Error('operation failed');
      },
      async () => {
        entered.resolve();
        await gate.promise;
      },
    );

    await entered.promise;
    const operation = vi.fn();
    await expect(runOAuthOperation(auth, operation, () => undefined)).resolves.toEqual({ status: false });
    expect(operation).not.toHaveBeenCalled();

    gate.resolve();
    await expect(first).resolves.toEqual({ status: false });
  });

  it('holds the guard while the finally hook is pending', async () => {
    const auth = authWith(null);
    const gate = deferred();
    const entered = deferred();
    const first = runOAuthOperation(
      auth,
      async () => undefined,
      () => undefined,
      async () => {
        entered.resolve();
        await gate.promise;
      },
    );

    await entered.promise;
    const operation = vi.fn();
    await expect(runOAuthOperation(auth, operation, () => undefined)).resolves.toEqual({ status: false });
    expect(operation).not.toHaveBeenCalled();

    gate.resolve();
    await expect(first).resolves.toEqual({ status: true });
  });

  it('releases the guard even when the error hook throws', async () => {
    const auth = authWith(null);
    await expect(
      runOAuthOperation(
        auth,
        async () => {
          throw new Error('operation failed');
        },
        async () => {
          throw new Error('error hook failed');
        },
      ),
    ).rejects.toThrow('error hook failed');

    await expect(
      runOAuthOperation(
        auth,
        async () => undefined,
        () => undefined,
      ),
    ).resolves.toEqual({ status: true });
  });

  it('releases the guard even when the finally hook throws', async () => {
    const auth = authWith(null);
    await expect(
      runOAuthOperation(
        auth,
        async () => undefined,
        () => undefined,
        async () => {
          throw new Error('finally hook failed');
        },
      ),
    ).rejects.toThrow('finally hook failed');

    await expect(
      runOAuthOperation(
        auth,
        async () => undefined,
        () => undefined,
      ),
    ).resolves.toEqual({ status: true });
  });
});
