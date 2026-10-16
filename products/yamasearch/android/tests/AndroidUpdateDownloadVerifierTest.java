package eu.yamachat.yamasearch;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/** JVM coverage for the APK size and SHA-256 gate used after DownloadManager. */
public final class AndroidUpdateDownloadVerifierTest {
    public static void main(String[] args) throws Exception {
        byte[] apk = "signed-apk-test-payload".getBytes(StandardCharsets.UTF_8);
        String sha256 = hex(MessageDigest.getInstance("SHA-256").digest(apk));
        AndroidUpdateDownloadVerifier.verify(new ByteArrayInputStream(apk), apk.length, sha256);
        AndroidUpdateDownloadVerifier.verify(new ByteArrayInputStream(apk), apk.length, sha256.toLowerCase());

        reject(apk, apk.length + 1L, sha256);
        reject(apk, apk.length - 1L, sha256);
        reject(apk, apk.length, "0".repeat(64));
        reject(apk, 0L, sha256);
        reject(apk, apk.length, "bad");

        System.out.println("PASS: Downloaded Android updates require exact size and SHA-256.");
    }

    private static void reject(byte[] apk, long size, String sha256) {
        try {
            AndroidUpdateDownloadVerifier.verify(new ByteArrayInputStream(apk), size, sha256);
            throw new AssertionError("Expected update verification failure");
        } catch (IOException expected) {
            // Expected.
        }
    }

    private static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) result.append(String.format("%02X", value & 0xff));
        return result.toString();
    }
}
