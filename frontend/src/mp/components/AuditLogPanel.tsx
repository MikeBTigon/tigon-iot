import React, { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Box, Paper, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { db } from '../../config/firebase';
import { useMp } from '../MpDataContext';
import { COLLECTIONS } from '../constants';
import type { AuditEntry } from '../types';

/** Admins: the last 200 admin/manager actions. */
const AuditLogPanel: React.FC = () => {
  const { isAdmin } = useMp();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!isAdmin) return;
    return onSnapshot(
      query(collection(db, COLLECTIONS.audit), orderBy('ts', 'desc'), limit(200)),
      (snap) => setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AuditEntry)),
      () => setEntries([]),
    );
  }, [isAdmin]);

  if (!isAdmin) return null;
  const f = filter.toLowerCase();
  const rows = entries.filter((e) => !f || `${e.actorName} ${e.action} ${e.target} ${e.details}`.toLowerCase().includes(f));

  return (
    <Paper sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1, flexWrap: 'wrap' }}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>Audit log</Typography>
        <TextField size="small" placeholder="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </Box>
      <Box sx={{ overflowX: 'auto', maxHeight: 420 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>When</TableCell>
              <TableCell>Who</TableCell>
              <TableCell>Action</TableCell>
              <TableCell>Details</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((e) => (
              <TableRow key={e.id}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(e.ts).toLocaleString()}</TableCell>
                <TableCell>{e.actorName}</TableCell>
                <TableCell><code>{e.action}</code></TableCell>
                <TableCell>{e.details || e.target}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
      {!rows.length && <Typography color="text.secondary" sx={{ py: 2 }}>Nothing logged yet.</Typography>}
    </Paper>
  );
};

export default AuditLogPanel;
