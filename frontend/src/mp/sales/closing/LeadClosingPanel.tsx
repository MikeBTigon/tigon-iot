// Track 3 — inside the lead dialog: quote / appointment / trade-in / pre-qual status, and one-tap links to text the customer.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Chip, Paper, Typography } from '@mui/material';
import { AccountBalance, Calculate, DirectionsCar, Event, RequestQuote } from '@mui/icons-material';
import { useMp } from '../../MpDataContext';
import { brandFromMake } from '../../finance/financeCalc';
import { cartTitle as titleOfCart } from '../../cartLogic';
import type { Lead } from '../../growthTypes';
import type { Appointment, LeadSalesFields, Prequal, Quote, SmsKind, TradeIn } from '../salesTypes';
import { SALES_COLLECTIONS } from '../salesTypes';
import { bookUrl, prequalUrl, tradeUrl } from '../salesData';
import {
  APPT_STATUS_COLOR, APPT_STATUS_LABEL, KIND_LABEL, PREQUAL_STATUS_COLOR, PREQUAL_STATUS_LABEL, TEXTS, money0, nyWhen, useLiveDoc,
} from './closingUtils';
import TextLinkDialog from './TextLinkDialog';

type L = Lead & LeadSalesFields;
const ago = (ts?: number) => (ts ? new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

const Line: React.FC<{ icon: React.ReactNode; label: string; children: React.ReactNode }> = ({ icon, label, children }) => (
  <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', py: 0.5 }}>
    <Box sx={{ color: 'primary.main', mt: 0.25 }}>{icon}</Box>
    <Box sx={{ minWidth: 0, flex: 1 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>{children}</Box>
    </Box>
  </Box>
);

const LeadClosingPanel: React.FC<{ lead: L }> = ({ lead }) => {
  const navigate = useNavigate();
  const { carts } = useMp();
  const quote = useLiveDoc<Quote>(SALES_COLLECTIONS.quotes, lead.quoteCode);
  const appt = useLiveDoc<Appointment>(SALES_COLLECTIONS.appointments, lead.appointmentId);
  const trade = useLiveDoc<TradeIn>(SALES_COLLECTIONS.tradeIns, lead.tradeInId);
  const prequal = useLiveDoc<Prequal>(SALES_COLLECTIONS.prequal, lead.prequalId);
  const [dialog, setDialog] = useState<null | { title: string; template: string; link: string; kind: SmsKind }>(null);
  const store = lead.locationId;

  const openCalc = () => {
    const cart = lead.cartId ? carts.find((c) => c.docId === lead.cartId) : undefined;
    const q = new URLSearchParams({ lead: lead.id });
    if (lead.cartId) q.set('cartId', lead.cartId);
    if (cart) {
      q.set('price', String(cart.price || ''));
      q.set('brand', brandFromMake(cart.make, cart.isUsed));
      q.set('condition', cart.isUsed ? 'used' : 'new');
      q.set('title', titleOfCart(cart));
    }
    navigate(`/mp/finance?${q.toString()}`);
  };

  const quoteState = quote?.interestedAt ? { label: 'Interested!', color: 'success' as const }
    : quote?.openedAt ? { label: `Opened ${quote.openCount && quote.openCount > 1 ? `${quote.openCount}×` : ''}`.trim(), color: 'info' as const }
      : { label: 'Sent, not opened yet', color: 'default' as const };

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Closing</Typography>
      {lead.quoteCode && (
        <Line icon={<RequestQuote fontSize="small" />} label={`Quote${lead.quoteSentAt ? ` · sent ${ago(lead.quoteSentAt)}` : ''}`}>
          <Chip size="small" color={quoteState.color} label={quoteState.label} />
          {quote && <Typography variant="body2">{money0(quote.otd)} out the door</Typography>}
          <Button size="small" href={`/q/${lead.quoteCode}?preview=1`} target="_blank">View</Button>
        </Line>
      )}
      {lead.appointmentId && (
        <Line icon={<Event fontSize="small" />} label="Appointment">
          {appt ? <>
            <Typography variant="body2">{KIND_LABEL[appt.kind] || 'Visit'} · {nyWhen(appt.startAt)}</Typography>
            <Chip size="small" color={APPT_STATUS_COLOR[appt.status]} label={APPT_STATUS_LABEL[appt.status]} />
          </> : <Typography variant="body2">{lead.appointmentAt ? nyWhen(lead.appointmentAt) : '—'}</Typography>}
          <Button size="small" onClick={() => navigate('/mp/appointments')}>Open</Button>
        </Line>
      )}
      {(lead.tradeInId || lead.hasTrade) && (
        <Line icon={<DirectionsCar fontSize="small" />} label="Trade-in">
          {trade ? <Typography variant="body2">
            {[trade.year, trade.brand, trade.model].filter(Boolean).join(' ')} · {trade.appraisedValue ? <b>appraised {money0(trade.appraisedValue)}</b> : `estimate ${money0(trade.estimateLow)} – ${money0(trade.estimateHigh)}`}
          </Typography> : <Typography variant="body2">{lead.tradeValue ? money0(lead.tradeValue) : 'Has a trade'}</Typography>}
          {lead.tradeInId && <Button size="small" onClick={() => navigate('/mp/trade-ins')}>Open</Button>}
        </Line>
      )}
      {(lead.prequalId || lead.prequalStatus) && (
        <Line icon={<AccountBalance fontSize="small" />} label="Pre-qualification">
          {lead.prequalStatus && <Chip size="small" color={PREQUAL_STATUS_COLOR[lead.prequalStatus]} label={PREQUAL_STATUS_LABEL[lead.prequalStatus]} />}
          {lead.creditTier && <Chip size="small" variant="outlined" label={`Tier ${lead.creditTier}`} />}
          {prequal?.approvedAmount ? <Typography variant="body2">approved {money0(prequal.approvedAmount)}</Typography> : null}
          <Button size="small" onClick={() => navigate('/mp/prequal')}>Open</Button>
        </Line>
      )}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
        <Button size="small" variant="contained" startIcon={<Calculate />} onClick={openCalc}>Open calculator for this lead</Button>
        <Button size="small" variant="outlined" onClick={() => setDialog({ title: 'Text a booking link', template: TEXTS.booking, link: bookUrl(store, lead.id), kind: 'appointment' })}>Text booking link</Button>
        <Button size="small" variant="outlined" onClick={() => setDialog({ title: 'Text a trade-in link', template: TEXTS.trade, link: tradeUrl(store, lead.id), kind: 'trade_in' })}>Text trade-in link</Button>
        <Button size="small" variant="outlined" onClick={() => setDialog({ title: 'Text a pre-qualification link', template: TEXTS.prequal, link: prequalUrl(store, lead.id), kind: 'prequal' })}>Text pre-qual link</Button>
      </Box>
      {dialog && (
        <TextLinkDialog open onClose={() => setDialog(null)} {...dialog} name={lead.name} phone={lead.phone} leadId={lead.id} storeId={store} cartTitle={lead.cartTitle} />
      )}
    </Paper>
  );
};

export default LeadClosingPanel;
