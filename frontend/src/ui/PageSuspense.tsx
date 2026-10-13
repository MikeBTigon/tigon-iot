import React, { Suspense } from 'react';
import { Box, CircularProgress } from '@mui/material';
import DashboardLayout from '../components/Layout/DashboardLayout';

const Spinner: React.FC = () => (
  <Box sx={{ py: 8, display: 'flex', justifyContent: 'center' }}>
    <CircularProgress aria-label="Loading" />
  </Box>
);

/** Signed-in page loading on demand: the app frame (menu, top bar) stays while a spinner shows. */
export const SignedInSuspense: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Suspense fallback={<DashboardLayout><Spinner /></DashboardLayout>}>{children}</Suspense>
);

/** Customer pages and sign-in pages: just a centered spinner while the page loads. */
export const PublicSuspense: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Suspense fallback={<Spinner />}>{children}</Suspense>
);
