// Track 1 — Speed to lead (ideas 1, 3, 4, 19): response timer + alerts, Facebook messages → leads,
// round-robin assignment with claim window, daily "who to call today" list.
// Signatures are called from hooks.ts / echoHooks.ts — keep them.
import type {SalesSettings} from './settings';
import type {Json} from './util';

/** New mp_leads doc: pick the owner (round robin) and set locationId/assignedAt/claimDeadline. Returns fields to merge. */
export async function assignNewLead(_id: string, _lead: Json, _s: SalesSettings): Promise<Json> {
  return {};
}

/** Every 5 minutes: unanswered-lead alerts at each alertMinutes mark; reassign unclaimed leads after claimMinutes. */
export async function speedTick(_now: number, _s: SalesSettings): Promise<void> {
  return;
}

/** Once a day at s.dailyList.hour (New York): each salesperson's call list → one notification. */
export async function dailyCallList(_now: number, _s: SalesSettings): Promise<void> {
  return;
}

/** A phone notification forwarded by the TIGON IOT app. Return true if it was a Facebook buyer message handled here. */
export async function fbMessageEcho(_dev: Json, _deviceId: string, _item: Json, _notificationId: string, _s: SalesSettings): Promise<boolean> {
  return false;
}
