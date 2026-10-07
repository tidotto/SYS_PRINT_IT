@echo off
chcp 65001 >nul
title Deploy SysPrint TI
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1"
pause
