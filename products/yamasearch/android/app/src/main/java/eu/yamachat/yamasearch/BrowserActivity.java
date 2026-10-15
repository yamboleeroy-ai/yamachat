package eu.yamachat.yamasearch;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Message;
import android.provider.Settings;
import android.view.Gravity;
import android.view.KeyEvent;
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
import java.io.ByteArrayInputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

public class BrowserActivity extends Activity {
    private static final int INK = Color.rgb(12, 18, 31);
    private static final int PANEL = Color.rgb(22, 31, 49);
    private static final int CYAN = Color.rgb(64, 212, 245);
    private static final int MUTED = Color.rgb(169, 185, 204);
    private static final int FILE_PICKER = 350;
    private static final int SITE_PERMISSION = 351;
    private static final int SITE_LOCATION_PERMISSION = 352;
    private static final int DOWNLOAD_STORAGE_PERMISSION = 353;
    private static final String HOME = "about:blank";
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
        String title = "Nová karta";
        String favicon = "";
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

    private final List<Tab> tabs = new ArrayList<>();
    private Tab selected;
    private BrowserStore store;
    private FrameLayout activityRoot;
    private LinearLayout root;
    private FrameLayout webHost;
    private EditText address;
    private TextView tabCounter;
    private ProgressBar progress;
    private TextView bookmarkButton;
    private TextView blockerButton;
    private android.webkit.ValueCallback<Uri[]> fileCallback;
    private PendingMediaPermission pendingMediaPermission;
    private PendingLocationPermission pendingLocationPermission;
    private PendingDownload pendingDownload;
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
        String launch = getIntent().getDataString();
        String initialUrl = launch != null && (launch.startsWith("https://") || launch.startsWith("http://")) ? launch : HOME;
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
        root.addView(inputRow);

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        progress.setProgressTintList(android.content.res.ColorStateList.valueOf(CYAN));
        root.addView(progress, new LinearLayout.LayoutParams(-1, dp(2)));

        webHost = new FrameLayout(this);
        webHost.setBackgroundColor(INK);
        root.addView(webHost, new LinearLayout.LayoutParams(-1, 0, 1));

        LinearLayout nav = new LinearLayout(this);
        nav.setBackgroundColor(PANEL);
        nav.setGravity(Gravity.CENTER);
        addNav(nav, "←", () -> { if (selected != null && selected.web.canGoBack()) selected.web.goBack(); });
        addNav(nav, "→", () -> { if (selected != null && selected.web.canGoForward()) selected.web.goForward(); });
        addNav(nav, "⟳", () -> { if (selected != null) selected.web.reload(); });
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

    private String normalize(String raw) {
        String input = raw == null ? "" : raw.trim();
        if (input.isEmpty()) return HOME;
        if (input.startsWith("http://") || input.startsWith("https://")) return input;
        if (input.startsWith("about:blank")) return HOME;
        if (!input.contains(" ") && input.contains(".") && !input.startsWith(".")) return "https://" + input;
        return "https://www.google.com/search?q=" + Uri.encode(input);
    }

    private void navigate(String text) {
        if (selected != null) selected.web.loadUrl(normalize(text));
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

    private void createTab(String firstUrl, boolean activate) {
        WebView web = new WebView(this);
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
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("http".equals(scheme) || "https".equals(scheme) || "about".equals(scheme)) return false;
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
                // Do not accidentally assign the preceding page's icon to a new bookmark
                // while its own favicon is still being loaded.
                cancelSitePermissionsForTab(tab);
                tab.navigationGeneration++;
                tab.topLevelHost = hostForUrl(url);
                tab.favicon = "";
                synchronized (tab) { tab.blockedCount = 0; }
                if (selected == tab) refreshToolbar();
            }

            @Override public void onPageFinished(WebView view, String url) {
                if (!privateSession() && url != null && url.startsWith("http")) store.addHistory(url, tab.title);
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
                if (!privateSession()) {
                    String url = view.getUrl();
                    if (url != null) store.updateBookmarkMetadata(url, tab.title, tab.favicon);
                }
                if (selected == tab) refreshToolbar();
            }
            @Override public void onReceivedIcon(WebView view, Bitmap icon) {
                tab.favicon = BrowserStore.encodeFavicon(icon);
                if (!privateSession()) {
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
                createTab(HOME, true);
                WebView.WebViewTransport transport = (WebView.WebViewTransport) result.obj;
                transport.setWebView(selected.web);
                result.sendToTarget();
                return true;
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
        if (HOME.equals(firstUrl)) {
            web.loadDataWithBaseURL(null, "<!doctype html><html><meta name='viewport' content='width=device-width,initial-scale=1'><body style='background:#0c121f;color:#d5e4f3;font-family:sans-serif;text-align:center;padding:12vh 20px'><h1 style='color:#40d4f5'>YamaSearch</h1><p>Soukromější prohlížení na mobilu</p><p>Zadejte adresu nebo hledaný výraz nahoře.</p></body></html>", "text/html", "UTF-8", null);
        } else {
            web.loadUrl(firstUrl);
        }
        refreshToolbar();
    }

    private void showTab(Tab tab) {
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
        refreshToolbar();
    }

    private void refreshToolbar() {
        if (selected == null || address == null) return;
        String url = selected.web.getUrl();
        if (!address.hasFocus()) address.setText(url == null || url.startsWith("about:") || url.startsWith("data:") ? "" : url);
        tabCounter.setText(tabs.size() + " ▢");
        bookmarkButton.setText(!privateSession() && url != null && store.isBookmarked(url) ? "★" : "☆");
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
        if (url == null || !(url.startsWith("http://") || url.startsWith("https://"))) return;
        store.toggleBookmark(url, selected.title, selected.favicon);
        refreshToolbar();
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
        if (selected == null) return;
        Tab old = selected;
        cancelSitePermissionsForTab(old);
        int index = tabs.indexOf(old);
        tabs.remove(old);
        webHost.removeView(old.web);
        selected = null;
        old.web.stopLoading();
        old.web.destroy();
        if (tabs.isEmpty()) createTab(HOME, true);
        else showTab(tabs.get(Math.min(index, tabs.size() - 1)));
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
                .setPositiveButton("Smazat", (a, b) -> store.clearHistory()).show());
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
                render();
            });
            TextView down = bookmarkControl("↓", "Posunout níž", CYAN);
            down.setEnabled(index < count - 1);
            down.setAlpha(index < count - 1 ? 1f : .35f);
            down.setOnClickListener(view -> {
                store.moveBookmark(index, index + 1);
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
            render();
        }

        private void restoreLastRemoval() {
            if (undoEntry == null) return;
            store.restoreBookmark(undoEntry, undoIndex);
            undoEntry = null;
            undoIndex = -1;
            dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setVisibility(View.GONE);
            refreshToolbar();
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
            "Nová karta", "Soukromé okno", "Oblíbené stránky", "Historie",
            "Oprávnění tohoto webu", "Stažené soubory",
            "YamaBlock: " + blockerModeLabel(blockerMode()), "O aplikaci"
        };
        new AlertDialog.Builder(this).setTitle("YamaSearch").setItems(options, (dialog, which) -> {
            switch (which) {
                case 0: createTab(HOME, true); break;
                case 1: if (!privateSession()) startActivity(new Intent(this, PrivateBrowserActivity.class)); break;
                case 2: showBookmarks(); break;
                // A private activity runs in another process and must not even read
                // the normal profile's persisted history before deciding to hide it.
                case 3: if (!privateSession()) showEntries("Historie", store.history(), true); break;
                case 4: openSitePermissionsPanel(); break;
                case 5: try { startActivity(new Intent(DownloadManager.ACTION_VIEW_DOWNLOADS)); }
                        catch (ActivityNotFoundException e) { Toast.makeText(this, "Správce stahování není dostupný.", Toast.LENGTH_SHORT).show(); }
                        break;
                case 6: openYamaBlockPanel(); break;
                case 7: new AlertDialog.Builder(this).setTitle("YamaSearch pro Android")
                    .setMessage("Verze " + appVersionName() + ". Android System WebView, vlastní karty a základní YamaBlock. Desktopové funkce zatím nejsou všechny přeneseny.")
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
        else if (selected != null && selected.web.canGoBack()) selected.web.goBack();
        else super.onBackPressed();
    }

    @Override protected void onPause() {
        if (selected != null) selected.web.onPause();
        super.onPause();
    }

    @Override protected void onResume() {
        super.onResume();
        if (selected != null) selected.web.onResume();
    }

    @Override protected void onDestroy() {
        hideCustomView();
        cancelMediaPermission(pendingMediaPermission, true);
        cancelLocationPermission(pendingLocationPermission, true);
        pendingDownload = null;
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        selected = null;
        for (Tab tab : tabs) {
            tab.web.stopLoading();
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
