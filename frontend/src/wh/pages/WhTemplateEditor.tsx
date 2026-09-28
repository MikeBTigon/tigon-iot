import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { limit, orderBy } from 'firebase/firestore';
import {
  Alert, Box, Button, Chip, CircularProgress, Link, MenuItem, Paper, Stack, Tab, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import { ArrowBack, AutoFixHigh, Save, Send } from '@mui/icons-material';
import WhShell from '../components/WhShell';
import { useMp } from '../../mp/MpDataContext';
import { writeAudit } from '../../mp/audit';
import { PUBLIC_HOST, callWh, fmtTime, saveWh, splitList, useWhCollection, useWhDoc } from '../data';
import { SAMPLE_LEAD, renderTemplate } from '../shared';
import type { MergeData } from '../shared';
import { LEAD_FIELDS, TRACKING_FIELDS, WH } from '../types';
import type { WhDomain, WhEmailTemplate, WhSubmission, WhWebhook } from '../types';

type Draft = Pick<WhEmailTemplate, 'name' | 'subject' | 'htmlBody' | 'textBody'>;
type FieldKey = 'subject' | 'htmlBody' | 'textBody';

const BLANK: Draft = {
  name: 'New template',
  subject: 'New lead from {{domain_name}}: {{first_name}} {{last_name}}',
  htmlBody: '<h2>New lead from {{domain_name}}</h2>\n<p><b>{{first_name}} {{last_name}}</b></p>\n{{#if comments}}<p>{{comments}}</p>{{/if}}\n{{all_fields_table}}\n',
  textBody: 'New lead from {{domain_name}}\n\n{{all_fields_table}}\n',
};

const EXTRA_TAGS = ['domain_name', 'webhook_name', 'submitted_at', 'lead_url', 'all_fields_table'];
const SNIPPETS: Array<{ label: string; text: string }> = [
  { label: 'If image 1…', text: '{{#if image_1}}<p><img src="{{image_1}}" alt="Photo" style="max-width:100%"></p>{{/if}}' },
  { label: 'If comments…', text: '{{#if comments}}<p>{{comments}}</p>{{/if}}' },
  { label: 'If / else', text: '{{#if phone1}}Call {{phone1}}{{else}}No phone given{{/if}}' },
  { label: 'Button to lead', text: '<a href="{{lead_url}}" style="display:inline-block;background:#1b5e20;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">Open lead</a>' },
];

/** Rough HTML → text that keeps merge tags. */
function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|tr|li|table)>/gi, '\n')
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
      const l = label.replace(/<[^>]+>/g, '').trim();
      return l && l !== href ? `${l}: ${href}` : href;
    })
    .replace(/<[^>]+>/g, '');
  const ta = document.createElement('textarea');
  ta.innerHTML = withBreaks;
  return ta.value.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

const WhTemplateEditor: React.FC = () => {
  const { id = 'new' } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const { profile } = useMp();
  const tpl = useWhDoc<WhEmailTemplate>(WH.templates, isNew ? undefined : id);
  const { rows: recent } = useWhCollection<WhSubmission>(WH.submissions, [orderBy('receivedAt', 'desc'), limit(20)]);
  const { rows: domains } = useWhCollection<WhDomain>(WH.domains);
  const { rows: hooks } = useWhCollection<WhWebhook>(WH.webhooks);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [sampleId, setSampleId] = useState('');
  const [previewTab, setPreviewTab] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const inputs = useRef<Partial<Record<FieldKey, HTMLInputElement | HTMLTextAreaElement | null>>>({});
  const lastField = useRef<FieldKey>('htmlBody');

  const dirty = draft !== null;
  const base: Draft | null = isNew ? BLANK : tpl ? { name: tpl.name, subject: tpl.subject, htmlBody: tpl.htmlBody, textBody: tpl.textBody } : null;
  const view = draft || base;

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const sample: MergeData = useMemo(() => {
    const s = (recent || []).find((x) => x.id === sampleId);
    if (!s) return { ...SAMPLE_LEAD, webhook_name: 'Contact form', lead_url: `${PUBLIC_HOST}/wh/submissions/sample` };
    const data: MergeData = {};
    for (const f of [...LEAD_FIELDS, ...TRACKING_FIELDS]) if (s[f]) data[f] = String(s[f]);
    data.domain_name = (domains || []).find((d) => d.id === s.domainId)?.name || '';
    data.webhook_name = (hooks || []).find((w) => w.id === s.webhookId)?.formName || '';
    data.submitted_at = new Date(s.receivedAt).toLocaleString();
    data.lead_url = `${PUBLIC_HOST}/wh/submissions/${s.id}`;
    return data;
  }, [recent, sampleId, domains, hooks]);

  if (!isNew && tpl === undefined) return <WhShell title="Email template"><Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress aria-label="Loading" /></Box></WhShell>;
  if (!view) {
    return (
      <WhShell title="Template not found">
        <Alert severity="warning">This template doesn&apos;t exist (it may have been deleted). <Link component={RouterLink} to="/wh/templates">Back to templates</Link></Alert>
      </WhShell>
    );
  }

  const edit = (patch: Partial<Draft>) => { setDraft({ ...view, ...patch }); setMsg(null); };
  const toValue = to ?? profile?.email ?? '';

  const insert = (tag: string) => {
    const key = lastField.current;
    const el = inputs.current[key];
    const cur = view[key] || '';
    const start = el?.selectionStart ?? cur.length;
    const end = el?.selectionEnd ?? cur.length;
    edit({ [key]: cur.slice(0, start) + tag + cur.slice(end) });
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + tag.length, start + tag.length);
    });
  };

  const save = async () => {
    if (!view.name.trim()) { setMsg({ ok: false, text: 'Give the template a name.' }); return; }
    if (!view.subject.trim()) { setMsg({ ok: false, text: 'Add a subject.' }); return; }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { ...view, name: view.name.trim() };
      if (!isNew && tpl) body.createdAt = tpl.createdAt;
      const newId = await saveWh(WH.templates, body, isNew ? undefined : id);
      await writeAudit(profile, isNew ? 'wh_template_create' : 'wh_template_save', `wh_email_templates/${newId}`, view.name);
      setDraft(null);
      setMsg({ ok: true, text: 'Template saved.' });
      if (isNew) navigate(`/wh/templates/${newId}`, { replace: true });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally { setBusy(false); }
  };

  const sendTest = async () => {
    const list = splitList(toValue);
    if (!list.length) { setSendMsg({ ok: false, text: 'Enter an email address.' }); return; }
    setSending(true);
    setSendMsg(null);
    try {
      await callWh('whTestEmail', {
        templateId: isNew ? undefined : id, subject: view.subject, htmlBody: view.htmlBody, textBody: view.textBody,
        to: list.join(','), submissionId: sampleId || undefined,
      });
      setSendMsg({ ok: true, text: `Test email sent to ${list.join(', ')}.` });
    } catch (e) {
      setSendMsg({ ok: false, text: (e as Error).message });
    } finally { setSending(false); }
  };

  const back = () => { if (!dirty || window.confirm('You have unsaved changes. Leave without saving?')) navigate('/wh/templates'); };

  const fieldRef = (k: FieldKey) => (el: HTMLInputElement | HTMLTextAreaElement | null) => { inputs.current[k] = el; };
  const renderedHtml = renderTemplate(view.htmlBody || '', sample, true);
  const renderedText = renderTemplate(view.textBody || '', sample, false);
  const renderedSubject = renderTemplate(view.subject || '', sample, false);
  const mono = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 13 };

  return (
    <WhShell
      title={isNew ? 'New email template' : view.name || 'Email template'}
      subtitle={<>{isNew ? 'Not saved yet' : `Updated ${fmtTime(tpl?.updatedAt)}`}{dirty && ' · unsaved changes'}</>}
      actions={<>
        <Button startIcon={<ArrowBack />} onClick={back}>Templates</Button>
        {dirty && !isNew && <Button color="inherit" onClick={() => setDraft(null)} disabled={busy}>Discard</Button>}
        <Button variant="contained" startIcon={<Save />} onClick={save} disabled={busy || (!dirty && !isNew)}>Save</Button>
      </>}
    >
      {msg && <Alert severity={msg.ok ? 'success' : 'error'} sx={{ mb: 2 }} onClose={() => setMsg(null)}>{msg.text}</Alert>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2 }}>
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={2}>
              <TextField label="Template name" value={view.name} onChange={(e) => edit({ name: e.target.value })} size="small"
                helperText="Only you and your team see this name." />
              <TextField label="Subject" value={view.subject} onChange={(e) => edit({ subject: e.target.value })} size="small"
                inputRef={fieldRef('subject')} onFocus={() => { lastField.current = 'subject'; }} />
            </Stack>
          </Paper>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2">Merge tags</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Click to insert at the cursor (in the subject, HTML or text box you clicked last). Empty fields print nothing.
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, maxHeight: 180, overflow: 'auto' }}>
              {[...LEAD_FIELDS, ...TRACKING_FIELDS, ...EXTRA_TAGS].map((f) => (
                <Chip key={f} size="small" label={`{{${f}}}`} onClick={() => insert(`{{${f}}}`)} sx={mono} />
              ))}
            </Box>
            <Typography variant="subtitle2" sx={{ mt: 1.5 }}>Snippets</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
              {SNIPPETS.map((s) => (
                <Tooltip key={s.label} title={s.text}><Chip size="small" color="primary" variant="outlined" label={s.label} onClick={() => insert(s.text)} /></Tooltip>
              ))}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              {'{{field}}'} prints a value safely. {'{{#if field}}…{{else}}…{{/if}}'} shows a part only when the field is filled in.
              {' {{all_fields_table}}'} prints every filled-in field as a table.
            </Typography>
          </Paper>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <TextField label="HTML body" value={view.htmlBody} onChange={(e) => edit({ htmlBody: e.target.value })} multiline minRows={14} maxRows={30}
              fullWidth inputRef={fieldRef('htmlBody')} onFocus={() => { lastField.current = 'htmlBody'; }}
              slotProps={{ htmlInput: { spellCheck: false, style: mono } }} />
            <Box sx={{ display: 'flex', alignItems: 'center', mt: 2, mb: 1 }}>
              <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>Plain-text version</Typography>
              <Button size="small" startIcon={<AutoFixHigh />}
                onClick={() => { if (!view.textBody.trim() || window.confirm('Replace the text version with one generated from the HTML?')) edit({ textBody: htmlToText(view.htmlBody) }); }}>
                Generate from HTML
              </Button>
            </Box>
            <TextField value={view.textBody} onChange={(e) => edit({ textBody: e.target.value })} multiline minRows={6} maxRows={20} fullWidth
              inputRef={fieldRef('textBody')} onFocus={() => { lastField.current = 'textBody'; }}
              helperText="Shown by email apps that don't display HTML. Also improves delivery (less likely to be marked as spam)."
              slotProps={{ htmlInput: { spellCheck: false, style: mono } }} />
          </Paper>
        </Stack>

        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' }, mb: 1 }}>
              <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>Live preview</Typography>
              <TextField select size="small" label="Preview with" value={sampleId} onChange={(e) => setSampleId(e.target.value)} sx={{ minWidth: 240 }}>
                <MenuItem value="">Sample lead (Jane Sample)</MenuItem>
                {(recent || []).map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {[s.first_name, s.last_name].filter(Boolean).join(' ') || s.email || s.phone1 || s.id} · {fmtTime(s.receivedAt)}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            <Typography variant="body2" sx={{ mb: 1, wordBreak: 'break-word' }}><b>Subject:</b> {renderedSubject || <i>(empty)</i>}</Typography>
            <Tabs value={previewTab} onChange={(_e, v) => setPreviewTab(v)} sx={{ minHeight: 36, '& .MuiTab-root': { minHeight: 36 } }}>
              <Tab label="HTML" />
              <Tab label="Text" />
            </Tabs>
            {previewTab === 0 ? (
              <Box component="iframe" title="Email preview" sandbox="" srcDoc={renderedHtml}
                sx={{ width: '100%', height: { xs: 480, lg: 640 }, border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: '#fff', mt: 1 }} />
            ) : (
              <Box component="pre" sx={{ ...mono, whiteSpace: 'pre-wrap', wordBreak: 'break-word', p: 1.5, mt: 1, bgcolor: 'action.hover', borderRadius: 1, maxHeight: 640, overflow: 'auto' }}>
                {renderedText}
              </Box>
            )}
          </Paper>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2">Send a test</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Sends what you see now (even unsaved) using the {sampleId ? 'selected submission' : 'sample lead'}, through the email connection from global settings.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField size="small" label="To" value={toValue} onChange={(e) => setTo(e.target.value)} sx={{ flexGrow: 1 }} />
              <Button variant="outlined" startIcon={sending ? <CircularProgress size={16} /> : <Send />} disabled={sending} onClick={sendTest}>Send test</Button>
            </Stack>
            {sendMsg && <Alert severity={sendMsg.ok ? 'success' : 'error'} sx={{ mt: 1 }}>{sendMsg.text}</Alert>}
          </Paper>
        </Stack>
      </Box>
    </WhShell>
  );
};

export default WhTemplateEditor;
