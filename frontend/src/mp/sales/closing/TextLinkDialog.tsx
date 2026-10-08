// Track 3 — small dialog: text a customer a link (booking, trade-in, pre-qualification) with an editable message.
import React, { useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from '@mui/material';
import { Send } from '@mui/icons-material';
import { useMp } from '../../MpDataContext';
import { notify } from '../../../ui/notify';
import { fill, leadTemplateData, sendText } from '../salesData';
import type { SmsKind } from '../salesTypes';

export interface TextLinkProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Template with {first} {store} {salesperson} {cart} {link}. */
  template: string;
  link: string;
  kind: SmsKind;
  name?: string;
  phone?: string;
  leadId?: string;
  storeId?: string;
  cartTitle?: string;
  onSent?: () => void;
}

const TextLinkDialog: React.FC<TextLinkProps> = (props) => (
  <Dialog open={props.open} onClose={props.onClose} fullWidth maxWidth="xs">
    {props.open && <Body {...props} />}
  </Dialog>
);

const Body: React.FC<TextLinkProps> = ({ onClose, title, template, link, kind, name: name0, phone: phone0, leadId, storeId, cartTitle, onSent }) => {
  const { profile } = useMp();
  const [name, setName] = useState(name0 || '');
  const [phone, setPhone] = useState(phone0 || '');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const store = storeId || profile?.location || '';
  const body = message ?? fill(template, leadTemplateData({ name, cartTitle, locationId: store }, profile?.name || '', { link }));

  const send = async () => {
    if (!profile) return;
    setError('');
    setBusy(true);
    try {
      await sendText({ to: phone, body, createdBy: profile.uid, storeId: store, leadId, kind });
      notify('Text queued — it goes out in about a minute.', 'success');
      onSent?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {!name0 && <TextField size="small" label="Customer name" value={name} onChange={(e) => setName(e.target.value)} slotProps={{ htmlInput: { maxLength: 80 } }} />}
          <TextField size="small" label="Mobile phone" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" slotProps={{ htmlInput: { maxLength: 20 } }} />
          <TextField label="Message" value={body} onChange={(e) => setMessage(e.target.value)} multiline minRows={3} helperText="You can change the message. Keep the link." />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" startIcon={<Send />} disabled={busy} onClick={send}>Send text</Button>
      </DialogActions>
    </>
  );
};

export default TextLinkDialog;
