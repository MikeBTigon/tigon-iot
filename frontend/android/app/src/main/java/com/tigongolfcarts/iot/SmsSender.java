package com.tigongolfcarts.iot;

import android.Manifest;
import android.app.Activity;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.telephony.SmsManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Iterator;

/**
 * Texting phone: sends the store's texts from this phone's own number.
 * The server hands out texts on each check-in (mpEcho ping with canSms=true → "sms": [{id, to, body}]).
 * Android reports each text's result through a "sent" PendingIntent (SmsSentReceiver); results are posted
 * back on the next check-in ("smsResults": [{id, ok, error}]).
 */
final class SmsSender {
    static final String ACTION_SENT = "com.tigongolfcarts.iot.SMS_SENT";
    /** Check-in every 30 seconds while this is the texting phone, else every 5 minutes. */
    static final long FAST_PING_MS = 30 * 1000L;
    /** A text with no "sent" callback after this long is reported as sent (Android normally answers in seconds). */
    private static final long NO_CALLBACK_MS = 3 * 60 * 1000L;
    private static final int MAX_RESULTS = 100;
    private static final Object LOCK = new Object();

    private SmsSender() {}

    static boolean isEnabled(Context c) {
        return EchoStore.prefs(c).getBoolean("smsEnabled", false);
    }

    static void setEnabled(Context c, boolean on) {
        EchoStore.prefs(c).edit().putBoolean("smsEnabled", on).apply();
    }

    static boolean hasTelephony(Context c) {
        return c.getPackageManager().hasSystemFeature(PackageManager.FEATURE_TELEPHONY);
    }

    static boolean hasPermission(Context c) {
        return c.checkSelfPermission(Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED;
    }

    /** On, allowed and able to text. */
    static boolean canSend(Context c) {
        return isEnabled(c) && hasTelephony(c) && hasPermission(c);
    }

    @SuppressWarnings("deprecation")
    private static SmsManager manager(Context c) {
        if (Build.VERSION.SDK_INT >= 31) {
            SmsManager m = c.getSystemService(SmsManager.class);
            if (m != null) return m;
        }
        return SmsManager.getDefault();
    }

    /** Sends texts handed out by the server. Runs on the EchoStore executor thread. */
    static void sendAll(Context c, JSONArray items) {
        final Context app = c.getApplicationContext();
        if (items == null) return;
        for (int i = 0; i < items.length(); i++) {
            JSONObject it = items.optJSONObject(i);
            if (it == null) continue;
            String id = it.optString("id", "");
            String to = it.optString("to", "");
            String body = it.optString("body", "");
            if (id.isEmpty()) continue;
            if (to.isEmpty() || body.isEmpty()) {
                addResult(app, id, false, "Missing number or message");
                continue;
            }
            if (!canSend(app)) {
                addResult(app, id, false, "Texting is off on this phone");
                continue;
            }
            if (isPending(app, id)) continue; // already on its way
            send(app, id, to, body);
        }
    }

    private static void send(Context app, String id, String to, String body) {
        try {
            SmsManager sm = manager(app);
            ArrayList<String> parts = sm.divideMessage(body);
            if (parts == null || parts.isEmpty()) {
                parts = new ArrayList<>();
                parts.add(body);
            }
            int n = parts.size();
            markPending(app, id, n);
            ArrayList<PendingIntent> sent = new ArrayList<>();
            for (int i = 0; i < n; i++) {
                Intent intent = new Intent(app, SmsSentReceiver.class);
                intent.setAction(ACTION_SENT);
                intent.setData(Uri.parse("tigonsms://sent/" + Uri.encode(id) + "/" + i));
                intent.putExtra("id", id);
                int req = (id.hashCode() * 31) + i;
                sent.add(PendingIntent.getBroadcast(app, req, intent,
                    PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
            }
            if (n == 1) {
                sm.sendTextMessage(to, null, parts.get(0), sent.get(0), null);
            } else {
                sm.sendMultipartTextMessage(to, null, parts, sent, null);
            }
        } catch (Exception e) {
            synchronized (LOCK) {
                removePending(app, id);
            }
            addResult(app, id, false, e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
        }
    }

    /** Android's answer for one part of a text. Returns true when no texts are waiting any more. */
    static boolean onSent(Context c, String id, int resultCode) {
        Context app = c.getApplicationContext();
        synchronized (LOCK) {
            try {
                SharedPreferences p = EchoStore.prefs(app);
                JSONObject pending = new JSONObject(p.getString("smsPending", "{}"));
                JSONObject e = pending.optJSONObject(id);
                if (e == null) return pending.length() == 0;
                if (resultCode != Activity.RESULT_OK) {
                    pending.remove(id);
                    p.edit().putString("smsPending", pending.toString()).commit();
                    addResult(app, id, false, describe(resultCode));
                } else {
                    int left = e.optInt("left", 1) - 1;
                    if (left <= 0) {
                        pending.remove(id);
                        p.edit().putString("smsPending", pending.toString()).commit();
                        addResult(app, id, true, "");
                    } else {
                        e.put("left", left);
                        p.edit().putString("smsPending", pending.toString()).commit();
                    }
                }
                return pending.length() == 0;
            } catch (Exception ex) {
                return true;
            }
        }
    }

    /** Texts Android never answered for: report them as sent so the server doesn't send them twice. */
    static void sweep(Context c) {
        Context app = c.getApplicationContext();
        synchronized (LOCK) {
            try {
                SharedPreferences p = EchoStore.prefs(app);
                JSONObject pending = new JSONObject(p.getString("smsPending", "{}"));
                long now = System.currentTimeMillis();
                ArrayList<String> old = new ArrayList<>();
                Iterator<String> keys = pending.keys();
                while (keys.hasNext()) {
                    String k = keys.next();
                    JSONObject e = pending.optJSONObject(k);
                    if (e == null || now - e.optLong("at", 0) > NO_CALLBACK_MS) old.add(k);
                }
                if (old.isEmpty()) return;
                for (String k : old) pending.remove(k);
                p.edit().putString("smsPending", pending.toString()).commit();
                for (String k : old) addResult(app, k, true, "");
            } catch (Exception ignored) {
                EchoStore.prefs(app).edit().putString("smsPending", "{}").commit();
            }
        }
    }

    private static boolean isPending(Context app, String id) {
        synchronized (LOCK) {
            try {
                return new JSONObject(EchoStore.prefs(app).getString("smsPending", "{}")).has(id);
            } catch (Exception e) {
                return false;
            }
        }
    }

    private static void markPending(Context app, String id, int parts) throws Exception {
        synchronized (LOCK) {
            SharedPreferences p = EchoStore.prefs(app);
            JSONObject pending;
            try {
                pending = new JSONObject(p.getString("smsPending", "{}"));
            } catch (Exception e) {
                pending = new JSONObject();
            }
            JSONObject e = new JSONObject();
            e.put("left", parts);
            e.put("at", System.currentTimeMillis());
            pending.put(id, e);
            p.edit().putString("smsPending", pending.toString()).commit();
        }
    }

    private static void removePending(Context app, String id) {
        try {
            SharedPreferences p = EchoStore.prefs(app);
            JSONObject pending = new JSONObject(p.getString("smsPending", "{}"));
            pending.remove(id);
            p.edit().putString("smsPending", pending.toString()).commit();
        } catch (Exception ignored) {
            // nothing to remove
        }
    }

    static int pendingCount(Context c) {
        synchronized (LOCK) {
            try {
                return new JSONObject(EchoStore.prefs(c).getString("smsPending", "{}")).length();
            } catch (Exception e) {
                return 0;
            }
        }
    }

    private static void addResult(Context app, String id, boolean ok, String error) {
        synchronized (LOCK) {
            SharedPreferences p = EchoStore.prefs(app);
            JSONArray q;
            try {
                q = new JSONArray(p.getString("smsResults", "[]"));
            } catch (Exception e) {
                q = new JSONArray();
            }
            try {
                JSONObject r = new JSONObject();
                r.put("id", id);
                r.put("ok", ok);
                if (!ok) r.put("error", error == null ? "" : error);
                q.put(r);
                while (q.length() > MAX_RESULTS) q.remove(0);
                SharedPreferences.Editor ed = p.edit().putString("smsResults", q.toString());
                if (ok) {
                    ed.putLong("smsLastSentAt", System.currentTimeMillis()).putInt("smsSentCount", p.getInt("smsSentCount", 0) + 1);
                } else {
                    ed.putString("smsLastError", error == null ? "" : error);
                }
                ed.commit();
            } catch (Exception ignored) {
                // drop this result; the server retries the text after 10 minutes
            }
        }
    }

    /** Results waiting to be reported (a copy; call clearResults(n) after the server took them). */
    static JSONArray peekResults(Context c) {
        synchronized (LOCK) {
            try {
                return new JSONArray(EchoStore.prefs(c).getString("smsResults", "[]"));
            } catch (Exception e) {
                return new JSONArray();
            }
        }
    }

    /** Drops the first `n` results (reported). Results added meanwhile stay. */
    static void clearResults(Context c, int n) {
        if (n <= 0) return;
        synchronized (LOCK) {
            SharedPreferences p = EchoStore.prefs(c);
            try {
                JSONArray q = new JSONArray(p.getString("smsResults", "[]"));
                JSONArray rest = new JSONArray();
                for (int i = n; i < q.length(); i++) rest.put(q.get(i));
                p.edit().putString("smsResults", rest.toString()).commit();
            } catch (Exception e) {
                p.edit().putString("smsResults", "[]").commit();
            }
        }
    }

    private static String describe(int code) {
        switch (code) {
            case SmsManager.RESULT_ERROR_RADIO_OFF:
                return "Phone signal is off (airplane mode?)";
            case SmsManager.RESULT_ERROR_NO_SERVICE:
                return "No phone service";
            case SmsManager.RESULT_ERROR_NULL_PDU:
                return "The phone could not build the text";
            case SmsManager.RESULT_ERROR_GENERIC_FAILURE:
                return "The phone company did not accept the text";
            default:
                return "The phone could not send it (code " + code + ")";
        }
    }
}
