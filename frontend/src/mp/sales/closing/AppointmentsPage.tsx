// Track 3 — /mp/appointments: test drives and visits per store (day / week), add, mark showed / no-show / cancelled, reschedule.
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Stack,
  TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { Add, ChevronLeft, ChevronRight, Event } from '@mui/icons-material';
import { addDoc, collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import MpShell from '../../components/MpShell';
import { useMp } from '../../MpDataContext';
import { useLeads, updateLead } from '../../crm/crmData';
import ApptRow from './ApptRow';
import { notify } from '../../../ui/notify';
import { SALES_COLLECTIONS } from '../salesTypes';
import type { Appointment, LeadSalesFields } from '../salesTypes';
import type { Lead } from '../../growthTypes';
import { e164, useSalesSettings } from '../salesData';
import {
  KIND_LABEL, STORE_IDS, addDays, dayLabel, nyClock, nyDateKey, nyHHMM, nyParts, nyTime, slotStarts, storeName,
} from './closingUtils';

type A = Appointment & { dateKey?: string };
type LeadRow = Lead & LeadSalesFields;

/** Appointments with startAt in [from, to) — one range filter on one field. */
function useAppointments(from: number, to: number): { rows: A[]; error: string } {
  const [state, setState] = useState<{ key: string; rows: A[]; error: string }>({ key: '', rows: [], error: '' });
  const key = `${from}|${to}`;
  useEffect(() => {
    const k = `${from}|${to}`;
    return onSnapshot(
      query(collection(db, SALES_COLLECTIONS.appointments), where('startAt', '>=', from), where('startAt', '<', to)),
      (s) => setState({ key: k, rows: s.docs.map((d) => ({ id: d.id, ...d.data() }) as A), error: '' }),
      (e) => setState({ key: k, rows: [], error: e.message }),
    );
  }, [from, to]);
  return state.key === key ? state : { rows: [], error: '' };
}

const weekStart = (dateKey: string) => {
  const wd = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(nyParts(nyTime(dateKey, '12:00')).weekday);
  return addDays(dateKey, -((wd + 6) % 7)); // Monday
};

// ---------------------------------------------------------------------------
// Add / reschedule dialog
// ---------------------------------------------------------------------------

const ApptDialog: React.FC<{ onClose: () => void; appt?: A; defaultStore: string; defaultDate: string; all: A[] }> = ({ onClose, appt, defaultStore, defaultDate, all }) => {
  const { profile } = useMp();
  const { settings } = useSalesSettings();
  const { leads } = useLeads(profile);
  const [storeId, setStoreId] = useState(appt?.storeId || defaultStore || STORE_IDS[0]);
  const [kind, setKind] = useState<Appointment['kind']>(appt?.kind || 'test_drive');
  const [date, setDate] = useState(appt ? nyDateKey(appt.startAt) : defaultDate);
  const [time, setTime] = useState(appt ? nyHHMM(appt.startAt) : '');
  const [lead, setLead] = useState<LeadRow | null>(null);
  const [name, setName] = useState(appt?.name || '');
  const [phone, setPhone] = useState(appt?.phone || '');
  const [notes, setNotes] = useState(appt?.notes || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const step = Math.min(Math.max(Number(settings.booking.slotMinutes) || 30, 10), 240);
  const slots = /^\d{4}-\d{2}-\d{2}$/.test(date) ? slotStarts(date, settings.booking) : [];
  const times = Array.from(new Set([...slots.map(nyHHMM), ...(time ? [time] : [])])).sort();
  const start = date && time ? nyTime(date, time) : 0;
  const sameSlot = all.filter((a) => a.id !== appt?.id && a.storeId === storeId && a.startAt === start && (a.status === 'booked' || a.status === 'showed')).length;
  const options = useMemo(() => (leads as LeadRow[]).filter((l) => l.status === 'new' || l.status === 'talking').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)), [leads]);

  const save = async () => {
    setError('');
    if (!profile) return;
    if (!start) { setError('Pick a day and time.'); return; }
    if (!appt && name.trim().length < 2) { setError('Enter the customer\'s name.'); return; }
    if (!appt && !e164(phone)) { setError('Enter a 10-digit phone number.'); return; }
    setBusy(true);
    try {
      const now = Date.now();
      const timing = { startAt: start, endAt: start + step * 60_000, dateKey: date, updatedAt: now };
      if (appt) {
        await updateDoc(doc(db, SALES_COLLECTIONS.appointments, appt.id), {
          ...timing, storeId, kind, status: 'booked', remindedDayBefore: false, remindedSoon: false, showAskedAt: null, noShowTextedAt: null,
          ...(notes.trim() ? { notes: notes.trim().slice(0, 300) } : {}),
        });
        if (appt.leadId) await updateLead(appt.leadId, { appointmentAt: start }).catch(() => undefined);
        notify('Rescheduled', 'success');
      } else {
        const data = Object.fromEntries(Object.entries({
          ...timing, storeId, kind, name: name.trim().slice(0, 80), phone: e164(phone), email: lead?.email || undefined, status: 'booked',
          source: 'staff', leadId: lead?.id, ownerUid: lead?.ownerUid || profile.uid, cartId: lead?.cartId, cartTitle: lead?.cartTitle,
          notes: notes.trim().slice(0, 300) || undefined, createdAt: now,
        }).filter(([, v]) => v !== undefined && v !== ''));
        const ref = await addDoc(collection(db, SALES_COLLECTIONS.appointments), data);
        if (lead) await updateLead(lead.id, { appointmentId: ref.id, appointmentAt: start }).catch(() => undefined);
        notify('Appointment added — the customer gets reminder texts.', 'success');
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{appt ? `Reschedule ${appt.name}` : 'Add appointment'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {!appt && (
            <Autocomplete size="small" options={options} value={lead} isOptionEqualToValue={(a, b) => a.id === b.id}
              getOptionLabel={(l) => `${l.name || 'No name'}${l.phone ? ` · ${l.phone}` : ''}`}
              onChange={(_e, l) => { setLead(l); if (l) { setName(l.name || ''); setPhone(l.phone || ''); if (l.locationId) setStoreId(l.locationId); } }}
              renderInput={(p) => <TextField {...p} label="Lead (optional)" />} />
          )}
          {!appt && <TextField size="small" label="Customer name" value={name} onChange={(e) => setName(e.target.value)} />}
          {!appt && <TextField size="small" label="Mobile phone" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" />}
          <TextField select size="small" label="Store" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            {STORE_IDS.map((id) => <MenuItem key={id} value={id}>{storeName(id)}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Kind" value={kind} onChange={(e) => setKind(e.target.value as Appointment['kind'])}>
            {Object.entries(KIND_LABEL).map(([k, l]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}
          </TextField>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField size="small" type="date" label="Day" value={date} onChange={(e) => { setDate(e.target.value); setTime(''); }} sx={{ flex: 1 }} slotProps={{ inputLabel: { shrink: true } }} />
            {times.length ? (
              <TextField select size="small" label="Time" value={time} onChange={(e) => setTime(e.target.value)} sx={{ width: 130 }}>
                {times.map((t) => <MenuItem key={t} value={t}>{nyClock(nyTime(date, t))}</MenuItem>)}
              </TextField>
            ) : (
              <TextField size="small" type="time" label="Time" value={time} onChange={(e) => setTime(e.target.value)} sx={{ width: 130 }} slotProps={{ inputLabel: { shrink: true } }} />
            )}
          </Box>
          {!slots.length && date && <Typography variant="caption" color="text.secondary">The store is closed that day in the booking hours — you can still add it.</Typography>}
          {sameSlot >= (Number(settings.booking.perSlot) || 1) && <Alert severity="warning">That time already has {sameSlot} booking{sameSlot > 1 ? 's' : ''} at this store.</Alert>}
          <TextField size="small" label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} multiline minRows={2} />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={busy}>{appt ? 'Save new time' : 'Add'}</Button>
      </DialogActions>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const AppointmentsPage: React.FC = () => {
  const { profile } = useMp();
  const [store, setStore] = useState<string>(profile?.location && STORE_IDS.includes(profile.location) ? profile.location : 'all');
  const [view, setView] = useState<'day' | 'week'>('day');
  const [day, setDay] = useState(() => nyDateKey(Date.now()));
  const [hideCancelled, setHideCancelled] = useState(true);
  const [dialog, setDialog] = useState<null | { appt?: A }>(null);
  const first = view === 'day' ? day : weekStart(day);
  const days = view === 'day' ? [first] : Array.from({ length: 7 }, (_v, i) => addDays(first, i));
  const from = nyTime(first, '00:00');
  const to = nyTime(addDays(first, days.length), '00:00');
  const { rows, error } = useAppointments(from, to);
  const shown = rows.filter((a) => (store === 'all' || a.storeId === store) && (!hideCancelled || a.status !== 'cancelled')).sort((a, b) => a.startAt - b.startAt);

  return (
    <MpShell>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Event color="primary" />
        <Typography variant="h5" color="primary" sx={{ fontWeight: 700, flexGrow: 1 }}>Appointments</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => setDialog({})}>Add</Button>
      </Box>
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField select size="small" label="Store" value={store} onChange={(e) => setStore(e.target.value)} sx={{ minWidth: 180 }}>
          <MenuItem value="all">All stores</MenuItem>
          {STORE_IDS.map((id) => <MenuItem key={id} value={id}>{storeName(id)}</MenuItem>)}
        </TextField>
        <ToggleButtonGroup size="small" exclusive value={view} onChange={(_e, v) => v && setView(v)}>
          <ToggleButton value="day">Day</ToggleButton>
          <ToggleButton value="week">Week</ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton onClick={() => setDay(addDays(day, view === 'day' ? -1 : -7))} aria-label="Earlier"><ChevronLeft /></IconButton>
          <Typography sx={{ fontWeight: 600, minWidth: 120, textAlign: 'center' }}>{view === 'day' ? dayLabel(day) : `Week of ${dayLabel(first)}`}</Typography>
          <IconButton onClick={() => setDay(addDays(day, view === 'day' ? 1 : 7))} aria-label="Later"><ChevronRight /></IconButton>
        </Box>
        <Button size="small" onClick={() => setDay(nyDateKey(Date.now()))}>Today</Button>
        <Chip label="Hide cancelled" color={hideCancelled ? 'primary' : 'default'} variant={hideCancelled ? 'filled' : 'outlined'} onClick={() => setHideCancelled((v) => !v)} />
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Stack spacing={2}>
        {days.map((d) => {
          const list = shown.filter((a) => nyDateKey(a.startAt) === d);
          if (view === 'week' && !list.length) return null;
          return (
            <Card key={d} variant="outlined">
              <CardContent sx={{ '&:last-child': { pb: 1 } }}>
                <Typography sx={{ fontWeight: 700 }}>{dayLabel(d)}{list.length ? ` · ${list.length}` : ''}</Typography>
                {!list.length && <Typography color="text.secondary" sx={{ py: 1 }}>No appointments.</Typography>}
                {list.map((a) => <ApptRow key={a.id} a={a} showStore={store === 'all'} onReschedule={() => setDialog({ appt: a })} />)}
              </CardContent>
            </Card>
          );
        })}
        {view === 'week' && !shown.length && <Alert severity="info">No appointments this week.</Alert>}
      </Stack>
      {dialog && <ApptDialog onClose={() => setDialog(null)} appt={dialog.appt} defaultStore={store === 'all' ? profile?.location || '' : store} defaultDate={day} all={rows} />}
    </MpShell>
  );
};

export default AppointmentsPage;
