// Insights — customer timeline: everything about one phone number, newest first.
// Reusable: <CustomerTimeline phone="+12155550123" /> (the lead dialog can embed it with `compact`).
import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Link, Stack, Typography,
} from '@mui/material';
import {
  AccountBalance, AutoAwesome, CalendarMonth, CallReceived, Chat, CheckCircle, Language, PersonAdd, Phone, Refresh, RequestQuote,
  Send, SwapHoriz, Visibility, Description,
} from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import { useMp } from '../MpDataContext';
import { isManager } from '../crm/crmData';
import { storeName } from '../sales/closing/closingUtils';
import { displayPhone, toE164 } from './phone';
import { useTimeline, type TimelineKind } from './timelineData';
import { aiSummary, useAiEnabled } from './insightsApi';

const ICON: Record<TimelineKind, React.ReactElement> = {
  lead: <PersonAdd fontSize="small" />,
  sold: <CheckCircle fontSize="small" color="success" />,
  text_out: <Send fontSize="small" color="primary" />,
  text_in: <CallReceived fontSize="small" color="secondary" />,
  quote: <RequestQuote fontSize="small" />,
  quote_open: <Visibility fontSize="small" />,
  appointment: <CalendarMonth fontSize="small" />,
  trade: <SwapHoriz fontSize="small" />,
  prequal: <AccountBalance fontSize="small" />,
  credit: <Description fontSize="small" />,
  web: <Language fontSize="small" />,
};

const when = (ts: number) => {
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString([], { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }), hour: 'numeric', minute: '2-digit' });
};

const CONSENT: Record<string, { label: string; color: 'error' | 'success' | 'default' }> = {
  opted_out: { label: 'Opted out of texts (replied STOP)', color: 'error' },
  yes: { label: 'OK to text', color: 'success' },
  unknown: { label: 'No text consent on file', color: 'default' },
};

export interface CustomerTimelineProps {
  /** Any US phone format. */
  phone: string;
  /** Smaller header, for embedding in a dialog. */
  compact?: boolean;
}

const CustomerTimeline: React.FC<CustomerTimelineProps> = ({ phone, compact }) => {
  const { currentUser } = useAuth();
  const { profile, userName } = useMp();
  const ai = useAiEnabled();
  const me = currentUser && profile ? { uid: currentUser.uid, manager: isManager(profile) } : null;
  const t = useTimeline(phone, me, userName);
  const [summary, setSummary] = useState<{ phone: string; bullets: string[] } | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [aiError, setAiError] = useState('');
  const e164 = toE164(phone);

  const summarize = async () => {
    setSummarizing(true);
    setAiError('');
    try {
      setSummary({ phone, bullets: await aiSummary(t.customerText) });
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setSummarizing(false);
    }
  };

  if (!e164) return <Alert severity="warning">That is not a 10-digit US phone number.</Alert>;
  const h = t.header;
  const shownSummary = summary && summary.phone === phone ? summary.bullets : null;

  return (
    <Box>
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent sx={{ '&:last-child': { pb: 2 } }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <Box sx={{ flex: 1, minWidth: 200 }}>
              <Typography variant={compact ? 'subtitle1' : 'h6'} sx={{ fontWeight: 700 }}>{h.name || 'Unknown name'}</Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <Button size="small" startIcon={<Phone />} href={`tel:${e164}`} sx={{ px: 0.5 }}>{displayPhone(e164)}</Button>
                {h.email && <Link href={`mailto:${h.email}`} variant="body2">{h.email}</Link>}
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {[h.storeId ? storeName(h.storeId) : '', h.ownerUid ? `Lead owner: ${userName(h.ownerUid)}` : ''].filter(Boolean).join(' · ') || 'No store or owner yet'}
              </Typography>
            </Box>
            <Stack spacing={0.75} sx={{ alignItems: 'flex-end' }}>
              <Chip size="small" color={CONSENT[h.consent].color} label={CONSENT[h.consent].label} />
              <Stack direction="row" spacing={0.5}>
                <Button size="small" startIcon={<Chat />} component={RouterLink} to={`/mp/inbox?phone=${encodeURIComponent(e164)}`}>Texts</Button>
                <Button size="small" startIcon={<Refresh />} onClick={t.reload} aria-label="Refresh">Refresh</Button>
              </Stack>
            </Stack>
          </Box>
          {ai && t.customerText.length >= 20 && (
            <Box sx={{ mt: 1 }}>
              <Button size="small" variant="outlined" startIcon={summarizing ? <CircularProgress size={14} /> : <AutoAwesome />} disabled={summarizing} onClick={summarize}>
                Summarize
              </Button>
              {aiError && <Alert severity="error" sx={{ mt: 1 }}>{aiError}</Alert>}
              {shownSummary && (
                <Alert severity="info" icon={<AutoAwesome />} sx={{ mt: 1 }}>
                  {shownSummary.map((b) => <div key={b}>• {b}</div>)}
                </Alert>
              )}
            </Box>
          )}
        </CardContent>
      </Card>

      {!t.loaded && <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress aria-label="Loading" /></Box>}
      {t.loaded && t.failed > 0 && (
        <Alert severity="info" sx={{ mb: 1 }}>Some history could not be loaded (you may not have access to all of it).</Alert>
      )}
      {t.loaded && !t.items.length && <Alert severity="info">Nothing on file for this number yet.</Alert>}
      <Stack spacing={0} component="ol" sx={{ listStyle: 'none', p: 0, m: 0 }}>
        {t.items.map((it) => {
          const external = it.link?.startsWith('/q/');
          return (
            <Box component="li" key={it.key} sx={{ display: 'flex', gap: 1.25, py: 1, borderBottom: 1, borderColor: 'divider' }}>
              <Box sx={{ pt: 0.25, color: 'text.secondary' }}>{ICON[it.kind]}</Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <Typography sx={{ fontWeight: 600, flex: 1, minWidth: 160 }}>
                    {it.link ? (
                      external
                        ? <Link href={it.link} target="_blank" rel="noopener" underline="hover" color="inherit">{it.title}</Link>
                        : <Link component={RouterLink} to={it.link} underline="hover" color="inherit">{it.title}</Link>
                    ) : it.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">{when(it.at)}</Typography>
                </Box>
                {it.detail && <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{it.detail}</Typography>}
              </Box>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
};

export default CustomerTimeline;
