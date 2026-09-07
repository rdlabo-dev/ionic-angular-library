import type { Auth } from 'firebase/auth';
import { kitGoogleLogin, kitGoogleLogout } from './kit-google';

const initialize = vi.fn();
const nativeSignIn = vi.fn();
const signInWithCredential = vi.fn();
const signInWithPopup = vi.fn();
const linkWithCredential = vi.fn();
const linkWithPopup = vi.fn();
const reauthenticateWithCredential = vi.fn();
const reauthenticateWithPopup = vi.fn();
const signOut = vi.fn();
const getPlatform = vi.fn();

vi.mock('@capawesome/capacitor-google-sign-in', () => ({
  ErrorCode: { SignInCanceled: 'SIGN_IN_CANCELED' },
  GoogleSignIn: { initialize: (...a: unknown[]) => initialize(...a), signIn: () => nativeSignIn(), signOut: () => signOut() },
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => getPlatform() } }));
vi.mock('firebase/auth', () => ({
  signInWithCredential: (...a: unknown[]) => signInWithCredential(...a),
  signInWithPopup: (...a: unknown[]) => signInWithPopup(...a),
  linkWithCredential: (...a: unknown[]) => linkWithCredential(...a),
  linkWithPopup: (...a: unknown[]) => linkWithPopup(...a),
  reauthenticateWithCredential: (...a: unknown[]) => reauthenticateWithCredential(...a),
  reauthenticateWithPopup: (...a: unknown[]) => reauthenticateWithPopup(...a),
  EmailAuthProvider: { credential: (email: string, password: string) => ({ email, password }) },
  GoogleAuthProvider: class {
    static credential(idToken: string) {
      return { idToken };
    }
    static credentialFromResult(result: { idToken?: string }) {
      return result.idToken ? { idToken: result.idToken } : null;
    }
  },
}));

const authWith = (user: unknown): Auth => ({ currentUser: user }) as Auth;
afterEach(() => vi.clearAllMocks());

it('uses Firebase popup on web and exchanges the ID token', async () => {
  getPlatform.mockReturnValue('web');
  const user = { uid: 'web' };
  signInWithPopup.mockResolvedValue({ user, idToken: 'web-token' });
  const exchange = vi.fn();
  await expect(kitGoogleLogin(authWith(user), { mode: 'new', clientId: 'client', exchange })).resolves.toEqual({ status: true });
  expect(exchange).toHaveBeenCalledWith('web-token', user);
});

it('uses the native plugin token to establish the Firebase session', async () => {
  getPlatform.mockReturnValue('ios');
  initialize.mockResolvedValue(undefined);
  nativeSignIn.mockResolvedValue({ idToken: 'native-token' });
  const user = { uid: 'native' };
  signInWithCredential.mockResolvedValue({ user });
  const exchange = vi.fn();
  await expect(kitGoogleLogin(authWith(user), { mode: 'new', clientId: 'client', exchange })).resolves.toEqual({ status: true });
  expect(exchange).toHaveBeenCalledWith('native-token', user);
});

it('links Google to the current user on web and exchanges its token', async () => {
  getPlatform.mockReturnValue('web');
  const user = { uid: 'linked' };
  linkWithPopup.mockResolvedValue({ user, idToken: 'link-token' });
  const exchange = vi.fn();
  await expect(kitGoogleLogin(authWith(user), { mode: 'link', clientId: 'client', exchange })).resolves.toEqual({ status: true });
  expect(linkWithPopup).toHaveBeenCalledWith(user, expect.anything());
  expect(exchange).toHaveBeenCalledWith('link-token', user);
});

it('links Google to the current user on native and exchanges its token', async () => {
  getPlatform.mockReturnValue('android');
  initialize.mockResolvedValue(undefined);
  nativeSignIn.mockResolvedValue({ idToken: 'native-link-token' });
  const user = { uid: 'native-linked' };
  linkWithCredential.mockResolvedValue({ user });
  const exchange = vi.fn();
  await expect(kitGoogleLogin(authWith(user), { mode: 'link', clientId: 'native-link-client', exchange })).resolves.toEqual({
    status: true,
  });
  expect(linkWithCredential).toHaveBeenCalledWith(user, { idToken: 'native-link-token' });
  expect(exchange).toHaveBeenCalledWith('native-link-token', user);
});

it('reauthenticates and links a password in web credential mode without token exchange', async () => {
  getPlatform.mockReturnValue('web');
  const user = { uid: 'credential-web' };
  reauthenticateWithPopup.mockResolvedValue({ user });
  linkWithCredential.mockResolvedValue({ user });
  const exchange = vi.fn();
  await expect(
    kitGoogleLogin(authWith(user), {
      mode: 'credential',
      clientId: 'client',
      emailLogin: { email: 'user@example.com', password: 'password' },
      exchange,
    }),
  ).resolves.toEqual({ status: true });
  expect(reauthenticateWithPopup).toHaveBeenCalledWith(user, expect.anything());
  expect(linkWithCredential).toHaveBeenCalledWith(user, { email: 'user@example.com', password: 'password' });
  expect(exchange).not.toHaveBeenCalled();
});

it('reauthenticates and links a password in native credential mode without token exchange', async () => {
  getPlatform.mockReturnValue('android');
  initialize.mockResolvedValue(undefined);
  nativeSignIn.mockResolvedValue({ idToken: 'credential-token' });
  const user = { uid: 'credential-native' };
  reauthenticateWithCredential.mockResolvedValue({ user });
  linkWithCredential.mockResolvedValue({ user });
  const exchange = vi.fn();
  await expect(
    kitGoogleLogin(authWith(user), {
      mode: 'credential',
      clientId: 'credential-client',
      emailLogin: { email: 'user@example.com', password: 'password' },
      exchange,
    }),
  ).resolves.toEqual({ status: true });
  expect(reauthenticateWithCredential).toHaveBeenCalledWith(user, { idToken: 'credential-token' });
  expect(linkWithCredential).toHaveBeenCalledWith(user, { email: 'user@example.com', password: 'password' });
  expect(exchange).not.toHaveBeenCalled();
});

it('reauthenticates the current native user without linking or exchange', async () => {
  getPlatform.mockReturnValue('ios');
  initialize.mockResolvedValue(undefined);
  nativeSignIn.mockResolvedValue({ idToken: 'reauth-token' });
  const user = { uid: 'reauthenticated' };
  reauthenticateWithCredential.mockResolvedValue({ user });
  const success = vi.fn();
  await expect(kitGoogleLogin(authWith(user), { mode: 'reauthenticate', clientId: 'reauth-client', success })).resolves.toEqual({
    status: true,
  });
  expect(reauthenticateWithCredential).toHaveBeenCalledWith(user, { idToken: 'reauth-token' });
  expect(linkWithCredential).not.toHaveBeenCalled();
  expect(success).toHaveBeenCalledWith({ idToken: 'reauth-token', mode: 'reauthenticate', user });
});

it('reauthenticates the current web user without linking or exchange', async () => {
  getPlatform.mockReturnValue('web');
  const user = { uid: 'web-reauthenticated' };
  reauthenticateWithPopup.mockResolvedValue({ user, idToken: 'web-reauth-token' });
  const success = vi.fn();
  await expect(kitGoogleLogin(authWith(user), { mode: 'reauthenticate', clientId: 'client', success })).resolves.toEqual({
    status: true,
  });
  expect(success).toHaveBeenCalledWith({ idToken: 'web-reauth-token', mode: 'reauthenticate', user });
  expect(linkWithCredential).not.toHaveBeenCalled();
});

it('keeps the Firebase user when backend exchange rejects', async () => {
  getPlatform.mockReturnValue('web');
  const user = { uid: 'session' };
  const auth = authWith(user);
  signInWithPopup.mockResolvedValue({ user, idToken: 'web-token' });
  const failure = new Error('backend rejected');
  const error = vi.fn();
  await expect(kitGoogleLogin(auth, { mode: 'new', clientId: 'client', exchange: () => Promise.reject(failure), error })).resolves.toEqual({
    status: false,
  });
  expect(auth.currentUser).toBe(user);
  expect(error).toHaveBeenCalledWith('other', failure);
});

it('rejects a missing popup ID token', async () => {
  getPlatform.mockReturnValue('web');
  const user = { uid: 'missing-token' };
  signInWithPopup.mockResolvedValue({ user });
  const error = vi.fn();
  await expect(kitGoogleLogin(authWith(user), { mode: 'new', clientId: 'client', error })).resolves.toEqual({ status: false });
  expect(error).toHaveBeenCalledWith('other', expect.objectContaining({ message: 'kit Google login: ID token is missing' }));
});

it('rejects a Firebase user change before exchange', async () => {
  getPlatform.mockReturnValue('web');
  const original = { uid: 'original' };
  const changed = { uid: 'changed' };
  const auth = authWith(original);
  signInWithPopup.mockImplementation(async () => {
    (auth as unknown as { currentUser: unknown }).currentUser = changed;
    return { user: original, idToken: 'web-token' };
  });
  const exchange = vi.fn();
  await expect(kitGoogleLogin(auth, { mode: 'new', clientId: 'client', exchange })).resolves.toEqual({ status: false });
  expect(exchange).not.toHaveBeenCalled();
});

it('does not link a password when the current user changes during reauthentication', async () => {
  getPlatform.mockReturnValue('web');
  const original = { uid: 'original-credential' };
  const auth = authWith(original);
  reauthenticateWithPopup.mockImplementation(async () => {
    (auth as unknown as { currentUser: unknown }).currentUser = { uid: 'changed-credential' };
    return { user: original };
  });
  await expect(
    kitGoogleLogin(auth, {
      mode: 'credential',
      clientId: 'client',
      emailLogin: { email: 'user@example.com', password: 'password' },
    }),
  ).resolves.toEqual({ status: false });
  expect(linkWithCredential).not.toHaveBeenCalled();
});

it('retries native initialization after an initialization failure', async () => {
  getPlatform.mockReturnValue('ios');
  initialize.mockRejectedValueOnce(new Error('init failed')).mockResolvedValueOnce(undefined);
  nativeSignIn.mockResolvedValue({ idToken: 'retry-token' });
  const user = { uid: 'retry' };
  signInWithCredential.mockResolvedValue({ user });
  const options = { mode: 'new' as const, clientId: 'retry-client' };
  await expect(kitGoogleLogin(authWith(user), options)).resolves.toEqual({ status: false });
  await expect(kitGoogleLogin(authWith(user), options)).resolves.toEqual({ status: true });
  expect(initialize).toHaveBeenCalledTimes(2);
});

it('classifies popup cancellation', async () => {
  getPlatform.mockReturnValue('web');
  signInWithPopup.mockRejectedValue(Object.assign(new Error('cancelled'), { code: 'auth/popup-closed-by-user' }));
  const error = vi.fn();
  await expect(kitGoogleLogin(authWith(null), { mode: 'new', clientId: 'client', error })).resolves.toEqual({ status: false });
  expect(error).toHaveBeenCalledWith('cancelled', expect.anything());
});

it('classifies native cancellation', async () => {
  getPlatform.mockReturnValue('android');
  initialize.mockResolvedValue(undefined);
  nativeSignIn.mockRejectedValue(Object.assign(new Error('cancelled'), { code: 'SIGN_IN_CANCELED' }));
  const error = vi.fn();
  await expect(kitGoogleLogin(authWith(null), { mode: 'new', clientId: 'cancel-client', error })).resolves.toEqual({ status: false });
  expect(error).toHaveBeenCalledWith('cancelled', expect.anything());
});

it('makes plugin logout best effort', async () => {
  signOut.mockRejectedValue(new Error('already signed out'));
  await expect(kitGoogleLogout()).resolves.toBeUndefined();
});
