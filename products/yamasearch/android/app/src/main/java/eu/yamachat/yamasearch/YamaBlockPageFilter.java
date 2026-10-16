package eu.yamachat.yamasearch;

import android.annotation.SuppressLint;
import android.content.Context;
import android.webkit.WebView;

import androidx.webkit.ScriptHandler;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.Set;

/**
 * Installs the YouTube page-response part of YamaBlock before page JavaScript.
 * Network-domain rules stay in BrowserActivity; this filter only removes ad
 * metadata from YouTube player responses without blocking video delivery.
 */
final class YamaBlockPageFilter {
    private static final Set<String> YOUTUBE_ORIGINS = Collections.unmodifiableSet(
        new java.util.LinkedHashSet<>(Arrays.asList(
            "https://youtube.com",
            "https://*.youtube.com"
        )));

    private final WebView webView;
    private final String template;
    private boolean documentStartSupported;
    private ScriptHandler scriptHandler;
    private boolean enabled;
    private boolean initialized;
    private boolean destroyed;

    YamaBlockPageFilter(Context context, WebView webView, boolean enabled) {
        this.webView = webView;
        this.template = readTemplate(context);
        try {
            this.documentStartSupported = !template.isEmpty()
                && WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT);
        } catch (RuntimeException ignored) {
            this.documentStartSupported = false;
        }
        update(enabled);
    }

    @SuppressLint("RequiresFeature") // Every call is guarded by documentStartSupported.
    boolean update(boolean nextEnabled) {
        if (destroyed || template.isEmpty()) return false;
        boolean changed = !initialized || enabled != nextEnabled;
        if (!changed) return false;
        initialized = true;
        enabled = nextEnabled;
        if (documentStartSupported) {
            try {
                if (scriptHandler != null) {
                    scriptHandler.remove();
                    scriptHandler = null;
                }
                if (enabled) {
                    scriptHandler = WebViewCompat.addDocumentStartJavaScript(
                        webView, template, YOUTUBE_ORIGINS);
                }
            } catch (RuntimeException ignored) {
                scriptHandler = null;
                documentStartSupported = false;
            }
        }
        return changed;
    }

    void onPageStarted() {
        // Old WebView providers without DOCUMENT_START_SCRIPT cannot guarantee
        // pre-page execution. Keep the existing best-effort behavior instead of
        // silently losing page filtering altogether; maintained providers use
        // the deterministic document-start path registered before loadUrl().
        if (destroyed || documentStartSupported || !enabled || template.isEmpty()) return;
        try { webView.evaluateJavascript(template, null); }
        catch (IllegalStateException ignored) { }
    }

    @SuppressLint("RequiresFeature") // A handler exists only after a successful feature-guarded install.
    void destroy() {
        destroyed = true;
        if (scriptHandler != null) {
            try { scriptHandler.remove(); }
            catch (RuntimeException ignored) { }
            scriptHandler = null;
        }
        enabled = false;
        initialized = false;
    }

    private static String readTemplate(Context context) {
        try (InputStream input = context.getAssets().open("yamablock-youtube.js");
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer)) >= 0) output.write(buffer, 0, count);
            return new String(output.toByteArray(), StandardCharsets.UTF_8);
        } catch (Exception ignored) {
            return "";
        }
    }
}
