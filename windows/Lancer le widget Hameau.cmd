@echo off
rem Lance le widget Hameau (petite fenetre du chrono), sans console.
start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -STA -File "%~dp0hameau-widget.ps1"
