# YamaSearch – iPhone/iPad PWA (vývojový náhled)

Tento samostatný produkt je **instalovatelná PWA startovní stránka** pro iOS/iPadOS. Není to plnohodnotný prohlížeč s vlastním WebKit/Chromium enginem. V iOS PWA nelze obecně vkládat cizí stránky do karet uvnitř aplikace: mnoho webů zakazuje iframe a PWA nemá oprávnění ani API pro vlastní prohlížeč jako nativní aplikace.

## Co opravdu funguje v návrhu

- Úvodní mobilní obrazovka v tmavém stylu YamaSearch se skutečnými symboly z `../Assets`.
- Vyhledávání přes DuckDuckGo, Google nebo Bing; běžné HTTP(S) adresy; otevření webu v Safari (externí kontext).
- Přidávání/odstraňování oblíbených odkazů a lokální uložení.
- Volitelná lokální historie pouze odkazů otevřených **z této PWA** (výchozí vypnuto), možnost vymazání.
- Standalone web app manifest, Apple touch icon, service worker cachující **jen vlastní startovní stránku**.
- Lokální úložiště bez registrace uživatele; žádný vlastní backend ani přenos oblíbených položek na server.

## Sestavení

Ze zdrojového adresáře: `node products/yamasearch/ios-pwa/build.mjs`, dále `node products/yamasearch/ios-pwa/test.mjs`.
Složka `products/yamasearch/ios-pwa/dist` obsahuje čisté statické soubory. Lze nasadit na samostatný HTTPS hosting nebo jako cestu `/yamasearch/` na existujícím Cloudflare Pages webu. Nasazení **neprobíhá automaticky**.

V GitHub Actions je samostatný preview workflow `yamasearch-ios-pwa-preview.yml` a jeho ZIP artefakt. Nepublikuje do produkce. Finální cesta hostingu (navržená `https://yamachat.eu/yamasearch/`) se aktivuje až po úspěšném nasazení, ověření a schválení.

## Instalace bez Apple účtu

1. V iOS Safari otevři nasazenou HTTPS adresu aplikace.
2. Klepni na sdílení a zvol `Přidat na plochu`.
3. Potvrď přidání. Ikona YamaSearch se objeví na ploše.

Safari na iOS může chování a přesný název nabídky změnit. PWA nevyžaduje Apple Developer Program ani schvalování App Store.

## Omezení a bezpečnostní závazky

- Neexistují skutečné in-app karty pro nezávislé cizí weby, WebView2, podpora všech rozšíření nebo blokování reklam na všech stránkách Safari.
- Weby se otevírají v Safari, který spravuje jejich přihlášení, cookies, historii i zabezpečení nezávisle na této PWA.
- Historie odkazů PWA je odlišná od historie Safari; ani její vypnutí/zmazání nevymaže historii Safari.
- PWA neslibuje systémová oznámení z jiných navštívených webů, background push těchto stránek nebo úplnou anonymitu.
- Offline funguje startovní obrazovka a uložené odkazy. Cizí weby stále potřebují internet.
- Data z localStorage se mohou ztratit při vymazání dat webu nebo odinstalaci; nejsou synchronizována s Windows/Android.
- Před schváleným veřejným vydáním ověř na skutečném iPhonu: instalaci, safe areas, offline, otevření externího odkazu, lokální ukládání, vymazání dat, chování Safari, návrat do PWA.

**Žádný merge do main, veřejné Cloudflare Pages nasazení nebo změna stahovacích odkazů bez souhlasu majitele.**
