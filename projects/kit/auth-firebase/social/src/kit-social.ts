import { kitAppleLogin as appleLogin } from '@rdlabo/ionic-angular-kit/auth-firebase/apple';
import type {
  KitAppleLoginOptions as AppleLoginOptions,
  KitAppleResponse as AppleResponse,
  KitOAuthErrorCategory as OAuthErrorCategory,
  KitOAuthMode as OAuthMode,
  KitOAuthModeName as OAuthModeName,
} from '@rdlabo/ionic-angular-kit/auth-firebase/apple';
import { kitFacebookLogin as facebookLogin, kitFacebookLogout as facebookLogout } from '@rdlabo/ionic-angular-kit/auth-firebase/facebook';
import type { KitFacebookLoginOptions as FacebookLoginOptions } from '@rdlabo/ionic-angular-kit/auth-firebase/facebook';

/** @deprecated Import kitAppleLogin from @rdlabo/ionic-angular-kit/auth-firebase/apple. Kept for backwards compatibility. */
export const kitAppleLogin: typeof appleLogin = appleLogin;
/** @deprecated Import kitFacebookLogin from @rdlabo/ionic-angular-kit/auth-firebase/facebook. Kept for backwards compatibility. */
export const kitFacebookLogin: typeof facebookLogin = facebookLogin;
/** @deprecated Import kitFacebookLogout from @rdlabo/ionic-angular-kit/auth-firebase/facebook. Kept for backwards compatibility. */
export const kitFacebookLogout: typeof facebookLogout = facebookLogout;
/** @deprecated Import this type from @rdlabo/ionic-angular-kit/auth-firebase/apple. */
export type KitAppleLoginOptions = AppleLoginOptions;
/** @deprecated Import this type from @rdlabo/ionic-angular-kit/auth-firebase/apple. */
export type KitAppleResponse = AppleResponse;
/** @deprecated Import this type from @rdlabo/ionic-angular-kit/auth-firebase/apple or /facebook. */
export type KitOAuthErrorCategory = OAuthErrorCategory;
/** @deprecated Import this type from @rdlabo/ionic-angular-kit/auth-firebase/apple or /facebook. */
export type KitOAuthMode = OAuthMode;
/** @deprecated Import this type from @rdlabo/ionic-angular-kit/auth-firebase/apple or /facebook. */
export type KitOAuthModeName = OAuthModeName;
/** @deprecated Import this type from @rdlabo/ionic-angular-kit/auth-firebase/facebook. */
export type KitFacebookLoginOptions = FacebookLoginOptions;
