; Yamachat NSIS extension used by electron-builder.
; Keep a copy of the installer that produced the currently installed version.
; updater.js copies this file aside before applying a newer update so the
; health-check helper can safely roll back if the new version fails to boot.

!macro customInstall
  CreateDirectory "$LOCALAPPDATA\YamachatUpdater"
  CreateDirectory "$LOCALAPPDATA\YamachatUpdater\rollback"
  CopyFiles /SILENT "$EXEPATH" "$LOCALAPPDATA\YamachatUpdater\rollback\installed-setup.exe"

  ; WNS background push uses a sparse package identity while keeping Yamachat's
  ; existing NSIS install/update layout. Production builds include a signed
  ; identity-only MSIX next to the WNS bridge.
  IfFileExists "$INSTDIR\resources\app\wns\Yamachat.PushIdentity.msix" 0 yc_wns_done
    nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$ErrorActionPreference=''Stop''; Add-AppxPackage -Path ''$INSTDIR\resources\app\wns\Yamachat.PushIdentity.msix'' -ExternalLocation ''$INSTDIR\resources\app'' -ForceApplicationShutdown"'
    Pop $0
    DetailPrint "Yamachat WNS identity registration exit code: $0"
  yc_wns_done:
!macroend

!macro customUnInstall
  ; Remove only the Yamachat sparse identity package. User data remains intact.
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Get-AppxPackage -Name ''Yamachat.Desktop.Push'' -ErrorAction SilentlyContinue | Remove-AppxPackage -ErrorAction SilentlyContinue"'
  Pop $0
!macroend
