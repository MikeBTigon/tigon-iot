import { useMemo } from 'react';
import LeadDialog from './LeadDialog';
import type { LeadChannel } from '../growthTypes';

/** The parts of an IoT notification a lead can be made from. */
export interface LeadSourceNotification {
  id: string;
  text?: string;
  sourceDeviceName?: string;
  /** Device doc id of the worker phone, when the notification carries one. */
  deviceId?: string;
  sourceDeviceId?: string;
}

function guessChannel(text: string): LeadChannel {
  if (/whats\s?app/i.test(text)) return 'whatsapp';
  if (/facebook|messenger|marketplace/i.test(text)) return 'facebook';
  if (/instagram/i.test(text)) return 'instagram';
  return 'other';
}

/** "Rowan • You have 5 updates" → "Rowan". */
function guessName(text: string): string {
  const i = text.indexOf(' • ');
  if (i <= 0) return '';
  const name = text.slice(0, i).trim();
  return name.length <= 40 ? name : '';
}

/** "Make lead" from an IoT dashboard notification: prefilled lead dialog (channel, name, notes, attribution). */
export default function NewLeadDialog({ notification, onClose }: { notification: LeadSourceNotification | null; onClose: () => void }) {
  const initial = useMemo(() => {
    if (!notification) return undefined;
    const text = notification.text || '';
    const deviceId = notification.deviceId || notification.sourceDeviceId;
    return {
      name: guessName(text),
      channel: guessChannel(`${text} ${notification.sourceDeviceName || ''}`),
      notes: notification.sourceDeviceName ? `${text}\n(from ${notification.sourceDeviceName})` : text,
      notificationId: notification.id,
      ...(deviceId ? { deviceId } : {}),
    };
  }, [notification]);

  return (
    <LeadDialog
      open={!!notification}
      onClose={onClose}
      initial={initial}
      notificationId={notification?.id}
    />
  );
}
