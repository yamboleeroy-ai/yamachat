#define MyAppName "YamaConvert"
#define MyAppVersion "1.0.1"
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
CloseApplications=yes
SetupIconFile={#SourceDir}\resources\app\icons\yamaconvert.ico
UninstallDisplayIcon={app}\YamaConvert.exe

[Tasks]
Name: "desktopicon"; Description: "Vytvořit zástupce na ploše"; GroupDescription: "Další možnosti:"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\YamaConvert"; Filename: "{app}\YamaConvert.exe"; WorkingDir: "{app}"; IconFilename: "{app}\resources\app\icons\yamaconvert.ico"
Name: "{autodesktop}\YamaConvert"; Filename: "{app}\YamaConvert.exe"; WorkingDir: "{app}"; IconFilename: "{app}\resources\app\icons\yamaconvert.ico"; Tasks: desktopicon
