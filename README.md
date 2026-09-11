# 🍵 Peyala Business Admin & Dine-In POS

A comprehensive, self-hosted restaurant management and Point-of-Sale (POS) system built specifically for **Peyala Café & Restaurant** (Howrah, West Bengal).

Combines live table management, multi-round Kitchen Order Tickets (KOT), 80mm thermal receipt printing, daily sales consolidation, inventory costing, supplier dues, expense tracking, staff payroll & attendance, and double-entry style financial reporting.

---

> [!IMPORTANT]
> **Maintenance Rule**: Whenever any significant change or new feature is introduced to this codebase, **both `README.md` and `MEMORY_BANK.md` must be updated immediately**.

---

## 📋 Features & Modules Overview

| Module | Route | Description |
|--------|-------|-------------|
| **Dine-In POS & Tables** | `/tables` | Live visual table floor plan, guest seating, order creation, multi-round KOT dispatch, item status tracking, bill finalization, and payment settlement. |
| **Menu Management** | `/menu` | Veg/Non-Veg menu item catalog with pricing, GST percentages, active/inactive toggles, and sortable menu categories. |
| **Detailed Sales Report** | `/reports` | Comprehensive audit trail of individual customer orders, KOT history, bill numbers, payment modes, waived off tracking, and one-click Excel CSV export. |
| **Sales Register** | `/sales` | Consolidated daily sales entries (Counter cash/UPI + Zomato/Swiggy net settlements after commission and platform deductions). |
| **Dashboard** | `/dashboard` | Executive KPI overview (Revenue, Gross/Net Profit), yesterday's operational summary, live account balances, and low stock warnings. |
| **Accounts** | `/accounts` | Multi-account tracking (Cash Counter, Current Account, Petty Cash, UPI) with internal fund transfers. |
| **Inventory** | `/inventory` | Stock tracking with minimum thresholds, unit conversions, and automated weighted-average unit cost (WAC) recalculation. |
| **Purchases** | `/purchases` | Raw material procurement with quick-add items, GST bills, and auto-crediting/debiting of inventory and supplier dues. |
| **Suppliers** | `/suppliers` | Vendor ledgers, purchase history, total purchases, and outstanding dues reconciliation. |
| **Payments** | `/payments` | Outgoing expense ledger categorized into operational, utility, vendor, and maintenance costs. |
| **Receipts** | `/receipts` | Inflow tracking for capital investments, cash deposits, settlements, and customer receipts. |
| **Staff & Attendance** | `/staff`, `/attendance` | Employee directory, monthly attendance calendar with leave cap enforcement, advances, bonuses, and salary disbursals. |
| **Balance Sheet** | `/balancesheet` | Dynamic statement of Assets (bank/cash accounts), Liabilities (GST liability, supplier dues, loans), and Net Equity. |
| **Settings & Security** | `/settings` | Role-based user administration, audit logging, payment categories, database backup/restore, and dark/light mode. |

---

## 🌟 Key Highlights & Operational Capabilities

### 1. Dine-In POS & Multi-Round Kitchen Order Tickets (KOT)
- **Table Grid**: Visual color-coded table states (Green: *Available*, Red: *Occupied*, Yellow: *Reserved*).
- **Multi-Round KOTs**: Guests can order in multiple rounds. Each round prints an incremental KOT ticket to the kitchen (e.g. `[INITIAL ORDER]`, `[ROUND 2 - ADD-ON]`) with custom notes (e.g., *"Less spicy"*, *"No onion"*).
- **Soft Item Cancellation**: Live orders allow soft-cancellation of items with reason tracking without corrupting billing or inventory histories.

### 2. Dual Discount Engine
- Apply either **Flat monetary discount (₹)** or **Percentage discount (%)**.
- Dynamic real-time preview against order subtotal before taxes.

### 3. Settlement Amount & Waived Off Monitoring
- During payment collection, the **Settlement Amount** defaults to the exact **Grand Total**.
- If management rounds down or waives a fraction (e.g., bill is ₹524, customer pays ₹500), entering ₹500 automatically records:
  - `settledAmount = ₹500` (credited to till/account and daily sales)
  - `waivedAmount = ₹24` (recorded for discrepancy audits and loss monitoring)

### 4. Single Daily Sales Consolidation
- Every POS order settled throughout the day automatically updates and bifurcates into **one consolidated daily sales row** in Indian Standard Time (IST, UTC+05:30).
- Cash collections flow into `paymentBreakdown.cash` and UPI/Card into their respective fields without polluting the database with hundreds of redundant rows.

### 5. Multi-Device Distributed Print Station & Chrome Silent Auto-Print
- **Multi-Device Architecture**:
  - **Mobile Waiter Devices**: Waiters take orders on phones or tablets connected to the web app (hosted on Vercel or local network). When placing an initial order or adding a KOT round, the mobile device saves the order directly to the MongoDB database without popping open a local print dialog, displaying a confirmation toast: *"KOT sent to Counter Printer 🖨️"*.
  - **Central Windows Counter Laptop**: Connected physically (via USB) to the 80mm thermal receipt printer. It runs Chrome with the POS page (`/tables`) open and the **"Print Station"** mode toggled **ON** in the header.
  - **Automated Database Reconciliation**: The Print Station polls `GET /api/orders/pending-kots` every 2.5 seconds. Whenever a new KOT round is created or queued by any mobile device, the station immediately formats the 80mm slip, sends it silently to the Windows default thermal printer via `printKOT(job, 'production')`, and marks it as `printed: true` in the DB via `POST /api/orders/:orderId/rounds/:roundId/mark-printed`.
  - **Remote KOT Reprint**: Waiters on mobile devices can tap "Send KOT to Printer" on any active order to queue an immediate reprint on the counter printer without leaving the guest's table.
  - **In-Flight Deduplication**: Prevents duplicate concurrent prints during polling using in-memory job locking (`inFlightKotsRef`).
- **🚀 Production Mode (Default)**: Automatically sends KOTs and Bills straight to the default thermal printer via a hidden print iframe without opening preview dialogs.
- **Bypassing Chrome Print Dialog & True Kiosk Mode on Windows**:
  - By default, standard Chrome security displays a print dialog and browser chrome (tabs, search bar).
  - **On Windows Counter Laptop**:
    1. Double-click [`start-kiosk.bat`](file:///Users/kishalaya/Downloads/peyala_v8/start-kiosk.bat) (or run with your Vercel URL):
       ```cmd
       start-kiosk.bat https://your-pos-app.vercel.app/tables
       ```
    2. The script prompts you for your POS URL on first run and saves it to `kiosk-url.txt` so every future launch is instant.
    3. It launches Chrome in **True Full-Screen Kiosk Mode** (`--kiosk`) with **Silent Auto-Printing** (`--kiosk-printing`) and appends `?printStation=true` to automatically activate Print Station mode without any manual clicks.
    4. **Create a Desktop Shortcut**: Run [`create-windows-shortcut.bat`](file:///Users/kishalaya/Downloads/peyala_v8/create-windows-shortcut.bat) to place a 1-click **"Peyala POS Station"** icon on the Windows desktop.
    5. **Keyboard Shortcuts**: Press `Alt + F4` to close the kiosk, or `F11` to toggle fullscreen. To run in a clean app window with a title bar instead of fullscreen, run `start-kiosk.bat --windowed`.
  - **On macOS**: Run `./start-kiosk.sh` or double-click `start-kiosk.command`.
- **🧪 Test Mode**: Renders a photorealistic 80mm receipt preview in an interactive modal with direct print preview.
- **Zero Top Whitespace in KOT & Bill PDFs**:
  - `@page { margin: 0 !important; }` and zero user-agent CSS margins strip out Chrome's automatic 20mm print header space, ensuring KOTs and bills start right at the top of the thermal roll and PDF without wasted paper.


### 6. Role-Based Access Control (RBAC)
- **Admin**: Full authority to create tables, open orders, add KOT rounds, adjust item status, apply discounts, finalize bills, collect payments, and manage users.
- **Staff / Manager**: Read-only visibility into live table occupancy and active orders with customer receipt reprinting capabilities (`Print Bill` and `Print KOT`). Mutation endpoints return HTTP 403 Forbidden.

### 7. Mobile-First Responsive Design
- Every page, table, and modal is responsive down to 375px mobile viewports (iPhone/Android).
- Fixed bottom mobile navigation bar never covers content (`pb-28 md:pb-8 safe-bottom`).
- Tables feature smooth horizontal scrolling (`overflow-x-auto`).
- Modals adjust padding and vertically center without overflowing screen bounds.

### 8. High-Contrast Light Mode Attendance UI
- Bold, vibrant, accessible status badges for **Present (P - Emerald)**, **Absent (A - Rose)**, **Leave (L - Amber)**, and **Half Day (H - Blue)** with crisp white text.
- High-contrast sticky headers, sticky Staff member columns with drop shadows, and clean single-row Monthly Summary metrics (P, A, H, Leaves).
- Distinguishable cell states: past editable dates with dashed borders and hover states vs. dimmed future dates.
- Clean high-contrast sidebar legend, notes summary cards, and quick bulk action tools.


---

## 🚀 Quick Start (Local Setup)

### Prerequisites
- **Node.js**: v18.0.0 or higher ([Download](https://nodejs.org))
- **MongoDB**: Community Server running on `localhost:27017` ([Download](https://www.mongodb.com/try/download/community))

### Automated Installation (macOS / Linux)
```bash
# 1. Clone or navigate to the repository
cd peyala_v8

# 2. Make helper scripts executable and run installer
chmod +x install.sh start.sh
./install.sh

# 3. Start development servers
./start.sh
```

### Manual Start (Two Terminals)

**Terminal 1 — Backend:**
```bash
cd backend
npm install
npm run dev
# Server starts on http://localhost:5000
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm install
npm run dev
# Next.js app starts on http://localhost:3000
```

Open **http://localhost:3000** in your browser.

---

## 🐳 Docker Deployment

To launch Peyala via Docker Compose:
```bash
docker-compose up -d
```
To seed initial admin accounts and default tables:
```bash
docker exec peyala-backend node src/utils/seed.js
```

---

## 🔐 Default Credentials

| Field | Value |
|-------|-------|
| **Email** | `admin@peyala.com` |
| **Password** | `peyala123` |
| **Role** | `admin` |

> [!WARNING]
> Please change the default admin password immediately in **Settings → Security** upon first deployment.

---

## 🗂 Project Architecture

```
peyala_v8/
├── README.md               # User & operational documentation (Always kept up to date)
├── MEMORY_BANK.md          # Architectural context & design decisions for AI/dev handoffs
├── docker-compose.yml      # Container orchestration
├── install.sh              # One-step dependency installer & DB seeder
├── start.sh                # Concurrent background runner
├── start-kiosk.bat         # Windows Chrome kiosk launcher for silent auto-printing
├── create-windows-shortcut.bat # Windows Desktop 1-click shortcut generator
├── start-kiosk.sh          # macOS/Linux Chrome kiosk launcher
├── start-kiosk.command     # macOS Desktop double-clickable kiosk launcher
│
├── backend/
│   ├── src/
│   │   ├── config/         # MongoDB Mongoose connection
│   │   ├── middleware/     # JWT Auth (`auth`) & Admin role verification (`adminOnly`)
│   │   ├── models/         # Database Schemas
│   │   │   ├── Table.js            # Dining tables (number, capacity, status)
│   │   │   ├── Order.js            # Live POS orders, items, KOT rounds, discounts, settlement
│   │   │   ├── MenuItem.js         # Menu item catalog (veg/non-veg, price, GST)
│   │   │   ├── MenuCategory.js     # Menu categories (sort order, active state)
│   │   │   ├── SalesEntry.js       # Daily consolidated sales
│   │   │   ├── PurchaseEntry.js    # Raw material inventory purchases
│   │   │   ├── Account.js          # Bank & Cash accounts
│   │   │   ├── Supplier.js         # Vendor profiles & dues
│   │   │   ├── Staff.js            # Employee directory & salary
│   │   │   ├── Attendance.js       # Monthly staff attendance
│   │   │   ├── Payment.js          # Expense tracking
│   │   │   ├── Receipt.js          # Inflow tracking
│   │   │   ├── Transfer.js         # Account-to-account fund transfers
│   │   │   └── User.js             # System users & auth roles
│   │   ├── routes/         # Express REST API routes
│   │   │   ├── orders.js           # Order lifecycle, KOTs, billing, settlement (Admin protected)
│   │   │   ├── tables.js           # Table CRUD & live occupancy
│   │   │   ├── menu.js             # Menu items & categories
│   │   │   ├── sales.js            # Consolidated daily sales
│   │   │   ├── reports.js          # P&L, Daily summary, Detailed Sales Report
│   │   │   ├── purchases.js        # Inventory purchase orders
│   │   │   ├── attendance.js       # Attendance & leave caps
│   │   │   └── ...                 # Accounts, payments, receipts, suppliers, staff, backup
│   │   ├── utils/          # Audit logging, date helpers (IST boundaries), seed data
│   │   └── server.js       # Express server initialization
│   ├── package.json
│   └── .env
│
└── frontend/
    ├── src/
    │   ├── app/            # Next.js 15 App Router pages
    │   │   ├── tables/             # Dine-In POS & Table grid
    │   │   ├── menu/               # Menu & category management
    │   │   ├── reports/            # Detailed Sales Report, P&L, Daily report
    │   │   ├── sales/              # Daily sales ledger & platform settlements
    │   │   ├── purchases/          # Purchase orders & raw material receipts
    │   │   ├── dashboard/          # Operational executive dashboard
    │   │   ├── staff/              # Staff profiles & payroll
    │   │   ├── attendance/         # Attendance calendar grid
    │   │   ├── balancesheet/       # Balance sheet (Assets, Liabilities, Equity)
    │   │   ├── accounts/           # Accounts & transfers
    │   │   ├── payments/           # Outgoing payments
    │   │   ├── receipts/           # Incoming receipts
    │   │   ├── suppliers/          # Suppliers ledger
    │   │   ├── settings/           # User management & audit logs
    │   │   └── login/              # Login screen
    │   ├── components/
    │   │   ├── layout/AppLayout.tsx # Responsive shell, sidebar, mobile bottom navigation
    │   │   ├── ui/Modal.tsx        # Responsive modal dialogs
    │   │   ├── ui/ThermalPreviewModal.tsx # 80mm receipt preview & PDF exporter
    │   │   └── dashboard/StatCard.tsx
    │   ├── lib/
    │   │   ├── api.ts              # Core backend API client
    │   │   ├── pos-api.ts          # POS, Table, Order & Menu API wrappers
    │   │   ├── thermal-print.ts    # ESC/POS & HTML 80mm thermal print engine
    │   │   ├── auth.tsx            # React authentication context & session persistence
    │   │   └── utils.ts            # Currency formatters, local date builders
    │   └── package.json
```

---

## 🔌 Primary API Endpoints

### Dining Tables & POS Orders
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET` | `/api/tables` | Authenticated | List all tables with live active orders |
| `POST` | `/api/tables` | `adminOnly` | Create new dining table |
| `PUT` | `/api/tables/:id` | `adminOnly` | Update table name/capacity/status |
| `DELETE` | `/api/tables/:id` | `adminOnly` | Remove unoccupied table |
| `POST` | `/api/orders` | `adminOnly` | Open table order & generate Round 1 KOT |
| `POST` | `/api/orders/:id/items` | `adminOnly` | Add items as subsequent KOT round |
| `GET` | `/api/orders/pending-kots` | Authenticated | Poll unprinted KOT rounds for Counter Print Station |
| `POST` | `/api/orders/:orderId/rounds/:roundId/mark-printed` | Authenticated | Acknowledge KOT round printed by Print Station |
| `POST` | `/api/orders/:orderId/rounds/:roundId/reprint` | Authenticated | Re-queue specific KOT round for printing |
| `POST` | `/api/orders/:orderId/reprint` | Authenticated | Re-queue full active order KOT for Counter Print Station |
| `PATCH` | `/api/orders/:id/items/:itemId` | `adminOnly` | Update item status (`pending`, `preparing`, `served`) |
| `DELETE` | `/api/orders/:id/items/:itemId` | `adminOnly` | Soft-cancel an ordered item with note |
| `PATCH` | `/api/orders/:id/discount` | `adminOnly` | Apply Flat (₹) or Percentage (%) discount |
| `POST` | `/api/orders/:id/bill` | `adminOnly` | Finalize bill for guest review |
| `POST` | `/api/orders/:id/pay` | `adminOnly` | Collect payment, record settlement & waived amount, free table |
| `POST` | `/api/orders/:id/cancel` | `adminOnly` | Cancel live order and free table |

### Menu & Categories
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET` | `/api/menu/items` | Authenticated | List menu items with optional category/veg filters |
| `POST` | `/api/menu/items` | Authenticated | Create new menu item |
| `PUT` | `/api/menu/items/:id` | Authenticated | Update menu item details/pricing |
| `GET` | `/api/menu/categories` | Authenticated | List all menu categories |
| `POST` | `/api/menu/categories` | Authenticated | Create category |

### Reporting & Analytics
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET` | `/api/reports/sales` | Authenticated | Detailed order-by-order sales log, KOT details, waived sums |
| `GET` | `/api/reports/pnl` | Authenticated | Profit & Loss statement for date range |
| `GET` | `/api/reports/daily` | Authenticated | Daily operational overview |

---

## 🛠 Verification & Quality Assurance

Run frontend typechecks and backend syntax validation:

```bash
# 1. Frontend TypeScript Validation
cd frontend
npx tsc --noEmit
# Must exit with code 0

# 2. Backend JavaScript Syntax Validation
cd ../backend
node --check src/server.js
node --check src/middleware/auth.js
node --check src/routes/orders.js
node --check src/routes/tables.js
node --check src/routes/menu.js
node --check src/routes/sales.js
node --check src/routes/reports.js
```

---

Built with pride for **Peyala Café & Restaurant** · Howrah, West Bengal 🍵
