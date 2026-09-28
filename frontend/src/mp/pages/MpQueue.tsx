import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import {
  Alert, Box, Button, Chip, IconButton, Paper, Tab, Tabs, Tooltip, Typography,
} from '@mui/material';
import { Cancel, Delete, PlayArrow, Replay } from '@mui/icons-material';
import { db } from '../../config/firebase';
import MpShell from '../components/MpShell';
import AlertsPanel from '../components/AlertsPanel';
import ChipFilter from '../components/ChipFilter';
import { useMp } from '../MpDataContext';
import { formatPrice, timeAgo } from '../cartUtils';
import { COLLECTIONS } from '../constants';
import { cancelQueueItem, isOpenStatus, QUEUE_STATUS_COLOR, QUEUE_STATUS_LABEL, retryQueueItem } from '../queue';
import { writeAudit } from '../audit';
import type { QueueItem } from '../types';

const whenLabel = (ms: number) => {
  const diff = ms - Date.now();
  if (diff > 60000) return `Scheduled ${new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
  return `Due ${timeAgo(ms) || 'now'}`;
};

/** Posting queue: your items (open them to post) and, for managers, the whole team's. */
const MpQueue: React.FC = () => {
  const navigate = useNavigate();
  const { profile, userName } = useMp();
  const isManager = profile?.role === 'admin' || profile?.role === 'manager';
  const [items, setItems] = useState<QueueItem[]>([]);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'mine' | 'team'>('mine');
  const [status, setStatus] = useState<'open' | 'posted' | 'failed' | 'all'>('open');

  useEffect(() => {
    if (!profile) return;
    return onSnapshot(
      query(collection(db, COLLECTIONS.queue), orderBy('createdAt', 'desc'), limit(500)),
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as QueueItem)),
      (e) => setError(e.message),
    );
  }, [profile]);

  const rows = useMemo(
    () =>
      items
        .filter((i) => tab === 'team' || i.assignedUserId === profile?.uid)
        .filter((i) =>
          status === 'all' ? true : status === 'open' ? isOpenStatus(i.status) : i.status === status,
        )
        .sort((a, b) => (isOpenStatus(a.status) && isOpenStatus(b.status) ? a.scheduledAt - b.scheduledAt : b.updatedAt - a.updatedAt)),
    [items, tab, status, profile?.uid],
  );

  const mineOpen = items.filter((i) => i.assignedUserId === profile?.uid && isOpenStatus(i.status)).length;

  const act = async (fn: () => Promise<void>) => {
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <MpShell>
      <AlertsPanel />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>Posting queue</Typography>
        <Chip color={mineOpen ? 'primary' : 'default'} label={`${mineOpen} waiting for you`} />
      </Box>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Carts sent to a phone with <b>Auto Post</b>. Open one to prepare it — photos, listing and Marketplace in 3 taps.
      </Typography>
      {isManager && (
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1 }}>
          <Tab value="mine" label="Mine" />
          <Tab value="team" label="Team" />
        </Tabs>
      )}
      <ChipFilter
        label="Status"
        value={status}
        options={[
          { value: 'open', label: 'Waiting' },
          { value: 'posted', label: 'Posted' },
          { value: 'failed', label: 'Failed' },
          { value: 'all', label: 'All' },
        ]}
        onChange={setStatus}
      />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {!rows.length && <Typography color="text.secondary" sx={{ py: 3 }}>Nothing here. Use <b>Auto Post</b> on any cart page to queue one.</Typography>}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {rows.map((i) => {
          const mine = i.assignedUserId === profile?.uid;
          return (
            <Paper key={i.id} sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <Box sx={{ flexGrow: 1, minWidth: 200 }}>
                <Typography sx={{ fontWeight: 600 }}>{i.cartTitle}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {formatPrice(i.cartPrice)} · {i.locationId}
                  {i.accountName ? ` · on ${i.accountName}` : ''}
                  {tab === 'team' ? ` · ${userName(i.assignedUserId)}` : ''}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                  <Chip size="small" color={QUEUE_STATUS_COLOR[i.status]} label={QUEUE_STATUS_LABEL[i.status]} />
                  <Chip size="small" variant="outlined" label={i.status === 'posted' && i.postedAt ? `Posted ${timeAgo(i.postedAt)}` : whenLabel(i.scheduledAt)} />
                  {i.attempts > 0 && isOpenStatus(i.status) && <Chip size="small" variant="outlined" label={`${i.attempts} push${i.attempts > 1 ? 'es' : ''}`} />}
                </Box>
                {i.lastError && i.status !== 'posted' && <Typography variant="caption" color="error">{i.lastError}</Typography>}
              </Box>
              {mine && isOpenStatus(i.status) && (
                <Button variant="contained" startIcon={<PlayArrow />} onClick={() => navigate(`/mp/post/${i.id}`)}>Post now</Button>
              )}
              {(mine || isManager) && (i.status === 'failed' || i.status === 'cancelled') && (
                <Tooltip title="Send to the phone again"><IconButton onClick={() => act(() => retryQueueItem(profile!, i))}><Replay /></IconButton></Tooltip>
              )}
              {isManager && isOpenStatus(i.status) && (
                <Tooltip title="Cancel"><IconButton onClick={() => act(() => cancelQueueItem(profile!, i))}><Cancel /></IconButton></Tooltip>
              )}
              {isManager && !isOpenStatus(i.status) && (
                <Tooltip title="Delete">
                  <IconButton onClick={() => act(async () => {
                    await deleteDoc(doc(db, COLLECTIONS.queue, i.id));
                    await writeAudit(profile, 'queue.delete', i.id, i.cartTitle);
                  })}><Delete /></IconButton>
                </Tooltip>
              )}
            </Paper>
          );
        })}
      </Box>
    </MpShell>
  );
};

export default MpQueue;
