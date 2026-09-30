import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, IconButton, InputAdornment, TextField, Tooltip, Typography } from '@mui/material';
import { Key, Visibility, VisibilityOff } from '@mui/icons-material';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useMp } from '../../mp/MpDataContext';
import { writeAudit } from '../../mp/audit';
import { createWebhookSecret, secretDocId } from '../webhookSecret';
import { WH } from '../types';
import type { WhWebhook } from '../types';
import { CopyButton } from './Wh1Code';

/**
 * The webhook's signing secret, right under "Require a signature": create it, show/hide it, copy it, or replace it.
 * (Managers and admins can read webhook secrets; everyone else can't.)
 */
const HmacSecretPanel: React.FC<{ webhook: WhWebhook }> = ({ webhook }) => {
  const { profile } = useMp();
  const [secret, setSecret] = useState<string | null | undefined>(undefined);
  const [setAt, setSetAt] = useState(0);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => onSnapshot(
    doc(db, WH.integrationSecrets, secretDocId(webhook.id)),
    (s) => { setSecret(s.exists() ? String(s.get('secret') || '') : null); setSetAt(Number(s.get('setAt') || 0)); },
    (e) => { setSecret(null); setError(e.message); },
  ), [webhook.id]);

  const create = async (rotate: boolean) => {
    if (rotate && !window.confirm('Create a new signing secret? The old one stops working right away — update every system that signs requests.')) return;
    setBusy(true);
    setError('');
    try {
      await createWebhookSecret(webhook.id);
      setShow(true);
      await writeAudit(profile, 'wh_webhook_secret', webhook.formName, `webhook ${webhook.id}: signing secret ${rotate ? 'replaced' : 'created'}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (secret === undefined) return null;
  return (
    <Box sx={{ mt: 1.5, p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: 'action.hover' }}>
      <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}><Key fontSize="small" /> Signing secret</Typography>
      {secret ? (
        <>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField size="small" value={secret} type={show ? 'text' : 'password'} sx={{ flex: '1 1 260px' }}
              slotProps={{
                htmlInput: { readOnly: true, style: { fontFamily: 'monospace' } },
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <Tooltip title={show ? 'Hide' : 'Show'}>
                        <IconButton size="small" onClick={() => setShow(!show)}>{show ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}</IconButton>
                      </Tooltip>
                    </InputAdornment>
                  ),
                },
              }} />
            <CopyButton text={secret} label="Copy secret" variant="contained" />
            <Button size="small" color="warning" onClick={() => create(true)} disabled={busy}>Create a new one</Button>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            {setAt ? `Created ${new Date(setAt).toLocaleString()}. ` : ''}Put it in the sending server's settings (never in website/browser code).
            Each request needs the header <code>X-Tigon-Signature: sha256=&lt;HMAC-SHA256 of the raw body&gt;</code> — examples in the setup packet → Developers.
          </Typography>
        </>
      ) : (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
            No secret yet — create one. Until it exists, signed requests can't be checked.
          </Typography>
          <Button variant="contained" size="small" startIcon={<Key />} onClick={() => create(false)} disabled={busy}>Create secret</Button>
        </Box>
      )}
      {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
    </Box>
  );
};

export default HmacSecretPanel;
