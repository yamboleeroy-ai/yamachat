package eu.yamachat.yamasearch;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
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
import android.widget.TextView;
import android.widget.Toast;
import android.graphics.drawable.GradientDrawable;
import java.io.ByteArrayInputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class BrowserActivity extends Activity {
    private static final int INK = Color.rgb(12, 18, 31);
    private static final int PANEL = Color.rgb(22, 31, 49);
    private static final int CYAN = Color.rgb(64, 212, 245);
    private static final int MUTED = Color.rgb(169, 185, 204);
    private static final int FILE_PICKER = 350;
    private static final int SITE_PERMISSION = 351;
    private static final String HOME = "about:blank";
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

    private static final class Tab {
        WebView web;
        String title = "Nová karta";
        Tab(WebView web) { this.web = web; }
    }

    private final List<Tab> tabs = new ArrayList<>();
    private Tab selected;
    private BrowserStore store;
    private LinearLayout root;
    private FrameLayout webHost;
    private EditText address;
    private TextView tabCounter;
    private ProgressBar progress;
    private TextView bookmarkButton;
    private android.webkit.ValueCallback<Uri[]> fileCallback;
    private PermissionRequest pendingPermission;
    private String[] pendingResources;
    private int blockerCount;

    private int dp(int dp) { return Math.round(dp * getResources().getDisplayMetrics().density); }

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
        getWindow().setStatusBarColor(INK);
        getWindow().setNavigationBarColor(INK);
        getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        WebView.setWebContentsDebuggingEnabled(false);
        buildUi();
        String launch = getIntent().getDataString();
        createTab(launch != null && (launch.startsWith("https://") || launch.startsWith("http://")) ? launch : HOME, true);
    }

    private void buildUi() {
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
        setContentView(root);

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
        brand.setTypeface(null, 1);
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
        tabCounter = action("1 ▢", this::chooseTab);
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
        return "https://www.google.com/search?q=" + URLEncoder.encode(input, StandardCharsets.UTF_8);
    }

    private void navigate(String text) {
        if (selected != null) selected.web.loadUrl(normalize(text));
    }

    private boolean hostMatches(String host, String[] entries) {
        for (String suffix : entries)
            if (host.equals(suffix) || host.endsWith("." + suffix)) return true;
        return false;
    }

    private boolean isBlocked(Uri url, boolean mainFrame) {
        if (mainFrame || privateSession()) return false;
        String mode = store.blockerMode();
        if ("off".equals(mode)) return false;
        String scheme = url.getScheme();
        String host = url.getHost();
        if (host == null || (!"http".equals(scheme) && !"https".equals(scheme))) return false;
        host = host.toLowerCase(Locale.ROOT);
        return hostMatches(host, AD_HOSTS)
            || ("strict".equals(mode) && hostMatches(host, TRACKER_HOSTS));
    }

    private void createTab(String firstUrl, boolean activate) {
        WebView web = new WebView(this);
        Tab tab = new Tab(web);
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
            CookieManager.getInstance().setAcceptCookie(false);
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
                if (isBlocked(request.getUrl(), request.isForMainFrame())) {
                    synchronized (BrowserActivity.this) { blockerCount++; }
                    return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
                }
                return null;
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
                tab.title = title == null || title.isBlank() ? "Nová karta" : title;
                if (selected == tab) refreshToolbar();
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
            @Override public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> handleSitePermission(request));
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                runOnUiThread(() -> {
                    if (pendingPermission == request) {
                        pendingPermission = null;
                        pendingResources = null;
                    }
                });
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
        if (selected != null) selected.web.onPause();
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
        bookmarkButton.setText(url != null && store.isBookmarked(url) ? "★" : "☆");
    }

    private void toggleBookmark() {
        if (selected == null || privateSession()) {
            Toast.makeText(this, "V soukromém režimu se záložky neukládají.", Toast.LENGTH_SHORT).show();
            return;
        }
        String url = selected.web.getUrl();
        if (url == null || !(url.startsWith("http://") || url.startsWith("https://"))) return;
        store.toggleBookmark(url, selected.title);
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

    private void openMenu() {
        String[] options = {
            "Nová karta", "Soukromé okno", "Oblíbené stránky", "Historie",
            "Stažené soubory", "YamaBlock: " + store.blockerMode(), "O aplikaci"
        };
        new AlertDialog.Builder(this).setTitle("YamaSearch").setItems(options, (dialog, which) -> {
            switch (which) {
                case 0: createTab(HOME, true); break;
                case 1: if (!privateSession()) startActivity(new Intent(this, PrivateBrowserActivity.class)); break;
                case 2: showEntries("Oblíbené stránky", store.bookmarks(), false); break;
                case 3: showEntries("Historie", store.history(), true); break;
                case 4: try { startActivity(new Intent(DownloadManager.ACTION_VIEW_DOWNLOADS)); }
                        catch (ActivityNotFoundException e) { Toast.makeText(this, "Správce stahování není dostupný.", Toast.LENGTH_SHORT).show(); }
                        break;
                case 5: setBlockerMode(); break;
                case 6: new AlertDialog.Builder(this).setTitle("YamaSearch pro Android")
                    .setMessage("Samostatná vývojová verze 0.1.0-preview. Android System WebView, vlastní karty a základní YamaBlock. Desktopové funkce zatím nejsou všechny přeneseny.")
                    .setPositiveButton("OK", null).show(); break;
                default: break;
            }
        }).show();
    }

    private void setBlockerMode() {
        String[] labels = {"Vypnuto", "Standard", "Přísný"};
        String[] values = {"off", "standard", "strict"};
        int active = java.util.Arrays.asList(values).indexOf(store.blockerMode());
        new AlertDialog.Builder(this).setTitle("YamaBlock – filtrování požadavků")
            .setSingleChoiceItems(labels, active, (dialog, selectedMode) -> {
                store.setBlockerMode(values[selectedMode]);
                Toast.makeText(this, "Nastavení se použije při dalších požadavcích.", Toast.LENGTH_SHORT).show();
                dialog.dismiss();
            }).setNegativeButton("Zrušit", null).show();
    }

    private void download(String url, String agent, String disposition, String mime) {
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
            Toast.makeText(this, "Tento typ stahování zatím není podporovaný.", Toast.LENGTH_LONG).show();
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
            if (!privateSession()) {
                String cookie = CookieManager.getInstance().getCookie(url);
                if (cookie != null) request.addRequestHeader("Cookie", cookie);
            }
            ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(request);
            Toast.makeText(this, "Stahování zahájeno: " + name, Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(this, "Stahování se nepodařilo spustit.", Toast.LENGTH_LONG).show();
        }
    }

    private void handleSitePermission(PermissionRequest request) {
        Uri origin = request.getOrigin();
        if (origin == null || !"https".equalsIgnoreCase(origin.getScheme()) || pendingPermission != null) {
            request.deny();
            return;
        }
        List<String> needed = new ArrayList<>();
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) needed.add(Manifest.permission.RECORD_AUDIO);
            else if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) needed.add(Manifest.permission.CAMERA);
            else { request.deny(); return; }
        }
        if (needed.isEmpty()) { request.deny(); return; }
        new AlertDialog.Builder(this).setTitle("Oprávnění webu")
            .setMessage(origin.getHost() + " žádá o přístup k mikrofonu nebo kameře. Povolit?")
            .setNegativeButton("Zamítnout", (d, w) -> request.deny())
            .setPositiveButton("Povolit", (d, w) -> {
                List<String> missing = new ArrayList<>();
                for (String p : needed) if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) missing.add(p);
                if (missing.isEmpty()) request.grant(request.getResources());
                else {
                    pendingPermission = request;
                    pendingResources = request.getResources();
                    requestPermissions(missing.toArray(new String[0]), SITE_PERMISSION);
                }
            }).show();
    }

    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code == SITE_PERMISSION && pendingPermission != null) {
            boolean accepted = results.length > 0;
            for (int result : results) accepted &= result == PackageManager.PERMISSION_GRANTED;
            if (accepted && pendingResources != null) pendingPermission.grant(pendingResources);
            else pendingPermission.deny();
            pendingPermission = null;
            pendingResources = null;
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
        if (selected != null && selected.web.canGoBack()) selected.web.goBack();
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
        if (pendingPermission != null) pendingPermission.deny();
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        for (Tab tab : tabs) {
            tab.web.stopLoading();
            if (tab.web.getParent() instanceof ViewGroup) ((ViewGroup) tab.web.getParent()).removeView(tab.web);
            if (privateSession()) {
                tab.web.clearHistory();
                tab.web.clearCache(true);
                tab.web.clearFormData();
            }
            tab.web.destroy();
        }
        tabs.clear();
        if (privateSession()) {
            CookieManager.getInstance().removeAllCookies(null);
            CookieManager.getInstance().flush();
            WebStorage.getInstance().deleteAllData();
        }
        super.onDestroy();
    }
}
