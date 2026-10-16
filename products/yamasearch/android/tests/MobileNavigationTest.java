package eu.yamachat.yamasearch;

/** Small JVM regression test for address-versus-search classification. */
public final class MobileNavigationTest {
    public static void main(String[] args) {
        assertHome(null);
        assertHome("  ");
        assertSearch("video s kočkou");
        assertSearch("javascript:alert(1)");
        assertSearch("https://");
        assertSearch("https://exa mple.com");
        assertSearch("999.999.999.999");
        assertAddress("facebook.com");
        assertAddress("www.youtube.com/watch?v=test");
        assertAddress("https://example.com/path?q=1");
        assertAddress("česko.cz");
        assertAddress("xn--esko-0ra.cz.");
        assertAddress("localhost:8080/test");
        System.out.println("PASS: MobileNavigation keeps searches, URLs, IDN and unsafe input separated.");
    }

    private static void assertHome(String input) {
        MobileNavigation.Destination value = MobileNavigation.resolve(input);
        if (!value.isHome() || value.search)
            throw new AssertionError("Expected home for: " + input);
    }

    private static void assertSearch(String input) {
        MobileNavigation.Destination value = MobileNavigation.resolve(input);
        if (!value.search || !value.url.startsWith("https://www.google.com/search?q="))
            throw new AssertionError("Expected search for: " + input + " -> " + value.url);
    }

    private static void assertAddress(String input) {
        MobileNavigation.Destination value = MobileNavigation.resolve(input);
        if (value.search || !value.url.toLowerCase(java.util.Locale.ROOT).startsWith("http"))
            throw new AssertionError("Expected address for: " + input + " -> " + value.url);
    }
}
