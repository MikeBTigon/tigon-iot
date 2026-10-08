// "Sell more" release — default settings (copy of DEFAULT_SALES_SETTINGS in functions/src/sales/settings.ts;
// keep the two in sync).
import type { DayHours, SalesSettings } from './salesTypes';

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
