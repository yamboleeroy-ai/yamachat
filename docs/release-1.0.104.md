# Yamachat 1.0.104

- Windows-only hotfix pro zamrzlé ovládání po návratu aplikace z Windows taskbaru během aktivního voice.
- Po voice-safe minimalizaci se další návrat přes taskbar jednorázově opraví nativním cyklem hide -> obnovit mouse/focus/enabled -> show -> focus.
- Renderer se nereoloaduje ani neničí; aktivní voice, WebRTC a stream zůstávají zachované.
- Otevření přes systémový tray zůstává na dosavadní funkční show/focus cestě a nový taskbar reset se na něj nepoužije.
- Web/PWA, Android a jejich klientský kód nebyly v tomto hotfixu změněny.

Předchozí vydání v1.0.103 zůstává dostupné pro návrat.
