# Vydávání aktualizací Yamachat

## Doporučený způsob

Po otestování změn spusť GitHub Actions workflow **Publish Yamachat Release**.

Vyplníš:
- Windows verzi, např. `1.0.80`
- název vydání
- text **Co je nového**

Workflow:
1. sestaví Windows `Yamachat-Setup-<verze>.exe`,
2. přidá `.blockmap` a `latest.yml`,
3. přidá poslední ověřenou a permanentně podepsanou `Yamachat-Android.apk`,
4. vytvoří/přepíše GitHub Release,
5. následný workflow **Sync update manifest from Release** ověří APK a aktualizuje `https://yamachat.eu/update-manifest.json`.

Aktuální politika má `required: true`, takže novější verze zobrazí povinné update okno.

## Ruční způsob

Když chceš Release sestavit ručně, nahraj do stejného GitHub Release:
- `Yamachat-Setup-X.Y.Z.exe`
- `Yamachat-Setup-X.Y.Z.exe.blockmap`
- `latest.yml`
- `Yamachat-Android.apk`

Nepřepisuj Android signing key. Package musí zůstat `eu.yamachat.app`.
