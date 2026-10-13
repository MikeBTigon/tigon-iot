import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import {
  Alert, Badge, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Paper, Tab, Tabs,
  TextField, Tooltip, Typography,
} from '@mui/material';
import { Block, Cancel, CheckCircle, Delete, PlayArrow, Replay } from '@mui/icons-material';
import { Trans } from 'react-i18next';
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
import { useT } from '../../i18n';
import type { TFunction } from 'i18next';

const whenLabel = (ms: number, t: TFunction) => {
  const diff = ms - Date.now();
  if (diff > 60000) return t('queue.scheduled', { when: new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) });
  return t('queue.due', { ago: timeAgo(ms) || t('queue.now') });
};

/** Posting queue: your items (open them to post) and, for managers, the whole team's. */
const MpQueue: React.FC = () => {
  const t = useT();
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
        <Typography variant="h5" sx={{ flexGrow: 1 }}>{t('queue.title')}</Typography>
        {pendingCount > 0 && (
          <Chip
            color="secondary"
            label={isManager ? t('queue.needApproval', { count: pendingCount }) : t('queue.waitingApproval', { count: pendingCount })}
            onClick={() => setStatus('approval')}
          />
        )}
        <Chip color={mineOpen ? 'primary' : 'default'} label={t('queue.waitingForYou', { count: mineOpen })} />
      </Box>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        <Trans i18nKey="queue.intro" components={{ b: <b /> }} />
      </Typography>
      {isManager && (
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1 }}>
          <Tab value="mine" label={t('queue.mine')} />
          <Tab
            value="team"
            label={<Badge color="secondary" badgeContent={pendingCount} sx={{ pr: pendingCount ? 1.5 : 0 }}>{t('queue.team')}</Badge>}
          />
        </Tabs>
      )}
      <ChipFilter
        label={t('queue.status')}
        value={status}
        options={[
          { value: 'open', label: t('queue.waiting') },
          { value: 'approval', label: pendingCount ? t('queue.needsApprovalCount', { count: pendingCount }) : t('queue.needsApproval') },
          { value: 'posted', label: t('queue.posted') },
          { value: 'failed', label: t('queue.failed') },
          { value: 'all', label: t('queue.all') },
        ]}
        onChange={setStatus}
      />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {!rows.length && <Typography color="text.secondary" sx={{ py: 3 }}><Trans i18nKey="queue.empty" components={{ b: <b /> }} /></Typography>}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {rows.map((i) => {
          const mine = i.assignedUserId === profile?.uid;
          return (
            <Paper key={i.id} sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <Box sx={{ flexGrow: 1, minWidth: 200 }}>
                <Typography sx={{ fontWeight: 600 }}>{i.cartTitle}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {formatPrice(i.cartPrice)} · {i.locationId}
                  {i.accountName ? t('queue.on', { account: i.accountName }) : ''}
                  {tab === 'team' || !mine ? ` · ${userName(i.assignedUserId)}` : ''}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                  <Chip size="small" color={QUEUE_STATUS_COLOR[i.status]} label={t(`queue.statuses.${i.status}`, { defaultValue: QUEUE_STATUS_LABEL[i.status] })} />
                  <Chip size="small" variant="outlined" label={i.status === 'posted' && i.postedAt ? t('queue.postedAgo', { ago: timeAgo(i.postedAt) }) : whenLabel(i.scheduledAt, t)} />
                  {i.attempts > 0 && isOpenStatus(i.status) && <Chip size="small" variant="outlined" label={t('queue.pushes', { count: i.attempts })} />}
                </Box>
                {i.lastError && i.status !== 'posted' && <Typography variant="caption" color="error">{i.lastError}</Typography>}
                {i.status === 'cancelled' && i.rejectedReason && (
                  <Typography variant="caption" color="error" sx={{ display: 'block' }}>{t('queue.notApproved', { reason: i.rejectedReason })}</Typography>
                )}
                {i.approvedBy && isOpenStatus(i.status) && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{t('queue.approvedBy', { name: userName(i.approvedBy) })}</Typography>
                )}
              </Box>
              {isManager && i.status === 'pending_approval' && (
                <>
                  <Button variant="contained" color="success" startIcon={<CheckCircle />} onClick={() => act(() => approveQueueItem(profile!, i))}>{t('queue.approve')}</Button>
                  <Button color="error" startIcon={<Block />} onClick={() => { setReason(''); setRejecting(i); }}>{t('queue.reject')}</Button>
                </>
              )}
              {!isManager && mine && i.status === 'pending_approval' && (
                <Tooltip title={t('queue.withdraw')}><IconButton onClick={() => act(() => cancelQueueItem(profile!, i))}><Cancel /></IconButton></Tooltip>
              )}
              {mine && isPostableStatus(i.status) && (
                <Button variant="contained" startIcon={<PlayArrow />} onClick={() => navigate(`/mp/post/${i.id}`)}>{t('queue.postNow')}</Button>
              )}
              {(mine || isManager) && (i.status === 'failed' || i.status === 'cancelled') && (
                <Tooltip title={t('queue.resend')}><IconButton onClick={() => act(() => retryQueueItem(profile!, i))}><Replay /></IconButton></Tooltip>
              )}
              {isManager && isOpenStatus(i.status) && (
                <Tooltip title={t('queue.cancel')}><IconButton onClick={() => act(() => cancelQueueItem(profile!, i))}><Cancel /></IconButton></Tooltip>
              )}
              {isManager && !isOpenStatus(i.status) && (
                <Tooltip title={t('queue.delete')}>
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
        <DialogTitle>{t('queue.rejectTitle', { title: rejecting?.cartTitle || '' })}</DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <TextField
            fullWidth multiline minRows={2} autoFocus
            label={t('queue.reason')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejecting(null)}>{t('queue.back')}</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              const item = rejecting;
              setRejecting(null);
              if (item) act(() => rejectQueueItem(profile!, item, reason));
            }}
          >
            {t('queue.reject')}
          </Button>
        </DialogActions>
      </Dialog>
    </MpShell>
  );
};

export default MpQueue;
