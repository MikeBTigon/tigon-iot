import React from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Autocomplete, Box, Button, Chip, MenuItem, Switch, TextField,
  Typography,
} from '@mui/material';
import { ExpandMore } from '@mui/icons-material';
import { useMp } from '../../mp/MpDataContext';
import { useWhCollection } from '../data';
import { fieldLabel } from '../shared';
import { LEAD_FIELDS, WH } from '../types';
import type { SpamSettings, WhEmailTemplate, WhIntegration, WhSettings } from '../types';

type Scope = 'global' | 'master' | 'domain' | 'flow' | 'webhook';

const SCOPE_NAME: Record<Scope, string> = {
  global: 'every website', master: 'the Master Flow', domain: 'this website', flow: 'this flow', webhook: 'this webhook',
};

/** Values the server uses when nothing is set anywhere. */
const BUILT_IN: Record<string, string> = {
  honeypotField: 'website',
  perIpPerMinute: '10',
  perKeyPerMinute: '120',
  alertNoLeadsDays: '3',
  dedupeWindowHours: '24',
  dedupeMatchOn: 'Email, Phone',
  emailInheritMode: 'Replace',
};

const isEmpty = (v: unknown) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0);

/** Accepts a Google Sheets URL or a bare id; returns the id. */
const sheetIdFrom = (s: string) => s.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1] || s.trim();

interface Accessor {
  key: string;
  get: unknown;
  inh: unknown;
  put: (v: unknown) => void;
}

/** One setting: label, input, explanation and the inherited value; "Clear" when overridden. */
const Row: React.FC<{
  a: Accessor; label: string; help: string; show: (v: unknown) => string; scope: Scope; children: React.ReactNode;
}> = ({ a, label, help, show, scope, children }) => {
  const set = !isEmpty(a.get);
  const inhText = !isEmpty(a.inh) ? show(a.inh) : '';
  let note: string;
  if (inhText) note = set ? `Overrides inherited: ${inhText}` : `Inherited: ${inhText}`;
  else if (BUILT_IN[a.key]) note = `${set ? 'Overrides built-in default' : 'Using built-in default'}: ${BUILT_IN[a.key]}`;
  else note = scope === 'global' ? (set ? '' : 'Not set') : set ? '' : 'Using global default (not set)';
  return (
    <Box sx={{ py: 1.25, borderBottom: 1, borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
        <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>{label}</Typography>
        {set && <Button size="small" onClick={() => a.put(undefined)}>Clear (inherit)</Button>}
      </Box>
      {children}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        {help}{note && <><br /><b>{note}</b></>}
      </Typography>
    </Box>
  );
};

/** Chip input for free-text lists (emails, IPs, words, origins). Commits on Enter, comma or blur. */
export const ChipList: React.FC<{
  value: string[]; onChange: (v: string[]) => void; placeholder?: string; options?: string[];
  getLabel?: (v: string) => string; free?: boolean;
}> = ({ value, onChange, placeholder, options = [], getLabel, free = true }) => (
  <Autocomplete
    multiple
    freeSolo={free}
    autoSelect={free}
    size="small"
    options={options}
    value={value}
    getOptionLabel={(o) => (getLabel ? getLabel(o) : o)}
    onChange={(_e, v) => onChange(Array.from(new Set(v.flatMap((x) => String(x).split(/[\s,;]+/)).map((x) => x.trim()).filter(Boolean))))}
    renderValue={(vals, getItemProps) => vals.map((o, i) => {
      const { key, ...rest } = getItemProps({ index: i });
      return <Chip key={key} size="small" label={getLabel ? getLabel(o) : o} {...rest} />;
    })}
    renderInput={(p) => <TextField {...p} placeholder={value.length ? '' : placeholder} />}
  />
);

/**
 * Settings editor used at every level of the cascade (global → master → website → flow → webhook).
 * Empty = inherit. `inherited` is what applies when a field is left empty (shown as helper text).
 */
export default function SettingsForm(props: {
  value: WhSettings; onChange: (v: WhSettings) => void; inherited?: WhSettings;
  scope: 'global' | 'master' | 'domain' | 'flow' | 'webhook';
}) {
  const { value, onChange, inherited, scope } = props;
  const { users } = useMp();
  const { rows: templates } = useWhCollection<WhEmailTemplate>(WH.templates);
  const { rows: integrations } = useWhCollection<WhIntegration>(WH.integrations);
  const smtp = (integrations || []).filter((i) => i.type === 'smtp');
  const dms = (integrations || []).filter((i) => i.type === 'dms');

  const tplName = (id: unknown) => (templates || []).find((t) => t.id === id)?.name || String(id);
  const intName = (id: unknown) => (integrations || []).find((t) => t.id === id)?.name || String(id);
  const userName = (uid: string) => { const u = users.find((x) => x.uid === uid); return u ? u.name || u.email : uid; };

  const put = (k: keyof WhSettings, v: unknown) => {
    const next = { ...value } as Record<string, unknown>;
    if (isEmpty(v)) delete next[k]; else next[k] = v;
    onChange(next as WhSettings);
  };
  const acc = (k: keyof WhSettings): Accessor => ({ key: k, get: value[k], inh: inherited?.[k], put: (v) => put(k, v) });
  const spamAcc = (k: keyof SpamSettings): Accessor => ({
    key: k, get: value.spam?.[k], inh: inherited?.spam?.[k],
    put: (v) => {
      const spam = { ...(value.spam || {}) } as Record<string, unknown>;
      if (isEmpty(v)) delete spam[k]; else spam[k] = v;
      put('spam', spam);
    },
  });

  const str = (v: unknown) => (Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'On' : 'Off') : String(v));
  const fieldsStr = (v: unknown) => (Array.isArray(v) ? v.map(String).map(fieldLabel).join(', ') : str(v));
  const usersStr = (v: unknown) => (Array.isArray(v) ? v.map(String).map(userName).join(', ') : userName(String(v)));

  // ---- input builders ----
  const text = (a: Accessor, label: string, help: string, o: { placeholder?: string; type?: string; map?: (s: string) => string } = {}) => (
    <Row a={a} label={label} help={help} show={str} scope={scope}>
      <TextField
        fullWidth size="small" type={o.type || 'text'} value={(a.get as string) ?? ''}
        placeholder={!isEmpty(a.inh) ? `Inherited: ${str(a.inh)}` : o.placeholder}
        onChange={(e) => a.put(o.map ? o.map(e.target.value) : e.target.value)}
      />
    </Row>
  );
  const num = (a: Accessor, label: string, help: string, min = 0, max = 100000) => (
    <Row a={a} label={label} help={help} show={str} scope={scope}>
      <TextField
        size="small" type="number" sx={{ maxWidth: 220 }} value={a.get ?? ''}
        placeholder={!isEmpty(a.inh) ? `Inherited: ${str(a.inh)}` : BUILT_IN[a.key] || ''}
        slotProps={{ htmlInput: { min, max } }}
        onChange={(e) => {
          const s = e.target.value;
          a.put(s === '' ? undefined : Math.min(max, Math.max(min, Math.round(Number(s) || 0))));
        }}
      />
    </Row>
  );
  const chips = (a: Accessor, label: string, help: string, placeholder: string) => (
    <Row a={a} label={label} help={help} show={str} scope={scope}>
      <ChipList value={(a.get as string[]) || []} onChange={(v) => a.put(v)}
        placeholder={!isEmpty(a.inh) ? `Inherited: ${str(a.inh)}` : placeholder} />
    </Row>
  );
  const fieldPick = (a: Accessor, label: string, help: string) => (
    <Row a={a} label={label} help={help} show={fieldsStr} scope={scope}>
      <ChipList value={(a.get as string[]) || []} onChange={(v) => a.put(v)} options={[...LEAD_FIELDS]}
        getLabel={fieldLabel} free={false} placeholder={!isEmpty(a.inh) ? `Inherited: ${fieldsStr(a.inh)}` : 'Pick fields'} />
    </Row>
  );
  const bool = (a: Accessor, label: string, help: string) => (
    <Row a={a} label={label} help={help} show={str} scope={scope}>
      {scope === 'global' ? (
        <Switch checked={!!a.get} onChange={(e) => a.put(e.target.checked)} inputProps={{ 'aria-label': label }} />
      ) : (
        <TextField select size="small" sx={{ minWidth: 220 }} value={a.get === undefined ? '' : a.get ? 'on' : 'off'}
          onChange={(e) => a.put(e.target.value === '' ? undefined : e.target.value === 'on')}>
          <MenuItem value="">Inherit{!isEmpty(a.inh) ? ` (${str(a.inh)})` : ''}</MenuItem>
          <MenuItem value="on">On</MenuItem>
          <MenuItem value="off">Off</MenuItem>
        </TextField>
      )}
    </Row>
  );
  const pick = (a: Accessor, label: string, help: string, options: Array<{ id: string; name: string }>, show: (v: unknown) => string, empty?: string) => (
    <Row a={a} label={label} help={help} show={show} scope={scope}>
      <TextField select fullWidth size="small" value={(a.get as string) ?? ''} onChange={(e) => a.put(e.target.value || undefined)}>
        <MenuItem value="">{scope === 'global' ? 'None' : `Inherit${!isEmpty(a.inh) ? ` (${show(a.inh)})` : ''}`}</MenuItem>
        {options.map((o) => <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>)}
        {!!a.get && !options.some((o) => o.id === a.get) && <MenuItem value={a.get as string}>{String(a.get)} (missing)</MenuItem>}
      </TextField>
      {empty && !options.length && <Typography variant="caption" color="warning.main">{empty}</Typography>}
    </Row>
  );

  const tplOpts = (templates || []).map((t) => ({ id: t.id, name: t.name || t.id }));
  const userOpts = users.map((u) => ({ id: u.uid, name: u.name || u.email }));

  // ---- sections ----
  const sections: Array<{ title: string; hint: string; keys: Array<keyof WhSettings>; spamKeys?: Array<keyof SpamSettings>; body: React.ReactNode }> = [
    {
      title: 'Email', hint: 'Who is emailed about each lead, and how.',
      keys: ['emailTo', 'emailCc', 'emailBcc', 'emailInheritMode', 'emailTemplateId', 'emailFromName', 'emailReplyTo', 'smtpIntegrationId', 'autoReplyEnabled', 'autoReplyTemplateId'],
      body: <>
        {chips(acc('emailTo'), 'Send leads to', 'Email addresses that receive every lead. Press Enter after each address.', 'sales@dealer.com')}
        {chips(acc('emailCc'), 'CC', 'Copied on every lead email.', 'manager@dealer.com')}
        {chips(acc('emailBcc'), 'BCC', 'Hidden copy on every lead email.', 'archive@dealer.com')}
        {scope !== 'global' && (
          <Row a={acc('emailInheritMode')} label="Addresses above…" scope={scope} show={(v) => (v === 'add' ? 'Add' : 'Replace')}
            help="Replace: the addresses above are used instead of the inherited ones. Add: they are added to the inherited ones.">
            <TextField select size="small" sx={{ minWidth: 260 }} value={value.emailInheritMode || ''}
              onChange={(e) => put('emailInheritMode', e.target.value || undefined)}>
              <MenuItem value="">Replace inherited addresses (default)</MenuItem>
              <MenuItem value="replace">Replace inherited addresses</MenuItem>
              <MenuItem value="add">Add to inherited addresses</MenuItem>
            </TextField>
          </Row>
        )}
        {pick(acc('emailTemplateId'), 'Email template', 'The design and wording of the lead email. Edit templates under Email templates.', tplOpts, tplName, 'No email templates yet.')}
        {text(acc('emailFromName'), 'From name', 'The sender name people see, e.g. "Example Dealer Website".', { placeholder: 'TIGON Leads' })}
        {text(acc('emailReplyTo'), 'Reply-to address', 'Where replies to lead emails go. Leave empty to reply to the customer (when an email was submitted).', { placeholder: 'sales@dealer.com', type: 'email' })}
        {pick(acc('smtpIntegrationId'), 'Send using', 'The email connection (Settings → Integrations) used to send.', smtp.map((i) => ({ id: i.id, name: i.name })), intName, 'No email connection yet — an admin can add one in Settings → Integrations.')}
        {bool(acc('autoReplyEnabled'), 'Customer thank-you email', 'Also email the customer a thank-you when they include their email address.')}
        {pick(acc('autoReplyTemplateId'), 'Thank-you template', 'The template used for the customer thank-you email.', tplOpts, tplName)}
      </>,
    },
    {
      title: 'Google Sheets', hint: 'Add every lead as a row in a spreadsheet.',
      keys: ['sheetId', 'sheetTab'],
      body: <>
        {text(acc('sheetId'), 'Spreadsheet', 'Paste the Google Sheet link (or its id). Share the sheet as Editor with 470095494000-compute@developer.gserviceaccount.com.', { placeholder: 'https://docs.google.com/spreadsheets/d/…', map: sheetIdFrom })}
        {text(acc('sheetTab'), 'Tab name', 'The tab (sheet) rows are added to. Created automatically if missing.', { placeholder: 'Leads' })}
      </>,
    },
    {
      title: 'DMS', hint: 'Send leads to your dealer management system.',
      keys: ['dmsEnabled', 'dmsIntegrationId'],
      body: <>
        {bool(acc('dmsEnabled'), 'Send leads to the DMS', 'When on, "Send to DMS" steps deliver the lead.')}
        {pick(acc('dmsIntegrationId'), 'DMS connection', 'Which DMS connection (Settings → Integrations) receives the leads.', dms.map((i) => ({ id: i.id, name: i.name })), intName, 'No DMS connection yet — an admin can add one in Settings → Integrations.')}
      </>,
    },
    {
      title: 'Google Analytics (GA4)', hint: 'Record each lead as a conversion.',
      keys: ['ga4MeasurementId', 'ga4ApiSecret'],
      body: <>
        {text(acc('ga4MeasurementId'), 'Measurement ID', 'Found in GA4 → Admin → Data streams → your website (looks like G-XXXXXXX).', { placeholder: 'G-XXXXXXXXXX' })}
        {text(acc('ga4ApiSecret'), 'Measurement Protocol API secret', 'GA4 → Admin → Data streams → Measurement Protocol API secrets → Create.', { placeholder: 'API secret' })}
      </>,
    },
    {
      title: 'Validation & spam', hint: 'Required fields, spam protection and duplicate detection.',
      keys: ['requiredFields', 'dedupeWindowHours', 'dedupeMatchOn'],
      spamKeys: ['honeypotField', 'turnstileSecret', 'perIpPerMinute', 'perKeyPerMinute', 'blockedIps', 'blockedWords'],
      body: <>
        {fieldPick(acc('requiredFields'), 'Required fields', 'Leads missing any of these are stopped. Every lead always needs an email or a phone number.')}
        {text(spamAcc('honeypotField'), 'Hidden spam-trap field', 'Name of a hidden form field that people never fill in; bots do, and are marked as spam.', { placeholder: 'website' })}
        {text(spamAcc('turnstileSecret'), 'Cloudflare Turnstile secret key', 'Optional. When set, forms must include a valid Turnstile check (cf-turnstile-response).', { placeholder: '0x4AAAA…' })}
        {num(spamAcc('perIpPerMinute'), 'Max submissions per visitor per minute', 'More than this from one IP address in a minute is rejected.', 1, 10000)}
        {num(spamAcc('perKeyPerMinute'), 'Max submissions per form per minute', 'More than this to one webhook in a minute is rejected.', 1, 100000)}
        {chips(spamAcc('blockedIps'), 'Blocked IP addresses', 'Submissions from these IP addresses are marked as spam.', '203.0.113.7')}
        {chips(spamAcc('blockedWords'), 'Blocked words', 'Submissions containing any of these words (any case) are marked as spam.', 'casino')}
        {num(acc('dedupeWindowHours'), 'Duplicate window (hours)', 'The same person submitting again within this many hours counts as a duplicate.', 1, 8760)}
        {fieldPick(acc('dedupeMatchOn'), 'Duplicates match on', 'Two leads are the same person when any of these fields match.')}
      </>,
    },
    {
      title: 'TIGON IOT', hint: 'Create CRM leads and phone notifications.',
      keys: ['createLead', 'leadOwnerUid', 'notifyUids'],
      body: <>
        {bool(acc('createLead'), 'Create a CRM lead', 'Adds each lead to TIGON IOT Leads so the sales team can follow up.')}
        {pick(acc('leadOwnerUid'), 'Lead owner', 'The salesperson new CRM leads are assigned to.', userOpts, (v) => userName(String(v)))}
        <Row a={acc('notifyUids')} label="Notify on phone" scope={scope} show={usersStr}
          help="These team members get a push notification in the TIGON IOT app for every lead.">
          <ChipList value={value.notifyUids || []} onChange={(v) => put('notifyUids', v)} options={users.map((u) => u.uid)}
            getLabel={userName} free={false} placeholder={!isEmpty(inherited?.notifyUids) ? `Inherited: ${usersStr(inherited?.notifyUids)}` : 'Pick people'} />
        </Row>
      </>,
    },
    {
      title: 'Website', hint: 'Thank-you page, allowed sites and "no leads" alerts.',
      keys: ['thankYouUrl', 'allowedOrigins', 'alertNoLeadsDays'],
      body: <>
        {text(acc('thankYouUrl'), 'Thank-you page', 'Plain HTML forms redirect here after submitting. Leave empty to show a simple thank-you message.', { placeholder: 'https://dealer.com/thank-you', type: 'url' })}
        {chips(acc('allowedOrigins'), 'Extra allowed websites', 'Other site addresses allowed to send to this form (the website address itself is always allowed).', 'https://www.dealer.com')}
        {num(acc('alertNoLeadsDays'), 'Alert when no leads for (days)', 'Admins get an alert when a website receives no leads for this many days. 0 turns it off.', 0, 365)}
      </>,
    },
  ];

  const countSet = (s: typeof sections[number]) =>
    s.keys.filter((k) => !isEmpty(value[k])).length + (s.spamKeys || []).filter((k) => !isEmpty(value.spam?.[k])).length;

  const clearSection = (s: typeof sections[number]) => {
    const next = { ...value } as Record<string, unknown>;
    for (const k of s.keys) delete next[k];
    if (s.spamKeys && value.spam) {
      const spam = { ...value.spam } as Record<string, unknown>;
      for (const k of s.spamKeys) delete spam[k];
      if (Object.keys(spam).length) next.spam = spam; else delete next.spam;
    }
    onChange(next as WhSettings);
  };

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {scope === 'global' ?
          'Defaults for every website. Websites, flows and webhooks can override any of these.' :
          `Settings for ${SCOPE_NAME[scope]}. Leave a field empty to inherit it; filled-in fields override the inherited value.`}
      </Typography>
      {sections.map((s) => {
        const n = countSet(s);
        return (
          <Accordion key={s.title} disableGutters variant="outlined" sx={{ '&:not(:last-child)': { borderBottom: 0 } }}>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', width: '100%', pr: 1 }}>
                <Typography sx={{ fontWeight: 600 }}>{s.title}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' }, flexGrow: 1 }}>{s.hint}</Typography>
                {n > 0 && <Chip size="small" color="primary" variant="outlined" label={scope === 'global' ? `${n} set` : `${n} override${n === 1 ? '' : 's'}`} />}
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              {n > 0 && (
                <Box sx={{ textAlign: 'right' }}>
                  <Button size="small" color="warning" onClick={() => clearSection(s)}>Clear section (inherit all)</Button>
                </Box>
              )}
              {s.body}
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Box>
  );
}
