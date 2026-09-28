import React from 'react';
import { Box } from '@mui/material';
import { DirectionsCar as CarIcon } from '@mui/icons-material';
import { photoUrl } from '../cartLogic';
import { useMp } from '../MpDataContext';

interface Props {
  file?: string;
  height?: number | string;
  onClick?: () => void;
  alt?: string;
}

/** Cart photo that reports load failures so sorting can demote broken photos. */
const CartPhoto: React.FC<Props> = ({ file, height = 160, onClick, alt = '' }) => {
  const { reportBrokenPhoto, brokenPhotos } = useMp();
  const url = file ? photoUrl(file) : '';
  if (!url || brokenPhotos.has(url)) {
    return (
      <Box sx={{ height, bgcolor: 'grey.200', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'grey.500' }}>
        <CarIcon sx={{ fontSize: 48 }} />
      </Box>
    );
  }
  return (
    <Box
      component="img"
      src={url}
      alt={alt}
      loading="lazy"
      onClick={onClick}
      onError={() => reportBrokenPhoto(url)}
      sx={{ width: '100%', height, objectFit: 'cover', display: 'block', cursor: onClick ? 'pointer' : 'default', bgcolor: 'grey.200' }}
    />
  );
};

export default CartPhoto;
