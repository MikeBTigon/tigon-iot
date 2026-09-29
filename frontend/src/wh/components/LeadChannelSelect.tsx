import { FormControl, FormHelperText, InputLabel, MenuItem, Select } from '@mui/material';
import { CHANNELS, CHANNEL_LABEL } from '../../mp/crm/crmData';

/** Default MP Leads channel for leads that come in through Webhook Flows. */
export const DEFAULT_LEAD_CHANNEL = 'dba_website';

/** Which MP Leads channel a website's leads are filed under. */
export default function LeadChannelSelect({ value, onChange, id = 'wh-lead-channel' }: {
  value: string; onChange: (v: string) => void; id?: string;
}) {
  return (
    <FormControl>
      <InputLabel id={id}>Lead channel</InputLabel>
      <Select labelId={id} label="Lead channel" value={value || DEFAULT_LEAD_CHANNEL} onChange={(e) => onChange(e.target.value)}>
        {CHANNELS.map((c) => <MenuItem key={c} value={c}>{CHANNEL_LABEL[c]}</MenuItem>)}
      </Select>
      <FormHelperText>Leads from this website show up in MP Leads under this channel.</FormHelperText>
    </FormControl>
  );
}
