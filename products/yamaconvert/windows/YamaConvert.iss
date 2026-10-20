#define MyAppName "YamaConvert"
#define MyAppVersion "1.0.0"
#ifndef SourceDir
  #define SourceDir "package"
#endif
#ifndef OutputDir
  #define OutputDir "dist"
#endif

[Setup]
AppId={{A4E0198E-06B7-4A9E-B311-252F74B351A0}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=YamaConvert
DefaultDirName={localappdata}\Programs\YamaConvert
DefaultGroupName=YamaConvert
PrivilegesRequired=lowest
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
OutputDir={#OutputDir}
OutputBaseFilename=YamaConvert-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=YamaConvert

[Tasks]
Name: "desktopicon"; Description: "Vytvořit zástupce na ploše"; GroupDescription: "Další možnosti:"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\YamaConvert"; Filename: "{app}\Start-YamaConvert.cmd"; WorkingDir: "{app}"
Name: "{autodesktop}\YamaConvert"; Filename: "{app}\Start-YamaConvert.cmd"; WorkingDir: "{app}"; Tasks: desktopicon
