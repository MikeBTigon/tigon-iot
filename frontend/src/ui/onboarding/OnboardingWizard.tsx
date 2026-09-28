import React, { useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, LinearProgress, Step, StepButton, Stepper, TextField, Typography,
} from '@mui/material';
import { CameraAlt, CheckCircle, Devices, Download, PlaylistAddCheck } from '@mui/icons-material';
import MpShell from '../../mp/components/MpShell';
import HelpTip from '../../mp/help/HelpTip';
import PhoneAlertsCard from '../../native/PhoneAlertsCard';
import { isNativeApp } from '../../native/platform';
import { useAuth } from '../../context/AuthContext';
import { useMp } from '../../mp/MpDataContext';
import { suggestedQueue } from '../../mp/cartUtils';
import { useT } from '../../i18n';
import PreferencesControls from '../PreferencesControls';
import { saveUserPref } from '../prefs';
import { useSetupProgress } from './useSetupProgress';

const STEP_KEYS = ['onboarding.step1', 'onboarding.step2', 'onboarding.step3', 'onboarding.step4'] as const;

const Done: React.FC<{ text: string }> = ({ text }) => (
  <Alert severity="success" icon={<CheckCircle />} sx={{ mb: 2 }}>{text}</Alert>
);

/** Profile step: display name + language/theme. Keyed by uid so it starts from the saved name. */
const ProfileStep: React.FC<{ onSaved: () => void }> = ({ onSaved }) => {
  const t = useT();
  const { profile, saveProfile } = useMp();
  const [name, setName] = useState(profile?.name || '');
  // Not awaited: offline, Firestore queues the write and only resolves once it reaches the server.
  const save = () => {
    if (name.trim() && name.trim() !== profile?.name) {
      saveProfile({ name: name.trim(), legacyId: profile?.legacyId }).catch((e) => console.error('Profile not saved', e));
    }
    onSaved();
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 480 }}>
      <Typography color="text.secondary">{t('onboarding.profileIntro')}</Typography>
      <TextField label={t('onboarding.displayName')} value={name} onChange={(e) => setName(e.target.value)} fullWidth />
      <PreferencesControls />
      <Box>
        <Button variant="contained" onClick={save} disabled={!name.trim()}>{t('onboarding.saveProfile')}</Button>
      </Box>
    </Box>
  );
};

/**
 * /mp/welcome — 4-step setup guide: profile, pair a phone, alerts, first listing.
 * Every step can be skipped; finishing sets mp_users/{uid}.prefs.onboardingDone = true.
 */
const OnboardingWizard: React.FC = () => {
  const t = useT();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { profile, carts, userKeys, brokenPhotos } = useMp();
  const progress = useSetupProgress(true);
  const [step, setStep] = useState(0);
  const native = isNativeApp();

  const suggestion = useMemo(() => suggestedQueue(carts, userKeys, brokenPhotos, 1)[0], [carts, userKeys, brokenPhotos]);
  const doneFlags = [progress.profile, native || progress.phone, progress.alerts, progress.listing];

  // Not awaited (queued while offline); saveUserPref logs failures.
  const finish = () => {
    if (currentUser && profile) void saveUserPref(currentUser.uid, 'onboardingDone', true);
    navigate('/mp');
  };

  const next = () => (step < 3 ? setStep(step + 1) : finish());

  let body: React.ReactNode = null;
  if (step === 0) {
    body = <ProfileStep key={profile?.uid || 'none'} onSaved={() => setStep(1)} />;
  } else if (step === 1) {
    body = native ? (
      <>
        <Done text={t('onboarding.pairedNative')} />
        <Typography color="text.secondary">{t('onboarding.pairedNativeHint')}</Typography>
      </>
    ) : (
      <>
        {progress.phone && <Done text={t('onboarding.pairedWeb', { count: progress.phones })} />}
        <Typography color="text.secondary" sx={{ mb: 2 }}>{t('onboarding.pairIntro')}</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button variant="contained" startIcon={<Devices />} component={RouterLink} to="/devices">{t('onboarding.pairOpen')}</Button>
          <Button variant="outlined" startIcon={<Download />} component={RouterLink} to="/download">{t('onboarding.pairDownload')}</Button>
        </Box>
      </>
    );
  } else if (step === 2) {
    body = native ? (
      <>
        <Typography color="text.secondary" sx={{ mb: 2 }}>{t('onboarding.alertsIntroNative')}</Typography>
        <PhoneAlertsCard />
      </>
    ) : (
      <>
        {progress.alerts && <Done text={t('onboarding.alertsOn', { count: progress.alertPhones })} />}
        <Typography color="text.secondary">{t('onboarding.alertsIntroWeb')}</Typography>
      </>
    );
  } else {
    body = (
      <>
        {progress.listing && <Done text={t('onboarding.listingDone')} />}
        <Typography color="text.secondary" sx={{ mb: 2 }}>{t('onboarding.listingIntro')}</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button variant="contained" startIcon={<CameraAlt />} component={RouterLink} to="/mp/new">{t('onboarding.snapToList')}</Button>
          <Button
            variant="outlined"
            startIcon={<PlaylistAddCheck />}
            component={RouterLink}
            to={suggestion ? `/mp/prepare/${suggestion.docId}` : '/mp'}
          >
            {t('onboarding.suggested')}
          </Button>
        </Box>
      </>
    );
  }

  const tipFor = ['', 'pair-phone', 'troubleshooting', 'snap-to-list'] as const;

  return (
    <MpShell>
      <Card sx={{ maxWidth: 820 }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="h5" component="h2" gutterBottom>{t('onboarding.title')}</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>{t('onboarding.subtitle')}</Typography>
          <LinearProgress
            variant="determinate"
            value={((step + 1) / 4) * 100}
            aria-label={t('onboarding.progress')}
            sx={{ height: 8, borderRadius: 4, mb: 1 }}
          />
          <Typography variant="caption" color="text.secondary">{t('common.stepOf', { step: step + 1, total: 4 })}</Typography>
          <Stepper nonLinear activeStep={step} sx={{ my: 2, display: { xs: 'none', sm: 'flex' } }}>
            {STEP_KEYS.map((k, i) => (
              <Step key={k} completed={doneFlags[i]}>
                <StepButton onClick={() => setStep(i)}>{t(k)}</StepButton>
              </Step>
            ))}
          </Stepper>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: { xs: 2, sm: 0 }, mb: 1.5 }}>
            <Typography variant="h6" component="h3">{t(STEP_KEYS[step])}</Typography>
            {tipFor[step] && <HelpTip article={tipFor[step] as 'pair-phone' | 'troubleshooting' | 'snap-to-list'} />}
          </Box>
          <Box sx={{ minHeight: 160 }}>{body}</Box>
          <Box sx={{ display: 'flex', gap: 1, mt: 3, flexWrap: 'wrap' }}>
            <Button disabled={step === 0} onClick={() => setStep(step - 1)}>{t('common.back')}</Button>
            <Box sx={{ flexGrow: 1 }} />
            {step < 3 && <Button onClick={next}>{t('common.skip')}</Button>}
            {step > 0 && (
              <Button variant="contained" onClick={next}>
                {step < 3 ? t('common.next') : t('onboarding.finish')}
              </Button>
            )}
          </Box>
        </CardContent>
      </Card>
    </MpShell>
  );
};

export default OnboardingWizard;
