import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { format, subDays } from 'date-fns';
import { Alert, Box, Button, Paper, TextField, Typography } from '@mui/material';
import { Download, Print } from '@mui/icons-material';
import { db } from '../../config/firebase';
import MpShell from '../components/MpShell';
import { useMp } from '../MpDataContext';
import { COLLECTIONS, locationName } from '../constants';
import { cartTitle } from '../cartLogic';
import { writeAudit } from '../audit';
import type { MpEvent, QueueItem } from '../types';
import type { Click, Customer, Lead } from '../growthTypes';
import { csvDate, saveCsv } from './files';

const stamp = () => format(new Date(), 'yyyy-MM-dd');

async function all<T>(name: string): Promise<T[]> {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
}

async function inRange<T>(name: string, start: number, end: number): Promise<T[]> {
  const snap = await getDocs(query(collection(db, name), where('ts', '>=', start), where('ts', '<=', end)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
}

/** Managers: CSV downloads of inventory, posts, queue, leads, customers, events and clicks + a printable report. */
const MpExports: React.FC = () => {
  const navigate = useNavigate();
  const { profile, carts, cartsLoading, accounts, userName } = useMp();
  const isManager = profile?.role === 'admin' || profile?.role === 'manager';
  const [from, setFrom] = useState(() => format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [to, setTo] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  if (profile && !isManager) {
    return <MpShell><Alert severity="warning">Exports are for managers and admins.</Alert></MpShell>;
  }

  const range = () => ({ start: new Date(`${from}T00:00:00`).getTime(), end: new Date(`${to}T23:59:59.999`).getTime() });
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name || id;

  const exportsList: Array<{ key: string; title: string; about: string; dated?: boolean; run: () => Promise<number> }> = [
    {
      key: 'inventory', title: 'Inventory', about: 'In-stock carts with source, location, price and how often each was posted.',
      run: async () => {
        const rows = carts.map((c) => ({
          id: c.docId, title: cartTitle(c), year: c.year, make: c.make, model: c.model, color: c.color,
          condition: c.isUsed ? 'Used' : 'New', price: c.price, location: c.locationId, locationName: locationName(c.locationId),
          source: c.source || 'dms-api', serial: c.serial, vin: c.vin, photos: c.photos.length,
          postedAccounts: Object.keys(c.postedAccounts).length, postedByPeople: Object.keys(c.postedBy).length,
          lastPosted: csvDate(Math.max(0, ...Object.values(c.postedAccounts).map((p) => p.ts), ...Object.values(c.postedBy))),
        }));
        await saveCsv(`inventory-${stamp()}`, rows);
        return rows.length;
      },
    },
    {
      key: 'posts', title: 'Posts', about: 'Every account each in-stock cart is posted on: cart, account, who and when.',
      run: async () => {
        const rows = carts.flatMap((c) => Object.entries(c.postedAccounts).map(([acct, p]) => ({
          cartId: c.docId, cart: cartTitle(c), location: c.locationId, price: c.price,
          account: accountName(acct), postedBy: userName(p.by), date: csvDate(p.ts),
        }))).sort((a, b) => b.date.localeCompare(a.date));
        await saveCsv(`posts-${stamp()}`, rows);
        return rows.length;
      },
    },
    {
      key: 'queue', title: 'Queue', about: 'All posting-queue items with status, assignee and timing.',
      run: async () => {
        const items = await all<QueueItem>(COLLECTIONS.queue);
        const rows = items.sort((a, b) => b.createdAt - a.createdAt).map((i) => ({
          id: i.id, cart: i.cartTitle, cartId: i.cartId, price: i.cartPrice, location: i.locationId, status: i.status,
          assignedTo: userName(i.assignedUserId), account: i.accountName, variation: i.variation + 1,
          createdBy: userName(i.createdBy), created: csvDate(i.createdAt), scheduled: csvDate(i.scheduledAt),
          sent: csvDate(i.sentAt), opened: csvDate(i.openedAt), posted: csvDate(i.postedAt), attempts: i.attempts,
          approvedBy: i.approvedBy ? userName(i.approvedBy) : '', rejectedReason: i.rejectedReason || '', lastError: i.lastError || '',
        }));
        await saveCsv(`queue-${stamp()}`, rows);
        return rows.length;
      },
    },
    {
      key: 'leads', title: 'Leads', about: 'All leads (every owner) with status, channel, cart and sale.',
      run: async () => {
        const leads = await all<Lead>(COLLECTIONS.leads);
        const rows = leads.sort((a, b) => b.createdAt - a.createdAt).map((l) => ({
          id: l.id, name: l.name, phone: l.phone, email: l.email, channel: l.channel, status: l.status,
          owner: userName(l.ownerUid), cart: l.cartTitle || '', cartId: l.cartId || '', link: l.linkCode || '',
          created: csvDate(l.createdAt), lastContact: csvDate(l.lastContactAt), followUp: csvDate(l.followUpAt),
          soldPrice: l.soldPrice ?? '', soldAt: csvDate(l.soldAt), notes: l.notes,
        }));
        await saveCsv(`leads-${stamp()}`, rows);
        return rows.length;
      },
    },
    {
      key: 'customers', title: 'Customers', about: 'Customers with SMS / WhatsApp / email consent and where it was recorded.',
      run: async () => {
        const list = await all<Customer>(COLLECTIONS.customers);
        const rows = list.sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({
          id: c.id, name: c.name, phone: c.phone, email: c.email,
          consentSms: c.consentSms ? 'yes' : 'no', consentWhatsapp: c.consentWhatsapp ? 'yes' : 'no', consentEmail: c.consentEmail ? 'yes' : 'no',
          consentAt: csvDate(c.consentAt), consentSource: c.consentSource || '', tags: (c.tags || []).join('; '),
          location: c.locationId, lastPurchase: csvDate(c.lastPurchaseAt), reviewRequested: csvDate(c.reviewRequestedAt),
          createdBy: userName(c.createdBy), created: csvDate(c.createdAt),
        }));
        await saveCsv(`customers-${stamp()}`, rows);
        return rows.length;
      },
    },
    {
      key: 'events', title: 'Analytics events', about: 'App activity (prepared, posted, shared, failed…) in the date range.', dated: true,
      run: async () => {
        const { start, end } = range();
        const events = await inRange<MpEvent>(COLLECTIONS.events, start, end);
        const rows = events.sort((a, b) => a.ts - b.ts).map((e) => ({
          time: csvDate(e.ts), type: e.type, user: userName(e.userId), device: e.deviceId, platform: e.platform,
          cartId: e.cartId || '', queueId: e.queueId || '', account: e.accountId ? accountName(e.accountId) : '', message: e.message || '',
        }));
        await saveCsv(`events-${from}-to-${to}`, rows);
        return rows.length;
      },
    },
    {
      key: 'clicks', title: 'Clicks', about: 'Short-link clicks in the date range, by platform, person and A/B variant.', dated: true,
      run: async () => {
        const { start, end } = range();
        const clicks = await inRange<Click>(COLLECTIONS.clicks, start, end);
        const rows = clicks.sort((a, b) => a.ts - b.ts).map((c) => ({
          time: csvDate(c.ts), code: c.code, cartId: c.cartId, platform: c.platform, user: userName(c.userId),
          device: c.deviceId, variant: c.variant || '', abTest: c.abTestId || '', referrer: c.referrer || '',
        }));
        await saveCsv(`clicks-${from}-to-${to}`, rows);
        return rows.length;
      },
    },
  ];

  const run = async (x: (typeof exportsList)[number]) => {
    setBusy(x.key);
    setError('');
    setDone('');
    try {
      const n = await x.run();
      setDone(`${x.title}: ${n} row${n === 1 ? '' : 's'} exported.`);
      await writeAudit(profile, 'export.csv', x.key, `${n} rows${x.dated ? ` ${from}..${to}` : ''}`);
    } catch (e) {
      setError(`${x.title}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy('');
    }
  };

  return (
    <MpShell>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>Exports</Typography>
        <Button variant="contained" color="secondary" startIcon={<Print />} onClick={() => navigate('/mp/report')}>Printable report</Button>
      </Box>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        CSV files open in Excel, Numbers or Google Sheets. On a phone, the share sheet lets you save or email them.
      </Typography>
      <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>Date range (events & clicks)</Typography>
        <TextField type="date" size="small" label="From" value={from} onChange={(e) => setFrom(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField type="date" size="small" label="To" value={to} onChange={(e) => setTo(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
      </Paper>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {done && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setDone('')}>{done}</Alert>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 1.5 }}>
        {exportsList.map((x) => (
          <Paper key={x.key} sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{x.title}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
              {x.about}{x.dated ? ` (${from} → ${to})` : ''}
            </Typography>
            <Box>
              <Button
                variant="outlined"
                startIcon={<Download />}
                onClick={() => run(x)}
                disabled={!!busy || ((x.key === 'inventory' || x.key === 'posts') && cartsLoading)}
              >
                {busy === x.key ? 'Exporting…' : 'Download CSV'}
              </Button>
            </Box>
          </Paper>
        ))}
      </Box>
    </MpShell>
  );
};

export default MpExports;
