// Track 2 (texting) — admin settings: how texts go out (texting phone per store or Twilio), quiet hours,
// instant auto-text, missed-call text-back, follow-up plan (cadence) and after-sale reminders.
import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, FormControl, FormControlLabel, IconButton, InputLabel,
  MenuItem, Radio, RadioGroup, Select, Stack, Switch, TextField, Typography,
} from '@mui/material';
import { Add, Delete } from '@mui/icons-material';
import { db } from '../../../config/firebase';
import { useMp } from '../../MpDataContext';
import { DEALERSHIPS } from '../../constants';
import { CHANNELS, CHANNEL_LABEL, useNow } from '../../crm/crmData';
import { notify } from '../../../ui/notify';
import { e164, saveSalesSection, useSalesSettings } from '../salesData';
import type { CadenceStep, SalesSettings, ServiceStep } from '../salesTypes';
import { TEXTING_PHONE_ONLINE_MS, lastCheckIn, smsAdmin, sortSteps, when } from './textingUi';
import type { DeviceInfo, SmsAdminStatus } from './textingUi';

const STORES = DEALERSHIPS.filter((d) => d.id !== 'T0');
const HOURS = Array.from({ length: 24 }, (_x, h) => h);
const hourLabel = (h: number) => (h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`);
const num = (s: string, min: number, max: number, fallback: number) => {
  const v = Number(String(s).replace(/[^\d.-]/g, ''));
  return Number.isFinite(v) && String(s).trim() !== '' ? Math.min(Math.max(Math.round(v), min), max) : fallback;
};
const PLACEHOLDERS = 'You can use {first} {name} {cart} {store} {storePhone} {salesperson}.';
const STOP_NOTE = '"Reply STOP to opt out." is added at the end automatically.';

function useSaver<K extends keyof SalesSettings>(key: K) {
  const [busy, setBusy] = useState(false);
  const save = async (value: SalesSettings[K]) => {
    setBusy(true);
    try {
      await saveSalesSection(key, value);
      notify('Saved', 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return { busy, save };
}

const Section: React.FC<{
  title: string; help: React.ReactNode; enabled?: boolean; onEnabled?: (v: boolean) => void; children: React.ReactNode;
  onSave: () => void; busy: boolean;
}> = ({ title, help, enabled, onEnabled, children, onSave, busy }) => (
  <Card variant="outlined">
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="h6" sx={{ fontWeight: 700, flexGrow: 1 }}>{title}</Typography>
        {onEnabled && <FormControlLabel control={<Switch checked={!!enabled} onChange={(e) => onEnabled(e.target.checked)} />} label={enabled ? 'On' : 'Off'} />}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{help}</Typography>
      <Stack spacing={2}>{children}</Stack>
      <Button variant="contained" sx={{ mt: 2 }} onClick={onSave} disabled={busy} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}>Save</Button>
    </CardContent>
  </Card>
);

// ---------------------------------------------------------------------------

const DeliverySection: React.FC<{ initial: SalesSettings['sms'] }> = ({ initial }) => {
  const [v, setV] = useState(initial);
  const { busy, save } = useSaver('sms');
  const { userName } = useMp();
  const now = useNow(30_000);
  const [devices, setDevices] = useState<DeviceInfo[] | null>(null);
  const [status, setStatus] = useState<SmsAdminStatus | null>(null);

  useEffect(() => {
    getDocs(collection(db, 'devices'))
      .then((s) => setDevices(s.docs.map((d) => ({ id: d.id, ...d.data() } as DeviceInfo))
        .filter((d) => d.status !== 'revoked' && d.id.startsWith('app_') && d.platform !== 'ios')))
      .catch(() => setDevices([]));
    smsAdmin.status().then(setStatus).catch(() => setStatus(null));
  }, []);

  const label = (d: DeviceInfo) => {
    const last = lastCheckIn(d);
    const online = last && now - last < TEXTING_PHONE_ONLINE_MS;
    return `${d.deviceName || 'Phone'}${d.deviceNumber ? ` #${d.deviceNumber}` : ''} · ${userName(d.userId)}${online ? ' · online' : last ? ` · seen ${when(last)}` : ''}`;
  };
  const phonePicker = (value: string, onChange: (id: string) => void, labelText: string) => (
    <FormControl size="small" fullWidth>
      <InputLabel>{labelText}</InputLabel>
      <Select label={labelText} value={value} onChange={(e) => onChange(String(e.target.value))}>
        <MenuItem value="">None</MenuItem>
        {value && !devices?.some((d) => d.id === value) && <MenuItem value={value}>Phone {value.slice(-6)} (not found)</MenuItem>}
        {(devices || []).map((d) => <MenuItem key={d.id} value={d.id}>{label(d)}</MenuItem>)}
      </Select>
    </FormControl>
  );

  const onSave = () => {
    const badFrom = [v.twilioDefaultFrom, ...Object.values(v.twilioFromByStore || {})].some((x) => x && !e164(x));
    if (badFrom) {
      notify('Twilio numbers must be 10-digit US numbers.', 'error');
      return;
    }
    // Cleared entries are saved as '' (the settings doc merges maps, so a removed key would come back).
    const twilioFromByStore = Object.fromEntries(Object.entries(v.twilioFromByStore || {}).map(([k, x]) => [k, e164(x)]));
    save({ ...v, twilioFromByStore, twilioDefaultFrom: e164(v.twilioDefaultFrom) });
  };

  return (
    <Section title="How texts are sent" busy={busy} onSave={onSave}
      help="Texts to customers (from salespeople and automatic ones) go out from each store's texting phone — an Android phone with the TIGON IOT app and a texting plan. Or use Twilio.">
      <RadioGroup value={v.provider} onChange={(e) => setV({ ...v, provider: e.target.value as 'phone' | 'twilio' })}>
        <FormControlLabel value="phone" control={<Radio />} label="Store texting phones (no extra cost)" />
        <FormControlLabel value="twilio" control={<Radio />} label="Twilio (texts from a Twilio number)" />
      </RadioGroup>

      {v.provider === 'phone' && (
        <>
          <Typography variant="body2" color="text.secondary">
            Easiest: open the TIGON IOT app on the store's phone → Dashboard → This Device → "Make this the texting phone".
            Or pick the phone here. The phone needs notification access and the SMS permission.
          </Typography>
          {devices === null ? <CircularProgress size={20} /> : (
            <Stack spacing={1.5}>
              {STORES.map((s) => (
                <Box key={s.id}>
                  {phonePicker(v.senderDeviceByStore?.[s.id] || '', (id) => setV({ ...v, senderDeviceByStore: { ...v.senderDeviceByStore, [s.id]: id } }), `${s.name} texting phone`)}
                </Box>
              ))}
              {phonePicker(v.defaultSenderDeviceId || '', (id) => setV({ ...v, defaultSenderDeviceId: id }), 'Backup phone (stores without their own)')}
            </Stack>
          )}
        </>
      )}

      {v.provider === 'twilio' && (
        <>
          {status?.twilioKeys ? (
            <Alert severity="success">Twilio keys are set.</Alert>
          ) : (
            <Alert severity="warning">
              Twilio is not connected yet. Ask your developer to add <b>TWILIO_ACCOUNT_SID</b> and <b>TWILIO_AUTH_TOKEN</b> as
              GitHub secrets (they're passed to the server when it deploys). Until then, texts go out from the store texting phones.
              In Twilio, set each number's "A message comes in" webhook to <b>https://tigoniot.com/api/sms/inbound</b> (HTTP POST).
            </Alert>
          )}
          <TextField size="small" label="Main Twilio number" placeholder="(215) 555-0100" value={v.twilioDefaultFrom}
            onChange={(e) => setV({ ...v, twilioDefaultFrom: e.target.value })} helperText="Used for stores without their own number." />
          {STORES.map((s) => (
            <TextField key={s.id} size="small" label={`${s.name} Twilio number`} value={v.twilioFromByStore?.[s.id] || ''}
              onChange={(e) => setV({ ...v, twilioFromByStore: { ...v.twilioFromByStore, [s.id]: e.target.value } })} />
          ))}
        </>
      )}

      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Quiet hours (New York time)</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: -1.5 }}>
        Automatic texts wait until quiet hours end. Texts a salesperson sends by hand go right away.
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>No texts from</InputLabel>
          <Select label="No texts from" value={v.quietStart} onChange={(e) => setV({ ...v, quietStart: Number(e.target.value) })}>
            {HOURS.map((h) => <MenuItem key={h} value={h}>{hourLabel(h)}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Until</InputLabel>
          <Select label="Until" value={v.quietEnd} onChange={(e) => setV({ ...v, quietEnd: Number(e.target.value) })}>
            {HOURS.map((h) => <MenuItem key={h} value={h}>{hourLabel(h)}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>
    </Section>
  );
};

const AutoTextSection: React.FC<{ initial: SalesSettings['autoText'] }> = ({ initial }) => {
  const [v, setV] = useState(initial);
  const { busy, save } = useSaver('autoText');
  const toggle = (c: string) => setV({ ...v, channels: v.channels.includes(c) ? v.channels.filter((x) => x !== c) : [...v.channels, c] });
  return (
    <Section title="Instant text to new leads" busy={busy} enabled={v.enabled} onEnabled={(e) => setV({ ...v, enabled: e })}
      onSave={() => (v.template.trim() ? save({ ...v, template: v.template.trim() }) : notify('Write the text first.', 'error'))}
      help={<>A new lead with a phone number gets this text within a minute, signed by their salesperson. It does not count as
        the salesperson's reply — they still need to answer. {STOP_NOTE}</>}>
      <TextField label="Text" value={v.template} onChange={(e) => setV({ ...v, template: e.target.value })} multiline minRows={3}
        helperText={PLACEHOLDERS} />
      <Box>
        <Typography variant="body2" sx={{ mb: 1 }}>Send it to leads from (website leads always get it):</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {CHANNELS.map((c) => (
            <Chip key={c} label={CHANNEL_LABEL[c]} color={v.channels.includes(c) ? 'primary' : 'default'}
              variant={v.channels.includes(c) ? 'filled' : 'outlined'} onClick={() => toggle(c)} />
          ))}
        </Box>
      </Box>
    </Section>
  );
};

const MissedCallSection: React.FC<{ initial: SalesSettings['missedCall'] }> = ({ initial }) => {
  const [v, setV] = useState(initial);
  const { busy, save } = useSaver('missedCall');
  return (
    <Section title="Missed-call text-back" busy={busy} enabled={v.enabled} onEnabled={(e) => setV({ ...v, enabled: e })}
      onSave={() => (v.template.trim() ? save({ ...v, template: v.template.trim() }) : notify('Write the text first.', 'error'))}
      help={<>When a team phone (Android, TIGON IOT app with notification access) misses a call from a number that isn't
        saved in its contacts, we text the caller back from the store's texting phone — once per number per day. {STOP_NOTE}</>}>
      <TextField label="Text" value={v.template} onChange={(e) => setV({ ...v, template: e.target.value })} multiline minRows={3}
        helperText={PLACEHOLDERS} />
      <FormControlLabel control={<Switch checked={v.createLead} onChange={(e) => setV({ ...v, createLead: e.target.checked })} />}
        label="Also add the caller as a new lead for the phone's owner" />
    </Section>
  );
};

const CadenceSection: React.FC<{ initial: SalesSettings['cadence'] }> = ({ initial }) => {
  const [v, setV] = useState(initial);
  const { busy, save } = useSaver('cadence');
  const set = (i: number, patch: Partial<CadenceStep>) => setV({ ...v, steps: v.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  return (
    <Section title="Follow-up plan" busy={busy} enabled={v.enabled} onEnabled={(e) => setV({ ...v, enabled: e })}
      onSave={() => save({ ...v, steps: sortSteps(v.steps.filter((s) => s.template.trim()).map((s) => ({ ...s, template: s.template.trim() }))) })}
      help="Every new lead gets these follow-ups until they buy or are marked lost. On the day, the salesperson sees a to-do on their Today list — texts are ready to send with one tap. Nothing is sent without them.">
      {v.steps.map((s, i) => (
        <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
          <TextField size="small" label="Day" type="number" value={s.day} sx={{ width: 80 }}
            onChange={(e) => set(i, { day: num(e.target.value, 0, 365, s.day) })} />
          <FormControl size="small" sx={{ width: 110 }}>
            <InputLabel>How</InputLabel>
            <Select label="How" value={s.channel} onChange={(e) => set(i, { channel: e.target.value as CadenceStep['channel'] })}>
              <MenuItem value="sms">Text</MenuItem>
              <MenuItem value="call">Call</MenuItem>
              <MenuItem value="email">Email</MenuItem>
            </Select>
          </FormControl>
          <TextField size="small" fullWidth multiline label={s.channel === 'sms' ? 'Text' : 'What to do'} value={s.template}
            onChange={(e) => set(i, { template: e.target.value })} />
          <IconButton aria-label="Remove step" onClick={() => setV({ ...v, steps: v.steps.filter((_x, j) => j !== i) })}><Delete /></IconButton>
        </Box>
      ))}
      <Typography variant="caption" color="text.secondary">Day = days after the lead came in. {PLACEHOLDERS}</Typography>
      <Box>
        <Button startIcon={<Add />} onClick={() => setV({ ...v, steps: [...v.steps, { day: (sortSteps(v.steps).slice(-1)[0]?.day || 0) + 7, channel: 'sms', template: '' }] })}>
          Add step
        </Button>
      </Box>
    </Section>
  );
};

const SERVICE_KINDS: Array<[ServiceStep['kind'], string]> = [['battery', 'Battery check'], ['accessories', 'Accessories'], ['checkup', 'Yearly check-up'], ['upgrade', 'Upgrade / trade-in']];

const ServiceSection: React.FC<{ initial: SalesSettings['service'] }> = ({ initial }) => {
  const [v, setV] = useState(initial);
  const { busy, save } = useSaver('service');
  const set = (i: number, patch: Partial<ServiceStep>) => setV({ ...v, steps: v.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  return (
    <Section title="After-sale follow-ups" busy={busy} enabled={v.enabled} onEnabled={(e) => setV({ ...v, enabled: e })}
      onSave={() => save({ ...v, steps: [...v.steps.filter((s) => s.template.trim() && s.months > 0)].sort((a, b) => a.months - b.months) })}
      help="When a lead is marked sold, the salesperson gets these to-dos for later (battery checks, accessories, upgrades). They're never sent automatically — one tap to send when they're due.">
      {v.steps.map((s, i) => (
        <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
          <TextField size="small" label="Months" type="number" value={s.months} sx={{ width: 90 }}
            onChange={(e) => set(i, { months: num(e.target.value, 1, 120, s.months) })} />
          <FormControl size="small" sx={{ width: 160 }}>
            <InputLabel>Kind</InputLabel>
            <Select label="Kind" value={s.kind} onChange={(e) => set(i, { kind: e.target.value as ServiceStep['kind'] })}>
              {SERVICE_KINDS.map(([k, l]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField size="small" fullWidth multiline label="Text" value={s.template} onChange={(e) => set(i, { template: e.target.value })} />
          <IconButton aria-label="Remove step" onClick={() => setV({ ...v, steps: v.steps.filter((_x, j) => j !== i) })}><Delete /></IconButton>
        </Box>
      ))}
      <Typography variant="caption" color="text.secondary">Months = months after the sale. {PLACEHOLDERS}</Typography>
      <Box>
        <Button startIcon={<Add />} onClick={() => setV({ ...v, steps: [...v.steps, { months: 12, kind: 'checkup', template: '' }] })}>Add reminder</Button>
      </Box>
    </Section>
  );
};

const TextingSettings: React.FC<object> = () => {
  const { settings, loaded } = useSalesSettings();
  if (!loaded) return <CircularProgress />;
  return (
    <Stack spacing={2}>
      <DeliverySection initial={settings.sms} />
      <AutoTextSection initial={settings.autoText} />
      <MissedCallSection initial={settings.missedCall} />
      <CadenceSection initial={settings.cadence} />
      <ServiceSection initial={settings.service} />
    </Stack>
  );
};

export default TextingSettings;
