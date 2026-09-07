import type { Auth, User } from 'firebase/auth';
import { FacebookAuthProvider, OAuthProvider } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { FacebookLogin } from '@capacitor-community/facebook-login';
import { applyOAuthCredential, assertCurrentUser, classifyOAuthError } from '@rdlabo/ionic-angular-kit/auth-firebase/internal';
import type { KitOAuthMode, KitOAuthModeName, KitSocialHooks } from '@rdlabo/ionic-angular-kit/auth-firebase/internal';

/** Facebook login options. Permissions and app effects are owned by the consumer. */
export type KitFacebookLoginOptions = KitOAuthMode &
  KitSocialHooks<{ accessToken: string; mode: KitOAuthModeName; user: User }> & {
    permissions: string[];
  };

const generateNonce = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, '0')).join('');

/** Await one animation frame where available (iOS WebView crash workaround; no-op off-browser). */
const nextFrame = (): Promise<void> =>
  new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      resolve();
    }
  });

/** Web plugin cancellation shape: the login promise rejects with a response whose token is null. */
const isFacebookCancellation = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null || !('accessToken' in error)) {
    return false;
  }
  const { accessToken } = error;
  if (typeof accessToken !== 'object' || accessToken === null || !('token' in accessToken)) {
    return false;
  }
  return accessToken.token === null;
};

/** Facebook login/link with a pinned Firebase user and classified failure hooks. */
export const kitFacebookLogin = async (auth: Auth, options: KitFacebookLoginOptions): Promise<{ status: boolean }> => {
  const expectedUser = auth.currentUser;
  const execute = async (): Promise<void> => {
    await options.before?.();
    assertCurrentUser(auth, expectedUser);
    const nonce = generateNonce();
    const event = await FacebookLogin.login({ permissions: options.permissions, nonce }).finally(nextFrame);
    if (!event?.accessToken?.token) throw Object.assign(new Error('Facebook login cancelled'), { code: 'auth/user-cancelled' });
    const accessToken = event.accessToken.token;
    const credential =
      Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
        ? new OAuthProvider('facebook.com').credential({ rawNonce: nonce, idToken: accessToken })
        : FacebookAuthProvider.credential(accessToken);
    const user = await applyOAuthCredential(auth, credential, options, expectedUser);
    await options.success?.({ accessToken, mode: options.mode, user });
    assertCurrentUser(auth, user);
  };
  return execute()
    .then(
      () => ({ status: true }),
      async (error: unknown) => {
        await options.error?.(isFacebookCancellation(error) ? 'cancelled' : classifyOAuthError(error), error);
        return { status: false };
      },
    )
    .finally(() => options.finally?.());
};

/**
 * Log out of the Facebook SDK (best-effort; errors are ignored).
 *
 * @remarks
 * Apps that offer Facebook login typically call this alongside the Firebase sign-out, so it lives
 * here to keep the `@capacitor-community/facebook-login` import out of the app.
 * Skips the call when the Facebook SDK has no active session — otherwise `FB.logout()` logs
 * "called without an access token" on web and native rejects for email/password users.
 */
export const kitFacebookLogout = async (): Promise<void> => {
  const session = await FacebookLogin.getCurrentAccessToken().catch(() => null);
  if (!session?.accessToken?.token) {
    return;
  }
  await FacebookLogin.logout().catch(() => undefined);
};
