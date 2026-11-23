@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js не найден. Установите Node.js 22 LTS или новее: https://nodejs.org & pause & exit /b)
start "" http://localhost:8080
node server\server.js
pause
