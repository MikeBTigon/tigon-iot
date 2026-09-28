import React, { useMemo, useState } from 'react';
import { InputAdornment, Paper, TextField, Typography } from '@mui/material';
import { Search } from '@mui/icons-material';
import MpShell from '../components/MpShell';
import CartGrid from '../components/CartGrid';
import ChipFilter from '../components/ChipFilter';
import { dynamicOptions } from '../filterUtils';
import { useMp } from '../MpDataContext';
import { isPostedBy, masterSort, matchesSearch } from '../cartUtils';

const MpBrowse: React.FC = () => {
  const { carts, brokenPhotos, userKeys } = useMp();
  const [q, setQ] = useState('');
  const [make, setMake] = useState('any');
  const [condition, setCondition] = useState<'any' | 'used' | 'new'>('any');
  const [posted, setPosted] = useState<'any' | 'mine' | 'notmine' | 'anyone' | 'none'>('any');

  const makeOpts = useMemo(() => dynamicOptions(carts.map((c) => c.make)), [carts]);
  const results = useMemo(
    () =>
      masterSort(
        carts.filter((c) => {
          if (make !== 'any' && c.make.trim().toLowerCase() !== make) return false;
          if (condition !== 'any' && (condition === 'used') !== c.isUsed) return false;
          const mine = isPostedBy(c, userKeys);
          const anyone = Object.keys(c.postedBy).length > 0 || Object.keys(c.postedAccounts).length > 0;
          if (posted === 'mine' && !mine) return false;
          if (posted === 'notmine' && mine) return false;
          if (posted === 'anyone' && !anyone) return false;
          if (posted === 'none' && anyone) return false;
          return matchesSearch(c, q);
        }),
        brokenPhotos,
      ),
    [carts, make, condition, posted, q, userKeys, brokenPhotos],
  );

  return (
    <MpShell>
      <Paper sx={{ p: 2, mb: 3 }}>
        <TextField
          fullWidth
          placeholder="Search all inventory…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> } }}
          sx={{ mb: 2 }}
        />
        <ChipFilter label="Make" value={make} options={makeOpts} onChange={setMake} />
        <ChipFilter label="Condition" value={condition} options={[{ value: 'any', label: 'Any' }, { value: 'used', label: 'Used' }, { value: 'new', label: 'New' }]} onChange={setCondition} />
        <ChipFilter
          label="Posted"
          value={posted}
          options={[
            { value: 'any', label: 'Any' },
            { value: 'mine', label: 'Posted by me' },
            { value: 'notmine', label: 'Not posted by me' },
            { value: 'anyone', label: 'Posted by anyone' },
            { value: 'none', label: 'Never posted' },
          ]}
          onChange={setPosted}
        />
        <Typography variant="body2" color="text.secondary">{results.length} carts</Typography>
      </Paper>
      <CartGrid carts={results} />
    </MpShell>
  );
};

export default MpBrowse;
