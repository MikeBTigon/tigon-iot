package com.tigongolfcarts.iot;

import android.app.Notification;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONObject;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * Echoes this phone's notifications to the TIGON IOT dashboard (works while the app is closed).
 * The person grants access once in Android Settings → Notification access.
 */
public class EchoListenerService extends NotificationListenerService {
    // Only Facebook / Messenger / Business Suite notifications are sent; the server keeps just messages,
    // chats and DMs (see functions/src/fbFilter.ts). TikTok, Gmail, phone/carrier etc. never leave the phone.
    private static final Set<String> FACEBOOK = new HashSet<>(Arrays.asList(
        "com.facebook.katana", "com.facebook.orca", "com.facebook.lite", "com.facebook.mlite",
        "com.facebook.pages.app"));
    private static final Set<String> SYSTEM = new HashSet<>(Arrays.asList(
        "android", "com.android.systemui", "com.android.vending", "com.google.android.gms",
        "com.android.providers.downloads"));

    // "Phone is on" check-in every 5 minutes (online hours + 24h timeline on the Users page), even with the app closed.
    private static final long PING_MS = 5 * 60 * 1000L;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable ping = new Runnable() {
        @Override
        public void run() {
            EchoStore.ping(EchoListenerService.this);
            handler.postDelayed(this, PING_MS);
        }
    };

    @Override
    public void onListenerConnected() {
        EchoStore.flush(this);
        handler.removeCallbacks(ping);
        handler.post(ping);
    }

    @Override
    public void onListenerDisconnected() {
        handler.removeCallbacks(ping);
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(ping);
        super.onDestroy();
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            if (!EchoStore.isConfigured(this)) return;
            String pkg = sbn.getPackageName();
            // Never echo our own notifications (they are echoes already) or Android's own.
            if (pkg == null || pkg.equals(getPackageName()) || SYSTEM.contains(pkg)) return;
            if (!FACEBOOK.contains(pkg)) return;
            Notification n = sbn.getNotification();
            if (n == null || sbn.isOngoing() || (n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
            Bundle ex = n.extras;
            if (ex == null) return;
            CharSequence title = ex.getCharSequence(Notification.EXTRA_TITLE);
            CharSequence text = ex.getCharSequence(Notification.EXTRA_BIG_TEXT);
            if (text == null) text = ex.getCharSequence(Notification.EXTRA_TEXT);
            if ((title == null || title.length() == 0) && (text == null || text.length() == 0)) return;

            JSONObject item = new JSONObject();
            item.put("key", sbn.getKey());
            item.put("pkg", pkg);
            item.put("app", appName(pkg));
            item.put("title", title == null ? "" : title.toString());
            item.put("text", text == null ? "" : text.toString());
            item.put("postedAt", sbn.getPostTime());
            item.put("cat", n.category == null ? "" : n.category);
            EchoStore.enqueue(this, item);
        } catch (Exception ignored) {
            // never crash the listener
        }
    }

    private String appName(String pkg) {
        try {
            PackageManager pm = getPackageManager();
            ApplicationInfo ai = pm.getApplicationInfo(pkg, 0);
            return String.valueOf(pm.getApplicationLabel(ai));
        } catch (Exception e) {
            return pkg;
        }
    }
}
