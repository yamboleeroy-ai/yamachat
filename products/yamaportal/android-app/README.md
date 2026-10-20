# Yamaportal pro Android

Samostatný Capacitor balíček pro Android. Používá shodné stránky a funkce z `../preview/dist`; Yamachat ani jeho vlastní mobilní projekt se neupravuje.

## Vývoj a sestavení

```powershell
npm install
npm run native:init
npm run android:debug
```

Výstupní zkušební APK vznikne v `android/app/build/outputs/apk/debug/app-debug.apk`. Pro instalaci na Android je nutné Android SDK a JDK 17.

Před testem společného přihlášení je potřeba povolit v Yamaportal Supabase Auth přesměrování `eu.yamaportal.app://auth-callback`. Google/Microsoft/ostatní poskytovatelé nadále používají callback centrální Supabase projektu. Relace Supabase se ukládá přes Android Keystore šifrované úložiště; heslo se v aplikaci neukládá. PKCE ověřovací kód se po návratu do aplikace vymění standardním Supabase SDK.

## Test propojení aplikací

1. Nainstaluj Yamaportál a Android YamaSearch do stejného zařízení.
2. V Portalu otevři Aplikace → YamaSearch → Otevřít YamaSearch. Tlačítko se zobrazí jako dostupné pouze po zjištění instalovaného balíčku.
3. V YamaSearch otevři nabídku `⋮` → `Zpět do Yamaportalu`. Akce se nabídne pouze tehdy, když je Portal nainstalovaný.
4. Ověř, že přepnutí zachová stav obou aplikací. Portal nepředává hesla ani tokeny. Android YamaSearch má nyní místní profil prohlížeče; společné přihlášení Yamaportalu v jeho Android verzi ještě není implementováno.

Yamachat se na Androidu dál otevírá jako webový modul Portalu. YamaSearch se spouští jako samostatná aplikace, protože je samostatným prohlížečem s vlastním jádrem.

Toto nastavení zatím neznamená zveřejněné nebo podepsané produkční APK. Vydání pro Play Store vyžaduje vlastní klíč pro podepisování a ověření na fyzickém zařízení.
