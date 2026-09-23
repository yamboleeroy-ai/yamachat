; Yamachat NSIS extension used by electron-builder.
; Keep a copy of the installer that produced the currently installed version.
; updater.js copies this file aside before applying a newer update so the
; health-check helper can safely roll back if the new version fails to boot.

!macro customInstall
  CreateDirectory "$LOCALAPPDATA\YamachatUpdater"
  CreateDirectory "$LOCALAPPDATA\YamachatUpdater\rollback"
  CopyFiles /SILENT "$EXEPATH" "$LOCALAPPDATA\YamachatUpdater\rollback\installed-setup.exe"
!macroend
