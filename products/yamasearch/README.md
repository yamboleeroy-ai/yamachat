# YamaSearch — Windows MVP

Samostatný základ prohlížeče pro Windows postavený na WebView2/Chromium. Výchozí vzhled je tmavý; barevná paleta vychází z dodaného modro-cyanového loga, ale rozhraní zůstává střídmé.

`Assets/` obsahuje původní plné logo, beze změny odvozený slovní znak, technické varianty symbolu v rozměrech 16 až 512 px a `YamaSearch.ico` pro Windows.

## Co tento MVP obsahuje

- adresní řádek (URL i vyhledávání Google, Bing a DuckDuckGo), navigace a otevření odkazů do nové karty;
- karty, nové karty, zavření pravým kliknutím, Ctrl+T a Ctrl+L;
- bookmarky uložené lokálně;
- download notifikace a indikaci načítání;
- **YamaBlock**: výchozí režim Standard, přepínání Standard → Přísný → Vypnuto a per-tab počet zablokovaných requestů;
- tmavý režim jako výchozí a přepínání na světlý režim tlačítkem ☾; volba se uloží pro další spuštění;
- lokální perzistenci nastavení v `%LOCALAPPDATA%\YamaSearch\settings.json`.

## Spuštění

Vyžaduje .NET 8 SDK, Windows a nainstalovaný WebView2 Runtime. Ve složce tohoto projektu spusťte:

```powershell
dotnet restore
dotnet run
```

## Vydávání a aktualizace

`scripts/build-release.ps1 -Version X.Y.Z` vytvoří oba nezávislé artefakty: `YamaSearch-Portable-X.Y.Z.zip` a `YamaSearch-Setup-X.Y.Z.exe`, plus `latest.json` a `SHA256SUMS.txt`. Installer používá vlastní Windows identitu a instaluje se do `%LOCALAPPDATA%\Programs\YamaSearch`; nikdy nesdílí cestu ani identitu s YamaHelp.

Při spuštění aplikace se bez blokování prohlížení ověří manifest `https://updates.yamachat.eu/yamasearch/latest.json`. Pokud je dostupná novější verze, uživatel si zvolí Installer nebo Portable. Odkaz se otevře jen pro HTTPS host `updates.yamachat.eu`.

Pro produkční vydání používá Yamachat ručně spouštěný GitHub Actions workflow `Publish YamaSearch for Windows`. Ten publikuje pouze do Cloudflare R2 prefixu `yamasearch/`; nevytváří ani nemění artefakty YamaHelp nebo Yamachatu.
