import { useMemo, useState } from 'react';
import {
  Alert, Badge, Box, Button, Chip, MenuItem, Paper, Tab, Tabs, TextField, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { Add, Search } from '@mui/icons-material';
import MpShell from '../components/MpShell';
import ChipFilter from '../components/ChipFilter';
import { useMp } from '../MpDataContext';
import LeadDialog from './LeadDialog';
import { useSearchParams } from 'react-router-dom';
import MarkSoldDialog from './MarkSoldDialog';
import {
  CHANNELS, CHANNEL_LABEL, LEAD_STATUSES, LEAD_STATUS_COLOR, LEAD_STATUS_LABEL, followUpState, isManager,
  shortDateTime, updateLead, useLeads, useNow,
} from './crmData';
import { timeAgo } from '../cartUtils';
import type { Lead, LeadChannel, LeadStatus } from '../growthTypes';

type DueFilter = 'all' | 'due' | 'overdue';

/** One lead in the inbox / kanban. */
function LeadCard({ lead, now, owner, onOpen, draggable }: {
  lead: Lead; now: number; owner?: string; onOpen: () => void; draggable?: boolean;
}) {
  const fu = followUpState(lead, now);
  return (
    <Paper
      variant="outlined"
      draggable={draggable}
      onDragStart={(e) => { e.dataTransfer.setData('text/lead', lead.id); e.dataTransfer.effectAllowed = 'move'; }}
      onClick={onOpen}
      sx={{ p: 1.25, cursor: 'pointer', borderLeft: `4px solid ${LEAD_STATUS_COLOR[lead.status]}`, '&:hover': { boxShadow: 2 } }}
    >
      <Typography sx={{ fontWeight: 600 }} noWrap>{lead.name || lead.phone || lead.email || 'Unnamed lead'}</Typography>
      {lead.cartTitle && <Typography variant="body2" color="text.secondary" noWrap>{lead.cartTitle}</Typography>}
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
        <Chip size="small" variant="outlined" label={CHANNEL_LABEL[lead.channel] || lead.channel} />
        {fu === 'overdue' && <Chip size="small" color="error" label={`Overdue · ${shortDateTime(lead.followUpAt!)}`} />}
        {fu === 'today' && <Chip size="small" color="warning" label={`Due today ${new Date(lead.followUpAt!).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`} />}
        {fu === 'later' && <Chip size="small" variant="outlined" label={`Follow up ${shortDateTime(lead.followUpAt!)}`} />}
        {lead.status === 'sold' && lead.soldPrice ? <Chip size="small" color="success" label={`$${lead.soldPrice.toLocaleString('en-US')}`} /> : null}
        {owner && <Chip size="small" variant="outlined" label={owner} />}
      </Box>
      <Typography variant="caption" color="text.secondary">
        {lead.lastContactAt ? `Contacted ${timeAgo(lead.lastContactAt)}` : `Added ${timeAgo(lead.createdAt)}`}
      </Typography>
    </Paper>
  );
}

/** Lead inbox: New → Talking → Sold / Lost (kanban on desktop, tabs on phones). */
export default function LeadsPage() {
  const { profile, users, userName } = useMp();
  const manager = isManager(profile);
  const { leads, error } = useLeads(profile);
  const now = useNow();
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));
  const [search, setSearch] = useState('');
  const [channel, setChannel] = useState<LeadChannel | 'all'>('all');
  const [due, setDue] = useState<DueFilter>('all');
  const [owner, setOwner] = useState<string>('all');
  const [tab, setTab] = useState<LeadStatus>('new');
  const [open, setOpen] = useState<Lead | null>(null);
  // Deep link from global search: /mp/leads?lead=<id>
  const [params, setParams] = useSearchParams();
  const linkedLead = params.get('lead') ? leads.find((l) => l.id === params.get('lead')) || null : null;
  const shownLead = open || linkedLead;
  const closeLead = () => {
    setOpen(null);
    if (params.has('lead')) setParams({}, { replace: true });
  };
  const [creating, setCreating] = useState(false);
  const [selling, setSelling] = useState<Lead | null>(null);
  const [dropError, setDropError] = useState('');
  const [over, setOver] = useState<LeadStatus | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads
      .filter((l) => owner === 'all' || l.ownerUid === owner)
      .filter((l) => channel === 'all' || l.channel === channel)
      .filter((l) => {
        if (due === 'all') return true;
        const s = followUpState(l, now);
        return due === 'overdue' ? s === 'overdue' : s === 'overdue' || s === 'today';
      })
      .filter((l) => !q || [l.name, l.phone, l.email, l.cartTitle, l.notes].join(' ').toLowerCase().includes(q))
      .sort((a, b) => {
        // Due follow-ups first, then most recent activity.
        const fa = a.followUpAt && a.followUpAt <= now ? a.followUpAt : Infinity;
        const fb = b.followUpAt && b.followUpAt <= now ? b.followUpAt : Infinity;
        if (fa !== fb) return fa - fb;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });
  }, [leads, owner, channel, due, search, now]);

  const byStatus = (s: LeadStatus) => filtered.filter((l) => l.status === s);
  const dueCount = leads.filter((l) => l.ownerUid === profile?.uid && ['overdue', 'today'].includes(followUpState(l, now) || '')).length;
  const channelsInUse = CHANNELS.filter((c) => leads.some((l) => l.channel === c));

  const moveTo = async (id: string, status: LeadStatus) => {
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.status === status) return;
    if (status === 'sold') {
      setSelling(lead);
      return;
    }
    if (lead.status === 'sold') {
      setDropError('A sold lead stays sold — open it to edit the details.');
      return;
    }
    setDropError('');
    try {
      await updateLead(id, { status });
    } catch (e) {
      setDropError(e instanceof Error ? e.message : String(e));
    }
  };

  const ownerLabel = (l: Lead) => (manager && owner === 'all' ? userName(l.ownerUid) : undefined);

  const column = (s: LeadStatus) => {
    const list = byStatus(s);
    return (
      <Box
        key={s}
        onDragOver={(e) => { e.preventDefault(); setOver(s); }}
        onDragLeave={() => setOver((o) => (o === s ? null : o))}
        onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text/lead'); if (id) moveTo(id, s); }}
        sx={{
          bgcolor: over === s ? 'action.hover' : 'background.default', borderRadius: 1, p: 1, minHeight: 240,
          border: 1, borderColor: over === s ? LEAD_STATUS_COLOR[s] : 'divider',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: LEAD_STATUS_COLOR[s] }} />
          <Typography sx={{ fontWeight: 700, flexGrow: 1 }}>{LEAD_STATUS_LABEL[s]}</Typography>
          <Chip size="small" label={list.length} />
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {list.map((l) => <LeadCard key={l.id} lead={l} now={now} owner={ownerLabel(l)} onOpen={() => setOpen(l)} draggable />)}
          {!list.length && <Typography variant="body2" color="text.disabled" sx={{ p: 1 }}>Nothing here</Typography>}
        </Box>
      </Box>
    );
  };

  return (
    <MpShell>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>Leads</Typography>
        {dueCount > 0 && <Chip color="warning" label={`${dueCount} follow-up${dueCount > 1 ? 's' : ''} due`} onClick={() => setDue('due')} />}
        <Button variant="contained" startIcon={<Add />} onClick={() => setCreating(true)}>New lead</Button>
      </Box>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Everyone who asked about a cart. Reply with one tap, set a follow-up, and mark the sale when it closes.
        {wide ? ' Drag a card to change its stage.' : ''}
      </Typography>
      {(error || dropError) && <Alert severity="error" sx={{ mb: 2 }}>{error || dropError}</Alert>}

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
        <TextField size="small" placeholder="Search name, phone, cart, notes" value={search} onChange={(e) => setSearch(e.target.value)}
          slotProps={{ input: { startAdornment: <Search fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} /> } }}
          sx={{ flexGrow: 1, minWidth: 220 }} />
        {manager && (
          <TextField select size="small" label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)} sx={{ minWidth: 180 }}>
            <MenuItem value="all">Everyone</MenuItem>
            {users.map((u) => <MenuItem key={u.uid} value={u.uid}>{u.name || u.email}</MenuItem>)}
          </TextField>
        )}
      </Box>
      <ChipFilter<LeadChannel | 'all'>
        label="Channel"
        value={channel}
        options={[{ value: 'all', label: 'All' }, ...channelsInUse.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))]}
        onChange={setChannel}
      />
      <ChipFilter<DueFilter>
        label="Follow-up"
        value={due}
        options={[{ value: 'all', label: 'Any' }, { value: 'due', label: 'Due today' }, { value: 'overdue', label: 'Overdue' }]}
        onChange={setDue}
      />

      {wide ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 1.5 }}>
          {LEAD_STATUSES.map(column)}
        </Box>
      ) : (
        <>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth" sx={{ mb: 1 }}>
            {LEAD_STATUSES.map((s) => (
              <Tab key={s} value={s} label={<Badge color="primary" badgeContent={byStatus(s).length} max={99}><Box sx={{ pr: 1.5 }}>{LEAD_STATUS_LABEL[s]}</Box></Badge>} />
            ))}
          </Tabs>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {byStatus(tab).map((l) => <LeadCard key={l.id} lead={l} now={now} owner={ownerLabel(l)} onOpen={() => setOpen(l)} />)}
            {!byStatus(tab).length && <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>No {LEAD_STATUS_LABEL[tab].toLowerCase()} leads.</Typography>}
          </Box>
        </>
      )}

      <LeadDialog open={creating} onClose={() => setCreating(false)} />
      <LeadDialog open={!!shownLead} lead={shownLead ? leads.find((l) => l.id === shownLead.id) || shownLead : null} onClose={closeLead} />
      <MarkSoldDialog lead={selling} onClose={() => setSelling(null)} />
    </MpShell>
  );
}
