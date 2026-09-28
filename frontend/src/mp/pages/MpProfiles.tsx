import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Accordion, AccordionDetails, AccordionSummary, Box, Chip, List, ListItemButton, ListItemText, Typography } from '@mui/material';
import { ExpandMore } from '@mui/icons-material';
import MpShell, { ProfileSetup } from '../components/MpShell';
import ChipFilter from '../components/ChipFilter';
import { useMp } from '../MpDataContext';
import { cartTitle } from '../cartLogic';
import { formatPrice, groupAccounts, timeAgo } from '../cartUtils';
import type { MpCart } from '../types';

const MpProfiles: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { accounts, carts, userName } = useMp();
  const [owner, setOwner] = useState('any');

  const byAccount = useMemo(() => {
    const m = new Map<string, Array<{ cart: MpCart; by: string; ts: number }>>();
    for (const c of carts) {
      for (const [acct, e] of Object.entries(c.postedAccounts)) {
        const list = m.get(acct) || [];
        list.push({ cart: c, by: e.by, ts: e.ts });
        m.set(acct, list);
      }
    }
    for (const list of m.values()) list.sort((a, b) => b.ts - a.ts);
    return m;
  }, [carts]);

  const owners = useMemo(() => [...new Set(accounts.map((a) => a.owner).filter(Boolean))], [accounts]);
  const filtered = accounts.filter((a) => owner === 'any' || a.owner === owner);

  return (
    <MpShell>
      {params.get('me') && <Box sx={{ mb: 3 }}><ProfileSetup editing /></Box>}
      {owners.length > 0 && (
        <ChipFilter
          label="Owner"
          value={owner}
          options={[{ value: 'any', label: 'All' }, ...owners.map((o) => ({ value: o, label: userName(o) }))]}
          onChange={setOwner}
        />
      )}
      {groupAccounts(filtered).map(([group, list]) => (
        <Box key={group} sx={{ mb: 2 }}>
          <Typography variant="overline" color="text.secondary">{group}</Typography>
          {list.map((a) => {
            const posts = byAccount.get(a.id) || [];
            return (
              <Accordion key={a.id} disableGutters>
                <AccordionSummary expandIcon={<ExpandMore />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography sx={{ fontWeight: 600 }}>{a.name}</Typography>
                    <Chip size="small" label={`${posts.length} posted`} color={posts.length ? 'primary' : 'default'} />
                    {a.owner && <Chip size="small" variant="outlined" label={`Owner: ${userName(a.owner)}`} />}
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ p: 0 }}>
                  {posts.length === 0 ? (
                    <Typography color="text.secondary" sx={{ px: 2, pb: 2 }}>Nothing posted on this account yet.</Typography>
                  ) : (
                    <List dense>
                      {posts.map(({ cart, by, ts }) => (
                        <ListItemButton key={cart.docId} onClick={() => navigate(`/mp/cart/${encodeURIComponent(cart.docId)}`)}>
                          <ListItemText
                            primary={`${cartTitle(cart)} · ${formatPrice(cart.price)}`}
                            secondary={`${cart.locationId} · ${userName(by)} · ${timeAgo(ts)}`}
                          />
                        </ListItemButton>
                      ))}
                    </List>
                  )}
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Box>
      ))}
    </MpShell>
  );
};

export default MpProfiles;
