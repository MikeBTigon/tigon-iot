import React, { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, IconButton, InputLabel,
  MenuItem, Paper, Select, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { Block, Delete, Edit, Restore, SwapHoriz } from '@mui/icons-material';
import { db } from '../config/firebase';
import { useMp } from '../mp/MpDataContext';
import { writeAudit } from '../mp/audit';
import type { DeviceDoc } from '../mp/types';
import { isOnline, lastSeenMs, seenLabel } from './deviceStatus';

type Action = { kind: 'rename' | 'reassign'; device: DeviceDoc } | null;

/** Managers/admins: every phone on the team — rename, reassign, revoke, delete. */
const TeamDevicesPanel: React.FC = () => {
  const { profile, isAdmin, users, userName } = useMp();
  const isManager = profile?.role === 'admin' || profile?.role === 'manager';
  const [devices, setDevices] = useState<DeviceDoc[]>([]);
  const [error, setError] = useState('');
  const [action, setAction] = useState<Action>(null);
  const [value, setValue] = useState('');
  const [owner, setOwner] = useState('any');

  useEffect(() => {
    if (!isManager) return;
    return onSnapshot(
      collection(db, 'devices'),
      (snap) => setDevices(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DeviceDoc)),
      (e) => setError(e.message),
    );
  }, [isManager]);

  const rows = useMemo(
    () =>
      devices
        .filter((d) => owner === 'any' || d.userId === owner)
        .sort((a, b) => userName(a.userId).localeCompare(userName(b.userId)) || lastSeenMs(b) - lastSeenMs(a)),
    [devices, owner, userName],
  );

  if (!isManager) return null;

  const run = async (fn: () => Promise<void>) => {
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const save = () =>
    run(async () => {
      if (!action) return;
      const d = action.device;
      if (action.kind === 'rename' && value.trim()) {
        await updateDoc(doc(db, 'devices', d.id), { deviceName: value.trim() });
        await writeAudit(profile, 'device.rename', d.id, `${d.deviceName} → ${value.trim()}`);
      }
      if (action.kind === 'reassign' && value && value !== d.userId) {
        await updateDoc(doc(db, 'devices', d.id), { userId: value, isActive: false });
        await writeAudit(profile, 'device.reassign', d.id, `${userName(d.userId)} → ${userName(value)}`);
      }
      setAction(null);
    });

  const toggleRevoke = (d: DeviceDoc) =>
    run(async () => {
      const revoke = d.status !== 'revoked';
      if (revoke && !window.confirm(`Revoke ${d.deviceName}? The phone is signed out and stops getting alerts.`)) return;
      await updateDoc(doc(db, 'devices', d.id), { status: revoke ? 'revoked' : 'active', isActive: revoke ? false : d.isActive });
      await writeAudit(profile, revoke ? 'device.revoke' : 'device.restore', d.id, d.deviceName);
    });

  const remove = (d: DeviceDoc) =>
    run(async () => {
      if (!window.confirm(`Delete ${d.deviceName}? Its analytics history is kept.`)) return;
      await deleteDoc(doc(db, 'devices', d.id));
      await writeAudit(profile, 'device.delete', d.id, d.deviceName);
    });

  const owners = [...new Set(devices.map((d) => d.userId))];
  const online = devices.filter((d) => d.status !== 'revoked' && isOnline(d)).length;

  return (
    <Paper sx={{ p: 3, mt: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <Typography variant="h6" color="primary" sx={{ flexGrow: 1 }}>Team phones</Typography>
        <Chip size="small" color="success" label={`${online} online`} />
        <Chip size="small" variant="outlined" label={`${devices.length} total`} />
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Owner</InputLabel>
          <Select label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)}>
            <MenuItem value="any">Everyone</MenuItem>
            {owners.map((u) => <MenuItem key={u} value={u}>{userName(u)}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Phone</TableCell>
              <TableCell>Owner</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>App</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((d) => {
              const revoked = d.status === 'revoked';
              return (
                <TableRow key={d.id} hover sx={{ opacity: revoked ? 0.55 : 1 }}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{d.deviceName}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {[d.platform, d.model].filter(Boolean).join(' · ') || (d.source === 'tigon-iot-app' ? 'TIGON IOT app' : 'IoT app')}
                    </Typography>
                  </TableCell>
                  <TableCell>{userName(d.userId)}</TableCell>
                  <TableCell>
                    <Chip size="small" label={d.deviceType === 'worker' ? 'Worker' : 'Master'} color={d.deviceType === 'worker' ? 'primary' : 'secondary'} />
                    {d.isActive && <Chip size="small" sx={{ ml: 0.5 }} variant="outlined" label="Alerts on" />}
                  </TableCell>
                  <TableCell>
                    {revoked ? (
                      <Chip size="small" color="error" label="Revoked" />
                    ) : (
                      <Chip size="small" color={isOnline(d) ? 'success' : 'default'} label={seenLabel(d)} />
                    )}
                  </TableCell>
                  <TableCell><Typography variant="caption">{d.appVersion || '—'}</Typography></TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <Tooltip title="Rename"><IconButton size="small" onClick={() => { setAction({ kind: 'rename', device: d }); setValue(d.deviceName); }}><Edit fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Reassign to someone else"><IconButton size="small" onClick={() => { setAction({ kind: 'reassign', device: d }); setValue(d.userId); }}><SwapHoriz fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title={revoked ? 'Restore' : 'Revoke (signs the phone out)'}>
                      <IconButton size="small" color={revoked ? 'success' : 'warning'} onClick={() => toggleRevoke(d)}>{revoked ? <Restore fontSize="small" /> : <Block fontSize="small" />}</IconButton>
                    </Tooltip>
                    {isAdmin && <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => remove(d)}><Delete fontSize="small" /></IconButton></Tooltip>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>
      {!rows.length && <Typography color="text.secondary" sx={{ py: 2 }}>No phones yet — use "Pair a phone".</Typography>}

      <Dialog open={!!action} onClose={() => setAction(null)} fullWidth maxWidth="xs">
        <DialogTitle>{action?.kind === 'rename' ? 'Rename phone' : 'Reassign phone'}</DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          {action?.kind === 'rename' ? (
            <TextField fullWidth autoFocus label="Phone name" value={value} onChange={(e) => setValue(e.target.value)} />
          ) : (
            <>
              <FormControl fullWidth>
                <InputLabel>New owner</InputLabel>
                <Select label="New owner" value={value} onChange={(e) => setValue(e.target.value)}>
                  {users.map((u) => <MenuItem key={u.uid} value={u.uid}>{u.name || u.email}</MenuItem>)}
                </Select>
              </FormControl>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                The phone is signed out of the old account; pair it again for the new owner to sign it in.
              </Typography>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAction(null)}>Cancel</Button>
          <Button variant="contained" onClick={save}>Save</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default TeamDevicesPanel;
