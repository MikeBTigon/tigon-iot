// Track 3 — /mp/trade-ins: trade-ins customers sent online (with photos); set the appraised value after the inspection.
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Chip, InputAdornment, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { Calculate, DirectionsCar } from '@mui/icons-material';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import MpShell from '../../components/MpShell';
import { useMp } from '../../MpDataContext';
import { updateLead } from '../../crm/crmData';
import { notify } from '../../../ui/notify';
import { SALES_COLLECTIONS } from '../salesTypes';
import type { TradeIn } from '../salesTypes';
import { tradeUrl } from '../salesData';
import { TRADE_CONDITIONS, TRADE_STATUS_LABEL, money0, storeName, useRecent } from './closingUtils';

type T = TradeIn & { ownerUid?: string; updatedAt?: number };
const STATUSES: Array<TradeIn['status']> = ['new', 'appraised', 'accepted', 'declined'];
const CONDITION_LABEL: Record<string, string> = Object.fromEntries(TRADE_CONDITIONS.map((c) => [c.id, c.label]));

const TradeCard: React.FC<{ t: T }> = ({ t }) => {
  const navigate = useNavigate();
  const { userName } = useMp();
  const [value, setValue] = useState(t.appraisedValue ? String(t.appraisedValue) : '');
  const [status, setStatus] = useState<TradeIn['status']>(t.status);
  const [busy, setBusy] = useState(false);
  const dirty = value !== (t.appraisedValue ? String(t.appraisedValue) : '') || status !== t.status;

  const save = async () => {
    setBusy(true);
    try {
      const appraised = Math.round(Number(value.replace(/[$,\s]/g, ''))) || 0;
      const next = appraised && status === 'new' ? 'appraised' : status;
      await updateDoc(doc(db, SALES_COLLECTIONS.tradeIns, t.id), { appraisedValue: appraised || null, status: next, updatedAt: Date.now() });
      setStatus(next);
      if (t.leadId) {
        const mid = Math.round((t.estimateLow + t.estimateHigh) / 2 / 50) * 50;
        await updateLead(t.leadId, { tradeValue: next === 'declined' ? 0 : appraised || mid, hasTrade: next !== 'declined' })
          .catch(() => notify('Saved. The lead belongs to someone else, so only they or a manager can update it.', 'info'));
      }
      notify('Saved', 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card variant="outlined">
      <CardContent sx={{ '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <Box sx={{ flex: 1, minWidth: 220 }}>
            <Typography sx={{ fontWeight: 700 }}>{[t.year, t.brand, t.model].filter(Boolean).join(' ')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {CONDITION_LABEL[t.condition] || t.condition} · {t.electric ? `electric${t.batteryYear ? `, batteries ${t.batteryYear}` : ''}` : 'gas'}{t.lifted ? ' · lifted' : ''}
            </Typography>
            <Typography variant="body2">
              Estimate {money0(t.estimateLow)} – {money0(t.estimateHigh)}{t.appraisedValue ? <> · <b>appraised {money0(t.appraisedValue)}</b></> : ''}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>{t.name} · <a href={`tel:${t.phone}`}>{t.phone}</a>{t.email ? ` · ${t.email}` : ''}</Typography>
            <Typography variant="caption" color="text.secondary">
              {new Date(t.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              {t.storeId ? ` · ${storeName(t.storeId)}` : ''}{t.ownerUid ? ` · ${userName(t.ownerUid)}` : ''}
            </Typography>
            {t.notes && <Typography variant="body2" sx={{ mt: 0.5, fontStyle: 'italic' }}>"{t.notes}"</Typography>}
          </Box>
          <Chip label={TRADE_STATUS_LABEL[t.status] || t.status} color={t.status === 'accepted' ? 'success' : t.status === 'declined' ? 'default' : t.status === 'appraised' ? 'info' : 'primary'} />
        </Box>
        {t.photos?.length > 0 && (
          <Box sx={{ display: 'flex', gap: 1, mt: 1.5, overflowX: 'auto', pb: 0.5 }}>
            {t.photos.map((u, i) => (
              <Box key={i} component="a" href={u} target="_blank" rel="noopener noreferrer" sx={{ flex: '0 0 auto' }}>
                <Box component="img" src={u} alt={`Photo ${i + 1}`} loading="lazy" sx={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 1, display: 'block' }} />
              </Box>
            ))}
          </Box>
        )}
        <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField size="small" label="Appraised value" value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" sx={{ width: 170 }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start">$</InputAdornment> } }} />
          <TextField select size="small" label="Status" value={status} onChange={(e) => setStatus(e.target.value as TradeIn['status'])} sx={{ width: 150 }}>
            {STATUSES.map((s) => <MenuItem key={s} value={s}>{TRADE_STATUS_LABEL[s]}</MenuItem>)}
          </TextField>
          <Button size="small" variant="contained" disabled={!dirty || busy} onClick={save}>Save</Button>
          {t.leadId && <Button size="small" startIcon={<Calculate />} onClick={() => navigate(`/mp/finance?lead=${encodeURIComponent(t.leadId || '')}`)}>Open calculator</Button>}
        </Box>
      </CardContent>
    </Card>
  );
};

const TradeInsPage: React.FC = () => {
  const { profile } = useMp();
  const { rows, error, loaded } = useRecent<T>(SALES_COLLECTIONS.tradeIns, 'createdAt', 300);
  const [scope, setScope] = useState<'store' | 'all'>(profile?.location ? 'store' : 'all');
  const [status, setStatus] = useState<TradeIn['status'] | 'any'>('any');
  const shown = useMemo(() => rows.filter((t) => scope === 'all' || !profile?.location || t.storeId === profile.location || t.ownerUid === profile.uid)
    .filter((t) => status === 'any' || t.status === status), [rows, scope, status, profile]);

  return (
    <MpShell>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
        <DirectionsCar color="primary" />
        <Typography variant="h5" color="primary" sx={{ fontWeight: 700, flexGrow: 1 }}>Trade-ins</Typography>
        {profile?.location && (
          <ToggleButtonGroup size="small" exclusive value={scope} onChange={(_e, v) => v && setScope(v)}>
            <ToggleButton value="store">My store</ToggleButton>
            <ToggleButton value="all">All stores</ToggleButton>
          </ToggleButtonGroup>
        )}
      </Box>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Customers get an instant estimate at <b>{tradeUrl(profile?.location).replace('https://', '')}</b>. After you look at the cart, enter the real value — it goes on the lead and into the calculator.
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        {(['any', ...STATUSES] as const).map((s) => (
          <Chip key={s} label={s === 'any' ? 'All' : TRADE_STATUS_LABEL[s]} color={status === s ? 'primary' : 'default'} variant={status === s ? 'filled' : 'outlined'} onClick={() => setStatus(s)} />
        ))}
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loaded && !shown.length && <Alert severity="info">No trade-ins here yet.</Alert>}
      <Stack spacing={1.5}>{shown.map((t) => <TradeCard key={`${t.id}_${t.updatedAt || 0}`} t={t} />)}</Stack>
    </MpShell>
  );
};

export default TradeInsPage;
