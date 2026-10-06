package com.tigongolfcarts.iot;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * "Save all photos" in the phone app: downloads cart photos and saves them straight into the phone's Gallery
 * (Pictures/TIGON/&lt;cart&gt;), no share sheet. Android 10+ needs no permission; Android 8–9 asks once for storage.
 */
@CapacitorPlugin(
    name = "TigonGallery",
    permissions = { @Permission(alias = "storage", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }) }
)
public class GalleryPlugin extends Plugin {

    @PluginMethod
    public void saveImages(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storagePermissionDone");
            return;
        }
        save(call);
    }

    @PermissionCallback
    private void storagePermissionDone(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) save(call);
        else call.reject("Allow storage access so TIGON IOT can save photos to your Gallery.");
    }

    private void save(PluginCall call) {
        JSArray files = call.getArray("files");
        String album = clean(call.getString("album", "Cart"));
        if (files == null || files.length() == 0) {
            call.reject("No photos");
            return;
        }
        new Thread(() -> {
            int saved = 0;
            int failed = 0;
            for (int i = 0; i < files.length(); i++) {
                try {
                    JSONObject f = files.getJSONObject(i);
                    String name = clean(f.optString("name", "photo_" + (i + 1) + ".jpg"));
                    byte[] data = download(f.getString("url"));
                    if (data.length == 0) throw new Exception("empty");
                    write(album, name, data);
                    saved++;
                } catch (Exception e) {
                    failed++;
                }
            }
            JSObject res = new JSObject();
            res.put("saved", saved);
            res.put("failed", failed);
            res.put("folder", "Pictures/TIGON/" + album);
            if (saved == 0) call.reject("Could not save the photos. Check your connection and try again.");
            else call.resolve(res);
        }).start();
    }

    private static String clean(String s) {
        String out = s == null ? "" : s.replaceAll("[\\\\/:*?\"<>|\\n\\r]+", "_").trim();
        if (out.length() > 80) out = out.substring(0, 80);
        return out.isEmpty() ? "Cart" : out;
    }

    private static byte[] download(String url) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        try {
            con.setConnectTimeout(15000);
            con.setReadTimeout(30000);
            con.setInstanceFollowRedirects(true);
            if (con.getResponseCode() >= 300) throw new Exception("HTTP " + con.getResponseCode());
            try (InputStream in = con.getInputStream(); java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream()) {
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                return out.toByteArray();
            }
        } finally {
            con.disconnect();
        }
    }

    private static String mimeOf(String name) {
        String n = name.toLowerCase();
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".webp")) return "image/webp";
        return "image/jpeg";
    }

    private void write(String album, String name, byte[] data) throws Exception {
        String rel = Environment.DIRECTORY_PICTURES + "/TIGON/" + album;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentResolver cr = getContext().getContentResolver();
            ContentValues v = new ContentValues();
            v.put(MediaStore.Images.Media.DISPLAY_NAME, name);
            v.put(MediaStore.Images.Media.MIME_TYPE, mimeOf(name));
            v.put(MediaStore.Images.Media.RELATIVE_PATH, rel);
            v.put(MediaStore.Images.Media.IS_PENDING, 1);
            Uri uri = cr.insert(MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), v);
            if (uri == null) throw new Exception("Gallery refused the photo");
            try (OutputStream os = cr.openOutputStream(uri)) {
                if (os == null) throw new Exception("Could not open the photo for writing");
                os.write(data);
            } catch (Exception e) {
                cr.delete(uri, null, null);
                throw e;
            }
            ContentValues done = new ContentValues();
            done.put(MediaStore.Images.Media.IS_PENDING, 0);
            cr.update(uri, done, null, null);
        } else {
            File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "TIGON/" + album);
            if (!dir.exists() && !dir.mkdirs()) throw new Exception("Could not create the folder");
            File out = new File(dir, name);
            try (FileOutputStream fos = new FileOutputStream(out)) {
                fos.write(data);
            }
            MediaScannerConnection.scanFile(getContext(), new String[] { out.getAbsolutePath() }, new String[] { mimeOf(name) }, null);
        }
    }
}
