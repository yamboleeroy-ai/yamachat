@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-YamaConvert.ps1"
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo YamaConvert could not start. The diagnostic log is in %%LOCALAPPDATA%%\YamaConvert\launcher.log
  pause
)
exit /b %EXIT_CODE%
