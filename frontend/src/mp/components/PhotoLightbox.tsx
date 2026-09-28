import React, { useEffect } from 'react';
import { Box, Dialog, IconButton, Typography, Button } from '@mui/material';
import { Close, ChevronLeft, ChevronRight, Download } from '@mui/icons-material';
import { photoUrl } from '../cartLogic';
import { savePhoto } from '../photos';
import type { Cart } from '../types';

interface Props {
  cart: Cart;
  photos: string[];
  index: number | null;
  onChange: (i: number | null) => void;
}

const PhotoLightbox: React.FC<Props> = ({ cart, photos, index, onChange }) => {
  const open = index !== null && photos.length > 0;
  const i = index ?? 0;
  const go = (d: number) => onChange((i + d + photos.length) % photos.length);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <Dialog fullScreen open={open} onClose={() => onChange(null)} slotProps={{ paper: { sx: { bgcolor: 'rgba(0,0,0,0.94)' } } }}>
      {open && (
        <Box sx={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Box component="img" src={photoUrl(photos[i])} alt="" sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          <IconButton onClick={() => onChange(null)} sx={{ position: 'absolute', top: 12, right: 12, color: 'white' }} aria-label="Close">
            <Close />
          </IconButton>
          {photos.length > 1 && (
            <>
              <IconButton onClick={() => go(-1)} sx={{ position: 'absolute', left: 8, color: 'white', bgcolor: 'rgba(255,255,255,0.12)' }} aria-label="Previous">
                <ChevronLeft fontSize="large" />
              </IconButton>
              <IconButton onClick={() => go(1)} sx={{ position: 'absolute', right: 8, color: 'white', bgcolor: 'rgba(255,255,255,0.12)' }} aria-label="Next">
                <ChevronRight fontSize="large" />
              </IconButton>
            </>
          )}
          <Box sx={{ position: 'absolute', bottom: 16, display: 'flex', gap: 2, alignItems: 'center' }}>
            <Typography sx={{ color: 'white' }}>{i + 1} / {photos.length}</Typography>
            <Button size="small" variant="contained" startIcon={<Download />} onClick={() => savePhoto(cart, photos[i], i)}>
              Save
            </Button>
          </Box>
        </Box>
      )}
    </Dialog>
  );
};

export default PhotoLightbox;
