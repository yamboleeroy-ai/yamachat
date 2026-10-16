package eu.yamachat.yamasearch;

import java.net.IDN;
import java.net.URLEncoder;
import java.net.URL;
import java.util.Locale;

/** Resolves address-bar input without mixing visited URLs into search history. */
final class MobileNavigation {
    static final String HOME = "about:blank";

    static final class Destination {
        final String input;
        final String url;
        final boolean search;

        Destination(String input, String url, boolean search) {
            this.input = input;
            this.url = url;
            this.search = search;
        }

        boolean isHome() { return HOME.equals(url); }
    }

    private MobileNavigation() { }

    static Destination resolve(String raw) {
        String input = raw == null ? "" : raw.trim();
        if (input.isEmpty() || HOME.equalsIgnoreCase(input))
            return new Destination("", HOME, false);

        String lower = input.toLowerCase(Locale.ROOT);
        if (lower.startsWith("https://") || lower.startsWith("http://")) {
            String validUrl = validHttpUrl(input);
            if (!validUrl.isEmpty()) return new Destination(input, validUrl, false);
        }

        if (!containsUnsafeCharacter(input) && looksLikeAddress(input)) {
            String validUrl = validHttpUrl("https://" + input);
            if (!validUrl.isEmpty()) return new Destination(input, validUrl, false);
        }

        return new Destination(input,
            "https://www.google.com/search?q=" + encodeQuery(input), true);
    }

    static boolean isWebUrl(String value) {
        return value != null && !validHttpUrl(value.trim()).isEmpty();
    }

    private static boolean looksLikeAddress(String input) {
        int end = input.length();
        for (char separator : new char[] {'/', '?', '#'}) {
            int index = input.indexOf(separator);
            if (index >= 0) end = Math.min(end, index);
        }
        String authority = input.substring(0, end);
        if (authority.isEmpty()) return false;
        if (authority.startsWith("[") && authority.contains("]")) return true;
        int colon = authority.lastIndexOf(':');
        String host = colon > 0 && authority.indexOf(':') == colon
            ? authority.substring(0, colon) : authority;
        return "localhost".equalsIgnoreCase(host) || host.contains(".");
    }

    private static String validHttpUrl(String value) {
        if (value == null || value.isEmpty() || value.length() > 4096 || containsUnsafeCharacter(value)) return "";
        try {
            URL url = new URL(value);
            String scheme = url.getProtocol();
            if (!("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme))) return "";
            if (url.getUserInfo() != null || url.getHost() == null || url.getHost().isEmpty()) return "";
            if (url.getPort() > 65535) return "";
            if (!validHost(url.getHost())) return "";
            return value;
        } catch (Exception ignored) {
            return "";
        }
    }

    private static boolean validHost(String rawHost) {
        String host = rawHost.endsWith(".") ? rawHost.substring(0, rawHost.length() - 1) : rawHost;
        if (host.startsWith("[") && host.endsWith("]"))
            return host.substring(1, host.length() - 1).matches("[0-9a-fA-F:.]+");
        try {
            String ascii = IDN.toASCII(host, IDN.USE_STD3_ASCII_RULES).toLowerCase(Locale.ROOT);
            if (ascii.isEmpty() || ascii.length() > 253) return false;
            String[] labels = ascii.split("\\.");
            for (String label : labels) {
                if (label.isEmpty() || label.length() > 63 || label.startsWith("-") || label.endsWith("-"))
                    return false;
            }
            if (ascii.matches("(?:[0-9]{1,3}\\.){3}[0-9]{1,3}")) {
                for (String label : labels) if (Integer.parseInt(label) > 255) return false;
            }
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private static boolean containsUnsafeCharacter(String value) {
        for (int index = 0; index < value.length(); index++) {
            char item = value.charAt(index);
            if (Character.isWhitespace(item) || Character.isISOControl(item)) return true;
        }
        return false;
    }

    private static String encodeQuery(String value) {
        try {
            // URLEncoder uses '+' for spaces, which is accepted by Google and
            // keeps the implementation available on every supported Android API.
            return URLEncoder.encode(value, "UTF-8");
        } catch (Exception ignored) {
            return value.replace(" ", "+");
        }
    }
}
