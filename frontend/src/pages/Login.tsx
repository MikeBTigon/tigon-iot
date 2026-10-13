import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import PairThisPhone from '../native/PairThisPhone';
import { isNativeApp } from '../native/platform';
import {
  Box,
  Button,
  TextField,
  Typography,
  Container,
  Paper,
  Alert,
  InputAdornment,
  IconButton,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { authErrorMessage, cleanEmail } from '../context/authErrors';
import { useT } from '../i18n';
import LanguageMenu from '../i18n/LanguageMenu';

const Login: React.FC = () => {
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login, resetPassword } = useAuth();
  const [info, setInfo] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const em = cleanEmail(email);
    setEmail(em);
    if (!em.endsWith('@tigongolfcarts.com')) {
      setError(t('auth.useCompanyEmail'));
      return;
    }

    try {
      setError('');
      setInfo('');
      setLoading(true);
      await login(em, password);
      navigate('/dashboard');
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const forgot = async () => {
    const em = cleanEmail(email);
    setEmail(em);
    if (!em.endsWith('@tigongolfcarts.com')) {
      setError(t('auth.forgotNeedsEmail'));
      return;
    }
    try {
      setError('');
      await resetPassword(em);
      setInfo(t('auth.resetSent', { email: em }));
    } catch (err) {
      setError(authErrorMessage(err));
    }
  };

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Paper elevation={3} sx={{ p: 4, width: '100%', position: 'relative' }}>
          <Box sx={{ position: 'absolute', top: 8, right: 8 }}><LanguageMenu /></Box>
          <Typography component="h1" variant="h4" align="center" gutterBottom color="primary">
            TIGON IOT
          </Typography>
          <Typography variant="body2" align="center" color="text.secondary" sx={{ mb: 3 }}>
            {t('auth.loginSubtitle')}
          </Typography>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {info && <Alert severity="success" sx={{ mb: 2 }}>{info}</Alert>}

          <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label={t('auth.email')}
              name="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              helperText={t('auth.emailHelpLogin')}
              inputProps={{ autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false, inputMode: 'email' }}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label={t('auth.password')}
              type={showPassword ? 'text' : 'password'}
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
              disabled={loading}
            >
              {loading ? t('auth.loggingIn') : t('auth.login')}
            </Button>
            <Box sx={{ textAlign: 'center', mb: 1 }}>
              <Button size="small" onClick={forgot} disabled={loading}>{t('auth.forgot')}</Button>
              {!isNativeApp() && <Button size="small" href="/app">{t('auth.getApp')}</Button>}
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Link to="/register" style={{ textDecoration: 'none' }}>
                <Typography variant="body2" color="primary">
                  {t('auth.noAccount')}
                </Typography>
              </Link>
            </Box>
          </Box>
          <PairThisPhone />
        </Paper>
      </Box>
    </Container>
  );
};
export default Login;
