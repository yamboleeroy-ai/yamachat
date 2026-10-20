package eu.yamaportal.app;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Opens only installed Yama apps. It never forwards account credentials or session tokens. */
@CapacitorPlugin(name = "YamaAppLauncher")
public final class YamaAppLauncherPlugin extends Plugin {
    private static final String PORTAL_PACKAGE = "eu.yamaportal.app";
    private static final String[] SEARCH_PACKAGES = {
        "eu.yamachat.yamasearch.mobile",
        "eu.yamachat.yamasearch.mobile.preview"
    };

    @PluginMethod
    public void apps(PluginCall call) {
        JSArray result = new JSArray();
        JSObject search = new JSObject();
        search.put("id", "search");
        search.put("installed", findLaunchIntent(SEARCH_PACKAGES) != null);
        result.put(search);
        JSObject payload = new JSObject();
        payload.put("apps", result);
        call.resolve(payload);
    }

    @PluginMethod
    public void launch(PluginCall call) {
        String id = call.getString("id", "");
        if (!"search".equals(id)) {
            call.reject("Tato Android aplikace zatím nemá nativní spouštění.");
            return;
        }
        Intent intent = findLaunchIntent(SEARCH_PACKAGES);
        if (intent == null) {
            call.reject("YamaSearch není v tomto zařízení nainstalovaný.");
            return;
        }
        try {
            getActivity().startActivity(intent);
            JSObject result = new JSObject();
            result.put("launched", true);
            call.resolve(result);
        } catch (Exception error) {
            Log.w("YamaPortal", "Unable to launch YamaSearch", error);
            call.reject("YamaSearch se nepodařilo otevřít.");
        }
    }

    @PluginMethod
    public void returnToPortal(PluginCall call) {
        Intent intent = findLaunchIntent(new String[] {PORTAL_PACKAGE});
        if (intent == null) {
            call.reject("Yamaportal není v tomto zařízení nainstalovaný.");
            return;
        }
        try {
            getActivity().startActivity(intent);
            JSObject result = new JSObject();
            result.put("returned", true);
            call.resolve(result);
        } catch (Exception error) {
            Log.w("YamaPortal", "Unable to return to Yamaportal", error);
            call.reject("Návrat do Yamaportalu se nepodařil.");
        }
    }

    private Intent findLaunchIntent(String[] packages) {
        PackageManager manager = getContext().getPackageManager();
        for (String packageName : packages) {
            Intent intent = manager.getLaunchIntentForPackage(packageName);
            if (intent != null) return intent;
        }
        return null;
    }
}
