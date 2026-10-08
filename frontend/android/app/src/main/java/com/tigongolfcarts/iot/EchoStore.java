package com.tigongolfcarts.iot;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Notification echo settings + a small offline queue. Everything the listener captures is posted to
 * https://tigoniot.com/api/echo (Cloud Function mpEcho) with this phone's device id and echo secret.
 * On the store's texting phone every request also says canSms=true, reports sent texts (smsResults) and
 * receives the next texts to send ("sms" in the reply, see SmsSender).
 */
final class EchoStore {
    static final String PREFS = "tigon_echo";
    static final String DEFAULT_ENDPOINT = "https://tigoniot.com/api/echo";
    private static final int MAX_QUEUE = 200;
    private static final ExecutorService EXEC = Executors.newSingleThreadExecutor();

    private EchoStore() {}

    static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean isConfigured(Context c) {
        SharedPreferences p = prefs(c);
        return p.getBoolean("enabled", false) && !p.getString("deviceId", "").isEmpty() && !p.getString("secret", "").isEmpty();
    }

    /** Adds one notification to the queue and tries to send the queue. */
    static void enqueue(Context c, JSONObject item) {
        final Context app = c.getApplicationContext();
        EXEC.execute(() -> {
            try {
                SharedPreferences p = prefs(app);
                JSONArray q = new JSONArray(p.getString("queue", "[]"));
                q.put(item);
                while (q.length() > MAX_QUEUE) q.remove(0);
                p.edit().putString("queue", q.toString()).apply();
            } catch (Exception ignored) {
                // corrupt queue: start over
                prefs(app).edit().putString("queue", "[]").apply();
            }
            flushNow(app);
        });
    }

    static void flush(Context c) {
        final Context app = c.getApplicationContext();
        EXEC.execute(() -> flushNow(app));
    }

    /** Sends queued notifications in batches of 20. Runs on the executor thread. */
    private static void flushNow(Context app) {
        SharedPreferences p = prefs(app);
        if (!isConfigured(app)) return;
        try {
            JSONArray q = new JSONArray(p.getString("queue", "[]"));
            while (q.length() > 0) {
                JSONArray batch = new JSONArray();
                for (int i = 0; i < Math.min(20, q.length()); i++) batch.put(q.get(i));
                JSONObject body = new JSONObject();
                body.put("deviceId", p.getString("deviceId", ""));
                body.put("secret", p.getString("secret", ""));
                body.put("items", batch);
                int reported = addSms(app, body);
                Resp r = post(p.getString("endpoint", DEFAULT_ENDPOINT), body.toString());
                int status = r.status;
                if (status == 401 || status == 410) {
                    // Secret replaced or phone revoked: stop until the app registers again.
                    p.edit().putBoolean("enabled", false).putString("lastError", "HTTP " + status).apply();
                    return;
                }
                if (status < 200 || (status >= 300 && status != 400)) {
                    p.edit().putString("lastError", "HTTP " + status).apply();
                    return; // keep the queue, retry on the next notification / app open
                }
                if (status >= 200 && status < 300) handleSms(app, r, reported);
                JSONArray rest = new JSONArray();
                for (int i = batch.length(); i < q.length(); i++) rest.put(q.get(i));
                q = rest;
                p.edit().putString("queue", q.toString()).putLong("lastSentAt", System.currentTimeMillis())
                    .putString("lastError", "").apply();
            }
        } catch (Exception e) {
            p.edit().putString("lastError", String.valueOf(e.getMessage())).apply();
        }
    }

    /** HTTP status + reply body ('' for errors). */
    static final class Resp {
        final int status;
        final String body;

        Resp(int status, String body) {
            this.status = status;
            this.body = body;
        }
    }

    private static Resp post(String endpoint, String json) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(endpoint).openConnection();
        try {
            con.setRequestMethod("POST");
            con.setConnectTimeout(15000);
            con.setReadTimeout(20000);
            con.setDoOutput(true);
            con.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            try (OutputStream os = con.getOutputStream()) {
                os.write(json.getBytes(StandardCharsets.UTF_8));
            }
            int status = con.getResponseCode();
            String body = "";
            if (status >= 200 && status < 300) {
                try (InputStream in = con.getInputStream()) {
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) > 0 && out.size() < 512 * 1024) out.write(buf, 0, n);
                    body = new String(out.toByteArray(), StandardCharsets.UTF_8);
                } catch (Exception ignored) {
                    body = "";
                }
            }
            return new Resp(status, body);
        } finally {
            con.disconnect();
        }
    }

    /** Texting phone: say we can text and attach results to report. Returns how many results were attached. */
    private static int addSms(Context app, JSONObject body) throws Exception {
        if (!SmsSender.isEnabled(app)) return 0;
        SmsSender.sweep(app);
        boolean can = SmsSender.canSend(app);
        if (can) body.put("canSms", true);
        JSONArray results = SmsSender.peekResults(app);
        if (results.length() > 0) body.put("smsResults", results);
        return results.length();
    }

    /** Texting phone: results were delivered; send the texts the server handed out. */
    private static void handleSms(Context app, Resp r, int reported) {
        SmsSender.clearResults(app, reported);
        if (!SmsSender.canSend(app) || r.body == null || r.body.isEmpty()) return;
        try {
            JSONObject reply = new JSONObject(r.body);
            JSONArray sms = reply.optJSONArray("sms");
            if (sms != null && sms.length() > 0) SmsSender.sendAll(app, sms);
        } catch (Exception ignored) {
            // not JSON: nothing to send
        }
    }

    /** "This phone is on" check-in (no notifications). Runs on the executor thread; failures are ignored. */
    static void ping(Context c) {
        final Context app = c.getApplicationContext();
        EXEC.execute(() -> {
            SharedPreferences p = prefs(app);
            if (!isConfigured(app)) return;
            try {
                JSONObject body = new JSONObject();
                body.put("deviceId", p.getString("deviceId", ""));
                body.put("secret", p.getString("secret", ""));
                body.put("ping", true);
                body.put("items", new JSONArray());
                int reported = addSms(app, body);
                Resp r = post(p.getString("endpoint", DEFAULT_ENDPOINT), body.toString());
                int status = r.status;
                if (status == 401 || status == 410) {
                    p.edit().putBoolean("enabled", false).putString("lastError", "HTTP " + status).apply();
                    return;
                }
                if (status >= 200 && status < 300) {
                    p.edit().putLong("lastPingAt", System.currentTimeMillis()).apply();
                    handleSms(app, r, reported);
                }
            } catch (Exception ignored) {
                // offline: the next check-in tries again
            }
            flushNow(app);
        });
    }

    static int queueSize(Context c) {
        try {
            return new JSONArray(prefs(c).getString("queue", "[]")).length();
        } catch (Exception e) {
            return 0;
        }
    }
}
