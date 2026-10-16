package eu.yamachat.yamasearch;

import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Immutable, validated description of one public YamaSearch Android update.
 *
 * <p>The parser is deliberately self-contained so the updater does not depend
 * on WebView, JavaScript or a lenient third-party JSON implementation.</p>
 */
public final class AndroidUpdateManifest {
    public static final int SCHEMA_VERSION = 1;
    public static final String PRODUCT = "YamaSearch Android";
    public static final String PACKAGE_ID = "eu.yamachat.yamasearch.mobile";
    public static final String DOWNLOAD_ORIGIN = "https://updates.yamachat.eu";
    public static final String DOWNLOAD_DIRECTORY = "/yamasearch/";

    private static final int MAX_JSON_CHARS = 32 * 1024;
    private static final long MAX_APK_BYTES = 512L * 1024L * 1024L;
    private static final Pattern VERSION_PATTERN = Pattern.compile(
        "[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?(?:\\+[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?");
    private static final Pattern SHA256_PATTERN = Pattern.compile("[0-9A-Fa-f]{64}");

    private final String version;
    private final long versionCode;
    private final String channel;
    private final String notes;
    private final String apkUrl;
    private final String sha256;
    private final long size;
    private final Instant publishedAtUtc;

    private AndroidUpdateManifest(String version, long versionCode, String channel,
                                  String notes, String apkUrl, String sha256,
                                  long size, Instant publishedAtUtc) {
        this.version = version;
        this.versionCode = versionCode;
        this.channel = channel;
        this.notes = notes;
        this.apkUrl = apkUrl;
        this.sha256 = sha256;
        this.size = size;
        this.publishedAtUtc = publishedAtUtc;
    }

    /** Parses the complete manifest and rejects missing, ambiguous or unsafe data. */
    public static AndroidUpdateManifest parse(String json) {
        if (json == null || json.isEmpty() || json.length() > MAX_JSON_CHARS)
            throw invalid("Manifest is empty or too large");

        Object parsed = new JsonParser(json).parseDocument();
        if (!(parsed instanceof Map)) throw invalid("Manifest root must be an object");

        @SuppressWarnings("unchecked")
        Map<String, Object> object = (Map<String, Object>) parsed;
        long schemaVersion = requiredPositiveInteger(object, "schemaVersion");
        if (schemaVersion != SCHEMA_VERSION) throw invalid("Unsupported schemaVersion");

        String product = requiredString(object, "product", 64);
        if (!PRODUCT.equals(product)) throw invalid("Unexpected product");

        String packageId = requiredString(object, "packageId", 128);
        if (!PACKAGE_ID.equals(packageId)) throw invalid("Unexpected packageId");

        String version = requiredString(object, "version", 64);
        if (!VERSION_PATTERN.matcher(version).matches()) throw invalid("Invalid version");

        long versionCode = requiredPositiveInteger(object, "versionCode");
        // Android reserves the upper portion of the signed int range.
        if (versionCode > 2_100_000_000L) throw invalid("versionCode is out of range");

        String channel = requiredString(object, "channel", 16).toLowerCase(Locale.ROOT);
        if (!("stable".equals(channel) || "beta".equals(channel)))
            throw invalid("Unsupported channel");

        String notes = requiredString(object, "notes", 2_000);
        String apkUrl = requiredString(object, "apkUrl", 512);
        String expectedApkUrl = DOWNLOAD_ORIGIN + DOWNLOAD_DIRECTORY
            + "YamaSearch-Android-" + version + ".apk";
        // Exact equality also rejects credentials, explicit ports, escaping,
        // query parameters, fragments and mutable aliases such as "latest".
        if (!expectedApkUrl.equals(apkUrl)) throw invalid("Unexpected apkUrl");

        String sha256 = requiredString(object, "sha256", 64);
        if (!SHA256_PATTERN.matcher(sha256).matches()) throw invalid("Invalid sha256");

        long size = requiredPositiveInteger(object, "size");
        if (size > MAX_APK_BYTES) throw invalid("APK size is out of range");

        String publishedAt = requiredString(object, "publishedAtUtc", 64);
        Instant publishedAtUtc;
        try {
            if (!publishedAt.endsWith("Z")) throw invalid("Invalid publishedAtUtc");
            publishedAtUtc = Instant.parse(publishedAt);
        } catch (DateTimeParseException error) {
            throw invalid("Invalid publishedAtUtc");
        }

        return new AndroidUpdateManifest(version, versionCode, channel, notes,
            apkUrl, sha256.toUpperCase(Locale.ROOT), size, publishedAtUtc);
    }

    public boolean isNewerThan(long installedVersionCode) {
        return versionCode > installedVersionCode;
    }

    public String getVersion() { return version; }
    public long getVersionCode() { return versionCode; }
    public String getChannel() { return channel; }
    public String getNotes() { return notes; }
    public String getApkUrl() { return apkUrl; }
    public String getSha256() { return sha256; }
    public long getSize() { return size; }
    public Instant getPublishedAtUtc() { return publishedAtUtc; }

    /**
     * Returns a canonical JSON representation suitable for private, local
     * persistence while DownloadManager owns the APK transfer.
     *
     * <p>Reading this value still goes through {@link #parse(String)}, so a
     * damaged or partially-written preference can never bypass validation.</p>
     */
    public String toJson() {
        return "{"
            + "\"schemaVersion\":" + SCHEMA_VERSION + ","
            + "\"product\":" + quoteJson(PRODUCT) + ","
            + "\"packageId\":" + quoteJson(PACKAGE_ID) + ","
            + "\"version\":" + quoteJson(version) + ","
            + "\"versionCode\":" + versionCode + ","
            + "\"channel\":" + quoteJson(channel) + ","
            + "\"notes\":" + quoteJson(notes) + ","
            + "\"apkUrl\":" + quoteJson(apkUrl) + ","
            + "\"sha256\":" + quoteJson(sha256) + ","
            + "\"size\":" + size + ","
            + "\"publishedAtUtc\":" + quoteJson(publishedAtUtc.toString())
            + "}";
    }

    private static String quoteJson(String value) {
        StringBuilder result = new StringBuilder(value.length() + 2).append('"');
        for (int index = 0; index < value.length(); index++) {
            char current = value.charAt(index);
            switch (current) {
                case '"': result.append("\\\""); break;
                case '\\': result.append("\\\\"); break;
                case '\b': result.append("\\b"); break;
                case '\f': result.append("\\f"); break;
                case '\n': result.append("\\n"); break;
                case '\r': result.append("\\r"); break;
                case '\t': result.append("\\t"); break;
                default:
                    if (current < 0x20) {
                        result.append("\\u00");
                        String hex = Integer.toHexString(current).toUpperCase(Locale.ROOT);
                        if (hex.length() < 2) result.append('0');
                        result.append(hex);
                    } else {
                        result.append(current);
                    }
                    break;
            }
        }
        return result.append('"').toString();
    }

    private static String requiredString(Map<String, Object> object, String key, int maximumLength) {
        Object value = object.get(key);
        if (!(value instanceof String)) throw invalid("Missing or invalid " + key);
        String text = (String) value;
        if (text.isEmpty() || text.length() > maximumLength) throw invalid("Invalid " + key);
        return text;
    }

    private static long requiredPositiveInteger(Map<String, Object> object, String key) {
        Object value = object.get(key);
        if (!(value instanceof JsonNumber)) throw invalid("Missing or invalid " + key);
        String token = ((JsonNumber) value).token;
        if (!token.matches("[1-9][0-9]*")) throw invalid("Invalid " + key);
        try {
            long number = Long.parseLong(token);
            if (number <= 0) throw invalid("Invalid " + key);
            return number;
        } catch (NumberFormatException error) {
            throw invalid("Invalid " + key);
        }
    }

    private static IllegalArgumentException invalid(String message) {
        return new IllegalArgumentException(message);
    }

    private static final class JsonNumber {
        final String token;
        JsonNumber(String token) { this.token = token; }
    }

    /** Strict JSON parser with duplicate-key and nesting protection. */
    private static final class JsonParser {
        private static final int MAX_DEPTH = 16;
        private final String input;
        private int offset;

        JsonParser(String input) { this.input = input; }

        Object parseDocument() {
            skipWhitespace();
            Object value = parseValue(0);
            skipWhitespace();
            if (offset != input.length()) throw invalid("Trailing JSON data");
            return value;
        }

        private Object parseValue(int depth) {
            if (depth > MAX_DEPTH || offset >= input.length()) throw invalid("Invalid JSON value");
            char current = input.charAt(offset);
            if (current == '{') return parseObject(depth + 1);
            if (current == '[') return parseArray(depth + 1);
            if (current == '"') return parseString();
            if (current == 't') return parseLiteral("true", Boolean.TRUE);
            if (current == 'f') return parseLiteral("false", Boolean.FALSE);
            if (current == 'n') return parseLiteral("null", null);
            if (current == '-' || (current >= '0' && current <= '9')) return parseNumber();
            throw invalid("Invalid JSON value");
        }

        private Map<String, Object> parseObject(int depth) {
            offset++;
            skipWhitespace();
            Map<String, Object> result = new LinkedHashMap<>();
            if (consume('}')) return result;
            while (true) {
                if (offset >= input.length() || input.charAt(offset) != '"')
                    throw invalid("Object key must be a string");
                String key = parseString();
                skipWhitespace();
                expect(':');
                skipWhitespace();
                Object value = parseValue(depth);
                if (result.containsKey(key)) throw invalid("Duplicate JSON key");
                result.put(key, value);
                skipWhitespace();
                if (consume('}')) return result;
                expect(',');
                skipWhitespace();
            }
        }

        private List<Object> parseArray(int depth) {
            offset++;
            skipWhitespace();
            List<Object> result = new ArrayList<>();
            if (consume(']')) return result;
            while (true) {
                result.add(parseValue(depth));
                skipWhitespace();
                if (consume(']')) return result;
                expect(',');
                skipWhitespace();
            }
        }

        private String parseString() {
            expect('"');
            StringBuilder result = new StringBuilder();
            while (offset < input.length()) {
                char current = input.charAt(offset++);
                if (current == '"') return result.toString();
                if (current < 0x20) throw invalid("Control character in JSON string");
                if (current == '\\') {
                    if (offset >= input.length()) throw invalid("Invalid JSON escape");
                    char escaped = input.charAt(offset++);
                    switch (escaped) {
                        case '"': result.append('"'); break;
                        case '\\': result.append('\\'); break;
                        case '/': result.append('/'); break;
                        case 'b': result.append('\b'); break;
                        case 'f': result.append('\f'); break;
                        case 'n': result.append('\n'); break;
                        case 'r': result.append('\r'); break;
                        case 't': result.append('\t'); break;
                        case 'u': appendUnicodeEscape(result); break;
                        default: throw invalid("Invalid JSON escape");
                    }
                } else {
                    if (Character.isHighSurrogate(current)) {
                        if (offset >= input.length() || !Character.isLowSurrogate(input.charAt(offset)))
                            throw invalid("Unpaired Unicode surrogate");
                        result.append(current).append(input.charAt(offset++));
                    } else if (Character.isLowSurrogate(current)) {
                        throw invalid("Unpaired Unicode surrogate");
                    } else {
                        result.append(current);
                    }
                }
            }
            throw invalid("Unterminated JSON string");
        }

        private void appendUnicodeEscape(StringBuilder target) {
            char first = readHexCodeUnit();
            if (Character.isHighSurrogate(first)) {
                if (offset + 2 > input.length() || input.charAt(offset) != '\\'
                    || input.charAt(offset + 1) != 'u')
                    throw invalid("Unpaired Unicode surrogate");
                offset += 2;
                char second = readHexCodeUnit();
                if (!Character.isLowSurrogate(second)) throw invalid("Unpaired Unicode surrogate");
                target.append(first).append(second);
            } else if (Character.isLowSurrogate(first)) {
                throw invalid("Unpaired Unicode surrogate");
            } else {
                target.append(first);
            }
        }

        private char readHexCodeUnit() {
            if (offset + 4 > input.length()) throw invalid("Invalid Unicode escape");
            int value = 0;
            for (int index = 0; index < 4; index++) {
                int digit = Character.digit(input.charAt(offset++), 16);
                if (digit < 0) throw invalid("Invalid Unicode escape");
                value = (value << 4) | digit;
            }
            return (char) value;
        }

        private JsonNumber parseNumber() {
            int start = offset;
            if (consume('-') && offset >= input.length()) throw invalid("Invalid JSON number");
            if (consume('0')) {
                if (offset < input.length() && isAsciiDigit(input.charAt(offset)))
                    throw invalid("Invalid JSON number");
            } else {
                if (offset >= input.length() || input.charAt(offset) < '1' || input.charAt(offset) > '9')
                    throw invalid("Invalid JSON number");
                while (offset < input.length() && isAsciiDigit(input.charAt(offset))) offset++;
            }
            if (consume('.')) {
                int fractionStart = offset;
                while (offset < input.length() && isAsciiDigit(input.charAt(offset))) offset++;
                if (offset == fractionStart) throw invalid("Invalid JSON number");
            }
            if (offset < input.length() && (input.charAt(offset) == 'e' || input.charAt(offset) == 'E')) {
                offset++;
                if (offset < input.length() && (input.charAt(offset) == '+' || input.charAt(offset) == '-')) offset++;
                int exponentStart = offset;
                while (offset < input.length() && isAsciiDigit(input.charAt(offset))) offset++;
                if (offset == exponentStart) throw invalid("Invalid JSON number");
            }
            return new JsonNumber(input.substring(start, offset));
        }

        private Object parseLiteral(String literal, Object value) {
            if (!input.regionMatches(offset, literal, 0, literal.length()))
                throw invalid("Invalid JSON literal");
            offset += literal.length();
            return value;
        }

        private void skipWhitespace() {
            while (offset < input.length()) {
                char current = input.charAt(offset);
                if (current == ' ' || current == '\n' || current == '\r' || current == '\t') offset++;
                else break;
            }
        }

        private boolean consume(char expected) {
            if (offset < input.length() && input.charAt(offset) == expected) {
                offset++;
                return true;
            }
            return false;
        }

        private void expect(char expected) {
            if (!consume(expected)) throw invalid("Invalid JSON syntax");
        }

        private static boolean isAsciiDigit(char value) {
            return value >= '0' && value <= '9';
        }
    }
}
