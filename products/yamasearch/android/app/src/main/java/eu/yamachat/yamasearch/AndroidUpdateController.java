package eu.yamachat.yamasearch;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.widget.Toast;

/**
 * Activity lifecycle and UI policy for the Android updater.
 *
 * <p>Checks are event driven: once when the normal browser returns to the
 * foreground and then only after a successful-check interval has elapsed.
 * Network failures use a shorter retry guard, while manual checks always run
 * immediately (or attach their UI to the check already in progress).</p>
 */
final class AndroidUpdateController implements AutoCloseable {
    interface DownloadStarter {
        void start(AndroidUpdateManifest update);
    }

    private static final String PREFERENCES = "yamasearch_android_updates";
    private static final String LAST_ATTEMPT_AT = "lastAttemptAt";
    private static final String LAST_SUCCESS_AT = "lastSuccessAt";
    private static final String LAST_PROMPTED_CODE = "lastPromptedCode";
    private static final String LAST_PROMPTED_AT = "lastPromptedAt";

    static final long SUCCESS_INTERVAL_MILLIS = 6L * 60L * 60L * 1_000L;
    static final long FAILURE_RETRY_MILLIS = 15L * 60L * 1_000L;
    static final long PROMPT_REPEAT_MILLIS = 24L * 60L * 60L * 1_000L;

    private final Activity activity;
    private final long installedVersionCode;
    private final DownloadStarter downloadStarter;
    private final SharedPreferences preferences;
    private final AndroidUpdateChecker checker = new AndroidUpdateChecker();

    private AlertDialog updateDialog;
    private AlertDialog messageDialog;
    private AndroidUpdateChecker.Result pendingResult;
    private boolean pendingReport;
    private boolean reportNextResult;
    private boolean resumed;
    private boolean closed;

    AndroidUpdateController(Activity activity, long installedVersionCode,
                            DownloadStarter downloadStarter) {
        if (installedVersionCode <= 0) throw new IllegalArgumentException("installedVersionCode must be positive");
        this.activity = activity;
        this.installedVersionCode = installedVersionCode;
        this.downloadStarter = downloadStarter;
        this.preferences = activity.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    /** Called from Activity.onResume; it never blocks the UI thread. */
    void onResume() {
        if (closed) return;
        resumed = true;
        if (pendingResult != null) {
            AndroidUpdateChecker.Result result = pendingResult;
            boolean report = pendingReport;
            pendingResult = null;
            pendingReport = false;
            handleVisibleResult(result, report);
        }
        if (closed || !shouldCheckAutomatically(System.currentTimeMillis())) return;
        startCheck(false);
    }

    /** Prevents a completed network request from opening a window over a background Activity. */
    void onPause() {
        resumed = false;
    }

    /** User-requested checks always report success, failure, or an available update. */
    void checkManually() {
        if (closed) return;
        reportNextResult = true;
        if (startCheck(true)) {
            Toast.makeText(activity, "Kontroluji aktualizace…", Toast.LENGTH_SHORT).show();
        } else {
            Toast.makeText(activity, "Kontrola aktualizací už probíhá…", Toast.LENGTH_SHORT).show();
        }
    }

    private boolean shouldCheckAutomatically(long now) {
        long lastSuccess = preferences.getLong(LAST_SUCCESS_AT, 0L);
        if (isRecent(now, lastSuccess, SUCCESS_INTERVAL_MILLIS)) return false;
        long lastAttempt = preferences.getLong(LAST_ATTEMPT_AT, 0L);
        return !isRecent(now, lastAttempt, FAILURE_RETRY_MILLIS);
    }

    private static boolean isRecent(long now, long value, long interval) {
        // A wall-clock correction must not suppress checks indefinitely.
        return value > 0L && now >= value && now - value < interval;
    }

    private boolean startCheck(boolean manual) {
        if (closed) return false;
        if (manual) reportNextResult = true;
        boolean started = checker.check(installedVersionCode, activity.getMainExecutor(), this::handleResult);
        if (started) preferences.edit().putLong(LAST_ATTEMPT_AT, System.currentTimeMillis()).apply();
        return started;
    }

    private void handleResult(AndroidUpdateChecker.Result result) {
        if (closed || activity.isFinishing() || activity.isDestroyed()) return;
        boolean report = reportNextResult;
        reportNextResult = false;
        if (!resumed) {
            pendingResult = result;
            pendingReport = pendingReport || report;
            return;
        }
        handleVisibleResult(result, report);
    }

    private void handleVisibleResult(AndroidUpdateChecker.Result result, boolean report) {
        if (closed || activity.isFinishing() || activity.isDestroyed()) return;
        if (result.getStatus() == AndroidUpdateChecker.Status.ERROR) {
            if (report) showMessage("Kontrola aktualizací",
                "Aktualizace se teď nepodařilo ověřit. Zkontrolujte připojení a zkuste to znovu.");
            return;
        }

        long now = System.currentTimeMillis();
        preferences.edit().putLong(LAST_SUCCESS_AT, now).apply();
        if (result.getStatus() == AndroidUpdateChecker.Status.UP_TO_DATE) {
            if (report) showMessage("YamaSearch je aktuální",
                "Používáte nejnovější dostupnou verzi YamaSearch pro Android.");
            return;
        }

        AndroidUpdateManifest update = result.getManifest();
        if (update == null) return;
        if (!report && wasPromptedRecently(update.getVersionCode(), now)) return;
        showUpdate(update, now);
    }

    private boolean wasPromptedRecently(long versionCode, long now) {
        return preferences.getLong(LAST_PROMPTED_CODE, 0L) == versionCode
            && isRecent(now, preferences.getLong(LAST_PROMPTED_AT, 0L), PROMPT_REPEAT_MILLIS);
    }

    private void showUpdate(AndroidUpdateManifest update, long now) {
        if (updateDialog != null && updateDialog.isShowing()) return;
        preferences.edit()
            .putLong(LAST_PROMPTED_CODE, update.getVersionCode())
            .putLong(LAST_PROMPTED_AT, now)
            .apply();

        String notes = update.getNotes().trim();
        String message = "Je dostupná verze " + update.getVersion() + "."
            + (notes.isEmpty() ? "" : "\n\n" + notes)
            + "\n\nPo stažení YamaSearch ověří velikost a SHA-256 souboru a oznámí, že je připravený k instalaci. "
            + "Vaše karty, historie a nastavení zůstanou zachované.";
        AlertDialog dialog = new AlertDialog.Builder(activity)
            .setTitle("Aktualizace YamaSearch")
            .setMessage(message)
            .setNegativeButton("Později", null)
            .setPositiveButton("Stáhnout", (ignored, which) -> downloadStarter.start(update))
            .create();
        updateDialog = dialog;
        dialog.setOnShowListener(ignored -> {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setTextColor(Color.rgb(64, 212, 245));
            dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setTextColor(Color.rgb(169, 185, 204));
        });
        dialog.setOnDismissListener(ignored -> {
            if (updateDialog == dialog) updateDialog = null;
        });
        dialog.show();
    }

    private void showMessage(String title, String message) {
        if (messageDialog != null && messageDialog.isShowing()) return;
        AlertDialog dialog = new AlertDialog.Builder(activity)
            .setTitle(title)
            .setMessage(message)
            .setPositiveButton("OK", null)
            .create();
        messageDialog = dialog;
        dialog.setOnShowListener(ignored ->
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setTextColor(Color.rgb(64, 212, 245)));
        dialog.setOnDismissListener(ignored -> {
            if (messageDialog == dialog) messageDialog = null;
        });
        dialog.show();
    }

    @Override public void close() {
        if (closed) return;
        closed = true;
        resumed = false;
        pendingResult = null;
        pendingReport = false;
        checker.close();
        if (updateDialog != null) {
            updateDialog.dismiss();
            updateDialog = null;
        }
        if (messageDialog != null) {
            messageDialog.dismiss();
            messageDialog = null;
        }
    }
}
