@echo off
set "TARGET=%~1"
if /I "%TARGET%"=="--url" set "TARGET=%~2"
if /I "%TARGET%"=="--file" set "TARGET=%~2"
echo %TARGET% | findstr /I "\.json" >nul
if not errorlevel 1 (
  node "%~dp0lib\telegram-converter.js" %*
  exit /b %errorlevel%
)
echo %TARGET% | findstr /I "bilibili.com b23.tv" >nul
if not errorlevel 1 (
  node "%~dp0lib\bilibili-subtitles.js" %*
  exit /b %errorlevel%
)
node "%~dp0scrape.js" %*

