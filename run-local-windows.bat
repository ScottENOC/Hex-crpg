@echo off
setlocal
cd /d "%~dp0"

set "PORT=8765"
set "URL=http://127.0.0.1:%PORT%/"

echo Silverhart Saga - local Windows launcher
echo.
echo Game files will be served directly from:
echo   %CD%
echo.

where py >nul 2>nul
if %errorlevel%==0 goto :python_py

where python >nul 2>nul
if %errorlevel%==0 goto :python

where node >nul 2>nul
if %errorlevel%==0 goto :node

echo Could not find Python or Node.js on this PC.
echo.
echo Easiest free option: install Python from https://www.python.org/downloads/windows/
echo During installation tick "Add python.exe to PATH", then double-click this file again.
echo.
pause
exit /b 1

:python_py
echo Using Python's built-in local web server. No npm install is required.
start "" "%URL%"
echo.
echo Keep this window open while playing. Close it to stop the local game server.
echo.
py -m http.server %PORT% --bind 127.0.0.1
exit /b %errorlevel%

:python
echo Using Python's built-in local web server. No npm install is required.
start "" "%URL%"
echo.
echo Keep this window open while playing. Close it to stop the local game server.
echo.
python -m http.server %PORT% --bind 127.0.0.1
exit /b %errorlevel%

:node
echo Python was not found, but Node.js is available.
echo Starting the repository's existing local server. Dependencies must already be installed.
if not exist node_modules\express\package.json (
  echo.
  echo Node dependencies are not installed. Run "npm install" once, or install Python for the zero-install launcher.
  echo.
  pause
  exit /b 1
)
set PORT=%PORT%
start "" "%URL%"
node server.js
exit /b %errorlevel%
