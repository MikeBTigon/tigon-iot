// Track 5 — Marketing & managers (ideas 16, 17, 18): Google reviews + new-arrival posts, referral program, sales funnel.
import type {SalesSettings} from './settings';
import type {Json} from './util';
import type {PublicHandler} from './publicTypes';

/** New lead: credit a referral code (lead.referralCode). */
export async function onNewLeadMarketing(_id: string, _lead: Json, _s: SalesSettings): Promise<void> {
  return;
}

/** Lead changed: sold with a referral → reward owed; sold → create the buyer's own referral code. */
export async function onLeadUpdatedMarketing(_id: string, _before: Json, _after: Json, _s: SalesSettings): Promise<void> {
  return;
}

/** Once a day: refresh Google ratings/reviews per store, alert on low-star reviews. */
export async function marketingDaily(_now: number, _s: SalesSettings): Promise<void> {
  return;
}

/** area → action → handler. Area: referral. */
export const marketingPublic: Record<string, Record<string, PublicHandler>> = {};
