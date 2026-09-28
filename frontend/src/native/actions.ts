// Small cross-platform actions used by the posting flow.
import { isNativeApp } from './platform';

/** Copies text to the clipboard (native clipboard in the phone app). */
export async function copyText(text: string): Promise<void> {
  if (isNativeApp()) {
    const { Clipboard } = await import('@capacitor/clipboard');
    await Clipboard.write({ string: text });
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

/** Opens a URL outside the app (the Facebook app picks up facebook.com links when installed). */
export async function openExternal(url: string): Promise<void> {
  if (isNativeApp()) {
    const { AppLauncher } = await import('@capacitor/app-launcher');
    await AppLauncher.openUrl({ url });
    return;
  }
  window.open(url, '_blank', 'noopener');
}
