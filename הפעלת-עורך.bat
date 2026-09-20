@echo off
chcp 65001 >nul
title לוח עריכת סצנות לספר
echo הפעלת שרת מקומי וטעינת קובץ האקסל 'סצנות לספר.xlsx'...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
