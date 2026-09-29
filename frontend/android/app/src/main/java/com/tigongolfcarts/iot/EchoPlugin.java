package com.tigongolfcarts.iot;

import android.content.ComponentName;
import android.content.Intent;
import android.content.SharedPreferences;
import android.provider.Settings;
import android.text.TextUtils;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

/** JS bridge for notification echo: configure, status, open Android's Notification access settings, test. */
@CapacitorPlugin(name = "TigonEcho")
public class EchoPlugin extends Plugin {

    private boolean hasAccess() {
        String flat = Settings.Secure.getString(getContext().getContentResolver(), "enabled_notification_listeners");
        if (TextUtils.isEmpty(flat)) return false;
        ComponentName me = new ComponentName(getContext(), EchoListenerService.class);
        for (String s : flat.split(":")) {
            ComponentName c = ComponentName.unflattenFromString(s);
            if (me.equals(c)) return true;
        }
        return false;
    }

    @PluginMethod
    public void configure(PluginCall call) {
        SharedPreferences.Editor e = EchoStore.prefs(getContext()).edit();
        if (call.hasOption("deviceId")) e.putString("deviceId", call.getString("deviceId", ""));
        if (call.hasOption("secret")) e.putString("secret", call.getString("secret", ""));
        if (call.hasOption("endpoint")) e.putString("endpoint", call.getString("endpoint", EchoStore.DEFAULT_ENDPOINT));
        if (call.hasOption("enabled")) e.putBoolean("enabled", Boolean.TRUE.equals(call.getBoolean("enabled", true)));
        if (call.hasOption("onlyFacebook")) e.putBoolean("onlyFacebook", Boolean.TRUE.equals(call.getBoolean("onlyFacebook", false)));
        e.apply();
        EchoStore.flush(getContext());
        getStatus(call);
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        SharedPreferences p = EchoStore.prefs(getContext());
        JSObject r = new JSObject();
        r.put("access", hasAccess());
        r.put("enabled", p.getBoolean("enabled", false));
        r.put("configured", EchoStore.isConfigured(getContext()));
        r.put("deviceId", p.getString("deviceId", ""));
        r.put("onlyFacebook", p.getBoolean("onlyFacebook", false));
        r.put("queued", EchoStore.queueSize(getContext()));
        r.put("lastSentAt", p.getLong("lastSentAt", 0));
        r.put("lastError", p.getString("lastError", ""));
        call.resolve(r);
    }

    @PluginMethod
    public void openAccessSettings(PluginCall call) {
        Intent i = new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS");
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void sendTest(PluginCall call) {
        try {
            JSONObject item = new JSONObject();
            item.put("key", "test-" + System.currentTimeMillis());
            item.put("pkg", getContext().getPackageName());
            item.put("app", "TIGON IOT");
            item.put("title", "Echo test");
            item.put("text", "If you see this on the dashboard, notification echo works.");
            item.put("postedAt", System.currentTimeMillis());
            EchoStore.enqueue(getContext(), item);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }
}
