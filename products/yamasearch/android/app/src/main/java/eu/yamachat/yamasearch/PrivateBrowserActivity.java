package eu.yamachat.yamasearch;

import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebStorage;
import android.webkit.WebView;

/**
 * Runs in an isolated Android process with a separate WebView data directory.
 * Never writes normal history/bookmarks; cookies and WebStorage are cleared
 * when a private activity is created and destroyed.
 */
public final class PrivateBrowserActivity extends BrowserActivity {
    @Override protected boolean privateSession() { return true; }

    @Override public void onCreate(Bundle state) {
        // Must happen before any WebView (including CookieManager) in this process.
        WebView.setDataDirectorySuffix("yamasearch-private");
        CookieManager.getInstance().removeAllCookies(null);
        WebStorage.getInstance().deleteAllData();
        super.onCreate(state);
    }
}
