// "Sell more" release — team settings for every sales feature (mp_settings/sales, admins write).
// Mirrors frontend/src/mp/sales/salesTypes.ts (SalesSettings). Every field has a default, so features work
// before anyone opens the settings page.
import * as admin from 'firebase-admin';

export type WeekDay = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';
/** Open hours for one day: "09:00"–"18:00" (New York time). null = closed. */
export type DayHours = {open: string; close: string} | null;

export interface CadenceStep {
  /** Days after the lead came in. */
  day: number;
  channel: 'sms' | 'call' | 'email';
  /** Placeholders: {first} {name} {cart} {store} {storePhone} {salesperson} {link} */
  template: string;
}

export interface ServiceStep {
  /** Months after the sale. */
  months: number;
  kind: 'battery' | 'accessories' | 'upgrade' | 'checkup';
  template: string;
}

export interface LenderLink {name: string; url: string; note?: string}

export interface SalesSettings {
  /** 1. Speed to lead: alert the owner/managers when a new lead hasn't been answered after these minutes. */
  speed: {enabled: boolean; alertMinutes: number[]; notifyManagers: boolean};
  /** 4. Round-robin assignment among the store's online salespeople, with a claim window. */
  assignment: {mode: 'off' | 'round_robin'; claimMinutes: number; onlineOnly: boolean};
  /** 19. Daily "who to call today" list, sent at this New York hour. */
  dailyList: {enabled: boolean; hour: number};
  /** 3. Facebook "message about your listing" notifications become leads. */
  fbLeads: {enabled: boolean};
  /** Texting: how texts are sent. 'phone' = from the store's texting phone (TIGON IOT app); 'twilio' = Twilio. */
  sms: {
    provider: 'phone' | 'twilio';
    /** storeId → deviceId of the phone that sends that store's texts. */
    senderDeviceByStore: Record<string, string>;
    /** Fallback phone for stores without their own. */
    defaultSenderDeviceId: string;
    /** storeId → Twilio number (+1…). */
    twilioFromByStore: Record<string, string>;
    twilioDefaultFrom: string;
    /** No automatic texts between these New York hours (e.g. 21 → 8). Manual texts still go. */
    quietStart: number;
    quietEnd: number;
  };
  /** 2. Instant auto-text to new website leads. */
  autoText: {enabled: boolean; template: string; channels: string[]};
  /** 5. Missed-call text-back. */
  missedCall: {enabled: boolean; template: string; createLead: boolean};
  /** 10. Follow-up cadence for leads that haven't bought. */
  cadence: {enabled: boolean; steps: CadenceStep[]};
  /** 20. After-sale service / accessory / upgrade follow-ups. */
  service: {enabled: boolean; steps: ServiceStep[]};
  /** 6. Pre-qualification. */
  prequal: {enabled: boolean; lenders: LenderLink[]; intro: string};
  /** 7. Quote links. */
  quotes: {enabled: boolean; expireDays: number};
  /** 8. Trade-in estimates: value of a cart = base × (1 − yearlyDrop)^age × condition factor. */
  tradeIn: {
    enabled: boolean;
    /** Brand (lowercase) → typical value of a 1-year-old cart in good condition. '_default' for others. */
    baseValues: Record<string, number>;
    yearlyDropPct: number;
    conditionFactor: {excellent: number; good: number; fair: number; poor: number};
    /** Shown as ± around the estimate. */
    rangePct: number;
  };
  /** 9. Test drive / visit booking. */
  booking: {
    enabled: boolean;
    slotMinutes: number;
    hours: Record<WeekDay, DayHours>;
    /** How many bookings may share one time slot at one store. */
    perSlot: number;
    reminderTemplate: string;
    noShowTemplate: string;
  };
  /** 11. Price drop alerts. */
  priceDrop: {enabled: boolean; minDropPct: number; template: string};
  /** 12. Aged inventory. */
  aged: {flagDays: number; urgentDays: number; suggestedCutPct: number};
  /** 13. Sold cart cleanup + similar carts. */
  soldSimilar: {enabled: boolean; template: string};
  /** 16. Google reviews: Google Place id per store; alert on new reviews at or below this star rating. */
  reviews: {enabled: boolean; placeIds: Record<string, string>; alertAtOrBelow: number};
  /** 17. Referrals. */
  referral: {enabled: boolean; rewardAmount: number; template: string};
}

const HOURS_9_6: DayHours = {open: '09:00', close: '18:00'};

export const DEFAULT_SALES_SETTINGS: SalesSettings = {
  speed: {enabled: true, alertMinutes: [5, 15], notifyManagers: true},
  assignment: {mode: 'off', claimMinutes: 5, onlineOnly: true},
  dailyList: {enabled: true, hour: 8},
  fbLeads: {enabled: true},
  sms: {
    provider: 'phone', senderDeviceByStore: {}, defaultSenderDeviceId: '', twilioFromByStore: {}, twilioDefaultFrom: '',
    quietStart: 21, quietEnd: 8,
  },
  autoText: {
    enabled: false,
    template: 'Hi {first}, thanks for reaching out to TIGON Golf Carts {store}! This is {salesperson}. ' +
      'Is the {cart} still the one you\'re looking at? Text or call me at {storePhone}.',
    channels: ['website', 'dba_website'],
  },
  missedCall: {
    enabled: false,
    template: 'Sorry we missed your call at TIGON Golf Carts {store}! Want us to text you prices and pictures? Just reply here.',
    createLead: true,
  },
  cadence: {
    enabled: true,
    steps: [
      {day: 1, channel: 'sms', template: 'Hi {first}, it\'s {salesperson} from TIGON {store}. Any questions about the {cart}? Happy to send more photos or a video.'},
      {day: 3, channel: 'call', template: 'Call {first} — ask what they liked and if financing would help.'},
      {day: 7, channel: 'sms', template: 'Hi {first}, we have some great options this week at TIGON {store}. Want me to send a few that match what you\'re looking for?'},
      {day: 14, channel: 'sms', template: 'Hi {first}, still shopping for a golf cart? Monthly payments start low with approved credit — want a quick quote?'},
      {day: 30, channel: 'sms', template: 'Hi {first}, checking in from TIGON {store}. If the timing is better now, I\'d love to help you find the right cart.'},
    ],
  },
  service: {
    enabled: true,
    steps: [
      {months: 6, kind: 'battery', template: 'Hi {first}, it\'s TIGON {store}. Your cart is 6 months old — time for a quick battery check. Want to set a time?'},
      {months: 12, kind: 'checkup', template: 'Hi {first}, your golf cart is a year old! Book a yearly check-up at TIGON {store} and keep it running great.'},
      {months: 9, kind: 'accessories', template: 'Hi {first}, upgrade your cart for the season — lift kits, enclosures, new seats and more at TIGON {store}. Want to see options?'},
      {months: 30, kind: 'upgrade', template: 'Hi {first}, thinking about a newer cart? Your current one may be worth more than you think on trade. Want a quick value?'},
    ],
  },
  prequal: {
    enabled: true,
    lenders: [
      {name: 'Roadrunner Financial', url: '', note: 'Soft-pull pre-qualification, approvals from 550 credit score'},
      {name: 'Sheffield Financial', url: ''},
      {name: 'Dealer Direct', url: ''},
      {name: 'DLL Financing', url: ''},
    ],
    intro: 'See what you qualify for in about 2 minutes. Checking does not affect your credit score.',
  },
  quotes: {enabled: true, expireDays: 30},
  tradeIn: {
    enabled: true,
    baseValues: {_default: 7000, evolution: 10500, icon: 8500, epic: 8500, tara: 9500, denago: 8500, teko: 8000, 'club car': 8000, 'ez-go': 7500, yamaha: 7500},
    yearlyDropPct: 12,
    conditionFactor: {excellent: 1.1, good: 1, fair: 0.82, poor: 0.6},
    rangePct: 12,
  },
  booking: {
    enabled: true,
    slotMinutes: 30,
    hours: {sun: null, mon: HOURS_9_6, tue: HOURS_9_6, wed: HOURS_9_6, thu: HOURS_9_6, fri: HOURS_9_6, sat: {open: '09:00', close: '16:00'}},
    perSlot: 2,
    reminderTemplate: 'Hi {first}, reminder: your visit at TIGON Golf Carts {store} is {when}. Address: {address}. Reply here if you need to change it.',
    noShowTemplate: 'Hi {first}, we missed you at TIGON {store} today. Want to pick a new time? {link}',
  },
  priceDrop: {
    enabled: true, minDropPct: 2,
    template: 'Good news {first}! The {cart} you asked about just dropped to {price} at TIGON {store}. Want to come see it? {link}',
  },
  aged: {flagDays: 45, urgentDays: 60, suggestedCutPct: 5},
  soldSimilar: {
    enabled: true,
    template: 'Hi {first}, the {cart} you asked about just sold — but here are a few similar carts in stock at TIGON: {link}',
  },
  reviews: {enabled: true, placeIds: {}, alertAtOrBelow: 3},
  referral: {
    enabled: true, rewardAmount: 100,
    template: 'Thanks for buying from TIGON {store}, {first}! Know someone who wants a golf cart? Share your link — you get ${reward} when they buy: {link}',
  },
};

type Json = Record<string, any>;

/** Deep-merges saved settings over the defaults (arrays and maps from the saved doc replace the defaults). */
function merge<T>(base: T, saved: unknown): T {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved) || !base || typeof base !== 'object' || Array.isArray(base)) {
    return (saved === undefined || saved === null ? base : saved) as T;
  }
  const out: Json = {...(base as Json)};
  for (const [k, v] of Object.entries(saved as Json)) {
    const b = (base as Json)[k];
    out[k] = b && typeof b === 'object' && !Array.isArray(b) && Object.keys(b).length && v && typeof v === 'object' && !Array.isArray(v) ?
      merge(b, v) : v;
  }
  return out as T;
}

let cache: {at: number; value: SalesSettings} | null = null;

/** mp_settings/sales with defaults; cached for 60 seconds per instance. */
export async function loadSalesSettings(fresh = false): Promise<SalesSettings> {
  if (!fresh && cache && Date.now() - cache.at < 60_000) return cache.value;
  const snap = await admin.firestore().collection('mp_settings').doc('sales').get();
  const value = merge(DEFAULT_SALES_SETTINGS, snap.exists ? snap.data() : undefined);
  cache = {at: Date.now(), value};
  return value;
}
