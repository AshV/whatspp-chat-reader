@echo off
:: Ensure the script runs as administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Please right-click this batch file and select "Run as administrator".
    pause
    exit /b
)

:: Configuration
set "PORT=44300"
set "SITE_NAME=LocalSecureFolder"
set "IIS_DIR=%ProgramFiles%\IIS Express"

:: Capture the folder where the batch file is located
set "PHYSICAL_PATH=%~dp0"
:: Remove trailing backslash for IIS compliance
if "%PHYSICAL_PATH:~-1%"=="\" set "PHYSICAL_PATH=%PHYSICAL_PATH:~0,-1%"

echo [1/4] Configuring SSL Certificate for Port %PORT%...
cd /d "%IIS_DIR%"
IisExpressAdminCmd.exe setupSslUrl -url:https://localhost:%PORT% -UseSelfSigned >nul

echo [2/4] Cleaning up previous site registrations...
appcmd.exe delete site "%SITE_NAME%" >nul 2>&1

echo [3/4] Registering current directory in IIS Express...
appcmd.exe add site /name:"%SITE_NAME%" /bindings:https/*:%PORT%:localhost /physicalPath:"%PHYSICAL_PATH%"

echo [4/4] Starting server...
echo ----------------------------------------------------
echo  Serving: %PHYSICAL_PATH%
echo  URL:     https://localhost:%PORT%
echo ----------------------------------------------------
echo  Press CTRL+C in this window to stop the server.
echo ----------------------------------------------------

iisexpress.exe /site:%SITE_NAME%
pause
