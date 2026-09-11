#!/bin/bash

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
APP_URL="http://localhost:3000/tables"
USER_DATA_DIR="$HOME/Library/Application Support/PeyalaPOSChrome"

echo ""
echo -e "${BLUE}======================================================${NC}"
echo -e "${GREEN}🍵 Launching Peyala POS with Chrome Silent Auto-Print${NC}"
echo -e "${BLUE}======================================================${NC}"
echo ""
echo -e "• Mode:    ${CYAN}--kiosk-printing${NC} (Bypasses Chrome print dialog)"
echo -e "• Printer: ${CYAN}Sends prints directly to system default printer${NC}"
echo -e "• URL:     ${YELLOW}${APP_URL}${NC}"
echo ""

if [ ! -f "$CHROME_BIN" ]; then
  echo -e "${YELLOW}Warning: Google Chrome not found at $CHROME_BIN${NC}"
  echo "Opening with default system browser..."
  open "$APP_URL"
  exit 0
fi

# Ensure dedicated profile directory exists (allows running side-by-side with personal Chrome)
mkdir -p "$USER_DATA_DIR"

# Launch Chrome in dedicated POS profile with silent printing flag
"$CHROME_BIN" \
  --kiosk-printing \
  --user-data-dir="$USER_DATA_DIR" \
  --disable-features=Translate \
  --no-first-run \
  --no-default-browser-check \
  "$APP_URL" >/dev/null 2>&1 &

echo -e "${GREEN}✅ Chrome POS window opened with silent auto-printing enabled!${NC}"
echo ""
