package com.tigongolfcarts.iot;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Notification echo settings + a small offline queue. Everything the listener captures is posted to
 * https://tigoniot.com/api/echo (Cloud Function mpEcho) with this phone's device id and echo secret.
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
                int status = post(p.getString("endpoint", DEFAULT_ENDPOINT), body.toString());
                if (status == 401 || status == 410) {
                    // Secret replaced or phone revoked: stop until the app registers again.
                    p.edit().putBoolean("enabled", false).putString("lastError", "HTTP " + status).apply();
                    return;
                }
                if (status < 200 || (status >= 300 && status != 400)) {
                    p.edit().putString("lastError", "HTTP " + status).apply();
                    return; // keep the queue, retry on the next notification / app open
                }
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

    private static int post(String endpoint, String json) throws Exception {
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
            return con.getResponseCode();
        } finally {
            con.disconnect();
        }
    }

    static int queueSize(Context c) {
        try {
            return new JSONArray(prefs(c).getString("queue", "[]")).length();
        } catch (Exception e) {
            return 0;
        }
    }
}
