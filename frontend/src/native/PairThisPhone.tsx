import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Divider, Typography } from '@mui/material';
import { isNativeApp } from './platform';
import ScanSetupCode from './ScanSetupCode';

/** Phone app sign-in screen: set the phone up by scanning the QR code shown on the computer. */
const PairThisPhone: React.FC = () => {
  const navigate = useNavigate();
  if (!isNativeApp()) return null;
  return (
    <Box sx={{ mt: 3 }}>
      <Divider sx={{ mb: 2 }}>or set up this phone</Divider>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        On a computer open TIGON IOT → Devices → <b>Set up a phone</b>, choose the phone number, location, person and
        Facebook account, then scan the QR code with this phone.
      </Typography>
      <ScanSetupCode onDone={() => navigate('/dashboard')} />
    </Box>
  );
};

export default PairThisPhone;
