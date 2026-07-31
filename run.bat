@echo off
set "TARGET=%~1"
if /I "%TARGET%"=="--url" set "TARGET=%~2"
echo %TARGET% | findstr /I "bilibili.com b23.tv" >nul
if not errorlevel 1 (
  node "%~dp0lib\bilibili-subtitles.js" %*
  exit /b %errorlevel%
)
node "%~dp0scrape.js" %*
