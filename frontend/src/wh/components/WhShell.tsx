import React from 'react';
import { Alert, Box, CircularProgress, Typography } from '@mui/material';
import DashboardLayout from '../../components/Layout/DashboardLayout';
import { useMp } from '../../mp/MpDataContext';

/**
 * Page frame for Webhook Flows: app layout, title/actions row, and the role gate
 * (managers and admins; `admin` restricts the page to admins).
 */
const WhShell: React.FC<{
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  admin?: boolean;
  children: React.ReactNode;
}> = ({ title, subtitle, actions, admin, children }) => {
  const { profile } = useMp();
  const allowed = admin ? profile?.role === 'admin' : profile?.role === 'admin' || profile?.role === 'manager';
  let body: React.ReactNode = children;
  if (profile === undefined) body = <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress aria-label="Loading" /></Box>;
  else if (!allowed) {
    body = (
      <Alert severity="info">
        Webhook Flows is for {admin ? 'admins' : 'managers and admins'}. Ask an admin to change your role in MP Assistant → Profiles.
      </Alert>
    );
  }
  return (
    <DashboardLayout>
      <Box sx={{ display: 'flex', alignItems: { sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 1, mb: 2 }}>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="h5" color="primary" sx={{ fontWeight: 600 }}>{title}</Typography>
          {subtitle && <Typography variant="body2" color="text.secondary">{subtitle}</Typography>}
        </Box>
        {allowed && actions && <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>{actions}</Box>}
      </Box>
      {body}
    </DashboardLayout>
  );
};

export default WhShell;
