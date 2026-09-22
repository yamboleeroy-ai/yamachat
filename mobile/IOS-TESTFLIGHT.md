# Yamachat iOS → TestFlight

iOS je teď hlavní mobilní priorita. Projekt používá bundle ID:

`eu.yamachat.app`

## Co musí být jednou připravené u Apple

1. Aktivní **Apple Developer Program**.
2. V **Certificates, Identifiers & Profiles** vytvořit App ID / Identifier pro `eu.yamachat.app`.
3. V **App Store Connect → Apps** vytvořit novou aplikaci Yamachat se stejným bundle ID.
4. V **App Store Connect → Users and Access → Integrations** zpřístupnit App Store Connect API a vytvořit **Team API key**.
5. Klíč musí mít oprávnění umožňující nahrávání buildů a cloud signing/provisioning. Pokud Apple tým používá omezení pro cloud-managed certificates, musí je Account Holder/Admin povolit.

## GitHub Secrets

V repozitáři otevři:

**Settings → Secrets and variables → Actions → New repository secret**

a vytvoř:

- `APPLE_TEAM_ID` — 10znakové Apple Team ID.
- `APP_STORE_CONNECT_KEY_ID` — Key ID vytvořeného API klíče.
- `APP_STORE_CONNECT_ISSUER_ID` — Issuer ID z App Store Connect.
- `APP_STORE_CONNECT_API_KEY_BASE64` — obsah souboru `AuthKey_XXXX.p8` převedený do Base64.

Soubor `.p8` ani jiné Apple přihlašovací údaje nikdy necommituj do GitHubu.

### Base64 klíče

Na macOS:

```bash
base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy
```

Na Windows PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("AuthKey_XXXXXXXXXX.p8")) | Set-Clipboard
```

Výsledek vlož jako hodnotu secretu `APP_STORE_CONNECT_API_KEY_BASE64`.

## První TestFlight build

Po přidání secretů:

1. GitHub → **Actions**.
2. Otevři **Yamachat iOS TestFlight**.
3. Klikni **Run workflow**.
4. Zadej například verzi `1.0.0`.
5. Workflow vytvoří podepsaný Release archive a nahraje ho do App Store Connect.
6. Po zpracování se build objeví v **App Store Connect → Yamachat → TestFlight**.

Build number se bere z čísla GitHub Actions běhu, takže se při každém buildu automaticky zvýší.

## Instalace na tvůj iPhone

Jakmile se build objeví v TestFlight:

1. Nainstaluj z App Storu aplikaci **TestFlight**.
2. V App Store Connect přidej svůj Apple účet jako interního testera, nebo vytvoř veřejný TestFlight odkaz.
3. Otevři pozvánku na iPhonu.
4. Yamachat se nainstaluje jako normální iOS aplikace.

## Co budeme testovat jako první

- přihlášení přes Supabase,
- mobilní navigaci,
- textový chat,
- odesílání obrázků/souborů,
- mikrofon a voice v otevřené aplikaci,
- chování po přepnutí do jiné aplikace a po zamknutí telefonu.

Background voice při dlouhém zamknutí telefonu může vyžadovat další nativní audio-session/CallKit vrstvu. Současný projekt už deklaruje iOS background audio, ale to samo o sobě negarantuje nepřerušený WebRTC hovor.

## Důležité k App Store Connect

Apple musí před prvním uploadem znát app record se stejným bundle ID. TestFlight buildy jsou dostupné 90 dní. Externí testeři mohou vyžadovat Beta App Review.
