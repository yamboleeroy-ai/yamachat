; Yamachat NSIS extension used by electron-builder.
; Keep a copy of the installer that produced the currently installed version.
; updater.js copies this file aside before applying a newer update so the
; health-check helper can safely roll back if the new version fails to boot.

!macro customInstall
  CreateDirectory "$LOCALAPPDATA\YamachatUpdater"
  CreateDirectory "$LOCALAPPDATA\YamachatUpdater\rollback"
  CopyFiles /SILENT "$EXEPATH" "$LOCALAPPDATA\YamachatUpdater\rollback\installed-setup.exe"

  ; WNS background push uses Windows App SDK plus a sparse package identity while
  ; keeping Yamachat's existing NSIS install/update layout. Runtime installation
  ; is silent and intentionally non-fatal so the normal desktop app still installs
  ; even if Windows rejects the optional WNS dependency.
  IfFileExists "$INSTDIR\resources\app\wns\WindowsAppRuntimeInstall-x64.exe" 0 yc_wns_runtime_done
    nsExec::ExecToLog '"$INSTDIR\resources\app\wns\WindowsAppRuntimeInstall-x64.exe" --quiet'
    Pop $0
    DetailPrint "Yamachat Windows App Runtime install exit code: $0"
  yc_wns_runtime_done:

  ; Production Yamachat keeps its existing unsigned sparse identity and PFN.
  ; Windows package activation gives the native WNS bridge package identity.
  IfFileExists "$INSTDIR\resources\app\wns\Yamachat.PushIdentity.msix" 0 yc_wns_done
    nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$ErrorActionPreference=''Stop''; Add-AppxPackage -Path ''$INSTDIR\resources\app\wns\Yamachat.PushIdentity.msix'' -ExternalLocation ''$INSTDIR\resources\app'' -AllowUnsigned -ForceApplicationShutdown"'
    Pop $0
    DetailPrint "Yamachat WNS identity registration exit code: $0"
  yc_wns_done:
!macroend

!macro customUnInstall
  ; Remove only the production Yamachat sparse identity package. User data remains intact.
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Get-AppxPackage -Name ''yamachat.eu-7E03B8AF'' -ErrorAction SilentlyContinue | Remove-AppxPackage -ErrorAction SilentlyContinue"'
  Pop $0
!macroend
