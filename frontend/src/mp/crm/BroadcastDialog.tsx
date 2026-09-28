import { useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, MenuItem, Paper, TextField, Typography,
} from '@mui/material';
import { CheckCircle, Send } from '@mui/icons-material';
import { useMp } from '../MpDataContext';
import CartPicker, { type CartChoice } from './CartPicker';
import { STOP_LINE, contactUrl, openContact } from './crmData';
import { fillFor, useReplyTemplates } from './replyTemplates';
import type { Customer } from '../growthTypes';
import type { MpCart } from '../types';

type BroadcastChannel = 'sms' | 'whatsapp' | 'email';
const CHANNEL_NAME: Record<BroadcastChannel, string> = { sms: 'Text (SMS)', whatsapp: 'WhatsApp', email: 'Email' };

const optedIn = (c: Customer, ch: BroadcastChannel) =>
  ch === 'sms' ? c.consentSms && !!c.phone : ch === 'whatsapp' ? c.consentWhatsapp && !!c.phone : c.consentEmail && !!c.email;

/**
 * Broadcast: one message to every customer (of the current filter) who opted in to the chosen channel.
 * Messages are sent one tap at a time from the user's own phone/app; a STOP line is always appended.
 */
export default function BroadcastDialog({ open, customers, onClose }: { open: boolean; customers: Customer[]; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      {open && <BroadcastBody customers={customers} onClose={onClose} />}
    </Dialog>
  );
}

function BroadcastBody({ customers, onClose }: { customers: Customer[]; onClose: () => void }) {
  const { profile } = useMp();
  const templates = useReplyTemplates(profile?.uid);
  const [channel, setChannel] = useState<BroadcastChannel>('sms');
  const [key, setKey] = useState('');
  const [body, setBody] = useState<string | null>(null);
  const [cartChoice, setCartChoice] = useState<CartChoice | null>(null);
  const [cart, setCart] = useState<MpCart | null>(null);
  const [link, setLink] = useState('');
  const [sent, setSent] = useState<Set<string>>(new Set());

  const tpl = templates.find((t) => t.key === key) || templates[0];
  const text = body ?? tpl?.body ?? '';
  const recipients = customers.filter((c) => optedIn(c, channel));
  const messageFor = (c: Customer) => `${fillFor(text, { cart, name: c.name, link, locationId: c.locationId })}\n\n${STOP_LINE}`;

  const send = async (c: Customer) => {
    await openContact(contactUrl(channel, { phone: c.phone, email: c.email }, messageFor(c), 'News from TIGON Golf Carts'));
    setSent((s) => new Set(s).add(c.id));
  };

  return (
    <>
      <DialogTitle>Broadcast</DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          Only customers who <b>opted in</b> to {CHANNEL_NAME[channel]} are listed. Every message ends with “{STOP_LINE}” —
          if someone replies STOP, uncheck their opt-in right away.
        </Alert>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, mb: 1.5 }}>
          <TextField select label="Channel" value={channel} onChange={(e) => { setChannel(e.target.value as BroadcastChannel); setSent(new Set()); }}>
            {(Object.keys(CHANNEL_NAME) as BroadcastChannel[]).map((c) => <MenuItem key={c} value={c}>{CHANNEL_NAME[c]}</MenuItem>)}
          </TextField>
          <TextField select label="Template" value={tpl?.key || ''} onChange={(e) => { setKey(e.target.value); setBody(null); }}>
            {templates.map((t) => <MenuItem key={t.key} value={t.key}>{t.title}</MenuItem>)}
          </TextField>
          <CartPicker label="Cart (optional, fills {title} {price}…)" value={cartChoice} onChange={(c, full) => { setCartChoice(c); setCart(full); }} />
          <TextField label="Link (optional)" value={link} onChange={(e) => setLink(e.target.value)} />
        </Box>
        <TextField fullWidth multiline minRows={3} label="Message ({name} = first name)" value={text} onChange={(e) => setBody(e.target.value)} sx={{ mb: 1.5 }} />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>{recipients.length} recipient{recipients.length === 1 ? '' : 's'}</Typography>
          <Typography variant="body2" color="text.secondary">{sent.size} / {recipients.length} sent</Typography>
        </Box>
        <LinearProgress variant="determinate" value={recipients.length ? (sent.size / recipients.length) * 100 : 0} sx={{ mb: 1.5 }} />
        {!recipients.length && <Typography color="text.secondary">No one in this list opted in to {CHANNEL_NAME[channel]}.</Typography>}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 360, overflowY: 'auto' }}>
          {recipients.map((c) => {
            const done = sent.has(c.id);
            return (
              <Paper key={c.id} variant="outlined" sx={{ p: 1, display: 'flex', alignItems: 'center', gap: 1, opacity: done ? 0.6 : 1 }}>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 600 }} noWrap>{c.name || c.phone || c.email}</Typography>
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                    {channel === 'email' ? c.email : c.phone} · {messageFor(c).slice(0, 80)}…
                  </Typography>
                </Box>
                {done && <Chip size="small" color="success" icon={<CheckCircle />} label="Sent" />}
                <Button size="small" variant={done ? 'text' : 'contained'} startIcon={<Send />} onClick={() => send(c)}>
                  {done ? 'Again' : 'Send'}
                </Button>
              </Paper>
            );
          })}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </>
  );
}
