package eu.yamachat.yamasearch;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Objects;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicBoolean;

import javax.net.ssl.HttpsURLConnection;

/**
 * Fetches the public-release metadata away from the Android UI thread.
 * Lifecycle/UI policy intentionally stays in the calling Activity.
 */
public final class AndroidUpdateChecker implements AutoCloseable {
    public static final String MANIFEST_URL =
        "https://updates.yamachat.eu/yamasearch/YamaSearch-Android-update.json";

    static final int MAX_MANIFEST_BYTES = 32 * 1024;
    private static final int CONNECT_TIMEOUT_MILLIS = 5_000;
    private static final int READ_TIMEOUT_MILLIS = 7_000;

    public enum Status { UPDATE_AVAILABLE, UP_TO_DATE, ERROR }

    public static final class Result {
        private final Status status;
        private final AndroidUpdateManifest manifest;
        private final String errorMessage;

        private Result(Status status, AndroidUpdateManifest manifest, String errorMessage) {
            this.status = status;
            this.manifest = manifest;
            this.errorMessage = errorMessage;
        }

        public Status getStatus() { return status; }
        public AndroidUpdateManifest getManifest() { return manifest; }
        public String getErrorMessage() { return errorMessage; }
    }

    public interface Callback {
        /** Runs on the callbackExecutor supplied to {@link #check}. */
        void onComplete(Result result);
    }

    private final ExecutorService networkExecutor;
    private final AtomicBoolean inFlight = new AtomicBoolean();
    private final AtomicBoolean closed = new AtomicBoolean();

    public AndroidUpdateChecker() {
        networkExecutor = Executors.newSingleThreadExecutor(new ThreadFactory() {
            @Override public Thread newThread(Runnable runnable) {
                Thread thread = new Thread(runnable, "YamaSearch-update-check");
                thread.setDaemon(true);
                return thread;
            }
        });
    }

    /**
     * Starts one check. Returns false when a check is already running or the
     * checker was closed. No network work is ever performed by the caller.
     */
    public boolean check(long installedVersionCode, Executor callbackExecutor, Callback callback) {
        if (installedVersionCode <= 0) throw new IllegalArgumentException("installedVersionCode must be positive");
        Objects.requireNonNull(callbackExecutor, "callbackExecutor");
        Objects.requireNonNull(callback, "callback");
        if (closed.get() || !inFlight.compareAndSet(false, true)) return false;

        try {
            networkExecutor.execute(() -> {
                Result result;
                try {
                    AndroidUpdateManifest manifest = fetchManifest();
                    result = manifest.isNewerThan(installedVersionCode)
                        ? new Result(Status.UPDATE_AVAILABLE, manifest, null)
                        : new Result(Status.UP_TO_DATE, manifest, null);
                } catch (Exception error) {
                    // Keep error details non-sensitive and suitable for an optional
                    // manual-check message. Automatic checks can ignore ERROR.
                    result = new Result(Status.ERROR, null, safeErrorMessage(error));
                }
                deliver(callbackExecutor, callback, result);
            });
            return true;
        } catch (RejectedExecutionException error) {
            inFlight.set(false);
            return false;
        }
    }

    private AndroidUpdateManifest fetchManifest() throws IOException {
        URL endpoint = new URL(MANIFEST_URL);
        if (!"https".equals(endpoint.getProtocol())
            || !"updates.yamachat.eu".equalsIgnoreCase(endpoint.getHost())
            || endpoint.getPort() != -1
            || endpoint.getUserInfo() != null
            || endpoint.getQuery() != null
            || endpoint.getRef() != null
            || !"/yamasearch/YamaSearch-Android-update.json".equals(endpoint.getPath())) {
            throw new IOException("Unsafe update endpoint");
        }

        HttpsURLConnection connection = (HttpsURLConnection) endpoint.openConnection();
        try {
            connection.setConnectTimeout(CONNECT_TIMEOUT_MILLIS);
            connection.setReadTimeout(READ_TIMEOUT_MILLIS);
            connection.setInstanceFollowRedirects(false);
            connection.setUseCaches(false);
            connection.setRequestMethod("GET");
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Accept-Encoding", "identity");
            connection.setRequestProperty("User-Agent", "YamaSearch-Android-Updater/1");

            int responseCode = connection.getResponseCode();
            if (responseCode != HttpsURLConnection.HTTP_OK)
                throw new IOException("Update server returned HTTP " + responseCode);

            String contentType = connection.getContentType();
            if (contentType == null
                || !("application/json".equalsIgnoreCase(contentType.trim())
                    || contentType.toLowerCase(java.util.Locale.ROOT).startsWith("application/json;")))
                throw new IOException("Unexpected manifest content type");

            String contentEncoding = connection.getContentEncoding();
            if (contentEncoding != null && !contentEncoding.isEmpty()
                && !"identity".equalsIgnoreCase(contentEncoding))
                throw new IOException("Unexpected manifest encoding");

            int contentLength = connection.getContentLength();
            try (InputStream input = connection.getInputStream()) {
                return AndroidUpdateManifest.parse(readUtf8Manifest(input, contentLength));
            }
        } finally {
            connection.disconnect();
        }
    }

    static String readUtf8Manifest(InputStream input, int advertisedLength) throws IOException {
        Objects.requireNonNull(input, "input");
        if (advertisedLength > MAX_MANIFEST_BYTES)
            throw new IOException("Manifest is too large");

        ByteArrayOutputStream output = new ByteArrayOutputStream(
            advertisedLength > 0 ? advertisedLength : 4_096);
        byte[] buffer = new byte[4_096];
        int total = 0;
        int count;
        while ((count = input.read(buffer)) != -1) {
            total += count;
            if (total > MAX_MANIFEST_BYTES) throw new IOException("Manifest is too large");
            output.write(buffer, 0, count);
        }
        if (total == 0) throw new IOException("Manifest is empty");

        try {
            ByteBuffer bytes = ByteBuffer.wrap(output.toByteArray());
            CharBuffer text = StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(bytes);
            return text.toString();
        } catch (CharacterCodingException error) {
            throw new IOException("Manifest is not valid UTF-8", error);
        }
    }

    private void deliver(Executor executor, Callback callback, Result result) {
        if (closed.get()) {
            inFlight.set(false);
            return;
        }
        try {
            executor.execute(() -> {
                try {
                    if (!closed.get()) callback.onComplete(result);
                } finally {
                    // Keep the request logically in-flight through UI delivery so
                    // a manual check cannot steal another request's result flags.
                    inFlight.set(false);
                }
            });
        } catch (RejectedExecutionException ignored) {
            // The Activity may already have destroyed its UI executor.
            inFlight.set(false);
        }
    }

    private static String safeErrorMessage(Exception error) {
        String message = error.getMessage();
        return message == null || message.trim().isEmpty()
            ? "Kontrolu aktualizací se nepodařilo dokončit."
            : message;
    }

    @Override public void close() {
        if (closed.compareAndSet(false, true)) networkExecutor.shutdownNow();
    }
}
