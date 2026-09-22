# Yamachat Mobile

Společný mobilní projekt Yamachat pro **Android + iOS** postavený na Capacitoru 8. Webová aplikace z kořene repozitáře zůstává zdrojem UI a mobilní build si při buildu vytvoří vlastní kopii do `mobile/www`.

## Co už je připravené

- jeden společný projekt pro Android a iOS,
- stejný Supabase backend a přihlášení jako web/desktop,
- mobilní responzivní UI z `yamachat.eu`,
- nativní safe-area pro iPhone,
- mikrofon/kamera oprávnění,
- iOS background audio deklarace,
- Android back tlačítko zavírá mobilní panely,
- připravený most pro push notifikace,
- automatická synchronizace webu do mobilního buildu,
- GitHub Actions kontrolní build pro Android i iOS,
- stránka `https://yamachat.eu/download/`.

## První vytvoření native projektů

Potřebuješ Node.js a pro Android Android Studio. Pro iOS je nutný macOS + Xcode.

```bash
cd mobile
npm install
npm run prepare:web
npx cap add android
npx cap add ios
node scripts/patch-native.mjs all
npx cap sync
```

Potom:

```bash
npm run android
```

otevře Android Studio.

Na Macu:

```bash
npm run ios
```

otevře Xcode.

## Po každé změně webu

```bash
cd mobile
npm run sync
```

Tím se aktuální `index.html`, ikony a audio z webu překopírují do mobilního projektu a synchronizují do Android/iOS.

## Android APK

Testovací APK:

```bash
cd mobile
npm run android:debug
```

Výstup:

`mobile/android/app/build/outputs/apk/debug/app-debug.apk`

Pro veřejné vydání je potřeba vytvořit vlastní release signing key. Debug APK je jen pro testování.

## iOS

iOS build a instalace na reálný iPhone vyžaduje Apple Developer účet a podepisování v Xcode. Pro veřejné testování doporučujeme TestFlight. Odkaz na TestFlight se potom doplní na stránku `/download/`.

## Voice a běh na pozadí

Oprávnění a iOS background-audio režim jsou připravené. Hlasový chat v aktivní aplikaci používá existující WebRTC logiku Yamachatu.

Spolehlivý hovor při dlouhém zamknutí telefonu / agresivním uspání Androidu je další nativní krok: Android foreground call service a iOS audio-session/call lifecycle. Ten není dobré simulovat pouze WebView kódem; bude doplněn jako samostatná vrstva, aby se nerozbila současná voice logika.
