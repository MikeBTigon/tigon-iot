/** Plain-English messages for Firebase sign-in errors. */
export function authErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code || '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials':
      return 'Email or password is not right. Check the email (no spaces) and the password — capital letters matter. '
        + 'Forgot it? Tap "Forgot password?" below.';
    case 'auth/too-many-requests':
      return 'Too many wrong tries, so Firebase paused sign-in for this account for a while (this is a security lock). '
        + 'Tap "Forgot password?" to set a new password — that unlocks it right away — or wait about 15–30 minutes. '
        + 'Tip: set up phones with the QR code from the computer (Devices → Set up a phone), no password needed.';
    case 'auth/invalid-email':
      return 'That email address is not valid. Use your full @tigongolfcarts.com address.';
    case 'auth/user-disabled':
      return 'This account is turned off. Ask an admin.';
    case 'auth/network-request-failed':
      return 'No internet connection. Check Wi-Fi / mobile data and try again.';
    case 'auth/email-already-in-use':
      return 'This email already has an account — log in instead. One account works on as many phones as you need.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    default:
      return e instanceof Error ? e.message : String(e);
  }
}

/** Emails typed on phones often get a capital letter or a trailing space. */
export const cleanEmail = (s: string) => s.trim().toLowerCase();
