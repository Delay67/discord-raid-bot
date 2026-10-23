@echo off
setlocal
cd /d "%~dp0"
title Dark Caller

where py >nul 2>nul
if errorlevel 1 (
    echo Python was not found. Install Python with the Python launcher, then try again.
    pause
    exit /b 1
)

py -c "import pynput" >nul 2>nul
if errorlevel 1 (
    echo Installing the mouse listener dependency...
    py -m pip install pynput
    if errorlevel 1 (
        echo Installation failed.
        pause
        exit /b 1
    )
)

py "scripts\active\start_dark_caller.py"
echo.
echo Dark Caller stopped.
pause
