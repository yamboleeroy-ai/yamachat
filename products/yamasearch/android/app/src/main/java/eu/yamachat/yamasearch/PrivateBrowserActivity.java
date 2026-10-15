package eu.yamachat.yamasearch;

import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewDatabase;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Runs in an isolated Android process with a separate WebView data directory.
 * Never writes normal history/bookmarks; cookies and WebStorage are cleared
 * before a new private session and after its last private activity closes.
 */
public final class PrivateBrowserActivity extends BrowserActivity {
    private static final Object DATA_DIRECTORY_LOCK = new Object();
    private static boolean privateDataDirectoryInitialized;
    private static int activePrivateActivities;
    private static boolean clearingPrivateData;
    private static boolean privateSessionReady;
    private static boolean waitingForLiveCacheHost;
    private static final List<Runnable> waitingForCleanPrivateData = new ArrayList<>();
    private static final Set<PrivateBrowserActivity> livePrivateActivities = new HashSet<>();
    private boolean registeredPrivateActivity;

    @Override protected boolean privateSession() { return true; }

    @Override public void onCreate(Bundle state) {
        // Must happen before any android.webkit API in this isolated process.
        // Do not fall back to the normal data directory if this invariant is broken.
        synchronized (DATA_DIRECTORY_LOCK) {
            if (!privateDataDirectoryInitialized) {
                WebView.setDataDirectorySuffix("yamasearch-private");
                privateDataDirectoryInitialized = true;
            }
            activePrivateActivities++;
            livePrivateActivities.add(this);
            registeredPrivateActivity = true;
        }
        super.onCreate(state);
    }

    @Override protected void prepareInitialWebData(Runnable ready) {
        boolean runNow = false;
        boolean startCleanup = false;
        boolean resumeCacheCleanup = false;
        synchronized (DATA_DIRECTORY_LOCK) {
            if (privateSessionReady && !clearingPrivateData) {
                runNow = true;
            } else {
                waitingForCleanPrivateData.add(ready);
                if (!clearingPrivateData) {
                    clearingPrivateData = true;
                    startCleanup = true;
                } else if (waitingForLiveCacheHost) {
                    waitingForLiveCacheHost = false;
                    resumeCacheCleanup = true;
                }
            }
        }
        if (runNow) ready.run();
        else if (startCleanup) clearPrivateWebData(this);
        else if (resumeCacheCleanup) clearPrivateHttpCache(this);
    }

    @Override protected void clearPrivateWebDataOnDestroy() {
        boolean startCleanup = false;
        synchronized (DATA_DIRECTORY_LOCK) {
            if (!registeredPrivateActivity) return;
            registeredPrivateActivity = false;
            livePrivateActivities.remove(this);
            activePrivateActivities = Math.max(0, activePrivateActivities - 1);
            if (activePrivateActivities == 0) {
                privateSessionReady = false;
                if (!clearingPrivateData) {
                    clearingPrivateData = true;
                    startCleanup = true;
                } else if (waitingForLiveCacheHost) {
                    // There is no remaining private window that could host a
                    // WebView cache clear. The next private session starts a
                    // fresh full cleanup instead of inheriting a ready state.
                    waitingForLiveCacheHost = false;
                    clearingPrivateData = false;
                    waitingForCleanPrivateData.clear();
                }
            }
        }
        if (startCleanup) clearPrivateWebData(this);
    }

    private static void clearPrivateWebData(PrivateBrowserActivity host) {
        CookieManager cookies = CookieManager.getInstance();
        try {
            cookies.removeAllCookies(ignored -> {
                try {
                    try { cookies.flush(); } catch (Exception ignoredFlush) { }
                    try { WebStorage.getInstance().deleteAllData(); } catch (Exception ignoredStorage) { }
                } finally {
                    clearPrivateHttpCache(host);
                }
            });
        } catch (Exception ignored) {
            try { WebStorage.getInstance().deleteAllData(); }
            finally { clearPrivateHttpCache(host); }
        }
    }

    private static PrivateBrowserActivity currentLivePrivateActivity(PrivateBrowserActivity preferred) {
        synchronized (DATA_DIRECTORY_LOCK) {
            if (preferred != null && livePrivateActivities.contains(preferred)
                    && !preferred.isFinishing() && !preferred.isDestroyed()) return preferred;
            for (PrivateBrowserActivity candidate : livePrivateActivities) {
                if (!candidate.isFinishing() && !candidate.isDestroyed()) return candidate;
            }
            return null;
        }
    }

    private static void clearPrivateHttpCache(PrivateBrowserActivity host) {
        PrivateBrowserActivity cacheHost = currentLivePrivateActivity(host);
        if (cacheHost == null) {
            synchronized (DATA_DIRECTORY_LOCK) {
                privateSessionReady = false;
                if (activePrivateActivities == 0) {
                    waitingForLiveCacheHost = false;
                    clearingPrivateData = false;
                    waitingForCleanPrivateData.clear();
                } else {
                    // A finishing activity is still counted until onDestroy.
                    // Keep cleanup pending until a real, live private activity
                    // can clear the cache; never mark the session ready early.
                    waitingForLiveCacheHost = true;
                }
            }
            return;
        }
        cacheHost.runOnUiThread(() -> {
            if (cacheHost.isFinishing() || cacheHost.isDestroyed()) {
                clearPrivateHttpCache(null);
                return;
            }
            try {
                // A private process can survive an earlier forced stop with an
                // HTTP resource cache still on disk. Use a short-lived WebView
                // in the already isolated data directory to clear that cache
                // before the first private tab begins loading.
                WebViewDatabase database = WebViewDatabase.getInstance(cacheHost);
                database.clearHttpAuthUsernamePassword();
                database.clearFormData();
                GeolocationPermissions.getInstance().clearAll();
                WebView cleaner = new WebView(cacheHost);
                cleaner.clearCache(true);
                cleaner.clearHistory();
                cleaner.clearFormData();
                cleaner.destroy();
            } catch (Exception ignored) {
                // Cookie and WebStorage cleanup above remains valid even if the
                // platform refuses cache cleanup during teardown.
            } finally {
                finishPrivateDataCleanup();
            }
        });
    }

    private static void finishPrivateDataCleanup() {
        List<Runnable> ready = new ArrayList<>();
        synchronized (DATA_DIRECTORY_LOCK) {
            waitingForLiveCacheHost = false;
            clearingPrivateData = false;
            if (activePrivateActivities > 0) {
                privateSessionReady = true;
                ready.addAll(waitingForCleanPrivateData);
                waitingForCleanPrivateData.clear();
            } else {
                privateSessionReady = false;
                waitingForCleanPrivateData.clear();
            }
        }
        for (Runnable action : ready) {
            try { action.run(); } catch (Exception ignored) { }
        }
    }
}
