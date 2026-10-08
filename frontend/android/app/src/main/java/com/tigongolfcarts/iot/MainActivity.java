package com.tigongolfcarts.iot;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(EchoPlugin.class);
        registerPlugin(FbListPlugin.class);
        registerPlugin(GalleryPlugin.class);
        registerPlugin(SmsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
