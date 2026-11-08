package com.aimable.etsamani;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import com.aimable.etsamani.plugins.BiometricAuthPlugin;
import com.aimable.etsamani.plugins.SmsReaderPlugin;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SmsReaderPlugin.class);
        registerPlugin(BiometricAuthPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
