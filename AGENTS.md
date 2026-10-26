**CRITICAL RULE: WHEN REQUESTED TO UPDATE OR CHANGE ANYTHING, NEVER CHANGE, BREAK, OR COMPROMISE ANY EXISTING LOGIC EVER.**

# Workspace Rules & Autonomous Standards

## 1. Zero Existing Logic Changes (MANDATORY)
- **WHEN REQUESTED TO UPDATE OR IMPLEMENT ANYTHING, NEVER CHANGE OR REMOVE EXISTING BUSINESS LOGIC, CALCULATION FLOWS, OR ARCHITECTURE.**
- All additions must be strictly non-breaking, additive, and preserve 100% backward compatibility with active operations.

## 2. Proactive All-In-One Installer Prompt (MANDATORY)
After EVERY code change, bugfix, or feature addition across the repository (frontend, backend, android, or scripts):
- **DO NOT wait for the user to ask.**
- **Proactively ask the user immediately** (via `ask_question` or direct prompt) if they would like to re-package/update the All-In-One Installer (`INSTALL-PEYALA-ALL-IN-ONE.bat` and `Peyala-POS-AllInOne-Installer.exe`) and `Peyala-POS.apk`.
- When confirmed, run the automated pipeline (`scripts/build-all-in-one.ps1`).

## 3. Documentation Parity
Always keep `MEMORY_BANK.md` and `README.md` updated whenever changes are introduced to retain full historical context.
