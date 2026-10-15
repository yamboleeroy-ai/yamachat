package eu.yamachat.yamasearch;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

final class BrowserStore {
    private static final int FAVICON_EDGE = 48;
    private static final int MAX_FAVICON_BYTES = 16 * 1024;
    private static final int MAX_FAVICON_BASE64_CHARS = 24 * 1024;

    static final class Entry {
        final String url;
        final String title;
        final String favicon;

        Entry(String url, String title) { this(url, title, ""); }
        Entry(String url, String title, String favicon) {
            this.url = url;
            this.title = title;
            this.favicon = favicon == null ? "" : favicon;
        }
    }

    private final SharedPreferences prefs;
    BrowserStore(Context context) {
        prefs = context.getSharedPreferences("yamasearch_browser", Context.MODE_PRIVATE);
    }

    private List<Entry> read(String key) {
        List<Entry> list = new ArrayList<>();
        try {
            JSONArray array = new JSONArray(prefs.getString(key, "[]"));
            for (int i = 0; i < array.length(); i++) {
                JSONObject object = array.getJSONObject(i);
                String url = object.optString("url");
                if (url.startsWith("https://") || url.startsWith("http://"))
                    list.add(new Entry(url, object.optString("title", url),
                        safeFavicon(object.optString("favicon", ""))));
            }
        } catch (Exception ignored) { }
        return list;
    }

    private void write(String key, List<Entry> list) {
        JSONArray array = new JSONArray();
        try {
            for (Entry entry : list) {
                JSONObject item = new JSONObject();
                item.put("url", entry.url);
                item.put("title", entry.title);
                if (!entry.favicon.isEmpty()) item.put("favicon", entry.favicon);
                array.put(item);
            }
        } catch (Exception ignored) { }
        prefs.edit().putString(key, array.toString()).apply();
    }

    List<Entry> bookmarks() { return read("bookmarks"); }
    List<Entry> history() { return read("history"); }

    boolean isBookmarked(String url) {
        for (Entry entry : bookmarks()) if (entry.url.equals(url)) return true;
        return false;
    }

    void toggleBookmark(String url, String title, String favicon) {
        List<Entry> list = bookmarks();
        if (!list.removeIf(entry -> entry.url.equals(url))) {
            list.add(0, new Entry(url, title, safeFavicon(favicon)));
        }
        write("bookmarks", list);
    }

    boolean removeBookmark(String url) {
        List<Entry> list = bookmarks();
        boolean changed = list.removeIf(entry -> entry.url.equals(url));
        if (changed) write("bookmarks", list);
        return changed;
    }

    void restoreBookmark(Entry entry, int index) {
        if (entry == null || !isWebUrl(entry.url)) return;
        List<Entry> list = bookmarks();
        list.removeIf(existing -> existing.url.equals(entry.url));
        list.add(Math.max(0, Math.min(index, list.size())),
            new Entry(entry.url, entry.title, safeFavicon(entry.favicon)));
        write("bookmarks", list);
    }

    void moveBookmark(int from, int to) {
        List<Entry> list = bookmarks();
        if (from < 0 || to < 0 || from >= list.size() || to >= list.size() || from == to) return;
        Entry moved = list.remove(from);
        list.add(to, moved);
        write("bookmarks", list);
    }

    void updateBookmarkMetadata(String url, String title, String favicon) {
        if (!isWebUrl(url)) return;
        List<Entry> list = bookmarks();
        boolean changed = false;
        String safeTitle = title == null || title.trim().isEmpty() ? url : title.trim();
        String safeIcon = safeFavicon(favicon);
        for (int index = 0; index < list.size(); index++) {
            Entry entry = list.get(index);
            if (!entry.url.equals(url)) continue;
            String nextIcon = safeIcon.isEmpty() ? entry.favicon : safeIcon;
            if (!safeTitle.equals(entry.title) || !nextIcon.equals(entry.favicon)) {
                list.set(index, new Entry(entry.url, safeTitle, nextIcon));
                changed = true;
            }
            break;
        }
        if (changed) write("bookmarks", list);
    }

    static String encodeFavicon(Bitmap icon) {
        if (icon == null || icon.getWidth() <= 0 || icon.getHeight() <= 0) return "";
        Bitmap normalized = icon;
        try {
            int largest = Math.max(icon.getWidth(), icon.getHeight());
            if (largest > FAVICON_EDGE) {
                float scale = FAVICON_EDGE / (float) largest;
                normalized = Bitmap.createScaledBitmap(icon,
                    Math.max(1, Math.round(icon.getWidth() * scale)),
                    Math.max(1, Math.round(icon.getHeight() * scale)), true);
            }
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            if (!normalized.compress(Bitmap.CompressFormat.PNG, 100, bytes)
                || bytes.size() > MAX_FAVICON_BYTES) return "";
            return Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP);
        } catch (Exception ignored) {
            return "";
        } finally {
            if (normalized != icon) normalized.recycle();
        }
    }

    static Bitmap decodeFavicon(String encoded) {
        String safe = safeFavicon(encoded);
        if (safe.isEmpty()) return null;
        try {
            byte[] bytes = Base64.decode(safe, Base64.DEFAULT);
            if (bytes.length == 0 || bytes.length > MAX_FAVICON_BYTES) return null;
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0
                || bounds.outWidth > FAVICON_EDGE * 4 || bounds.outHeight > FAVICON_EDGE * 4) return null;
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static boolean isWebUrl(String url) {
        return url != null && (url.startsWith("https://") || url.startsWith("http://"));
    }

    private static String safeFavicon(String favicon) {
        return favicon != null && favicon.length() <= MAX_FAVICON_BASE64_CHARS ? favicon : "";
    }

    void addHistory(String url, String title) {
        if (!url.startsWith("http://") && !url.startsWith("https://")) return;
        List<Entry> list = history();
        list.removeIf(entry -> entry.url.equals(url));
        list.add(0, new Entry(url, title));
        if (list.size() > 500) list = new ArrayList<>(list.subList(0, 500));
        write("history", list);
    }

    void clearHistory() { prefs.edit().remove("history").apply(); }

    String blockerMode() { return prefs.getString("blockerMode", "strict"); }
    void setBlockerMode(String mode) {
        if ("off".equals(mode) || "standard".equals(mode) || "strict".equals(mode))
            prefs.edit().putString("blockerMode", mode).apply();
    }

    boolean isBlockerDisabledForHost(String host) {
        String safeHost = safeHost(host);
        if (safeHost.isEmpty()) return false;
        return new HashSet<>(prefs.getStringSet("blockerExceptions", new HashSet<>())).contains(safeHost);
    }

    void setBlockerDisabledForHost(String host, boolean disabled) {
        String safeHost = safeHost(host);
        if (safeHost.isEmpty()) return;
        Set<String> exceptions = new HashSet<>(prefs.getStringSet("blockerExceptions", new HashSet<>()));
        if (disabled) exceptions.add(safeHost);
        else exceptions.remove(safeHost);
        prefs.edit().putStringSet("blockerExceptions", exceptions).apply();
    }

    String sitePermissionState(String origin, String kind) {
        if (!isPermissionKind(kind)) return "ask";
        String safeOrigin = safeOrigin(origin);
        if (safeOrigin.isEmpty()) return "ask";
        try {
            JSONObject all = new JSONObject(prefs.getString("sitePermissions", "{}"));
            JSONObject site = all.optJSONObject(safeOrigin);
            String state = site == null ? "ask" : site.optString(kind, "ask");
            return "allow".equals(state) || "deny".equals(state) ? state : "ask";
        } catch (Exception ignored) {
            return "ask";
        }
    }

    void setSitePermissionState(String origin, String kind, String state) {
        if (!isPermissionKind(kind)) return;
        String safeOrigin = safeOrigin(origin);
        if (safeOrigin.isEmpty()) return;
        String safeState = "allow".equals(state) || "deny".equals(state) ? state : "ask";
        try {
            JSONObject all = new JSONObject(prefs.getString("sitePermissions", "{}"));
            JSONObject site = all.optJSONObject(safeOrigin);
            if (site == null) site = new JSONObject();
            if ("ask".equals(safeState)) site.remove(kind);
            else site.put(kind, safeState);
            if (site.length() == 0) all.remove(safeOrigin);
            else all.put(safeOrigin, site);
            prefs.edit().putString("sitePermissions", all.toString()).apply();
        } catch (Exception ignored) { }
    }

    void resetSitePermissionStates(String origin) {
        String safeOrigin = safeOrigin(origin);
        if (safeOrigin.isEmpty()) return;
        try {
            JSONObject all = new JSONObject(prefs.getString("sitePermissions", "{}"));
            all.remove(safeOrigin);
            prefs.edit().putString("sitePermissions", all.toString()).apply();
        } catch (Exception ignored) { }
    }

    private static String safeHost(String host) {
        if (host == null) return "";
        String normalized = host.trim().toLowerCase(java.util.Locale.ROOT);
        return normalized.matches("[a-z0-9.-]+") && !normalized.startsWith(".") && !normalized.endsWith(".")
            ? normalized : "";
    }

    private static boolean isPermissionKind(String kind) {
        return "camera".equals(kind) || "microphone".equals(kind) || "location".equals(kind);
    }

    static String canonicalPermissionOrigin(String origin) {
        try {
            android.net.Uri uri = android.net.Uri.parse(origin == null ? "" : origin);
            if (!"https".equalsIgnoreCase(uri.getScheme())) return "";
            String host = safeHost(uri.getHost());
            if (host.isEmpty()) return "";
            int port = uri.getPort();
            // https://example.test and https://example.test:443 are the same
            // security origin.  Store one canonical form so a site cannot
            // accidentally get two independent permission records.
            return "https://" + host + (port >= 0 && port != 443 ? ":" + port : "");
        } catch (Exception ignored) {
            return "";
        }
    }

    private static String safeOrigin(String origin) {
        return canonicalPermissionOrigin(origin);
    }
}
