import React, { useMemo, useRef, useState } from 'react';
import { collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import {
  Alert, Box, Button, Card, CardActions, CardContent, CardMedia, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, InputAdornment, TextField, Tooltip, Typography,
} from '@mui/material';
import {
  Delete, Download, Edit, InsertDriveFile, Search, Share as ShareIcon, Star, UploadFile,
} from '@mui/icons-material';
import { db, storage } from '../../config/firebase';
import MpShell from '../components/MpShell';
import { useMp } from '../MpDataContext';
import { COLLECTIONS } from '../constants';
import { writeAudit } from '../audit';
import { copyText } from '../../native/actions';
import type { BrandAsset } from '../growthTypes';
import { formatBytes, safeFileName, saveUrl, shareUrl } from './files';
import { settingsRef, useMpSettings } from './settings';
import { useBrandAssets } from './assets';

const parseTags = (s: string) => [...new Set(s.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))];
const isImage = (a: BrandAsset) => a.contentType.startsWith('image/');

/** Brand asset library: logos, photos, flyers. Managers upload/edit/delete; admins can set the team logo. */
const MpAssets: React.FC = () => {
  const { profile, isAdmin } = useMp();
  const isManager = profile?.role === 'admin' || profile?.role === 'manager';
  const { assets, loaded, error: loadError } = useBrandAssets();
  const { settings } = useMpSettings();
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [uploading, setUploading] = useState('');
  const [uploadTags, setUploadTags] = useState('');
  const [editing, setEditing] = useState<BrandAsset | null>(null);
  const [editName, setEditName] = useState('');
  const [editTags, setEditTags] = useState('');
  const [deleting, setDeleting] = useState<BrandAsset | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const allTags = useMemo(() => [...new Set(assets.flatMap((a) => a.tags || []))].sort(), [assets]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((a) =>
      (!tag || (a.tags || []).includes(tag)) &&
      (!q || a.name.toLowerCase().includes(q) || (a.tags || []).some((t) => t.includes(q))),
    );
  }, [assets, search, tag]);

  const run = async (fn: () => Promise<void>) => {
    setError('');
    setInfo('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const upload = (files: FileList | null) => run(async () => {
    if (!files?.length || !profile) return;
    const tags = parseTags(uploadTags);
    let done = 0;
    try {
      for (const file of Array.from(files)) {
        setUploading(`Uploading ${done + 1} of ${files.length}: ${file.name}`);
        const ref = doc(collection(db, COLLECTIONS.assets));
        const path = `mp_assets/${ref.id}-${safeFileName(file.name)}`;
        const obj = storageRef(storage, path);
        await uploadBytes(obj, file, { contentType: file.type || 'application/octet-stream' });
        const asset: Omit<BrandAsset, 'id'> = {
          name: file.name.replace(/\.[^.]+$/, ''),
          path,
          url: await getDownloadURL(obj),
          contentType: file.type || 'application/octet-stream',
          size: file.size,
          tags,
          uploadedBy: profile.uid,
          createdAt: Date.now(),
        };
        await setDoc(ref, asset);
        done++;
      }
      await writeAudit(profile, 'assets.upload', `${done} files`, Array.from(files).map((f) => f.name).join(', ').slice(0, 300));
      setInfo(`Uploaded ${done} file${done === 1 ? '' : 's'}.`);
    } finally {
      setUploading('');
      if (fileInput.current) fileInput.current.value = '';
    }
  });

  const saveEdit = () => run(async () => {
    if (!editing) return;
    await updateDoc(doc(db, COLLECTIONS.assets, editing.id), { name: editName.trim() || editing.name, tags: parseTags(editTags) });
    await writeAudit(profile, 'assets.edit', editing.id, editName);
    setEditing(null);
  });

  const remove = () => run(async () => {
    const a = deleting;
    setDeleting(null);
    if (!a) return;
    try {
      await deleteObject(storageRef(storage, a.path));
    } catch (e) {
      // Already gone from Storage — still remove the record.
      if (!(e instanceof Error && e.message.includes('object-not-found'))) throw e;
    }
    await deleteDoc(doc(db, COLLECTIONS.assets, a.id));
    await writeAudit(profile, 'assets.delete', a.id, a.name);
  });

  const setAsLogo = (a: BrandAsset) => run(async () => {
    await setDoc(settingsRef(), { logoUrl: a.url }, { merge: true });
    await writeAudit(profile, 'settings.logo', 'general', a.name);
    setInfo(`"${a.name}" is now the team logo.`);
  });

  const share = (a: BrandAsset) => run(async () => {
    if (!(await shareUrl(a.name, a.url))) {
      await copyText(a.url);
      setInfo('Link copied.');
    }
  });

  const ext = (a: BrandAsset) => a.path.match(/\.[a-z0-9]+$/i)?.[0] || '';

  return (
    <MpShell>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>Brand assets</Typography>
        <Chip label={`${assets.length} files`} variant="outlined" />
      </Box>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Logos, photos and flyers for posts. Download or share them straight from your phone.
      </Typography>

      {isManager && (
        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            size="small"
            label="Tags for new uploads"
            placeholder="logo, flyer, spring"
            value={uploadTags}
            onChange={(e) => setUploadTags(e.target.value)}
            sx={{ minWidth: 220, flexGrow: 1 }}
          />
          <Button variant="contained" startIcon={<UploadFile />} onClick={() => fileInput.current?.click()} disabled={!!uploading}>
            Upload files
          </Button>
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
        </Box>
      )}
      {uploading && <Alert severity="info" icon={<CircularProgress size={18} />} sx={{ mb: 2 }}>{uploading}</Alert>}
      {(error || loadError) && <Alert severity="error" sx={{ mb: 2 }}>{error || loadError}</Alert>}
      {info && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setInfo('')}>{info}</Alert>}

      <TextField
        fullWidth
        size="small"
        placeholder="Search by name or tag"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> } }}
        sx={{ mb: 1 }}
      />
      {allTags.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 2 }}>
          <Chip size="small" label="All" color={!tag ? 'primary' : 'default'} onClick={() => setTag('')} />
          {allTags.map((t) => (
            <Chip key={t} size="small" label={t} color={tag === t ? 'primary' : 'default'} variant={tag === t ? 'filled' : 'outlined'} onClick={() => setTag(tag === t ? '' : t)} />
          ))}
        </Box>
      )}

      {!loaded && <CircularProgress />}
      {loaded && !shown.length && (
        <Typography color="text.secondary" sx={{ py: 3 }}>
          {assets.length ? 'No files match.' : isManager ? 'No brand files yet — upload your logos and photos.' : 'No brand files yet.'}
        </Typography>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 1.5 }}>
        {shown.map((a) => (
          <Card key={a.id} variant="outlined" sx={{ display: 'flex', flexDirection: 'column' }}>
            {isImage(a) ? (
              <CardMedia component="img" image={a.url} alt={a.name} loading="lazy" sx={{ height: 130, objectFit: 'contain', bgcolor: 'action.hover' }} />
            ) : (
              <Box sx={{ height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover' }}>
                <InsertDriveFile sx={{ fontSize: 48, color: 'text.disabled' }} />
              </Box>
            )}
            <CardContent sx={{ p: 1, flexGrow: 1, '&:last-child': { pb: 1 } }}>
              <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
                {a.name}
                {settings.logoUrl === a.url && <Chip size="small" color="primary" icon={<Star />} label="Logo" sx={{ ml: 0.5 }} />}
              </Typography>
              <Typography variant="caption" color="text.secondary">{formatBytes(a.size)}{ext(a) ? ` · ${ext(a).slice(1).toUpperCase()}` : ''}</Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                {(a.tags || []).map((t) => <Chip key={t} size="small" variant="outlined" label={t} onClick={() => setTag(t)} />)}
              </Box>
            </CardContent>
            <CardActions sx={{ pt: 0, flexWrap: 'wrap' }}>
              <Tooltip title="Download"><IconButton size="small" onClick={() => run(() => saveUrl(`${a.name}${ext(a)}`, a.url))}><Download /></IconButton></Tooltip>
              <Tooltip title="Share"><IconButton size="small" onClick={() => share(a)}><ShareIcon /></IconButton></Tooltip>
              {isManager && (
                <Tooltip title="Edit name/tags">
                  <IconButton size="small" onClick={() => { setEditing(a); setEditName(a.name); setEditTags((a.tags || []).join(', ')); }}><Edit /></IconButton>
                </Tooltip>
              )}
              {isAdmin && isImage(a) && settings.logoUrl !== a.url && (
                <Tooltip title="Use as team logo"><IconButton size="small" onClick={() => setAsLogo(a)}><Star /></IconButton></Tooltip>
              )}
              {isManager && (
                <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDeleting(a)}><Delete /></IconButton></Tooltip>
              )}
            </CardActions>
          </Card>
        ))}
      </Box>

      <Dialog open={!!editing} onClose={() => setEditing(null)} fullWidth maxWidth="xs">
        <DialogTitle>Edit file</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          <TextField label="Name" value={editName} onChange={(e) => setEditName(e.target.value)} />
          <TextField label="Tags (comma separated)" value={editTags} onChange={(e) => setEditTags(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="contained" onClick={saveEdit}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleting} onClose={() => setDeleting(null)} maxWidth="xs">
        <DialogTitle>Delete "{deleting?.name}"?</DialogTitle>
        <DialogContent>
          <Typography>The file is removed for everyone. Posts already published keep their copy.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={remove}>Delete</Button>
        </DialogActions>
      </Dialog>
    </MpShell>
  );
};

export default MpAssets;
