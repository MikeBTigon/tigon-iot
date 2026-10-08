package com.tigongolfcarts.iot;

import android.app.Notification;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Telephony;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONObject;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Echoes this phone's notifications to the TIGON IOT dashboard (works while the app is closed).
 * The person grants access once in Android Settings → Notification access.
 */
public class EchoListenerService extends NotificationListenerService {
    // Facebook / Messenger / Business Suite notifications are sent; the server keeps just messages,
    // chats and DMs (see functions/src/fbFilter.ts). Also missed calls, and on the store's texting phone the
    // Messages app (customer replies). TikTok, Gmail, other calls etc. never leave the phone.
    private static final Set<String> FACEBOOK = new HashSet<>(Arrays.asList(
        "com.facebook.katana", "com.facebook.orca", "com.facebook.lite", "com.facebook.mlite",
        "com.facebook.pages.app"));
    private static final Set<String> SYSTEM = new HashSet<>(Arrays.asList(
        "android", "com.android.systemui", "com.android.vending", "com.google.android.gms",
        "com.android.providers.downloads"));
    // Missed calls (any team phone): the server texts the caller back when missed-call text-back is on.
    // Only notifications that say "missed" are sent; other call notifications never leave the phone.
    private static final Set<String> DIALERS = new HashSet<>(Arrays.asList(
        "com.google.android.dialer", "com.samsung.android.dialer", "com.android.dialer", "com.android.server.telecom",
        "com.android.phone", "com.samsung.android.incallui", "com.android.incallui", "com.samsung.android.app.telephonyui",
        "com.motorola.dialer", "com.oneplus.dialer", "com.oplus.dialer", "com.google.android.apps.googlevoice"));
    // Texts customers send to the store's texting phone (only forwarded on the texting phone).
    private static final Set<String> SMS_APPS = new HashSet<>(Arrays.asList(
        "com.google.android.apps.messaging", "com.samsung.android.messaging", "com.android.mms",
        "com.motorola.messaging", "com.oneplus.mms", "com.android.messaging"));
    private static final String CATEGORY_MISSED_CALL = "missed_call"; // Notification.CATEGORY_MISSED_CALL (API 30)
    private static final String EXTRA_IS_GROUP_CONVERSATION = "android.isGroupConversation"; // API 28

    // "Phone is on" check-in every 5 minutes (online hours + 24h timeline on the Users page), even with the app closed.
    // The store's texting phone checks in every 30 seconds to pick up texts to send.
    private static final long PING_MS = 5 * 60 * 1000L;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private long lastPing = 0;
    private final Runnable ping = new Runnable() {
        @Override
        public void run() {
            long now = System.currentTimeMillis();
            boolean texting = SmsSender.canSend(EchoListenerService.this);
            if (texting || now - lastPing >= PING_MS - 1000) {
                lastPing = now;
                EchoStore.ping(EchoListenerService.this);
            }
            handler.postDelayed(this, SmsSender.FAST_PING_MS);
        }
    };

    @Override
    public void onListenerConnected() {
        EchoStore.flush(this);
        handler.removeCallbacks(ping);
        lastPing = 0;
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
            boolean facebook = FACEBOOK.contains(pkg);
            boolean maybeCall = !facebook && isDialer(pkg);
            boolean maybeSms = !facebook && !maybeCall && SmsSender.isEnabled(this) && isSmsApp(pkg);
            Notification n = sbn.getNotification();
            if (n == null) return;
            String cat = n.category == null ? "" : n.category;
            if (!facebook && !maybeCall && !maybeSms) return;
            if (sbn.isOngoing() || (n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
            Bundle ex = n.extras;
            if (ex == null) return;
            CharSequence title = ex.getCharSequence(Notification.EXTRA_TITLE);
            CharSequence text = ex.getCharSequence(Notification.EXTRA_BIG_TEXT);
            if (text == null) text = ex.getCharSequence(Notification.EXTRA_TEXT);
            if ((title == null || title.length() == 0) && (text == null || text.length() == 0)) return;
            String all = ((title == null ? "" : title.toString()) + " " + (text == null ? "" : text.toString())).toLowerCase(Locale.ROOT);
            boolean missedCall = maybeCall && (CATEGORY_MISSED_CALL.equals(cat) || all.contains("missed"));
            if (missedCall && !EchoStore.prefs(this).getBoolean("missedCalls", true)) return;
            if (!facebook && !missedCall && !maybeSms) return;
            // Group chats on the texting phone are not customer replies.
            if (maybeSms && ex.getBoolean(EXTRA_IS_GROUP_CONVERSATION, false)) return;

            JSONObject item = new JSONObject();
            item.put("key", sbn.getKey());
            item.put("pkg", pkg);
            item.put("app", appName(pkg));
            item.put("title", title == null ? "" : title.toString());
            item.put("text", text == null ? "" : text.toString());
            item.put("postedAt", sbn.getPostTime());
            item.put("cat", cat);
            if (maybeSms) item.put("sms", true);
            if (missedCall) item.put("missedCall", true);
            EchoStore.enqueue(this, item);
        } catch (Exception ignored) {
            // never crash the listener
        }
    }

    private static boolean isDialer(String pkg) {
        return DIALERS.contains(pkg) || pkg.contains("dialer") || pkg.contains("telecom") || pkg.contains("incallui");
    }

    private boolean isSmsApp(String pkg) {
        if (SMS_APPS.contains(pkg)) return true;
        try {
            String def = Telephony.Sms.getDefaultSmsPackage(this);
            return def != null && def.equals(pkg);
        } catch (Exception e) {
            return false;
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
