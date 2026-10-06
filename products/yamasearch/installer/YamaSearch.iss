#define AppName "YamaSearch"
#ifndef AppVersion
  #define AppVersion "0.1.0"
#endif
#define AppPublisher "Yama"
#define AppExeName "YamaSearch.exe"
#define BuildDirectory "..\artifacts\publish"

[Setup]
AppId={{54F1C6D2-8A1C-4706-9FC8-5D7C3D80D5B1}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={localappdata}\Programs\YamaSearch
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\artifacts
OutputBaseFilename=YamaSearch-Setup-{#AppVersion}
SetupIconFile=..\Assets\YamaSearch.ico
UninstallDisplayIcon={app}\{#AppExeName}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "czech"; MessagesFile: "compiler:Languages\Czech.isl"

[Tasks]
Name: "desktopicon"; Description: "Vytvořit zástupce na ploše"; GroupDescription: "Další zástupci:"; Flags: unchecked

[Files]
Source: "{#BuildDirectory}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExeName}"; Description: "Spustit YamaSearch"; Flags: nowait postinstall skipifsilent
