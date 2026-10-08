package com.tigongolfcarts.iot;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Android tells us whether each part of a text went out (texting phone). */
public class SmsSentReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !SmsSender.ACTION_SENT.equals(intent.getAction())) return;
        String id = intent.getStringExtra("id");
        if (id == null || id.isEmpty()) return;
        boolean allDone = SmsSender.onSent(context, id, getResultCode());
        // Report right away (and pick up the next texts) once the batch is done.
        if (allDone) EchoStore.ping(context);
    }
}
