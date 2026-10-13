import type { ReactNode } from 'react';
import {
  AccountTree, AddAPhoto, AddLink, AdminPanelSettings, Analytics, Assessment, BarChart, Build, Calculate, CalendarMonth,
  CardGiftcard, CloudUpload, Collections, CreditScore, Dashboard, Description, Devices, Download, Email, EmojiEvents, Event,
  FileDownload, FilterAlt, Groups, HelpOutline, HourglassBottom, Inbox, Insights, Inventory2, Language, Link as LinkIcon,
  ListAlt, ManageAccounts, MonitorHeart, NotificationImportant, People, PersonSearch, Place, RateReview, RequestQuote,
  School, Search, Settings, Share, Sms, StarRate, Storefront, SwapHoriz, Today, Tune, ViewModule, Webhook, Web,
} from '@mui/icons-material';

const ICONS: Record<string, ReactNode> = {
  '/mp/today': <Today />,
  '/mp/find': <Search />,
  '/mp/browse': <ViewModule />,
  '/mp/locations': <Place />,
  '/mp/aged': <HourglassBottom />,
  '/mp/new': <AddAPhoto />,
  '/mp/leads': <PersonSearch />,
  '/mp/customers': <People />,
  '/mp/texts': <Sms />,
  '/mp/appointments': <Event />,
  '/mp/quotes': <RequestQuote />,
  '/mp/trade-ins': <SwapHoriz />,
  '/mp/prequal': <CreditScore />,
  '/mp/referrals': <CardGiftcard />,
  '/mp': <Storefront />,
  '/mp/queue': <ListAlt />,
  '/mp/calendar': <CalendarMonth />,
  '/mp/storefront': <Web />,
  '/mp/links': <LinkIcon />,
  '/mp/templates': <Description />,
  '/mp/assets': <Collections />,
  '/mp/finance': <Calculate />,
  '/mp/help': <HelpOutline />,
  '/mp/welcome': <School />,
  '/download': <Download />,
  '/requests': <RateReview />,
  '/mp/analytics': <Analytics />,
  '/mp/insights': <Insights />,
  '/mp/team': <EmojiEvents />,
  '/mp/funnel': <FilterAlt />,
  '/mp/reviews': <StarRate />,
  '/dashboard': <Dashboard />,
  '/wh': <Assessment />,
  '/wh/websites': <Language />,
  '/wh/new': <AddLink />,
  '/wh/webhooks': <Webhook />,
  '/wh/flows': <AccountTree />,
  '/wh/submissions': <Inbox />,
  '/wh/templates': <Email />,
  '/wh/triage': <NotificationImportant />,
  '/wh/settings': <Tune />,
  '/users': <Groups />,
  '/devices': <Devices />,
  '/mp/accounts': <ManageAccounts />,
  '/mp/import': <CloudUpload />,
  '/mp/status': <MonitorHeart />,
  '/mp/exports': <FileDownload />,
  '/settings': <Settings />,
  '/mp/settings': <Tune />,
  '/mp/sales-settings': <Tune />,
};

const GROUP_ICONS: Record<string, ReactNode> = {
  'nav.groupToday': <Today fontSize="small" />,
  'nav.inventory': <Inventory2 fontSize="small" />,
  'nav.leadsCustomers': <PersonSearch fontSize="small" />,
  'nav.post': <Share fontSize="small" />,
  'nav.tools': <Build fontSize="small" />,
  'nav.reports': <BarChart fontSize="small" />,
  'nav.websiteForms': <Webhook fontSize="small" />,
  'nav.teamAdmin': <AdminPanelSettings fontSize="small" />,
};

/** Icon for a nav path (generic chart icon when none is set). */
export const navIcon = (path: string): ReactNode => ICONS[path] ?? <BarChart />;

/** Icon for a nav group. */
export const groupIcon = (key: string): ReactNode => GROUP_ICONS[key] ?? null;
