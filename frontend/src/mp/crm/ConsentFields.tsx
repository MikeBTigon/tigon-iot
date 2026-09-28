import { Box, Checkbox, FormControlLabel, TextField, Typography } from '@mui/material';

export interface ConsentValue {
  consentSms: boolean;
  consentWhatsapp: boolean;
  consentEmail: boolean;
  consentSource: string;
}

/** Per-channel opt-in checkboxes + "how was consent given" (required when any box is checked). */
export default function ConsentFields({ value, onChange }: { value: ConsentValue; onChange: (v: ConsentValue) => void }) {
  const any = value.consentSms || value.consentWhatsapp || value.consentEmail;
  const box = (key: 'consentSms' | 'consentWhatsapp' | 'consentEmail', label: string) => (
    <FormControlLabel
      control={<Checkbox size="small" checked={value[key]} onChange={(e) => onChange({ ...value, [key]: e.target.checked })} />}
      label={label}
    />
  );
  return (
    <Box>
      <Typography variant="subtitle2">Marketing opt-in</Typography>
      <Typography variant="caption" color="text.secondary">
        Check only the channels the customer agreed to receive messages on.
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
        {box('consentSms', 'Text (SMS)')}
        {box('consentWhatsapp', 'WhatsApp')}
        {box('consentEmail', 'Email')}
      </Box>
      {any && (
        <TextField
          fullWidth size="small" required label="How was consent given?"
          placeholder='e.g. "verbal at Hatfield store", "signed sales form"'
          value={value.consentSource}
          error={!value.consentSource.trim()}
          helperText={!value.consentSource.trim() ? 'Required when any opt-in is checked' : ' '}
          onChange={(e) => onChange({ ...value, consentSource: e.target.value })}
        />
      )}
    </Box>
  );
}
