@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-codex-with-nano.ps1"
if errorlevel 1 pause
