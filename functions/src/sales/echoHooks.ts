// "Sell more" release — phone notifications forwarded by the TIGON IOT app (mpEcho) pass through here first:
// a missed call (T2) or a Facebook buyer message (T1) can become a lead / text-back.
import * as logger from 'firebase-functions/logger';
import {loadSalesSettings} from './settings';
import type {Json} from './util';
import {fbMessageEcho} from './routing';
import {missedCallEcho} from './texting';

/** Missed calls (dialer notifications are not shown on the dashboard). Returns true if the item was a missed call. */
export async function echoBeforeFilter(dev: Json, deviceId: string, item: Json): Promise<boolean> {
  try {
    const s = await loadSalesSettings();
    return await missedCallEcho(dev, deviceId, item, s);
  } catch (e) {
    logger.error('sales: missedCallEcho failed', e);
    return false;
  }
}

/** Facebook messages that were saved as dashboard notifications (`notificationId`). */
export async function echoAfterSave(dev: Json, deviceId: string, item: Json, notificationId: string): Promise<void> {
  try {
    const s = await loadSalesSettings();
    if (s.fbLeads.enabled) await fbMessageEcho(dev, deviceId, item, notificationId, s);
  } catch (e) {
    logger.error('sales: fbMessageEcho failed', e);
  }
}
