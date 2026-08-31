@echo off
rem ==============================================
rem  Homework App - Push to GitHub
rem  Double-click this file to upload the project
rem  First run will ask you to log in to GitHub
rem  in your browser (one time only).
rem ==============================================
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ============================================
echo   Homework App  -  Push to GitHub
echo ============================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0push-to-github.ps1"
echo.
echo Finished. If you see a red error above, please
echo take a screenshot and send it to the developer.
echo.
pause
