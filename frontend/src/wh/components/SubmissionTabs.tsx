import React from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { Tab, Tabs } from '@mui/material';
import { SUBMISSION_VIEWS } from '../submissionViews';

/** Tabs across the submission lists (each has its own URL); the date/website filters carry over. */
const SubmissionTabs: React.FC<{ current: string }> = ({ current }) => {
  const { search } = useLocation();
  const p = new URLSearchParams(search);
  p.delete('status');
  const qs = p.toString() ? `?${p.toString()}` : '';
  return (
    <Tabs value={current} variant="scrollable" allowScrollButtonsMobile sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
      {SUBMISSION_VIEWS.map((v) => (
        <Tab key={v.path} value={v.path} label={v.label} component={RouterLink} to={`${v.path}${qs}`} />
      ))}
    </Tabs>
  );
};

export default SubmissionTabs;
