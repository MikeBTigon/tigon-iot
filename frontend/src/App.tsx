import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ThemeModeProvider from './ui/ThemeModeProvider';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Devices from './pages/Devices';
import Settings from './pages/Settings';
import Download from './pages/Download';
import GetApp from './pages/GetApp';
import { MpDataProvider } from './mp/MpDataContext';
import { mpRoutes, publicRoutes } from './mp/routes';
import NativeBridge from './native/NativeBridge';
import VerifyEmailGate from './components/VerifyEmailGate';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { currentUser } = useAuth();
  
  if (!currentUser) {
    return <Navigate to="/login" />;
  }
  
  if (!currentUser.emailVerified) {
    return <VerifyEmailGate user={currentUser} />;
  }
  
  return <>{children}</>;
};

function AppContent() {
  return (
    <Router>
      <NativeBridge />
      <Routes>
  <Route path="/login" element={<Login />} />
  <Route path="/register" element={<Register />} />
  <Route
    path="/dashboard"
    element={
      <ProtectedRoute>
        <Dashboard />
      </ProtectedRoute>
    }
  />
  <Route
    path="/devices"
    element={
      <ProtectedRoute>
        <Devices />
      </ProtectedRoute>
    }
  />
  <Route
    path="/settings"
    element={
      <ProtectedRoute>
        <Settings />
      </ProtectedRoute>
    }
  />
<Route
  path="/download"
  element={
    <ProtectedRoute>
      <Download />
    </ProtectedRoute>
  }
/>
  {mpRoutes((el) => <ProtectedRoute>{el}</ProtectedRoute>)}
  <Route path="/app" element={<GetApp />} />
  {publicRoutes()}
  <Route path="/" element={<Navigate to="/dashboard" />} />
</Routes>
    </Router>
  );
}

function App() {
  return (
    <AuthProvider>
      <MpDataProvider>
        {/* Theme (light/dark, large text) and language follow the user's saved preferences. */}
        <ThemeModeProvider>
          <AppContent />
        </ThemeModeProvider>
      </MpDataProvider>
    </AuthProvider>
  );
}

export default App;