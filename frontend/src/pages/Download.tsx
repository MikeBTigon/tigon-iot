import React from 'react';
import DashboardLayout from '../components/Layout/DashboardLayout';
import AppDownload from '../devices/AppDownload';

/** Signed-in Download page (sidebar → Download App). The same content is public at /app. */
const Download: React.FC = () => (
  <DashboardLayout>
    <AppDownload />
  </DashboardLayout>
);

export default Download;
