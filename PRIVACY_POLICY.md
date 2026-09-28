# Ochrana osobních údajů Yamachat

**Verze:** 1.0  
**Účinnost od:** 28. září 2026  
**Správce:** Lukáš Hubáček  
**Kontakt:** hubygo@gmail.com  
**Oficiální doména:** https://yamachat.eu

## 1. Účel tohoto dokumentu

Tyto zásady vysvětlují, jak Yamachat při provozu oficiální služby a oficiálních
klientů zpracovává osobní údaje.

Zásady vycházejí zejména z nařízení Evropského parlamentu a Rady (EU) 2016/679
(GDPR) a z použitelného českého a evropského práva.

Správcem osobních údajů zpracovávaných pro provoz Yamachatu je Lukáš Hubáček,
kontakt hubygo@gmail.com.

## 2. Jaké údaje může Yamachat zpracovávat

Podle použitých funkcí může Yamachat zpracovávat zejména tyto kategorie údajů:

### Účet a profil

- interní identifikátor uživatele;
- e-mail použitý pro přihlášení nebo obnovu účtu;
- uživatelské jméno a zobrazované jméno;
- profilový obrázek, profilové pozadí a další dobrovolné profilové údaje;
- stav dostupnosti a nastavení účtu;
- informace o přihlášení a propojené identitě, pokud je tato možnost použita.

### Komunity a sociální vazby

- členství v komunitách;
- role, oprávnění, timeouty a bany;
- přátelství a blokace;
- kanály, členství v přímých konverzacích a související stavové údaje.

### Zprávy a uživatelský obsah

- textové zprávy a soukromé zprávy;
- reakce, zmínky, stav přečtení a nepřečtené položky;
- přílohy a další nahrané soubory;
- komunitní obrázky, avatary, emoji a soundboard obsah;
- metadata potřebná k přiřazení obsahu ke správnému účtu, komunitě nebo
  konverzaci.

### Voice a streamování

Při používání realtime komunikace mohou být zpracovávány provozní údaje jako:

- identifikátor voice kanálu a uživatele;
- identifikátor relace;
- stav připojení, mute/deafen a speaking stav;
- presence a časové údaje o relaci;
- WebRTC signalizační údaje potřebné k navázání spojení;
- síťové údaje potřebné pro přímé nebo relay spojení.

Yamachat v běžném provozu nezavádí vlastní trvalé nahrávání obsahu standardní
voice nebo stream relace. Samotný realtime audio/video přenos ale může
procházet přes WebRTC a TURN infrastrukturu a příslušné síťové poskytovatele.

### Oznámení a zařízení

- push subscription, endpoint nebo token zařízení;
- typ transportu oznámení;
- nastavení oznámení pro uživatele, kanály nebo komunity;
- technické údaje nutné k doručení oznámení.

### Technické a bezpečnostní údaje

V nezbytném rozsahu mohou Yamachat a jeho poskytovatelé infrastruktury
zpracovávat také:

- IP adresu a síťová metadata;
- typ prohlížeče, operačního systému nebo platformy;
- technické logy, časové údaje, chybové a bezpečnostní záznamy;
- informace nutné pro ochranu proti zneužití, řešení incidentů a provoz
  aktualizací.

### Kontakt s provozovatelem

Pokud uživatel odešle zpětnou vazbu nebo kontaktuje provozovatele, zpracovává
se obsah zprávy, identifikace odesílatele a údaje potřebné k vyřízení
požadavku.

## 3. Proč údaje zpracováváme a na jakém právním základě

Osobní údaje jsou zpracovávány pouze pro konkrétní účely a na odpovídajícím
právním základě.

### Plnění smlouvy a poskytování požadované služby

Zpracování je nezbytné zejména pro:

- vytvoření a správu účtu;
- přihlášení a obnovu účtu;
- doručování zpráv a příloh;
- správu komunit, členství, rolí a oprávnění;
- voice, stream a realtime funkce;
- synchronizaci účtu mezi podporovanými platformami;
- základní nastavení, oznámení a funkce, které si uživatel vyžádá.

### Oprávněné zájmy

V přiměřeném rozsahu může být zpracování založeno na oprávněném zájmu
provozovatele na:

- zabezpečení služby a účtů;
- prevenci podvodů, spamu, útoků a jiného zneužití;
- diagnostice chyb a zachování stability služby;
- ochraně práv provozovatele a ostatních uživatelů;
- vyřizování hlášení a přiměřené moderaci.

Při použití oprávněného zájmu je nutné zohlednit práva a svobody dotčených
osob.

### Právní povinnost

Některé údaje mohou být zpracovány, pokud je to nutné pro splnění právní
povinnosti, závazného rozhodnutí oprávněného orgánu nebo pro ochranu a
uplatnění právních nároků.

### Souhlas

Pokud je konkrétní zpracování založeno na souhlasu, je uživatel předem
informován o jeho účelu a může souhlas odvolat. Odvolání souhlasu nemá vliv na
zákonnost zpracování provedeného před jeho odvoláním.

Systémová oprávnění zařízení, například přístup k mikrofonu, kameře nebo
oznámením, jsou současně řízena operačním systémem nebo prohlížečem a lze je
změnit v nastavení zařízení.

## 4. Externí poskytovatelé a příjemci

Yamachat používá podle konkrétní funkce externí infrastrukturu. Aktuálně
ověřené integrace projektu zahrnují:

- **Supabase** — autentizace, PostgreSQL databáze, Realtime, Storage a Edge
  Functions;
- **Cloudflare Realtime TURN** — relay infrastruktura pro WebRTC;
- **Metered TURN** — doplňková TURN/STUN relay infrastruktura;
- **Google Firebase Cloud Messaging (FCM)** — doručování Android push
  oznámení;
- **Microsoft Windows Push Notification Services (WNS)** — doručování Windows
  push oznámení;
- **Microsoft Azure Speech** — volitelné text-to-speech zpracování u
  podporovaných hlasových funkcí, pokud je funkce nakonfigurována a použita;
- **Web Push / push infrastruktura prohlížeče nebo platformy** — doručování PWA
  a webových oznámení;
- **e-mailová infrastruktura** — doručování autentizačních a obnovovacích
  e-mailů; konkrétní poskytovatel může záviset na aktuální konfiguraci.

Tito poskytovatelé mohou podle role vystupovat jako zpracovatelé, samostatní
správci nebo poskytovatelé přenosové infrastruktury podle jejich vlastních
podmínek a konkrétního způsobu použití.

Yamachat osobní údaje neprodává.

## 5. Předávání údajů mimo Evropský hospodářský prostor

Někteří poskytovatelé infrastruktury působí globálně. Podle konfigurace,
umístění služby a síťového směrování tak může dojít ke zpracování údajů mimo
Evropský hospodářský prostor.

Pokud GDPR pro takové předání vyžaduje zvláštní právní mechanismus, má být
předání založeno na mechanismu použitelném pro daného poskytovatele a službu,
například na rozhodnutí o odpovídající ochraně nebo na smluvních zárukách.

Uživatel může na adrese hubygo@gmail.com požádat o bližší informace k
používanému poskytovateli a typu předání vztahujícímu se k jeho požadavku.

## 6. Jak dlouho údaje uchováváme

Údaje nejsou zamýšleny k uchovávání déle, než je nezbytné pro účel, pro který
byly získány. Konkrétní doba se může lišit podle typu údaje:

- **účet a profil** — po dobu existence účtu a dále jen po dobu nezbytnou k
  dokončení zrušení účtu, zabezpečení služby, řešení sporu nebo splnění právní
  povinnosti;
- **zprávy, přílohy a komunitní obsah** — dokud nejsou odstraněny uživatelem,
  oprávněným moderátorem, zánikem příslušné konverzace/komunity/účtu nebo jiným
  oprávněným postupem; technické zálohy mohou být odstraněny s prodlevou;
- **voice presence a signalizační údaje** — jsou určeny pro realtime provoz a
  uchovávají se jen po dobu nezbytnou pro relaci, obnovu spojení, bezpečnost a
  technický provoz;
- **push tokeny a subscription údaje** — do odvolání oprávnění, odhlášení,
  zneplatnění tokenu/subscription nebo odstranění souvisejícího účtu či
  zařízení;
- **zpětná vazba a podpora** — po dobu potřebnou k vyřízení a přiměřenou dobu
  pro návaznost, bezpečnost nebo ochranu práv;
- **bezpečnostní a technické logy** — po dobu přiměřenou jejich účelu a podle
  konfigurace příslušné infrastruktury.

Pokud právní předpis vyžaduje delší uchování určitého údaje, použije se
příslušná zákonná doba.

## 7. Lokální úložiště, PWA a podobné technologie

Yamachat může používat lokální úložiště prohlížeče nebo aplikace, cache,
service worker a obdobné technické mechanismy potřebné například pro:

- zachování relace a přihlášení;
- uložení místních uživatelských nastavení;
- PWA a offline technickou funkčnost;
- bezpečný a plynulý provoz klienta.

Aktuální projekt neobsahuje vlastní reklamní systém ani samostatný
behaviorální reklamní tracker. Pokud by byla v budoucnu přidána analytická,
reklamní nebo obdobná technologie vyžadující souhlas nebo zvláštní informaci,
musí být tyto zásady a příslušné uživatelské rozhraní před jejím použitím
odpovídajícím způsobem upraveny.

## 8. Zabezpečení

Yamachat používá technická a organizační opatření odpovídající povaze služby,
zejména autentizovaný přístup, oprávnění k datům, bezpečnostní mechanismy
použitých poskytovatelů a šifrovaný síťový přenos tam, kde jej daný protokol
nebo poskytovatel podporuje.

Žádný internetový systém ale nelze označit za absolutně bezpečný. Uživatel by
měl chránit své přihlašovací údaje, používat zabezpečené zařízení a neodesílat
obsah, jehož případné zpřístupnění by pro něj znamenalo nepřiměřené riziko.

## 9. Práva uživatele

Za podmínek stanovených GDPR a dalšími právními předpisy může mít uživatel
zejména právo:

- získat informace o zpracování a přístup ke svým osobním údajům;
- požadovat opravu nepřesných údajů;
- požadovat výmaz osobních údajů;
- požadovat omezení zpracování;
- vznést námitku proti zpracování založenému na oprávněném zájmu;
- získat údaje v přenositelném formátu, pokud jsou splněny zákonné podmínky;
- odvolat souhlas, pokud je zpracování založeno na souhlasu;
- podat stížnost u příslušného dozorového úřadu.

Žádost lze poslat na **hubygo@gmail.com**. Před vyřízením žádosti může být
nutné přiměřeně ověřit totožnost žadatele, aby údaje nebyly zpřístupněny nebo
smazány neoprávněné osobě.

V České republice je dozorovým orgánem pro ochranu osobních údajů Úřad pro
ochranu osobních údajů (ÚOOÚ).

## 10. Děti a souhlas

Pokud je určité zpracování založeno na souhlasu dítěte v souvislosti s nabídkou
služby informační společnosti, použije se věková hranice a pravidla podle
práva vztahujícího se na daného uživatele.

V České republice je hranice pro samostatný souhlas dítěte v této souvislosti
15 let. Pokud je podle použitelného práva vyžadováno oprávnění zákonného
zástupce, musí být před takovým zpracováním zajištěno.

## 11. Automatizované rozhodování

Aktuální Yamachat není navržen tak, aby vůči běžnému uživateli přijímal pouze
automatizovaným zpracováním rozhodnutí, která by měla právní účinky nebo jej
obdobně významně ovlivňovala.

Pokud by se tato skutečnost změnila, bude uživatel před použitím takové funkce
informován způsobem vyžadovaným právními předpisy.

## 12. Budoucí placené služby

Aktuální zásady nepředpokládají, že by Yamachat sám ukládal údaje platební
karty.

Pokud budou v budoucnu zavedeny placené funkce, může být zpracování plateb
svěřeno externímu poskytovateli plateb. Před spuštěním takové funkce budou
tyto zásady doplněny o konkrétní kategorie údajů, účely, právní základ,
příjemce a dobu uchování, pokud to bude pro daný způsob plateb nezbytné.

## 13. Změny těchto zásad

Tyto zásady mohou být aktualizovány při změně funkcí, poskytovatelů,
technického řešení nebo právních požadavků.

Aktuální verze bude označena číslem a datem účinnosti. Pokud bude změna
podstatná a právní předpis vyžaduje oznámení, bude uživatel informován
přiměřeným způsobem.

## 14. Kontakt

Dotazy k ochraně osobních údajů a žádosti o výkon práv lze poslat na:

**Lukáš Hubáček**  
**hubygo@gmail.com**  
**https://yamachat.eu**
