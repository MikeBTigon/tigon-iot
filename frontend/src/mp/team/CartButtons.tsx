import { useState } from 'react';
import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItem, ListItemText, Typography,
} from '@mui/material';
import { History } from '@mui/icons-material';
import { useMp } from '../MpDataContext';
import { cartTitle } from '../cartLogic';
import type { MpCart } from '../types';

/** Cart-page button for the Team area: "Posting history" — which accounts it's on, who posted it and when. */
export default function TeamCartButtons({ cart }: { cart: MpCart }) {
  const { accounts, userName } = useMp();
  const [open, setOpen] = useState(false);
  const posts = Object.entries(cart.postedAccounts)
    .map(([id, p]) => ({ id, account: accounts.find((a) => a.id === id)?.name || id, by: userName(p.by), ts: p.ts }))
    .sort((a, b) => b.ts - a.ts);
  // Legacy "posted" marks without a specific account.
  const marks = Object.entries(cart.postedBy)
    .filter(([key]) => !posts.some((p) => cart.postedAccounts[p.id]?.by === key))
    .map(([key, ts]) => ({ key, by: userName(key), ts }))
    .sort((a, b) => b.ts - a.ts);

  return (
    <>
      <Button size="small" startIcon={<History />} onClick={() => setOpen(true)}>
        Posting history{posts.length ? ` (${posts.length})` : ''}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Posting history · {cartTitle(cart)}</DialogTitle>
        <DialogContent>
          {!posts.length && !marks.length && <Typography color="text.secondary">Not posted on any account yet.</Typography>}
          <List dense disablePadding>
            {posts.map((p) => (
              <ListItem key={p.id} disableGutters>
                <ListItemText primary={p.account} secondary={`${p.by} · ${new Date(p.ts).toLocaleString()}`} />
              </ListItem>
            ))}
            {marks.map((m) => (
              <ListItem key={`m-${m.key}`} disableGutters>
                <ListItemText primary="Marked posted (no account)" secondary={`${m.by} · ${new Date(m.ts).toLocaleString()}`} />
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions><Button onClick={() => setOpen(false)}>Close</Button></DialogActions>
      </Dialog>
    </>
  );
}
