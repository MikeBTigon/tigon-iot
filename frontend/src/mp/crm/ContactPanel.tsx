import { useState } from 'react';
import { Box, Button, MenuItem, TextField, Typography } from '@mui/material';
import { ContentCopy, Email, Phone, Sms, WhatsApp } from '@mui/icons-material';
import { useMp } from '../MpDataContext';
import { copyText } from '../../native/actions';
import { contactUrl, openContact, useMpSettings, type ContactKind } from './crmData';
import { fillFor, useReplyTemplates } from './replyTemplates';
import type { Cart } from '../types';

const BUTTONS: Array<{ kind: ContactKind; label: string; icon: React.ReactNode; needs: 'phone' | 'email' }> = [
  { kind: 'call', label: 'Call', icon: <Phone />, needs: 'phone' },
  { kind: 'sms', label: 'Text', icon: <Sms />, needs: 'phone' },
  { kind: 'whatsapp', label: 'WhatsApp', icon: <WhatsApp />, needs: 'phone' },
  { kind: 'email', label: 'Email', icon: <Email />, needs: 'email' },
];

/**
 * Reply template picker + editable message + Call / Text / WhatsApp / Email buttons.
 * `onContact` fires after a link is opened (to record lastContactAt).
 */
export default function ContactPanel({ name, phone, email, cart, onContact }: {
  name: string;
  phone: string;
  email: string;
  cart: Cart | null;
  onContact?: (kind: ContactKind) => void;
}) {
  const { profile } = useMp();
  const settings = useMpSettings(!!profile);
  const templates = useReplyTemplates(profile?.uid);
  const [key, setKey] = useState('');
  const [link, setLink] = useState('');
  const [edited, setEdited] = useState<string | null>(null);
  const tpl = templates.find((t) => t.key === key) || templates[0];
  const fill = (l: string) => (tpl ? fillFor(tpl.body, { cart, name, phone: cart ? undefined : settings.defaultPhone, link: l }) : '');
  const message = edited ?? fill(link);

  const go = async (kind: ContactKind) => {
    await openContact(contactUrl(kind, { phone, email }, message));
    onContact?.(kind);
  };

  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>Reply</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1, mb: 1 }}>
        <TextField select size="small" label="Template" value={tpl?.key || ''} onChange={(e) => { setKey(e.target.value); setEdited(null); }}>
          {templates.map((t) => <MenuItem key={t.key} value={t.key}>{t.title}</MenuItem>)}
        </TextField>
        <TextField size="small" label="Link (optional)" placeholder="Paste a tracked link" value={link}
          onChange={(e) => { setLink(e.target.value); setEdited(null); }} />
      </Box>
      <TextField fullWidth multiline minRows={3} size="small" value={message} onChange={(e) => setEdited(e.target.value)} sx={{ mb: 1 }} />
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {BUTTONS.map((b) => (
          <Button key={b.kind} size="small" variant="outlined" startIcon={b.icon}
            disabled={b.needs === 'phone' ? !phone.trim() : !email.trim()} onClick={() => go(b.kind)}>
            {b.label}
          </Button>
        ))}
        <Button size="small" startIcon={<ContentCopy />} onClick={() => copyText(message)}>Copy</Button>
      </Box>
    </Box>
  );
}
