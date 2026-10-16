package eu.yamachat.yamasearch;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.List;
import java.util.Locale;

/** Native, event-driven address suggestions; it never contacts a suggestion service. */
final class MobileSearchPanel {
    interface Listener {
        void navigate(String input);
        void storedSearchesChanged();
    }

    private static final int PANEL = Color.rgb(14, 29, 45);
    private static final int CARD = Color.rgb(18, 43, 64);
    private static final int CYAN = Color.rgb(64, 212, 245);
    private static final int MUTED = Color.rgb(169, 185, 204);
    private static final int DANGER = Color.rgb(232, 103, 117);

    private final Activity activity;
    private final BrowserStore store;
    private final boolean privateSession;
    private final Listener listener;
    private final ScrollView scroll;
    private final LinearLayout content;

    MobileSearchPanel(Activity activity, BrowserStore store, boolean privateSession, Listener listener) {
        this.activity = activity;
        this.store = store;
        this.privateSession = privateSession;
        this.listener = listener;

        scroll = new ScrollView(activity);
        scroll.setVisibility(View.GONE);
        scroll.setFillViewport(false);
        scroll.setClipToPadding(false);
        scroll.setPadding(dp(10), dp(10), dp(10), dp(12));
        scroll.setBackground(shape(PANEL, Color.rgb(42, 105, 141), 18));
        scroll.setElevation(dp(14));

        content = new LinearLayout(activity);
        content.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(content, new ScrollView.LayoutParams(-1, -2));
    }

    View view() { return scroll; }

    boolean isVisible() { return scroll.getVisibility() == View.VISIBLE; }

    void show(String rawQuery) {
        render(rawQuery == null ? "" : rawQuery.trim());
        if (isVisible()) return;
        scroll.animate().cancel();
        scroll.setAlpha(0f);
        scroll.setTranslationY(-dp(12));
        scroll.setVisibility(View.VISIBLE);
        scroll.animate().alpha(1f).translationY(0f).setDuration(140L).start();
    }

    void hide() {
        scroll.animate().cancel();
        scroll.setVisibility(View.GONE);
        scroll.setAlpha(1f);
        scroll.setTranslationY(0f);
    }

    private void render(String query) {
        content.removeAllViews();
        addHeading(query.isEmpty() ? "Rychlý přístup" : "Hledání");
        if (!query.isEmpty()) addResolvedInput(query);

        if (privateSession) {
            addNotice("Soukromé hledání", "Dotazy ani obsah běžného profilu se v tomto okně neukládají ani nezobrazují.");
            return;
        }

        int searchRows = 0;
        List<BrowserStore.SearchEntry> searches = store.recentSearches(30);
        for (BrowserStore.SearchEntry entry : searches) {
            if (searchRows >= 5 || !matches(entry.query, query)) continue;
            addStoredSearch(entry.query);
            searchRows++;
        }

        int favoriteRows = 0;
        for (BrowserStore.Entry entry : store.bookmarks()) {
            if (favoriteRows >= 3 || !matches(entry.title + " " + entry.url, query)) continue;
            addRow("★", title(entry), host(entry.url), () -> listener.navigate(entry.url), null);
            favoriteRows++;
        }

        if (query.isEmpty() && searchRows == 0 && favoriteRows == 0)
            addNotice("Začněte hledat", "Po prvním hledání nebo uložení oblíbené stránky se zde objeví rychlé volby.");
    }

    private void addResolvedInput(String query) {
        MobileNavigation.Destination destination = MobileNavigation.resolve(query);
        String label = destination.search ? "Hledat „" + display(query, 80) + "“" : "Otevřít " + display(query, 80);
        String detail = destination.search ? "Vyhledávání Google" : display(destination.url, 110);
        addRow(destination.search ? "⌕" : "↗", label, detail, () -> listener.navigate(query), null);
    }

    private void addStoredSearch(String query) {
        TextView remove = control("×", "Odstranit hledání", DANGER);
        remove.setOnClickListener(view -> {
            if (store.removeSearch(query)) listener.storedSearchesChanged();
            render("");
        });
        addRow("⌕", display(query, 100), "Poslední hledání", () -> listener.navigate(query), remove);
    }

    private void addHeading(String label) {
        TextView heading = new TextView(activity);
        heading.setText(label);
        heading.setTextColor(CYAN);
        heading.setTextSize(13);
        heading.setTypeface(null, android.graphics.Typeface.BOLD);
        heading.setLetterSpacing(.07f);
        heading.setPadding(dp(6), dp(2), dp(6), dp(8));
        content.addView(heading, new LinearLayout.LayoutParams(-1, -2));
    }

    private void addNotice(String title, String detail) {
        LinearLayout card = new LinearLayout(activity);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(13), dp(11), dp(13), dp(11));
        card.setBackground(shape(Color.rgb(17, 38, 58), Color.rgb(43, 85, 111), 13));
        TextView headline = text(title, Color.WHITE, 14);
        headline.setTypeface(null, android.graphics.Typeface.BOLD);
        TextView copy = text(detail, MUTED, 12);
        copy.setPadding(0, dp(4), 0, 0);
        card.addView(headline, new LinearLayout.LayoutParams(-1, -2));
        card.addView(copy, new LinearLayout.LayoutParams(-1, -2));
        content.addView(card, spacedParams());
    }

    private void addRow(String icon, String primary, String secondary, Runnable action, View trailing) {
        LinearLayout row = new LinearLayout(activity);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(10), dp(8), dp(8), dp(8));
        row.setBackground(shape(CARD, Color.rgb(41, 91, 120), 13));
        row.setClickable(true);
        row.setFocusable(true);
        row.setOnClickListener(view -> action.run());

        TextView glyph = text(icon, CYAN, 18);
        glyph.setGravity(Gravity.CENTER);
        glyph.setBackground(shape(Color.rgb(13, 32, 49), Color.rgb(42, 112, 146), 10));
        row.addView(glyph, new LinearLayout.LayoutParams(dp(36), dp(36)));

        LinearLayout labels = new LinearLayout(activity);
        labels.setOrientation(LinearLayout.VERTICAL);
        labels.setGravity(Gravity.CENTER_VERTICAL);
        TextView headline = text(primary, Color.WHITE, 14);
        headline.setSingleLine(true);
        headline.setEllipsize(android.text.TextUtils.TruncateAt.END);
        TextView subline = text(secondary, MUTED, 11);
        subline.setSingleLine(true);
        subline.setEllipsize(android.text.TextUtils.TruncateAt.END);
        labels.addView(headline, new LinearLayout.LayoutParams(-1, -2));
        labels.addView(subline, new LinearLayout.LayoutParams(-1, -2));
        LinearLayout.LayoutParams labelsParams = new LinearLayout.LayoutParams(0, -2, 1f);
        labelsParams.leftMargin = dp(10);
        labelsParams.rightMargin = dp(7);
        row.addView(labels, labelsParams);
        if (trailing != null) row.addView(trailing, new LinearLayout.LayoutParams(dp(38), dp(38)));
        content.addView(row, spacedParams());
    }

    private LinearLayout.LayoutParams spacedParams() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.bottomMargin = dp(8);
        return params;
    }

    private TextView control(String label, String description, int color) {
        TextView view = text(label, color, 20);
        view.setGravity(Gravity.CENTER);
        view.setContentDescription(description);
        view.setTooltipText(description);
        view.setBackground(shape(Color.TRANSPARENT, color, 10));
        return view;
    }

    private TextView text(String value, int color, int size) {
        TextView view = new TextView(activity);
        view.setText(value);
        view.setTextColor(color);
        view.setTextSize(size);
        return view;
    }

    private GradientDrawable shape(int fill, int border, int radius) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(fill);
        drawable.setCornerRadius(dp(radius));
        drawable.setStroke(dp(1), border);
        return drawable;
    }

    private int dp(int value) {
        return Math.round(value * activity.getResources().getDisplayMetrics().density);
    }

    private static boolean matches(String value, String query) {
        if (query == null || query.isEmpty()) return true;
        return value != null && value.toLowerCase(Locale.ROOT).contains(query.toLowerCase(Locale.ROOT));
    }

    private static String title(BrowserStore.Entry entry) {
        String title = entry.title == null ? "" : entry.title.trim().replace('\n', ' ').replace('\r', ' ');
        return title.isEmpty() || title.equals(entry.url) ? host(entry.url) : display(title, 90);
    }

    private static String host(String url) {
        try {
            String host = Uri.parse(url).getHost();
            if (host != null && !host.isEmpty()) return host.startsWith("www.") ? host.substring(4) : host;
        } catch (Exception ignored) { }
        return display(url, 100);
    }

    private static String display(String value, int codePoints) {
        if (value == null) return "";
        String compact = value.trim().replaceAll("\\s+", " ");
        if (compact.codePointCount(0, compact.length()) > codePoints)
            compact = compact.substring(0, compact.offsetByCodePoints(0, codePoints)).trim();
        return compact;
    }
}
