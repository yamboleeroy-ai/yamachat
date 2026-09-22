# Yamachat Web + Android — desktop 1.0.78

Jediným zdrojem aplikační logiky je neměnný snapshot v reference/desktop-1.0.78. Jeho SHA-256 se ověřuje při každém buildu. Původní desktopová aplikace není měněna. Webový adaptér přenáší i vzhled, branding, osobní barvy a vzhled serverových karet z desktopového obalu.

## Build

- Web: node scripts/build-web.mjs
- Kontroly: node scripts/check.mjs
- Mobil: cd mobile, npm ci, npm run prepare:web, npx cap add android (jen poprvé), npx cap sync android, node scripts/patch-native.mjs android, sestavit assembleDebug přes Gradle.
- GitHub Actions vytváří artifact Yamachat-Web a Yamachat-Android. APK se automaticky publikuje do download jen při push na main, nikoli z PR.

index.html je generovaný soubor. Úpravy patří do web/ nebo scripts/, nikdy do desktopového snapshotu. Pro novou desktopovou verzi se přidá nový snapshot s kontrolními součty a provede se vědomý přechod generátoru.

## Zachované funkce a ověření

Chat, servery, DM, profily, rank/XP, přátelé, role, nastavení a WebRTC vycházejí ze stejného klienta 1.0.78. Supabase URL, publishable key a databázové operace zůstávají stejné. Žádné migrace ani změny produkčních dat. Supabase knihovna je součástí webu i APK.

Mobil má vysouvací panely, touch vstup do hlasové místnosti, přístupné ovládání panelů, safe-area, vizuální viewport a dostupné hlasové ovládání při psaní. Android Back nejdřív zavírá panel nebo dialog.

Na přihlášení a v nastavení jsou Windows, Android a iOS s návody; právě používaná nativní platforma je skryta. iOS nabídka označuje dostupnou webovou instalaci, nikoli neexistující veřejný TestFlight odkaz. Běžný web nemůže spolehlivě poznat aplikaci nainstalovanou mimo prohlížeč.

Lokálně ověřeno: syntaxe webu i mobilního balíčku, otisky desktopu a shoda backendu; prohlížečové testy s izolovanými simulovanými daty při 1440×960, 1024×768, 768×1024, 390×844, 320×568 a 844×390. Přihlášení, nabídky instalace, otevření/zavření panelů, změna kanálu a dosažitelnost psaní.

## Omezení

Živý hovor dvou zařízení, skutečný login, upload, background audio a push po ukončení aplikace vyžadují ověření na reálném telefonu. Nativní lokální oznámení fungují pro zprávy přijaté běžícím klientem po povolení. Serverové FCM/APNs push a foreground call service nejsou implementované. Sdílení obrazovky závisí na platformě. Desktopové systémové funkce (tray, autostart, globální zkratky) nelze převést na web. APK z CI je testovací debug build; stabilní release podpis vyžaduje trvalý signing key.
