package eu.yamachat.yamaconvert;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Build;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import dev.ffmpegkit_maintained.ytdlp.YtDlp;
import dev.ffmpegkit_maintained.ytdlp.YtDlpRequest;
import dev.ffmpegkit_maintained.ytdlp.YtDlpResponse;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.Locale;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Future;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.FutureTask;
import java.util.regex.Pattern;

public final class YamaConvertActivity extends Activity {
    private static final String HOME = "https://yamachat.eu/yamaconvert/";
    private static final String SITE_ORIGIN = "https://yamachat.eu";
    private static final String RELEASE_API = "https://api.github.com/repos/yamboleeroy-ai/yamachat/releases?per_page=100";
    private static final long MAX_BYTES = 100L * 1024L * 1024L;
    private static final Pattern REQUEST_ID = Pattern.compile("yc-[a-zA-Z0-9-]{8,64}");
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService downloads = Executors.newSingleThreadExecutor();
    private final Map<String, File> exposedFiles = new ConcurrentHashMap<>();
    private final Map<String, Future<?>> activeJobs = new ConcurrentHashMap<>();
    private final Set<String> cancelledJobs = ConcurrentHashMap.newKeySet();
    private WebView webView;
    private String pendingSharedLink;
    private boolean updateCheckStarted;
    private Set<String> supportedMediaHosts = Set.of();
    private File pendingUpdateApk;

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        supportedMediaHosts = loadSupportedMediaHosts();
        File temp = new File(getCacheDir(), "yamaconvert-media");
        deleteTree(temp);
        temp.mkdirs();
        pendingSharedLink = sharedText(getIntent());

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(12, 17, 31));
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webView.addJavascriptInterface(new AndroidBridge(), "YamaConvertAndroid");
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (SITE_ORIGIN.equals(uri.getScheme() + "://" + uri.getHost())) return false;
                if ("https".equals(uri.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                    catch (Exception ignored) { }
                }
                return true;
            }

            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!"appassets.androidplatform.net".equals(uri.getHost()) ||
                    !"/yamaconvert-download".equals(uri.getPathSegments().isEmpty() ? "" : "/" + uri.getPathSegments().get(0)) ||
                    uri.getPathSegments().size() != 2) return super.shouldInterceptRequest(view, request);
                File file = exposedFiles.get(uri.getPathSegments().get(1));
                if (file == null || !file.isFile()) return response(404, "Not Found", null);
                Map<String, String> headers = Map.of(
                    "Access-Control-Allow-Origin", SITE_ORIGIN,
                    "Access-Control-Allow-Methods", "GET, OPTIONS",
                    "Cache-Control", "no-store",
                    "X-Content-Type-Options", "nosniff");
                try { return new WebResourceResponse("application/octet-stream", null, 200, "OK", headers, new FileInputStream(file)); }
                catch (IOException error) { return response(404, "Not Found", null); }
            }

            @Override public void onPageFinished(WebView view, String url) {
                if (HOME.equals(url) || url.startsWith(HOME + "?")) {
                    injectSharedLink();
                    if (!updateCheckStarted) { updateCheckStarted = true; checkForUpdate(); }
                }
            }
        });
        setContentView(webView, new FrameLayout.LayoutParams(-1, -1));
        webView.loadUrl(HOME);
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        pendingSharedLink = sharedText(intent);
        injectSharedLink();
    }

    @Override protected void onResume() {
        super.onResume();
        if (pendingUpdateApk != null && Build.VERSION.SDK_INT >= 26 && getPackageManager().canRequestPackageInstalls())
            installPendingUpdate();
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    private void injectSharedLink() {
        String shared = pendingSharedLink;
        if (shared == null || webView == null) return;
        pendingSharedLink = null;
        String quoted = JSONObject.quote(shared);
        webView.evaluateJavascript("(()=>{const b=document.querySelector('[data-view=downloads]'),i=document.querySelector('#media-url');if(b)b.click();if(i){i.value=" + quoted + ";i.dispatchEvent(new Event('input',{bubbles:true}));}})()", null);
    }

    private void checkForUpdate() {
        downloads.execute(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(RELEASE_API).openConnection();
                connection.setConnectTimeout(10000);
                connection.setReadTimeout(12000);
                connection.setRequestProperty("Accept", "application/vnd.github+json");
                connection.setRequestProperty("User-Agent", "YamaConvert-Android");
                if (connection.getResponseCode() != 200) return;
                StringBuilder json = new StringBuilder();
                try (InputStream input = connection.getInputStream()) {
                    byte[] buffer = new byte[8192];
                    int count;
                    while ((count = input.read(buffer)) != -1 && json.length() < 1_000_000)
                        json.append(new String(buffer, 0, count, java.nio.charset.StandardCharsets.UTF_8));
                }
                org.json.JSONArray releases = new org.json.JSONArray(json.toString());
                JSONObject release = null;
                int latestCode = -1;
                String downloadUrl = null;
                Pattern releaseTag = Pattern.compile("^yamaconvert-v([0-9]+\\.[0-9]+\\.[0-9]+)-([0-9]+)$");
                for (int releaseIndex = 0; releaseIndex < releases.length(); releaseIndex++) {
                    JSONObject candidate = releases.getJSONObject(releaseIndex);
                    if (candidate.optBoolean("draft") || candidate.optBoolean("prerelease")) continue;
                    java.util.regex.Matcher matcher = releaseTag.matcher(candidate.optString("tag_name"));
                    if (!matcher.matches()) continue;
                    int candidateCode = Integer.parseInt(matcher.group(2));
                    org.json.JSONArray assets = candidate.optJSONArray("assets");
                    if (assets == null) continue;
                    for (int assetIndex = 0; assetIndex < assets.length(); assetIndex++) {
                        JSONObject asset = assets.getJSONObject(assetIndex);
                        if ("YamaConvert-Android.apk".equals(asset.optString("name")) && candidateCode > latestCode) {
                            latestCode = candidateCode;
                            downloadUrl = asset.optString("browser_download_url");
                            release = candidate;
                        }
                    }
                }
                if (release == null || downloadUrl == null) return;
                long installedCode = Build.VERSION.SDK_INT >= 28
                    ? getPackageManager().getPackageInfo(getPackageName(), 0).getLongVersionCode()
                    : getPackageManager().getPackageInfo(getPackageName(), 0).versionCode;
                if (downloadUrl == null || latestCode <= installedCode || !downloadUrl.startsWith("https://github.com/")) return;
                String tag = release.optString("tag_name", "");
                final String updateUrl = downloadUrl;
                final int updateCode = latestCode;
                main.post(() -> new AlertDialog.Builder(YamaConvertActivity.this)
                    .setTitle("Je dostupná nová verze YamaConvert")
                    .setMessage("Verze " + tag.replace("yamaconvert-", "") + " je připravena. Stáhnout a nainstalovat aktualizaci?")
                    .setNegativeButton("Později", (dialog, which) -> dialog.dismiss())
                    .setPositiveButton("Aktualizovat", (dialog, which) -> downloadUpdate(updateUrl, updateCode))
                    .show());
            } catch (Exception ignored) {
                // Update checks are optional; a network or API failure must not block the app.
            } finally { if (connection != null) connection.disconnect(); }
        });
    }

    private void downloadUpdate(String url, int versionCode) {
        Toast.makeText(this, "Stahuji aktualizaci…", Toast.LENGTH_SHORT).show();
        downloads.execute(() -> {
            HttpURLConnection connection = null;
            File updateDir = new File(getCacheDir(), "yamaconvert-updates");
            updateDir.mkdirs();
            File apk = new File(updateDir, "yamaconvert-update-" + versionCode + ".apk");
            try {
                connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(30000);
                connection.setInstanceFollowRedirects(true);
                if (connection.getResponseCode() != 200 || connection.getContentLengthLong() > 200L * 1024L * 1024L)
                    throw new IOException("Soubor aktualizace není dostupný nebo je příliš velký.");
                long received = 0;
                try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(apk)) {
                    byte[] buffer = new byte[65536];
                    int count;
                    while ((count = input.read(buffer)) != -1) {
                        received += count;
                        if (received > 200L * 1024L * 1024L) throw new IOException("Aktualizace překročila limit 200 MB.");
                        output.write(buffer, 0, count);
                    }
                }
                if (!apk.isFile() || apk.length() < 1024) throw new IOException("Stažený instalační soubor je neúplný.");
                pendingUpdateApk = apk;
                main.post(this::installPendingUpdate);
            } catch (Exception error) {
                apk.delete();
                main.post(() -> Toast.makeText(this, "Aktualizaci se nepodařilo stáhnout.", Toast.LENGTH_LONG).show());
            } finally { if (connection != null) connection.disconnect(); }
        });
    }

    private void installPendingUpdate() {
        if (pendingUpdateApk == null || !pendingUpdateApk.isFile()) return;
        if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
            Toast.makeText(this, "Povol instalaci aplikací pro YamaConvert a vrať se zpět.", Toast.LENGTH_LONG).show();
            startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getPackageName())));
            return;
        }
        try {
            Uri apkUri = FileProvider.getUriForFile(this, getPackageName() + ".updates", pendingUpdateApk);
            Intent install = new Intent(Intent.ACTION_VIEW);
            install.setDataAndType(apkUri, "application/vnd.android.package-archive");
            install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(install);
        } catch (Exception error) {
            Toast.makeText(this, "Android instalační balíček nemohl otevřít.", Toast.LENGTH_LONG).show();
        }
    }

    private static String sharedText(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return null;
        String value = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (value == null) return null;
        value = value.trim();
        java.util.regex.Matcher link = Pattern.compile("https://\\S+", Pattern.CASE_INSENSITIVE).matcher(value);
        if (link.find()) value = link.group().replaceAll("[),.]+$", "");
        return value.length() <= 4096 ? value : null;
    }

    private static WebResourceResponse response(int code, String reason, java.io.InputStream body) {
        return new WebResourceResponse("text/plain", "UTF-8", code, reason,
            Map.of("Cache-Control", "no-store", "Access-Control-Allow-Origin", SITE_ORIGIN), body);
    }

    private static void deleteTree(File file) {
        if (file == null || !file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteTree(child);
        file.delete();
    }

    private Set<String> loadSupportedMediaHosts() {
        Set<String> hosts = new HashSet<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(getAssets().open("supported-sites.txt"), java.nio.charset.StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                line = line.trim();
                if (!line.isEmpty() && !line.startsWith("#")) hosts.add(line.toLowerCase(Locale.ROOT));
            }
        } catch (IOException ignored) {
            // An empty allow-list fails closed if the packaged site registry is missing.
        }
        return Set.copyOf(hosts);
    }

    private final class AndroidBridge {
        @JavascriptInterface public boolean isReady() { return true; }

        @JavascriptInterface public void downloadMedia(String rawUrl, String format, String requestId) {
            if (requestId == null || !REQUEST_ID.matcher(requestId).matches()) return;
            URI uri;
            try { uri = URI.create(rawUrl); }
            catch (Exception error) { fail(requestId, "Odkaz není platný."); return; }
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
            boolean supported = supportedMediaHosts.stream().anyMatch(domain -> host.equals(domain) || host.endsWith("." + domain));
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getUserInfo() != null || uri.getPort() != -1 && uri.getPort() != 443 || !supported) {
                fail(requestId, "Podporujeme veřejné HTTPS odkazy z uvedených video a sociálních sítí.");
                return;
            }
            if (!"audio/mpeg".equals(format) && !"video/mp4".equals(format) && !"video/webm".equals(format)) {
                fail(requestId, "Vyber MP3, MP4 nebo WEBM.");
                return;
            }
            File directory = new File(getCacheDir(), "yamaconvert-media/" + UUID.randomUUID());
            if (!directory.mkdirs()) { fail(requestId, "Dočasnou složku se nepodařilo připravit."); return; }
            String selector = "audio/mpeg".equals(format)
                ? "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio"
                : "video/webm".equals(format)
                    ? "best[ext=webm][acodec!=none]/best[acodec!=none]"
                    : "best[ext=mp4][acodec!=none]/best[acodec!=none]";
            YtDlpRequest request = new YtDlpRequest(uri.toString())
                .setOutputTemplate(new File(directory, "%(id)s.%(ext)s").getAbsolutePath())
                .addOption("--no-config")
                .addOption("--no-playlist")
                .addOption("--no-warnings")
                .addOption("--socket-timeout", "15")
                .addOption("--retries", "1")
                .addOption("--max-filesize", "100M")
                .addOption("--remote-components", "ejs:github")
                .addOption("-f", selector);
            File quickJs = new File(getApplicationInfo().nativeLibraryDir, "libqjs.so");
            if (!quickJs.isFile() || !quickJs.canExecute()) {
                deleteTree(directory);
                fail(requestId, "Android stahovací engine není kompletní. Nainstaluj aktuální vydání z Yamaportalu.");
                return;
            }
            request.addOption("--js-runtimes", "quickjs:" + quickJs.getAbsolutePath());
            FutureTask<Void> task = new FutureTask<>(() -> {
                try {
                    YtDlp.init(getApplicationContext());
                    YtDlpResponse result = YtDlp.execute(request,
                        (progress, eta, line) -> { if (!cancelledJobs.contains(requestId)) progress(requestId, progress); });
                    if (!result.isSuccess()) throw new IOException(friendlyError(result.getErrorOutput()));
                    if (cancelledJobs.contains(requestId)) { deleteTree(directory); return null; }
                    File[] files = directory.listFiles((dir, name) -> !name.endsWith(".part") && !name.endsWith(".ytdl"));
                    if (files == null || files.length != 1 || !files[0].isFile() || files[0].length() == 0 || files[0].length() > MAX_BYTES) {
                        throw new IOException("Soubor překročil limit 100 MB nebo ho platforma nevrátila.");
                    }
                    String downloadId = UUID.randomUUID().toString();
                    exposedFiles.put(downloadId, files[0]);
                    String name = files[0].getName();
                    String mime = name.endsWith(".webm") ? "video/webm" : name.endsWith(".m4a") ? "audio/mp4" : "video/mp4";
                    main.post(() -> evaluate("window.onYamaConvertNativeComplete&&window.onYamaConvertNativeComplete(" +
                        JSONObject.quote(requestId) + "," + JSONObject.quote(downloadId) + "," + JSONObject.quote(name) + "," + JSONObject.quote(mime) + ")"));
                } catch (Exception error) {
                    deleteTree(directory);
                    if (!cancelledJobs.contains(requestId)) fail(requestId, error.getMessage() == null ? "Stahování se nepodařilo." : error.getMessage());
                } finally { activeJobs.remove(requestId); cancelledJobs.remove(requestId); }
                return null;
            });
            Future<?> previous = activeJobs.put(requestId, task);
            if (previous != null) previous.cancel(true);
            downloads.execute(task);
        }

        @JavascriptInterface public void cancelMediaDownload(String requestId) {
            if (requestId == null || !REQUEST_ID.matcher(requestId).matches()) return;
            cancelledJobs.add(requestId);
            Future<?> task = activeJobs.remove(requestId);
            if (task != null) task.cancel(true);
        }

        @JavascriptInterface public void releaseDownload(String downloadId) {
            File file = exposedFiles.remove(downloadId);
            if (file != null) deleteTree(file.getParentFile());
        }
    }

    private void progress(String requestId, float progress) {
        main.post(() -> evaluate("window.onYamaConvertNativeProgress&&window.onYamaConvertNativeProgress(" +
            JSONObject.quote(requestId) + "," + Math.round(progress) + ",\"\")"));
    }

    private void fail(String requestId, String message) {
        main.post(() -> evaluate("window.onYamaConvertNativeError&&window.onYamaConvertNativeError(" +
            JSONObject.quote(requestId) + "," + JSONObject.quote(message) + ")"));
    }

    private void evaluate(String script) {
        if (webView != null) webView.evaluateJavascript(script, null);
    }

    private static String friendlyError(String raw) {
        String error = raw == null ? "" : raw.toLowerCase(Locale.ROOT);
        if (error.contains("not a bot") || error.contains("captcha") || error.contains("automated"))
            return "Platforma omezuje automatické stahování této položky. Aplikace nepřekonává její ochranu.";
        if (error.contains("no supported javascript runtime") || error.contains("js challenge") || error.contains("ejs"))
            return "YouTube změnil ověření videa. Aktualizuj YamaConvert z Yamaportalu a zkus to znovu.";
        if (error.contains("sign in") || error.contains("login") || error.contains("private") || error.contains("members only"))
            return "Příspěvek vyžaduje přihlášení nebo není veřejný.";
        if (error.contains("requested format is not available")) return "Příspěvek nenabízí zvolený formát.";
        return "Příspěvek se nepodařilo stáhnout. Může být nedostupný, soukromý nebo platforma změnila přístup.";
    }

    @Override protected void onDestroy() {
        for (Future<?> job : activeJobs.values()) job.cancel(true);
        activeJobs.clear();
        cancelledJobs.clear();
        exposedFiles.clear();
        deleteTree(new File(getCacheDir(), "yamaconvert-media"));
        downloads.shutdownNow();
        if (webView != null) { webView.removeJavascriptInterface("YamaConvertAndroid"); webView.destroy(); webView = null; }
        super.onDestroy();
    }
}

