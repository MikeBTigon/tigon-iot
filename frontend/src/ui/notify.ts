// Small app-wide message ("5 photos saved to your Gallery"). Shown by <NotifyHost /> in the page layout.
export type NotifyTone = 'success' | 'info' | 'warning' | 'error';
export const NOTIFY_EVENT = 'tigon-notify';

export function notify(text: string, tone: NotifyTone = 'info') {
  window.dispatchEvent(new CustomEvent(NOTIFY_EVENT, { detail: { text, tone } }));
}
