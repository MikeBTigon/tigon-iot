import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { limit, where } from 'firebase/firestore';
import { Alert, Box, CircularProgress, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { fmtTime, useWhCollection } from '../data';
import { WH } from '../types';
import type { WhSubmission } from '../types';
import StatusChip from './StatusChip';
import { leadName } from './Wh1Hooks';

/** Recent submissions of one website or webhook (single-field query, sorted in memory). */
const RecentSubmissions: React.FC<{ field: 'domainId' | 'webhookId'; id: string; show?: number; formName?: (webhookId: string) => string }> = ({ field, id, show = 25, formName }) => {
  const navigate = useNavigate();
  const { rows, error } = useWhCollection<WhSubmission>(WH.submissions, [where(field, '==', id), limit(200)], [field, id]);
  const sorted = useMemo(() => (rows || []).slice().sort((a, b) => (b.receivedAt || 0) - (a.receivedAt || 0)), [rows]);
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!rows) return <CircularProgress size={24} aria-label="Loading" />;
  if (!sorted.length) return <Typography variant="body2" color="text.secondary">No leads yet.</Typography>;
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell><TableCell>Email</TableCell><TableCell>Phone</TableCell>
            {formName && <TableCell>Form</TableCell>}
            <TableCell>Status</TableCell><TableCell>Received</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sorted.slice(0, show).map((s) => (
            <TableRow key={s.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/wh/submissions/${s.id}`)}>
              <TableCell>{leadName(s)}</TableCell>
              <TableCell>{s.email || ''}</TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{s.phone1 || ''}</TableCell>
              {formName && <TableCell>{formName(s.webhookId)}</TableCell>}
              <TableCell><StatusChip status={s.status} /></TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtTime(s.receivedAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {sorted.length > show && (
        <Typography variant="caption" color="text.secondary">Showing the latest {show} of {sorted.length >= 200 ? '200+' : sorted.length}. See Submissions for more.</Typography>
      )}
    </Box>
  );
};

export default RecentSubmissions;
