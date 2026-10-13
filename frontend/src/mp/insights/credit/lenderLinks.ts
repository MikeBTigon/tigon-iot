// Insights — lenders' own online applications (/mp/credit-app). "Apply" opens the lender's form in its own
// window; on computers the Tigon Poster extension (mp-assistant/poster/lender-autofill.js) fills the customer's
// details into it. Browsers never let one site type into another site's form, so without the extension the
// salesperson copies each detail with the copy buttons instead. Nobody's SSN or date of birth passes through IOT.
import { posterVersion } from '../../posterBridge';
import type { CreditApp } from './creditShared';

export interface LenderLink {
  id: string;
  name: string;
  url: string;
  /** What the lender is for (shown on the card). */
  note: string;
}

export const LENDER_LINKS: LenderLink[] = [
  { id: 'sheffield', name: 'Sheffield', url: 'https://prequalify.sheffieldfinancial.com/Apply/Dealer/56712?source=web', note: 'Pre-qualify — promo rates on new carts' },
  { id: 'heartland', name: 'Heartland', url: 'https://blirentals.com/app/TIGON_GOLFCARTS_LLC', note: 'Rent-to-own / lease' },
  { id: 'dll', name: 'DLL', url: 'https://applynow-cica-prd.dllgroup.com/?entityId=4&dealerCode=015639', note: 'Any year cart, new or used' },
  { id: 'roadrunner', name: 'Roadrunner', url: 'https://octane.co/flex/034170', note: 'Building credit — approvals from 550, soft pull' },
  {
    id: 'univest', name: 'Univest',
    url: 'https://form.jotform.com/UnivestCapital/credit-application-bakos?utm_source=TIGON+Golf+Carts&utm_medium=Financing&utm_campaign=Business&utm_term=Best+Golf+Cart+Financing',
    note: 'Business / commercial financing',
  },
  { id: 'dealerdirect', name: 'Dealer Direct', url: 'https://dealerdirect.apptraker.com/my/guest?dealer=10735', note: 'Promo rates on new carts' },
];

/** First extension version with lender autofill. */
export const LENDER_FILL_MIN_VERSION = '2.3.0';

const newer = (a: string, b: string) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return true;
};
/** True when this computer's Tigon Poster extension can fill lender forms. */
export const canAutofillLenders = () => {
  const v = posterVersion();
  return !!v && newer(v, LENDER_FILL_MIN_VERSION);
};

/** Customer details the extension types into a lender's form (also the copy list). */
export interface LenderFill {
  firstName: string; lastName: string; phone: string; email: string;
  street: string; unit: string; city: string; state: string; zip: string;
  yearsAtAddress: string; monthsAtAddress: string; housing: string; housingPayment: string;
  employer: string; jobTitle: string; yearsOnJob: string; monthsOnJob: string;
  monthlyIncome: string; annualIncome: string; downPayment: string;
}

const s = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());
const n = (v: unknown) => (Number(v) > 0 ? String(Math.round(Number(v))) : '');

export function fillFromApp(a: CreditApp): LenderFill {
  return {
    firstName: s(a.firstName), lastName: s(a.lastName), phone: s(a.phone).replace(/\D/g, '').replace(/^1(\d{10})$/, '$1'), email: s(a.email),
    street: s(a.street), unit: s(a.unit), city: s(a.city), state: s(a.state).toUpperCase(), zip: s(a.zip),
    yearsAtAddress: s(a.yearsAtAddress ?? ''), monthsAtAddress: s(a.monthsAtAddress ?? ''), housing: s(a.housing), housingPayment: n(a.housingPayment),
    employer: s(a.employer), jobTitle: s(a.jobTitle), yearsOnJob: s(a.yearsOnJob ?? ''), monthsOnJob: s(a.monthsOnJob ?? ''),
    monthlyIncome: n(a.monthlyIncome), annualIncome: n((Number(a.monthlyIncome) || 0) * 12), downPayment: n(a.downPayment),
  };
}

/** Only what a lead has (name, phone, email). */
export function fillFromLead(l: { name: string; phone: string; email: string }): LenderFill {
  const parts = l.name.trim().split(/\s+/);
  return {
    ...fillFromApp({} as CreditApp),
    firstName: parts[0] || '', lastName: parts.slice(1).join(' '), phone: l.phone.replace(/\D/g, '').replace(/^1(\d{10})$/, '$1'), email: l.email,
  };
}

export const FILL_LABELS: Array<[keyof LenderFill, string]> = [
  ['firstName', 'First name'], ['lastName', 'Last name'], ['phone', 'Phone'], ['email', 'Email'],
  ['street', 'Street'], ['unit', 'Apt / unit'], ['city', 'City'], ['state', 'State'], ['zip', 'ZIP'],
  ['yearsAtAddress', 'Years at address'], ['monthsAtAddress', 'Months at address'], ['housing', 'Own / rent'], ['housingPayment', 'Rent / mortgage per month'],
  ['employer', 'Employer'], ['jobTitle', 'Job title'], ['yearsOnJob', 'Years on job'], ['monthsOnJob', 'Months on job'],
  ['monthlyIncome', 'Monthly income'], ['annualIncome', 'Yearly income'], ['downPayment', 'Down payment'],
];

/**
 * Hands the customer's details to the extension (kept 30 minutes, for that lender only), then opens the lender's
 * form in its own window. The form fills itself in; the salesperson checks it and the customer adds SSN / DOB.
 */
export function openLender(lender: LenderLink, fill: LenderFill | null, customerName = '') {
  if (fill && canAutofillLenders()) {
    window.postMessage({
      source: 'tigon-iot', type: 'TIGON_SEND_CREDIT', id: `${lender.id}-${Date.now()}`,
      payload: { lender: lender.name, host: new URL(lender.url).hostname, name: customerName, fields: fill },
    }, window.location.origin);
  }
  const w = Math.min(1200, window.screen.availWidth - 40);
  const h = Math.min(950, window.screen.availHeight - 60);
  const win = window.open(lender.url, `tigon-lender-${lender.id}`, `popup=yes,width=${w},height=${h},left=20,top=20`);
  if (!win) window.open(lender.url, '_blank', 'noopener');
}
