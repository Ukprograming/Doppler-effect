@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js が見つかりません。Node.js 22.13 以降をインストールしてください。
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo 初回起動の準備をしています...
  call npm.cmd install
  if errorlevel 1 (
    echo パッケージの準備に失敗しました。
    pause
    exit /b 1
  )
)

echo アプリを http://localhost:5173/ で起動します。
echo 終了するときは、この画面で Ctrl+C を押してください。
call npm.cmd run dev:open -- --host 127.0.0.1
