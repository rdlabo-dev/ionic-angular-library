import type { Auth, AuthCredential, User } from 'firebase/auth';
import { EmailAuthProvider, linkWithCredential, reauthenticateWithCredential, signInWithCredential } from 'firebase/auth';

/** The app-facing classification of a social authentication failure. */
export type KitOAuthErrorCategory = 'already-in-use' | 'cancelled' | 'other';
/** Sign in, link a provider, or reauthenticate before adding email/password login. */
export type KitOAuthMode = { mode: 'new' } | { mode: 'link' } | { mode: 'credential'; emailLogin: { email: string; password: string } };
/** The discriminator of a social authentication operation. */
export type KitOAuthModeName = KitOAuthMode['mode'];

/** App-owned effects. Failures in before/success are reported to error; finally always runs.
 * A handled failure returns status:false. A failure in error/finally itself rejects the call.
 */
export interface KitSocialHooks<Info> {
  before?: () => void | Promise<unknown>;
  success?: (info: Info) => void | Promise<unknown>;
  error?: (category: KitOAuthErrorCategory, error: unknown) => void | Promise<unknown>;
  finally?: () => void | Promise<unknown>;
}

/** @internal Classify Firebase SDK failures without inspecting localized messages. */
export const classifyOAuthError = (error: unknown): KitOAuthErrorCategory => {
  const code = (error as { code?: string | number } | null)?.code;
  if (code === 'auth/credential-already-in-use') return 'already-in-use';
  if (code === 'auth/user-cancelled' || code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'cancelled';
  return 'other';
};

/** @internal Require the identity captured at the start of a linking operation. */
export const requireUser = (user: User | null): User => {
  if (!user) throw new Error('kit social: no signed-in user to link/re-authenticate');
  return user;
};

/** @internal Abort follow-up effects if the Firebase identity changed during an await. */
export const assertCurrentUser = (auth: Auth, expectedUser: User | null): void => {
  if (auth.currentUser !== expectedUser) throw new Error('kit social: Firebase user changed');
};

/** @internal Apply a provider credential to the captured user and return the authenticated identity. */
export const applyOAuthCredential = async (
  auth: Auth,
  credential: AuthCredential,
  mode: KitOAuthMode,
  expectedUser: User | null,
): Promise<User> => {
  assertCurrentUser(auth, expectedUser);
  if (mode.mode === 'new') {
    const { user } = await signInWithCredential(auth, credential);
    assertCurrentUser(auth, user);
    return user;
  }
  const user = requireUser(expectedUser);
  if (mode.mode === 'link') await linkWithCredential(user, credential);
  else {
    await reauthenticateWithCredential(user, credential);
    assertCurrentUser(auth, user);
    await linkWithCredential(user, EmailAuthProvider.credential(mode.emailLogin.email, mode.emailLogin.password));
  }
  assertCurrentUser(auth, user);
  return user;
};
