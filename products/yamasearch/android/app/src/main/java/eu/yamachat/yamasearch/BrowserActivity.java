package eu.yamachat.yamasearch;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.app.role.RoleManager;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Message;
import android.provider.Settings;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.content.Context;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.net.http.SslError;
import android.webkit.URLUtil;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import android.graphics.drawable.GradientDrawable;
import androidx.core.content.FileProvider;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class BrowserActivity extends Activity {
    private static final int INK = Color.rgb(12, 18, 31);
    private static final int PANEL = Color.rgb(22, 31, 49);
    private static final int CYAN = Color.rgb(64, 212, 245);
    private static final int MUTED = Color.rgb(169, 185, 204);
    private static final int FILE_PICKER = 350;
    private static final int SITE_PERMISSION = 351;
    private static final int SITE_LOCATION_PERMISSION = 352;
    private static final int DOWNLOAD_STORAGE_PERMISSION = 353;
    private static final String ANDROID_APK_MIME = "application/vnd.android.package-archive";
    private static final String DOWNLOAD_COMPLETION_PERMISSION =
        "android.permission.SEND_DOWNLOAD_COMPLETED_INTENTS";
    private static final String UPDATE_DOWNLOAD_PREFS = "yamasearch_android_update_download";
    private static final String UPDATE_DOWNLOAD_ID = "downloadId";
    private static final String UPDATE_DOWNLOAD_MANIFEST = "manifestJson";
    private static final String VERIFIED_UPDATE_DIRECTORY = "verified-updates";
    private static final Object UPDATE_DOWNLOAD_STATE_LOCK = new Object();
    private static final Object UPDATE_COPY_LOCK = new Object();
    private static final Map<Long, Object> UPDATE_DOWNLOAD_VERIFICATION_OWNERS = new HashMap<>();
    private static final Set<WeakReference<BrowserActivity>> UPDATE_ACTIVITIES = new HashSet<>();
    private static boolean staleUpdatePartialsCleaned;
    private static final String HOME = MobileNavigation.HOME;
    private static final String SITE_CAMERA = "camera";
    private static final String SITE_MICROPHONE = "microphone";
    private static final String SITE_LOCATION = "location";
    private static final String[] AD_HOSTS = {
        "doubleclick.net", "googlesyndication.com", "googleadservices.com",
        "googletagservices.com", "amazon-adsystem.com", "adnxs.com",
        "criteo.com", "criteo.net", "taboola.com", "outbrain.com"
    };
    private static final String[] TRACKER_HOSTS = {
        "google-analytics.com", "analytics.google.com", "googletagmanager.com",
        "connect.facebook.net", "hotjar.com", "clarity.ms"
    };

    protected boolean privateSession() { return false; }

    /** Lets the isolated private activity finish clearing WebView data before loading its first page. */
    protected void prepareInitialWebData(Runnable ready) { ready.run(); }

    /** PrivateBrowserActivity owns the isolated-profile cleanup across its activities. */
    protected void clearPrivateWebDataOnDestroy() { }

    private static final class Tab {
        WebView web;
        YamaBlockPageFilter yamaBlockPageFilter;
        final String homeDocumentUrl = MobileHomePage.HOME_BASE + UUID.randomUUID() + "/";
        String title = "Nová karta";
        String favicon = "";
        boolean isHome;
        boolean homeNavigationPending;
        boolean homeContentDirty;
        // shouldInterceptRequest runs on a WebView worker thread. Keep the
        // top-level host here instead of asking WebView#getUrl from that thread.
        volatile String topLevelHost = "";
        int blockedCount;
        int navigationGeneration;
        Tab(WebView web) { this.web = web; }
    }

    /** A request that is alive until the web page, the user, or Android settles it. */
    private static final class PendingMediaPermission {
        final PermissionRequest request;
        final Tab tab;
        final WebView web;
        final int navigationGeneration;
        final String origin;
        final String[] resources;
        final List<String> promptStates;
        AlertDialog dialog;
        boolean cancelled;

        PendingMediaPermission(PermissionRequest request, Tab tab, WebView web, int navigationGeneration,
                               String origin, String[] resources, List<String> promptStates) {
            this.request = request;
            this.tab = tab;
            this.web = web;
            this.navigationGeneration = navigationGeneration;
            this.origin = origin;
            this.resources = resources;
            this.promptStates = promptStates;
        }
    }

    /** Kept separate from capture because Android has a separate runtime prompt. */
    private static final class PendingLocationPermission {
        final String rawOrigin;
        final String origin;
        final GeolocationPermissions.Callback callback;
        final Tab tab;
        final WebView web;
        final int navigationGeneration;
        final boolean rememberChoice;
        AlertDialog dialog;
        boolean cancelled;

        PendingLocationPermission(String rawOrigin, String origin,
                                  GeolocationPermissions.Callback callback, Tab tab, WebView web,
                                  int navigationGeneration, boolean rememberChoice) {
            this.rawOrigin = rawOrigin;
            this.origin = origin;
            this.callback = callback;
            this.tab = tab;
            this.web = web;
            this.navigationGeneration = navigationGeneration;
            this.rememberChoice = rememberChoice;
        }
    }

    /** Android 9 needs legacy storage consent before DownloadManager can use public Downloads. */
    private static final class PendingDownload {
        final String url;
        final String agent;
        final String disposition;
        final String mime;

        PendingDownload(String url, String agent, String disposition, String mime) {
            this.url = url;
            this.agent = agent;
            this.disposition = disposition;
            this.mime = mime;
        }
    }

    private static final class UpdateDownloadOutcome {
        final boolean success;
        final String version;
        final Uri downloadedUri;

        UpdateDownloadOutcome(boolean success, String version, Uri downloadedUri) {
            this.success = success;
            this.version = version;
            this.downloadedUri = downloadedUri;
        }
    }

    private final List<Tab> tabs = new ArrayList<>();
    private Tab selected;
    private BrowserStore store;
    private FrameLayout activityRoot;
    private LinearLayout root;
    private FrameLayout contentStack;
    private FrameLayout webHost;
    private EditText address;
    private MobileSearchPanel searchPanel;
    private TextView tabCounter;
    private ProgressBar progress;
    private TextView bookmarkButton;
    private TextView blockerButton;
    private android.webkit.ValueCallback<Uri[]> fileCallback;
    private PendingMediaPermission pendingMediaPermission;
    private PendingLocationPermission pendingLocationPermission;
    private PendingDownload pendingDownload;
    private AndroidUpdateController updateController;
    private BroadcastReceiver updateDownloadReceiver;
    private ExecutorService updateDownloadVerificationExecutor;
    private AlertDialog updateDownloadDialog;
    private AndroidUpdateManifest pendingAppUpdate;
    private UpdateDownloadOutcome deferredUpdateDownloadOutcome;
    private UpdateDownloadOutcome pendingInstallerOutcome;
    private long updateDownloadId = -1L;
    private long updateDownloadVerificationId = -1L;
    private Object updateDownloadVerificationToken;
    private boolean updateDownloadVerificationRunning;
    private boolean updateDownloadVerified;
    private Uri verifiedUpdateDownloadUri;
    private boolean activityResumed;
    private final Map<String, String> privateSitePermissionStates = new HashMap<>();
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    // Private controls are read by WebView's request-filter thread. Publish
    // immutable snapshots so an in-progress request never races a UI update.
    private volatile String privateBlockerMode;
    private volatile Set<String> privateBlockerExceptions = Collections.emptySet();
    private boolean blockerToolbarRefreshQueued;

    private int dp(int dp) { return Math.round(dp * getResources().getDisplayMetrics().density); }

    private String appVersionName() {
        try {
            String value = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            return value == null || value.trim().isEmpty() ? "neznámá" : value.trim();
        } catch (PackageManager.NameNotFoundException ignored) {
            return "neznámá";
        }
    }

    private long appVersionCode() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).getLongVersionCode();
        } catch (PackageManager.NameNotFoundException ignored) {
            // The running package must exist; keep the updater disabled rather
            // than comparing a guessed version if Android reports otherwise.
            return -1L;
        }
    }

    private GradientDrawable shape(int fill, int border, int radius) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(fill);
        d.setCornerRadius(dp(radius));
        d.setStroke(dp(1), border);
        return d;
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        store = new BrowserStore(this);
        if (privateSession()) privateBlockerMode = store.blockerMode();
        getWindow().setStatusBarColor(INK);
        getWindow().setNavigationBarColor(INK);
        getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        WebView.setWebContentsDebuggingEnabled(false);
        buildUi();
        if (!privateSession() && AndroidUpdateManifest.PACKAGE_ID.equals(getPackageName())) {
            long installedVersionCode = appVersionCode();
            if (installedVersionCode > 0L) {
                registerUpdateActivity();
                restorePendingUpdateDownload(installedVersionCode);
                updateController = new AndroidUpdateController(
                    this, installedVersionCode, this::downloadAppUpdate);
            }
        }
        String launch = getIntent().getDataString();
        MobileNavigation.Destination launchDestination = MobileNavigation.resolve(launch);
        String initialUrl = launch != null && !launchDestination.search && !launchDestination.isHome()
            ? launchDestination.url : HOME;
        prepareInitialWebData(() -> {
            if (!isFinishing() && !isDestroyed()) createTab(initialUrl, true);
        });
    }

    private void buildUi() {
        activityRoot = new FrameLayout(this);
        activityRoot.setBackgroundColor(INK);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(INK);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            int top, bottom;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                top = bars.top; bottom = bars.bottom;
            } else {
                top = insets.getSystemWindowInsetTop();
                bottom = insets.getSystemWindowInsetBottom();
            }
            view.setPadding(0, top, 0, bottom);
            return insets;
        });
        activityRoot.addView(root, new FrameLayout.LayoutParams(-1, -1));
        setContentView(activityRoot);

        LinearLayout brandRow = new LinearLayout(this);
        brandRow.setGravity(Gravity.CENTER_VERTICAL);
        brandRow.setPadding(dp(15), dp(8), dp(12), dp(5));
        ImageView symbol = new ImageView(this);
        try {
            symbol.setImageBitmap(BitmapFactory.decodeStream(getAssets().open("YamaSearch-symbol-256.png")));
        } catch (Exception ignored) {
            symbol.setImageResource(R.drawable.yamasearch_logo);
        }
        brandRow.addView(symbol, new LinearLayout.LayoutParams(dp(28), dp(28)));
        TextView brand = new TextView(this);
        brand.setText(privateSession() ? "YamaSearch · Soukromé" : "YamaSearch");
        brand.setTextColor(CYAN);
        brand.setTextSize(18);
        brand.setTypeface(null, android.graphics.Typeface.BOLD);
        LinearLayout.LayoutParams brandParams = new LinearLayout.LayoutParams(0, dp(37), 1);
        brandParams.leftMargin = dp(9);
        brand.setGravity(Gravity.CENTER_VERTICAL);
        brandRow.addView(brand, brandParams);
        TextView menu = action("⋮", () -> openMenu());
        brandRow.addView(menu);
        brandRow.setClickable(true);
        brandRow.setFocusable(true);
        brandRow.setContentDescription("Domovská stránka YamaSearch");
        brandRow.setOnClickListener(view -> navigateHome());
        root.addView(brandRow, new LinearLayout.LayoutParams(-1, dp(47)));

        LinearLayout inputRow = new LinearLayout(this);
        inputRow.setPadding(dp(11), dp(2), dp(11), dp(8));
        inputRow.setGravity(Gravity.CENTER_VERTICAL);
        address = new EditText(this);
        address.setSingleLine(true);
        address.setTextColor(Color.WHITE);
        address.setHintTextColor(MUTED);
        address.setHint("Zadejte adresu nebo hledat");
        address.setTextSize(14);
        address.setPadding(dp(12), 0, dp(12), 0);
        address.setBackground(shape(PANEL, Color.rgb(49, 70, 91), 12));
        address.setSelectAllOnFocus(true);
        address.setImeOptions(EditorInfo.IME_ACTION_GO);
        address.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        address.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_GO || (event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER)) {
                navigate(address.getText().toString());
                address.clearFocus();
                InputMethodManager keyboard = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
                keyboard.hideSoftInputFromWindow(address.getWindowToken(), 0);
                return true;
            }
            return false;
        });
        inputRow.addView(address, new LinearLayout.LayoutParams(0, dp(43), 1));
        TextView suggestions = action("⌄", () -> {
            if (searchPanel == null) return;
            if (searchPanel.isVisible()) searchPanel.hide();
            else searchPanel.show(address.getText().toString());
        });
        suggestions.setTextSize(18);
        suggestions.setContentDescription("Zobrazit návrhy hledání");
        suggestions.setTooltipText("Návrhy hledání");
        suggestions.setBackground(shape(PANEL, Color.rgb(49, 70, 91), 12));
        LinearLayout.LayoutParams suggestionParams = new LinearLayout.LayoutParams(dp(43), dp(43));
        suggestionParams.leftMargin = dp(7);
        inputRow.addView(suggestions, suggestionParams);
        root.addView(inputRow);

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        progress.setProgressTintList(android.content.res.ColorStateList.valueOf(CYAN));
        root.addView(progress, new LinearLayout.LayoutParams(-1, dp(2)));

        contentStack = new FrameLayout(this);
        contentStack.setBackgroundColor(INK);
        webHost = new FrameLayout(this);
        webHost.setBackgroundColor(INK);
        contentStack.addView(webHost, new FrameLayout.LayoutParams(-1, -1));
        searchPanel = new MobileSearchPanel(this, store, privateSession(), new MobileSearchPanel.Listener() {
            @Override public void navigate(String input) { BrowserActivity.this.navigate(input); }
            @Override public void storedSearchesChanged() { refreshHomeTabs(); }
        });
        FrameLayout.LayoutParams searchParams = new FrameLayout.LayoutParams(-1, dp(360), Gravity.TOP);
        searchParams.leftMargin = dp(9);
        searchParams.rightMargin = dp(9);
        searchParams.topMargin = dp(5);
        contentStack.addView(searchPanel.view(), searchParams);
        root.addView(contentStack, new LinearLayout.LayoutParams(-1, 0, 1));

        address.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence value, int start, int count, int after) { }
            @Override public void onTextChanged(CharSequence value, int start, int before, int count) {
                if (address.hasFocus() && searchPanel != null) searchPanel.show(value == null ? "" : value.toString());
            }
            @Override public void afterTextChanged(Editable value) { }
        });
        address.setOnFocusChangeListener((view, focused) -> {
            if (focused && searchPanel != null) searchPanel.show(address.getText().toString());
        });

        LinearLayout nav = new LinearLayout(this);
        nav.setBackgroundColor(PANEL);
        nav.setGravity(Gravity.CENTER);
        addNav(nav, "←", () -> {
            if (searchPanel != null && searchPanel.isVisible()) searchPanel.hide();
            else if (selected != null && selected.web.canGoBack()) selected.web.goBack();
        });
        addNav(nav, "→", () -> { if (selected != null && selected.web.canGoForward()) selected.web.goForward(); });
        addNav(nav, "⟳", () -> {
            if (selected == null) return;
            if (selected.isHome) refreshHomeInPlace(selected);
            else selected.web.reload();
        });
        bookmarkButton = action("☆", this::toggleBookmark);
        nav.addView(bookmarkButton, new LinearLayout.LayoutParams(0, dp(52), 1));
        blockerButton = action("⬢", this::openYamaBlockPanel);
        blockerButton.setTextSize(20);
        nav.addView(blockerButton, new LinearLayout.LayoutParams(0, dp(52), 1));
        tabCounter = action("0 ▢", this::chooseTab);
        nav.addView(tabCounter, new LinearLayout.LayoutParams(0, dp(52), 1));
        root.addView(nav, new LinearLayout.LayoutParams(-1, dp(54)));
    }

    private TextView action(String label, Runnable click) {
        TextView view = new TextView(this);
        view.setText(label);
        view.setTextSize(23);
        view.setTextColor(Color.WHITE);
        view.setGravity(Gravity.CENTER);
        view.setOnClickListener(v -> click.run());
        return view;
    }

    private void addNav(LinearLayout row, String label, Runnable action) {
        row.addView(action(label, action), new LinearLayout.LayoutParams(0, dp(52), 1));
    }

    private void navigate(String text) {
        if (selected == null) return;
        MobileNavigation.Destination destination = MobileNavigation.resolve(text);
        if (searchPanel != null) searchPanel.hide();
        address.clearFocus();
        if (destination.isHome()) {
            navigateHome();
            return;
        }
        selected.homeNavigationPending = false;
        selected.isHome = false;
        if (!privateSession() && destination.search) {
            BrowserStore.ProfileSettings profile = store.profileSettings();
            if (profile.rememberSearches) {
                store.recordSearch(destination.input);
                refreshHomeTabs();
            }
        }
        prepareYamaBlockForNavigation(selected, destination.url);
        selected.web.loadUrl(destination.url);
    }

    private void navigateHome() {
        if (selected == null) return;
        if (searchPanel != null) searchPanel.hide();
        address.clearFocus();
        if (selected.isHome && selected.homeDocumentUrl.equals(selected.web.getUrl()))
            refreshHomeInPlace(selected);
        else
            loadHome(selected);
    }

    private boolean hostMatches(String host, String[] entries) {
        for (String suffix : entries)
            if (host.equals(suffix) || host.endsWith("." + suffix)) return true;
        return false;
    }

    private String normalizeHost(String host) {
        if (host == null) return "";
        String normalized = host.trim().toLowerCase(Locale.ROOT);
        return normalized.matches("[a-z0-9.-]+") && !normalized.startsWith(".") && !normalized.endsWith(".")
            ? normalized : "";
    }

    private String blockerMode() {
        if (!privateSession()) return store.blockerMode();
        String mode = privateBlockerMode;
        return mode == null ? "strict" : mode;
    }

    private void setBlockerMode(String mode) {
        if (!"off".equals(mode) && !"standard".equals(mode) && !"strict".equals(mode)) return;
        if (privateSession()) privateBlockerMode = mode;
        else store.setBlockerMode(mode);
        refreshYamaBlockPageFilters();
    }

    private boolean isBlockerDisabledForHost(String host) {
        String safeHost = normalizeHost(host);
        if (safeHost.isEmpty()) return false;
        return privateSession() ? privateBlockerExceptions.contains(safeHost)
            : store.isBlockerDisabledForHost(safeHost);
    }

    private void setBlockerDisabledForHost(String host, boolean disabled) {
        String safeHost = normalizeHost(host);
        if (safeHost.isEmpty()) return;
        if (privateSession()) {
            Set<String> updated = new HashSet<>(privateBlockerExceptions);
            if (disabled) updated.add(safeHost);
            else updated.remove(safeHost);
            privateBlockerExceptions = Collections.unmodifiableSet(updated);
        } else {
            store.setBlockerDisabledForHost(safeHost, disabled);
        }
        refreshYamaBlockPageFilters();
    }

    private void refreshYamaBlockPageFilters() {
        for (Tab tab : tabs) {
            if (tab.yamaBlockPageFilter == null) continue;
            String url = tab.web.getUrl();
            boolean changed = tab.yamaBlockPageFilter.update(yamaBlockEnabledForUrl(url));
            // The page hook is deliberately closure-only: it exposes no writable
            // switch to web content. Reloading an already open YouTube document
            // is therefore the clean way to apply an off/exception change and to
            // restore the untouched native page APIs when blocking is disabled.
            if (changed && isYouTubeHost(hostForUrl(url))) tab.web.reload();
        }
    }

    private boolean yamaBlockEnabledForUrl(String url) {
        if ("off".equals(blockerMode())) return false;
        String host = hostForUrl(url);
        return !isYouTubeHost(host) || !isBlockerDisabledForHost(host);
    }

    private boolean isYouTubeHost(String host) {
        return "youtube.com".equals(host) || (host != null && host.endsWith(".youtube.com"));
    }

    private void prepareYamaBlockForNavigation(Tab tab, String url) {
        if (tab != null && tab.yamaBlockPageFilter != null)
            tab.yamaBlockPageFilter.update(yamaBlockEnabledForUrl(url));
    }

    private String hostForUrl(String url) {
        if (url == null || url.trim().isEmpty()) return "";
        try { return normalizeHost(Uri.parse(url).getHost()); }
        catch (Exception ignored) { return ""; }
    }

    private String pageHost(Tab tab) {
        return tab == null ? "" : tab.topLevelHost;
    }

    private boolean isBlocked(Tab tab, Uri url, boolean mainFrame) {
        if (mainFrame) return false;
        String mode = blockerMode();
        if ("off".equals(mode)) return false;
        String scheme = url.getScheme();
        String host = url.getHost();
        if (host == null || (!"http".equals(scheme) && !"https".equals(scheme))) return false;
        if (isBlockerDisabledForHost(pageHost(tab))) return false;
        host = normalizeHost(host);
        if (host.isEmpty()) return false;
        return hostMatches(host, AD_HOSTS)
            || ("strict".equals(mode) && hostMatches(host, TRACKER_HOSTS));
    }

    private void recordBlocked(Tab tab) {
        if (isFinishing() || isDestroyed()) return;
        synchronized (tab) { tab.blockedCount++; }
        synchronized (this) {
            if (blockerToolbarRefreshQueued) return;
            blockerToolbarRefreshQueued = true;
        }
        runOnUiThread(() -> {
            synchronized (BrowserActivity.this) { blockerToolbarRefreshQueued = false; }
            if (isFinishing() || isDestroyed()) return;
            if (selected == tab) refreshToolbar();
        });
    }

    private boolean handleInternalNavigation(Tab tab, WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        if (!"yamasearch".equalsIgnoreCase(uri.getScheme())) return false;
        // Only the selected, locally rendered home page may invoke native actions.
        // A normal web page or a hidden/background tab must never be able to
        // navigate a different tab, persist a search, or open privileged UI.
        if (!request.isForMainFrame() || tab != selected || view != tab.web
            || !tab.isHome || !tab.homeDocumentUrl.equals(view.getUrl())) return true;
        String action = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        switch (action) {
            case "search":
                navigate(uri.getQueryParameter("q"));
                break;
            case "profile":
                showProfilePanel();
                break;
            case "favorites":
                showBookmarks();
                break;
            case "history":
                if (!privateSession()) showEntries("Historie", store.history(), true);
                break;
            default:
                break;
        }
        return true;
    }

    private String renderHomeHtml(Tab tab) {
        if (tab == null || tab.web == null) return "";
        String html;
        if (privateSession()) {
            html = MobileHomePage.render(true, "Soukromé okno",
                Collections.emptyList(), Collections.emptyList(), 0, false, false);
            tab.title = "Soukromá karta";
        } else {
            BrowserStore.ProfileSettings profile = store.profileSettings();
            List<BrowserStore.Entry> favorites = store.bookmarks();
            List<BrowserStore.SearchEntry> searches = profile.showRecentSearches
                ? store.recentSearches(6) : Collections.emptyList();
            html = MobileHomePage.render(false, profile.displayName, favorites, searches,
                store.history().size(), profile.showFavoritesOnHome, profile.showRecentSearches);
            tab.title = "Domů";
        }
        tab.topLevelHost = "";
        tab.favicon = "";
        synchronized (tab) { tab.blockedCount = 0; }
        return html;
    }

    private void loadHome(Tab tab) {
        if (tab == null || tab.web == null) return;
        String html = renderHomeHtml(tab);
        tab.homeContentDirty = false;
        tab.homeNavigationPending = true;
        // Trust is granted only to this tab's unguessable synthetic document URL.
        // The marker also survives a legitimate Back/Forward history restore.
        tab.isHome = true;
        prepareYamaBlockForNavigation(tab, tab.homeDocumentUrl);
        tab.web.loadDataWithBaseURL(tab.homeDocumentUrl, html, "text/html", "UTF-8", null);
    }

    private void refreshHomeInPlace(Tab tab) {
        if (tab == null || tab.web == null || !tab.isHome
            || !tab.homeDocumentUrl.equals(tab.web.getUrl())) return;
        String html = renderHomeHtml(tab);
        tab.homeContentDirty = false;
        try {
            // Replacing the trusted local document in place keeps WebView's back
            // list unchanged, unlike another loadDataWithBaseURL navigation.
            tab.web.evaluateJavascript("document.open();document.write("
                + JSONObject.quote(html) + ");document.close();", null);
        } catch (IllegalStateException ignored) {
            tab.homeContentDirty = true;
        }
        if (selected == tab) refreshToolbar();
    }

    private void refreshHomeTabs() {
        if (privateSession()) return;
        for (Tab tab : new ArrayList<>(tabs)) {
            if (!tab.isHome) continue;
            tab.homeContentDirty = true;
            // Keep hidden renderers asleep; they refresh when selected.
            if (tab == selected) refreshHomeInPlace(tab);
        }
        if (address != null && address.hasFocus() && searchPanel != null && searchPanel.isVisible())
            searchPanel.show(address.getText().toString());
    }

    private void showProfilePanel() {
        MobileProfileDialog.show(this, store, privateSession(), this::refreshHomeTabs);
    }

    private void configureWebAuthentication(WebSettings settings) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_AUTHENTICATION)) return;

        int support = WebSettingsCompat.WEB_AUTHENTICATION_SUPPORT_NONE;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            RoleManager roles = getSystemService(RoleManager.class);
            if (roles != null && roles.isRoleHeld(RoleManager.ROLE_BROWSER))
                support = WebSettingsCompat.WEB_AUTHENTICATION_SUPPORT_FOR_BROWSER;
        }

        try {
            // Android permits WebAuthn on behalf of arbitrary sites only to the
            // selected browser. Credential providers may additionally require
            // their own privileged-caller approval; the page receives a normal
            // WebAuthn failure when that approval is not available.
            WebSettingsCompat.setWebAuthenticationSupport(settings, support);
        } catch (UnsupportedOperationException | SecurityException ignored) {
            // Keep browsing functional on older WebView/provider combinations.
        }
    }

    @SuppressLint({"SetJavaScriptEnabled", "ClickableViewAccessibility"})
    private void createTab(String firstUrl, boolean activate) {
        createTab(firstUrl, activate, false);
    }

    @SuppressLint({"SetJavaScriptEnabled", "ClickableViewAccessibility"})
    private Tab createTab(String firstUrl, boolean activate, boolean deferInitialNavigation) {
        WebView web = new WebView(this);
        web.setOnTouchListener((view, event) -> {
            if (event.getActionMasked() == MotionEvent.ACTION_DOWN && searchPanel != null && searchPanel.isVisible()) {
                searchPanel.hide();
                address.clearFocus();
            }
            return false;
        });
        Tab tab = new Tab(web);
        tab.topLevelHost = hostForUrl(firstUrl);
        tabs.add(tab);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setSafeBrowsingEnabled(true);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        configureWebAuthentication(settings);
        if (privateSession()) {
            settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
            // The private activity has its own WebView data-directory suffix. Keep
            // first-party cookies usable for a private login during this session;
            // rejecting every cookie here broke otherwise ordinary web sites.
            CookieManager.getInstance().setAcceptCookie(true);
            CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        } else {
            CookieManager.getInstance().setAcceptCookie(true);
            CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        }
        // Register before the first loadUrl(). Unlike onPageStarted(), this lets
        // YamaBlock see YouTube's initial inline player response deterministically.
        tab.yamaBlockPageFilter = new YamaBlockPageFilter(
            this, web, !deferInitialNavigation && yamaBlockEnabledForUrl(firstUrl));
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (handleInternalNavigation(tab, view, request)) return true;
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("http".equals(scheme) || "https".equals(scheme) || "about".equals(scheme)) {
                    if (request.isForMainFrame()) {
                        tab.homeNavigationPending = false;
                        tab.isHome = false;
                        prepareYamaBlockForNavigation(tab, uri.toString());
                    }
                    return false;
                }
                if ("tel".equals(scheme) || "mailto".equals(scheme) || "geo".equals(scheme)) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                    catch (ActivityNotFoundException ignored) { }
                }
                return true;
            }

            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (isBlocked(tab, request.getUrl(), request.isForMainFrame())) {
                    recordBlocked(tab);
                    return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
                }
                return null;
            }

            @Override public void onPageStarted(WebView view, String url, Bitmap favicon) {
                // The per-tab unguessable .invalid URL survives Back/Forward and
                // renderer restores, while a web page cannot manufacture trust by
                // navigating to a public or static address.
                boolean trustedHome = tab.homeDocumentUrl.equals(url);
                tab.homeNavigationPending = false;
                tab.isHome = trustedHome;
                if (trustedHome) tab.homeContentDirty = false;

                if (tab.yamaBlockPageFilter != null) {
                    boolean filterChanged = tab.yamaBlockPageFilter.update(yamaBlockEnabledForUrl(url));
                    if (filterChanged && isYouTubeHost(hostForUrl(url))) {
                        // A redirect may bypass shouldOverrideUrlLoading. Restart
                        // once with the correct document-start registration.
                        view.stopLoading();
                        view.post(view::reload);
                        return;
                    }
                    tab.yamaBlockPageFilter.onPageStarted();
                }
                // Do not accidentally assign the preceding page's icon to a new bookmark
                // while its own favicon is still being loaded.
                cancelSitePermissionsForTab(tab);
                tab.navigationGeneration++;
                tab.topLevelHost = tab.isHome ? "" : hostForUrl(url);
                tab.favicon = "";
                synchronized (tab) { tab.blockedCount = 0; }
                if (selected == tab) refreshToolbar();
            }

            @Override public void onPageFinished(WebView view, String url) {
                String currentUrl = view.getUrl();
                if (url == null || currentUrl == null || !url.equals(currentUrl)) return;
                tab.isHome = tab.homeDocumentUrl.equals(url);
                if (tab.isHome) {
                    tab.homeNavigationPending = false;
                    tab.homeContentDirty = false;
                }
                if (!privateSession() && !tab.isHome && MobileNavigation.isWebUrl(url))
                    store.addHistory(url, tab.title);
                if (selected == tab) refreshToolbar();
            }

            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
                runOnUiThread(() -> Toast.makeText(BrowserActivity.this,
                    "Zabezpečené připojení selhalo. Stránka nebyla načtena.", Toast.LENGTH_LONG).show());
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onReceivedTitle(WebView view, String title) {
                tab.title = title == null || title.trim().isEmpty() ? "Nová karta" : title;
                if (!privateSession() && !tab.isHome && !tab.homeNavigationPending) {
                    String url = view.getUrl();
                    if (url != null) store.updateBookmarkMetadata(url, tab.title, tab.favicon);
                }
                if (selected == tab) refreshToolbar();
            }
            @Override public void onReceivedIcon(WebView view, Bitmap icon) {
                tab.favicon = BrowserStore.encodeFavicon(icon);
                if (!privateSession() && !tab.isHome) {
                    String url = view.getUrl();
                    if (url != null) store.updateBookmarkMetadata(url, tab.title, tab.favicon);
                }
            }
            @Override public void onProgressChanged(WebView view, int value) {
                if (selected == tab) {
                    progress.setProgress(value);
                    progress.setVisibility(value == 100 ? View.INVISIBLE : View.VISIBLE);
                }
            }
            @Override public boolean onCreateWindow(WebView view, boolean dialog, boolean userGesture, Message result) {
                if (!userGesture) return false;
                // WebViewTransport requires a fresh WebView. Loading our home
                // document first can break or crash target=_blank/OAuth popups.
                Tab popup = createTab(HOME, true, true);
                WebView.WebViewTransport transport = (WebView.WebViewTransport) result.obj;
                transport.setWebView(popup.web);
                result.sendToTarget();
                return true;
            }
            @Override public void onCloseWindow(WebView window) {
                if (window != web) return;
                runOnUiThread(() -> {
                    if (!isFinishing() && !isDestroyed()) closeTab(tab);
                });
            }
            @Override public boolean onShowFileChooser(WebView view,
                android.webkit.ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_PICKER);
                    return true;
                } catch (Exception e) {
                    fileCallback = null;
                    callback.onReceiveValue(null);
                    return false;
                }
            }
            @Override public void onShowCustomView(View view, CustomViewCallback callback) {
                runOnUiThread(() -> {
                    if (isFinishing() || isDestroyed()) {
                        callback.onCustomViewHidden();
                        return;
                    }
                    showCustomView(view, callback);
                });
            }
            @Override public void onHideCustomView() {
                runOnUiThread(BrowserActivity.this::hideCustomView);
            }
            @Override public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> handleSitePermission(tab, web, request));
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                runOnUiThread(() -> {
                    if (pendingMediaPermission != null && pendingMediaPermission.request == request)
                        cancelMediaPermission(pendingMediaPermission, false);
                });
            }
            @Override public void onGeolocationPermissionsShowPrompt(String origin,
                    GeolocationPermissions.Callback callback) {
                runOnUiThread(() -> handleGeolocationPermission(tab, web, origin, callback));
            }
            @Override public void onGeolocationPermissionsHidePrompt() {
                runOnUiThread(() -> cancelGeolocationPrompt(tab, web));
            }
        });

        web.setDownloadListener((url, userAgent, disposition, mime, size) ->
            download(url, userAgent, disposition, mime));
        if (activate) showTab(tab);
        if (!deferInitialNavigation) {
            if (HOME.equals(firstUrl)) {
                loadHome(tab);
            } else {
                tab.isHome = false;
                prepareYamaBlockForNavigation(tab, firstUrl);
                web.loadUrl(firstUrl);
            }
        }
        refreshToolbar();
        return tab;
    }

    private void showTab(Tab tab) {
        if (searchPanel != null) searchPanel.hide();
        if (address != null) address.clearFocus();
        if (selected != null) {
            cancelSitePermissionsForTab(selected);
            selected.web.onPause();
        }
        webHost.removeAllViews();
        selected = tab;
        if (tab.web.getParent() instanceof ViewGroup)
            ((ViewGroup) tab.web.getParent()).removeView(tab.web);
        webHost.addView(tab.web, new FrameLayout.LayoutParams(-1, -1));
        tab.web.onResume();
        if (tab.isHome && tab.homeContentDirty) refreshHomeInPlace(tab);
        refreshToolbar();
    }

    private void refreshToolbar() {
        if (selected == null || address == null) return;
        String url = selected.web.getUrl();
        if (!address.hasFocus()) address.setText(selected.isHome || url == null
            || url.startsWith("about:") || url.startsWith("data:") ? "" : url);
        tabCounter.setText(tabs.size() + " ▢");
        bookmarkButton.setText(!privateSession() && !selected.isHome && url != null
            && store.isBookmarked(url) ? "★" : "☆");
        refreshBlockerButton();
    }

    private void refreshBlockerButton() {
        if (blockerButton == null || selected == null) return;
        int blocked;
        synchronized (selected) { blocked = selected.blockedCount; }
        String mode = blockerMode();
        String host = pageHost(selected);
        boolean exception = !host.isEmpty() && isBlockerDisabledForHost(host);
        boolean active = !"off".equals(mode) && !exception;
        blockerButton.setText(blocked > 0 ? "⬢\n" + blocked : (active ? "⬢" : "○"));
        blockerButton.setTextSize(blocked > 0 ? 13 : 20);
        blockerButton.setTextColor(active ? CYAN : MUTED);
        String label = "YamaBlock · " + blockerModeLabel(mode)
            + (exception ? " · výjimka pro " + host : "")
            + " · " + blocked + " blokováno v této kartě";
        blockerButton.setContentDescription(label);
        blockerButton.setTooltipText(label);
    }

    private void toggleBookmark() {
        if (selected == null || privateSession()) {
            Toast.makeText(this, "V soukromém režimu se záložky neukládají.", Toast.LENGTH_SHORT).show();
            return;
        }
        String url = selected.web.getUrl();
        if (selected.isHome || !MobileNavigation.isWebUrl(url)) return;
        store.toggleBookmark(url, selected.title, selected.favicon);
        refreshToolbar();
        refreshHomeTabs();
    }

    private void chooseTab() {
        List<String> titles = new ArrayList<>();
        for (Tab tab : tabs) titles.add((tab == selected ? "● " : "") + tab.title);
        titles.add("＋ Nová karta");
        titles.add("✕ Zavřít aktuální kartu");
        new AlertDialog.Builder(this).setTitle("Otevřené karty")
            .setItems(titles.toArray(new String[0]), (dialog, which) -> {
                if (which < tabs.size()) showTab(tabs.get(which));
                else if (which == tabs.size()) createTab(HOME, true);
                else closeTab();
            }).show();
    }

    private void closeTab() {
        closeTab(selected);
    }

    private void closeTab(Tab old) {
        if (old == null || !tabs.contains(old)) return;
        cancelSitePermissionsForTab(old);
        int index = tabs.indexOf(old);
        boolean wasSelected = old == selected;
        tabs.remove(old);
        webHost.removeView(old.web);
        if (wasSelected) selected = null;
        old.web.stopLoading();
        if (old.yamaBlockPageFilter != null) old.yamaBlockPageFilter.destroy();
        old.web.destroy();
        if (wasSelected) {
            if (tabs.isEmpty()) createTab(HOME, true);
            else showTab(tabs.get(Math.min(index, tabs.size() - 1)));
        } else {
            refreshToolbar();
        }
    }

    private void showEntries(String title, List<BrowserStore.Entry> entries, boolean history) {
        if (privateSession()) return;
        String[] labels = new String[entries.size()];
        for (int i = 0; i < entries.size(); i++)
            labels[i] = entries.get(i).title + "\n" + entries.get(i).url;
        AlertDialog.Builder builder = new AlertDialog.Builder(this).setTitle(title)
            .setItems(labels, (dialog, index) -> navigate(entries.get(index).url));
        if (history) builder.setNeutralButton("Vymazat historii", (d, w) ->
            new AlertDialog.Builder(this).setMessage("Opravdu smazat historii YamaSearch?")
                .setNegativeButton("Zrušit", null)
                .setPositiveButton("Smazat", (a, b) -> {
                    store.clearHistory();
                    refreshHomeTabs();
                }).show());
        builder.setNegativeButton("Zavřít", null).show();
    }

    private void showBookmarks() {
        if (privateSession()) return;
        new BookmarksDialog().show();
    }

    /**
     * A small native sheet instead of a plain string list. It deliberately keeps the
     * changes local to the saved bookmark collection: tabs, history and page data are
     * never changed when a card is reordered or removed.
     */
    private final class BookmarksDialog {
        private final LinearLayout cards;
        private final AlertDialog dialog;
        private BrowserStore.Entry undoEntry;
        private int undoIndex = -1;

        BookmarksDialog() {
            ScrollView scroll = new ScrollView(BrowserActivity.this);
            scroll.setFillViewport(true);
            scroll.setPadding(dp(2), dp(4), dp(2), dp(4));
            cards = new LinearLayout(BrowserActivity.this);
            cards.setOrientation(LinearLayout.VERTICAL);
            scroll.addView(cards, new ScrollView.LayoutParams(-1, -2));

            dialog = new AlertDialog.Builder(BrowserActivity.this)
                .setTitle("Oblíbené stránky")
                .setView(scroll)
                .setNeutralButton("Vrátit", null)
                .setNegativeButton("Zavřít", null)
                .create();
        }

        void show() {
            dialog.setOnShowListener(ignored -> {
                TextView undo = dialog.getButton(AlertDialog.BUTTON_NEUTRAL);
                undo.setVisibility(View.GONE);
                undo.setOnClickListener(view -> restoreLastRemoval());
                render();
            });
            dialog.show();
        }

        private void render() {
            cards.removeAllViews();
            List<BrowserStore.Entry> entries = store.bookmarks();
            if (entries.isEmpty()) {
                TextView empty = new TextView(BrowserActivity.this);
                empty.setText("Zatím nemáte uložené žádné oblíbené stránky.");
                empty.setTextColor(MUTED);
                empty.setTextSize(15);
                empty.setGravity(Gravity.CENTER);
                empty.setPadding(dp(18), dp(36), dp(18), dp(36));
                cards.addView(empty, new LinearLayout.LayoutParams(-1, -2));
                return;
            }
            for (int index = 0; index < entries.size(); index++) {
                LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
                if (index > 0) params.topMargin = dp(8);
                cards.addView(createBookmarkCard(entries.get(index), index, entries.size()), params);
            }
        }

        private View createBookmarkCard(BrowserStore.Entry entry, int index, int count) {
            LinearLayout card = new LinearLayout(BrowserActivity.this);
            card.setGravity(Gravity.CENTER_VERTICAL);
            card.setPadding(dp(10), dp(9), dp(8), dp(9));
            card.setBackground(shape(PANEL, Color.rgb(49, 70, 91), 13));
            card.setClickable(true);
            card.setFocusable(true);
            card.setContentDescription("Otevřít " + bookmarkTitle(entry));
            card.setOnClickListener(view -> {
                dialog.dismiss();
                navigate(entry.url);
            });

            card.addView(bookmarkIcon(entry), new LinearLayout.LayoutParams(dp(42), dp(42)));

            LinearLayout labels = new LinearLayout(BrowserActivity.this);
            labels.setOrientation(LinearLayout.VERTICAL);
            labels.setGravity(Gravity.CENTER_VERTICAL);
            LinearLayout.LayoutParams labelParams = new LinearLayout.LayoutParams(0, -2, 1);
            labelParams.leftMargin = dp(10);
            labelParams.rightMargin = dp(7);
            TextView title = new TextView(BrowserActivity.this);
            title.setText(bookmarkTitle(entry));
            title.setTextColor(Color.WHITE);
            title.setTextSize(16);
            title.setSingleLine(true);
            title.setEllipsize(android.text.TextUtils.TruncateAt.END);
            TextView domain = new TextView(BrowserActivity.this);
            domain.setText(bookmarkDomain(entry.url));
            domain.setTextColor(MUTED);
            domain.setTextSize(13);
            domain.setSingleLine(true);
            domain.setEllipsize(android.text.TextUtils.TruncateAt.END);
            labels.addView(title, new LinearLayout.LayoutParams(-1, -2));
            labels.addView(domain, new LinearLayout.LayoutParams(-1, -2));
            card.addView(labels, labelParams);

            LinearLayout controls = new LinearLayout(BrowserActivity.this);
            controls.setGravity(Gravity.CENTER_VERTICAL);
            TextView up = bookmarkControl("↑", "Posunout výš", CYAN);
            up.setEnabled(index > 0);
            up.setAlpha(index > 0 ? 1f : .35f);
            up.setOnClickListener(view -> {
                store.moveBookmark(index, index - 1);
                refreshHomeTabs();
                render();
            });
            TextView down = bookmarkControl("↓", "Posunout níž", CYAN);
            down.setEnabled(index < count - 1);
            down.setAlpha(index < count - 1 ? 1f : .35f);
            down.setOnClickListener(view -> {
                store.moveBookmark(index, index + 1);
                refreshHomeTabs();
                render();
            });
            TextView remove = bookmarkControl("×", "Odstranit z oblíbených", Color.rgb(232, 103, 117));
            remove.setTextSize(22);
            remove.setOnClickListener(view -> remove(entry, index));
            controls.addView(up, new LinearLayout.LayoutParams(dp(29), dp(34)));
            controls.addView(down, new LinearLayout.LayoutParams(dp(29), dp(34)));
            controls.addView(remove, new LinearLayout.LayoutParams(dp(29), dp(34)));
            card.addView(controls, new LinearLayout.LayoutParams(-2, -2));
            return card;
        }

        private View bookmarkIcon(BrowserStore.Entry entry) {
            FrameLayout frame = new FrameLayout(BrowserActivity.this);
            TextView fallback = new TextView(BrowserActivity.this);
            fallback.setText(bookmarkInitial(entry.url));
            fallback.setTextColor(INK);
            fallback.setTextSize(17);
            fallback.setTypeface(null, android.graphics.Typeface.BOLD);
            fallback.setGravity(Gravity.CENTER);
            fallback.setBackground(shape(CYAN, CYAN, 12));
            frame.addView(fallback, new FrameLayout.LayoutParams(-1, -1));

            Bitmap icon = BrowserStore.decodeFavicon(entry.favicon);
            if (icon != null) {
                ImageView image = new ImageView(BrowserActivity.this);
                image.setImageBitmap(icon);
                image.setScaleType(ImageView.ScaleType.CENTER_CROP);
                image.setContentDescription("Ikona stránky " + bookmarkDomain(entry.url));
                image.setBackground(shape(Color.WHITE, CYAN, 12));
                image.setClipToOutline(true);
                frame.addView(image, new FrameLayout.LayoutParams(-1, -1));
            }
            return frame;
        }

        private TextView bookmarkControl(String label, String description, int color) {
            TextView control = new TextView(BrowserActivity.this);
            control.setText(label);
            control.setTextSize(18);
            control.setTextColor(color);
            control.setGravity(Gravity.CENTER);
            control.setContentDescription(description);
            control.setTooltipText(description);
            control.setBackground(shape(Color.TRANSPARENT, color, 8));
            return control;
        }

        private void remove(BrowserStore.Entry entry, int index) {
            if (!store.removeBookmark(entry.url)) return;
            undoEntry = entry;
            undoIndex = index;
            dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setVisibility(View.VISIBLE);
            Toast.makeText(BrowserActivity.this, "Stránka byla odstraněna. Můžete ji vrátit.", Toast.LENGTH_SHORT).show();
            refreshToolbar();
            refreshHomeTabs();
            render();
        }

        private void restoreLastRemoval() {
            if (undoEntry == null) return;
            store.restoreBookmark(undoEntry, undoIndex);
            undoEntry = null;
            undoIndex = -1;
            dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setVisibility(View.GONE);
            refreshToolbar();
            refreshHomeTabs();
            render();
        }
    }

    private String bookmarkTitle(BrowserStore.Entry entry) {
        String title = entry.title == null ? "" : entry.title.trim().replace('\n', ' ').replace('\r', ' ');
        return title.isEmpty() || title.equals(entry.url) ? bookmarkDomain(entry.url) : title;
    }

    private String bookmarkDomain(String url) {
        try {
            String host = Uri.parse(url).getHost();
            if (host != null && !host.isEmpty())
                return host.startsWith("www.") ? host.substring(4) : host;
        } catch (Exception ignored) { }
        return url;
    }

    private String bookmarkInitial(String url) {
        String domain = bookmarkDomain(url);
        if (domain.isEmpty()) return "★";
        return domain.substring(0, 1).toUpperCase(Locale.ROOT);
    }

    private void openMenu() {
        String[] options = {
            "Nová karta", "Soukromé okno", "Oblíbené stránky", "Historie", "Profil prohlížeče",
            "Oprávnění tohoto webu", "Stažené soubory",
            "YamaBlock: " + blockerModeLabel(blockerMode()), "Zkontrolovat aktualizace", "O aplikaci"
        };
        new AlertDialog.Builder(this).setTitle("YamaSearch").setItems(options, (dialog, which) -> {
            switch (which) {
                case 0: createTab(HOME, true); break;
                case 1: if (!privateSession()) startActivity(new Intent(this, PrivateBrowserActivity.class)); break;
                case 2: showBookmarks(); break;
                // A private activity runs in another process and must not even read
                // the normal profile's persisted history before deciding to hide it.
                case 3: if (!privateSession()) showEntries("Historie", store.history(), true); break;
                case 4: showProfilePanel(); break;
                case 5: openSitePermissionsPanel(); break;
                case 6: try { startActivity(new Intent(DownloadManager.ACTION_VIEW_DOWNLOADS)); }
                        catch (ActivityNotFoundException e) { Toast.makeText(this, "Správce stahování není dostupný.", Toast.LENGTH_SHORT).show(); }
                        break;
                case 7: openYamaBlockPanel(); break;
                case 8:
                    if (updateController != null) updateController.checkManually();
                    else Toast.makeText(this, "Aktualizace kontrolujte v běžném okně YamaSearch.", Toast.LENGTH_LONG).show();
                    break;
                case 9: new AlertDialog.Builder(this).setTitle("YamaSearch pro Android")
                    .setMessage("Verze " + appVersionName() + ". Mobilní domovská stránka, místní profil, oblíbené, historie hledání, soukromé karty, YamaBlock a automatická upozornění na aktualizace.")
                    .setPositiveButton("OK", null).show(); break;
                default: break;
            }
        }).show();
    }

    private String blockerModeLabel(String mode) {
        if ("off".equals(mode)) return "Vypnuto";
        if ("strict".equals(mode)) return "Přísný";
        return "Standard";
    }

    private void openYamaBlockPanel() {
        String[] labels = {"Vypnuto", "Standard", "Přísný"};
        String[] values = {"off", "standard", "strict"};
        String mode = blockerMode();
        int active = java.util.Arrays.asList(values).indexOf(mode);
        if (active < 0) active = 2;
        String host = pageHost(selected);
        int blocked = 0;
        if (selected != null) synchronized (selected) { blocked = selected.blockedCount; }
        boolean exception = !host.isEmpty() && isBlockerDisabledForHost(host);
        String modeDescription = "strict".equals(mode)
            ? "Přísný režim blokuje známé reklamní i sledovací požadavky."
            : "standard".equals(mode)
                ? "Standardní režim blokuje známé reklamní požadavky."
                : "Filtrování je vypnuté.";
        String scope = host.isEmpty() ? "Pro interní stránku nelze vytvořit výjimku."
            : exception ? "Pro " + host + " je aktivní výjimka."
                : "Pro " + host + " je filtrování aktivní.";
        AlertDialog.Builder builder = new AlertDialog.Builder(this)
            .setTitle("YamaBlock – filtrování požadavků")
            .setMessage(modeDescription + "\n\nAktuální karta: " + blocked + " skutečně blokováno.\n" + scope)
            .setSingleChoiceItems(labels, active, (dialog, selectedMode) -> {
                setBlockerMode(values[selectedMode]);
                refreshToolbar();
                Toast.makeText(this, "Režim YamaBlocku byl změněn. Nové požadavky se filtrují ihned.", Toast.LENGTH_SHORT).show();
                dialog.dismiss();
            })
            .setNegativeButton("Zavřít", null);
        if (!host.isEmpty()) {
            builder.setNeutralButton(exception ? "Zapnout pro tento web" : "Vypnout pro tento web", (dialog, which) -> {
                setBlockerDisabledForHost(host, !exception);
                refreshToolbar();
                Toast.makeText(this, exception ? "YamaBlock je pro tento web znovu zapnutý." : "YamaBlock je pro tento web vypnutý.", Toast.LENGTH_SHORT).show();
            });
        }
        builder.show();
    }

    private void showCustomView(View view, WebChromeClient.CustomViewCallback callback) {
        if (view == null || activityRoot == null) {
            if (callback != null) callback.onCustomViewHidden();
            return;
        }
        if (customView != null) {
            if (callback != null) callback.onCustomViewHidden();
            return;
        }
        if (view.getParent() instanceof ViewGroup)
            ((ViewGroup) view.getParent()).removeView(view);
        customView = view;
        customViewCallback = callback;
        root.setVisibility(View.GONE);
        activityRoot.addView(view, new FrameLayout.LayoutParams(-1, -1));
        setFullscreenSystemUi(true);
    }

    private void hideCustomView() {
        if (customView == null) return;
        View view = customView;
        WebChromeClient.CustomViewCallback callback = customViewCallback;
        customView = null;
        customViewCallback = null;
        if (view.getParent() instanceof ViewGroup)
            ((ViewGroup) view.getParent()).removeView(view);
        root.setVisibility(View.VISIBLE);
        setFullscreenSystemUi(false);
        if (callback != null) try { callback.onCustomViewHidden(); } catch (Exception ignored) { }
    }

    private void setFullscreenSystemUi(boolean fullscreen) {
        if (Build.VERSION.SDK_INT >= 30) {
            android.view.WindowInsetsController controller = getWindow().getInsetsController();
            if (controller == null) return;
            if (fullscreen) {
                controller.setSystemBarsBehavior(
                    android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
            } else {
                controller.show(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(fullscreen
                ? View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                : View.SYSTEM_UI_FLAG_VISIBLE);
        }
    }

    private void download(String url, String agent, String disposition, String mime) {
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
            Toast.makeText(this, "Tento typ stahování zatím není podporovaný.", Toast.LENGTH_LONG).show();
            return;
        }
        if (privateSession()) {
            new AlertDialog.Builder(this).setTitle("Stahování v soukromém okně")
                .setMessage("Soubor se uloží do společné systémové složky Stažené soubory a po zavření soukromého okna nezmizí.")
                .setNegativeButton("Zrušit", null)
                .setPositiveButton("Stáhnout", (dialog, which) -> enqueueDownload(url, agent, disposition, mime))
                .show();
            return;
        }
        enqueueDownload(url, agent, disposition, mime);
    }

    private void enqueueDownload(String url, String agent, String disposition, String mime) {
        if (Build.VERSION.SDK_INT <= 28
            && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            if (pendingDownload != null) {
                Toast.makeText(this, "Nejdříve dokončete předchozí žádost o stažení.", Toast.LENGTH_LONG).show();
                return;
            }
            pendingDownload = new PendingDownload(url, agent, disposition, mime);
            requestPermissions(new String[] {Manifest.permission.WRITE_EXTERNAL_STORAGE}, DOWNLOAD_STORAGE_PERMISSION);
            return;
        }
        try {
            Uri uri = Uri.parse(url);
            DownloadManager.Request request = new DownloadManager.Request(uri);
            String name = URLUtil.guessFileName(url, disposition, mime);
            request.setTitle(name);
            request.setMimeType(mime);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            if (agent != null) request.addRequestHeader("User-Agent", agent);
            // DownloadManager may carry custom headers across a redirect. Do not
            // forward WebView cookies where they could reach another origin.
            // Protected downloads stay in the site until Android offers a safe
            // platform handoff for the authenticated request.
            ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(request);
            Toast.makeText(this, "Stahování zahájeno: " + name, Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(this, "Stahování se nepodařilo spustit.", Toast.LENGTH_LONG).show();
        }
    }

    private SharedPreferences updateDownloadPreferences() {
        return getSharedPreferences(UPDATE_DOWNLOAD_PREFS, Context.MODE_PRIVATE);
    }

    private void registerUpdateActivity() {
        synchronized (UPDATE_DOWNLOAD_STATE_LOCK) {
            Iterator<WeakReference<BrowserActivity>> iterator = UPDATE_ACTIVITIES.iterator();
            while (iterator.hasNext()) {
                BrowserActivity activity = iterator.next().get();
                if (activity == null || activity == this) iterator.remove();
            }
            UPDATE_ACTIVITIES.add(new WeakReference<>(this));
        }
    }

    private void unregisterUpdateActivity() {
        synchronized (UPDATE_DOWNLOAD_STATE_LOCK) {
            Iterator<WeakReference<BrowserActivity>> iterator = UPDATE_ACTIVITIES.iterator();
            while (iterator.hasNext()) {
                BrowserActivity activity = iterator.next().get();
                if (activity == null || activity == this) iterator.remove();
            }
        }
    }

    private void notifyUpdateVerificationReleased(long id) {
        List<BrowserActivity> activities = new ArrayList<>();
        synchronized (UPDATE_DOWNLOAD_STATE_LOCK) {
            Iterator<WeakReference<BrowserActivity>> iterator = UPDATE_ACTIVITIES.iterator();
            while (iterator.hasNext()) {
                BrowserActivity activity = iterator.next().get();
                if (activity == null) iterator.remove();
                else activities.add(activity);
            }
        }
        for (BrowserActivity activity : activities) {
            activity.runOnUiThread(() -> {
                if (!activity.isFinishing() && !activity.isDestroyed()
                    && activity.activityResumed && activity.hasWindowFocus()
                    && activity.updateDownloadId == id) activity.checkPendingUpdateDownload();
            });
        }
    }

    private boolean persistPendingUpdateDownload(long id, AndroidUpdateManifest update) {
        try {
            AndroidUpdateDownloadRecord record = AndroidUpdateDownloadRecord.create(id, update);
            return updateDownloadPreferences().edit().clear()
                .putLong(UPDATE_DOWNLOAD_ID, record.getDownloadId())
                .putString(UPDATE_DOWNLOAD_MANIFEST, record.getManifestJson())
                .commit();
        } catch (Exception error) {
            return false;
        }
    }

    @SuppressLint("ApplySharedPref")
    private void clearPersistedUpdateDownload(long expectedId) {
        SharedPreferences preferences = updateDownloadPreferences();
        try {
            long savedId = preferences.getLong(UPDATE_DOWNLOAD_ID, -1L);
            if (expectedId <= 0L || savedId == expectedId) preferences.edit().clear().commit();
        } catch (ClassCastException corruptState) {
            preferences.edit().clear().commit();
        }
    }

    private void removeUpdateDownload(long id) {
        if (id <= 0L) return;
        try { ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).remove(id); }
        catch (Exception ignored) { }
    }

    private File verifiedUpdateDirectory() {
        return new File(getFilesDir(), VERIFIED_UPDATE_DIRECTORY);
    }

    private File verifiedUpdateFile(AndroidUpdateManifest update) {
        return new File(verifiedUpdateDirectory(), "YamaSearch-Android-"
            + update.getVersionCode() + "-" + update.getSha256().substring(0, 12) + ".apk");
    }

    private void cleanupStaleUpdatePartialsLocked() {
        if (staleUpdatePartialsCleaned) return;
        File[] files = verifiedUpdateDirectory().listFiles();
        if (files != null) for (File file : files) {
            if (file.isFile() && file.getName().startsWith(".partial-")) {
                try { file.delete(); } catch (Exception ignored) { }
            }
        }
        staleUpdatePartialsCleaned = true;
    }

    private AndroidUpdateManifest persistedUpdateToKeep() {
        SharedPreferences preferences = updateDownloadPreferences();
        try {
            long id = preferences.getLong(UPDATE_DOWNLOAD_ID, -1L);
            String json = preferences.getString(UPDATE_DOWNLOAD_MANIFEST, null);
            return AndroidUpdateDownloadRecord.restore(id, json, appVersionCode()).getManifest();
        } catch (Exception absentInvalidOrStaleState) {
            return null;
        }
    }

    private void scheduleVerifiedUpdateFileCleanup() {
        startUpdateVerificationExecutor();
        try {
            updateDownloadVerificationExecutor.execute(() -> {
                synchronized (UPDATE_COPY_LOCK) {
                    cleanupStaleUpdatePartialsLocked();
                    AndroidUpdateManifest keep = persistedUpdateToKeep();
                    File keepFile = keep == null ? null : verifiedUpdateFile(keep);
                    File[] files = verifiedUpdateDirectory().listFiles();
                    if (files == null) return;
                    for (File file : files) {
                        // A partial belongs either to the current copy (which must
                        // never be removed) or was handled by the one-time cleanup.
                        if (!file.isFile() || file.getName().startsWith(".partial-")) continue;
                        if (keepFile == null || !file.equals(keepFile)) {
                            try { file.delete(); } catch (Exception ignored) { }
                        }
                    }
                }
            });
        } catch (RuntimeException ignored) { }
    }

    private void clearUpdateDownloadMemory() {
        unregisterUpdateDownloadReceiver();
        updateDownloadVerificationRunning = false;
        updateDownloadVerified = false;
        verifiedUpdateDownloadUri = null;
        pendingAppUpdate = null;
        pendingInstallerOutcome = null;
        updateDownloadId = -1L;
    }

    private void discardTrackedUpdateDownload(long expectedId, boolean removeFile) {
        if (removeFile) removeUpdateDownload(expectedId);
        clearPersistedUpdateDownload(expectedId);
        scheduleVerifiedUpdateFileCleanup();
        if (expectedId == updateDownloadId) clearUpdateDownloadMemory();
    }

    private void restorePendingUpdateDownload(long installedVersionCode) {
        SharedPreferences preferences = updateDownloadPreferences();
        if (!preferences.contains(UPDATE_DOWNLOAD_ID)
            && !preferences.contains(UPDATE_DOWNLOAD_MANIFEST)) {
            scheduleVerifiedUpdateFileCleanup();
            return;
        }

        long savedId = -1L;
        String manifestJson = null;
        try {
            savedId = preferences.getLong(UPDATE_DOWNLOAD_ID, -1L);
            manifestJson = preferences.getString(UPDATE_DOWNLOAD_MANIFEST, null);
            AndroidUpdateDownloadRecord record = AndroidUpdateDownloadRecord.restore(
                savedId, manifestJson, installedVersionCode);
            updateDownloadId = record.getDownloadId();
            pendingAppUpdate = record.getManifest();
            scheduleVerifiedUpdateFileCleanup();
            updateDownloadVerified = false;
            verifiedUpdateDownloadUri = null;
            ensureUpdateDownloadReceiver();
            checkPendingUpdateDownload();
        } catch (Exception invalidOrStaleState) {
            removeUpdateDownload(savedId);
            clearPersistedUpdateDownload(-1L);
            scheduleVerifiedUpdateFileCleanup();
            clearUpdateDownloadMemory();
        }
    }

    private void downloadAppUpdate(AndroidUpdateManifest update) {
        if (update == null || isFinishing() || isDestroyed()
            || !AndroidUpdateManifest.PACKAGE_ID.equals(getPackageName())) return;
        long installedVersionCode = appVersionCode();
        if (installedVersionCode <= 0L || !update.isNewerThan(installedVersionCode)) return;
        synchronized (UPDATE_DOWNLOAD_STATE_LOCK) {
            // Another BrowserActivity may already own the shared DownloadManager
            // job. Re-read the committed record before creating anything new.
            if (updateDownloadId <= 0L) restorePendingUpdateDownload(installedVersionCode);
            if (updateDownloadId > 0L) {
                checkPendingUpdateDownload();
                if (updateDownloadVerified && verifiedUpdateDownloadUri != null) {
                    reportUpdateDownloadOutcome(new UpdateDownloadOutcome(
                        true, pendingAppUpdate.getVersion(), verifiedUpdateDownloadUri));
                } else {
                    Toast.makeText(this, "Stažení aktualizace už probíhá.", Toast.LENGTH_LONG).show();
                }
                return;
            }

            long enqueuedId = -1L;
            try {
                ensureUpdateDownloadReceiver();
                String name = "YamaSearch-Android-" + update.getVersion() + ".apk";
                String destination = "yamasearch-updates/YamaSearch-Android-" + update.getVersion()
                    + "-" + System.currentTimeMillis() + ".apk";
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(update.getApkUrl()));
                request.setTitle(name);
                request.setDescription("Aktualizace YamaSearch pro Android");
                request.setMimeType(ANDROID_APK_MIME);
                // A completed APK must not be actionable from DownloadManager before
                // YamaSearch has verified its hash and signed package identity.
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
                request.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, destination);
                DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                enqueuedId = manager.enqueue(request);
                pendingAppUpdate = update;
                updateDownloadId = enqueuedId;
                updateDownloadVerified = false;
                verifiedUpdateDownloadUri = null;
                if (!persistPendingUpdateDownload(enqueuedId, update)) {
                    discardTrackedUpdateDownload(enqueuedId, true);
                    Toast.makeText(this,
                        "Stažení aktualizace se nepodařilo bezpečně uložit.", Toast.LENGTH_LONG).show();
                    return;
                }
                // Repairs the small race where DownloadManager finishes before the
                // completion broadcast can observe the newly assigned ID.
                checkPendingUpdateDownload();
                Toast.makeText(this,
                    "Aktualizace se stahuje. Před instalací ověříme soubor i podpis.",
                    Toast.LENGTH_LONG).show();
            } catch (Exception error) {
                if (enqueuedId > 0L) {
                    discardTrackedUpdateDownload(enqueuedId, true);
                } else {
                    unregisterUpdateDownloadReceiver();
                }
                Toast.makeText(this, "Stažení aktualizace se nepodařilo spustit.", Toast.LENGTH_LONG).show();
            }
        }
    }

    @SuppressLint("UnspecifiedRegisterReceiverFlag")
    private void ensureUpdateDownloadReceiver() {
        if (updateDownloadReceiver != null) return;
        updateDownloadReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                if (!DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())) return;
                long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L);
                if (id == updateDownloadId) checkPendingUpdateDownload();
            }
        };
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        // The API 33 overload requires an explicit exported flag for this
        // protected system broadcast. Older Android versions expose only the
        // permission-gated overload below.
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(updateDownloadReceiver, filter, DOWNLOAD_COMPLETION_PERMISSION,
                null, Context.RECEIVER_EXPORTED);
        } else {
            registerReceiver(updateDownloadReceiver, filter, DOWNLOAD_COMPLETION_PERMISSION, null);
        }
    }

    private void unregisterUpdateDownloadReceiver() {
        BroadcastReceiver receiver = updateDownloadReceiver;
        updateDownloadReceiver = null;
        if (receiver != null) try { unregisterReceiver(receiver); } catch (Exception ignored) { }
    }

    private void checkPendingUpdateDownload() {
        long id = updateDownloadId;
        AndroidUpdateManifest update = pendingAppUpdate;
        if (id <= 0L || update == null || updateDownloadVerificationRunning
            || updateDownloadVerified) return;
        synchronized (UPDATE_DOWNLOAD_STATE_LOCK) {
            // A different live window owns verification. Its token release
            // event will wake the focused waiting window without polling.
            if (UPDATE_DOWNLOAD_VERIFICATION_OWNERS.containsKey(id)) return;
        }

        File internalCopy = verifiedUpdateFile(update);
        if (internalCopy.isFile()) {
            verifyInternalUpdateCopy(id, update, internalCopy);
            return;
        }

        DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        String localUriText;
        try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(id))) {
            if (cursor == null || !cursor.moveToFirst()) {
                finishFailedUpdateDownload(id, update);
                return;
            }
            int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            if (status == DownloadManager.STATUS_PENDING || status == DownloadManager.STATUS_RUNNING
                || status == DownloadManager.STATUS_PAUSED) return;
            if (status != DownloadManager.STATUS_SUCCESSFUL) {
                finishFailedUpdateDownload(id, update);
                return;
            }
            long downloaded = cursor.getLong(cursor.getColumnIndexOrThrow(
                DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
            long total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
            if ((downloaded > 0L && downloaded != update.getSize())
                || (total > 0L && total != update.getSize())) {
                finishFailedUpdateDownload(id, update);
                return;
            }
            localUriText = cursor.getString(cursor.getColumnIndexOrThrow(
                DownloadManager.COLUMN_LOCAL_URI));
        } catch (Exception error) {
            finishFailedUpdateDownload(id, update);
            return;
        }
        File downloadedFile;
        try {
            downloadedFile = resolveOwnedUpdateFile(localUriText);
        } catch (IOException unsafePath) {
            finishFailedUpdateDownload(id, update);
            return;
        }
        if (downloadedFile == null) {
            finishFailedUpdateDownload(id, update);
            return;
        }
        startUpdateVerificationExecutor();
        Object verificationToken = claimUpdateDownloadVerification(id);
        if (verificationToken == null) return;
        try {
            updateDownloadVerificationExecutor.execute(() -> {
                File verifiedFile = null;
                try {
                    verifiedFile = createVerifiedInternalUpdateCopy(id, downloadedFile, update);
                } catch (Exception ignored) { }
                postVerifiedInternalUpdate(id, verificationToken, update, verifiedFile);
            });
        } catch (RuntimeException rejected) {
            try {
                finishUpdateDownload(id, update, false);
            } finally {
                releaseUpdateDownloadVerification(id, verificationToken);
            }
        }
    }

    private void finishFailedUpdateDownload(long id, AndroidUpdateManifest update) {
        startUpdateVerificationExecutor();
        Object verificationToken = claimUpdateDownloadVerification(id);
        if (verificationToken == null) return;
        try {
            updateDownloadVerificationExecutor.execute(() -> {
                File verifiedFile = null;
                synchronized (UPDATE_COPY_LOCK) {
                    cleanupStaleUpdatePartialsLocked();
                    File internalCopy = verifiedUpdateFile(update);
                    if (internalCopy.isFile()) {
                        try {
                            verifyPrivateUpdateFile(internalCopy, update);
                            verifiedFile = internalCopy;
                        } catch (Exception ignored) { }
                    }
                }
                postVerifiedInternalUpdate(id, verificationToken, update, verifiedFile);
            });
        } catch (RuntimeException rejected) {
            try {
                finishUpdateDownload(id, update, false);
            } finally {
                releaseUpdateDownloadVerification(id, verificationToken);
            }
        }
    }

    private void startUpdateVerificationExecutor() {
        if (updateDownloadVerificationExecutor == null) {
            updateDownloadVerificationExecutor = Executors.newSingleThreadExecutor(runnable -> {
                Thread thread = new Thread(runnable, "YamaSearch-update-verify");
                thread.setDaemon(true);
                return thread;
            });
        }
    }

    private Object claimUpdateDownloadVerification(long id) {
        synchronized (UPDATE_DOWNLOAD_STATE_LOCK) {
            if (UPDATE_DOWNLOAD_VERIFICATION_OWNERS.containsKey(id)) return null;
            Object token = new Object();
            UPDATE_DOWNLOAD_VERIFICATION_OWNERS.put(id, token);
            updateDownloadVerificationId = id;
            updateDownloadVerificationToken = token;
            updateDownloadVerificationRunning = true;
            return token;
        }
    }

    private void releaseUpdateDownloadVerification(long id, Object token) {
        boolean released = false;
        synchronized (UPDATE_DOWNLOAD_STATE_LOCK) {
            if (token != null && UPDATE_DOWNLOAD_VERIFICATION_OWNERS.get(id) == token) {
                UPDATE_DOWNLOAD_VERIFICATION_OWNERS.remove(id);
                released = true;
            }
            if (updateDownloadVerificationToken == token) {
                updateDownloadVerificationId = -1L;
                updateDownloadVerificationToken = null;
                updateDownloadVerificationRunning = false;
            }
        }
        if (released) notifyUpdateVerificationReleased(id);
    }

    private void postVerifiedInternalUpdate(long id, Object verificationToken,
                                            AndroidUpdateManifest update, File file) {
        try {
            runOnUiThread(() -> {
                try {
                    finishVerifiedInternalUpdate(id, update, file);
                } finally {
                    releaseUpdateDownloadVerification(id, verificationToken);
                }
            });
        } catch (RuntimeException activityUnavailable) {
            releaseUpdateDownloadVerification(id, verificationToken);
        }
    }

    private void verifyInternalUpdateCopy(long id, AndroidUpdateManifest update, File file) {
        startUpdateVerificationExecutor();
        Object verificationToken = claimUpdateDownloadVerification(id);
        if (verificationToken == null) return;
        try {
            updateDownloadVerificationExecutor.execute(() -> {
                boolean verified = false;
                synchronized (UPDATE_COPY_LOCK) {
                    cleanupStaleUpdatePartialsLocked();
                    try {
                        verifyPrivateUpdateFile(file, update);
                        verified = true;
                    } catch (Exception ignored) { }
                }
                postVerifiedInternalUpdate(id, verificationToken, update, verified ? file : null);
            });
        } catch (RuntimeException rejected) {
            try {
                finishUpdateDownload(id, update, false);
            } finally {
                releaseUpdateDownloadVerification(id, verificationToken);
            }
        }
    }

    private File createVerifiedInternalUpdateCopy(long id, File source,
                                                  AndroidUpdateManifest update) throws IOException {
        synchronized (UPDATE_COPY_LOCK) {
            cleanupStaleUpdatePartialsLocked();
            File directory = verifiedUpdateDirectory();
            if ((!directory.isDirectory() && !directory.mkdirs()) || !directory.isDirectory())
                throw new IOException("Cannot create private update directory");

            File target = verifiedUpdateFile(update);
            if (target.isFile()) {
                verifyPrivateUpdateFile(target, update);
                return target;
            }

            File temporary = new File(directory, ".partial-" + id + "-"
                + update.getVersionCode() + "-" + UUID.randomUUID() + ".apk");
            try {
                long total = 0L;
                byte[] buffer = new byte[16 * 1024];
                try (InputStream input = new FileInputStream(source);
                     FileOutputStream output = new FileOutputStream(temporary, false)) {
                    int count;
                    while ((count = input.read(buffer)) != -1) {
                        if (Thread.currentThread().isInterrupted())
                            throw new IOException("Update copy interrupted");
                        total += count;
                        if (total > update.getSize()) throw new IOException("Update copy is too large");
                        output.write(buffer, 0, count);
                    }
                    if (total != update.getSize()) throw new IOException("Update copy size mismatch");
                    output.flush();
                    output.getFD().sync();
                }

                verifyPrivateUpdateFile(temporary, update);
                if (target.exists() && !target.delete())
                    throw new IOException("Cannot replace verified update file");
                if (!temporary.renameTo(target))
                    throw new IOException("Cannot finalize verified update file");
                return target;
            } finally {
                if (temporary.exists()) try { temporary.delete(); } catch (Exception ignored) { }
            }
        }
    }

    private void verifyPrivateUpdateFile(File file, AndroidUpdateManifest update) throws IOException {
        try (InputStream input = new FileInputStream(file)) {
            AndroidUpdateDownloadVerifier.verify(input, update.getSize(), update.getSha256());
        }
        AndroidUpdatePackageVerifier.verify(getPackageManager(), file, update);
    }

    private void finishVerifiedInternalUpdate(long id, AndroidUpdateManifest update, File file) {
        Uri uri = null;
        if (file != null) {
            try {
                uri = FileProvider.getUriForFile(this, getPackageName() + ".updates", file);
            } catch (Exception ignored) { }
        }
        finishUpdateDownload(id, update, uri != null, uri);
    }

    private File resolveOwnedUpdateFile(String localUriText) throws IOException {
        if (localUriText == null) return null;
        Uri localUri = Uri.parse(localUriText);
        if (!"file".equalsIgnoreCase(localUri.getScheme()) || localUri.getPath() == null) return null;
        File root = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (root == null) return null;
        File canonicalRoot = root.getCanonicalFile();
        File canonicalFile = new File(localUri.getPath()).getCanonicalFile();
        String allowedPrefix = canonicalRoot.getPath() + File.separator;
        return canonicalFile.getPath().startsWith(allowedPrefix) ? canonicalFile : null;
    }

    private void finishUpdateDownload(long id, AndroidUpdateManifest update, boolean success) {
        finishUpdateDownload(id, update, success, null);
    }

    private void finishUpdateDownload(long id, AndroidUpdateManifest update, boolean success,
                                      Uri downloadedUri) {
        if (id != updateDownloadId || pendingAppUpdate == null
            || update.getVersionCode() != pendingAppUpdate.getVersionCode()
            || !update.getSha256().equals(pendingAppUpdate.getSha256())) return;
        success = success && downloadedUri != null;
        updateDownloadVerificationRunning = false;
        if (!success) {
            discardTrackedUpdateDownload(id, true);
        } else {
            updateDownloadVerified = true;
            verifiedUpdateDownloadUri = downloadedUri;
            unregisterUpdateDownloadReceiver();
            // Installation uses the verified private copy, so the mutable
            // external DownloadManager source is no longer needed.
            removeUpdateDownload(id);
        }
        reportUpdateDownloadOutcome(new UpdateDownloadOutcome(
            success, update.getVersion(), downloadedUri));
    }

    private void reportUpdateDownloadOutcome(UpdateDownloadOutcome outcome) {
        if (!activityResumed || !hasWindowFocus()) {
            deferredUpdateDownloadOutcome = outcome;
            return;
        }
        showUpdateDownloadOutcome(outcome);
    }

    private void deliverDeferredUpdateUiIfVisible() {
        if (!activityResumed || !hasWindowFocus()) return;
        if (deferredUpdateDownloadOutcome != null) {
            UpdateDownloadOutcome outcome = deferredUpdateDownloadOutcome;
            deferredUpdateDownloadOutcome = null;
            showUpdateDownloadOutcome(outcome);
        }
        if (pendingInstallerOutcome != null) {
            UpdateDownloadOutcome outcome = pendingInstallerOutcome;
            pendingInstallerOutcome = null;
            if (getPackageManager().canRequestPackageInstalls()) {
                continueVerifiedUpdateInstallation(outcome);
            } else {
                // The user returned without granting the Android installer
                // permission. Keep the verified APK and offer the choice again
                // instead of silently abandoning the handoff.
                showUpdateDownloadOutcome(outcome);
            }
        }
    }

    private void showUpdateDownloadOutcome(UpdateDownloadOutcome outcome) {
        if (isFinishing() || isDestroyed()) return;
        if (updateDownloadDialog != null) updateDownloadDialog.dismiss();
        AlertDialog.Builder builder = new AlertDialog.Builder(this)
            .setTitle(outcome.success ? "Aktualizace je stažená" : "Stažení aktualizace selhalo")
            .setMessage(outcome.success
                ? "Verze " + outcome.version + " byla stažena. YamaSearch ověřil velikost, SHA-256, "
                    + "balíček, verzi i produkční podpis. Pokračujte do systémového instalátoru."
                : "Soubor aktualizace nebyl stažen nebo neprošel ověřením. Nebyl ponechán k instalaci; zkuste stažení znovu.")
            .setNegativeButton(outcome.success ? "Později" : "Zavřít", null);
        if (outcome.success) builder.setPositiveButton("Nainstalovat", (dialog, which) ->
            continueVerifiedUpdateInstallation(outcome));
        AlertDialog dialog = builder.create();
        updateDownloadDialog = dialog;
        dialog.setOnDismissListener(ignored -> {
            if (updateDownloadDialog == dialog) updateDownloadDialog = null;
        });
        dialog.show();
    }

    private void continueVerifiedUpdateInstallation(UpdateDownloadOutcome outcome) {
        if (outcome == null || !outcome.success || outcome.downloadedUri == null
            || !updateDownloadVerified || verifiedUpdateDownloadUri == null
            || !verifiedUpdateDownloadUri.equals(outcome.downloadedUri)) return;
        if (!getPackageManager().canRequestPackageInstalls()) {
            pendingInstallerOutcome = outcome;
            try {
                Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getPackageName()));
                startActivity(settings);
                Toast.makeText(this,
                    "Povolte instalaci z YamaSearch a potom se instalace otevře automaticky.",
                    Toast.LENGTH_LONG).show();
            } catch (ActivityNotFoundException | SecurityException error) {
                pendingInstallerOutcome = null;
                Toast.makeText(this,
                    "Nastavení instalace není dostupné. Aktualizaci lze nainstalovat z oficiálního webu.",
                    Toast.LENGTH_LONG).show();
            }
            return;
        }
        pendingInstallerOutcome = null;
        try {
            Intent install = new Intent(Intent.ACTION_INSTALL_PACKAGE);
            install.setDataAndType(outcome.downloadedUri, ANDROID_APK_MIME);
            install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(install);
            // Keep the record until the newly installed version starts. If the
            // user cancels or Android rejects installation, a later check can
            // offer this already verified download again.
        } catch (ActivityNotFoundException | SecurityException error) {
            Toast.makeText(this,
                "Instalátor se nepodařilo otevřít. Aktualizaci lze nainstalovat z oficiálního webu.",
                Toast.LENGTH_LONG).show();
        }
    }

    /** Returns a canonical, HTTPS-only security origin suitable for saved site choices. */
    private String siteOrigin(Uri uri) {
        return uri == null ? "" : BrowserStore.canonicalPermissionOrigin(uri.toString());
    }

    private String currentSiteOrigin() {
        if (selected == null || selected.web == null) return "";
        try { return siteOrigin(Uri.parse(selected.web.getUrl())); }
        catch (Exception ignored) { return ""; }
    }

    private String privatePermissionKey(String origin, String kind) {
        return origin + "\u001f" + kind;
    }

    private String sitePermissionState(String origin, String kind) {
        if (origin == null || origin.isEmpty()) return "ask";
        if (privateSession()) return privateSitePermissionStates.getOrDefault(privatePermissionKey(origin, kind), "ask");
        return store.sitePermissionState(origin, kind);
    }

    private void setSitePermissionState(String origin, String kind, String state) {
        if (origin == null || origin.isEmpty()) return;
        String safeState = "allow".equals(state) || "deny".equals(state) ? state : "ask";
        if (privateSession()) {
            String key = privatePermissionKey(origin, kind);
            if ("ask".equals(safeState)) privateSitePermissionStates.remove(key);
            else privateSitePermissionStates.put(key, safeState);
        } else {
            store.setSitePermissionState(origin, kind, safeState);
        }
    }

    private void resetSitePermissionStates(String origin) {
        if (origin == null || origin.isEmpty()) return;
        if (privateSession()) {
            String prefix = origin + "\u001f";
            for (String key : new ArrayList<>(privateSitePermissionStates.keySet())) {
                if (key.startsWith(prefix)) privateSitePermissionStates.remove(key);
            }
        } else {
            store.resetSitePermissionStates(origin);
        }
    }

    private String permissionLabel(String kind) {
        if (SITE_CAMERA.equals(kind)) return "Kamera";
        if (SITE_MICROPHONE.equals(kind)) return "Mikrofon";
        if (SITE_LOCATION.equals(kind)) return "Poloha";
        return "Oprávnění";
    }

    private String permissionStateLabel(String state) {
        if ("allow".equals(state)) return "Povolit";
        if ("deny".equals(state)) return "Blokovat";
        return "Zeptat se";
    }

    private void openSitePermissionsPanel() {
        String origin = currentSiteOrigin();
        if (origin.isEmpty()) {
            Toast.makeText(this, "Oprávnění lze spravovat pouze pro zabezpečený web HTTPS.", Toast.LENGTH_LONG).show();
            return;
        }
        String[] kinds = {SITE_CAMERA, SITE_MICROPHONE, SITE_LOCATION};
        String[] options = new String[kinds.length];
        for (int i = 0; i < kinds.length; i++)
            options[i] = permissionLabel(kinds[i]) + ": " + permissionStateLabel(sitePermissionState(origin, kinds[i]));
        String scope = privateSession()
            ? "Volby platí jen do zavření tohoto soukromého okna."
            : "Volby jsou uložené zvlášť pro tento přesný webový origin.";
        new AlertDialog.Builder(this).setTitle("Oprávnění pro " + origin)
            .setMessage(scope + "\n\nTato verze ovládá skutečně dostupnou kameru, mikrofon a polohu. I po volbě Povolit může Android při prvním použití vyžádat vlastní systémový souhlas. Změna se projeví při další žádosti webu; již spuštěnou kameru nebo mikrofon tím nelze dodatečně vypnout. Webové push oznámení na pozadí Android System WebView neposkytuje.")
            .setItems(options, (dialog, which) -> chooseSitePermission(origin, kinds[which]))
            .setNeutralButton("Resetovat tento web", (dialog, which) ->
                new AlertDialog.Builder(this).setTitle("Resetovat oprávnění?")
                    .setMessage("Kamera, mikrofon a poloha budou pro " + origin + " znovu nastaveny na Zeptat se.")
                    .setNegativeButton("Zrušit", null)
                    .setPositiveButton("Resetovat", (resetDialog, resetWhich) -> {
                        resetSitePermissionStates(origin);
                        Toast.makeText(this, "Oprávnění webu byla resetována.", Toast.LENGTH_SHORT).show();
                    }).show())
            .setNegativeButton("Zavřít", null)
            .show();
    }

    private void chooseSitePermission(String origin, String kind) {
        String[] states = {"ask", "allow", "deny"};
        String[] labels = {"Zeptat se", "Povolit", "Blokovat"};
        int checked = java.util.Arrays.asList(states).indexOf(sitePermissionState(origin, kind));
        if (checked < 0) checked = 0;
        new AlertDialog.Builder(this).setTitle(permissionLabel(kind) + " · " + origin)
            .setSingleChoiceItems(labels, checked, (dialog, which) -> {
                setSitePermissionState(origin, kind, states[which]);
                dialog.dismiss();
                Toast.makeText(this, permissionLabel(kind) + ": " + labels[which], Toast.LENGTH_SHORT).show();
            })
            .setNegativeButton("Zrušit", null)
            .show();
    }

    private String mediaKindForResource(String resource) {
        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) return SITE_MICROPHONE;
        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) return SITE_CAMERA;
        return null;
    }

    private String androidPermissionForResource(String resource) {
        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) return Manifest.permission.RECORD_AUDIO;
        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) return Manifest.permission.CAMERA;
        return null;
    }

    private List<String> missingMediaPermissions(String[] resources) {
        List<String> missing = new ArrayList<>();
        for (String resource : resources) {
            String permission = androidPermissionForResource(resource);
            if (permission != null && checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED
                && !missing.contains(permission)) missing.add(permission);
        }
        return missing;
    }

    private boolean isCurrent(PendingMediaPermission pending) {
        return pending != null && pendingMediaPermission == pending && !pending.cancelled
            && pending.tab.web == pending.web && pending.tab.navigationGeneration == pending.navigationGeneration
            && pending.tab == selected && tabs.contains(pending.tab) && !isFinishing() && !isDestroyed();
    }

    private void dismiss(PendingMediaPermission pending) {
        if (pending.dialog != null) {
            pending.dialog.setOnCancelListener(null);
            pending.dialog.dismiss();
            pending.dialog = null;
        }
    }

    private void cancelMediaPermission(PendingMediaPermission pending, boolean denyRequest) {
        if (pending == null || pending.cancelled) return;
        if (pendingMediaPermission == pending) pendingMediaPermission = null;
        pending.cancelled = true;
        dismiss(pending);
        if (denyRequest) try { pending.request.deny(); } catch (Exception ignored) { }
    }

    private void grantMediaPermission(PendingMediaPermission pending, boolean rememberAllow) {
        if (!isCurrent(pending)) return;
        pendingMediaPermission = null;
        pending.cancelled = true;
        dismiss(pending);
        try {
            // Every resource was explicitly classified above; unknown resources are never granted.
            pending.request.grant(pending.resources);
            if (rememberAllow) for (String kind : pending.promptStates)
                setSitePermissionState(pending.origin, kind, "allow");
        } catch (Exception ignored) { }
    }

    private void denyMediaPermission(PendingMediaPermission pending, boolean rememberBlock) {
        if (!isCurrent(pending)) return;
        pendingMediaPermission = null;
        pending.cancelled = true;
        dismiss(pending);
        if (rememberBlock) for (String kind : pending.promptStates)
            setSitePermissionState(pending.origin, kind, "deny");
        try { pending.request.deny(); } catch (Exception ignored) { }
    }

    private String permissionList(List<String> kinds) {
        List<String> labels = new ArrayList<>();
        for (String kind : kinds) labels.add(permissionLabel(kind).toLowerCase(Locale.ROOT));
        if (labels.size() == 1) return labels.get(0);
        if (labels.size() == 2) return labels.get(0) + " a " + labels.get(1);
        return String.join(", ", labels);
    }

    private void showMediaPermissionPrompt(PendingMediaPermission pending) {
        AlertDialog dialog = new AlertDialog.Builder(this)
            .setTitle("Oprávnění webu")
            .setMessage(pending.origin + " žádá o přístup k " + permissionList(pending.promptStates) + ".")
            .setNegativeButton("Blokovat", (d, which) -> denyMediaPermission(pending, true))
            .setPositiveButton("Povolit", (d, which) -> continueMediaPermission(pending))
            .create();
        pending.dialog = dialog;
        dialog.setOnCancelListener(cancelled -> denyMediaPermission(pending, false));
        dialog.show();
    }

    private void continueMediaPermission(PendingMediaPermission pending) {
        if (!isCurrent(pending)) return;
        List<String> missing = missingMediaPermissions(pending.resources);
        if (missing.isEmpty()) {
            grantMediaPermission(pending, !pending.promptStates.isEmpty());
            return;
        }
        try {
            requestPermissions(missing.toArray(new String[0]), SITE_PERMISSION);
        } catch (Exception ignored) {
            denyMediaPermission(pending, false);
        }
    }

    private void handleSitePermission(Tab tab, WebView web, PermissionRequest request) {
        String origin = request == null ? "" : siteOrigin(request.getOrigin());
        if (origin.isEmpty() || tab != selected || isFinishing() || isDestroyed()
            || pendingMediaPermission != null || pendingLocationPermission != null) {
            if (request != null) try { request.deny(); } catch (Exception ignored) { }
            return;
        }
        String[] resources = request.getResources();
        if (resources == null || resources.length == 0) {
            try { request.deny(); } catch (Exception ignored) { }
            return;
        }
        List<String> promptStates = new ArrayList<>();
        List<String> grantResources = new ArrayList<>();
        for (String resource : resources) {
            String kind = mediaKindForResource(resource);
            if (kind == null) {
                try { request.deny(); } catch (Exception ignored) { }
                return;
            }
            String state = sitePermissionState(origin, kind);
            if ("deny".equals(state)) {
                try { request.deny(); } catch (Exception ignored) { }
                return;
            }
            if ("ask".equals(state) && !promptStates.contains(kind)) promptStates.add(kind);
            if (!grantResources.contains(resource)) grantResources.add(resource);
        }
        PendingMediaPermission pending = new PendingMediaPermission(request, tab, web, tab.navigationGeneration,
            origin, grantResources.toArray(new String[0]), promptStates);
        pendingMediaPermission = pending;
        if (promptStates.isEmpty()) continueMediaPermission(pending);
        else showMediaPermissionPrompt(pending);
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean isCurrent(PendingLocationPermission pending) {
        return pending != null && pendingLocationPermission == pending && !pending.cancelled
            && pending.tab.web == pending.web && pending.tab.navigationGeneration == pending.navigationGeneration
            && pending.tab == selected && tabs.contains(pending.tab) && !isFinishing() && !isDestroyed();
    }

    private void dismiss(PendingLocationPermission pending) {
        if (pending.dialog != null) {
            pending.dialog.setOnCancelListener(null);
            pending.dialog.dismiss();
            pending.dialog = null;
        }
    }

    private void cancelLocationPermission(PendingLocationPermission pending, boolean denyRequest) {
        if (pending == null || pending.cancelled) return;
        if (pendingLocationPermission == pending) pendingLocationPermission = null;
        pending.cancelled = true;
        dismiss(pending);
        if (denyRequest) try { pending.callback.invoke(pending.rawOrigin, false, false); } catch (Exception ignored) { }
    }

    private void grantLocationPermission(PendingLocationPermission pending) {
        if (!isCurrent(pending)) return;
        pendingLocationPermission = null;
        pending.cancelled = true;
        dismiss(pending);
        try {
            pending.callback.invoke(pending.rawOrigin, true, false);
            if (pending.rememberChoice) setSitePermissionState(pending.origin, SITE_LOCATION, "allow");
        } catch (Exception ignored) { }
    }

    private void denyLocationPermission(PendingLocationPermission pending, boolean rememberBlock) {
        if (!isCurrent(pending)) return;
        pendingLocationPermission = null;
        pending.cancelled = true;
        dismiss(pending);
        if (rememberBlock && pending.rememberChoice)
            setSitePermissionState(pending.origin, SITE_LOCATION, "deny");
        try { pending.callback.invoke(pending.rawOrigin, false, false); } catch (Exception ignored) { }
    }

    private void showLocationPermissionPrompt(PendingLocationPermission pending) {
        AlertDialog dialog = new AlertDialog.Builder(this)
            .setTitle("Oprávnění webu")
            .setMessage(pending.origin + " žádá o přístup k poloze.")
            .setNegativeButton("Blokovat", (d, which) -> denyLocationPermission(pending, true))
            .setPositiveButton("Povolit", (d, which) -> continueLocationPermission(pending))
            .create();
        pending.dialog = dialog;
        dialog.setOnCancelListener(cancelled -> denyLocationPermission(pending, false));
        dialog.show();
    }

    private void continueLocationPermission(PendingLocationPermission pending) {
        if (!isCurrent(pending)) return;
        if (hasLocationPermission()) {
            grantLocationPermission(pending);
            return;
        }
        try {
            requestPermissions(new String[] {Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION}, SITE_LOCATION_PERMISSION);
        } catch (Exception ignored) {
            denyLocationPermission(pending, false);
        }
    }

    private void handleGeolocationPermission(Tab tab, WebView web, String rawOrigin,
                                             GeolocationPermissions.Callback callback) {
        String origin;
        try { origin = siteOrigin(Uri.parse(rawOrigin)); }
        catch (Exception ignored) { origin = ""; }
        if (origin.isEmpty() || tab != selected || isFinishing() || isDestroyed()
            || pendingMediaPermission != null || pendingLocationPermission != null) {
            try { callback.invoke(rawOrigin, false, false); } catch (Exception ignored) { }
            return;
        }
        String state = sitePermissionState(origin, SITE_LOCATION);
        if ("deny".equals(state)) {
            try { callback.invoke(rawOrigin, false, false); } catch (Exception ignored) { }
            return;
        }
        PendingLocationPermission pending = new PendingLocationPermission(rawOrigin, origin, callback, tab, web,
            tab.navigationGeneration, "ask".equals(state));
        pendingLocationPermission = pending;
        if ("allow".equals(state)) continueLocationPermission(pending);
        else showLocationPermissionPrompt(pending);
    }

    private void cancelGeolocationPrompt(Tab tab, WebView web) {
        PendingLocationPermission pending = pendingLocationPermission;
        if (pending != null && pending.tab == tab && pending.web == web)
            cancelLocationPermission(pending, false);
    }

    private void cancelSitePermissionsForTab(Tab tab) {
        if (pendingMediaPermission != null && pendingMediaPermission.tab == tab)
            cancelMediaPermission(pendingMediaPermission, true);
        if (pendingLocationPermission != null && pendingLocationPermission.tab == tab)
            cancelLocationPermission(pendingLocationPermission, true);
    }

    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code == SITE_PERMISSION) {
            PendingMediaPermission pending = pendingMediaPermission;
            if (pending == null) return;
            boolean accepted = results.length > 0;
            for (int result : results) accepted &= result == PackageManager.PERMISSION_GRANTED;
            if (accepted) grantMediaPermission(pending, !pending.promptStates.isEmpty());
            else denyMediaPermission(pending, false);
        } else if (code == SITE_LOCATION_PERMISSION) {
            PendingLocationPermission pending = pendingLocationPermission;
            if (pending == null) return;
            boolean accepted = false;
            for (int result : results) accepted |= result == PackageManager.PERMISSION_GRANTED;
            if (accepted) grantLocationPermission(pending);
            else denyLocationPermission(pending, false);
        } else if (code == DOWNLOAD_STORAGE_PERMISSION) {
            PendingDownload pending = pendingDownload;
            pendingDownload = null;
            boolean accepted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
            if (pending != null && accepted) {
                enqueueDownload(pending.url, pending.agent, pending.disposition, pending.mime);
            } else if (pending != null) {
                Toast.makeText(this,
                    "Bez přístupu k úložišti nelze na Androidu 9 uložit soubor do Stažených souborů.",
                    Toast.LENGTH_LONG).show();
            }
        }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == FILE_PICKER && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            fileCallback = null;
        }
    }

    @Override public void onBackPressed() {
        if (customView != null) hideCustomView();
        else if (searchPanel != null && searchPanel.isVisible()) {
            searchPanel.hide();
            address.clearFocus();
        }
        else if (selected != null && selected.web.canGoBack()) selected.web.goBack();
        else super.onBackPressed();
    }

    @Override protected void onPause() {
        activityResumed = false;
        if (searchPanel != null) searchPanel.hide();
        if (updateController != null) updateController.onPause();
        if (selected != null) selected.web.onPause();
        super.onPause();
    }

    @Override protected void onResume() {
        super.onResume();
        activityResumed = true;
        if (selected != null) selected.web.onResume();
        checkPendingUpdateDownload();
        deliverDeferredUpdateUiIfVisible();
        if (updateController != null && hasWindowFocus()) updateController.onResume();
    }

    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (!activityResumed) return;
        if (hasFocus) {
            checkPendingUpdateDownload();
            deliverDeferredUpdateUiIfVisible();
            if (updateController != null) updateController.onResume();
        } else if (updateController != null) {
            updateController.onPause();
        }
    }

    @Override protected void onDestroy() {
        activityResumed = false;
        unregisterUpdateDownloadReceiver();
        unregisterUpdateActivity();
        Object verificationToken = updateDownloadVerificationToken;
        long verificationId = updateDownloadVerificationId;
        if (verificationToken != null && verificationId > 0L)
            releaseUpdateDownloadVerification(verificationId, verificationToken);
        if (updateDownloadVerificationExecutor != null) {
            updateDownloadVerificationExecutor.shutdownNow();
            updateDownloadVerificationExecutor = null;
        }
        if (updateDownloadDialog != null) {
            updateDownloadDialog.dismiss();
            updateDownloadDialog = null;
        }
        pendingAppUpdate = null;
        deferredUpdateDownloadOutcome = null;
        pendingInstallerOutcome = null;
        updateDownloadId = -1L;
        updateDownloadVerificationRunning = false;
        updateDownloadVerified = false;
        verifiedUpdateDownloadUri = null;
        if (updateController != null) {
            updateController.close();
            updateController = null;
        }
        hideCustomView();
        cancelMediaPermission(pendingMediaPermission, true);
        cancelLocationPermission(pendingLocationPermission, true);
        pendingDownload = null;
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        selected = null;
        for (Tab tab : tabs) {
            tab.web.stopLoading();
            if (tab.yamaBlockPageFilter != null) tab.yamaBlockPageFilter.destroy();
            if (tab.web.getParent() instanceof ViewGroup) ((ViewGroup) tab.web.getParent()).removeView(tab.web);
            if (privateSession()) {
                tab.web.clearHistory();
                tab.web.clearFormData();
            }
            tab.web.destroy();
        }
        tabs.clear();
        if (privateSession()) clearPrivateWebDataOnDestroy();
        super.onDestroy();
    }
}
