@echo off
REM Force UTF-8 codepage for cmd console
chcp 65001 >nul 2>&1

REM Switch to script directory
cd /d %~dp0

REM Use absolute path (PATH 'python' points to broken Store stub)
set PY=D:\python3.11.9\python.exe

echo ========================================
echo   Daily News Service - Launcher
echo ========================================
echo.
echo Using Python: %PY%

if not exist "%PY%" goto NO_PYTHON

if not exist ".env" goto NO_ENV

echo [1/2] Checking dependencies...
%PY% -c "import fastapi, uvicorn, httpx, dotenv" >nul 2>&1
if errorlevel 1 goto INSTALL_DEPS

goto START_SERVER

:INSTALL_DEPS
echo    First run, installing deps (1-2 min)...
%PY% -m pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
if errorlevel 1 goto PIP_FAIL

:START_SERVER
echo.
echo [2/2] Starting service...
echo.
echo ----------------------------------------
echo   Close this window to stop the service
echo   Verify: http://localhost:8000/api/health
echo ----------------------------------------
echo.

%PY% news_server.py
goto END

:NO_PYTHON
echo [ERROR] Python not found at %PY%
echo Edit this .bat and update PY= to your Python install path.
goto END

:NO_ENV
echo [ERROR] .env file not found!
echo.
echo Setup steps:
echo   1. Copy .env.example to .env
echo   2. Fill in your LLM_API_KEY in .env
echo   3. Run this script again
echo.
goto END

:PIP_FAIL
echo [ERROR] pip install failed. Check your pip config.

:END
pause
