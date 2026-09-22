# Yamachat Android / Capacitor

Aktuální práce sjednocuje web a Android s desktopem 1.0.78. Viz ../README.md.

Mobilní web se generuje z ověřeného desktopového snapshotu a platformových adaptérů. npm ci a npm run prepare:web připraví lokální závislosti, nativní most a všechny klientské soubory. Staré APK se nikdy nepřibaluje dovnitř nového APK.

Android: npx cap add android (poprvé), npx cap sync android, node scripts/patch-native.mjs android, poté Gradle assembleDebug. GitHub workflow poskytuje testovací APK jako artifact.

iOS: projekt zůstává kompatibilní s Capacitor iOS; veřejný nativní build vyžaduje Apple účet a podpis. Viz IOS-TESTFLIGHT.md.
