# YamaSearch Android – testovací vývojová větev

Tento projekt je **samostatný nativní Android klient**, nikoliv převlečená webová stránka ani změna Windows WPF aplikace. Používá systémový Android WebView (Chromium), vlastní panely, lokální historii a oblíbené, systémový DownloadManager a originální symbol YamaSearch z adresáře `../Assets`.

## Sestavení

- Android Studio / Android SDK s platformou Android 35 a build-tools 35.0.0.
- JDK 17 a Gradle 8.9 (Gradle není v repozitáři zabalen ve wrapperu).
- Z adresáře `products/yamasearch/android` spusť `gradle :app:assembleDebug`.
- Výsledek: `app/build/outputs/apk/debug/app-debug.apk`; je určen výhradně pro testování.
- GitHub Actions workflow `yamasearch-android-preview.yml` sestaví debug APK a ověří identifikátor balíčku. Automaticky nic **nepublikuje** na Cloudflare ani na web.
- `app/build.gradle` obsahuje `eu.yamachat.yamasearch`, `versionCode=1`, `versionName=0.1.0-preview`, `minSdk=29`; před vydáním ověřte a uzamkněte identitu a dlouhodobý podpis.

## Funkce aktuálního prototypu

- Nativní Android obrazovka, panel adresy/vyhledávání, více karet, zpět/vpřed/obnovit.
- Lokální historie (max. 500 položek), oblíbené a možnost smazat historii.
- Android System WebView s JavaScriptem, DOM úložištěm, bezpečným prohlížením a blokováním nezabezpečeného mixed content.
- Základ YamaBlocku: blokování části reklamních domén (standard) a trackerů (přísný). NENÍ plně ekvivalentní desktopovému YamaBlocku.
- HTTPS stránky mohou požádat o mikrofon a kameru; používá se potvrzení webu a systémové oprávnění Androidu.
- Nahrávání souborů z výběru systému, stahování běžných HTTP(S) souborů do Android Downloads.
- Soukromý proces s odděleným WebView profilem a vypnutými cookies, bez ukládání historie; smazání cookies/WebStorage při vytvoření/ukončení. Stažené soubory však zůstávají na zařízení.

## Známá omezení / nevydávat bez dořešení

- Neproběhlo ověření na skutečných Android telefonech, ani bezpečnostní audit (včetně vyčištění všech stop soukromého procesu).
- Chybí plnohodnotná kompatibilita desktopového YamaBlocku/YamaShieldu, správce hesel, pokročilá nastavení, favikony, historie stahování uvnitř aplikace, obnovení relace a přesuny karet.
- Notifikace uzavřených stránek / Web Push nejsou implementované a nelze je vydávat za funkční.
- Blob URL a některé chráněné streamy nepodporuje standardní Android DownloadManager.
- U přesměrování přístupu ke kameře, mikrofonu, přihlašování, videu, souborům a fullscreen je potřeba skutečné testování napříč weby a zařízeními.
- První testovací debug APK je podepsaná pouze standardním **debug** klíčem. Pro aktualizovatelné veřejné APK je nutný trvalý zabezpečený release klíč a bezpečný CI proces.
- Před uvedením na web musí fungovat veřejná HTTPS adresa, test instalace a aktualizace bez ztráty dat. **Nesmí se nahradit Portable odkaz, dokud APK neexistuje a není ověřena.**
- Současný Windows Portable artefakt, manifest a aktualizace zachovat; na webu jej lze později jen přestat zobrazovat.

Žádné automatické merge do `main`, vydání release ani upload na R2 bez výslovného schválení majitele.
