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
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

final class BrowserStore {
    private static final int FAVICON_EDGE = 48;
    private static final int MAX_FAVICON_BYTES = 16 * 1024;
    private static final int MAX_FAVICON_BASE64_CHARS = 24 * 1024;
    private static final int MAX_STORED_URL_CHARS = 4096;
    private static final int MAX_TITLE_CODE_POINTS = 256;
    private static final int MAX_SEARCHES = 100;
    private static final int MAX_QUERY_CODE_POINTS = 256;
    private static final int MAX_DISPLAY_NAME_CODE_POINTS = 48;
    private static final String SEARCH_HISTORY_KEY = "searchHistoryV1";
    private static final String PROFILE_SETTINGS_KEY = "profileSettingsV1";
    private static final String DEFAULT_PROFILE_NAME = "Můj profil";

    /**
     * SharedPreferences makes an individual edit atomic, but a read-modify-write
     * sequence is not atomic. One process can own more than one BrowserActivity,
     * so all BrowserStore instances in that process use the same lock.
     */
    private static final Object STORE_LOCK = new Object();

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

    static final class SearchEntry {
        final String query;
        final long lastUsedAt;
        final int useCount;

        SearchEntry(String query, long lastUsedAt, int useCount) {
            this.query = query;
            this.lastUsedAt = Math.max(0L, lastUsedAt);
            this.useCount = Math.max(1, useCount);
        }
    }

    static final class ProfileSettings {
        final String displayName;
        final boolean rememberSearches;
        final boolean showFavoritesOnHome;
        final boolean showRecentSearches;

        ProfileSettings(String displayName, boolean rememberSearches,
                        boolean showFavoritesOnHome, boolean showRecentSearches) {
            this.displayName = safeDisplayName(displayName);
            this.rememberSearches = rememberSearches;
            this.showFavoritesOnHome = showFavoritesOnHome;
            this.showRecentSearches = showRecentSearches;
        }
    }

    private final SharedPreferences prefs;
    BrowserStore(Context context) {
        prefs = context.getSharedPreferences("yamasearch_browser", Context.MODE_PRIVATE);
    }

    private List<Entry> read(String key) {
        synchronized (STORE_LOCK) {
            List<Entry> list = new ArrayList<>();
            try {
                JSONArray array = new JSONArray(prefs.getString(key, "[]"));
                for (int i = 0; i < array.length(); i++) {
                    // One malformed item must not hide every otherwise valid
                    // bookmark or history entry already stored by older builds.
                    JSONObject object = array.optJSONObject(i);
                    if (object == null) continue;
                    String url = safeStoredUrl(object.optString("url"));
                    if (!url.isEmpty())
                        list.add(new Entry(url, safeStoredTitle(object.optString("title", url), url),
                            safeFavicon(object.optString("favicon", ""))));
                }
            } catch (Exception ignored) { }
            return list;
        }
    }

    private void write(String key, List<Entry> list) {
        synchronized (STORE_LOCK) {
            JSONArray array = new JSONArray();
            try {
                for (Entry entry : list) {
                    String url = safeStoredUrl(entry.url);
                    if (url.isEmpty()) continue;
                    JSONObject item = new JSONObject();
                    item.put("url", url);
                    item.put("title", safeStoredTitle(entry.title, url));
                    if (!entry.favicon.isEmpty()) item.put("favicon", entry.favicon);
                    array.put(item);
                }
            } catch (Exception ignored) { }
            prefs.edit().putString(key, array.toString()).apply();
        }
    }

    List<Entry> bookmarks() { return read("bookmarks"); }
    List<Entry> history() { return read("history"); }

    boolean isBookmarked(String url) {
        synchronized (STORE_LOCK) {
            for (Entry entry : bookmarks()) if (entry.url.equals(url)) return true;
            return false;
        }
    }

    void toggleBookmark(String url, String title, String favicon) {
        String safeUrl = safeStoredUrl(url);
        if (safeUrl.isEmpty()) return;
        String safeTitle = safeStoredTitle(title, safeUrl);
        synchronized (STORE_LOCK) {
            List<Entry> list = bookmarks();
            if (!list.removeIf(entry -> entry.url.equals(safeUrl))) {
                list.add(0, new Entry(safeUrl, safeTitle, safeFavicon(favicon)));
            }
            write("bookmarks", list);
        }
    }

    boolean removeBookmark(String url) {
        synchronized (STORE_LOCK) {
            List<Entry> list = bookmarks();
            boolean changed = list.removeIf(entry -> entry.url.equals(url));
            if (changed) write("bookmarks", list);
            return changed;
        }
    }

    void restoreBookmark(Entry entry, int index) {
        if (entry == null) return;
        String safeUrl = safeStoredUrl(entry.url);
        if (safeUrl.isEmpty()) return;
        synchronized (STORE_LOCK) {
            List<Entry> list = bookmarks();
            list.removeIf(existing -> existing.url.equals(safeUrl));
            list.add(Math.max(0, Math.min(index, list.size())),
                new Entry(safeUrl, safeStoredTitle(entry.title, safeUrl), safeFavicon(entry.favicon)));
            write("bookmarks", list);
        }
    }

    void moveBookmark(int from, int to) {
        synchronized (STORE_LOCK) {
            List<Entry> list = bookmarks();
            if (from < 0 || to < 0 || from >= list.size() || to >= list.size() || from == to) return;
            Entry moved = list.remove(from);
            list.add(to, moved);
            write("bookmarks", list);
        }
    }

    void updateBookmarkMetadata(String url, String title, String favicon) {
        String safeUrl = safeStoredUrl(url);
        if (safeUrl.isEmpty()) return;
        synchronized (STORE_LOCK) {
            List<Entry> list = bookmarks();
            boolean changed = false;
            String safeTitle = safeStoredTitle(title, safeUrl);
            String safeIcon = safeFavicon(favicon);
            for (int index = 0; index < list.size(); index++) {
                Entry entry = list.get(index);
                if (!entry.url.equals(safeUrl)) continue;
                String nextIcon = safeIcon.isEmpty() ? entry.favicon : safeIcon;
                if (!safeTitle.equals(entry.title) || !nextIcon.equals(entry.favicon)) {
                    list.set(index, new Entry(entry.url, safeTitle, nextIcon));
                    changed = true;
                }
                break;
            }
            if (changed) write("bookmarks", list);
        }
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

    private static String safeStoredUrl(String url) {
        if (url == null) return "";
        String value = url.trim();
        return value.length() <= MAX_STORED_URL_CHARS && MobileNavigation.isWebUrl(value) ? value : "";
    }

    private static String safeStoredTitle(String title, String fallbackUrl) {
        String fallback = compactAndLimit(fallbackUrl, MAX_TITLE_CODE_POINTS, "Stránka");
        return compactAndLimit(title, MAX_TITLE_CODE_POINTS, fallback);
    }

    private static String safeFavicon(String favicon) {
        return favicon != null && favicon.length() <= MAX_FAVICON_BASE64_CHARS ? favicon : "";
    }

    void addHistory(String url, String title) {
        String safeUrl = safeStoredUrl(url);
        if (safeUrl.isEmpty()) return;
        String safeTitle = safeStoredTitle(title, safeUrl);
        synchronized (STORE_LOCK) {
            List<Entry> list = history();
            list.removeIf(entry -> entry.url.equals(safeUrl));
            list.add(0, new Entry(safeUrl, safeTitle));
            if (list.size() > 500) list = new ArrayList<>(list.subList(0, 500));
            write("history", list);
        }
    }

    void clearHistory() {
        synchronized (STORE_LOCK) { prefs.edit().remove("history").apply(); }
    }

    List<SearchEntry> recentSearches(int limit) {
        if (limit <= 0) return Collections.emptyList();
        synchronized (STORE_LOCK) {
            List<SearchEntry> entries = readSearchesLocked();
            entries.sort(Comparator.comparingLong((SearchEntry entry) -> entry.lastUsedAt).reversed());
            if (entries.size() > limit)
                return new ArrayList<>(entries.subList(0, limit));
            return entries;
        }
    }

    void recordSearch(String query) {
        String safeQuery = safeQuery(query);
        if (safeQuery.isEmpty()) return;
        synchronized (STORE_LOCK) {
            List<SearchEntry> entries = readSearchesLocked();
            int useCount = 1;
            String identity = queryIdentity(safeQuery);
            for (int index = entries.size() - 1; index >= 0; index--) {
                SearchEntry existing = entries.get(index);
                if (!queryIdentity(existing.query).equals(identity)) continue;
                useCount = existing.useCount == Integer.MAX_VALUE
                    ? Integer.MAX_VALUE : existing.useCount + 1;
                entries.remove(index);
            }
            entries.add(0, new SearchEntry(safeQuery, System.currentTimeMillis(), useCount));
            if (entries.size() > MAX_SEARCHES)
                entries = new ArrayList<>(entries.subList(0, MAX_SEARCHES));
            writeSearchesLocked(entries);
        }
    }

    boolean removeSearch(String query) {
        String identity = queryIdentity(safeQuery(query));
        if (identity.isEmpty()) return false;
        synchronized (STORE_LOCK) {
            List<SearchEntry> entries = readSearchesLocked();
            boolean changed = entries.removeIf(entry -> queryIdentity(entry.query).equals(identity));
            if (changed) writeSearchesLocked(entries);
            return changed;
        }
    }

    void clearSearches() {
        synchronized (STORE_LOCK) { prefs.edit().remove(SEARCH_HISTORY_KEY).apply(); }
    }

    ProfileSettings profileSettings() {
        synchronized (STORE_LOCK) {
            try {
                JSONObject value = new JSONObject(prefs.getString(PROFILE_SETTINGS_KEY, "{}"));
                return new ProfileSettings(
                    value.optString("displayName", DEFAULT_PROFILE_NAME),
                    tolerantBoolean(value, "rememberSearches", true),
                    tolerantBoolean(value, "showFavoritesOnHome", true),
                    tolerantBoolean(value, "showRecentSearches", true));
            } catch (Exception ignored) {
                return defaultProfileSettings();
            }
        }
    }

    void updateProfileSettings(ProfileSettings settings) {
        if (settings == null) return;
        synchronized (STORE_LOCK) {
            JSONObject value = new JSONObject();
            try {
                value.put("displayName", safeDisplayName(settings.displayName));
                value.put("rememberSearches", settings.rememberSearches);
                value.put("showFavoritesOnHome", settings.showFavoritesOnHome);
                value.put("showRecentSearches", settings.showRecentSearches);
                prefs.edit().putString(PROFILE_SETTINGS_KEY, value.toString()).apply();
            } catch (Exception ignored) { }
        }
    }

    private List<SearchEntry> readSearchesLocked() {
        List<SearchEntry> entries = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        try {
            JSONArray array = new JSONArray(prefs.getString(SEARCH_HISTORY_KEY, "[]"));
            for (int index = 0; index < array.length() && entries.size() < MAX_SEARCHES; index++) {
                JSONObject value = array.optJSONObject(index);
                if (value == null) continue;
                String query = safeQuery(value.optString("query", ""));
                String identity = queryIdentity(query);
                if (identity.isEmpty() || !seen.add(identity)) continue;
                entries.add(new SearchEntry(query,
                    Math.max(0L, value.optLong("lastUsedAt", 0L)),
                    Math.max(1, value.optInt("useCount", 1))));
            }
        } catch (Exception ignored) { }
        return entries;
    }

    private void writeSearchesLocked(List<SearchEntry> entries) {
        JSONArray array = new JSONArray();
        try {
            int count = 0;
            for (SearchEntry entry : entries) {
                if (count >= MAX_SEARCHES) break;
                String query = safeQuery(entry.query);
                if (query.isEmpty()) continue;
                JSONObject value = new JSONObject();
                value.put("query", query);
                value.put("lastUsedAt", Math.max(0L, entry.lastUsedAt));
                value.put("useCount", Math.max(1, entry.useCount));
                array.put(value);
                count++;
            }
            prefs.edit().putString(SEARCH_HISTORY_KEY, array.toString()).apply();
        } catch (Exception ignored) { }
    }

    private static ProfileSettings defaultProfileSettings() {
        return new ProfileSettings(DEFAULT_PROFILE_NAME, true, true, true);
    }

    private static boolean tolerantBoolean(JSONObject value, String key, boolean fallback) {
        Object raw = value.opt(key);
        if (raw instanceof Boolean) return (Boolean) raw;
        if (raw instanceof String) {
            if ("true".equalsIgnoreCase((String) raw)) return true;
            if ("false".equalsIgnoreCase((String) raw)) return false;
        }
        return fallback;
    }

    private static String safeQuery(String query) {
        return compactAndLimit(query, MAX_QUERY_CODE_POINTS, "");
    }

    private static String queryIdentity(String query) {
        return query == null ? "" : query.toLowerCase(Locale.ROOT);
    }

    private static String safeDisplayName(String displayName) {
        return compactAndLimit(displayName, MAX_DISPLAY_NAME_CODE_POINTS, DEFAULT_PROFILE_NAME);
    }

    private static String compactAndLimit(String value, int maxCodePoints, String fallback) {
        if (value == null) return fallback;
        String compact = value.trim().replaceAll("\\s+", " ");
        if (compact.isEmpty()) return fallback;
        int count = compact.codePointCount(0, compact.length());
        if (count > maxCodePoints)
            compact = compact.substring(0, compact.offsetByCodePoints(0, maxCodePoints)).trim();
        return compact.isEmpty() ? fallback : compact;
    }

    String blockerMode() {
        synchronized (STORE_LOCK) { return prefs.getString("blockerMode", "strict"); }
    }
    void setBlockerMode(String mode) {
        if ("off".equals(mode) || "standard".equals(mode) || "strict".equals(mode))
            synchronized (STORE_LOCK) { prefs.edit().putString("blockerMode", mode).apply(); }
    }

    boolean isBlockerDisabledForHost(String host) {
        String safeHost = safeHost(host);
        if (safeHost.isEmpty()) return false;
        synchronized (STORE_LOCK) {
            return new HashSet<>(prefs.getStringSet("blockerExceptions", new HashSet<>())).contains(safeHost);
        }
    }

    Set<String> blockerExceptionsSnapshot() {
        synchronized (STORE_LOCK) {
            return new HashSet<>(prefs.getStringSet("blockerExceptions", new HashSet<>()));
        }
    }

    void setBlockerDisabledForHost(String host, boolean disabled) {
        String safeHost = safeHost(host);
        if (safeHost.isEmpty()) return;
        synchronized (STORE_LOCK) {
            Set<String> exceptions = new HashSet<>(prefs.getStringSet("blockerExceptions", new HashSet<>()));
            if (disabled) exceptions.add(safeHost);
            else exceptions.remove(safeHost);
            prefs.edit().putStringSet("blockerExceptions", exceptions).apply();
        }
    }

    String sitePermissionState(String origin, String kind) {
        if (!isPermissionKind(kind)) return "ask";
        String safeOrigin = safeOrigin(origin);
        if (safeOrigin.isEmpty()) return "ask";
        synchronized (STORE_LOCK) {
            try {
                JSONObject all = new JSONObject(prefs.getString("sitePermissions", "{}"));
                JSONObject site = all.optJSONObject(safeOrigin);
                String state = site == null ? "ask" : site.optString(kind, "ask");
                return "allow".equals(state) || "deny".equals(state) ? state : "ask";
            } catch (Exception ignored) {
                return "ask";
            }
        }
    }

    void setSitePermissionState(String origin, String kind, String state) {
        if (!isPermissionKind(kind)) return;
        String safeOrigin = safeOrigin(origin);
        if (safeOrigin.isEmpty()) return;
        String safeState = "allow".equals(state) || "deny".equals(state) ? state : "ask";
        synchronized (STORE_LOCK) {
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
    }

    void resetSitePermissionStates(String origin) {
        String safeOrigin = safeOrigin(origin);
        if (safeOrigin.isEmpty()) return;
        synchronized (STORE_LOCK) {
            try {
                JSONObject all = new JSONObject(prefs.getString("sitePermissions", "{}"));
                all.remove(safeOrigin);
                prefs.edit().putString("sitePermissions", all.toString()).apply();
            } catch (Exception ignored) { }
        }
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
