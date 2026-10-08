import type { ReactNode } from 'react';
import {
  AddAPhoto, AdminPanelSettings, Calculate, Analytics, BarChart, CalendarMonth, CloudUpload, Collections, Description, EmojiEvents,
  FileDownload, Groups, HelpOutline, Home, Insights, Link as LinkIcon, ListAlt, ManageAccounts, MonitorHeart, People,
  PersonSearch, Place, Search, Settings, Storefront, ViewModule, Today, Event, Sms, RequestQuote, SwapHoriz, CreditScore,
  HourglassBottom, CardGiftcard, FilterAlt, StarRate, Tune,
} from '@mui/icons-material';

const ICONS: Record<string, ReactNode> = {
  '/mp': <Home />,
  '/mp/find': <Search />,
  '/mp/browse': <ViewModule />,
  '/mp/locations': <Place />,
  '/mp/new': <AddAPhoto />,
  '/mp/finance': <Calculate />,
  '/mp/queue': <ListAlt />,
  '/mp/calendar': <CalendarMonth />,
  '/mp/storefront': <Storefront />,
  '/mp/links': <LinkIcon />,
  '/mp/templates': <Description />,
  '/mp/leads': <PersonSearch />,
  '/mp/customers': <People />,
  '/mp/insights': <Insights />,
  '/mp/analytics': <Analytics />,
  '/mp/team': <EmojiEvents />,
  '/mp/profiles': <Groups />,
  '/mp/assets': <Collections />,
  '/mp/accounts': <ManageAccounts />,
  '/mp/import': <CloudUpload />,
  '/mp/status': <MonitorHeart />,
  '/mp/exports': <FileDownload />,
  '/mp/settings': <Settings />,
  '/mp/help': <HelpOutline />,
  '/mp/today': <Today />,
  '/mp/appointments': <Event />,
  '/mp/texts': <Sms />,
  '/mp/quotes': <RequestQuote />,
  '/mp/trade-ins': <SwapHoriz />,
  '/mp/prequal': <CreditScore />,
  '/mp/aged': <HourglassBottom />,
  '/mp/referrals': <CardGiftcard />,
  '/mp/funnel': <FilterAlt />,
  '/mp/reviews': <StarRate />,
  '/mp/sales-settings': <Tune />,
};

/** Icon for an MP nav path (generic chart icon when none is set). */
export const navIcon = (path: string): ReactNode => ICONS[path] ?? <BarChart />;

/** Icon for an MP nav group. */
export const groupIcon = (key: string): ReactNode =>
  key === 'nav.admin' ? <AdminPanelSettings fontSize="small" /> : null;
