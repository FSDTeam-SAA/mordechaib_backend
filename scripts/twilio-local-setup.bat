@echo off
REM ============================================================
REM  Twilio local call-forwarding setup (Windows)
REM  Run this in a new terminal to expose your local backend
REM  to Twilio via ngrok, then update .env APP_BASE_URL with
REM  the printed ngrok URL (NO trailing spaces!).
REM ============================================================

echo.
echo ==========================================
echo  Starting ngrok tunnel for local Twilio dev
echo ==========================================
echo.
echo  After ngrok starts:
echo   1. Copy the "Forwarding" https URL, e.g.
echo      https://abcd-123-456.ngrok-free.dev
echo   2. Open .env and set APP_BASE_URL to that URL.
echo   3. Restart your NestJS server (pnpm start:dev).
echo   4. In Twilio Console set the Voice webhook to:
echo      https://YOUR-NGROK.ngrok-free.dev/api/v1/webhooks/twilio/voice
echo.
echo  Press Ctrl+C to stop the tunnel when done.
echo.

where ngrok >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] ngrok was not found on PATH.
    echo Install it from https://ngrok.com/download and try again.
    pause
    exit /b 1
)

ngrok http 5000