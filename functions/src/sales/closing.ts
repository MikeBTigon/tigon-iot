// Track 3 — Closing tools (ideas 6, 7, 8, 9): pre-qualification, quote links, trade-in estimates, test-drive booking.
// Public pages call publicHandlers through /api/public/<area>/<action> (public.ts).
import type {SalesSettings} from './settings';
import type {PublicHandler} from './publicTypes';

/** Every 5 minutes: appointment reminders (day before + 2 h before), no-show follow-ups. */
export async function appointmentTick(_now: number, _s: SalesSettings): Promise<void> {
  return;
}

/** area → action → handler. Areas: quote, booking, trade, prequal. */
export const closingPublic: Record<string, Record<string, PublicHandler>> = {};
