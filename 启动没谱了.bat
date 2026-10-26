@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm install
)
rem Rebuilds automatically when source changed, then opens http://localhost:4173
node scripts\serve.mjs
