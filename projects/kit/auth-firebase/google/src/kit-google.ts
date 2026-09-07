import { ErrorCode, GoogleSignIn } from '@capawesome/capacitor-google-sign-in';
import { Capacitor } from '@capacitor/core';
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

export type KitGoogleLoginMode =
  | { mode: 'new' }
  | { mode: 'link' }
  | { mode: 'reauthenticate' }
  | { mode: 'credential'; emailLogin: { email: string; password: string } };
export type KitGoogleErrorCategory = 'already-in-use' | 'cancelled' | 'other';
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

const requireUser = (auth: Auth): User => {
  if (!auth.currentUser) throw new Error('kit Google login: no signed-in Firebase user');
  return auth.currentUser;
};

const classify = (error: unknown): KitGoogleErrorCategory => {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'auth/credential-already-in-use') return 'already-in-use';
  if (
    code === ErrorCode.SignInCanceled ||
    code === 'auth/user-cancelled' ||
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request'
  )
    return 'cancelled';
  return 'other';
};

export const kitGoogleLogin = async (auth: Auth, options: KitGoogleLoginOptions): Promise<{ status: boolean }> => {
  const execute = async (): Promise<void> => {
    await options.before?.();
    const expectedUser = auth.currentUser;
    let idToken: string;
    let user: User;
    if (Capacitor.getPlatform() === 'web') {
      const provider = new GoogleAuthProvider();
      if (options.mode === 'reauthenticate') {
        user = requireUser(auth);
        const result = await reauthenticateWithPopup(user, provider);
        idToken = GoogleAuthProvider.credentialFromResult(result)?.idToken ?? '';
        await options.success?.({ idToken, mode: options.mode, user });
        return;
      }
      if (options.mode === 'credential') {
        user = requireUser(auth);
        await reauthenticateWithPopup(user, provider);
        await linkWithCredential(user, EmailAuthProvider.credential(options.emailLogin.email, options.emailLogin.password));
        await options.success?.({ idToken: '', mode: options.mode, user });
        return;
      }
      const result = options.mode === 'new' ? await signInWithPopup(auth, provider) : await linkWithPopup(requireUser(auth), provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.idToken) throw new Error('kit Google login: ID token is missing');
      idToken = credential.idToken;
      user = result.user;
    } else {
      await initialize(options.clientId);
      idToken = (await GoogleSignIn.signIn()).idToken;
      const credential = GoogleAuthProvider.credential(idToken);
      if (options.mode === 'new') user = (await signInWithCredential(auth, credential)).user;
      else {
        user = requireUser(auth);
        if (user !== expectedUser) throw new Error('kit Google login: Firebase user changed');
        if (options.mode === 'link') await linkWithCredential(user, credential);
        else if (options.mode === 'reauthenticate') {
          await reauthenticateWithCredential(user, credential);
          await options.success?.({ idToken, mode: options.mode, user });
          return;
        } else {
          await reauthenticateWithCredential(user, credential);
          await linkWithCredential(user, EmailAuthProvider.credential(options.emailLogin.email, options.emailLogin.password));
          await options.success?.({ idToken, mode: options.mode, user });
          return;
        }
      }
    }
    if (auth.currentUser !== user) throw new Error('kit Google login: Firebase user changed');
    await options.exchange?.(idToken, user);
    if (auth.currentUser !== user) throw new Error('kit Google login: Firebase user changed');
    await options.success?.({ idToken, mode: options.mode, user });
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

export const kitGoogleLogout = (): Promise<void> => GoogleSignIn.signOut().catch(() => undefined);
