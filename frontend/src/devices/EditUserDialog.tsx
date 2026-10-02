import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField } from '@mui/material';
import { db } from '../config/firebase';
import { COLLECTIONS, DEALERSHIPS } from '../mp/constants';
import { useMp } from '../mp/MpDataContext';
import { writeAudit } from '../mp/audit';
import type { MpProfile } from '../mp/types';

/** Change a person's name and location (managers/admins). */
const EditUserDialog: React.FC<{ user: MpProfile | null; onClose: () => void }> = ({ user, onClose }) => {
  const { profile } = useMp();
  const [name, setName] = useState(user?.name || '');
  const [location, setLocation] = useState(user?.location || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!user || !name.trim()) return;
    setBusy(true);
    setError('');
    try {
      await updateDoc(doc(db, COLLECTIONS.users, user.uid), { name: name.trim().slice(0, 80), location, updatedAt: Date.now() });
      await writeAudit(profile, 'user.edit', user.uid, `${user.name} → ${name.trim()}${location ? ` · ${location}` : ''}`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!user} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Edit {user?.name}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <TextField label="Email" value={user?.email || ''} disabled helperText="The email is their sign-in and can't be changed here." />
          <TextField select label="Location" value={location} onChange={(e) => setLocation(e.target.value)}>
            <MenuItem value="">No location</MenuItem>
            {DEALERSHIPS.map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditUserDialog;
