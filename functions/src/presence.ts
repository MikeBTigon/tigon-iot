// Phone online time: mp_device_online/{deviceId}_{YYYYMMDD} (New York day) with one key per 5-minute slot the phone
// checked in (slots: {"0": true … "287": true}). Hours = slots × 5 min. Written by the phone's background check-in
// (mpEcho ping) and by the app while it is open.
import * as admin from 'firebase-admin';

export const ONLINE = 'mp_device_online';
export const SLOT_MIN = 5;
export const SLOTS_PER_DAY = (24 * 60) / SLOT_MIN;
export const TZ = 'America/New_York';

const parts = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** New York calendar day + 5-minute slot of a moment. */
export function nySlot(ms: number): {day: string; date: string; slot: number} {
  const p: Record<string, string> = {};
  for (const x of parts.formatToParts(new Date(ms))) p[x.type] = x.value;
  const date = `${p.year}-${p.month}-${p.day}`;
  const slot = Math.floor((Number(p.hour) * 60 + Number(p.minute)) / SLOT_MIN);
  return {day: date.replace(/-/g, ''), date, slot: Math.min(SLOTS_PER_DAY - 1, slot)};
}

/** Marks the phone online for the 5-minute slot containing `at`. */
export async function markOnline(deviceId: string, userId: string, at = Date.now()) {
  const {day, date, slot} = nySlot(at);
  await admin.firestore().collection(ONLINE).doc(`${deviceId}_${day}`).set(
    {deviceId, userId, date, slots: {[String(slot)]: true}, updatedAt: Date.now()}, {merge: true});
}

/** Hours online in one day doc. */
export const hoursOf = (slots: Record<string, unknown> | undefined) => (Object.keys(slots || {}).length * SLOT_MIN) / 60;
