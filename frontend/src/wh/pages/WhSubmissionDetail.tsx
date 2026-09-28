import React, { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, CircularProgress, Collapse, Paper, Stack, Typography,
} from '@mui/material';
import { Block, ExpandLess, ExpandMore, Replay, RestartAlt, VerifiedUser } from '@mui/icons-material';
import WhShell from '../components/WhShell';
import StatusChip from '../components/StatusChip';
import LeadTimeline from '../components/LeadTimeline';
import { errText, leadName, markSpam, useGlobal, useMasterFlow } from '../components/Wh1Hooks';
import { useMp } from '../../mp/MpDataContext';
import { callWh, fmtTime, useWhDoc } from '../data';
import { fieldLabel } from '../shared';
import { IMAGE_FIELDS, LEAD_FIELDS, TRACKING_FIELDS, WH } from '../types';
import type { WhDomain, WhFlow, WhStepRun, WhSubmission, WhWebhook } from '../types';

const STD = [...LEAD_FIELDS, ...TRACKING_FIELDS] as readonly string[];
const META_KEYS = new Set(['id', 'webhookId', 'domainId', 'flowId', 'status', 'isDuplicate', 'isSpam', 'spamReason', 'duplicateOf', 'rawPayload',
  'receivedAt', 'processedAt', 'cursor', 'nextRunAt', 'dmsLeadId', 'mpLeadId', 'stepsOk', 'stepsFailed', 'leaseUntil', 'hasDead', 'reviewedBy',
  'reviewedAt', 'notes', 'createdAt', 'updatedAt', 'test', 'isTest']);

const isUrl = (v: string) => /^https?:\/\//i.test(v);

const Detail: React.FC<{ sub: WhSubmission }> = ({ sub }) => {
  const { profile } = useMp();
  const global = useGlobal();
  const master = useMasterFlow(global);
  const domain = useWhDoc<WhDomain>(WH.domains, sub.domainId);
  const webhook = useWhDoc<WhWebhook>(WH.webhooks, sub.webhookId);
  const flow = useWhDoc<WhFlow>(WH.flows, sub.flowId);
  const [showRaw, setShowRaw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const replay = async (payload: Record<string, unknown>, label: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await callWh<Record<string, unknown>>('whReplay', { submissionId: sub.id, ...payload });
      const note = res && typeof res === 'object' && typeof res.message === 'string' ? ` ${res.message}` : '';
      setMsg({ ok: true, text: `${label} — queued. The timeline below updates as the steps run.${note}` });
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(false);
    }
  };

  const rerunAll = () => {
    if (!window.confirm('Run this lead through all its steps again? Emails, sheet rows, DMS leads etc. will be sent again.')) return;
    replay({ mode: 'all' }, 'Re-running everything');
  };

  const rerunStep = (r: WhStepRun) => {
    if (!window.confirm(`Run the step "${r.stepType}" again for this lead?`)) return;
    replay({ mode: 'step', stepId: r.stepId, flowKind: r.flowKind }, 'Re-running the step');
  };

  const toggleSpam = async () => {
    const spam = !sub.isSpam;
    setBusy(true);
    setMsg(null);
    try {
      await markSpam(sub, spam, profile);
      setBusy(false);
      if (!spam && window.confirm('Marked as not spam. Send this lead through its flow now (emails, sheet, DMS…)?')) {
        await replay({ mode: 'all' }, 'Sending the lead through its flow');
      } else {
        setMsg({ ok: true, text: spam ? 'Marked as spam.' : 'Marked as not spam.' });
      }
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
      setBusy(false);
    }
  };

  const data = sub as unknown as Record<string, unknown>;
  const extras = Object.keys(data).filter((k) => !STD.includes(k) && !META_KEYS.has(k) && !k.startsWith('_') && typeof data[k] !== 'object');
  const fields = [...STD, ...extras].filter((k) => !(IMAGE_FIELDS as readonly string[]).includes(k) && data[k] !== undefined && data[k] !== '');
  const images = IMAGE_FIELDS.map((f) => ({ f, v: String(data[f] || '') })).filter((x) => x.v);
  const failed = (sub.stepsFailed || 0) > 0 || sub.hasDead || sub.status === 'failed' || sub.status === 'partial';

  return (
    <WhShell
      title={leadName(sub)}
      subtitle={<>
        {domain ? <RouterLink to={`/wh/websites/${domain.id}`}>{domain.name}</RouterLink> : 'Unknown website'}
        {' · '}{webhook ? <RouterLink to={`/wh/webhooks/${webhook.id}`}>{webhook.formName}</RouterLink> : (sub.form_name || 'form')}
        {' · '}received {fmtTime(sub.receivedAt)}
      </>}
      actions={(
        <>
          <Button variant="contained" startIcon={<Replay />} onClick={() => replay({ mode: 'failed' }, 'Retrying failed steps')} disabled={busy || !failed}>Retry failed steps</Button>
          <Button variant="outlined" startIcon={<RestartAlt />} onClick={rerunAll} disabled={busy}>Re-run everything</Button>
          <Button variant="outlined" color={sub.isSpam ? 'success' : 'inherit'} startIcon={sub.isSpam ? <VerifiedUser /> : <Block />} onClick={toggleSpam} disabled={busy}>
            {sub.isSpam ? 'Not spam' : 'Mark as spam'}
          </Button>
        </>
      )}
    >
      {msg && <Alert severity={msg.ok ? 'success' : 'error'} sx={{ mb: 2 }} onClose={() => setMsg(null)}>{msg.text}</Alert>}
      <Stack spacing={2}>
        <Paper sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 2 }}>
            <StatusChip status={sub.status} size="medium" />
            {sub.isSpam && sub.spamReason && <Typography variant="body2" color="text.secondary">Spam: {sub.spamReason}</Typography>}
            {sub.isDuplicate && (
              <Typography variant="body2" color="text.secondary">
                Duplicate{sub.duplicateOf ? <> of <RouterLink to={`/wh/submissions/${sub.duplicateOf}`}>an earlier lead</RouterLink></> : ''}
              </Typography>
            )}
            <Box sx={{ flexGrow: 1 }} />
            {sub.dmsLeadId && <Typography variant="body2">DMS lead id: <b>{sub.dmsLeadId}</b></Typography>}
            {sub.mpLeadId && <Button size="small" variant="outlined" component={RouterLink} to={`/mp/leads?lead=${sub.mpLeadId}`}>Open in MP Leads</Button>}
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '160px 1fr' }, columnGap: 2, rowGap: 0.5 }}>
            {fields.map((k) => {
              const v = String(data[k]);
              return (
                <React.Fragment key={k}>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: { xs: 1, sm: 0 } }}>{fieldLabel(k)}</Typography>
                  <Typography variant="body2" sx={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                    {k === 'email' ? <a href={`mailto:${v}`}>{v}</a> : k === 'phone1' || k === 'phone2' ? <a href={`tel:${v}`}>{v}</a> :
                      isUrl(v) ? <a href={v} target="_blank" rel="noreferrer">{v}</a> : v}
                  </Typography>
                </React.Fragment>
              );
            })}
          </Box>
          {images.length > 0 && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
              {images.map(({ f, v }) => (
                <Box key={f} component="a" href={v} target="_blank" rel="noreferrer" sx={{ display: 'block' }}>
                  <Box component="img" src={v} alt={fieldLabel(f)} sx={{ width: 160, height: 120, objectFit: 'cover', borderRadius: 1, border: 1, borderColor: 'divider' }} />
                </Box>
              ))}
            </Box>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
            Id {sub.id} · processed {fmtTime(sub.processedAt)} · steps OK {sub.stepsOk ?? 0}, failed {sub.stepsFailed ?? 0}
            {sub.nextRunAt ? ` · next run ${fmtTime(sub.nextRunAt)}` : ''}
          </Typography>
          <Button size="small" sx={{ mt: 1 }} onClick={() => setShowRaw(!showRaw)} endIcon={showRaw ? <ExpandLess /> : <ExpandMore />}>Raw data received</Button>
          <Collapse in={showRaw}>
            <Box component="pre" sx={{ m: 0, mt: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1, fontSize: 12, overflow: 'auto', maxHeight: 400 }}>
              {JSON.stringify(sub.rawPayload || {}, null, 2)}
            </Box>
          </Collapse>
        </Paper>

        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ fontSize: 18, mb: 1 }}>What happened to this lead</Typography>
          <LeadTimeline submissionId={sub.id} webhookFlow={flow} masterFlow={master} onRerunStep={rerunStep} busy={busy} />
        </Paper>
      </Stack>
    </WhShell>
  );
};

/** Per-lead page: all fields, images, raw payload and the step-by-step timeline with replay buttons. */
const WhSubmissionDetail: React.FC = () => {
  const { id } = useParams();
  const sub = useWhDoc<WhSubmission>(WH.submissions, id);
  if (sub === undefined) return <WhShell title="Lead"><CircularProgress aria-label="Loading" /></WhShell>;
  if (!sub) return <WhShell title="Lead"><Alert severity="warning">This lead was not found (it may have been deleted by the retention rule). <RouterLink to="/wh/submissions">Back to submissions</RouterLink></Alert></WhShell>;
  return <Detail sub={sub} />;
};

export default WhSubmissionDetail;
