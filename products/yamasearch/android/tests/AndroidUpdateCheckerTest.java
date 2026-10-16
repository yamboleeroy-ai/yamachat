package eu.yamachat.yamasearch;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/** JVM regression coverage for bounded, strict manifest transport decoding. */
public final class AndroidUpdateCheckerTest {
    public static void main(String[] args) throws Exception {
        byte[] valid = AndroidUpdateManifestTest.validManifest().getBytes(StandardCharsets.UTF_8);
        String decoded = AndroidUpdateChecker.readUtf8Manifest(
            new ByteArrayInputStream(valid), valid.length);
        AndroidUpdateManifest.parse(decoded);

        reject(new byte[0], 0);
        reject(new byte[] {(byte) 0xC3, (byte) 0x28}, 2);
        reject(new byte[AndroidUpdateChecker.MAX_MANIFEST_BYTES + 1], -1);
        reject(valid, AndroidUpdateChecker.MAX_MANIFEST_BYTES + 1);

        byte[] exactLimit = new byte[AndroidUpdateChecker.MAX_MANIFEST_BYTES];
        Arrays.fill(exactLimit, (byte) ' ');
        String exact = AndroidUpdateChecker.readUtf8Manifest(
            new ByteArrayInputStream(exactLimit), -1);
        if (exact.length() != AndroidUpdateChecker.MAX_MANIFEST_BYTES)
            throw new AssertionError("Exact transport limit was truncated");

        System.out.println("PASS: Android update transport is UTF-8 strict and size bounded.");
    }

    private static void reject(byte[] value, int advertisedLength) {
        try {
            AndroidUpdateChecker.readUtf8Manifest(new ByteArrayInputStream(value), advertisedLength);
            throw new AssertionError("Expected transport rejection");
        } catch (IOException expected) {
            // Expected.
        }
    }
}
