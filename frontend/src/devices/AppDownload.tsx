import React from 'react';
import { APK_URL, PUBLIC_APP_PAGE, useLatestAppBuild } from './appBuild';
import { Alert, Box, Button, Chip, Paper, Step, StepContent, StepLabel, Stepper, Typography } from '@mui/material';
import { Android, Apple, Download as DownloadIcon } from '@mui/icons-material';
import { QRCodeSVG } from 'qrcode.react';

const STEPS: Array<{ label: string; text: React.ReactNode }> = [
  {
    label: 'Remove the old TIGON IOT app (one time only)',
    text: <>If the phone has the <b>old</b> TIGON IOT / worker app: press and hold its icon → <b>Uninstall</b>. The new app
      replaces it and does everything it did (notification echo, alerts) plus MP Assistant. Later updates install over the
      top — no uninstall needed again.</>,
  },
  {
    label: 'Download and install',
    text: <>Tap <b>Download the app</b> (or scan the QR code with the phone's camera). Open the downloaded file and tap
      <b> Install</b>. If Android asks, allow <b>Install unknown apps</b> for your browser/Files app, then tap Install again.</>,
  },
  {
    label: 'Set up the phone',
    text: <>On a computer open TIGON IOT → <b>Devices → Set up a phone</b>, pick the phone number (e.g. 0003), location,
      person and Facebook account. On the phone open TIGON IOT and tap <b>Scan setup QR code</b>. Done — no password.</>,
  },
  {
    label: 'Turn on notification echo',
    text: <>In the app: <b>Devices → Notification echo → Allow</b>, switch on TIGON IOT, come back, and tap
      <b> Send test</b>. The test shows on the dashboard with the phone's number.</>,
  },
];

/** "Get the phone app" content: download button, QR, version, install + setup steps. */
const AppDownload: React.FC = () => {
  const build = useLatestAppBuild();
  return (
    <Box>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
          <Box sx={{ flex: '1 1 280px' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Android color="success" />
              <Typography variant="h5" color="primary" sx={{ fontWeight: 600 }}>TIGON IOT for Android</Typography>
            </Box>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              One app for everything: MP Assistant, posting queue, leads, dashboard alerts and notification echo.
            </Typography>
            {build === undefined ? null : build ? (
              <Chip sx={{ mb: 2 }} label={`Version ${build.versionName} · ${new Date(build.builtAt).toLocaleDateString()}`} />
            ) : (
              <Alert severity="info" sx={{ mb: 2 }}>The app is published with the next website update (a few minutes after a merge).</Alert>
            )}
            <Box>
              <Button size="large" variant="contained" startIcon={<DownloadIcon />} href={APK_URL} download="TIGON-IOT.apk" disabled={!build}>
                Download the app
              </Button>
            </Box>
          </Box>
          <Box sx={{ textAlign: 'center' }}>
            <Box sx={{ display: 'inline-block', p: 1.5, bgcolor: 'white', borderRadius: 2 }}>
              <QRCodeSVG value={PUBLIC_APP_PAGE} size={160} />
            </Box>
            <Typography variant="caption" display="block" color="text.secondary">Scan with the phone camera<br />tigoniot.com/app</Typography>
          </Box>
        </Box>
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Install and set up a phone</Typography>
        <Stepper orientation="vertical" nonLinear activeStep={-1}>
          {STEPS.map((s) => (
            <Step key={s.label} expanded active>
              <StepLabel>{s.label}</StepLabel>
              <StepContent><Typography variant="body2">{s.text}</Typography></StepContent>
            </Step>
          ))}
        </Stepper>
      </Paper>

      <Alert severity="info" icon={<Apple />}>
        <b>iPhone:</b> the iPhone app needs an Apple Developer account and TestFlight/App Store before it can be installed.
        iPhones can't echo other apps' notifications (Apple doesn't allow it). Until then, iPhone users can open
        <b> tigoniot.com</b> in Safari and use Share → Add to Home Screen.
      </Alert>
    </Box>
  );
};

export default AppDownload;
