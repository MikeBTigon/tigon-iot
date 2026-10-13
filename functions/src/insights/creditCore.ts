// Insights — credit application: input validation, caps and client IP (pure, no Firebase; unit-tested).
// The application never stores Social Security numbers or dates of birth: the lender asks for those securely.
import {createHash} from 'crypto';
import {toE164} from './phone';

export const CONSENT_TEXT = 'I confirm this information is true and authorize TIGON Golf Carts to share it with lenders to find financing. ' +
  'The lender will ask for my SSN and date of birth securely.';

/** Largest JSON body accepted (bytes). */
export const MAX_BODY_BYTES = 16 * 1024;
/** Applications a day from one IP address (public, not signed in). */
export const IP_DAILY_CAP = 5;
/** Applications a day for one phone number. */
export const PHONE_DAILY_CAP = 3;
/** Requests a minute from one IP (any route). */
export const IP_MINUTE_CAP = 30;

export type Housing = 'own' | 'rent' | 'family' | 'other';
export const HOUSING: Housing[] = ['own', 'rent', 'family', 'other'];

export interface CoApplicant {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  relationship?: string;
  employer?: string;
  jobTitle?: string;
  yearsOnJob?: number;
  monthsOnJob?: number;
  monthlyIncome?: number;
}

export interface CreditAppInput {
  firstName: string;
  lastName: string;
  /** +1XXXXXXXXXX */
  phone: string;
  email?: string;
  street: string;
  unit?: string;
  city: string;
  state: string;
  zip: string;
  yearsAtAddress: number;
  monthsAtAddress: number;
  housing: Housing;
  housingPayment: number;
  employer: string;
  jobTitle?: string;
  yearsOnJob: number;
  monthsOnJob: number;
  monthlyIncome: number;
  otherIncome?: number;
  otherIncomeSource?: string;
  cartWanted?: string;
  cartId?: string;
  downPayment?: number;
  notes?: string;
  coApplicant?: CoApplicant;
  storeId?: string;
  leadId?: string;
  consent: true;
}

export class CreditError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const SSN_RE = /\b\d{3}[-\s.]?\d{2}[-\s.]?\d{4}\b/;
const DOB_RE = /\b(0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])[/-](19|20)\d{2}\b/;

/** Trim, collapse whitespace, strip control characters, cap length. */
export function str(v: unknown, max: number): string {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  return String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function text(v: unknown, max: number, label: string, required: boolean): string {
  const s = str(v, max);
  if (required && !s) throw new CreditError(400, `Please fill in ${label}.`);
  // A 9-digit run looks like a Social Security number: never store it.
  if (SSN_RE.test(s.replace(/[()]/g, ''))) {
    throw new CreditError(400, `Please don't enter a Social Security number (${label}). The lender will ask for it securely.`);
  }
  return s;
}

function num(v: unknown, min: number, max: number, label: string, required: boolean): number {
  if (v === undefined || v === null || v === '') {
    if (required) throw new CreditError(400, `Please fill in ${label}.`);
    return 0;
  }
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n) || n < min || n > max) throw new CreditError(400, `Please check ${label}.`);
  return Math.round(n);
}

function email(v: unknown, label = 'the email'): string {
  const s = str(v, 120).toLowerCase();
  if (!s) return '';
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(s)) throw new CreditError(400, `Please check ${label}.`);
  return s;
}

export const docIdOf = (v: unknown) => {
  const s = str(v, 80);
  return /^[A-Za-z0-9_-]{1,80}$/.test(s) ? s : '';
};
export const storeIdOf = (v: unknown) => {
  const s = str(v, 4).toUpperCase();
  return /^T\d{1,2}$/.test(s) ? s : '';
};

/** Validates a submitted application. Unknown fields (including any SSN / date of birth) are dropped. */
export function validateCreditApp(raw: unknown): CreditAppInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new CreditError(400, 'Please fill in the form.');
  const b = raw as Record<string, unknown>;
  if (b.consent !== true) throw new CreditError(400, 'Please tick the box to confirm and authorize the application.');
  const phone = toE164(str(b.phone, 30));
  if (!phone) throw new CreditError(400, 'Please enter a 10-digit phone number.');
  const state = str(b.state, 20).toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) throw new CreditError(400, 'Please enter the state as 2 letters (for example PA).');
  const zip = str(b.zip, 20);
  if (!/^\d{5}(-\d{4})?$/.test(zip)) throw new CreditError(400, 'Please enter a 5-digit ZIP code.');
  const housing = str(b.housing, 10) as Housing;
  if (!HOUSING.includes(housing)) throw new CreditError(400, 'Please pick whether you own or rent.');
  const yearsAtAddress = num(b.yearsAtAddress, 0, 80, 'years at this address', false);
  const monthsAtAddress = num(b.monthsAtAddress, 0, 11, 'months at this address', false);
  if (!yearsAtAddress && !monthsAtAddress) throw new CreditError(400, 'Please tell us how long you have lived at this address.');
  const yearsOnJob = num(b.yearsOnJob, 0, 70, 'years on the job', false);
  const monthsOnJob = num(b.monthsOnJob, 0, 11, 'months on the job', false);

  const out: CreditAppInput = {
    firstName: text(b.firstName, 40, 'your first name', true),
    lastName: text(b.lastName, 40, 'your last name', true),
    phone,
    email: email(b.email) || undefined,
    street: text(b.street, 100, 'your street address', true),
    unit: text(b.unit, 20, 'the apartment / unit', false) || undefined,
    city: text(b.city, 60, 'your city', true),
    state,
    zip,
    yearsAtAddress,
    monthsAtAddress,
    housing,
    housingPayment: num(b.housingPayment, 0, 50000, 'the monthly housing payment', housing === 'rent'),
    employer: text(b.employer, 80, 'your employer (or "Self-employed" / "Retired")', true),
    jobTitle: text(b.jobTitle, 60, 'your job title', false) || undefined,
    yearsOnJob,
    monthsOnJob,
    monthlyIncome: num(b.monthlyIncome, 1, 200000, 'your monthly income', true),
    otherIncome: num(b.otherIncome, 0, 200000, 'other income', false) || undefined,
    otherIncomeSource: text(b.otherIncomeSource, 80, 'where other income comes from', false) || undefined,
    cartWanted: text(b.cartWanted, 120, 'the cart you want', false) || undefined,
    cartId: docIdOf(b.cartId) || undefined,
    downPayment: num(b.downPayment, 0, 500000, 'the down payment', false) || undefined,
    notes: text(b.notes, 500, 'the notes', false) || undefined,
    storeId: storeIdOf(b.store ?? b.storeId) || undefined,
    leadId: docIdOf(b.lead ?? b.leadId) || undefined,
    consent: true,
  };
  if (DOB_RE.test(out.notes || '')) throw new CreditError(400, 'Please don\'t enter a date of birth. The lender will ask for it securely.');

  const co = b.coApplicant;
  if (co && typeof co === 'object' && !Array.isArray(co)) {
    const c = co as Record<string, unknown>;
    const any = ['firstName', 'lastName', 'phone', 'email', 'employer', 'monthlyIncome'].some((k) => str(c[k], 100));
    if (any) {
      const coPhoneRaw = str(c.phone, 30);
      const coPhone = coPhoneRaw ? toE164(coPhoneRaw) : '';
      if (coPhoneRaw && !coPhone) throw new CreditError(400, 'Please check the co-applicant\'s phone number.');
      out.coApplicant = stripUndefined({
        firstName: text(c.firstName, 40, 'the co-applicant\'s first name', true),
        lastName: text(c.lastName, 40, 'the co-applicant\'s last name', true),
        phone: coPhone || undefined,
        email: email(c.email, 'the co-applicant\'s email') || undefined,
        relationship: text(c.relationship, 40, 'the relationship', false) || undefined,
        employer: text(c.employer, 80, 'the co-applicant\'s employer', false) || undefined,
        jobTitle: text(c.jobTitle, 60, 'the co-applicant\'s job title', false) || undefined,
        yearsOnJob: num(c.yearsOnJob, 0, 70, 'the co-applicant\'s years on the job', false) || undefined,
        monthsOnJob: num(c.monthsOnJob, 0, 11, 'the co-applicant\'s months on the job', false) || undefined,
        monthlyIncome: num(c.monthlyIncome, 0, 200000, 'the co-applicant\'s monthly income', false) || undefined,
      });
    }
  }
  return stripUndefined(out);
}

export function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

type Headers = Record<string, string | string[] | undefined>;
const header = (h: Headers, k: string) => {
  const v = h[k];
  return String(Array.isArray(v) ? v[0] : v || '');
};

/** Client IP: Fastly (Firebase Hosting) header, else the LAST X-Forwarded-For hop (added by Google's front end), else the socket. */
export function clientIp(headers: Headers, socketIp = ''): string {
  const f = header(headers, 'fastly-client-ip').trim();
  if (f) return f;
  const hops = header(headers, 'x-forwarded-for').split(',').map((s) => s.trim()).filter(Boolean);
  if (hops.length) return hops[hops.length - 1];
  return socketIp.replace(/^::ffff:/, '') || 'unknown';
}

/** mp_meta doc id for a cap counter (the IP / phone is hashed, never stored). */
export function capDocId(kind: 'ip' | 'phone' | 'ipmin', value: string, period: string): string {
  const h = createHash('sha256').update(`tigon-credit|${value}`).digest('hex').slice(0, 24);
  return `credit_cap_${kind}_${h}_${period}`;
}

/** Next count for a counter doc: resets when the period changed. */
export function nextCount(prev: {period?: unknown; count?: unknown} | undefined, period: string): number {
  return prev && prev.period === period ? Number(prev.count || 0) + 1 : 1;
}

/** One-line summary for the lead's notes. */
export function noteLine(a: CreditAppInput): string {
  const money = (n: number) => `$${n.toLocaleString('en-US')}`;
  return `Credit application received: income ${money(a.monthlyIncome)}/mo` +
    `${a.downPayment ? `, ${money(a.downPayment)} down` : ''}${a.cartWanted ? `, wants ${a.cartWanted}` : ''}` +
    `${a.coApplicant ? ', with a co-applicant' : ''}. Open Credit applications to send it to a lender.`;
}
