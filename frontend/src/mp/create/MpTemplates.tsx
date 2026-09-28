import { useRef, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, Paper,
  Switch, Tab, Tabs, TextField, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { Add, ContentCopy, Delete, Edit, LibraryAdd } from '@mui/icons-material';
import { db } from '../../config/firebase';
import { copyText } from '../../native/actions';
import MpShell from '../components/MpShell';
import { useMp } from '../MpDataContext';
import { COLLECTIONS, shortLinkUrl } from '../constants';
import { DEFAULT_REPLY_TEMPLATES, fillTemplate, useTemplates } from '../templates';
import type { TextTemplate } from '../growthTypes';

type Scope = TextTemplate['scope'];

const PLACEHOLDERS = ['year', 'make', 'model', 'title', 'color', 'price', 'location', 'storeName', 'phone', 'name', 'link', 'reviewLink'];

interface Draft {
  id?: string;
  title: string;
  category: string;
  body: string;
  shared: boolean;
}

const EMPTY: Draft = { title: '', category: '', body: '', shared: true };

/** Listing and reply templates: create, edit, share, preview with a real cart. */
export default function MpTemplates() {
  const { profile, carts } = useMp();
  const uid = profile?.uid;
  const isManager = profile?.role === 'admin' || profile?.role === 'manager';
  const [scope, setScope] = useState<Scope>('listing');
  const listing = useTemplates('listing', uid);
  const reply = useTemplates('reply', uid);
  const list = scope === 'listing' ? listing : reply;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));

  const sample = carts[0];
  const preview = (body: string) =>
    fillTemplate(body, { cart: sample, name: scope === 'reply' ? 'Alex' : profile?.name, link: shortLinkUrl('abc123') });

  const canEdit = (t: TextTemplate) => t.createdBy === uid || isManager;

  const insert = (ph: string) => {
    if (!draft) return;
    const token = `{${ph}}`;
    const el = bodyRef.current;
    const start = el?.selectionStart ?? draft.body.length;
    const end = el?.selectionEnd ?? draft.body.length;
    const body = draft.body.slice(0, start) + token + draft.body.slice(end);
    setDraft({ ...draft, body });
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    act(async () => {
      if (!draft || !uid) return;
      if (!draft.title.trim() || !draft.body.trim()) throw new Error('Title and text are required.');
      const now = Date.now();
      const data = { title: draft.title.trim(), category: draft.category.trim(), body: draft.body, shared: draft.shared, scope, updatedAt: now };
      if (draft.id) await updateDoc(doc(db, COLLECTIONS.templates, draft.id), data);
      else await addDoc(collection(db, COLLECTIONS.templates), { ...data, createdBy: uid, createdAt: now });
      setDraft(null);
    });

  const remove = (t: TextTemplate) =>
    act(async () => {
      if (!window.confirm(`Delete “${t.title}”?`)) return;
      await deleteDoc(doc(db, COLLECTIONS.templates, t.id));
    });

  const addStarters = () =>
    act(async () => {
      if (!uid) return;
      const have = new Set(reply.map((t) => t.title.toLowerCase()));
      const todo = DEFAULT_REPLY_TEMPLATES.filter((t) => !have.has(t.title.toLowerCase()));
      const now = Date.now();
      for (const t of todo) {
        await addDoc(collection(db, COLLECTIONS.templates), {
          scope: 'reply', title: t.title, category: t.category || '', body: t.body, shared: true, createdBy: uid, createdAt: now, updatedAt: now,
        });
      }
      setInfo(todo.length ? `Added ${todo.length} starter reply templates.` : 'The starter templates are already there.');
    });

  return (
    <MpShell>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>Templates</Typography>
        {scope === 'reply' && (
          <Button variant="outlined" startIcon={<LibraryAdd />} onClick={addStarters} disabled={busy}>Add starter reply templates</Button>
        )}
        <Button variant="contained" startIcon={<Add />} onClick={() => setDraft({ ...EMPTY })}>New template</Button>
      </Box>
      <Typography color="text.secondary" sx={{ mb: 1 }}>
        Reusable text for listing descriptions and buyer replies. Placeholders like {'{make}'} fill in from the cart.
      </Typography>
      <Tabs value={scope} onChange={(_, v) => setScope(v)} sx={{ mb: 2 }}>
        <Tab value="listing" label={`Listing (${listing.length})`} />
        <Tab value="reply" label={`Reply (${reply.length})`} />
      </Tabs>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {info && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setInfo('')}>{info}</Alert>}

      {list.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">
            No {scope} templates yet.{scope === 'reply' ? ' Tap “Add starter reply templates” to get going.' : ''}
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
          {list.map((t) => (
            <Paper key={t.id} variant="outlined" sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ fontWeight: 600, flexGrow: 1 }}>{t.title}</Typography>
                {t.category && <Chip size="small" label={t.category} />}
                <Chip size="small" variant="outlined" label={t.shared ? 'Shared' : 'Only me'} />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>{preview(t.body)}</Typography>
              <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                <Tooltip title="Copy (filled with the sample cart)">
                  <IconButton size="small" onClick={() => copyText(preview(t.body)).then(() => setInfo('Copied.'))}><ContentCopy fontSize="small" /></IconButton>
                </Tooltip>
                {canEdit(t) && (
                  <>
                    <IconButton size="small" onClick={() => setDraft({ id: t.id, title: t.title, category: t.category || '', body: t.body, shared: t.shared })}><Edit fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => remove(t)}><Delete fontSize="small" /></IconButton>
                  </>
                )}
              </Box>
            </Paper>
          ))}
        </Box>
      )}

      <Dialog open={!!draft} onClose={() => setDraft(null)} fullWidth maxWidth="md" fullScreen={phone}>
        <DialogTitle>{draft?.id ? 'Edit template' : `New ${scope} template`}</DialogTitle>
        {draft && (
          <DialogContent sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, alignItems: 'start' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 1 }}>
              <TextField label="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} autoFocus />
              <TextField
                label="Category"
                placeholder={scope === 'reply' ? 'availability, price, pickup…' : 'new carts, used carts…'}
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              />
              <TextField
                label="Text"
                multiline
                minRows={6}
                value={draft.body}
                inputRef={bodyRef}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              />
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {PLACEHOLDERS.map((p) => (
                  <Chip key={p} size="small" label={`{${p}}`} onClick={() => insert(p)} color="secondary" variant="outlined" />
                ))}
              </Box>
              <FormControlLabel
                control={<Switch checked={draft.shared} onChange={(e) => setDraft({ ...draft, shared: e.target.checked })} />}
                label="Shared with the team"
              />
            </Box>
            <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'grey.50', mt: { md: 1 } }}>
              <Typography variant="caption" color="text.secondary">
                Preview{sample ? ` · ${[sample.year, sample.make, sample.model].filter(Boolean).join(' ')}` : ' · no carts loaded'}
              </Typography>
              <Typography sx={{ whiteSpace: 'pre-wrap', mt: 0.5 }} variant="body2">{preview(draft.body) || '…'}</Typography>
            </Paper>
          </DialogContent>
        )}
        <DialogActions>
          <Button onClick={() => setDraft(null)}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={busy}>Save</Button>
        </DialogActions>
      </Dialog>
    </MpShell>
  );
}
