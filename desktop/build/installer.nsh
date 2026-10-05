; Yamachat NSIS updater rollback helper.
!macro customInstall
  CreateDirectory "$LOCALAPPDATA\YamachatUpdater"
  CreateDirectory "$LOCALAPPDATA\YamachatUpdater\rollback"
  CopyFiles /SILENT "$EXEPATH" "$LOCALAPPDATA\YamachatUpdater\rollback\installed-setup.exe"
  IfFileExists "$INSTDIR\resources\app\wns\WindowsAppRuntimeInstall-x64.exe" 0 yc_runtime_done
    nsExec::ExecToLog '"$INSTDIR\resources\app\wns\WindowsAppRuntimeInstall-x64.exe" --quiet'
    Pop $0
  yc_runtime_done:
!macroend

!macro customUnInstall
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Get-AppxPackage -Name ''yamachat.eu-7E03B8AF'' -ErrorAction SilentlyContinue | Remove-AppxPackage -ErrorAction SilentlyContinue"'
  Pop $0
!macroend
