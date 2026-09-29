package com.tigongolfcarts.iot;

import android.content.Intent;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** JS bridge for "Quick FB List": opens FbListingActivity with the listing. */
@CapacitorPlugin(name = "TigonFbList")
public class FbListPlugin extends Plugin {
    @PluginMethod
    public void open(PluginCall call) {
        String payload = call.getString("payload", "");
        if (payload == null || payload.isEmpty()) {
            call.reject("No listing");
            return;
        }
        Intent i = new Intent(getContext(), FbListingActivity.class);
        i.putExtra(FbListingActivity.EXTRA_PAYLOAD, payload);
        getActivity().startActivity(i);
        call.resolve();
    }
}
