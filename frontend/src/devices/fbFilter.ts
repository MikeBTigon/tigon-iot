// Which phone notifications reach the dashboard: Facebook messages, Messenger chats and DMs only.
// KEEP IN SYNC with functions/src/fbFilter.ts and the Android listener (EchoListenerService.java).

/** Messenger / Business inbox apps: every notification is a chat or DM. */
export const MESSAGE_APPS = ['com.facebook.orca', 'com.facebook.mlite', 'com.facebook.pages.app'];
/** Facebook apps: only their message notifications (Marketplace / Page messages), not likes, friend requests, … */
export const FACEBOOK_APPS = ['com.facebook.katana', 'com.facebook.lite'];

const MESSAGE_TEXT = /(sent you a message|sent a message|messaged you|new message|new messages|replied to your message|replied to you|message about|messages about|is interested in your|asked about your|marketplace message|sent you a photo|sent an attachment|sent a voice|sent a link|reacted to your message|unread message|chat)/i;
const NOT_MESSAGE = /(friend request|waiting for you|commented|reacted to your (post|photo|comment)|birthday|memories|posted|went live|tagged you|shared a|new notifications|updates about|catch up|suggested for you|people you may know|added to their story|liked your)/i;

/** True when a notification from `pkg` (Android package) or labelled `app` is a Facebook message / chat / DM. */
export function isFacebookMessage(pkg: string, app: string, title: string, text: string, category = ''): boolean {
  const p = (pkg || '').toLowerCase();
  const a = (app || '').toLowerCase();
  const body = `${title} ${text}`;
  const messengerApp = MESSAGE_APPS.includes(p) || (!p && /messenger|business suite|pages manager/.test(a));
  if (messengerApp) return !/^(chat heads|messenger is running|checking for new messages)/i.test(body.trim());
  const facebookApp = FACEBOOK_APPS.includes(p) || (!p && /^facebook( lite)?$/.test(a));
  if (!facebookApp) return false;
  if (category === 'msg') return true;
  return MESSAGE_TEXT.test(body) && !NOT_MESSAGE.test(body);
}
