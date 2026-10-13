// Texting consent (TCPA) for customer forms that can lead to texts. Unchecked by default; the form must send
// `consent` (true|false) and `consentText` (the exact wording shown, in the shown language — use consentPayload()).
import React from 'react';
import { Checkbox, FormControlLabel, Typography } from '@mui/material';
import { useT } from '../../../i18n';

const ConsentCheckbox: React.FC<{ checked: boolean; onChange: (checked: boolean) => void }> = ({ checked, onChange }) => {
  const t = useT();
  return (
    <FormControlLabel
      sx={{ alignItems: 'flex-start', mr: 0 }}
      control={<Checkbox checked={checked} onChange={(e) => onChange(e.target.checked)} sx={{ pt: 0.25 }} />}
      label={<Typography variant="body2" color="text.secondary">{t('consent.sms')}</Typography>}
    />
  );
};

export default ConsentCheckbox;
