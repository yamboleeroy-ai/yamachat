# Yamachat 1.0.103

- Microsoft Natural hlasy pro Windows, včetně české Vlasty a Antonína, s lokálním hlasem jako zálohou.
- Potvrzená oprava zamrzání při přepínání přes Windows taskbar během voice: stav se předává z rendereru přes IPC bez pravidelného vkládání JavaScriptu z hlavního procesu.
- Aplikační změny jsou přesně z PR #68 (87e134b60881a2afe6557c3aa29be851ef01a4c8), sloučeného do main jako 8c1a52ae4e3058f9b5f63e5eb2dcd0b10ecdeb77.
- Web/PWA a Android používají dosavadní generování; iOS prochází kontrolním sestavením. Dostupnost nativního TestFlight vydání závisí na existující Apple konfiguraci.

Předchozí vydání v1.0.102 zůstává dostupné pro návrat.
