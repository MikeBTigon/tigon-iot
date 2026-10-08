package com.tigongolfcarts.iot;

import android.Manifest;
import android.content.ComponentName;
import android.content.SharedPreferences;
import android.provider.Settings;
import android.text.TextUtils;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/** JS bridge: make this phone the store's texting phone (sends the store's texts from its own number). */
@CapacitorPlugin(
    name = "TigonSms",
    permissions = {@Permission(strings = {Manifest.permission.SEND_SMS}, alias = "sms")}
)
public class SmsPlugin extends Plugin {

    private boolean hasNotificationAccess() {
        String flat = Settings.Secure.getString(getContext().getContentResolver(), "enabled_notification_listeners");
        if (TextUtils.isEmpty(flat)) return false;
        ComponentName me = new ComponentName(getContext(), EchoListenerService.class);
        for (String s : flat.split(":")) {
            ComponentName c = ComponentName.unflattenFromString(s);
            if (me.equals(c)) return true;
        }
        return false;
    }

    private JSObject status() {
        SharedPreferences p = EchoStore.prefs(getContext());
        PermissionState perm = getPermissionState("sms");
        JSObject r = new JSObject();
        r.put("supported", SmsSender.hasTelephony(getContext()));
        r.put("permission", perm == null ? "prompt" : perm.toString());
        r.put("isTextingPhone", SmsSender.isEnabled(getContext()));
        r.put("canSend", SmsSender.canSend(getContext()));
        r.put("notificationAccess", hasNotificationAccess());
        r.put("echoConfigured", EchoStore.isConfigured(getContext()));
        r.put("missedCalls", p.getBoolean("missedCalls", true));
        r.put("waiting", SmsSender.pendingCount(getContext()));
        r.put("toReport", SmsSender.peekResults(getContext()).length());
        r.put("sentCount", p.getInt("smsSentCount", 0));
        r.put("lastSentAt", p.getLong("smsLastSentAt", 0));
        r.put("lastPingAt", p.getLong("lastPingAt", 0));
        r.put("lastError", p.getString("smsLastError", ""));
        return r;
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(status());
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (getPermissionState("sms") == PermissionState.GRANTED) {
            call.resolve(status());
            return;
        }
        requestPermissionForAlias("sms", call, "smsPermissionDone");
    }

    @PermissionCallback
    private void smsPermissionDone(PluginCall call) {
        if (SmsSender.isEnabled(getContext())) EchoStore.ping(getContext());
        call.resolve(status());
    }

    /** {enabled: boolean} — this phone sends the store's texts (needs the SMS permission). */
    @PluginMethod
    public void setTextingPhone(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        SmsSender.setEnabled(getContext(), on);
        EchoStore.ping(getContext());
        call.resolve(status());
    }

    /** {enabled: boolean} — forward missed calls (for missed-call text-back). On by default. */
    @PluginMethod
    public void setMissedCalls(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("enabled", true));
        EchoStore.prefs(getContext()).edit().putBoolean("missedCalls", on).apply();
        call.resolve(status());
    }

    /** Check in now (sends waiting texts right away). */
    @PluginMethod
    public void checkNow(PluginCall call) {
        EchoStore.ping(getContext());
        call.resolve(status());
    }
}
