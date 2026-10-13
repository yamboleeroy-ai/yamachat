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

## DOKONČENÍ PRVNÍHO VEŘEJNÉHO ANDROID RELEASE (0.1.0 beta)

Release je již připravený v GitHub Actions, ale při pokusu o publikování dne 13. 10. 2026 se zastavil na **chybějícím samostatném podpisovém klíči**. Není dovoleno veřejně použít debug podpis nebo podpis Yamachatu.

Na vlastním počítači vytvoř JKS/PKCS12 klíč (JDK 17+). Neodesílej soubor, heslo ani base64 do chatu nebo veřejného repozitáře. Podepisovací klíč musí zůstat dlouhodobě uchovaný – při jeho ztrátě nepůjde navázat aktualizacemi mimo Google Play.

Příklad ve Windows PowerShellu:

```powershell
New-Item -ItemType Directory -Force "$HOME\Documents\YamaSearch-signing" | Out-Null
keytool -genkeypair -v -keystore "$HOME\Documents\YamaSearch-signing\YamaSearch-release.p12" -storetype PKCS12 -alias yamasearch -keyalg RSA -keysize 3072 -validity 10000 -dname "CN=YamaSearch, O=YamaSearch, C=CZ"
# Zvol silné heslo a uchovej ho bezpečně.
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\Documents\YamaSearch-signing\YamaSearch-release.p12")) | Set-Clipboard
```

V GitHub repozitáři otevři **Settings → Secrets and variables → Actions → New repository secret** a vlož:

- `YAMASEARCH_ANDROID_KEYSTORE_BASE64` – base64 obsah souboru .p12 z clipboardu.
- `YAMASEARCH_ANDROID_STORE_PASSWORD` – heslo úložiště.
- `YAMASEARCH_ANDROID_KEY_ALIAS` – přesně `yamasearch`.
- `YAMASEARCH_ANDROID_KEY_PASSWORD` – heslo soukromého klíče (u PKCS12 obvykle shodné s heslem úložiště).

Pozor: uvedený příkaz vytváří podepisovací identitu; **nevytvářej při každém vydání nový klíč**.

Poté spusť nebo opakuj existující workflow [Publish signed YamaSearch Android (separate app)](../../../.github/workflows/yamasearch-android-release.yml). Zadej verzi `0.1.0` a `versionCode=10000`, pokud to bude první vydání. Workflow sestaví release, ověří podpis a balíček, publikuje na Cloudflare R2, ověří dostupnost veřejného URL a **až potom** aktivuje Android tlačítko na webu.

Testovací debug APK nelze přímo přepsat produkční APK s jiným podpisem; uživatelé debug prototypu musí nejprve odinstalovat debug build (po záloze dat). Nezveřejňuj žádné heslo, .p12 ani base64 keystore v Issues, PR, Actions logs ani diskusích.
