// Insights — the credit application form (customer page /apply, and staff filling it in with a customer).
// Never asks for a Social Security number or date of birth.
import React, { useState } from 'react';
import {
  Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, InputAdornment, MenuItem, TextField, Typography,
} from '@mui/material';
import { Lock } from '@mui/icons-material';
import { CONSENT_TEXT, HOUSING_LABEL, creditSubmit, type Housing, type StoreInfo } from './creditShared';

export interface CreditFormValues {
  firstName: string; lastName: string; phone: string; email: string;
  street: string; unit: string; city: string; state: string; zip: string; yearsAtAddress: string; monthsAtAddress: string;
  housing: Housing | ''; housingPayment: string;
  employer: string; jobTitle: string; yearsOnJob: string; monthsOnJob: string; monthlyIncome: string; otherIncome: string; otherIncomeSource: string;
  cartWanted: string; downPayment: string; notes: string;
  coFirstName: string; coLastName: string; coPhone: string; coEmail: string; coRelationship: string; coEmployer: string; coJobTitle: string;
  coYearsOnJob: string; coMonthlyIncome: string;
}

const EMPTY: CreditFormValues = {
  firstName: '', lastName: '', phone: '', email: '', street: '', unit: '', city: '', state: '', zip: '', yearsAtAddress: '', monthsAtAddress: '',
  housing: '', housingPayment: '', employer: '', jobTitle: '', yearsOnJob: '', monthsOnJob: '', monthlyIncome: '', otherIncome: '', otherIncomeSource: '',
  cartWanted: '', downPayment: '', notes: '', coFirstName: '', coLastName: '', coPhone: '', coEmail: '', coRelationship: '', coEmployer: '', coJobTitle: '',
  coYearsOnJob: '', coMonthlyIncome: '',
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Box sx={{ mb: 2.5 }}>
    <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, fontSize: 18 }}>{title}</Typography>
    <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' } }}>{children}</Box>
  </Box>
);

const half = { gridColumn: { xs: 'span 2', sm: 'span 2' } };
const full = { gridColumn: '1 / -1' };
const quarter = { gridColumn: { xs: 'span 1', sm: 'span 1' } };

export interface CreditFormProps {
  store: string;
  lead: string;
  prefill?: Partial<CreditFormValues>;
  /** Signed-in staff: a Firebase ID token so the store's IP is not capped. */
  getToken?: () => Promise<string>;
  onDone: (r: { id: string; store: StoreInfo }) => void;
}

const CreditForm: React.FC<CreditFormProps> = ({ store, lead, prefill, getToken, onDone }) => {
  const [v, setV] = useState<CreditFormValues>({ ...EMPTY, ...prefill });
  const [co, setCo] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof CreditFormValues) => (e: React.ChangeEvent<HTMLInputElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  const f = (k: keyof CreditFormValues, label: string, sx: object, extra: Record<string, unknown> = {}) => (
    <TextField label={label} value={v[k]} onChange={set(k)} sx={sx} size="small" {...extra} />
  );
  const moneyField = (k: keyof CreditFormValues, label: string, sx: object, required = false) => f(k, label, sx, {
    required, slotProps: { input: { startAdornment: <InputAdornment position="start">$</InputAdornment> }, htmlInput: { inputMode: 'decimal', maxLength: 12 } },
  });
  const numField = (k: keyof CreditFormValues, label: string, max: number) => f(k, label, quarter, {
    type: 'number', slotProps: { htmlInput: { min: 0, max, inputMode: 'numeric' } },
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!consent) { setError('Please tick the box at the bottom to confirm and authorize.'); return; }
    if (!v.housing) { setError('Please pick whether you own or rent.'); return; }
    setBusy(true);
    try {
      const body = {
        firstName: v.firstName, lastName: v.lastName, phone: v.phone, email: v.email, street: v.street, unit: v.unit, city: v.city, state: v.state, zip: v.zip,
        yearsAtAddress: v.yearsAtAddress, monthsAtAddress: v.monthsAtAddress, housing: v.housing, housingPayment: v.housingPayment,
        employer: v.employer, jobTitle: v.jobTitle, yearsOnJob: v.yearsOnJob, monthsOnJob: v.monthsOnJob, monthlyIncome: v.monthlyIncome,
        otherIncome: v.otherIncome, otherIncomeSource: v.otherIncomeSource, cartWanted: v.cartWanted, downPayment: v.downPayment, notes: v.notes,
        coApplicant: co ? {
          firstName: v.coFirstName, lastName: v.coLastName, phone: v.coPhone, email: v.coEmail, relationship: v.coRelationship,
          employer: v.coEmployer, jobTitle: v.coJobTitle, yearsOnJob: v.coYearsOnJob, monthlyIncome: v.coMonthlyIncome,
        } : undefined,
        consent: true, store, lead,
      };
      const token = getToken ? await getToken().catch(() => '') : '';
      onDone(await creditSubmit(body, token || undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box component="form" onSubmit={submit} noValidate={false}>
      <Alert icon={<Lock />} severity="info" sx={{ mb: 2 }}>
        We never ask for your Social Security number or date of birth here. The lender will ask for those securely.
      </Alert>
      <Section title="About you">
        {f('firstName', 'First name', half, { required: true, autoComplete: 'given-name', slotProps: { htmlInput: { maxLength: 40 } } })}
        {f('lastName', 'Last name', half, { required: true, autoComplete: 'family-name', slotProps: { htmlInput: { maxLength: 40 } } })}
        {f('phone', 'Mobile phone', half, { required: true, type: 'tel', autoComplete: 'tel', slotProps: { htmlInput: { maxLength: 20 } } })}
        {f('email', 'Email', half, { type: 'email', autoComplete: 'email', slotProps: { htmlInput: { maxLength: 120 } } })}
      </Section>
      <Section title="Where you live">
        {f('street', 'Street address', { gridColumn: { xs: '1 / -1', sm: 'span 3' } }, { required: true, autoComplete: 'address-line1', slotProps: { htmlInput: { maxLength: 100 } } })}
        {f('unit', 'Apt / unit', { gridColumn: { xs: 'span 2', sm: 'span 1' } }, { autoComplete: 'address-line2', slotProps: { htmlInput: { maxLength: 20 } } })}
        {f('city', 'City', half, { required: true, autoComplete: 'address-level2', slotProps: { htmlInput: { maxLength: 60 } } })}
        {f('state', 'State', quarter, { required: true, autoComplete: 'address-level1', placeholder: 'PA', slotProps: { htmlInput: { maxLength: 2 } } })}
        {f('zip', 'ZIP', quarter, { required: true, autoComplete: 'postal-code', slotProps: { htmlInput: { maxLength: 10, inputMode: 'numeric' } } })}
        {numField('yearsAtAddress', 'Years there', 80)}
        {numField('monthsAtAddress', 'Months', 11)}
        <TextField select required size="small" label="Own or rent?" value={v.housing} onChange={set('housing')} sx={quarter}>
          {(Object.keys(HOUSING_LABEL) as Housing[]).map((h) => <MenuItem key={h} value={h}>{HOUSING_LABEL[h]}</MenuItem>)}
        </TextField>
        {moneyField('housingPayment', 'Rent / mortgage per month', quarter, v.housing === 'rent')}
      </Section>
      <Section title="Work and income">
        {f('employer', 'Employer (or Self-employed / Retired)', half, { required: true, slotProps: { htmlInput: { maxLength: 80 } } })}
        {f('jobTitle', 'Job title', half, { slotProps: { htmlInput: { maxLength: 60 } } })}
        {numField('yearsOnJob', 'Years on job', 70)}
        {numField('monthsOnJob', 'Months', 11)}
        {moneyField('monthlyIncome', 'Monthly income (before taxes)', half, true)}
        {moneyField('otherIncome', 'Other monthly income', half)}
        {f('otherIncomeSource', 'Where other income comes from', half, { slotProps: { htmlInput: { maxLength: 80 } } })}
      </Section>
      <Section title="Your cart">
        {f('cartWanted', 'Cart you want', half, { slotProps: { htmlInput: { maxLength: 120 } } })}
        {moneyField('downPayment', 'Down payment', half)}
        {f('notes', 'Anything else we should know?', full, { multiline: true, minRows: 2, slotProps: { htmlInput: { maxLength: 500 } } })}
      </Section>
      <FormControlLabel control={<Checkbox checked={co} onChange={(e) => setCo(e.target.checked)} />} label="Add a co-applicant (optional)" sx={{ mb: 1 }} />
      {co && (
        <Section title="Co-applicant">
          {f('coFirstName', 'First name', half, { required: true, slotProps: { htmlInput: { maxLength: 40 } } })}
          {f('coLastName', 'Last name', half, { required: true, slotProps: { htmlInput: { maxLength: 40 } } })}
          {f('coPhone', 'Phone', half, { type: 'tel', slotProps: { htmlInput: { maxLength: 20 } } })}
          {f('coEmail', 'Email', half, { type: 'email', slotProps: { htmlInput: { maxLength: 120 } } })}
          {f('coRelationship', 'Relationship (spouse, partner…)', half, { slotProps: { htmlInput: { maxLength: 40 } } })}
          {f('coEmployer', 'Employer', half, { slotProps: { htmlInput: { maxLength: 80 } } })}
          {f('coJobTitle', 'Job title', half, { slotProps: { htmlInput: { maxLength: 60 } } })}
          {numField('coYearsOnJob', 'Years on job', 70)}
          {moneyField('coMonthlyIncome', 'Monthly income', quarter)}
        </Section>
      )}
      <FormControlLabel
        sx={{ alignItems: 'flex-start', mb: 2 }}
        control={<Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} sx={{ mt: -0.75 }} />}
        label={<Typography variant="body2">{CONSENT_TEXT}</Typography>}
      />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Button type="submit" variant="contained" size="large" fullWidth disabled={busy} startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}>
        Send my application
      </Button>
    </Box>
  );
};

export default CreditForm;
