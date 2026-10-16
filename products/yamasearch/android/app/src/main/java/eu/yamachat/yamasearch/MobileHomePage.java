package eu.yamachat.yamasearch;

import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/**
 * Builds the local mobile start page. The page deliberately has no JavaScript
 * and no external resources; BrowserActivity handles the yamasearch:// actions.
 */
final class MobileHomePage {
    // .invalid is permanently reserved and can never collide with a real site.
    static final String HOME_BASE = "https://home.yamasearch.invalid/";

    private static final int MAX_HOME_FAVORITES = 12;
    private static final int MAX_HOME_SEARCHES = 6;
    private static final int MAX_FAVICON_BASE64_CHARS = 24 * 1024;
    private static final char[] HEX = "0123456789ABCDEF".toCharArray();

    private MobileHomePage() { }

    static String render(boolean privateSession, String profileDisplayName,
                         List<BrowserStore.Entry> favorites,
                         List<BrowserStore.SearchEntry> recentSearches,
                         int historyCount, boolean showFavorites,
                         boolean showRecentSearches) {
        // Never allow normal-profile data to leak into a private start page,
        // even if a caller accidentally supplies it.
        List<BrowserStore.Entry> safeFavorites = privateSession || favorites == null
            ? Collections.emptyList() : favorites;
        List<BrowserStore.SearchEntry> safeSearches = privateSession || recentSearches == null
            ? Collections.emptyList() : recentSearches;
        int safeHistoryCount = privateSession ? 0 : Math.max(0, historyCount);
        String profileName = privateSession
            ? "Soukromé okno"
            : compactAndLimit(profileDisplayName, 48, "Můj profil");

        StringBuilder html = new StringBuilder(18_000);
        html.append("<!doctype html><html lang=\"cs\"><head>")
            .append("<meta charset=\"utf-8\">")
            .append("<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">")
            .append("<meta name=\"color-scheme\" content=\"dark\">")
            .append("<meta name=\"referrer\" content=\"no-referrer\">")
            .append("<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src data:; style-src 'unsafe-inline'; form-action yamasearch:; base-uri 'none'; object-src 'none'\">")
            .append("<title>YamaSearch</title><style>")
            .append("*{box-sizing:border-box}html{background:#06121f;color:#ecf8ff;font-family:system-ui,-apple-system,'Segoe UI',sans-serif}")
            .append("body{margin:0;min-height:100vh;background:radial-gradient(circle at 88% 0,#163255 0,transparent 38%),linear-gradient(180deg,#071726,#050e18);padding:20px 16px 30px;padding:max(20px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(30px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left))}")
            .append("main{width:100%;max-width:720px;margin:0 auto}.top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:2px 2px 22px}")
            .append(".brand{display:flex;align-items:center;gap:11px}.mark{display:grid;place-items:center;width:42px;height:42px;border:1px solid #41d9ff;border-radius:14px;background:linear-gradient(145deg,#12395a,#122042);color:#7ee9ff;font-weight:900;box-shadow:0 0 24px #22bde733}")
            .append("h1{font-size:21px;line-height:1.1;margin:0;letter-spacing:.2px}.sub{color:#8eaec3;font-size:12px;margin-top:4px}")
            .append("a{color:inherit;text-decoration:none}.profile{display:flex;align-items:center;gap:8px;max-width:48%;padding:8px 10px;border:1px solid #215a7a;border-radius:13px;background:#0b2133;color:#bdefff;font-size:12px}")
            .append(".avatar{display:grid;place-items:center;flex:0 0 25px;width:25px;height:25px;border-radius:50%;background:#173e5e;color:#62e2ff;font-weight:800}.profile-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}")
            .append(".hero,.panel{border:1px solid #174c69;border-radius:20px;background:#0a1a2aeb;box-shadow:0 16px 42px #0006}")
            .append(".hero{padding:22px 18px;margin-bottom:18px}.eyebrow{margin:0 0 8px;color:#59deff;font-size:12px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase}")
            .append("h2{font-size:23px;line-height:1.25;margin:0 0 8px}.lead{margin:0;color:#a8bfce;font-size:14px;line-height:1.5}")
            .append("form{display:flex;gap:9px;margin-top:19px}.search{min-width:0;flex:1;height:48px;border:1px solid #2a6d94;border-radius:14px;background:#071522;color:#f1fbff;padding:0 15px;font-size:16px;outline:none}")
            .append(".search::placeholder{color:#7896aa}.search:focus{border-color:#58dcff;box-shadow:0 0 0 3px #42d7ff24}.go{flex:0 0 49px;height:48px;border:0;border-radius:14px;background:linear-gradient(145deg,#38d8ff,#4e9fff);color:#03131e;font-size:22px;font-weight:900}")
            .append(".private-note{display:flex;gap:9px;align-items:flex-start;margin-top:16px;padding:11px 12px;border:1px solid #64458a;border-radius:13px;background:#261b3a;color:#d9c8f5;font-size:12px;line-height:1.45}")
            .append(".panel{padding:17px 15px;margin-top:14px}.section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 2px 13px}.section-head h3{font-size:16px;margin:0}.all{color:#66dcff;font-size:12px;font-weight:700}")
            .append(".favorites{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.favorite{display:flex;align-items:center;gap:10px;min-height:66px;padding:11px;border:1px solid #173f59;border-radius:15px;background:#0b2235;overflow:hidden}")
            .append(".favorite:active,.search-row:active,.profile:active{background:#12324b}.favicon,.fallback{flex:0 0 36px;width:36px;height:36px;border-radius:11px}.favicon{object-fit:cover;background:#102d43}.fallback{display:grid;place-items:center;background:linear-gradient(145deg,#173b58,#27234d);color:#6de2ff;font-size:15px;font-weight:900}")
            .append(".fav-copy{min-width:0}.fav-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:750}.fav-host{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:4px;color:#819fb2;font-size:11px}")
            .append(".searches{display:grid;gap:8px}.search-row{display:flex;align-items:center;gap:11px;min-height:45px;padding:9px 11px;border:1px solid #153f58;border-radius:13px;background:#091f30}.glass{color:#5fe0ff;font-size:15px}.query{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}")
            .append(".stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.stat{padding:13px;border:1px solid #173f59;border-radius:14px;background:#091e2e}.stat strong{display:block;color:#68e2ff;font-size:21px}.stat span{display:block;margin-top:3px;color:#8ca9bb;font-size:11px}")
            .append(".empty{padding:15px;border:1px dashed #24506a;border-radius:14px;color:#89a9bc;font-size:13px;line-height:1.45;text-align:center}")
            .append("footer{padding:22px 4px 2px;color:#678699;font-size:11px;text-align:center}")
            .append("@media(max-width:330px){.favorites{grid-template-columns:1fr}.profile{max-width:44%;padding:7px}.hero{padding:19px 14px}}")
            .append("@media(min-width:560px){body{padding-top:34px}.hero{padding:27px 25px}.panel{padding:20px}.favorites{grid-template-columns:repeat(3,minmax(0,1fr))}}")
            .append("@media(prefers-reduced-motion:no-preference){.favorite,.search-row,.profile,.go{transition:background-color .14s ease,transform .14s ease}.favorite:active,.search-row:active,.profile:active,.go:active{transform:scale(.985)}}")
            .append("</style></head><body><main>");

        appendHeader(html, profileName, privateSession);
        appendHero(html, privateSession);
        if (privateSession) {
            appendPrivatePanel(html);
        } else {
            if (showFavorites) appendFavorites(html, safeFavorites);
            if (showRecentSearches) appendRecentSearches(html, safeSearches);
            appendStats(html, safeFavorites.size(), safeHistoryCount);
        }
        html.append("<footer>YamaSearch · mobilní prohlížení bez externího obsahu na domovské stránce</footer>")
            .append("</main></body></html>");
        return html.toString();
    }

    private static void appendHeader(StringBuilder html, String profileName, boolean privateSession) {
        String initial = initialOf(profileName);
        html.append("<header class=\"top\"><div class=\"brand\"><div class=\"mark\" aria-hidden=\"true\">YS</div><div>")
            .append("<h1>YamaSearch</h1><div class=\"sub\">")
            .append(privateSession ? "Soukromé prohlížení" : "Váš mobilní prohlížeč")
            .append("</div></div></div><a class=\"profile\" href=\"yamasearch://profile\" aria-label=\"Otevřít profil\">")
            .append("<span class=\"avatar\" aria-hidden=\"true\">").append(escapeHtml(initial)).append("</span>")
            .append("<span class=\"profile-name\" dir=\"auto\">").append(escapeHtml(profileName)).append("</span></a></header>");
    }

    private static void appendHero(StringBuilder html, boolean privateSession) {
        html.append("<section class=\"hero\"><p class=\"eyebrow\">")
            .append(privateSession ? "Soukromé hledání" : "Rychlé hledání")
            .append("</p><h2>")
            .append(privateSession ? "Hledejte bez ukládání do profilu" : "Co chcete dnes najít?")
            .append("</h2><p class=\"lead\">")
            .append(privateSession
                ? "Hledání, oblíbené položky ani historie běžného profilu se zde nezobrazují."
                : "Zadejte dotaz nebo webovou adresu. Vaše často používané stránky jsou hned po ruce.")
            .append("</p><form action=\"yamasearch://search\" method=\"get\">")
            .append("<input class=\"search\" type=\"search\" name=\"q\" maxlength=\"256\" autocomplete=\"off\" enterkeyhint=\"search\" placeholder=\"Hledat nebo zadat adresu\" aria-label=\"Hledat nebo zadat adresu\">")
            .append("<button class=\"go\" type=\"submit\" aria-label=\"Hledat\">›</button></form>");
        if (privateSession) {
            html.append("<div class=\"private-note\"><span aria-hidden=\"true\">◆</span><span>Po zavření soukromých karet YamaSearch neuchová jejich historii ani hledané výrazy.</span></div>");
        }
        html.append("</section>");
    }

    private static void appendPrivatePanel(StringBuilder html) {
        html.append("<section class=\"panel\"><div class=\"section-head\"><h3>Oddělené prohlížení</h3></div>")
            .append("<div class=\"empty\">Toto okno nepoužívá obsah běžného profilu. Webové stránky mohou stále ukládat data jen po dobu této soukromé relace.</div></section>");
    }

    private static void appendFavorites(StringBuilder html, List<BrowserStore.Entry> favorites) {
        html.append("<section class=\"panel\"><div class=\"section-head\"><h3>Oblíbené</h3>")
            .append("<a class=\"all\" href=\"yamasearch://favorites\">Zobrazit vše</a></div>");
        int appended = 0;
        StringBuilder cards = new StringBuilder();
        for (BrowserStore.Entry entry : favorites) {
            if (appended >= MAX_HOME_FAVORITES) break;
            String url = safeWebUrl(entry == null ? null : entry.url);
            if (url.isEmpty()) continue;
            String host = hostOf(url);
            String title = compactAndLimit(entry.title, 80, host.isEmpty() ? url : host);
            String favicon = safePngFavicon(entry.favicon);
            cards.append("<a class=\"favorite\" href=\"").append(escapeHtml(url)).append("\" rel=\"noreferrer\">");
            if (favicon.isEmpty()) {
                cards.append("<span class=\"fallback\" aria-hidden=\"true\">")
                    .append(escapeHtml(initialOf(title))).append("</span>");
            } else {
                cards.append("<img class=\"favicon\" alt=\"\" src=\"data:image/png;base64,")
                    .append(favicon).append("\">");
            }
            cards.append("<span class=\"fav-copy\"><span class=\"fav-title\" dir=\"auto\">")
                .append(escapeHtml(title)).append("</span><span class=\"fav-host\" dir=\"ltr\">")
                .append(escapeHtml(host.isEmpty() ? url : host)).append("</span></span></a>");
            appended++;
        }
        if (appended == 0) {
            html.append("<div class=\"empty\">Oblíbenou stránku přidáte hvězdičkou v dolní liště. Potom se zobrazí také zde.</div>");
        } else {
            html.append("<div class=\"favorites\">").append(cards).append("</div>");
        }
        html.append("</section>");
    }

    private static void appendRecentSearches(StringBuilder html,
                                             List<BrowserStore.SearchEntry> recentSearches) {
        html.append("<section class=\"panel\"><div class=\"section-head\"><h3>Poslední hledání</h3></div>");
        int appended = 0;
        StringBuilder rows = new StringBuilder();
        for (BrowserStore.SearchEntry entry : recentSearches) {
            if (appended >= MAX_HOME_SEARCHES) break;
            String query = compactAndLimit(entry == null ? null : entry.query, 256, "");
            if (query.isEmpty()) continue;
            rows.append("<a class=\"search-row\" href=\"yamasearch://search?q=")
                .append(percentEncode(query)).append("\"><span class=\"glass\" aria-hidden=\"true\">⌕</span>")
                .append("<span class=\"query\" dir=\"auto\">").append(escapeHtml(query)).append("</span></a>");
            appended++;
        }
        if (appended == 0) {
            html.append("<div class=\"empty\">Až něco vyhledáte, můžete se k dotazu rychle vrátit z tohoto místa.</div>");
        } else {
            html.append("<div class=\"searches\">").append(rows).append("</div>");
        }
        html.append("</section>");
    }

    private static void appendStats(StringBuilder html, int favoriteCount, int historyCount) {
        html.append("<section class=\"panel\"><div class=\"section-head\"><h3>Váš profil</h3>")
            .append("<a class=\"all\" href=\"yamasearch://profile\">Nastavit</a></div><div class=\"stats\">")
            .append("<a class=\"stat\" href=\"yamasearch://favorites\"><strong>")
            .append(Math.max(0, favoriteCount)).append("</strong><span>oblíbených stránek</span></a>")
            .append("<a class=\"stat\" href=\"yamasearch://history\"><strong>")
            .append(Math.max(0, historyCount)).append("</strong><span>položek historie</span></a>")
            .append("</div></section>");
    }

    private static String safeWebUrl(String raw) {
        if (raw == null) return "";
        String value = raw.trim();
        if (value.isEmpty() || value.length() > 4096) return "";
        for (int index = 0; index < value.length(); index++) {
            if (Character.isISOControl(value.charAt(index))) return "";
        }
        return MobileNavigation.isWebUrl(value) ? value : "";
    }

    private static String hostOf(String safeUrl) {
        try {
            String host = new URL(safeUrl).getHost();
            if (host == null) return "";
            return host.toLowerCase(Locale.ROOT).replaceFirst("^www\\.", "");
        } catch (Exception ignored) {
            return "";
        }
    }

    private static String safePngFavicon(String raw) {
        if (raw == null) return "";
        String value = raw.trim();
        if (value.isEmpty() || value.length() > MAX_FAVICON_BASE64_CHARS
            || value.length() % 4 != 0 || !value.startsWith("iVBORw0KGgo")) return "";
        return value.matches("[A-Za-z0-9+/]*={0,2}") ? value : "";
    }

    private static String initialOf(String raw) {
        String value = compactAndLimit(raw, 80, "Y");
        int end = value.offsetByCodePoints(0, 1);
        return value.substring(0, end).toUpperCase(Locale.ROOT);
    }

    private static String compactAndLimit(String raw, int maxCodePoints, String fallback) {
        if (raw == null) return fallback;
        String value = raw.trim().replaceAll("\\s+", " ");
        if (value.isEmpty()) return fallback;
        if (value.codePointCount(0, value.length()) > maxCodePoints)
            value = value.substring(0, value.offsetByCodePoints(0, maxCodePoints)).trim();
        return value.isEmpty() ? fallback : value;
    }

    private static String escapeHtml(String raw) {
        if (raw == null || raw.isEmpty()) return "";
        StringBuilder escaped = new StringBuilder(raw.length() + 16);
        for (int index = 0; index < raw.length(); index++) {
            switch (raw.charAt(index)) {
                case '&': escaped.append("&amp;"); break;
                case '<': escaped.append("&lt;"); break;
                case '>': escaped.append("&gt;"); break;
                case '"': escaped.append("&quot;"); break;
                case '\'': escaped.append("&#39;"); break;
                default: escaped.append(raw.charAt(index));
            }
        }
        return escaped.toString();
    }

    private static String percentEncode(String raw) {
        byte[] bytes = raw.getBytes(StandardCharsets.UTF_8);
        StringBuilder encoded = new StringBuilder(bytes.length * 2);
        for (byte item : bytes) {
            int value = item & 0xff;
            if ((value >= 'a' && value <= 'z') || (value >= 'A' && value <= 'Z')
                || (value >= '0' && value <= '9') || value == '-' || value == '_'
                || value == '.' || value == '~') {
                encoded.append((char) value);
            } else {
                encoded.append('%').append(HEX[value >>> 4]).append(HEX[value & 0x0f]);
            }
        }
        return encoded.toString();
    }
}
