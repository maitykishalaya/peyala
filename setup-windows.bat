@echo off
title Peyala POS - Setup
cd /d "%~dp0"
call "%~dp0INSTALL-PEYALA-POS.bat"
exit /b %ERRORLEVEL%
