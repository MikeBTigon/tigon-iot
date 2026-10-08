// Track 2 — Texting (ideas 2, 5, 10, 20): delivery of mp_sms (texting phone or Twilio), STOP handling, replies,
// instant auto-text to new leads, missed-call text-back, follow-up cadences → tasks, after-sale service reminders.
// Signatures are called from hooks.ts / echoHooks.ts / mpEcho — keep them. Add this track's own triggers below
// and export them from sales/index.ts.
import type {SalesSettings} from './settings';
import type {Json} from './util';

/** New lead (after assignment): auto-text, cadence enrollment. */
export async function onNewLeadTexting(_id: string, _lead: Json, _s: SalesSettings): Promise<void> {
  return;
}

/** Lead changed (e.g. sold → service reminders; lost/sold → stop cadence). */
export async function onLeadUpdatedTexting(_id: string, _before: Json, _after: Json, _s: SalesSettings): Promise<void> {
  return;
}

/** Every 5 minutes: due cadence steps → tasks / texts; due service reminders; Twilio retries. */
export async function textingTick(_now: number, _s: SalesSettings): Promise<void> {
  return;
}

/** A forwarded phone notification: missed call → text-back (+ lead). Return true if handled. */
export async function missedCallEcho(_dev: Json, _deviceId: string, _item: Json, _s: SalesSettings): Promise<boolean> {
  return false;
}

/** Texting phone check-in: texts this phone should send now (max 10). Marks them 'sending'. */
export async function pendingSmsFor(_deviceId: string): Promise<Json[]> {
  return [];
}

/** Texting phone reports: [{id, ok, error?}]. */
export async function recordSmsResults(_deviceId: string, _results: Json[]): Promise<void> {
  return;
}
