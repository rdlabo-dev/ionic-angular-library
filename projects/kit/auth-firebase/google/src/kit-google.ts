import { ErrorCode, GoogleSignIn } from '@capawesome/capacitor-google-sign-in';
import { Capacitor } from '@capacitor/core';
import { assertCurrentUser, classifyOAuthError, requireUser } from '@rdlabo/ionic-angular-kit/auth-firebase/internal';
import type { KitOAuthErrorCategory } from '@rdlabo/ionic-angular-kit/auth-firebase/internal';
import type { Auth, User } from 'firebase/auth';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  linkWithPopup,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signInWithCredential,
  signInWithPopup,
} from 'firebase/auth';

/** Sign in, link Google, reauthenticate, or add email/password after reauthentication. */
export type KitGoogleLoginMode =
  | { mode: 'new' }
  | { mode: 'link' }
  | { mode: 'reauthenticate' }
  | { mode: 'credential'; emailLogin: { email: string; password: string } };
/** App-facing Google authentication error category. */
export type KitGoogleErrorCategory = KitOAuthErrorCategory;
/** Google login configuration. exchange runs for new/link; hooks receive the authenticated user. */
export type KitGoogleLoginOptions = KitGoogleLoginMode & {
  clientId: string;
  before?: () => void | Promise<unknown>;
  exchange?: (idToken: string, user: User) => void | Promise<unknown>;
  success?: (info: { idToken: string; mode: KitGoogleLoginMode['mode']; user: User }) => void | Promise<unknown>;
  error?: (category: KitGoogleErrorCategory, error: unknown) => void | Promise<unknown>;
  finally?: () => void | Promise<unknown>;
};

let initialization: { clientId: string; promise: Promise<void> } | undefined;
const initialize = (clientId: string): Promise<void> => {
  if (!clientId) {
    return Promise.reject(new Error('kit Google login: client ID is not configured'));
  }
  if (initialization?.clientId === clientId) return initialization.promise;
  const promise = GoogleSignIn.initialize({ clientId }).catch((error: unknown) => {
    if (initialization?.promise === promise) initialization = undefined;
    throw error;
  });
  initialization = { clientId, promise };
  return promise;
};

const classify = (error: unknown): KitGoogleErrorCategory =>
  (error as { code?: string } | null)?.code === ErrorCode.SignInCanceled ? 'cancelled' : classifyOAuthError(error);

/** Google popup/native authentication with pinned users and app-owned exchange/feedback hooks.
 * Failures in before/exchange/success are reported to error and return status:false.
 * finally always runs; failures in error/finally themselves reject the call.
 */
export const kitGoogleLogin = async (auth: Auth, options: KitGoogleLoginOptions): Promise<{ status: boolean }> => {
  const expectedUser = auth.currentUser;
  const execute = async (): Promise<void> => {
    await options.before?.();
    assertCurrentUser(auth, expectedUser);
    let idToken: string;
    let user: User;
    if (Capacitor.getPlatform() === 'web') {
      const provider = new GoogleAuthProvider();
      if (options.mode === 'reauthenticate') {
        user = requireUser(expectedUser);
        const result = await reauthenticateWithPopup(user, provider);
        idToken = GoogleAuthProvider.credentialFromResult(result)?.idToken ?? '';
        assertCurrentUser(auth, user);
        await options.success?.({ idToken, mode: options.mode, user });
        assertCurrentUser(auth, user);
        return;
      }
      if (options.mode === 'credential') {
        user = requireUser(expectedUser);
        await reauthenticateWithPopup(user, provider);
        assertCurrentUser(auth, user);
        await linkWithCredential(user, EmailAuthProvider.credential(options.emailLogin.email, options.emailLogin.password));
        assertCurrentUser(auth, user);
        await options.success?.({ idToken: '', mode: options.mode, user });
        assertCurrentUser(auth, user);
        return;
      }
      const result =
        options.mode === 'new' ? await signInWithPopup(auth, provider) : await linkWithPopup(requireUser(expectedUser), provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.idToken) throw new Error('kit Google login: ID token is missing');
      idToken = credential.idToken;
      user = result.user;
    } else {
      await initialize(options.clientId);
      idToken = (await GoogleSignIn.signIn()).idToken;
      assertCurrentUser(auth, expectedUser);
      const credential = GoogleAuthProvider.credential(idToken);
      if (options.mode === 'new') user = (await signInWithCredential(auth, credential)).user;
      else {
        user = requireUser(expectedUser);
        if (options.mode === 'link') await linkWithCredential(user, credential);
        else if (options.mode === 'reauthenticate') {
          await reauthenticateWithCredential(user, credential);
          assertCurrentUser(auth, user);
          await options.success?.({ idToken, mode: options.mode, user });
          assertCurrentUser(auth, user);
          return;
        } else {
          await reauthenticateWithCredential(user, credential);
          assertCurrentUser(auth, user);
          await linkWithCredential(user, EmailAuthProvider.credential(options.emailLogin.email, options.emailLogin.password));
          assertCurrentUser(auth, user);
          await options.success?.({ idToken, mode: options.mode, user });
          assertCurrentUser(auth, user);
          return;
        }
      }
    }
    assertCurrentUser(auth, user);
    await options.exchange?.(idToken, user);
    assertCurrentUser(auth, user);
    await options.success?.({ idToken, mode: options.mode, user });
    assertCurrentUser(auth, user);
  };
  return execute()
    .then(
      () => ({ status: true }),
      async (error: unknown) => {
        await options.error?.(classify(error), error);
        return { status: false };
      },
    )
    .finally(() => options.finally?.());
};

/** Best-effort native Google SDK sign-out. */
export const kitGoogleLogout = (): Promise<void> => GoogleSignIn.signOut().catch(() => undefined);
