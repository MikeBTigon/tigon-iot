import React, { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, IconButton, MenuItem, Paper, Stack, TextField,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import { BugReport, DeleteOutline, Lightbulb, MoreHoriz, Send } from '@mui/icons-material';
import DashboardLayout from '../components/Layout/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import { useMp } from '../mp/MpDataContext';
import { useT } from '../i18n';
import {
  REQUEST_STATUSES, deleteChangeRequest, isOpenRequest, setRequestStatus, submitChangeRequest, useChangeRequests,
} from '../requests/changeRequests';
import type { ChangeRequest, NewRequest, RequestKind, RequestStatus } from '../requests/changeRequests';

const KIND_ICON: Record<RequestKind, React.ReactElement> = {
  bug: <BugReport fontSize="small" />,
  feature: <Lightbulb fontSize="small" />,
  other: <MoreHoriz fontSize="small" />,
};

const STATUS_COLOR: Record<RequestStatus, 'default' | 'info' | 'warning' | 'success' | 'error'> = {
  new: 'info',
  planned: 'default',
  in_progress: 'warning',
  done: 'success',
  declined: 'error',
};

const EMPTY: NewRequest = { kind: 'bug', title: '', details: '', where: '' };

const fmtDate = (r: ChangeRequest) => (r.createdAt ? r.createdAt.toDate().toLocaleString() : '…');

/** Sidebar → Request a change. Anyone can report a bug or ask for a feature; admins see and manage every request here. */
const Requests: React.FC = () => {
  const t = useT();
  const { currentUser } = useAuth();
  const { profile } = useMp();
  const isAdmin = profile?.role === 'admin';
  const { items, loading, error } = useChangeRequests(currentUser?.uid, isAdmin);
  const [form, setForm] = useState<NewRequest>(EMPTY);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [show, setShow] = useState<'open' | 'all'>('open');

  const shown = useMemo(
    () => (isAdmin && show === 'open' ? items.filter((r) => isOpenRequest(r.status)) : items),
    [items, isAdmin, show],
  );

  const set = <K extends keyof NewRequest>(k: K, v: NewRequest[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !form.title.trim()) return;
    setSending(true);
    setMsg(null);
    try {
      await submitChangeRequest(
        {
          uid: currentUser.uid,
          name: profile?.name || currentUser.displayName || currentUser.email || '',
          email: currentUser.email || '',
        },
        form,
      );
      setForm(EMPTY);
      setMsg({ ok: true, text: t('requests.sent') });
    } catch (err) {
      setMsg({ ok: false, text: `${t('requests.failed')} ${(err as Error).message}` });
    } finally {
      setSending(false);
    }
  };

  const remove = async (r: ChangeRequest) => {
    if (!window.confirm(t('requests.confirmDelete', { title: r.title }))) return;
    await deleteChangeRequest(r.id).catch((err) => setMsg({ ok: false, text: (err as Error).message }));
  };

  return (
    <DashboardLayout>
      <Typography variant="h4" gutterBottom>{t('requests.title')}</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>{t('requests.intro')}</Typography>

      <Paper component="form" onSubmit={submit} sx={{ p: { xs: 2, sm: 3 }, mb: 4, maxWidth: 720 }}>
        <Stack spacing={2}>
          <ToggleButtonGroup
            exclusive
            color="primary"
            value={form.kind}
            onChange={(_e, v: RequestKind | null) => v && set('kind', v)}
            aria-label={t('requests.kind')}
            size="small"
          >
            {(['bug', 'feature', 'other'] as RequestKind[]).map((k) => (
              <ToggleButton key={k} value={k} sx={{ gap: 1, textTransform: 'none' }}>
                {KIND_ICON[k]} {t(`requests.kinds.${k}`)}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <TextField
            label={t('requests.titleLabel')}
            placeholder={t(`requests.titlePlaceholder.${form.kind}`)}
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            inputProps={{ maxLength: 150 }}
            required
            fullWidth
          />
          <TextField
            label={t('requests.detailsLabel')}
            placeholder={t(`requests.detailsPlaceholder.${form.kind}`)}
            value={form.details}
            onChange={(e) => set('details', e.target.value)}
            inputProps={{ maxLength: 5000 }}
            multiline
            minRows={4}
            fullWidth
          />
          <TextField
            label={t('requests.whereLabel')}
            placeholder={t('requests.wherePlaceholder')}
            value={form.where}
            onChange={(e) => set('where', e.target.value)}
            inputProps={{ maxLength: 150 }}
            fullWidth
          />
          {msg && <Alert severity={msg.ok ? 'success' : 'error'} onClose={() => setMsg(null)}>{msg.text}</Alert>}
          <Box>
            <Button
              type="submit"
              variant="contained"
              startIcon={sending ? <CircularProgress size={18} color="inherit" /> : <Send />}
              disabled={sending || !form.title.trim()}
            >
              {t('requests.submit')}
            </Button>
          </Box>
        </Stack>
      </Paper>

      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>
          {isAdmin ? t('requests.allRequests') : t('requests.myRequests')}
        </Typography>
        {isAdmin && (
          <ToggleButtonGroup size="small" exclusive value={show} onChange={(_e, v) => v && setShow(v)}>
            <ToggleButton value="open" sx={{ textTransform: 'none' }}>{t('requests.showOpen')}</ToggleButton>
            <ToggleButton value="all" sx={{ textTransform: 'none' }}>{t('requests.showAll')}</ToggleButton>
          </ToggleButtonGroup>
        )}
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{t('requests.loadFailed')} {error}</Alert>}
      {loading && !error && <CircularProgress size={24} />}
      {!loading && !error && shown.length === 0 && (
        <Typography color="text.secondary">{t('requests.none')}</Typography>
      )}

      <Stack spacing={2}>
        {shown.map((r) => (
          <Card key={r.id} variant="outlined">
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, flexWrap: 'wrap', rowGap: 1 }}>
                <Chip size="small" icon={KIND_ICON[r.kind]} label={t(`requests.kinds.${r.kind}`)} />
                {isAdmin ? (
                  <TextField
                    select
                    size="small"
                    value={r.status}
                    onChange={(e) => setRequestStatus(r.id, e.target.value as RequestStatus)
                      .catch((err) => setMsg({ ok: false, text: (err as Error).message }))}
                    aria-label={t('requests.status')}
                    sx={{ minWidth: 150 }}
                  >
                    {REQUEST_STATUSES.map((s) => <MenuItem key={s} value={s}>{t(`requests.statuses.${s}`)}</MenuItem>)}
                  </TextField>
                ) : (
                  <Chip size="small" color={STATUS_COLOR[r.status]} label={t(`requests.statuses.${r.status}`)} />
                )}
                <Box sx={{ flexGrow: 1 }} />
                {isAdmin && (
                  <Tooltip title={t('requests.delete')}>
                    <IconButton size="small" onClick={() => remove(r)} aria-label={t('requests.delete')}>
                      <DeleteOutline fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </Stack>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{r.title}</Typography>
              {r.details && <Typography sx={{ whiteSpace: 'pre-wrap', mt: 0.5 }}>{r.details}</Typography>}
              {r.where && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {t('requests.whereLabel')}: {r.where}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
                {[isAdmin ? r.createdByName || r.createdByEmail : '', fmtDate(r), r.platform].filter(Boolean).join(' · ')}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </DashboardLayout>
  );
};

export default Requests;
