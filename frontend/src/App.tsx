import { lazy, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import useMediaQuery from '@mui/material/useMediaQuery';
import { AuthProvider, useAuth } from './context/AuthContext';
import ThemeModeProvider from './ui/ThemeModeProvider';
import { buildTheme } from './theme/theme';
import { readLocal } from './ui/prefs';
import { MpDataProvider } from './mp/MpDataContext';
import { mpRoutes, publicRoutes } from './mp/routes';
import { HOME_PATH } from './mp/navRegistry';
import NativeBridge from './native/NativeBridge';
import VerifyEmailGate from './components/VerifyEmailGate';
import { ConfirmProvider } from './ui/ConfirmDialog';
import { PublicSuspense, SignedInSuspense } from './ui/PageSuspense';
import PendingApproval from './auth/PendingApproval';
import { isBlockedMember, useMemberStatus } from './auth/useMemberStatus';

// Every page loads on demand (own chunk), so the first screen downloads only what it needs.
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Devices = lazy(() => import('./pages/Devices'));
const Users = lazy(() => import('./pages/Users'));
const UserDetail = lazy(() => import('./pages/UserDetail'));
const Settings = lazy(() => import('./pages/Settings'));
const Download = lazy(() => import('./pages/Download'));
const GetApp = lazy(() => import('./pages/GetApp'));
const Requests = lazy(() => import('./pages/Requests'));

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { currentUser } = useAuth();
  // Team approval: people waiting for approval (or turned off) see PendingApproval instead of any page.
  // 'none' (no profile yet) passes through so the profile setup can create the pending profile.
  const member = useMemberStatus({ reloadOnApproval: true });

  if (!currentUser) {
    return <Navigate to="/login" />;
  }

  if (!currentUser.emailVerified) {
    return <VerifyEmailGate user={currentUser} />;
  }

  if (isBlockedMember(member)) return <PendingApproval status={member} />;

  return <>{children}</>;
};

const guard = (el: React.ReactNode) => <ProtectedRoute>{el}</ProtectedRoute>;
const signedIn = (el: React.ReactNode) => guard(<SignedInSuspense>{el}</SignedInSuspense>);
const plain = (el: React.ReactNode) => <PublicSuspense>{el}</PublicSuspense>;

/** The signed-in app: auth, team data, the user's theme/language, confirm boxes, phone-app bridge. */
function SignedInApp() {
  return (
    <AuthProvider>
      <MpDataProvider>
        {/* Theme (light/dark, large text) and language follow the user's saved preferences. */}
        <ThemeModeProvider>
          <ConfirmProvider>
            <NativeBridge />
            <Routes>
              <Route path="/login" element={plain(<Login />)} />
              <Route path="/register" element={plain(<Register />)} />
              <Route path="/dashboard" element={signedIn(<Dashboard />)} />
              <Route path="/devices" element={signedIn(<Devices />)} />
              <Route path="/users" element={signedIn(<Users />)} />
              <Route path="/users/:uid" element={signedIn(<UserDetail />)} />
              <Route path="/requests" element={signedIn(<Requests />)} />
              <Route path="/settings" element={signedIn(<Settings />)} />
              <Route path="/download" element={signedIn(<Download />)} />
              {mpRoutes(guard)}
              {/* Everyone starts on Today; the phone-alerts dashboard stays at /dashboard (Reports). */}
              <Route path="/" element={<Navigate to={HOME_PATH} replace />} />
              <Route path="*" element={<Navigate to={HOME_PATH} replace />} />
            </Routes>
          </ConfirmProvider>
        </ThemeModeProvider>
      </MpDataProvider>
    </AuthProvider>
  );
}

/** Customer pages (storefront, quotes, booking, trade-in, pre-qualification, referrals, similar carts, get the app):
 * no sign-in, no team data — just the theme (device light/dark setting). */
function PublicFrame({ children }: { children: React.ReactNode }) {
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)', { noSsr: true });
  const stored = readLocal('tigon.theme');
  const mode = stored === 'light' || stored === 'dark' ? stored : systemDark ? 'dark' : 'light';
  const theme = useMemo(() => buildTheme({ mode, largeText: readLocal('tigon.largeText') === '1' }), [mode]);
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
      {children}
    </ThemeProvider>
  );
}

const publicPage = (el: React.ReactNode) => <PublicFrame>{el}</PublicFrame>;

function App() {
  return (
    <Router>
      <Routes>
        {publicRoutes(publicPage)}
        <Route path="/app" element={publicPage(plain(<GetApp />))} />
        <Route path="*" element={<SignedInApp />} />
      </Routes>
    </Router>
  );
}

export default App;
