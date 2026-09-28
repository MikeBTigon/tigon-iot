import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import {
  Alert, Badge, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Paper, Tab, Tabs,
  TextField, Tooltip, Typography,
} from '@mui/material';
import { Block, Cancel, CheckCircle, Delete, PlayArrow, Replay } from '@mui/icons-material';
import { db } from '../../config/firebase';
import MpShell from '../components/MpShell';
import AlertsPanel from '../components/AlertsPanel';
import ChipFilter from '../components/ChipFilter';
import { useMp } from '../MpDataContext';
import { formatPrice, timeAgo } from '../cartUtils';
import { COLLECTIONS } from '../constants';
import {
  approveQueueItem, cancelQueueItem, isOpenStatus, isPostableStatus, QUEUE_STATUS_COLOR, QUEUE_STATUS_LABEL,
  rejectQueueItem, retryQueueItem,
} from '../queue';
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
  const [status, setStatus] = useState<'open' | 'approval' | 'posted' | 'failed' | 'all'>('open');
  const [rejecting, setRejecting] = useState<QueueItem | null>(null);
  const [reason, setReason] = useState('');

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
        // "Needs approval": managers always see the whole team's requests.
        .filter((i) => tab === 'team' || i.assignedUserId === profile?.uid || (status === 'approval' && isManager))
        .filter((i) =>
          status === 'all' ? true
            : status === 'open' ? isOpenStatus(i.status)
              : status === 'approval' ? i.status === 'pending_approval'
                : i.status === status,
        )
        .sort((a, b) => (isOpenStatus(a.status) && isOpenStatus(b.status) ? a.scheduledAt - b.scheduledAt : b.updatedAt - a.updatedAt)),
    [items, tab, status, profile?.uid, isManager],
  );

  const mineOpen = items.filter((i) => i.assignedUserId === profile?.uid && isPostableStatus(i.status)).length;
  // Managers: every request waiting for them; members: their own requests.
  const pendingCount = items.filter(
    (i) => i.status === 'pending_approval' && (isManager || i.assignedUserId === profile?.uid),
  ).length;

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
        {pendingCount > 0 && (
          <Chip
            color="secondary"
            label={isManager ? `${pendingCount} need approval` : `${pendingCount} waiting for approval`}
            onClick={() => setStatus('approval')}
          />
        )}
        <Chip color={mineOpen ? 'primary' : 'default'} label={`${mineOpen} waiting for you`} />
      </Box>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Carts sent to a phone with <b>Auto Post</b>. Open one to prepare it — photos, listing and Marketplace in 3 taps.
      </Typography>
      {isManager && (
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1 }}>
          <Tab value="mine" label="Mine" />
          <Tab
            value="team"
            label={<Badge color="secondary" badgeContent={pendingCount} sx={{ pr: pendingCount ? 1.5 : 0 }}>Team</Badge>}
          />
        </Tabs>
      )}
      <ChipFilter
        label="Status"
        value={status}
        options={[
          { value: 'open', label: 'Waiting' },
          { value: 'approval', label: pendingCount ? `Needs approval (${pendingCount})` : 'Needs approval' },
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
                  {tab === 'team' || !mine ? ` · ${userName(i.assignedUserId)}` : ''}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                  <Chip size="small" color={QUEUE_STATUS_COLOR[i.status]} label={QUEUE_STATUS_LABEL[i.status]} />
                  <Chip size="small" variant="outlined" label={i.status === 'posted' && i.postedAt ? `Posted ${timeAgo(i.postedAt)}` : whenLabel(i.scheduledAt)} />
                  {i.attempts > 0 && isOpenStatus(i.status) && <Chip size="small" variant="outlined" label={`${i.attempts} push${i.attempts > 1 ? 'es' : ''}`} />}
                </Box>
                {i.lastError && i.status !== 'posted' && <Typography variant="caption" color="error">{i.lastError}</Typography>}
                {i.status === 'cancelled' && i.rejectedReason && (
                  <Typography variant="caption" color="error" sx={{ display: 'block' }}>Not approved: {i.rejectedReason}</Typography>
                )}
                {i.approvedBy && isOpenStatus(i.status) && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Approved by {userName(i.approvedBy)}</Typography>
                )}
              </Box>
              {isManager && i.status === 'pending_approval' && (
                <>
                  <Button variant="contained" color="success" startIcon={<CheckCircle />} onClick={() => act(() => approveQueueItem(profile!, i))}>Approve</Button>
                  <Button color="error" startIcon={<Block />} onClick={() => { setReason(''); setRejecting(i); }}>Reject</Button>
                </>
              )}
              {!isManager && mine && i.status === 'pending_approval' && (
                <Tooltip title="Withdraw request"><IconButton onClick={() => act(() => cancelQueueItem(profile!, i))}><Cancel /></IconButton></Tooltip>
              )}
              {mine && isPostableStatus(i.status) && (
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
      <Dialog open={!!rejecting} onClose={() => setRejecting(null)} fullWidth maxWidth="xs">
        <DialogTitle>Reject · {rejecting?.cartTitle}</DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <TextField
            fullWidth multiline minRows={2} autoFocus
            label="Reason (shown to the person)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejecting(null)}>Back</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              const item = rejecting;
              setRejecting(null);
              if (item) act(() => rejectQueueItem(profile!, item, reason));
            }}
          >
            Reject
          </Button>
        </DialogActions>
      </Dialog>
    </MpShell>
  );
};

export default MpQueue;
