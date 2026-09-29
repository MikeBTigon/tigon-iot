/** Helpers for setting up team phones (phone number, location, Facebook account). */
import { DEALERSHIP_BY_ID } from '../mp/constants';
import type { DeviceDoc } from '../mp/types';

/** Next free phone number, 4 digits: 0001, 0002, … (numbers of revoked phones are free again). */
export function nextDeviceNumber(devices: DeviceDoc[]): string {
  const used = new Set(devices.filter((d) => d.status !== 'revoked' && d.deviceNumber).map((d) => d.deviceNumber));
  for (let n = 1; n < 10000; n++) {
    const s = String(n).padStart(4, '0');
    if (!used.has(s)) return s;
  }
  return '';
}

export const locationLabel = (id?: string) => (id ? DEALERSHIP_BY_ID[id]?.name || id : '');

/** "#0003 · Hatfield PA · Marketplace – Victoria" */
export const phoneSummary = (d: Pick<DeviceDoc, 'deviceNumber' | 'locationId' | 'accountName'>) =>
  [d.deviceNumber ? `#${d.deviceNumber}` : '', locationLabel(d.locationId), d.accountName || ''].filter(Boolean).join(' · ');
