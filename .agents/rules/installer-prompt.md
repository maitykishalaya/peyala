**CRITICAL RULE: WHEN REQUESTED TO UPDATE OR CHANGE ANYTHING, NEVER CHANGE, BREAK, OR COMPROMISE ANY EXISTING LOGIC EVER.**

# Proactive Installer Update Rule

## Mandatory Workflow After Every Code Change
After making ANY modification to this repository (frontend, backend, scripts, models, config, or assets):
1. **Never alter or break existing business logic, workflows, or calculation systems.**
2. **Always explicitly ask the user if they want to rebuild/update the All-In-One Installer** (`INSTALL-PEYALA-ALL-IN-ONE.bat` and `Peyala-POS-AllInOne-Installer.exe`), using `ask_question` with a recommended option to rebuild.
3. The user should NEVER have to prompt or remind you to update the installer.
4. If confirmed, immediately execute `scripts\build-all-in-one.ps1` (or `build-all-in-one.bat`) to keep both installers and `Peyala-POS.apk` in sync across `c:\Users\User\Desktop\peyala_v8` and `C:\Desktop\Peyala_v8`.
