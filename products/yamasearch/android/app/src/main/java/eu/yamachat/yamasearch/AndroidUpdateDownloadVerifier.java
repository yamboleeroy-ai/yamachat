package eu.yamachat.yamasearch;

import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Locale;

/** Streams a downloaded APK once and verifies the release manifest contract. */
final class AndroidUpdateDownloadVerifier {
    private AndroidUpdateDownloadVerifier() { }

    static void verify(InputStream input, long expectedSize, String expectedSha256) throws IOException {
        if (input == null || expectedSize <= 0L || expectedSize > 512L * 1024L * 1024L
            || expectedSha256 == null || !expectedSha256.matches("[0-9A-Fa-f]{64}")) {
            throw new IOException("Invalid update verification metadata");
        }

        MessageDigest digest;
        try {
            digest = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException impossible) {
            throw new IOException("SHA-256 is unavailable", impossible);
        }

        long total = 0L;
        byte[] buffer = new byte[16 * 1024];
        int count;
        while ((count = input.read(buffer)) != -1) {
            if (Thread.currentThread().isInterrupted()) throw new IOException("Verification interrupted");
            total += count;
            if (total > expectedSize) throw new IOException("Downloaded APK is larger than expected");
            digest.update(buffer, 0, count);
        }
        if (total != expectedSize) throw new IOException("Downloaded APK size does not match");

        StringBuilder actual = new StringBuilder(64);
        for (byte value : digest.digest()) actual.append(String.format(Locale.ROOT, "%02X", value & 0xff));
        if (!actual.toString().equalsIgnoreCase(expectedSha256))
            throw new IOException("Downloaded APK checksum does not match");
    }
}
