// Insights — credit applications: types, the public API client and the summary rows (screen + PDF).
import { displayPhone } from '../phone';

export const CREDIT_APPS = 'mp_credit_apps';
export const CREDIT_SETTINGS_DOC = 'credit'; // mp_settings/credit {lenders: [{name, email}]}

export const CONSENT_TEXT = 'I confirm this information is true and authorize TIGON Golf Carts to share it with lenders to find financing. ' +
  'The lender will ask for my SSN and date of birth securely.';

export type Housing = 'own' | 'rent' | 'family' | 'other';
export const HOUSING_LABEL: Record<Housing, string> = { own: 'Own', rent: 'Rent', family: 'Live with family', other: 'Other' };

export type CreditStatus = 'new' | 'sent' | 'approved' | 'declined' | 'needs_info';
export const CREDIT_STATUS_LABEL: Record<CreditStatus, string> = {
  new: 'New', sent: 'Sent to lender', approved: 'Approved', declined: 'Declined', needs_info: 'Needs more info',
};
export const CREDIT_STATUS_COLOR: Record<CreditStatus, 'default' | 'info' | 'success' | 'error' | 'warning'> = {
  new: 'warning', sent: 'info', approved: 'success', declined: 'error', needs_info: 'warning',
};

export interface CoApplicant {
  firstName: string; lastName: string; phone?: string; email?: string; relationship?: string; employer?: string; jobTitle?: string;
  yearsOnJob?: number; monthsOnJob?: number; monthlyIncome?: number;
}

/** mp_credit_apps doc (written by the server only). */
export interface CreditApp {
  id: string;
  firstName: string; lastName: string; phone: string; email?: string;
  street: string; unit?: string; city: string; state: string; zip: string;
  yearsAtAddress: number; monthsAtAddress: number; housing: Housing; housingPayment: number;
  employer: string; jobTitle?: string; yearsOnJob: number; monthsOnJob: number;
  monthlyIncome: number; otherIncome?: number; otherIncomeSource?: string;
  cartWanted?: string; cartId?: string; downPayment?: number; notes?: string;
  coApplicant?: CoApplicant;
  storeId?: string; leadId?: string; ownerUid?: string;
  consent: boolean; consentText: string; consentAt: number;
  status: CreditStatus; source: 'public' | 'staff'; createdBy?: string;
  sentAt?: number; sentTo?: { name: string; email: string }; sentByName?: string; lender?: string;
  createdAt: number; updatedAt: number;
}

export interface Lender { name: string; email: string }

// ---------------------------------------------------------------------------
// API (/api/credit/**, served by mpCreditApi)
// ---------------------------------------------------------------------------

const ORIGIN = 'https://tigoniot.com';
const base = () => (typeof location !== 'undefined' && (location.origin === ORIGIN || location.hostname.endsWith('.web.app')) ? '' : ORIGIN);

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base()}/api/credit/${path}`, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('We could not reach TIGON right now. Check your connection and try again, or give us a call at 1-844-844-6638.');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || `Something went wrong (HTTP ${res.status}).`);
  return json as T;
}

export interface StoreInfo { id: string; name: string; phone: string }
export const creditInfo = (store: string) => call<{ store: StoreInfo; consentText: string }>('GET', `info?store=${encodeURIComponent(store)}`);
export const creditSubmit = (body: Record<string, unknown>, token?: string) => call<{ ok: true; id: string; store: StoreInfo }>('POST', 'submit', body, token);

// ---------------------------------------------------------------------------
// Summary rows
// ---------------------------------------------------------------------------

const money = (n: unknown) => (Number(n) ? `$${Math.round(Number(n)).toLocaleString('en-US')}` : '');
const dur = (y?: number, m?: number) => [y ? `${y} yr` : '', m ? `${m} mo` : ''].filter(Boolean).join(' ');

export function creditSections(a: CreditApp): Array<{ title: string; rows: Array<[string, string]> }> {
  const out = [
    {
      title: 'Applicant',
      rows: [
        ['Name', `${a.firstName} ${a.lastName}`],
        ['Phone', displayPhone(a.phone)],
        ['Email', a.email || ''],
        ['Address', [a.street, a.unit, `${a.city}, ${a.state} ${a.zip}`].filter(Boolean).join(', ')],
        ['Time at address', dur(a.yearsAtAddress, a.monthsAtAddress)],
        ['Housing', `${HOUSING_LABEL[a.housing] || a.housing}${a.housingPayment ? ` · ${money(a.housingPayment)}/mo` : ''}`],
      ] as Array<[string, string]>,
    },
    {
      title: 'Work and income',
      rows: [
        ['Employer', a.employer],
        ['Job title', a.jobTitle || ''],
        ['Time on job', dur(a.yearsOnJob, a.monthsOnJob)],
        ['Monthly income', money(a.monthlyIncome)],
        ['Other income', a.otherIncome ? `${money(a.otherIncome)}/mo${a.otherIncomeSource ? ` (${a.otherIncomeSource})` : ''}` : ''],
      ] as Array<[string, string]>,
    },
    {
      title: 'Purchase',
      rows: [['Cart wanted', a.cartWanted || ''], ['Down payment', money(a.downPayment)], ['Notes', a.notes || '']] as Array<[string, string]>,
    },
  ];
  const c = a.coApplicant;
  if (c) {
    out.push({
      title: 'Co-applicant',
      rows: [
        ['Name', `${c.firstName} ${c.lastName}${c.relationship ? ` (${c.relationship})` : ''}`],
        ['Phone', c.phone ? displayPhone(c.phone) : ''],
        ['Email', c.email || ''],
        ['Employer', [c.employer, c.jobTitle].filter(Boolean).join(' · ')],
        ['Time on job', dur(c.yearsOnJob, c.monthsOnJob)],
        ['Monthly income', money(c.monthlyIncome)],
      ],
    });
  }
  return out.map((s) => ({ ...s, rows: s.rows.filter(([, v]) => v) }));
}
