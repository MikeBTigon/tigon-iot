import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, ListItemText, Menu, MenuItem, Paper,
  TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { Add, ChevronLeft, ChevronRight, Today } from '@mui/icons-material';
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../../config/firebase';
import MpShell from '../components/MpShell';
import { useMp } from '../MpDataContext';
import { COLLECTIONS } from '../constants';
import { isOpenStatus, QUEUE_STATUS_LABEL } from '../queue';
import { writeAudit } from '../audit';
import { displayMake, displayModel } from '../cartLogic';
import CartPicker from './CartPicker';
import { fromLocalInput, isManager, startOfDay, toLocalInput, useMpSettings, useNow } from './crmData';
import type { MpProfile, QueueItem, QueueStatus } from '../types';

const DAY = 86_400_000;
const FIRST_HOUR = 6;
const LAST_HOUR = 22;
const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i);
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const STATUS_COLOR: Record<QueueStatus, string> = {
  pending_approval: '#7b1fa2', queued: '#0e4671', sent: '#0288d1', opened: '#ed6c02',
  posted: '#2e7d32', failed: '#af1f31', cancelled: '#9e9e9e',
};
const RELIST_COLOR = '#795548';

/** Local-time date arithmetic (DST-safe). */
function addDays(ts: number, n: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
}
function startOfWeek(ts: number): number {
  const d = new Date(startOfDay(ts));
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  return addDays(d.getTime(), -dow);
}
const sameDay = (a: number, b: number) => startOfDay(a) === startOfDay(b);
const hm = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
/** Same time of day as `from`, on the day `day`. */
function onDay(day: number, from: number): number {
  const d = new Date(day);
  const f = new Date(from);
  d.setHours(f.getHours(), f.getMinutes(), 0, 0);
  return d.getTime();
}

const canMoveStatus = (s: QueueStatus) => isOpenStatus(s) || s === 'pending_approval';

/** Moves a queue item to a new time; returns an error message ('' on success). */
async function rescheduleItem(profile: MpProfile | null | undefined, item: QueueItem, ts: number, allowed: boolean): Promise<string> {
  const now = Date.now();
  if (!canMoveStatus(item.status) || !allowed) return 'Only waiting items you are assigned to (or any, for managers) can be moved.';
  if (ts < now - 5 * 60_000) return 'Pick a time in the future.';
  const patch: Record<string, unknown> = { scheduledAt: ts, updatedAt: now };
  // Already pushed to the phone: moving it later puts it back in line to be pushed at the new time.
  if ((item.status === 'sent' || item.status === 'opened') && ts > now + 60_000) {
    patch.status = 'queued';
    patch.attempts = 0;
  }
  try {
    await updateDoc(doc(db, COLLECTIONS.queue, item.id), patch);
    await writeAudit(profile, 'queue.reschedule', item.id, `${item.cartTitle} → ${new Date(ts).toLocaleString()}`);
    return '';
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

type CalEntry =
  | { kind: 'queue'; id: string; ts: number; title: string; color: string; item: QueueItem; movable: boolean }
  | { kind: 'relist'; id: string; ts: number; title: string; color: string; cartId: string };

/** Content calendar: queued posts by day/time (drag to reschedule) + relist reminders. */
export default function CalendarPage() {
  const navigate = useNavigate();
  const { profile, users, userName, carts, accounts } = useMp();
  const manager = isManager(profile);
  const settings = useMpSettings(!!profile);
  const now = useNow();
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));
  const [view, setView] = useState<'week' | 'month'>('week');
  const [anchor, setAnchor] = useState(() => Date.now());
  const [person, setPerson] = useState('all');
  const [showClosed, setShowClosed] = useState(false);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState<{ el: HTMLElement; entry: CalEntry } | null>(null);
  const [moving, setMoving] = useState<{ item: QueueItem; value: string } | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  const [overKey, setOverKey] = useState('');
  const pointerType = useRef('mouse');

  // Visible range.
  const [rangeStart, rangeEnd, days] = useMemo(() => {
    if (view === 'week') {
      const s = startOfWeek(anchor);
      return [s, addDays(s, 7), Array.from({ length: 7 }, (_, i) => addDays(s, i))];
    }
    const first = new Date(anchor);
    first.setDate(1);
    const s = startOfWeek(first.getTime());
    return [s, addDays(s, 42), Array.from({ length: 42 }, (_, i) => addDays(s, i))];
  }, [view, anchor]);

  // Members: own items (equality query). Managers: everything in the visible range.
  const uid = profile?.uid;
  useEffect(() => {
    if (!uid) return;
    const q = manager
      ? query(collection(db, COLLECTIONS.queue), where('scheduledAt', '>=', rangeStart), where('scheduledAt', '<', rangeEnd))
      : query(collection(db, COLLECTIONS.queue), where('assignedUserId', '==', uid));
    return onSnapshot(
      q,
      (snap) => { setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as QueueItem)); setError(''); },
      (e) => setError(e.message),
    );
  }, [uid, manager, rangeStart, rangeEnd]);

  const entries = useMemo<CalEntry[]>(() => {
    const who = manager ? person : uid;
    const list: CalEntry[] = items
      .filter((i) => i.scheduledAt >= rangeStart && i.scheduledAt < rangeEnd)
      .filter((i) => who === 'all' || i.assignedUserId === who)
      .filter((i) => showClosed || i.status !== 'cancelled')
      .map((i) => ({
        kind: 'queue', id: i.id, ts: i.scheduledAt, item: i, color: STATUS_COLOR[i.status],
        title: `${i.cartTitle}${i.accountName ? ` · ${i.accountName}` : ''}${manager && person === 'all' ? ` · ${userName(i.assignedUserId)}` : ''}`,
        movable: canMoveStatus(i.status) && (manager || i.assignedUserId === uid),
      }));
    // Relist reminders: postings older than relistAfterDays (overdue ones show on today).
    const acctName = new Map(accounts.map((a) => [a.id, a.name]));
    const today = startOfDay(now);
    for (const c of carts) {
      for (const [acct, entry] of Object.entries(c.postedAccounts || {})) {
        if (who !== 'all' && entry.by !== who) continue;
        let due = entry.ts + settings.relistAfterDays * DAY;
        if (due < today) due = today + 9 * 3_600_000;
        if (due < rangeStart || due >= rangeEnd) continue;
        list.push({
          kind: 'relist', id: `${c.docId}_${acct}`, ts: due, cartId: c.docId, color: RELIST_COLOR,
          title: `Relist ${displayMake(c)} ${displayModel(c)} ${c.color} · ${acctName.get(acct) || 'account'}`.replace(/\s+/g, ' '),
        });
      }
    }
    return list.sort((a, b) => a.ts - b.ts);
  }, [items, carts, accounts, settings.relistAfterDays, person, uid, manager, rangeStart, rangeEnd, showClosed, userName, now]);

  const reschedule = async (item: QueueItem, ts: number) => {
    setError(await rescheduleItem(profile, item, ts, manager || item.assignedUserId === uid));
  };

  const drop = (e: React.DragEvent, target: (from: number) => number) => {
    e.preventDefault();
    setOverKey('');
    const id = e.dataTransfer.getData('text/queue');
    const item = items.find((i) => i.id === id);
    if (item) reschedule(item, target(item.scheduledAt));
  };
  const dropProps = (key: string, target: (from: number) => number) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); if (overKey !== key) setOverKey(key); },
    onDragLeave: () => setOverKey((k) => (k === key ? '' : k)),
    onDrop: (e: React.DragEvent) => drop(e, target),
  });

  const openEntry = (entry: CalEntry, el: HTMLElement) => {
    if (entry.kind === 'relist') {
      navigate(`/mp/cart/${entry.cartId}`);
      return;
    }
    // Touch: menu with "Move to…"; mouse: straight to the post.
    if (pointerType.current === 'touch' && entry.movable) setMenu({ el, entry });
    else navigate(`/mp/post/${entry.id}`);
  };

  const chip = (entry: CalEntry, compact = false) => (
    <Tooltip key={entry.id} title={`${hm(entry.ts)} · ${entry.title}${entry.kind === 'queue' ? ` · ${QUEUE_STATUS_LABEL[entry.item.status]}` : ''}`}>
      <Box
        draggable={entry.kind === 'queue' && entry.movable}
        onDragStart={(e) => { e.dataTransfer.setData('text/queue', entry.id); e.dataTransfer.effectAllowed = 'move'; }}
        onPointerDown={(e) => { pointerType.current = e.pointerType; }}
        onClick={(e) => { e.stopPropagation(); openEntry(entry, e.currentTarget); }}
        sx={{
          px: 0.5, py: 0.25, mb: 0.25, borderRadius: 0.5, fontSize: 11, lineHeight: 1.3, cursor: 'pointer', overflow: 'hidden',
          whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: '#fff', bgcolor: entry.color,
          border: entry.kind === 'relist' ? '1px dashed #fff' : 'none',
          opacity: entry.kind === 'queue' && !canMoveStatus(entry.item.status) ? 0.75 : 1,
        }}
      >
        {compact ? '' : `${hm(entry.ts)} `}{entry.title}
      </Box>
    </Tooltip>
  );

  const dayEntries = (day: number) => entries.filter((e) => sameDay(e.ts, day));
  const title = view === 'week'
    ? `${new Date(rangeStart).toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${new Date(addDays(rangeStart, 6)).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`
    : new Date(anchor).toLocaleDateString([], { month: 'long', year: 'numeric' });
  const step = (n: number) => setAnchor((a) => {
    if (view === 'week') return addDays(a, 7 * n);
    const d = new Date(a);
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    return d.getTime();
  });

  const addBtn = (day: number) => (
    <IconButton size="small" onClick={(e) => { e.stopPropagation(); setAdding(day); }} sx={{ p: 0.25 }} aria-label="Add post"><Add sx={{ fontSize: 16 }} /></IconButton>
  );

  // Week: hour grid on desktop, agenda by day on phones.
  const weekGrid = (
    <Box sx={{ overflowX: 'auto' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: '48px repeat(7, minmax(110px, 1fr))', minWidth: 820 }}>
        <Box />
        {days.map((d, i) => (
          <Box key={d} sx={{ p: 0.5, textAlign: 'center', borderBottom: 1, borderColor: 'divider', bgcolor: sameDay(d, now) ? 'action.selected' : undefined }}>
            <Typography variant="caption" sx={{ fontWeight: 700 }}>{WEEKDAYS[i]} {new Date(d).getDate()}</Typography>
            {addBtn(d)}
          </Box>
        ))}
        {HOURS.map((h) => (
          <Box key={h} sx={{ display: 'contents' }}>
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'right', pr: 0.5, pt: 0.25 }}>
              {new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' })}
            </Typography>
            {days.map((d) => {
              const key = `${d}_${h}`;
              const cell = dayEntries(d).filter((e) => {
                const eh = Math.min(LAST_HOUR, Math.max(FIRST_HOUR, new Date(e.ts).getHours()));
                return eh === h;
              });
              return (
                <Box key={key} {...dropProps(key, () => { const x = new Date(d); x.setHours(h, 0, 0, 0); return x.getTime(); })}
                  sx={{ minHeight: 30, borderBottom: 1, borderLeft: 1, borderColor: 'divider', p: 0.25, bgcolor: overKey === key ? 'action.hover' : undefined }}>
                  {cell.map((e) => chip(e))}
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>
    </Box>
  );

  const agenda = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {days.map((d, i) => {
        const key = `day_${d}`;
        const list = dayEntries(d);
        return (
          <Paper key={d} variant="outlined" {...dropProps(key, (from) => onDay(d, from))}
            sx={{ p: 1, bgcolor: overKey === key ? 'action.hover' : sameDay(d, now) ? 'action.selected' : undefined }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Typography sx={{ fontWeight: 700, flexGrow: 1 }}>{WEEKDAYS[i]} {new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric' })}</Typography>
              {addBtn(d)}
            </Box>
            {list.length ? list.map((e) => chip(e)) : <Typography variant="caption" color="text.disabled">Nothing scheduled</Typography>}
          </Paper>
        );
      })}
    </Box>
  );

  const month = new Date(anchor).getMonth();
  const monthGrid = (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', border: 1, borderColor: 'divider' }}>
      {WEEKDAYS.map((w) => <Typography key={w} variant="caption" sx={{ textAlign: 'center', fontWeight: 700, py: 0.5, borderBottom: 1, borderColor: 'divider' }}>{w}</Typography>)}
      {days.map((d) => {
        const key = `m_${d}`;
        const list = dayEntries(d);
        const max = wide ? 4 : 2;
        return (
          <Box key={d} {...dropProps(key, (from) => onDay(d, from))}
            onClick={() => { setAnchor(d); setView('week'); }}
            sx={{
              minHeight: { xs: 64, md: 110 }, p: 0.25, borderRight: 1, borderBottom: 1, borderColor: 'divider', cursor: 'pointer', minWidth: 0,
              bgcolor: overKey === key ? 'action.hover' : sameDay(d, now) ? 'action.selected' : undefined,
              opacity: new Date(d).getMonth() === month ? 1 : 0.5,
            }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, flexGrow: 1 }}>{new Date(d).getDate()}</Typography>
              {wide && addBtn(d)}
            </Box>
            {list.slice(0, max).map((e) => chip(e, !wide))}
            {list.length > max && <Typography variant="caption" color="text.secondary">+{list.length - max} more</Typography>}
          </Box>
        );
      })}
    </Box>
  );

  return (
    <MpShell>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>Content calendar</Typography>
        <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)}>
          <ToggleButton value="week">Week</ToggleButton>
          <ToggleButton value="month">Month</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Scheduled posts from the queue. {wide ? 'Drag a post to another day or time to move it.' : 'Tap a post to move it.'} Dashed items are carts due for a relist.
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
        <IconButton onClick={() => step(-1)} aria-label="Previous"><ChevronLeft /></IconButton>
        <Button size="small" startIcon={<Today />} onClick={() => setAnchor(Date.now())}>Today</Button>
        <IconButton onClick={() => step(1)} aria-label="Next"><ChevronRight /></IconButton>
        <Typography sx={{ fontWeight: 600, flexGrow: 1 }}>{title}</Typography>
        {manager && (
          <TextField select size="small" label="Person" value={person} onChange={(e) => setPerson(e.target.value)} sx={{ minWidth: 160 }}>
            <MenuItem value="all">Everyone</MenuItem>
            {users.map((u) => <MenuItem key={u.uid} value={u.uid}>{u.name || u.email}</MenuItem>)}
          </TextField>
        )}
        <Button size="small" onClick={() => setShowClosed((s) => !s)}>{showClosed ? 'Hide cancelled' : 'Show cancelled'}</Button>
      </Box>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
        {(['pending_approval', 'queued', 'sent', 'opened', 'posted', 'failed'] as QueueStatus[]).map((s) => (
          <Box key={s} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: STATUS_COLOR[s] }} />
            <Typography variant="caption">{QUEUE_STATUS_LABEL[s]}</Typography>
          </Box>
        ))}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: RELIST_COLOR }} />
          <Typography variant="caption">Relist due</Typography>
        </Box>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {view === 'week' ? (wide ? weekGrid : agenda) : monthGrid}

      <Menu anchorEl={menu?.el} open={!!menu} onClose={() => setMenu(null)}>
        <MenuItem onClick={() => { const m = menu; setMenu(null); if (m) navigate(`/mp/post/${m.entry.id}`); }}>
          <ListItemText>Open post</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => {
          const m = menu;
          setMenu(null);
          if (m?.entry.kind === 'queue') setMoving({ item: m.entry.item, value: toLocalInput(m.entry.item.scheduledAt) });
        }}>
          <ListItemText>Move to…</ListItemText>
        </MenuItem>
      </Menu>

      <Dialog open={!!moving} onClose={() => setMoving(null)} fullWidth maxWidth="xs">
        <DialogTitle>Move post</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{moving?.item.cartTitle}</Typography>
          <TextField fullWidth type="datetime-local" label="New time" value={moving?.value || ''}
            onChange={(e) => setMoving((m) => (m ? { ...m, value: e.target.value } : m))} slotProps={{ inputLabel: { shrink: true } }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMoving(null)}>Cancel</Button>
          <Button variant="contained" onClick={() => {
            const ts = fromLocalInput(moving?.value || '');
            if (moving && ts) reschedule(moving.item, ts);
            setMoving(null);
          }}>Move</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={adding !== null} onClose={() => setAdding(null)} fullWidth maxWidth="sm">
        <DialogTitle>Plan a post {adding !== null ? `for ${new Date(adding).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}` : ''}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Pick the cart, then use <b>Auto Post</b> on its page to schedule it.
          </Typography>
          <CartPicker value={null} onChange={(c) => { if (c) { setAdding(null); navigate(`/mp/cart/${c.id}`); } }} />
        </DialogContent>
        <DialogActions><Button onClick={() => setAdding(null)}>Cancel</Button></DialogActions>
      </Dialog>
    </MpShell>
  );
}
