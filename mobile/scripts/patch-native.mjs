import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const target = process.argv[2] || 'all';

function walk(dir, visitor) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, visitor);
    else visitor(full);
  }
}

function patchAndroidBranding(res) {
  const preferredLogo = path.join(root, 'www/build/yamachat-logo-symbol.png');
  const fallbackLogo = path.join(root, 'www/icons/icon-512.png');
  const brandLogo = fs.existsSync(preferredLogo) ? preferredLogo : fallbackLogo;
  if (!fs.existsSync(brandLogo) || !fs.existsSync(res)) return;

  // Launcher: prefer the clean, transparent Yamachat symbol generated from the
  // desktop-derived web assets instead of Capacitor's default icon.
  for (const dir of fs.readdirSync(res).filter(x => /^mipmap-(mdpi|hdpi|xhdpi|xxhdpi|xxxhdpi)$/.test(x))) {
    const dst = path.join(res, dir);
    for (const name of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
      const out = path.join(dst, name);
      if (fs.existsSync(out)) fs.copyFileSync(brandLogo, out);
    }
  }

  // Native launch screen: remove Capacitor's generated white splash bitmaps and
  // replace the shared @drawable/splash resource with Yamachat branding.
  walk(res, file => {
    if (path.basename(file) === 'splash.png') fs.rmSync(file, { force: true });
  });

  const nodpi = path.join(res, 'drawable-nodpi');
  fs.mkdirSync(nodpi, { recursive: true });
  fs.copyFileSync(brandLogo, path.join(nodpi, 'yamachat_splash_logo.png'));

  const drawable = path.join(res, 'drawable');
  fs.mkdirSync(drawable, { recursive: true });
  fs.writeFileSync(path.join(drawable, 'splash.xml'), `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item>
        <shape android:shape="rectangle">
            <solid android:color="#071019" />
        </shape>
    </item>
    <item android:gravity="center" android:width="176dp" android:height="176dp">
        <bitmap android:src="@drawable/yamachat_splash_logo" android:gravity="fill" />
    </item>
</layer-list>
`, 'utf8');

  // Android 12+ may render a system splash before Capacitor gets control.
  // Keep that system stage in the same Yamachat colors/logo when those theme
  // items exist in the generated project.
  walk(res, file => {
    if (!file.endsWith('.xml') || !file.includes(`${path.sep}values`)) return;
    let xml = fs.readFileSync(file, 'utf8');
    const before = xml;
    xml = xml.replace(
      /(<item\s+name="(?:android:)?windowSplashScreenBackground">)[\s\S]*?(<\/item>)/g,
      '$1#071019$2'
    );
    xml = xml.replace(
      /(<item\s+name="(?:android:)?windowSplashScreenAnimatedIcon">)[\s\S]*?(<\/item>)/g,
      '$1@drawable/yamachat_splash_logo$2'
    );
    if (xml !== before) fs.writeFileSync(file, xml, 'utf8');
  });

  console.log('Android Yamachat launcher and native splash branding patched.');
}

function patchAndroid() {
  const p = path.join(root, 'android/app/src/main/AndroidManifest.xml');
  if (!fs.existsSync(p)) {
    console.log('Android project not generated yet; skipping manifest patch.');
    return;
  }
  let xml = fs.readFileSync(p, 'utf8');
  const permissions = [
    '<uses-permission android:name="android.permission.INTERNET" />',
    '<uses-permission android:name="android.permission.RECORD_AUDIO" />',
    '<uses-permission android:name="android.permission.CAMERA" />',
    '<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />',
    '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
    '<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />',
    '<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />'
  ];
  for (const line of permissions) {
    const name = line.match(/android:name="([^"]+)"/)?.[1];
    if (name && !xml.includes(name)) xml = xml.replace(/<manifest([^>]*)>/, '<manifest$1>\n    ' + line);
  }
  if (!xml.includes('android.support.FILE_PROVIDER_PATHS')) {
    const provider = [
      '        <provider',
      '            android:name="androidx.core.content.FileProvider"',
      '            android:authorities="${applicationId}.fileprovider"',
      '            android:exported="false"',
      '            android:grantUriPermissions="true">',
      '            <meta-data',
      '                android:name="android.support.FILE_PROVIDER_PATHS"',
      '                android:resource="@xml/yamachat_file_paths" />',
      '        </provider>'
    ].join('\n');
    xml = xml.replace('</application>', provider + '\n    </application>');
  }
  fs.writeFileSync(p, xml, 'utf8');

  // Patch the Android bundle only, after cap sync. Web/iOS assets stay identical.
  const publicDir = path.join(root, 'android/app/src/main/assets/public');
  const htmlPath = path.join(publicDir, 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf8');
  const androidStyle = '<link rel="stylesheet" href="./android-portrait.css">';
  if (!html.includes(androidStyle)) html = html.replace('</head>', androidStyle + '\n</head>');
  fs.writeFileSync(htmlPath, html);
  fs.copyFileSync(path.join(root, 'android-portrait.css'), path.join(publicDir, 'android-portrait.css'));

  // Apply only to the generated Android project; iOS configuration is unchanged.
  const gradlePath = path.join(root, 'android/app/build.gradle');
  let gradle = fs.readFileSync(gradlePath, 'utf8');
  const release = JSON.parse(fs.readFileSync(path.join(root, 'android-release.json'), 'utf8'));
  const config = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
  if (config.appId !== release.applicationId || !gradle.includes('applicationId "' + release.applicationId + '"')) {
    throw new Error('Android package changed; refusing an incompatible build');
  }
  const apply = "apply from: '../../android-signing.gradle'";
  if (!gradle.includes(apply)) fs.writeFileSync(gradlePath, gradle + '\n' + apply + '\n');
  patchAndroidUpdater(release);
  patchAndroidBranding(path.join(root, 'android/app/src/main/res'));
  console.log('Android permissions and Yamachat native branding patched.');
}


function patchAndroidUpdater(release) {
  const pkg = String(release.applicationId || '').trim();
  if (!pkg) throw new Error('Android updater package is missing');

  const javaDir = path.join(root, 'android/app/src/main/java', ...pkg.split('.'));
  fs.mkdirSync(javaDir, { recursive: true });

  const pluginSource = `package ${pkg};

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.security.MessageDigest;
import java.util.Locale;

@CapacitorPlugin(name = "YamachatUpdate")
public class YamachatUpdatePlugin extends Plugin {
    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        final String url = call.getString("url", "").trim();
        final String version = call.getString("version", "latest").trim();
        final String expectedSha256 = call.getString("sha256", "").replace(":", "").trim().toLowerCase(Locale.ROOT);

        if (!url.startsWith("https://")) {
            call.reject("Aktualizační URL není platná.");
            return;
        }

        Context context = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.getPackageManager().canRequestPackageInstalls()) {
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + context.getPackageName()));
            if (getActivity() != null) getActivity().startActivity(settings);
            else {
                settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(settings);
            }
            JSObject result = new JSObject();
            result.put("permissionRequired", true);
            call.resolve(result);
            return;
        }

        try {
            String safeVersion = version.replaceAll("[^0-9A-Za-z._-]", "_");
            String fileName = "Yamachat-" + (safeVersion.isEmpty() ? "update" : safeVersion) + ".apk";
            File dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (dir == null) throw new IllegalStateException("Android update directory is unavailable");
            if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("Android update directory cannot be created");
            File target = new File(dir, fileName);
            if (target.exists()) target.delete();

            DownloadManager manager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setTitle("Yamachat " + version);
            request.setDescription("Stahuji aktualizaci Yamachatu");
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(false);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
            request.setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, fileName);
            long id = manager.enqueue(request);

            JSObject result = new JSObject();
            result.put("started", true);
            result.put("downloadId", id);
            call.resolve(result);

            Thread watcher = new Thread(() -> monitorDownload(manager, id, target, expectedSha256), "yamachat-update-download");
            watcher.setDaemon(true);
            watcher.start();
        } catch (Exception error) {
            call.reject("Aktualizaci se nepodařilo spustit: " + safeMessage(error));
        }
    }

    private void monitorDownload(DownloadManager manager, long id, File target, String expectedSha256) {
        try {
            boolean done = false;
            while (!done) {
                DownloadManager.Query query = new DownloadManager.Query().setFilterById(id);
                try (Cursor cursor = manager.query(query)) {
                    if (cursor == null || !cursor.moveToFirst()) throw new IllegalStateException("Stažení aktualizace zmizelo ze systému.");
                    int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                    long downloaded = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                    long total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                    double percent = total > 0 ? Math.min(100d, (downloaded * 100d) / total) : 0d;

                    if (status == DownloadManager.STATUS_SUCCESSFUL) {
                        emit("verifying", 100d, "Ověřuji APK");
                        if (!target.isFile()) throw new IllegalStateException("Stažená APK nebyla nalezena.");
                        if (!expectedSha256.isEmpty()) {
                            String actual = sha256(target);
                            if (!expectedSha256.equals(actual)) {
                                target.delete();
                                throw new SecurityException("Kontrolní součet APK nesouhlasí.");
                            }
                        }
                        emit("ready", 100d, "APK je připravená");
                        installApk(target);
                        done = true;
                    } else if (status == DownloadManager.STATUS_FAILED) {
                        int reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
                        throw new IllegalStateException("Android odmítl stažení aktualizace (" + reason + ").");
                    } else {
                        emit("downloading", percent, "Stahuji aktualizaci");
                    }
                }
                if (!done) Thread.sleep(500);
            }
        } catch (Exception error) {
            emit("error", 0d, safeMessage(error));
        }
    }

    private void installApk(File apk) {
        Context context = getContext();
        Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", apk);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }

    private void emit(String status, double percent, String message) {
        JSObject data = new JSObject();
        data.put("status", status);
        data.put("percent", percent);
        data.put("message", message == null ? "" : message);
        if (getActivity() != null) getActivity().runOnUiThread(() -> notifyListeners("updateProgress", data));
        else notifyListeners("updateProgress", data);
    }

    private String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (FileInputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[1024 * 128];
            int read;
            while ((read = input.read(buffer)) > 0) digest.update(buffer, 0, read);
        }
        StringBuilder out = new StringBuilder();
        for (byte b : digest.digest()) out.append(String.format(Locale.ROOT, "%02x", b));
        return out.toString();
    }

    private String safeMessage(Exception error) {
        String message = error == null ? "" : String.valueOf(error.getMessage());
        if (message == null || message.trim().isEmpty()) message = error == null ? "Neznámá chyba" : error.getClass().getSimpleName();
        return message.replaceAll("\\s+", " ").trim();
    }
}
`;
  fs.writeFileSync(path.join(javaDir, 'YamachatUpdatePlugin.java'), pluginSource, 'utf8');

  const mainActivity = `package ${pkg};

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Capacitor must know custom plugins before BridgeActivity creates the bridge.
        // Registering after super.onCreate() leaves JS with a proxy that reports
        // "plugin is not implemented on android".
        registerPlugin(YamachatUpdatePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`;
  fs.writeFileSync(path.join(javaDir, 'MainActivity.java'), mainActivity, 'utf8');

  const xmlDir = path.join(root, 'android/app/src/main/res/xml');
  fs.mkdirSync(xmlDir, { recursive: true });
  fs.writeFileSync(path.join(xmlDir, 'yamachat_file_paths.xml'), `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <external-files-path name="yamachat_updates" path="Download/" />
</paths>
`, 'utf8');

  console.log('Android in-app APK updater patched.');
}

function plistEntry(key, value) {
  return `\n\t<key>${key}</key>\n\t<string>${value}</string>`;
}

function patchIos() {
  const p = path.join(root, 'ios/App/App/Info.plist');
  if (!fs.existsSync(p)) {
    console.log('iOS project not generated yet; skipping Info.plist patch.');
    return;
  }
  let xml = fs.readFileSync(p, 'utf8');
  const entries = [
    ['NSMicrophoneUsageDescription', 'Yamachat potřebuje mikrofon pro hlasové kanály a hovory.'],
    ['NSCameraUsageDescription', 'Yamachat potřebuje kameru pro video a sdílení médií.'],
    ['NSPhotoLibraryUsageDescription', 'Yamachat potřebuje přístup k fotkám pro odesílání obrázků a souborů.']
  ];
  for (const [key, value] of entries) {
    if (!xml.includes('<key>' + key + '</key>')) xml = xml.replace('</dict>', plistEntry(key, value) + '\n</dict>');
  }
  if (!xml.includes('<key>UIBackgroundModes</key>')) {
    xml = xml.replace('</dict>', '\n\t<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>audio</string>\n\t</array>\n</dict>');
  }
  fs.writeFileSync(p, xml, 'utf8');
  console.log('iOS privacy/background audio keys patched.');
}

if (target === 'all' || target === 'android') patchAndroid();
if (target === 'all' || target === 'ios') patchIos();
