import React, { useMemo, useState } from 'react';
import { Box, Button, Chip, IconButton, Paper, Tab, Tabs, Tooltip, Typography } from '@mui/material';
import { ContentCopy, Check } from '@mui/icons-material';
import { generateVariations } from '../cartLogic';
import type { Cart } from '../types';

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  };
  if (label) {
    return (
      <Button size="small" variant="contained" startIcon={done ? <Check /> : <ContentCopy />} onClick={copy}>
        {done ? 'Copied' : label}
      </Button>
    );
  }
  return (
    <Tooltip title={done ? 'Copied' : 'Copy'}>
      <IconButton size="small" onClick={copy}>{done ? <Check fontSize="small" color="success" /> : <ContentCopy fontSize="small" />}</IconButton>
    </Tooltip>
  );
}

const ListingVariations: React.FC<{ cart: Cart; userId: string }> = ({ cart, userId }) => {
  const variations = useMemo(() => generateVariations(cart, userId), [cart, userId]);
  const [tab, setTab] = useState(0);
  const l = variations[tab];

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" color="primary" gutterBottom>Listing variations</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" allowScrollButtonsMobile sx={{ mb: 2 }}>
        {variations.map((v, i) => <Tab key={i} label={`#${i + 1} ${v.format === 'list' ? 'List' : 'Paragraph'}`} />)}
      </Tabs>
      {[['Title 1', l.title1], ['Title 2', l.title2]].map(([label, text]) => (
        <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Chip size="small" label={label} />
          <Typography sx={{ flexGrow: 1, fontWeight: 600 }}>{text}</Typography>
          <CopyButton text={text} />
        </Box>
      ))}
      <Box sx={{ position: 'relative', bgcolor: 'grey.50', border: 1, borderColor: 'grey.200', borderRadius: 2, p: 2, mt: 1 }}>
        <Typography component="pre" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', m: 0, fontSize: 14 }}>{l.description}</Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
        <CopyButton text={l.description} label="Copy description" />
        <CopyButton text={`${l.title1}\n\n${l.description}`} label="Copy title + description" />
      </Box>
    </Paper>
  );
};

export default ListingVariations;
