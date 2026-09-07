import type { Auth, User } from 'firebase/auth';
import {
  EmailAuthProvider,
  linkWithCredential,
  linkWithPopup,
  OAuthProvider,
  reauthenticateWithPopup,
  signInWithPopup,
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { AppleSignIn, ErrorCode, SignInScope } from '@capawesome/capacitor-apple-sign-in';
import {
  applyOAuthCredential,
  assertCurrentUser,
  classifyOAuthError,
  requireUser,
  runOAuthOperation,
} from '@rdlabo/ionic-angular-kit/auth-firebase/internal';
import type { KitOAuthMode, KitOAuthModeName, KitSocialHooks } from '@rdlabo/ionic-angular-kit/auth-firebase/internal';

/** Apple credentials. Native authorization codes and web access tokens are distinct values. */
export interface KitAppleResponse {
  user: string | null;
  email: string | null;
  givenName: string | null;
  familyName: string | null;
  identityToken: string | null;
  /** One-time authorization code from native Apple sign-in; null on web. */
  authorizationCode: string | null;
  /** Apple access token from the Firebase web popup; null on native.
   * Optional for source compatibility with existing Apple response objects. Kit always supplies it.
   */
  accessToken?: string | null;
}

/** Apple login options. The success hook receives the exact authenticated Firebase user. */
export type KitAppleLoginOptions = KitOAuthMode & KitSocialHooks<{ response: KitAppleResponse; mode: KitOAuthModeName; user: User }>;

const emptyAppleResponse = (): KitAppleResponse => ({
  user: null,
  email: null,
  givenName: null,
  familyName: null,
  identityToken: null,
  authorizationCode: null,
  accessToken: null,
});

const classifyAppleError = (error: unknown) => {
  const code = (error as { code?: string } | null)?.code;
  return code === ErrorCode.SignInCanceled ? 'cancelled' : classifyOAuthError(error);
};

/** Apple sign-in/link on iOS and web. Native Android is not configured by this helper.
 * Pins the user before any asynchronous work and reports SDK and app-hook failures to error.
 */
export const kitAppleLogin = async (auth: Auth, options: KitAppleLoginOptions): Promise<{ status: boolean }> => {
  const expectedUser = auth.currentUser;
  const execute = async (): Promise<void> => {
    await options.before?.();
    assertCurrentUser(auth, expectedUser);
    let response: KitAppleResponse;
    let user: User;
    if (Capacitor.isNativePlatform()) {
      if (Capacitor.getPlatform() !== 'ios') throw new Error('kit Apple login: native platform is not supported');
      const native = await AppleSignIn.signIn({ scopes: [SignInScope.Email, SignInScope.FullName] });
      response = {
        user: native.user,
        email: native.email,
        givenName: native.givenName,
        familyName: native.familyName,
        identityToken: native.idToken,
        authorizationCode: native.authorizationCode,
        accessToken: null,
      };
      if (!response.identityToken) throw new Error('kit Apple login: identity token is missing');
      const credential = new OAuthProvider('apple.com').credential({ idToken: response.identityToken });
      user = await applyOAuthCredential(auth, credential, options, expectedUser);
    } else {
      const provider = new OAuthProvider('apple.com');
      provider.addScope('email');
      provider.addScope('name');
      if (options.mode === 'credential') {
        user = requireUser(expectedUser);
        await reauthenticateWithPopup(user, provider);
        assertCurrentUser(auth, user);
        await linkWithCredential(user, EmailAuthProvider.credential(options.emailLogin.email, options.emailLogin.password));
        response = emptyAppleResponse();
      } else {
        const result =
          options.mode === 'new' ? await signInWithPopup(auth, provider) : await linkWithPopup(requireUser(expectedUser), provider);
        user = result.user;
        const credential = OAuthProvider.credentialFromResult(result);
        response = {
          ...emptyAppleResponse(),
          email: user.email,
          identityToken: credential?.idToken ?? null,
          accessToken: credential?.accessToken ?? null,
        };
      }
    }
    assertCurrentUser(auth, user);
    await options.success?.({ response, mode: options.mode, user });
    assertCurrentUser(auth, user);
  };
  return runOAuthOperation(auth, execute, (error) => options.error?.(classifyAppleError(error), error), options.finally);
};
