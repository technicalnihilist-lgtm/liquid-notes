package app.liquidnotes;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;

/**
 * A thin, dependency-free WebView shell around the bundled Liquid Notes web app.
 *
 * Assets are served from a virtual https origin (file:// is not a secure context,
 * so localStorage is unreliable there). The shell is deliberately defensive:
 *
 *  - a renderer process crash (typically GPU out-of-memory from the glass blur)
 *    is caught in onRenderProcessGone and the WebView is rebuilt instead of the
 *    whole app being killed by the system;
 *  - every uncaught exception is written to last-crash.txt and shown on the next
 *    launch, so a real stack trace is always available;
 *  - onCreate itself is wrapped, so a failure shows a readable message rather
 *    than closing instantly.
 */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String ORIGIN = "https://" + HOST;
    private static final String START_URL = ORIGIN + "/index.html";
    private static final int REQ_FILE = 1001;
    private static final String CRASH_FILE = "last-crash.txt";

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private final Bridge bridge = new Bridge();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        installCrashHandler();

        Window window = getWindow();
        window.setStatusBarColor(Color.parseColor("#DFE6FF"));
        window.setNavigationBarColor(Color.parseColor("#DFE6FF"));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = window.getAttributes();
            lp.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(lp);
        }

        try {
            web = buildWebView();
            web.loadUrl(startUrl());
            setContentView(web);
            showLastCrashIfAny();
        } catch (Throwable t) {
            logCrash(t);
            setContentView(buildErrorView("The app could not start", describe(t)));
        }
    }

    /* ------------------------------------------------------------------ */
    /* WebView                                                             */
    /* ------------------------------------------------------------------ */

    private WebView buildWebView() {
        web = new WebView(this);
        web.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.setBackgroundColor(Color.parseColor("#DFE6FF"));

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setTextZoom(100);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(false);
        s.setOffscreenPreRaster(false);   // keeps less raster memory alive
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            s.setSafeBrowsingEnabled(true);
        }

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                try {
                    Uri url = request.getUrl();
                    if (url == null || !HOST.equals(url.getHost())) return null;
                    String path = url.getPath();
                    if (path == null || path.isEmpty() || "/".equals(path)) path = "/index.html";
                    if (path.contains("..")) return null;
                    InputStream in = getAssets().open(path.substring(1));
                    String mime = mimeOf(path);
                    String charset = (mime.startsWith("text/") || mime.contains("javascript")
                            || mime.contains("json")) ? "utf-8" : null;
                    return new WebResourceResponse(mime, charset, in);
                } catch (Throwable t) {
                    return new WebResourceResponse("text/plain", "utf-8",
                            new ByteArrayInputStream("Not found".getBytes()));
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request,
                                        WebResourceError error) {
                // Only the page itself matters; a missing icon must not blank the app.
                if (request != null && request.isForMainFrame()) {
                    recover("The page did not load", String.valueOf(error.getDescription()));
                }
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // THE crash this shell kept hitting: the WebView renderer dies
                // (usually GPU memory from the full-screen blur) and Android
                // kills the whole app unless we handle it here and return true.
                String why = (detail == null) ? "unknown"
                        : ("crashed=" + detail.didCrash());
                logCrash(new IllegalStateException("WebView renderer gone: " + why));
                recover("The renderer was restarted", "Memory pressure was detected, so the "
                        + "graphics effects were reduced. Your notes are safe.");
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (fileCallback != null) {
                    fileCallback.onReceiveValue(null);
                }
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), REQ_FILE);
                    return true;
                } catch (Throwable t) {
                    fileCallback = null;
                    return false;
                }
            }
        });

        web.addJavascriptInterface(bridge, "LiquidBridge");
        return web;
    }

    /** Rebuild the WebView in lite mode after a renderer failure. */
    private void recover(String title, String detail) {
        runOnUiThread(() -> {
            try {
                if (web != null) {
                    web.removeJavascriptInterface("LiquidBridge");
                    web.destroy();
                    web = null;
                }
                // lite=1 tells the web app to skip the expensive glass effects
                web = buildWebView();
                web.loadUrl(START_URL + "?lite=1");
                setContentView(web);
                Toast.makeText(this, title + " — effects reduced", Toast.LENGTH_LONG).show();
            } catch (Throwable t) {
                logCrash(t);
                setContentView(buildErrorView(title, detail + "\n" + describe(t)));
            }
        });
    }

    /* ------------------------------------------------------------------ */
    /* Native fallback UI                                                  */
    /* ------------------------------------------------------------------ */

    private android.view.View buildErrorView(String title, String detail) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        int pad = (int) (24 * getResources().getDisplayMetrics().density);
        box.setPadding(pad, pad, pad, pad);
        box.setBackgroundColor(Color.parseColor("#DFE6FF"));

        TextView h = new TextView(this);
        h.setText(title);
        h.setTextSize(20);
        h.setTextColor(Color.parseColor("#14161C"));
        h.setGravity(Gravity.CENTER);
        box.addView(h);

        TextView d = new TextView(this);
        d.setText(detail == null ? "" : detail);
        d.setTextSize(13);
        d.setTextColor(Color.parseColor("#4A4F5C"));
        d.setGravity(Gravity.CENTER);
        d.setPadding(0, pad / 2, 0, pad / 2);
        box.addView(d);

        Button reload = new Button(this);
        reload.setText("Reload");
        reload.setOnClickListener(v -> {
            try {
                web = buildWebView();
                web.loadUrl(startUrl());
                setContentView(web);
            } catch (Throwable t) {
                logCrash(t);
            }
        });
        box.addView(reload);

        Button lite = new Button(this);
        lite.setText("Reload in lite mode");
        lite.setOnClickListener(v -> {
            try {
                web = buildWebView();
                web.loadUrl(START_URL + "?lite=1");
                setContentView(web);
            } catch (Throwable t) {
                logCrash(t);
            }
        });
        box.addView(lite);

        return box;
    }

    /* ------------------------------------------------------------------ */
    /* Crash logging                                                       */
    /* ------------------------------------------------------------------ */

    private void installCrashHandler() {
        final Thread.UncaughtExceptionHandler previous =
                Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            logCrash(error);
            if (previous != null) previous.uncaughtException(thread, error);
        });
    }

    private void logCrash(Throwable t) {
        try {
            File f = new File(getFilesDir(), CRASH_FILE);
            FileOutputStream out = new FileOutputStream(f);
            StringWriter sw = new StringWriter();
            PrintWriter pw = new PrintWriter(sw);
            sw.write("Liquid Notes " + BuildConfig.VERSION_NAME + " (API "
                    + Build.VERSION.SDK_INT + ")\n");
            t.printStackTrace(pw);
            pw.flush();
            out.write(sw.toString().getBytes());
            out.close();
        } catch (Throwable ignored) {
            // logging must never be the reason the app fails
        }
    }

    private void showLastCrashIfAny() {
        try {
            File f = new File(getFilesDir(), CRASH_FILE);
            if (!f.exists()) return;
            String text = readAll(f);
            if (!f.delete()) f.deleteOnExit();
            if (text == null || text.trim().isEmpty()) return;
            new AlertDialog.Builder(this)
                    .setTitle("Last crash report")
                    .setMessage(text.length() > 1500 ? text.substring(0, 1500) : text)
                    .setPositiveButton("Copy", (d, w) -> {
                        android.content.ClipboardManager cm =
                                (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                        if (cm != null) {
                            cm.setPrimaryClip(android.content.ClipData.newPlainText("crash", text));
                            Toast.makeText(this, "Crash report copied", Toast.LENGTH_SHORT).show();
                        }
                    })
                    .setNegativeButton("Dismiss", null)
                    .show();
        } catch (Throwable ignored) {
        }
    }

    private static String readAll(File f) {
        try {
            InputStream in = new java.io.FileInputStream(f);
            java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
            in.close();
            return bos.toString("UTF-8");
        } catch (Throwable t) {
            return null;
        }
    }

    private static String describe(Throwable t) {
        if (t == null) return "";
        String m = t.getClass().getSimpleName() + ": " + t.getMessage();
        return m.length() > 400 ? m.substring(0, 400) : m;
    }

    /* ------------------------------------------------------------------ */
    /* JS bridge                                                           */
    /* ------------------------------------------------------------------ */

    private class Bridge {
        volatile boolean menuOpen = false;
        volatile boolean appOpen = true;

        @JavascriptInterface
        public void setUiState(boolean menuOpen, boolean appOpen) {
            this.menuOpen = menuOpen;
            this.appOpen = appOpen;
        }

        @JavascriptInterface
        public void saveFile(String name, String base64, String mime) {
            final String safe = (name == null || name.trim().isEmpty())
                    ? "liquid-notes.txt"
                    : name.replaceAll("[^A-Za-z0-9._-]", "_");
            final String type = (mime == null || mime.trim().isEmpty())
                    ? "application/octet-stream" : mime;
            String message;
            try {
                byte[] data = Base64.decode(base64 == null ? "" : base64, Base64.DEFAULT);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    Downloads.write(MainActivity.this, safe, type, data);
                    message = "Saved to Downloads/Liquid Notes/" + safe;
                } else {
                    File dir = new File(getExternalFilesDir(null), "exports");
                    if (!dir.exists() && !dir.mkdirs()) throw new IOException("no directory");
                    File out = new File(dir, safe);
                    FileOutputStream fos = new FileOutputStream(out);
                    fos.write(data);
                    fos.close();
                    message = "Saved to " + out.getAbsolutePath();
                }
            } catch (Throwable t) {
                message = "Could not save the file";
            }
            final String toastText = message;
            runOnUiThread(() -> Toast.makeText(MainActivity.this, toastText, Toast.LENGTH_LONG).show());
        }

        @JavascriptInterface
        public String lastCrash() {
            File f = new File(getFilesDir(), CRASH_FILE);
            String text = f.exists() ? readAll(f) : null;
            return text == null ? "" : text;
        }
    }

    /** Isolated so older Androids never resolve the API 29 MediaStore class. */
    private static class Downloads {
        static void write(Activity activity, String name, String mime, byte[] data) throws IOException {
            ContentValues cv = new ContentValues();
            cv.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            cv.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            cv.put(MediaStore.MediaColumns.RELATIVE_PATH,
                    Environment.DIRECTORY_DOWNLOADS + "/Liquid Notes");
            Uri uri = activity.getContentResolver()
                    .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
            if (uri == null) throw new IOException("no media store entry");
            OutputStream os = activity.getContentResolver().openOutputStream(uri);
            if (os == null) throw new IOException("no output stream");
            try {
                os.write(data);
            } finally {
                os.close();
            }
        }
    }

    private String startUrl() {
        Intent intent = getIntent();
        boolean lite = intent != null && intent.getBooleanExtra("lite", false);
        return lite ? START_URL + "?lite=1" : START_URL;
    }

    private static String mimeOf(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".js")) return "application/javascript";
        if (p.endsWith(".json") || p.endsWith(".webmanifest")) return "application/manifest+json";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".md")) return "text/markdown";
        return "application/octet-stream";
    }

    /* ------------------------------------------------------------------ */
    /* Lifecycle                                                           */
    /* ------------------------------------------------------------------ */

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE) {
            if (fileCallback != null) {
                try {
                    fileCallback.onReceiveValue(
                            WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                } catch (Throwable ignored) {
                }
                fileCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onBackPressed() {
        try {
            if (web == null) {
                finish();
                return;
            }
            if (bridge.menuOpen || bridge.appOpen) {
                web.evaluateJavascript(
                        "(function(){try{return window.liquidBack?window.liquidBack():false}catch(e){return false}})()",
                        null);
                return;
            }
        } catch (Throwable ignored) {
        }
        finish();
    }

    @Override
    public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        // Free cached resources before the renderer is pushed into OOM.
        if (web != null && level >= TRIM_MEMORY_RUNNING_LOW) {
            try {
                web.clearCache(false);
            } catch (Throwable ignored) {
            }
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            try {
                web.removeJavascriptInterface("LiquidBridge");
                web.loadUrl("about:blank");
                web.destroy();
            } catch (Throwable ignored) {
            }
            web = null;
        }
        super.onDestroy();
    }
}
