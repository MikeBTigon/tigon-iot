import React, { useState } from 'react';
import { Box, Button, IconButton, Tooltip } from '@mui/material';
import { ContentCopy } from '@mui/icons-material';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers / insecure contexts.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/** "Copy" button that says "Copied!" for a moment. */
export const CopyButton: React.FC<{ text: string; label?: string; icon?: boolean; size?: 'small' | 'medium'; variant?: 'text' | 'outlined' | 'contained' }> = ({
  text, label = 'Copy', icon, size = 'small', variant = 'outlined',
}) => {
  const [done, setDone] = useState(false);
  const run = async () => {
    const ok = await copyText(text);
    setDone(ok);
    if (ok) setTimeout(() => setDone(false), 1500);
  };
  if (icon) {
    return (
      <Tooltip title={done ? 'Copied!' : label}>
        <IconButton size={size} onClick={run} aria-label={label}><ContentCopy fontSize="small" /></IconButton>
      </Tooltip>
    );
  }
  return <Button size={size} variant={variant} startIcon={<ContentCopy />} onClick={run}>{done ? 'Copied!' : label}</Button>;
};

/** Monospace block with a copy button. */
export const CodeBlock: React.FC<{ code: string; maxHeight?: number; copyLabel?: string; wrap?: boolean }> = ({ code, maxHeight = 360, copyLabel = 'Copy code', wrap }) => (
  <Box sx={{ position: 'relative' }}>
    <Box sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1, bgcolor: 'background.paper', borderRadius: 1 }}>
      <CopyButton text={code} label={copyLabel} />
    </Box>
    <Box
      component="pre"
      sx={{
        m: 0, p: 2, pt: 6, maxHeight, overflow: 'auto', bgcolor: 'action.hover', borderRadius: 1, fontSize: 12,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', whiteSpace: wrap ? 'pre-wrap' : 'pre', wordBreak: wrap ? 'break-word' : undefined, maxWidth: '100%',
      }}
    >
      {code}
    </Box>
  </Box>
);
