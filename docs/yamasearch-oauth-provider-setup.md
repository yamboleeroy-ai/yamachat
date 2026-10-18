# YamaSearch – nastavení poskytovatelů přihlášení

Tento postup patří pouze k samostatnému projektu Supabase **YamaSearch** (`bdfrzupieygsutraxyjx`). Nepoužívat projekt Yamachat.

## Společná návratová adresa

Ve všech konzolích poskytovatelů použít přesně:

`https://bdfrzupieygsutraxyjx.supabase.co/auth/v1/callback`

Tajné klíče a client secrets patří pouze do konzole poskytovatele a do **Supabase Dashboard → Authentication → Providers**. Nikdy je nevkládat do `account-backend.json`, zdrojového kódu, GitHubu ani chatu. Desktop dostává jen veřejný publishable key.

## Návrat do desktopové aplikace

Do **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs** přidat omezený glob:

`http://127.0.0.1:*/yamasearch-auth/*/`

Supabase definuje jako oddělovače globu pouze `.` a `/`, takže první `*` pokrývá dynamický loopback port a druhá pouze náhodný nonce v jedné části cesty. Nepoužívat obecné `http://127.0.0.1/**`.

## Google

1. V Google Auth Platform vytvořit OAuth klienta typu **Web application** pro YamaSearch.
2. Jako Authorized redirect URI přidat společnou návratovou adresu výše.
3. Požadovat jen `openid email profile`; YamaSearch nežádá přístup k obsahu Gmailu.
4. V Supabase otevřít Google provider, vložit Client ID a Client Secret a provider zapnout.
5. Ověřit přihlášení, zrušení souhlasu, restart aplikace a obnovení Supabase relace.

Aktuální dokumentace: https://supabase.com/docs/guides/auth/social-login/auth-google

## Microsoft

1. V Microsoft Entra ID vytvořit novou App registration `YamaSearch`.
2. Zvolit podporu pracovních i osobních Microsoft účtů, pokud mají fungovat Outlook, Hotmail a Live.
3. Přidat Web redirect URI se společnou návratovou adresou.
4. Vytvořit client secret a bezpečně uložit jeho **Value**; nastavit připomínku před expirací.
5. V Supabase otevřít Azure provider, vložit Application (client) ID a secret. Tenant URL ponechat `https://login.microsoftonline.com/common`, pokud registrace podporuje pracovní i osobní účty.
6. YamaSearch požaduje scope `email`. U produkční registrace přidat doporučené claimy `email` a `xms_edov`, aby bylo možné ověřit původ e-mailu.

Aktuální dokumentace: https://supabase.com/docs/guides/auth/social-login/auth-azure

## Seznam.cz

1. U Seznamu zaregistrovat vlastní OAuth aplikaci YamaSearch a nastavit společnou návratovou adresu.
2. V Supabase vytvořit Custom OAuth2 provider s identifikátorem `custom:seznam`.
3. Vyplnit:
   - Authorization URL: `https://login.seznam.cz/api/v1/oauth/auth`
   - Token URL: `https://login.seznam.cz/api/v1/oauth/token`
   - UserInfo URL: `https://login.seznam.cz/api/v1/user`
   - Scope: `identity`
4. Vložit Seznam Client ID a Client Secret přímo do Supabase a provider zapnout. PKCE ponechat zapnuté.
5. Teprve po úspěšném reálném testu změnit u `custom:seznam` v `account-backend.json` hodnoty `enabled` a `serverVerified` na `true`.

Aktuální dokumentace: https://vyvojari.seznam.cz/oauth/doc a https://supabase.com/docs/guides/auth/custom-oauth-providers

## Apple a další služby

Apple lze přidat až po vytvoření odpovídajících identifikátorů v Apple Developer účtu a po ověření obnovy client secret. Centrum.cz a Atlas.cz se nezobrazují, protože pro ně nebyla nalezena veřejná podporovaná integrace OAuth/OIDC pro tento účel. Neověřený poskytovatel se v YamaSearch nesmí zobrazit.

## Aktivace v klientu

Google, Microsoft a Apple jsou v klientském veřejném seznamu povolené, ale YamaSearch je zobrazí jen tehdy, když je Supabase skutečně hlásí jako aktivní. Seznam vyžaduje navíc explicitní `serverVerified: true`, protože vlastní poskytovatele endpoint `/auth/v1/settings` veřejně neoznamuje. Propojování více identit zůstává `manualIdentityLinkingEnabled: false`, dokud nebude zapnuté v Supabase a otestované včetně konfliktů a bezpečného odpojení po čerstvém ověření.
