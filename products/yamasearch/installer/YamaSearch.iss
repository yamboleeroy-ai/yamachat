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
CloseApplications=force
RestartApplications=no

[Languages]
Name: "czech"; MessagesFile: "compiler:Languages\Czech.isl"

[Files]
Source: "{#BuildDirectory}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"

[Registry]
Root: HKCU; Subkey: "Software\Classes\YamaSearch.Url"; ValueType: string; ValueName: ""; ValueData: "YamaSearch URL"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\YamaSearch.Url"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\YamaSearch.Url\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: """{app}\{#AppExeName}"",0"
Root: HKCU; Subkey: "Software\Classes\YamaSearch.Url\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#AppExeName}"" --url=""%1"""
Root: HKCU; Subkey: "Software\Clients\StartMenuInternet\YamaSearch"; ValueType: string; ValueName: ""; ValueData: "YamaSearch"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Clients\StartMenuInternet\YamaSearch\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: """{app}\{#AppExeName}"",0"
Root: HKCU; Subkey: "Software\Clients\StartMenuInternet\YamaSearch\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#AppExeName}"""
Root: HKCU; Subkey: "Software\Clients\StartMenuInternet\YamaSearch\Capabilities"; ValueType: string; ValueName: "ApplicationName"; ValueData: "YamaSearch"
Root: HKCU; Subkey: "Software\Clients\StartMenuInternet\YamaSearch\Capabilities"; ValueType: string; ValueName: "ApplicationDescription"; ValueData: "Soukromější webový prohlížeč s YamaBlock a YamaShield."
Root: HKCU; Subkey: "Software\Clients\StartMenuInternet\YamaSearch\Capabilities"; ValueType: string; ValueName: "ApplicationIcon"; ValueData: """{app}\{#AppExeName}"",0"
Root: HKCU; Subkey: "Software\Clients\StartMenuInternet\YamaSearch\Capabilities\URLAssociations"; ValueType: string; ValueName: "http"; ValueData: "YamaSearch.Url"
Root: HKCU; Subkey: "Software\Clients\StartMenuInternet\YamaSearch\Capabilities\URLAssociations"; ValueType: string; ValueName: "https"; ValueData: "YamaSearch.Url"
Root: HKCU; Subkey: "Software\RegisteredApplications"; ValueType: string; ValueName: "YamaSearch"; ValueData: "Software\Clients\StartMenuInternet\YamaSearch\Capabilities"; Flags: uninsdeletevalue

[Run]
Filename: "{app}\{#AppExeName}"; Description: "Spustit YamaSearch"; Flags: nowait postinstall skipifsilent


[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Exec(ExpandConstant('{cmd}'), '/C taskkill /F /IM YamaSearch.exe >NUL 2>&1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := '';
end;
