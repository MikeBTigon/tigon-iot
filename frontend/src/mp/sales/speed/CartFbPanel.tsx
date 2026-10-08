// Track 1 (speed to lead) — on the cart page: "3 people asked about this cart" from Facebook messages.
import React, { useState } from 'react';
import { Box, Chip, List, ListItemButton, ListItemText, Paper, Typography } from '@mui/material';
import { Facebook } from '@mui/icons-material';
import type { MpCart } from '../../types';
import { useMp } from '../../MpDataContext';
import { LEAD_STATUS_LABEL, isManager, shortDateTime } from '../../crm/crmData';
import LeadDialog from '../../crm/LeadDialog';
import { useCartLeads, useFbAskCount } from './speedData';

const CartFbPanel: React.FC<{ cart: MpCart }> = ({ cart }) => {
  const { profile, userName } = useMp();
  const manager = isManager(profile);
  const count = useFbAskCount(cart.docId);
  const { items } = useCartLeads(cart.docId, profile?.uid, manager);
  const [openId, setOpenId] = useState('');
  const fb = items
    .filter((l) => l.cartId === cart.docId && l.source === 'facebook_message')
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const total = Math.max(count, fb.length);
  if (!total) return null;
  const open = fb.find((l) => l.id === openId) || null;

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Facebook color="primary" />
        <Typography sx={{ fontWeight: 700 }}>
          {total} {total === 1 ? 'person' : 'people'} asked about this cart on Facebook
        </Typography>
      </Box>
      {fb.length > 0 ? (
        <List dense disablePadding sx={{ mt: 1 }}>
          {fb.map((l) => (
            <ListItemButton key={l.id} onClick={() => setOpenId(l.id)} sx={{ borderRadius: 1 }}>
              <ListItemText
                primary={l.name || l.fbSender || 'Facebook buyer'}
                secondary={[
                  `${l.fbMessages || 1} message${(l.fbMessages || 1) > 1 ? 's' : ''}`,
                  shortDateTime(l.lastInboundAt || l.createdAt),
                  manager ? userName(l.ownerUid) : '',
                ].filter(Boolean).join(' · ')}
              />
              <Chip size="small" variant="outlined" label={LEAD_STATUS_LABEL[l.status] || l.status} />
            </ListItemButton>
          ))}
        </List>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          They are in your teammates' leads.
        </Typography>
      )}
      {fb.length > 0 && fb.length < total && (
        <Typography variant="caption" color="text.secondary">Showing your {fb.length}; the rest are your teammates' leads.</Typography>
      )}
      <LeadDialog open={!!open} lead={open} onClose={() => setOpenId('')} />
    </Paper>
  );
};

export default CartFbPanel;
