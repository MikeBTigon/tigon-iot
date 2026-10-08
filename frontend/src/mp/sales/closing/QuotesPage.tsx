// Track 3 — /mp/quotes: quotes I texted (managers: everyone's) and whether the customer opened them or is interested.
import React, { useMemo, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { ContentCopy, OpenInNew, RequestQuote } from '@mui/icons-material';
import MpShell from '../../components/MpShell';
import { useMp } from '../../MpDataContext';
import { isManager, useNow } from '../../crm/crmData';
import { copyText } from '../../../native/actions';
import { notify } from '../../../ui/notify';
import { SALES_COLLECTIONS } from '../salesTypes';
import type { Quote } from '../salesTypes';
import { quoteUrl } from '../salesData';
import { money0, storeName, useRecent, useWhere } from './closingUtils';

type Q = Quote & { tradeIn?: number; preferredTime?: string };
const when = (ts?: number) => (ts ? new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

const QuotesPage: React.FC = () => {
  const { profile, userName } = useMp();
  const manager = isManager(profile);
  const now = useNow();
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [filter, setFilter] = useState<'all' | 'opened' | 'interested' | 'unopened'>('all');
  const mine = useWhere<Q>(SALES_COLLECTIONS.quotes, 'salespersonUid', profile?.uid);
  const everyone = useRecent<Q>(SALES_COLLECTIONS.quotes, 'createdAt', 500, manager && scope === 'all');
  const source = manager && scope === 'all' ? everyone : mine;
  const rows = useMemo(() => [...source.rows].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).filter((q) => (
    filter === 'all' ? true : filter === 'interested' ? !!q.interestedAt : filter === 'opened' ? !!q.openedAt : !q.openedAt
  )), [source.rows, filter]);
  const counts = {
    sent: source.rows.length, opened: source.rows.filter((q) => q.openedAt).length, interested: source.rows.filter((q) => q.interestedAt).length,
  };

  return (
    <MpShell>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
        <RequestQuote color="primary" />
        <Typography variant="h5" color="primary" sx={{ fontWeight: 700, flexGrow: 1 }}>Quotes</Typography>
        {manager && (
          <ToggleButtonGroup size="small" exclusive value={scope} onChange={(_e, v) => v && setScope(v)}>
            <ToggleButton value="mine">Mine</ToggleButton>
            <ToggleButton value="all">Everyone</ToggleButton>
          </ToggleButtonGroup>
        )}
      </Box>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Send a quote from the Financing calculator ("Send quote"). You get a notification the moment the customer opens it.
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        {([['all', `All ${counts.sent}`], ['unopened', `Not opened ${counts.sent - counts.opened}`], ['opened', `Opened ${counts.opened}`], ['interested', `Interested ${counts.interested}`]] as const).map(([k, l]) => (
          <Chip key={k} label={l} color={filter === k ? 'primary' : 'default'} variant={filter === k ? 'filled' : 'outlined'} onClick={() => setFilter(k)} />
        ))}
      </Box>
      {source.error && <Alert severity="error" sx={{ mb: 2 }}>{source.error}</Alert>}
      {!rows.length && <Alert severity="info">No quotes here yet.</Alert>}
      <Stack spacing={1.5}>
        {rows.map((q) => {
          const expired = q.expiresAt && q.expiresAt < now;
          return (
            <Card key={q.id} variant="outlined">
              <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <Box sx={{ flex: 1, minWidth: 220 }}>
                    <Typography sx={{ fontWeight: 700 }}>{q.customerName || q.customerPhone || 'Customer'}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {q.cartTitle || q.brand} · {money0(q.otd)} out the door{q.rows?.[0] ? ` · from ${money0(Math.min(...q.rows.map((r) => r.payment)))}/mo` : ''}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Sent {when(q.createdAt)}{manager && scope === 'all' ? ` by ${q.salespersonName || userName(q.salespersonUid)}` : ''} · {storeName(q.storeId)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
                    {q.interestedAt ? <Chip color="success" label={`Interested ${when(q.interestedAt)}`} />
                      : q.openedAt ? <Chip color="info" label={`Opened ${q.openCount && q.openCount > 1 ? `${q.openCount}× · ` : ''}${when(q.openedAt)}`} />
                        : <Chip label="Not opened yet" />}
                    {expired && <Chip variant="outlined" label="Expired" />}
                  </Box>
                </Box>
                {q.preferredTime && <Typography variant="body2" sx={{ mt: 1 }}>Best time to call: <b>{q.preferredTime}</b></Typography>}
                <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                  <Button size="small" startIcon={<OpenInNew />} href={`/q/${q.code || q.id}?preview=1`} target="_blank">View</Button>
                  <Button size="small" startIcon={<ContentCopy />} onClick={() => copyText(quoteUrl(q.code || q.id)).then(() => notify('Link copied', 'success')).catch(() => undefined)}>Copy link</Button>
                  {q.customerPhone && <Button size="small" href={`tel:${q.customerPhone}`}>Call</Button>}
                </Box>
              </CardContent>
            </Card>
          );
        })}
      </Stack>
    </MpShell>
  );
};

export default QuotesPage;
