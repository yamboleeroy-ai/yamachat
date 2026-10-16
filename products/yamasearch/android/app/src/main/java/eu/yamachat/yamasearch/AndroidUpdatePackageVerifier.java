package eu.yamachat.yamasearch;

import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;

import java.io.File;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Locale;

/** Verifies the identity Android will see before an APK reaches the installer. */
final class AndroidUpdatePackageVerifier {
    // Long-lived YamaSearch mobile release identity, also enforced by release CI.
    private static final String RELEASE_CERT_SHA256 =
        "A6AE7F09A6C808CB8394FBA6271E59BAF47D58D8ED37B43282193DD2799DF75D";

    private AndroidUpdatePackageVerifier() { }

    static void verify(PackageManager packageManager, File apk,
                       AndroidUpdateManifest manifest) throws IOException {
        if (packageManager == null || apk == null || manifest == null || !apk.isFile())
            throw new IOException("Missing downloaded APK");

        PackageInfo info = packageManager.getPackageArchiveInfo(
            apk.getAbsolutePath(), PackageManager.GET_SIGNING_CERTIFICATES);
        if (info == null
            || !AndroidUpdateManifest.PACKAGE_ID.equals(info.packageName)
            || info.getLongVersionCode() != manifest.getVersionCode()
            || !manifest.getVersion().equals(info.versionName))
            throw new IOException("Downloaded APK identity does not match the update manifest");

        SigningInfo signingInfo = info.signingInfo;
        if (signingInfo == null) throw new IOException("Downloaded APK is not signed");
        Signature[] signatures = signingInfo.hasMultipleSigners()
            ? signingInfo.getApkContentsSigners()
            : signingInfo.getSigningCertificateHistory();
        if (signatures == null || signatures.length == 0)
            throw new IOException("Downloaded APK has no signing certificate");

        for (Signature signature : signatures) {
            if (RELEASE_CERT_SHA256.equals(sha256(signature.toByteArray()))) return;
        }
        throw new IOException("Downloaded APK has an unexpected signing certificate");
    }

    private static String sha256(byte[] bytes) throws IOException {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
            StringBuilder result = new StringBuilder(digest.length * 2);
            for (byte value : digest)
                result.append(String.format(Locale.ROOT, "%02X", value & 0xff));
            return result.toString();
        } catch (NoSuchAlgorithmException impossible) {
            throw new IOException("SHA-256 is unavailable", impossible);
        }
    }
}
