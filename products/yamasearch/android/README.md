# YamaSearch Android – testovací vývojová větev

Tento projekt je **samostatný nativní Android klient**, nikoliv převlečená webová stránka ani změna Windows WPF aplikace. Používá systémový Android WebView (Chromium), vlastní panely, lokální historii a oblíbené, systémový DownloadManager a originální symbol YamaSearch z adresáře `../Assets`.

## Sestavení

- Android Studio / Android SDK s platformou Android 35 a build-tools 35.0.0.
- JDK 17 a Gradle 8.9 (Gradle není v repozitáři zabalen ve wrapperu).
- Z adresáře `products/yamasearch/android` spusť `gradle :app:assembleDebug`.
- Výsledek: `app/build/outputs/apk/debug/app-debug.apk`; je určen výhradně pro testování a používá oddělený balíček `eu.yamachat.yamasearch.mobile.preview`, takže může být nainstalovaný vedle veřejné aplikace.
- GitHub Actions workflow `yamasearch-android-preview.yml` sestaví debug APK a ověří identifikátor balíčku. Automaticky nic **nepublikuje** na Cloudflare ani na web.
- Veřejný balíček od verze 0.1.1 používá `eu.yamachat.yamasearch.mobile`, Android 9+ (`minSdk=28`) a nový dlouhodobý produkční podpis. Debug preview má vlastní příponu `.preview` a nesmí se publikovat jako aktualizace.

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
- Testovací debug APK je podepsaná standardním **debug** klíčem a používá jiné ID balíčku. Veřejné APK od 0.1.1 musí vždy zachovat nový produkční certifikát; release workflow jeho SHA-256 kontroluje a dovolí pouze jednorázový přechod ze staré identity 0.1.0.
- Před uvedením na web musí fungovat veřejná HTTPS adresa, test instalace a aktualizace bez ztráty dat. **Nesmí se nahradit Portable odkaz, dokud APK neexistuje a není ověřena.**
- Současný Windows Portable artefakt, manifest a aktualizace zachovat; na webu jej lze později jen přestat zobrazovat.

Žádné automatické merge do `main`, vydání release ani upload na R2 bez výslovného schválení majitele.

## Produkční Android release

První veřejná beta 0.1.0 používala balíček `eu.yamachat.yamasearch`, ale heslo jejího podpisového klíče se nedochovalo. Android proto neumožňuje vytvořit kompatibilní aktualizaci. Verze 0.1.1 přechází jednorázově na novou trvalou identitu `eu.yamachat.yamasearch.mobile` a nový dlouhodobý klíč. Nainstaluje se vedle 0.1.0; data staré aplikace se automaticky nepřenášejí. Každá verze po 0.1.1 musí zachovat tuto novou identitu i certifikát a použít vyšší `versionCode`.

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
- `YAMASEARCH_ANDROID_KEY_ALIAS` – přesně alias dlouhodobého klíče (`yamasearch-mobile` pro identitu od 0.1.1).
- `YAMASEARCH_ANDROID_KEY_PASSWORD` – heslo soukromého klíče (u PKCS12 obvykle shodné s heslem úložiště).

Pozor: uvedený příkaz vytváří podepisovací identitu; **nevytvářej při každém vydání nový klíč**.

Poté spusť existující workflow [Publish signed YamaSearch Android (separate app)](../../../.github/workflows/yamasearch-android-release.yml) s novou verzí a vždy vyšším `versionCode`. Workflow sestaví release, ověří podpis i návaznost na veřejné APK, publikuje na Cloudflare R2, ověří dostupnost veřejného URL a **až potom** aktivuje Android tlačítko na webu.

Stará veřejná 0.1.0 i staré preview s ID `eu.yamachat.yamasearch` zůstávají samostatnou aplikací. Po případné ruční záloze je lze odinstalovat; 0.1.1 se díky novému ID nainstaluje bez podpisového konfliktu. Nové preview používá `.mobile.preview`. Nezveřejňuj žádné heslo, .p12 ani base64 keystore v Issues, PR, Actions logs ani diskusích.
