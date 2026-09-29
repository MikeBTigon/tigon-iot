package com.tigongolfcarts.iot;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.util.Base64;
import android.view.Gravity;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ConcurrentHashMap;

/**
 * "Quick FB List": opens the Facebook Marketplace vehicle form inside TIGON IOT and fills it in (year, make, model,
 * price, description, location) and attaches the cart photos. It never taps Publish — the person checks and publishes.
 * The phone signs in to Facebook once here (the login is kept).
 */
public class FbListingActivity extends Activity {
    static final String EXTRA_PAYLOAD = "payload";
    private static final String CREATE_URL = "https://www.facebook.com/marketplace/create/vehicle";
    // Facebook's desktop form is the one the fill script knows; phones get it zoomed to fit.
    private static final String DESKTOP_UA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

    private WebView web;
    private String payload = "{}";
    private String fillScript = "";
    private final ConcurrentHashMap<Integer, String> photos = new ConcurrentHashMap<>();
    private volatile int photoCount = 0;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String p = getIntent().getStringExtra(EXTRA_PAYLOAD);
        if (p != null) payload = p;
        fillScript = readAsset("tigon/fb-fill.js");

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        LinearLayout bar = new LinearLayout(this);
        bar.setBackgroundColor(Color.rgb(175, 31, 49));
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(24, 8, 8, 8);
        TextView title = new TextView(this);
        title.setText("TIGON Quick FB List — check, then tap Publish");
        title.setTextColor(Color.WHITE);
        title.setTextSize(14);
        bar.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        Button refill = new Button(this);
        refill.setText("Fill again");
        refill.setOnClickListener(v -> inject(true));
        bar.addView(refill);
        Button done = new Button(this);
        done.setText("Done");
        done.setOnClickListener(v -> finish());
        bar.addView(done);
        root.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        web = new WebView(this);
        root.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setUserAgentString(DESKTOP_UA);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        web.addJavascriptInterface(new Bridge(), "TigonFill");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                inject(false);
            }
        });

        startPhotoDownloads();
        web.loadUrl(CREATE_URL);
    }

    private void inject(boolean force) {
        if (web == null || fillScript.isEmpty()) return;
        web.evaluateJavascript(fillScript + "\n;window.__tigonFill && window.__tigonFill(" + (force ? "true" : "false") + ");", null);
    }

    private void startPhotoDownloads() {
        new Thread(() -> {
            try {
                JSONArray urls = new JSONObject(payload).optJSONObject("cart") != null
                    ? new JSONObject(payload).getJSONObject("cart").optJSONArray("photos") : null;
                if (urls == null) return;
                photoCount = Math.min(20, urls.length());
                for (int i = 0; i < photoCount; i++) {
                    photos.put(i, download(urls.optString(i)));
                }
            } catch (Exception ignored) {
                // photos are optional
            }
        }).start();
    }

    private String download(String url) {
        try {
            HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
            con.setConnectTimeout(15000);
            con.setReadTimeout(30000);
            try (InputStream in = con.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                String type = con.getContentType() == null ? "image/jpeg" : con.getContentType().split(";")[0];
                JSONObject o = new JSONObject();
                o.put("type", type);
                o.put("data", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
                return o.toString();
            } finally {
                con.disconnect();
            }
        } catch (Exception e) {
            return "{\"error\":\"" + String.valueOf(e.getMessage()).replace("\"", "'") + "\"}";
        }
    }

    private String readAsset(String name) {
        try (InputStream in = getAssets().open(name); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString(StandardCharsets.UTF_8.name());
        } catch (Exception e) {
            return "";
        }
    }

    /** Called from the fill script on the Facebook page. Only exposes this one listing. */
    private class Bridge {
        @JavascriptInterface
        public String payload() {
            return payload;
        }

        @JavascriptInterface
        public int photoCount() {
            return photoCount;
        }

        /** JSON {type,data} (base64), {error}, or "" while still downloading. */
        @JavascriptInterface
        public String photo(int i) {
            String v = photos.get(i);
            return v == null ? "" : v;
        }
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
