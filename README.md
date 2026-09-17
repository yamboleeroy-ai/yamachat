# Yamachat Web

Webový klient portovaný z Yamachat Windows Portable 1.0.69. Hosting: GitHub Pages na yamachat.eu. Data, přihlášení, Storage a Realtime používají stávající Supabase projekt.

Obsah: komunity, textové a soukromé zprávy, přílohy, přátelé, uživatelské profily, statusy, rank/XP, role, správa serverů, hlasové kanály WebRTC, RNNoise, soundboard a sdílení obrazovky. Zachován desktopový motiv včetně sjednocených oken.

Webové doplnění: PWA manifest a ikony, instalace přes prohlížeč, systémová oznámení přes service worker po výslovném povolení, přechod na příslušnou zprávu, počet nepřečtených zpráv v názvu a podporovaném app badge, ochrana před nechtěným zavřením při hovoru, screen wake lock při aktivním hlasu. Service worker ukládá pouze statické soubory aplikace, nikoli Supabase data či relace. Nová verze se nenačítá automaticky během hovoru.

Omezení: aplikace nemá Windows tray, globální klávesové zkratky, autostart ani Electron výběr zdroje zvuku. Hlas a oznámení vyžadují otevřenou aplikaci. Web Push při zavřené aplikaci není součástí této verze. Sdílení systémového zvuku a možnosti mobilního hlasu závisí na prohlížeči. Pro zprávy a hlas je potřeba internet.

Supabase Auth: URL https://yamachat.eu/ musí být povolena v Authentication / URL Configuration (Site URL a Redirect URLs) pro e-mailové ověření a Discord propojení. Stávající Auth konfigurace nebyla měněna. Discord vyžaduje aktivní provider a Manual Linking. Žádná databázová migrace nebyla provedena.

Validace: syntaktická kontrola všech 15 klientských skriptů i service workeru, kontrola manifestu a statických souborů, HTTP 200 pro vstupní HTML, worker, manifest, ikony i hlasové assety; read-only dotaz na existující Supabase projekt. Živý přihlášený chat, hovor mezi dvěma uživateli, upload a Discord flow nebyly ověřeny.
