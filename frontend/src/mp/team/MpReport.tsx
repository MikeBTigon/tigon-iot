import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { endOfMonth, format, startOfMonth } from 'date-fns';
import {
  Alert, Box, Button, CircularProgress, GlobalStyles, Table, TableBody, TableCell, TableHead, TableRow, Typography,
} from '@mui/material';
import { ArrowBack, Print } from '@mui/icons-material';
import { db } from '../../config/firebase';
import { useMp } from '../MpDataContext';
import { COLLECTIONS, locationName, locationRank } from '../constants';
import { cartTitle } from '../cartLogic';
import { formatPrice } from '../cartUtils';
import type { MpEvent } from '../types';
import type { Click, Lead } from '../growthTypes';
import { loadTeamEvents, loadTeamLeads } from './teamData';

interface Data {
  events: MpEvent[];
  leads: Lead[];
  clicks: Click[];
  errors: string[];
}

const inMonth = (ts: number | undefined, start: number, end: number) => !!ts && ts >= start && ts <= end;

const Kpi: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, breakInside: 'avoid' }}>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
    <Typography variant="h5" sx={{ fontWeight: 700, color: '#0e4671' }}>{value}</Typography>
  </Box>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Box sx={{ mb: 3, breakInside: 'avoid' }}>
    <Typography variant="h6" sx={{ color: '#af1f31', borderBottom: 2, borderColor: '#af1f31', mb: 1 }}>{title}</Typography>
    {children}
  </Box>
);

/** Print-optimized monthly summary (browser Print → "Save as PDF"). Managers only. */
const MpReport: React.FC = () => {
  const navigate = useNavigate();
  const { profile, carts, cartsLoading, ensureCartsLoaded, users, userName } = useMp();
  const isManager = profile?.role === 'admin' || profile?.role === 'manager';
  const [month] = useState(() => {
    const d = new Date();
    return { start: startOfMonth(d).getTime(), end: endOfMonth(d).getTime(), label: format(d, 'MMMM yyyy'), printed: format(d, 'PPpp') };
  });
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    if (profile) ensureCartsLoaded();
  }, [profile, ensureCartsLoaded]);

  useEffect(() => {
    if (!isManager) return;
    let alive = true;
    const { start, end } = month;
    Promise.allSettled([
      loadTeamEvents(start, end),
      loadTeamLeads(start),
      getDocs(query(collection(db, COLLECTIONS.clicks), where('ts', '>=', start), where('ts', '<=', end))),
    ]).then(([ev, ld, cl]) => {
      if (!alive) return;
      const errors = [ev, ld, cl].filter((r) => r.status === 'rejected').map((r) => String((r as PromiseRejectedResult).reason));
      setData({
        events: ev.status === 'fulfilled' ? ev.value : [],
        leads: ld.status === 'fulfilled' ? ld.value : [],
        clicks: cl.status === 'fulfilled' ? cl.value.docs.map((d) => ({ id: d.id, ...d.data() }) as Click) : [],
        errors,
      });
    });
    return () => { alive = false; };
  }, [isManager, month]);

  const report = useMemo(() => {
    if (!data) return null;
    const { start, end } = month;
    const count = (type: MpEvent['type']) => data.events.filter((e) => e.type === type).length;
    const newLeads = data.leads.filter((l) => inMonth(l.createdAt, start, end));
    const sold = data.leads.filter((l) => l.status === 'sold' && inMonth(l.soldAt, start, end));
    const revenue = sold.reduce((s, l) => s + (l.soldPrice || 0), 0);

    const people = new Map<string, { posts: number; prepared: number; shares: number; leads: number; sales: number; revenue: number }>();
    const person = (uid: string) => {
      let p = people.get(uid);
      if (!p) people.set(uid, (p = { posts: 0, prepared: 0, shares: 0, leads: 0, sales: 0, revenue: 0 }));
      return p;
    };
    for (const e of data.events) {
      if (e.type === 'post_marked') person(e.userId).posts++;
      else if (e.type === 'listing_prepared') person(e.userId).prepared++;
      else if (e.type === 'share') person(e.userId).shares++;
    }
    for (const l of newLeads) person(l.ownerUid).leads++;
    for (const l of sold) {
      person(l.ownerUid).sales++;
      person(l.ownerUid).revenue += l.soldPrice || 0;
    }

    const locs = new Map<string, { count: number; posted: number; total: number }>();
    for (const c of carts) {
      const l = locs.get(c.locationId) || { count: 0, posted: 0, total: 0 };
      l.count++;
      l.total += c.price || 0;
      if (Object.keys(c.postedAccounts).length) l.posted++;
      locs.set(c.locationId, l);
    }

    const clicksByCart = new Map<string, number>();
    for (const c of data.clicks) clicksByCart.set(c.cartId, (clicksByCart.get(c.cartId) || 0) + 1);
    const topCarts = [...clicksByCart.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, n]) => {
      const cart = carts.find((c) => c.docId === id);
      return { id, n, title: cart ? cartTitle(cart) : id, price: cart?.price, loc: cart?.locationId || '' };
    });

    return {
      posts: count('post_marked'), prepared: count('listing_prepared'), failed: count('post_failed'), shares: count('share'),
      newLeads: newLeads.length, sales: sold.length, revenue, clicks: data.clicks.length,
      neverPosted: carts.filter((c) => !Object.keys(c.postedAccounts).length).length,
      people: [...people.entries()].sort((a, b) => b[1].posts - a[1].posts || b[1].sales - a[1].sales),
      locs: [...locs.entries()].sort((a, b) => locationRank(a[0]) - locationRank(b[0])),
      topCarts,
    };
  }, [data, carts, month]);

  if (profile === undefined) return <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress /></Box>;
  if (!isManager) return <Box sx={{ p: 3 }}><Alert severity="warning">The printable report is for managers and admins.</Alert></Box>;

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto', p: { xs: 2, sm: 4 }, bgcolor: '#fff', color: '#222', minHeight: '100vh' }}>
      <GlobalStyles styles={{ '@media print': { '.no-print': { display: 'none !important' }, body: { background: '#fff' }, '@page': { margin: '12mm' } } }} />
      <Box className="no-print" sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Button startIcon={<ArrowBack />} onClick={() => navigate('/mp/exports')}>Back</Button>
        <Box sx={{ flexGrow: 1 }} />
        <Button variant="contained" startIcon={<Print />} onClick={() => window.print()} disabled={!report}>Print / Save as PDF</Button>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="h4" sx={{ fontWeight: 800, color: '#af1f31', flexGrow: 1 }}>TIGON Marketplace report</Typography>
        <Typography variant="h6" sx={{ color: '#0e4671' }}>{month.label}</Typography>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
        Printed {month.printed} by {profile?.name}. Inventory is as of now; activity covers {month.label}.
      </Typography>

      {data?.errors.map((e) => <Alert key={e} severity="warning" className="no-print" sx={{ mb: 1 }}>Part of the data could not load: {e}</Alert>)}
      {(!report || cartsLoading) && <Box className="no-print" sx={{ py: 2 }}><CircularProgress size={24} /> Loading…</Box>}

      {report && (
        <>
          <Section title="This month at a glance">
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 1 }}>
              <Kpi label="Posts" value={report.posts} />
              <Kpi label="Listings prepared" value={report.prepared} />
              <Kpi label="Failed posts" value={report.failed} />
              <Kpi label="Shares" value={report.shares} />
              <Kpi label="Link clicks" value={report.clicks} />
              <Kpi label="New leads" value={report.newLeads} />
              <Kpi label="Sales" value={report.sales} />
              <Kpi label="Sales revenue" value={formatPrice(report.revenue)} />
              <Kpi label="Carts in stock" value={carts.length} />
              <Kpi label="Never posted" value={report.neverPosted} />
            </Box>
          </Section>

          <Section title="Team">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Person</TableCell>
                  <TableCell align="right">Posts</TableCell>
                  <TableCell align="right">Prepared</TableCell>
                  <TableCell align="right">Shares</TableCell>
                  <TableCell align="right">Leads</TableCell>
                  <TableCell align="right">Sales</TableCell>
                  <TableCell align="right">Revenue</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {!report.people.length && <TableRow><TableCell colSpan={7}>No activity yet this month.</TableCell></TableRow>}
                {report.people.map(([uid, p]) => (
                  <TableRow key={uid}>
                    <TableCell>{users.some((u) => u.uid === uid) ? userName(uid) : uid || 'Unknown'}</TableCell>
                    <TableCell align="right">{p.posts}</TableCell>
                    <TableCell align="right">{p.prepared}</TableCell>
                    <TableCell align="right">{p.shares}</TableCell>
                    <TableCell align="right">{p.leads}</TableCell>
                    <TableCell align="right">{p.sales}</TableCell>
                    <TableCell align="right">{p.revenue ? formatPrice(p.revenue) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>

          <Section title="Inventory by location">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Location</TableCell>
                  <TableCell align="right">In stock</TableCell>
                  <TableCell align="right">Posted</TableCell>
                  <TableCell align="right">Posted %</TableCell>
                  <TableCell align="right">Avg price</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {report.locs.map(([loc, l]) => (
                  <TableRow key={loc}>
                    <TableCell>{loc} · {locationName(loc)}</TableCell>
                    <TableCell align="right">{l.count}</TableCell>
                    <TableCell align="right">{l.posted}</TableCell>
                    <TableCell align="right">{l.count ? Math.round((l.posted / l.count) * 100) : 0}%</TableCell>
                    <TableCell align="right">{l.count ? formatPrice(Math.round(l.total / l.count)) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>

          <Section title="Most-clicked carts">
            {!report.topCarts.length ? <Typography variant="body2">No link clicks this month.</Typography> : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Cart</TableCell>
                    <TableCell>Location</TableCell>
                    <TableCell align="right">Price</TableCell>
                    <TableCell align="right">Clicks</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {report.topCarts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{c.title}</TableCell>
                      <TableCell>{c.loc}</TableCell>
                      <TableCell align="right">{c.price ? formatPrice(c.price) : '—'}</TableCell>
                      <TableCell align="right">{c.n}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Section>
        </>
      )}
    </Box>
  );
};

export default MpReport;
