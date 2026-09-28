// Saving/sharing files: phone app → app cache + share sheet; browser → download.
import Papa from 'papaparse';
import { isNativeApp } from '../../native/platform';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Safe file name (keeps the extension). */
export const safeFileName = (name: string) => name.replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').slice(0, 120) || 'file';

/** Saves a blob: share sheet in the phone app ("Save to Files", Drive, email…), a download in the browser. */
export async function saveBlob(name: string, blob: Blob): Promise<void> {
  const fileName = safeFileName(name);
  if (isNativeApp()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const saved = await Filesystem.writeFile({
      path: `exports/${fileName}`,
      data: await blobToBase64(blob),
      directory: Directory.Cache,
      recursive: true,
    });
    await Share.share({ title: fileName, files: [saved.uri] });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Downloads rows as a CSV (UTF-8 with BOM so Excel shows accents correctly). */
export async function saveCsv(name: string, rows: Array<Record<string, unknown>>, columns?: string[]): Promise<void> {
  const csv = Papa.unparse(rows, columns ? { columns } : undefined);
  await saveBlob(name.endsWith('.csv') ? name : `${name}.csv`, new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
}

/** Fetches a URL and saves it (falls back to opening it when the download is blocked, e.g. by CORS). */
export async function saveUrl(name: string, url: string): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await saveBlob(name, await res.blob());
  } catch (e) {
    console.warn('Download failed, opening instead', e);
    window.open(url, '_blank', 'noopener');
  }
}

/** Native/Web share of a file URL; falls back to the link. Returns false when nothing could share it. */
export async function shareUrl(title: string, url: string): Promise<boolean> {
  if (isNativeApp()) {
    const { Share } = await import('@capacitor/share');
    await Share.share({ title, url });
    return true;
  }
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/** Local date/time for CSV cells ('' when missing). */
export const csvDate = (ts: number | undefined) => (ts ? new Date(ts).toLocaleString() : '');

/** "12.3 MB" */
export function formatBytes(n: number): string {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}
