package eu.yamachat.yamasearch;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

final class BrowserStore {
    static final class Entry {
        final String url;
        final String title;
        Entry(String url, String title) { this.url = url; this.title = title; }
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
                    list.add(new Entry(url, object.optString("title", url)));
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

    void toggleBookmark(String url, String title) {
        List<Entry> list = bookmarks();
        if (!list.removeIf(entry -> entry.url.equals(url))) {
            list.add(0, new Entry(url, title));
        }
        write("bookmarks", list);
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

    String blockerMode() { return prefs.getString("blockerMode", "standard"); }
    void setBlockerMode(String mode) {
        if ("off".equals(mode) || "standard".equals(mode) || "strict".equals(mode))
            prefs.edit().putString("blockerMode", mode).apply();
    }
}
