#!/bin/bash

# ============================================
# Peyala Business Admin - Install Script
# ============================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${BLUE}🍵 Peyala Business Admin - Setup${NC}"
echo "========================================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo -e "${RED}❌ Node.js not found. Please install Node.js 18+ from https://nodejs.org${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Node.js $(node --version)${NC}"

# Check MongoDB
if ! command -v mongod &> /dev/null; then
  echo -e "${YELLOW}⚠️  mongod not in PATH. Make sure MongoDB is running on localhost:27017${NC}"
else
  echo -e "${GREEN}✅ MongoDB found${NC}"
fi

echo ""
echo -e "${BLUE}📦 Installing backend dependencies...${NC}"
cd backend
npm install --silent
echo -e "${GREEN}✅ Backend dependencies installed${NC}"

echo ""
echo -e "${BLUE}📦 Installing frontend dependencies...${NC}"
cd ../frontend
npm install --silent
echo -e "${GREEN}✅ Frontend dependencies installed${NC}"

echo ""
echo -e "${BLUE}🌱 Seeding database with Peyala data...${NC}"
cd ../backend
npm run seed
echo -e "${GREEN}✅ Database seeded${NC}"

echo ""
echo "========================================"
echo -e "${GREEN}🎉 Setup complete!${NC}"
echo ""
echo -e "Start the app with: ${YELLOW}./start.sh${NC}"
echo ""
echo -e "Or manually:"
echo -e "  Terminal 1: ${YELLOW}cd backend && npm run dev${NC}"
echo -e "  Terminal 2: ${YELLOW}cd frontend && npm run dev${NC}"
echo ""
echo -e "Then open: ${BLUE}http://localhost:3000${NC}"
echo ""
echo -e "Login: ${YELLOW}admin@peyala.com${NC} / ${YELLOW}peyala123${NC}"
echo ""
