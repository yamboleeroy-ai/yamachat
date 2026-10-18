# Oddělený backend účtu YamaSearch

Tento adresář je samostatný deployment root. Migrace se nesmí spouštět z kořenového adresáře `supabase`, který patří Yamachatu.

Aktuální samostatný projekt YamaSearch má ref `bdfrzupieygsutraxyjx` v organizaci `Yampowa` (EU Central). Projekt byl 2026-10-18 ověřen jako `ACTIVE_HEALTHY`. Veřejný klientský publishable key je uložen v `../account-backend.json`; žádný service-role klíč ani OAuth tajemství v repozitáři nejsou.

## Bezpečný postup nasazení

1. Samostatný projekt Supabase s názvem YamaSearch je založený; původní Yamachat projekt zůstal beze změny.
2. Do necommitovaného souboru `project-ref.txt` patří pouze jeho dvacetiznakový project ref.
3. Před každou další migrací nejdřív spustit `deploy.ps1 -ProjectRef <ref> -DryRun`.
4. Teprve po kontrole cíle spustit tentýž příkaz bez `-DryRun`.
5. Po migraci spustit security a performance advisors a RLS testy.

Transakční smoke test je v `tests/account_sync_smoke.sql`; vždy končí `rollback`, takže po sobě nezanechá testovací účty ani data.

Synchronizace je opt-in: všechny kategorie jsou ve výchozím stavu vypnuté. Přímé zápisy klienta do synchronizačních tabulek jsou zakázané; používají se pouze hlídané RPC funkce s kontrolou vlastníka, revize a kvót. Smazané záznamy mají prázdný payload a aktivní `pg_cron` úloha je po 90 dnech odstraní.

Skript výslovně odmítá známý project ref Yamachatu.

## Přesměrování přihlášení

Do Auth redirect allow listu patří loopback callback YamaSearch s dynamickým portem a náhodnou cestou. Podle aktuálních pravidel Supabase (`*` odpovídá znakům kromě `.` a `/`) se používá omezený glob:

`http://127.0.0.1:*/yamasearch-auth/*/`

Ten odpovídá klientskému tvaru `http://127.0.0.1:<port>/yamasearch-auth/<nonce>/`, ale nepovoluje jiné hostitele ani jiné cesty. Po výslovném potvrzení uživatelem byl tento jediný glob 2026-10-18 uložen do Auth allowlistu projektu YamaSearch.

OAuth tajné klíče se zadávají pouze v dashboardu Supabase. Desktopový klient dostane jen URL projektu a veřejný publishable key v souboru `account-backend.json` vedle aplikace.
