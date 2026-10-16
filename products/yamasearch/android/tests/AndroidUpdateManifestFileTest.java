package eu.yamachat.yamasearch;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/** Runs the exact app parser against a manifest generated or fetched by CI. */
public final class AndroidUpdateManifestFileTest {
    public static void main(String[] args) throws Exception {
        if (args.length != 1) throw new IllegalArgumentException("Expected one manifest path");
        String json = Files.readString(Path.of(args[0]), StandardCharsets.UTF_8);
        AndroidUpdateManifest manifest = AndroidUpdateManifest.parse(json);
        if (manifest.toJson().isEmpty()) throw new AssertionError("Manifest serialization failed");
        System.out.println("PASS: generated Android update manifest is accepted by the app parser.");
    }
}
