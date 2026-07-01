#!/bin/bash

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Get the directory where this script lives
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo -e "${BLUE}🍵 Starting Peyala Business Admin...${NC}"
echo ""

# Kill existing processes
lsof -ti:4000 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
sleep 1

# Start backend
echo -e "${GREEN}▶ Starting backend (port 4000)...${NC}"
cd "$SCRIPT_DIR/backend" && npm run dev &
BACKEND_PID=$!
sleep 2

# Start frontend
echo -e "${GREEN}▶ Starting frontend (port 3000)...${NC}"
cd "$SCRIPT_DIR/frontend" && npm run dev &
FRONTEND_PID=$!

echo ""
echo -e "${GREEN}✅ Both servers starting!${NC}"
echo ""
echo -e "  🔗 App:  ${YELLOW}http://localhost:3000${NC}"
echo -e "  🔗 API:  ${YELLOW}http://localhost:4000/api/health${NC}"
echo ""
echo -e "  Login:  ${YELLOW}admin@peyala.com${NC} / ${YELLOW}peyala123${NC}"
echo ""
echo -e "Press ${YELLOW}Ctrl+C${NC} to stop"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo ''; echo 'Servers stopped.'; exit 0" SIGINT SIGTERM
wait
