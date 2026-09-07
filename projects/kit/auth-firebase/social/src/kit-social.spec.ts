import { kitAppleLogin as appleLogin } from '@rdlabo/ionic-angular-kit/auth-firebase/apple';
import {
  kitFacebookLogin as facebookFlow,
  kitFacebookLogout as facebookLogoutFlow,
} from '@rdlabo/ionic-angular-kit/auth-firebase/facebook';
import type { Auth, User } from 'firebase/auth';
// Compatibility entrypoint: re-exports apple/facebook (keep exercised).
import { kitAppleLogin, kitFacebookLogin, kitFacebookLogout } from './kit-social';

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

vi.mock('firebase/auth', () => ({
  signInWithCredential: (...a: unknown[]) => signInWithCredential(...a),
  linkWithCredential: (...a: unknown[]) => linkWithCredential(...a),
  reauthenticateWithCredential: (...a: unknown[]) => reauthenticateWithCredential(...a),
  signInWithPopup: (...a: unknown[]) => signInWithPopup(...a),
  linkWithPopup: (...a: unknown[]) => linkWithPopup(...a),
  reauthenticateWithPopup: (...a: unknown[]) => reauthenticateWithPopup(...a),
  EmailAuthProvider: { credential: (email: string, password: string) => ({ email, password }) },
  FacebookAuthProvider: { credential: (t: string) => ({ fb: t }) },
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

const fbError = (code: string) => Object.assign(new Error(code), { code });
const authWith = (currentUser: unknown): Auth => ({ currentUser }) as unknown as Auth;
const setCurrentUser = (auth: Auth, user: User | null) => {
  (auth as unknown as { currentUser: User | null }).currentUser = user;
};

/** Successful Firebase credential sign-in must pin auth.currentUser to the returned user. */
const mockSignInSuccess = (auth: Auth, user: User) => {
  signInWithCredential.mockImplementationOnce(async () => {
    setCurrentUser(auth, user);
    return { user };
  });
};

const hooks = () => ({
  before: vi.fn().mockResolvedValue(undefined),
  success: vi.fn().mockResolvedValue(undefined),
  error: vi.fn().mockResolvedValue(undefined),
  finally: vi.fn().mockResolvedValue(undefined),
});

beforeEach(() => {
  // Exercise the frame boundary without depending on jsdom's display scheduler in CI.
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
    queueMicrotask(() => callback(0));
    return 0;
  });
  isNativePlatform.mockReturnValue(true);
  getPlatform.mockReturnValue('android');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('kitFacebookLogin', () => {
  it("mode 'new' signs in, then runs before → success (with payload) → finally", async () => {
    const user = { uid: 'u1' } as User;
    const auth = authWith(null);
    facebookLogin.mockResolvedValueOnce({ accessToken: { token: 'tok' } });
    mockSignInSuccess(auth, user);
    const h = hooks();

    const res = await kitFacebookLogin(auth, { mode: 'new', permissions: [], ...h });

    expect(res).toEqual({ status: true });
    expect(signInWithCredential).toHaveBeenCalled();
    expect(h.before).toHaveBeenCalledTimes(1);
    expect(h.success).toHaveBeenCalledWith({ accessToken: 'tok', mode: 'new', user });
    expect(h.error).not.toHaveBeenCalled();
    expect(h.finally).toHaveBeenCalledTimes(1);
  });

  it('reports plugin login cancellation via error(cancelled)', async () => {
    facebookLogin.mockResolvedValueOnce(undefined);
    const h = hooks();
    const res = await kitFacebookLogin(authWith(null), { mode: 'new', permissions: [], ...h });
    expect(res).toEqual({ status: false });
    expect(h.error).toHaveBeenCalledWith('cancelled', expect.objectContaining({ code: 'auth/user-cancelled' }));
    expect(signInWithCredential).not.toHaveBeenCalled();
  });

  it('reports the web plugin null-token rejection as cancelled', async () => {
    isNativePlatform.mockReturnValue(false);
    facebookLogin.mockRejectedValueOnce({ accessToken: { token: null } });
    const animationFrame = vi.spyOn(globalThis, 'requestAnimationFrame');
    const h = hooks();

    await expect(kitFacebookLogin(authWith(null), { mode: 'new', permissions: [], ...h })).resolves.toEqual({ status: false });

    expect(animationFrame).toHaveBeenCalledOnce();
    expect(h.error).toHaveBeenCalledWith('cancelled', expect.anything());
    expect(signInWithCredential).not.toHaveBeenCalled();
    expect(h.finally).toHaveBeenCalledOnce();
  });

  it('reports a rejected plugin login as an operational error', async () => {
    const boom = new Error('Facebook SDK unavailable');
    facebookLogin.mockRejectedValueOnce(boom);
    const animationFrame = vi.spyOn(globalThis, 'requestAnimationFrame');
    const h = hooks();

    await expect(kitFacebookLogin(authWith(null), { mode: 'new', permissions: [], ...h })).resolves.toEqual({ status: false });

    expect(h.error).toHaveBeenCalledWith('other', boom);
    expect(animationFrame).toHaveBeenCalledOnce();
    expect(signInWithCredential).not.toHaveBeenCalled();
    expect(h.finally).toHaveBeenCalledOnce();
  });

  it.each([null, {}])('reports a malformed access token (%j) instead of treating it as cancellation', async (accessToken) => {
    const malformed = { accessToken };
    facebookLogin.mockRejectedValueOnce(malformed);
    const h = hooks();

    await expect(kitFacebookLogin(authWith(null), { mode: 'new', permissions: [], ...h })).resolves.toEqual({ status: false });

    expect(h.error).toHaveBeenCalledWith('other', malformed);
    expect(signInWithCredential).not.toHaveBeenCalled();
    expect(h.finally).toHaveBeenCalledOnce();
  });

  it('reports a before-hook failure with status:false without calling the plugin', async () => {
    const boom = new Error('preflight failed');
    const h = hooks();
    h.before.mockRejectedValueOnce(boom);

    await expect(kitFacebookLogin(authWith(null), { mode: 'new', permissions: [], ...h })).resolves.toEqual({ status: false });

    expect(facebookLogin).not.toHaveBeenCalled();
    expect(h.error).toHaveBeenCalledWith('other', boom);
    expect(h.finally).toHaveBeenCalledOnce();
  });

  it("classifies 'already-in-use' and calls error without success (finally still runs)", async () => {
    facebookLogin.mockResolvedValueOnce({ accessToken: { token: 'tok' } });
    signInWithCredential.mockRejectedValueOnce(fbError('auth/credential-already-in-use'));
    const h = hooks();
    const res = await kitFacebookLogin(authWith(null), { mode: 'new', permissions: [], ...h });
    expect(res).toEqual({ status: false });
    expect(h.error).toHaveBeenCalledWith('already-in-use', expect.anything());
    expect(h.success).not.toHaveBeenCalled();
    expect(h.finally).toHaveBeenCalledTimes(1);
  });

  it('uses the iOS OIDC nonce path (OAuthProvider) on native iOS', async () => {
    isNativePlatform.mockReturnValue(true);
    getPlatform.mockReturnValue('ios');
    const user = { uid: 'ios' } as User;
    const auth = authWith(null);
    facebookLogin.mockResolvedValueOnce({ accessToken: { token: 'tok' } });
    mockSignInSuccess(auth, user);
    const h = hooks();
    await kitFacebookLogin(auth, { mode: 'new', permissions: [], ...h });
    const cred = signInWithCredential.mock.calls[0][1] as { providerId?: string };
    expect(cred.providerId).toBe('facebook.com'); // OAuthProvider credential, not FacebookAuthProvider
  });

  it("mode 'link' links then afterCredential + onSuccess", async () => {
    const user = { uid: 'u1' } as User;
    facebookLogin.mockResolvedValueOnce({ accessToken: { token: 'tok' } });
    linkWithCredential.mockResolvedValueOnce({});
    const h = hooks();
    const res = await kitFacebookLogin(authWith(user), { mode: 'link', permissions: [], ...h });
    expect(res).toEqual({ status: true });
    expect(linkWithCredential).toHaveBeenCalled();
    expect(h.success).toHaveBeenCalledWith({ accessToken: 'tok', mode: 'link', user });
  });

  it("mode 'credential' re-auths then links the email credential", async () => {
    const user = { uid: 'u1' } as User;
    facebookLogin.mockResolvedValueOnce({ accessToken: { token: 'tok' } });
    reauthenticateWithCredential.mockResolvedValueOnce({});
    linkWithCredential.mockResolvedValueOnce({});
    const h = hooks();
    const res = await kitFacebookLogin(authWith(user), {
      mode: 'credential',
      emailLogin: { email: 'e@x.com', password: 'pw' },
      permissions: [],
      ...h,
    });
    expect(res).toEqual({ status: true });
    expect(reauthenticateWithCredential).toHaveBeenCalled();
    expect(linkWithCredential).toHaveBeenCalledWith(user, { email: 'e@x.com', password: 'pw' });
  });

  it('does not link or succeed when currentUser switches during pending native Facebook login', async () => {
    const original = { uid: 'u1' } as User;
    const auth = authWith(original);
    facebookLogin.mockImplementationOnce(async () => {
      setCurrentUser(auth, { uid: 'switched' } as User);
      return { accessToken: { token: 'tok' } };
    });
    const h = hooks();

    await expect(kitFacebookLogin(auth, { mode: 'link', permissions: [], ...h })).resolves.toEqual({ status: false });

    expect(linkWithCredential).not.toHaveBeenCalled();
    expect(h.success).not.toHaveBeenCalled();
    expect(h.error).toHaveBeenCalledWith('other', expect.objectContaining({ message: 'kit social: Firebase user changed' }));
  });

  it('does not link a password when currentUser switches during credential reauthentication', async () => {
    const original = { uid: 'u1' } as User;
    const auth = authWith(original);
    facebookLogin.mockResolvedValueOnce({ accessToken: { token: 'tok' } });
    reauthenticateWithCredential.mockImplementationOnce(async () => {
      setCurrentUser(auth, { uid: 'switched' } as User);
    });
    const h = hooks();

    await expect(
      kitFacebookLogin(auth, {
        mode: 'credential',
        emailLogin: { email: 'e@x.com', password: 'pw' },
        permissions: [],
        ...h,
      }),
    ).resolves.toEqual({ status: false });

    expect(linkWithCredential).not.toHaveBeenCalled();
    expect(h.success).not.toHaveBeenCalled();
  });
});

describe('kitAppleLogin', () => {
  it('reports a before-hook failure with status:false without calling the plugin', async () => {
    const boom = new Error('preflight failed');
    const h = hooks();
    h.before.mockRejectedValueOnce(boom);

    await expect(kitAppleLogin(authWith(null), { mode: 'new', ...h })).resolves.toEqual({ status: false });

    expect(appleAuthorize).not.toHaveBeenCalled();
    expect(h.error).toHaveBeenCalledWith('other', boom);
    expect(h.finally).toHaveBeenCalledOnce();
  });

  it('native: authorizes, applies credential, success gets the apple response', async () => {
    isNativePlatform.mockReturnValue(true);
    getPlatform.mockReturnValue('ios');
    const user = { uid: 'apple' } as User;
    const auth = authWith(null);
    appleAuthorize.mockResolvedValueOnce({
      idToken: 'it',
      email: 'a@b.com',
      user: 'apple-user',
      givenName: null,
      familyName: null,
      authorizationCode: 'apple-code',
    });
    mockSignInSuccess(auth, user);
    const h = hooks();
    const res = await kitAppleLogin(auth, { mode: 'new', ...h });
    expect(res).toEqual({ status: true });
    expect(appleAuthorize).toHaveBeenCalledWith({ scopes: ['EMAIL', 'FULL_NAME'] });
    expect(h.success).toHaveBeenCalledWith({
      response: {
        user: 'apple-user',
        identityToken: 'it',
        authorizationCode: 'apple-code',
        accessToken: null,
        email: 'a@b.com',
        givenName: null,
        familyName: null,
      },
      mode: 'new',
      user,
    });
    expect(h.finally).toHaveBeenCalledTimes(1);
  });

  it('native: authorize undefined is an other error rather than silent cancellation', async () => {
    isNativePlatform.mockReturnValue(true);
    getPlatform.mockReturnValue('ios');
    appleAuthorize.mockResolvedValueOnce(undefined);
    const h = hooks();
    expect(await kitAppleLogin(authWith(null), { mode: 'new', ...h })).toEqual({ status: false });
    expect(h.error).toHaveBeenCalledWith('other', expect.anything());
    expect(signInWithCredential).not.toHaveBeenCalled();
  });

  it('native: operational reject is reported with the original error', async () => {
    isNativePlatform.mockReturnValue(true);
    getPlatform.mockReturnValue('ios');
    const boom = new Error('ASAuthorization failed');
    appleAuthorize.mockRejectedValueOnce(boom);
    const h = hooks();

    await expect(kitAppleLogin(authWith(null), { mode: 'new', ...h })).resolves.toEqual({ status: false });

    expect(h.error).toHaveBeenCalledWith('other', boom);
    expect(signInWithCredential).not.toHaveBeenCalled();
  });

  it('native: classifies Capawesome sign-in cancellation', async () => {
    const code = 'SIGN_IN_CANCELED';
    isNativePlatform.mockReturnValue(true);
    getPlatform.mockReturnValue('ios');
    const cancelled = Object.assign(new Error('canceled'), { code });
    appleAuthorize.mockRejectedValueOnce(cancelled);
    const h = hooks();

    await expect(kitAppleLogin(authWith(null), { mode: 'new', ...h })).resolves.toEqual({ status: false });

    expect(h.error).toHaveBeenCalledWith('cancelled', cancelled);
  });

  it('does not link or succeed when currentUser switches during pending native Apple login', async () => {
    isNativePlatform.mockReturnValue(true);
    getPlatform.mockReturnValue('ios');
    const original = { uid: 'u1' } as User;
    const auth = authWith(original);
    appleAuthorize.mockImplementationOnce(async () => {
      setCurrentUser(auth, { uid: 'switched' } as User);
      return { idToken: 'it', email: 'a@b.com', user: 'apple-user', givenName: null, familyName: null, authorizationCode: 'apple-code' };
    });
    const h = hooks();

    await expect(kitAppleLogin(auth, { mode: 'link', ...h })).resolves.toEqual({ status: false });

    expect(linkWithCredential).not.toHaveBeenCalled();
    expect(h.success).not.toHaveBeenCalled();
    expect(h.error).toHaveBeenCalledWith('other', expect.objectContaining({ message: 'kit social: Firebase user changed' }));
  });

  it("web 'new': uses signInWithPopup, synthesizes the response, routes errors to error", async () => {
    isNativePlatform.mockReturnValue(false);
    const user = { email: 'a@b.com' } as User;
    const auth = authWith(null);
    signInWithPopup.mockImplementationOnce(async () => {
      setCurrentUser(auth, user);
      return { user };
    });
    const h = hooks();
    const res = await kitAppleLogin(auth, { mode: 'new', ...h });
    expect(res).toEqual({ status: true });
    expect(signInWithPopup).toHaveBeenCalled();
    expect(h.success).toHaveBeenCalledWith({
      response: expect.objectContaining({
        email: 'a@b.com',
        identityToken: 'id-token',
        authorizationCode: null,
        accessToken: 'access-token',
      }),
      mode: 'new',
      user,
    });

    signInWithPopup.mockRejectedValueOnce(fbError('auth/popup-closed-by-user'));
    const h2 = hooks();
    expect(await kitAppleLogin(authWith(null), { mode: 'new', ...h2 })).toEqual({ status: false });
    expect(h2.error).toHaveBeenCalledWith('cancelled', expect.anything());
    expect(h2.finally).toHaveBeenCalledTimes(1);
  });
});

describe('kitFacebookLogout', () => {
  beforeEach(() => {
    facebookLogout.mockResolvedValue(undefined);
    facebookGetCurrentAccessToken.mockResolvedValue({ accessToken: { token: 'fb-token' } });
  });

  it('logs out when the Facebook SDK has an active session', async () => {
    await kitFacebookLogout();
    expect(facebookGetCurrentAccessToken).toHaveBeenCalled();
    expect(facebookLogout).toHaveBeenCalled();
  });

  it('skips logout when there is no Facebook access token', async () => {
    facebookGetCurrentAccessToken.mockRejectedValueOnce({ accessToken: { token: null } });
    await kitFacebookLogout();
    expect(facebookLogout).not.toHaveBeenCalled();
  });

  it('skips logout when getCurrentAccessToken returns a null token', async () => {
    facebookGetCurrentAccessToken.mockResolvedValueOnce({ accessToken: { token: null } });
    await kitFacebookLogout();
    expect(facebookLogout).not.toHaveBeenCalled();
  });
});

describe('Apple credential identity boundary', () => {
  it.each([false, true])('does not add a password after the session changes during reauthentication (native=%s)', async (native) => {
    isNativePlatform.mockReturnValue(native);
    getPlatform.mockReturnValue('ios');
    const original = { uid: 'original' } as User;
    const auth = authWith(original);
    const changed = { uid: 'changed' } as User;
    appleAuthorize.mockResolvedValueOnce({ idToken: 'apple-token' });
    const reauthenticate = native ? reauthenticateWithCredential : reauthenticateWithPopup;
    reauthenticate.mockImplementationOnce(async () => {
      setCurrentUser(auth, changed);
      return { user: original };
    });
    const h = hooks();
    await expect(
      kitAppleLogin(auth, { mode: 'credential', emailLogin: { email: 'user@example.com', password: 'password' }, ...h }),
    ).resolves.toEqual({ status: false });
    expect(linkWithCredential).not.toHaveBeenCalled();
    expect(h.success).not.toHaveBeenCalled();
    expect(auth.currentUser).toBe(changed);
  });

  it('reports an app success-hook failure and still runs finally', async () => {
    isNativePlatform.mockReturnValue(false);
    const user = { uid: 'current' } as User;
    const auth = authWith(user);
    linkWithPopup.mockResolvedValueOnce({ user });
    const failure = new Error('backend unavailable');
    const h = hooks();
    h.success.mockRejectedValueOnce(failure);
    await expect(kitAppleLogin(auth, { mode: 'link', ...h })).resolves.toEqual({ status: false });
    expect(h.error).toHaveBeenCalledWith('other', failure);
    expect(h.finally).toHaveBeenCalledOnce();
  });
});

it('keeps deprecated social exports as the same provider implementations', () => {
  expect(kitAppleLogin).toBe(appleLogin);
  expect(kitFacebookLogin).toBe(facebookFlow);
  expect(kitFacebookLogout).toBe(facebookLogoutFlow);
});
