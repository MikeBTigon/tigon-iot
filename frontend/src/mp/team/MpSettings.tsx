import React, { useEffect, useRef, useState } from 'react';
import { setDoc } from 'firebase/firestore';
import {
  Alert, Box, Button, Card, CardActionArea, CardMedia, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, Paper, Switch, TextField, Typography,
} from '@mui/material';
import { Image as ImageIcon, Save } from '@mui/icons-material';
import MpShell from '../components/MpShell';
import { useMp } from '../MpDataContext';
import { writeAudit } from '../audit';
import type { MpSettings } from '../growthTypes';
import { DEFAULT_SETTINGS, settingsRef, useMpSettings } from './settings';
import { useBrandAssets } from './assets';

/** Brand-library picker for the logo. */
const LogoPicker: React.FC<{ open: boolean; onClose: (url?: string) => void }> = ({ open, onClose }) => {
  const { assets, loaded } = useBrandAssets();
  const images = assets.filter((a) => a.contentType.startsWith('image/'));
  return (
    <Dialog open={open} onClose={() => onClose()} fullWidth maxWidth="sm">
      <DialogTitle>Pick a logo from Brand assets</DialogTitle>
      <DialogContent>
        {!loaded && <CircularProgress />}
        {loaded && !images.length && <Typography color="text.secondary">No images in Brand assets yet — upload one there first.</Typography>}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 1 }}>
          {images.map((a) => (
            <Card key={a.id} variant="outlined">
              <CardActionArea onClick={() => onClose(a.url)}>
                <CardMedia component="img" image={a.url} alt={a.name} sx={{ height: 90, objectFit: 'contain', bgcolor: 'action.hover' }} />
                <Typography variant="caption" sx={{ display: 'block', p: 0.5 }} noWrap>{a.name}</Typography>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      </DialogContent>
      <DialogActions><Button onClick={() => onClose()}>Close</Button></DialogActions>
    </Dialog>
  );
};

/** Admin settings (mp_settings/general): approval workflow, default phone, relist reminder, logo. */
const MpSettingsPage: React.FC = () => {
  const { profile, isAdmin } = useMp();
  const { settings, exists, loaded } = useMpSettings();
  const [form, setForm] = useState<MpSettings>(DEFAULT_SETTINGS);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [picking, setPicking] = useState(false);
  const created = useRef(false);

  // Show the stored values until the admin starts editing.
  const view = dirty ? form : settings;

  // Create the doc with defaults the first time an admin opens this page.
  useEffect(() => {
    if (!loaded || exists || !isAdmin || created.current) return;
    created.current = true;
    setDoc(settingsRef(), DEFAULT_SETTINGS, { merge: true }).catch((e) => setError(e.message));
  }, [loaded, exists, isAdmin]);

  const edit = (patch: Partial<MpSettings>) => {
    setForm({ ...view, ...patch });
    setDirty(true);
    setSaved(false);
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const clean: MpSettings = {
        requireApproval: !!view.requireApproval,
        defaultPhone: (view.defaultPhone || '').trim(),
        logoUrl: (view.logoUrl || '').trim(),
        relistAfterDays: Math.max(1, Math.round(Number(view.relistAfterDays) || DEFAULT_SETTINGS.relistAfterDays)),
      };
      await setDoc(settingsRef(), clean, { merge: true });
      const changes = (Object.keys(clean) as Array<keyof MpSettings>)
        .filter((k) => clean[k] !== settings[k])
        .map((k) => `${k}=${String(clean[k])}`)
        .join(', ');
      await writeAudit(profile, 'settings.update', 'general', changes);
      setDirty(false);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <MpShell adminOnly>
      <Typography variant="h5" sx={{ mb: 2 }}>Settings</Typography>
      {!loaded ? <CircularProgress /> : (
        <Paper sx={{ p: 2, maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Box>
            <FormControlLabel
              control={<Switch checked={view.requireApproval} onChange={(e) => edit({ requireApproval: e.target.checked })} />}
              label={<Typography sx={{ fontWeight: 600 }}>Require manager approval</Typography>}
            />
            <Typography variant="body2" color="text.secondary">
              When on, posts that Members queue with Auto Post wait under <b>Queue → Needs approval</b> until a manager
              approves them. Managers get a notification every 30 minutes when new ones arrive. Managers' own posts are not affected.
            </Typography>
          </Box>
          <TextField
            label="Default phone"
            helperText="Company phone shown on storefronts and flyers when a person has none."
            value={view.defaultPhone || ''}
            onChange={(e) => edit({ defaultPhone: e.target.value })}
          />
          <TextField
            type="number"
            label="Relist reminder (days after posting)"
            value={view.relistAfterDays}
            onChange={(e) => edit({ relistAfterDays: Number(e.target.value) })}
            slotProps={{ htmlInput: { min: 1, max: 90 } }}
          />
          <Box>
            <Typography sx={{ fontWeight: 600, mb: 1 }}>Logo</Typography>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <Box sx={{ width: 96, height: 96, border: 1, borderColor: 'divider', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover' }}>
                {view.logoUrl
                  ? <Box component="img" src={view.logoUrl} alt="Logo" sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                  : <ImageIcon sx={{ color: 'text.disabled', fontSize: 40 }} />}
              </Box>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button variant="outlined" onClick={() => setPicking(true)}>Pick from Brand assets</Button>
                {view.logoUrl && <Button color="error" onClick={() => edit({ logoUrl: '' })}>Remove</Button>}
              </Box>
            </Box>
            <TextField
              fullWidth
              size="small"
              label="Logo URL"
              value={view.logoUrl || ''}
              onChange={(e) => edit({ logoUrl: e.target.value })}
              sx={{ mt: 1.5 }}
              helperText="Used as the watermark in the photo studio and on post templates."
            />
          </Box>
          {error && <Alert severity="error">{error}</Alert>}
          {saved && <Alert severity="success">Saved.</Alert>}
          <Box>
            <Button variant="contained" startIcon={<Save />} onClick={save} disabled={busy || !dirty}>
              {busy ? 'Saving…' : 'Save settings'}
            </Button>
          </Box>
        </Paper>
      )}
      <LogoPicker open={picking} onClose={(url) => { setPicking(false); if (url) edit({ logoUrl: url }); }} />
    </MpShell>
  );
};

export default MpSettingsPage;
