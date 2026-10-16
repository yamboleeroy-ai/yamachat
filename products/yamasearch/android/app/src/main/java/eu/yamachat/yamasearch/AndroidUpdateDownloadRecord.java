package eu.yamachat.yamasearch;

/**
 * Validated, process-restart-safe identity of one DownloadManager update job.
 * Storage itself remains the responsibility of BrowserActivity so this class
 * can be exercised by ordinary JVM tests.
 */
public final class AndroidUpdateDownloadRecord {
    private final long downloadId;
    private final AndroidUpdateManifest manifest;

    private AndroidUpdateDownloadRecord(long downloadId, AndroidUpdateManifest manifest) {
        this.downloadId = downloadId;
        this.manifest = manifest;
    }

    public static AndroidUpdateDownloadRecord create(long downloadId,
                                                     AndroidUpdateManifest manifest) {
        if (downloadId <= 0L || manifest == null)
            throw new IllegalArgumentException("Invalid Android update download record");
        return new AndroidUpdateDownloadRecord(downloadId, manifest);
    }

    public static AndroidUpdateDownloadRecord restore(long downloadId, String manifestJson,
                                                      long installedVersionCode) {
        if (downloadId <= 0L || installedVersionCode <= 0L)
            throw new IllegalArgumentException("Invalid Android update download record");
        AndroidUpdateManifest manifest = AndroidUpdateManifest.parse(manifestJson);
        if (!manifest.isNewerThan(installedVersionCode))
            throw new IllegalArgumentException("Android update is no longer newer");
        return new AndroidUpdateDownloadRecord(downloadId, manifest);
    }

    public long getDownloadId() { return downloadId; }
    public AndroidUpdateManifest getManifest() { return manifest; }
    public String getManifestJson() { return manifest.toJson(); }
}
