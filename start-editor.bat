@echo off
chcp 65001 >nul
title Book Scene Flow Editor
echo Starting local server with direct Excel integration...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
