package eu.yamachat.yamasearch;

/** JVM coverage for state restored after Activity or process destruction. */
public final class AndroidUpdateDownloadRecordTest {
    public static void main(String[] args) {
        String json = AndroidUpdateManifestTest.validManifest();
        AndroidUpdateDownloadRecord record = AndroidUpdateDownloadRecord.restore(42L, json, 10002L);
        assertEquals(42L, record.getDownloadId());
        assertEquals("0.1.3", record.getManifest().getVersion());
        assertEquals(10003L, record.getManifest().getVersionCode());

        AndroidUpdateDownloadRecord restored = AndroidUpdateDownloadRecord.restore(
            record.getDownloadId(), record.getManifestJson(), 10002L);
        assertEquals(record.getDownloadId(), restored.getDownloadId());
        assertEquals(record.getManifest().getVersion(), restored.getManifest().getVersion());
        assertEquals(record.getManifest().getNotes(), restored.getManifest().getNotes());
        assertEquals(record.getManifest().getSha256(), restored.getManifest().getSha256());

        reject(-1L, json, 10002L);
        reject(0L, json, 10002L);
        reject(42L, null, 10002L);
        reject(42L, "{broken", 10002L);
        reject(42L, json, 10003L);
        reject(42L, json, 10004L);
        reject(42L, json, 0L);

        System.out.println("PASS: Android update download records restore only safe pending updates.");
    }

    private static void reject(long id, String json, long installedVersionCode) {
        try {
            AndroidUpdateDownloadRecord.restore(id, json, installedVersionCode);
            throw new AssertionError("Expected Android update download record rejection");
        } catch (IllegalArgumentException expected) {
            // Expected.
        }
    }

    private static void assertEquals(Object expected, Object actual) {
        if (!expected.equals(actual))
            throw new AssertionError("Expected " + expected + " but got " + actual);
    }
}
