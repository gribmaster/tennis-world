// Auth feature — public surface (Feature 30 / 57).
//
// The auth screens (/signin, /signup, /verify) use a stripped layout (AuthLayout/
// AuthTopBar — NOT AppShell, no Footer) wrapping a client form island.
//
// REAL AUTH (Feature 57): in `api` mode the forms POST `/v1/auth/request-link` (magic
// link) and the /verify island POSTs `/v1/auth/verify` (sets the httpOnly cookie). In MOCK
// mode the forms keep their cosmetic success UX (no API). The transport lives in
// `auth-client.ts`; none of this imports a domain repository (auth is not a domain
// resource). Apple/Google buttons stay inert placeholders (no OAuth — out of scope).

export { AuthLayout } from './AuthLayout';
export type { AuthLayoutProps } from './AuthLayout';

export { AuthTopBar } from './AuthTopBar';

export { SignInForm } from './SignInForm';
export { SignUpForm } from './SignUpForm';
export { VerifyMagicLink } from './VerifyMagicLink';
export { SignOutButton } from './SignOutButton';

export { AppleIcon, ArrowIcon, GoogleIcon, MailIcon } from './AuthIcons';
