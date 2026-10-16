package eu.yamachat.yamasearch;

/** JVM regression coverage for the public Android update trust boundary. */
public final class AndroidUpdateManifestTest {
    public static void main(String[] args) {
        String valid = validManifest();
        AndroidUpdateManifest manifest = AndroidUpdateManifest.parse(valid);
        assertEquals("0.1.3", manifest.getVersion());
        assertEquals(10003L, manifest.getVersionCode());
        assertEquals("beta", manifest.getChannel());
        assertEquals("https://updates.yamachat.eu/yamasearch/YamaSearch-Android-0.1.3.apk",
            manifest.getApkUrl());
        assertEquals("ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789",
            manifest.getSha256());
        if (!manifest.isNewerThan(10002) || manifest.isNewerThan(10003)
            || manifest.isNewerThan(10004))
            throw new AssertionError("versionCode comparison is incorrect");

        AndroidUpdateManifest restored = AndroidUpdateManifest.parse(manifest.toJson());
        assertEquals(manifest.getVersion(), restored.getVersion());
        assertEquals(manifest.getVersionCode(), restored.getVersionCode());
        assertEquals(manifest.getChannel(), restored.getChannel());
        assertEquals(manifest.getNotes(), restored.getNotes());
        assertEquals(manifest.getApkUrl(), restored.getApkUrl());
        assertEquals(manifest.getSha256(), restored.getSha256());
        assertEquals(manifest.getSize(), restored.getSize());
        assertEquals(manifest.getPublishedAtUtc(), restored.getPublishedAtUtc());

        reject(replace(valid, "\"schemaVersion\":1", "\"schemaVersion\":2"));
        reject(replace(valid, "YamaSearch Android", "Other product"));
        reject(replace(valid, "eu.yamachat.yamasearch.mobile", "eu.attacker.fake"));
        reject(replace(valid, "\"versionCode\":10003", "\"versionCode\":10003.0"));
        reject(replace(valid, "\"channel\":\"beta\"", "\"channel\":\"nightly\""));
        reject(replace(valid, "https://updates.yamachat.eu", "http://updates.yamachat.eu"));
        reject(replace(valid, "updates.yamachat.eu", "updates.yamachat.eu.attacker.test"));
        reject(replace(valid, "YamaSearch-Android-0.1.3.apk", "YamaSearch-Android-latest.apk"));
        reject(replace(valid, ".apk\"", ".apk?source=app\""));
        reject(replace(valid, "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789", "bad"));
        reject(replace(valid, "\"size\":7990210", "\"size\":0"));
        reject(replace(valid, "2026-10-16T12:34:56Z", "not-a-date"));
        reject(replace(valid, "2026-10-16T12:34:56Z", "2026-10-16T14:34:56+02:00"));
        reject(valid.substring(0, valid.length() - 1)
            + ",\"packageId\":\"eu.yamachat.yamasearch.mobile\"}");

        AndroidUpdateManifest withEmoji = AndroidUpdateManifest.parse(
            replace(valid, "Bezpečné automatické upozornění na aktualizaci.",
                "Bezpečné upozornění 🚀"));
        assertEquals("Bezpečné upozornění 🚀", withEmoji.getNotes());

        String escapedNotes = "Řádek 1\\nŘádek 2: \\\"test\\\" \\\\ cesta \\t 🚀";
        AndroidUpdateManifest withEscapes = AndroidUpdateManifest.parse(
            replace(valid, "Bezpečné automatické upozornění na aktualizaci.", escapedNotes));
        AndroidUpdateManifest restoredEscapes = AndroidUpdateManifest.parse(withEscapes.toJson());
        assertEquals("Řádek 1\nŘádek 2: \"test\" \\ cesta \t 🚀", withEscapes.getNotes());
        assertEquals(withEscapes.getNotes(), restoredEscapes.getNotes());
        assertEquals(withEscapes.toJson(), restoredEscapes.toJson());
        for (int index = 0; index < withEscapes.toJson().length(); index++) {
            if (withEscapes.toJson().charAt(index) < 0x20)
                throw new AssertionError("Serialized JSON contains a raw control character");
        }

        System.out.println("PASS: Android update manifests are strictly authenticated by metadata.");
    }

    static String validManifest() {
        return "{"
            + "\"schemaVersion\":1,"
            + "\"product\":\"YamaSearch Android\","
            + "\"packageId\":\"eu.yamachat.yamasearch.mobile\","
            + "\"version\":\"0.1.3\","
            + "\"versionCode\":10003,"
            + "\"channel\":\"beta\","
            + "\"notes\":\"Bezpečné automatické upozornění na aktualizaci.\","
            + "\"apkUrl\":\"https://updates.yamachat.eu/yamasearch/YamaSearch-Android-0.1.3.apk\","
            + "\"sha256\":\"abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789\","
            + "\"size\":7990210,"
            + "\"publishedAtUtc\":\"2026-10-16T12:34:56Z\""
            + "}";
    }

    private static String replace(String source, String before, String after) {
        String changed = source.replace(before, after);
        if (changed.equals(source)) throw new AssertionError("Test fixture replacement failed: " + before);
        return changed;
    }

    private static void reject(String json) {
        try {
            AndroidUpdateManifest.parse(json);
            throw new AssertionError("Expected manifest rejection: " + json);
        } catch (IllegalArgumentException expected) {
            // Expected.
        }
    }

    private static void assertEquals(Object expected, Object actual) {
        if (!expected.equals(actual))
            throw new AssertionError("Expected " + expected + " but got " + actual);
    }
}
