package eu.yamachat.yamasearch;

import android.app.Activity;
import android.app.Dialog;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.Window;
import android.view.WindowManager;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

/** Local browser-profile settings in YamaSearch's own visual language. */
final class MobileProfileDialog {
    private static final int INK = Color.rgb(12, 18, 31);
    private static final int PANEL = Color.rgb(14, 29, 45);
    private static final int CYAN = Color.rgb(64, 212, 245);
    private static final int MUTED = Color.rgb(169, 185, 204);

    private MobileProfileDialog() { }

    static void show(Activity activity, BrowserStore store, boolean privateSession, Runnable changed) {
        Dialog dialog = new Dialog(activity);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);

        ScrollView scroll = new ScrollView(activity);
        scroll.setFillViewport(false);
        scroll.setBackgroundColor(Color.TRANSPARENT);
        LinearLayout panel = new LinearLayout(activity);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(activity, 20), dp(activity, 18), dp(activity, 20), dp(activity, 18));
        panel.setBackground(shape(activity, PANEL, Color.rgb(48, 105, 139), 20));
        scroll.addView(panel, new ScrollView.LayoutParams(-1, -2));

        TextView title = text(activity, privateSession ? "Soukromý profil" : "Můj profil YamaSearch", CYAN, 21);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        panel.addView(title, new LinearLayout.LayoutParams(-1, -2));
        TextView intro = text(activity,
            privateSession
                ? "Toto okno je oddělené od běžného profilu. Hledání, oblíbené a historie se sem nenačítají ani neukládají."
                : "Nastavení patří pouze tomuto prohlížeči v zařízení. Nejde o online účet a nic se neodesílá na server.",
            MUTED, 13);
        intro.setPadding(0, dp(activity, 7), 0, dp(activity, 15));
        panel.addView(intro, new LinearLayout.LayoutParams(-1, -2));

        if (privateSession) {
            TextView close = button(activity, "Rozumím", CYAN, INK);
            close.setOnClickListener(view -> dialog.dismiss());
            panel.addView(close, new LinearLayout.LayoutParams(-1, dp(activity, 46)));
        } else {
            BrowserStore.ProfileSettings current = store.profileSettings();
            EditText name = new EditText(activity);
            name.setSingleLine(true);
            name.setText(current.displayName);
            name.setSelectAllOnFocus(true);
            name.setTextColor(Color.WHITE);
            name.setHintTextColor(MUTED);
            name.setHint("Název profilu");
            name.setTextSize(15);
            name.setPadding(dp(activity, 13), 0, dp(activity, 13), 0);
            name.setBackground(shape(activity, INK, Color.rgb(48, 105, 139), 12));
            panel.addView(name, new LinearLayout.LayoutParams(-1, dp(activity, 47)));

            TextView stats = text(activity,
                store.bookmarks().size() + " oblíbených · " + store.history().size() + " položek historie · "
                    + store.recentSearches(100).size() + " uložených hledání",
                MUTED, 12);
            stats.setPadding(dp(activity, 2), dp(activity, 10), dp(activity, 2), dp(activity, 12));
            panel.addView(stats, new LinearLayout.LayoutParams(-1, -2));

            boolean[] remember = {current.rememberSearches};
            boolean[] favorites = {current.showFavoritesOnHome};
            boolean[] searches = {current.showRecentSearches};
            panel.addView(toggle(activity, "Pamatovat hledání", "Ukládá pouze zadané dotazy, ne obsah stránek.", remember), spaced(activity));
            panel.addView(toggle(activity, "Oblíbené na domovské stránce", "Rychlý přístup k uloženým webům.", favorites), spaced(activity));
            panel.addView(toggle(activity, "Poslední hledání na domovské stránce", "Návrhy zůstávají jen v tomto zařízení.", searches), spaced(activity));

            TextView clear = button(activity, "Vymazat uložená hledání", Color.rgb(44, 25, 41), Color.rgb(244, 151, 165));
            clear.setBackground(shape(activity, Color.rgb(44, 25, 41), Color.rgb(137, 66, 84), 12));
            clear.setOnClickListener(view -> {
                store.clearSearches();
                clear.setText("Uložená hledání byla vymazána");
                clear.setEnabled(false);
                clear.setAlpha(.72f);
                changed.run();
                Toast.makeText(activity, "Historie hledání byla vymazána.", Toast.LENGTH_SHORT).show();
            });
            panel.addView(clear, spaced(activity));

            LinearLayout actions = new LinearLayout(activity);
            actions.setGravity(Gravity.CENTER_VERTICAL);
            TextView cancel = button(activity, "Zrušit", Color.TRANSPARENT, MUTED);
            cancel.setBackground(shape(activity, Color.TRANSPARENT, Color.rgb(64, 83, 103), 12));
            cancel.setOnClickListener(view -> dialog.dismiss());
            TextView save = button(activity, "Uložit", CYAN, INK);
            save.setOnClickListener(view -> {
                store.updateProfileSettings(new BrowserStore.ProfileSettings(
                    name.getText().toString(), remember[0], favorites[0], searches[0]));
                changed.run();
                dialog.dismiss();
            });
            LinearLayout.LayoutParams left = new LinearLayout.LayoutParams(0, dp(activity, 46), 1f);
            left.rightMargin = dp(activity, 8);
            actions.addView(cancel, left);
            actions.addView(save, new LinearLayout.LayoutParams(0, dp(activity, 46), 1f));
            panel.addView(actions, new LinearLayout.LayoutParams(-1, -2));
        }

        dialog.setContentView(scroll);
        dialog.setOnShowListener(ignored -> {
            Window window = dialog.getWindow();
            if (window == null) return;
            window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            WindowManager.LayoutParams attributes = window.getAttributes();
            attributes.width = activity.getResources().getDisplayMetrics().widthPixels - dp(activity, 28);
            attributes.height = WindowManager.LayoutParams.WRAP_CONTENT;
            attributes.gravity = Gravity.CENTER;
            window.setAttributes(attributes);
            window.setDimAmount(.7f);
            window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
        });
        dialog.show();
    }

    private static TextView toggle(Activity activity, String label, String detail, boolean[] state) {
        TextView view = text(activity, "", Color.WHITE, 14);
        view.setGravity(Gravity.CENTER_VERTICAL);
        view.setPadding(dp(activity, 13), dp(activity, 9), dp(activity, 13), dp(activity, 9));
        view.setClickable(true);
        view.setFocusable(true);
        view.setOnClickListener(clicked -> {
            state[0] = !state[0];
            refreshToggle(activity, view, label, detail, state[0]);
        });
        refreshToggle(activity, view, label, detail, state[0]);
        return view;
    }

    private static void refreshToggle(Activity activity, TextView view, String label, String detail, boolean enabled) {
        view.setText((enabled ? "●  " : "○  ") + label + "\n     " + detail);
        view.setTextColor(enabled ? Color.WHITE : MUTED);
        view.setBackground(shape(activity,
            enabled ? Color.rgb(13, 48, 67) : Color.rgb(18, 32, 48),
            enabled ? Color.rgb(53, 157, 193) : Color.rgb(52, 70, 89), 13));
        view.setContentDescription(label + (enabled ? ", zapnuto" : ", vypnuto"));
    }

    private static TextView button(Activity activity, String label, int fill, int textColor) {
        TextView view = text(activity, label, textColor, 14);
        view.setGravity(Gravity.CENTER);
        view.setTypeface(null, android.graphics.Typeface.BOLD);
        view.setBackground(shape(activity, fill, fill == Color.TRANSPARENT ? MUTED : fill, 12));
        view.setClickable(true);
        view.setFocusable(true);
        return view;
    }

    private static LinearLayout.LayoutParams spaced(Activity activity) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.bottomMargin = dp(activity, 9);
        return params;
    }

    private static TextView text(Activity activity, String value, int color, int size) {
        TextView view = new TextView(activity);
        view.setText(value);
        view.setTextColor(color);
        view.setTextSize(size);
        return view;
    }

    private static GradientDrawable shape(Activity activity, int fill, int border, int radius) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(fill);
        drawable.setCornerRadius(dp(activity, radius));
        drawable.setStroke(dp(activity, 1), border);
        return drawable;
    }

    private static int dp(Activity activity, int value) {
        return Math.round(value * activity.getResources().getDisplayMetrics().density);
    }
}
