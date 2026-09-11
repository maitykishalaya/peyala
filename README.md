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
| **Staff & Attendance** | `/staff`, `/attendance` | Employee directory, monthly attendance calendar with leave cap enforcement, advances, bonuses, and salary disbursals. |
| **Balance Sheet** | `/balancesheet` | Dynamic statement of Assets (bank/cash accounts), Liabilities (GST liability, supplier dues, loans), and Net Equity. |
| **Settings & Security** | `/settings` | Role-based user administration, audit logging, payment categories, database backup/restore, and dark/light mode. |

---

## 🌟 Key Highlights & Operational Capabilities

### 1. Dine-In POS & Multi-Round Kitchen Order Tickets (KOT)
- **High-Density Half-Size Table Grid**: Compact responsive grid (2-3 columns on mobile, 4-6 on laptop, up to 8 on desktop) displaying 24+ tables simultaneously on screen without scrolling. Seating capacity clutter has been removed.
- **Live KOT Elapsed Minutes Indicator**: Occupied tables feature a live badge displaying minutes passed since KOT creation (e.g. `12m`), with color-coded wait times (blue for fresh, amber for 15–30m, red for ≥ 30m) auto-updating every 30 seconds.
- **Table Grid States**: Visual color-coded table states (Green: *Available*, Red: *Occupied*, Yellow: *Reserved*).
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

### 4. Zero-Quota Background Caching & Manual Refresh Architecture
- **Strict Free-Hosting Quota Protection**:
  - To prevent exhausting free-tier hosting limits (Vercel serverless function executions, Render backend spins, and MongoDB Atlas quotas), aggressive automatic window `focus` listeners and background periodic polling have been **eliminated** across all operational reporting and management screens.
  - The following 11 modules exclusively serve data from browser storage (`localStorage`) upon navigation:
    1. **Dashboard** (`peyala_dashboard_cache_v1`)
    2. **Sales** (`peyala_sales_list_cache_v1`)
    3. **Accounts** (`peyala_accounts_cache_v1`)
    4. **Inventory** (`peyala_inventory_cache_v1`)
    5. **Purchases** (`peyala_purchases_list_cache_v1` & `peyala_purchases_refdata_cache_v1`)
    6. **Suppliers** (`peyala_suppliers_cache_v1`)
    7. **Payments** (`peyala_payments_cache_v1`)
    8. **Staff** (`peyala_staff_cache_v1`)
    9. **Attendance** (`peyala_attendance_staff_cache_v1` & `peyala_attendance_{year}_{month}_v1`)
    10. **Balance Sheet** (`peyala_balancesheet_cache_v1`)
    11. **Reports** (`peyala_reports_sales_cache_v1`, `peyala_reports_daily_cache_v1`, `peyala_reports_pnl_cache_v1`)
  - **Manual "Refresh" Button with Live Timestamp**: Every single one of these modules features a standard `Refresh` button with an animated spinner and a `Cached (HH:MM)` indicator in its header. Data is only requested from the remote database when the user explicitly clicks Refresh (or upon very first visit if local cache is empty).
  - **Single Daily Sales Consolidation**: Every POS order settled throughout the day automatically updates and bifurcates into **one consolidated daily sales row** in Indian Standard Time (IST, UTC+05:30) without creating redundant individual sales rows. When payment is collected on `/tables`, it automatically purges `peyala_sales_list_cache_v1` so the next visit to `/sales` fetches the fresh numbers once.
  - **Explicit POS Exception (`/tables`)**: The `/tables` Dine-In POS page does **NOT** cache live floor orders in `localStorage`. It always stays fresh after every request (order creation, add-on rounds, status updates, bill finalization, and payment collection). The counter Print Station background polling runs at 4000ms and pauses automatically whenever the browser tab is hidden or laptop screen locked.

### 5. Multi-Device Distributed Print Station & Chrome Silent Auto-Print
- **Multi-Device Architecture**:
  - **Mobile Waiter Devices**: Waiters take orders on phones or tablets connected to the web app (hosted on Vercel or local network). When placing an initial order or adding a KOT round, the mobile device saves the order directly to the MongoDB database without popping open a local print dialog, displaying a confirmation toast: *"KOT sent to Counter Printer 🖨️"*.
  - **Central Windows Counter Laptop**: Connected physically (via USB) to the 80mm thermal receipt printer. It runs Chrome with the POS page (`/tables`) open and the **"Print Station"** mode toggled **ON** in the header.
  - **Automated Database Reconciliation**: The Print Station polls `GET /api/orders/pending-kots` every 4 seconds (automatically pausing when minimized or screen is locked to conserve serverless quota). Whenever a new KOT round is created or queued by any mobile device, the station immediately formats the 80mm slip, sends it silently to the Windows default thermal printer via `printKOT(job, 'production')`, and marks it as `printed: true` in the DB via `POST /api/orders/:orderId/rounds/:roundId/mark-printed`.
  - **Remote KOT Reprint**: Waiters on mobile devices can tap "Send KOT to Printer" on any active order to queue an immediate reprint on the counter printer without leaving the guest's table.
  - **In-Flight Deduplication**: Prevents duplicate concurrent prints during polling using in-memory job locking (`inFlightKotsRef`).
- **🚀 Production Mode (Default)**: Automatically sends KOTs and Bills straight to the default thermal printer via a hidden print iframe without opening preview dialogs.
- **Bypassing Chrome Print Dialog & True Kiosk Mode on Windows**:
  - By default, standard Chrome security displays a print dialog and browser chrome (tabs, search bar).
  - **On Windows Counter Laptop**:
    1. Double-click [`start-kiosk.bat`](file:///Users/kishalaya/Downloads/peyala_v8/start-kiosk.bat):
       Hardcoded by default to **`https://peyala.vercel.app/login`**.
    2. It launches Chrome in **True Full-Screen Kiosk Mode** (`--kiosk`) with **Silent Auto-Printing** (`--kiosk-printing`) targeting `https://peyala.vercel.app/login`.
    3. **Create a Desktop Shortcut**: Run [`create-windows-shortcut.bat`](file:///Users/kishalaya/Downloads/peyala_v8/create-windows-shortcut.bat) to place a 1-click **"Peyala POS Station"** icon on the Windows desktop.
    4. **Keyboard Shortcuts**: Press `Alt + F4` to close the kiosk, or `F11` to toggle fullscreen. To run in a clean app window with a title bar instead of fullscreen, run `start-kiosk.bat --windowed`.
  - **On macOS**: Run `./start-kiosk.sh` or double-click `start-kiosk.command` (also defaults to `https://peyala.vercel.app/login`).
- **🧪 Test Mode**: Renders a photorealistic 80mm receipt preview in an interactive modal with direct print preview.
- **Zero Top Whitespace in KOT & Bill PDFs**:
  - `@page { margin: 0 !important; }` and zero user-agent CSS margins strip out Chrome's automatic 20mm print header space, ensuring KOTs and bills start right at the top of the thermal roll and PDF without wasted paper.


### 6. Item Variants & Add-ons Engine
- **Portion Variants (e.g. Half Plate vs. Full Plate)**:
  - Menu items can enable portion variants with individual portion pricing.
  - When ordering in POS (`/tables`), selecting an item with variants opens an interactive customization pop-up prompting the cashier/waiter to select the portion (e.g., Half Plate ₹120, Full Plate ₹200).
  - Preserves 1-tap fast addition for standard items without variants or add-ons.
- **Add-ons & Extras System (e.g. Cheese, Dips, Extra Gravy)**:
  - Dedicated Add-ons catalog (`/api/addons`) managed via the "Manage Add-ons" modal on `/menu`.
  - Add-ons can be assigned directly to specific menu items or globally to entire categories (`defaultAddons`, e.g. Cheese on all Burgers).
  - During POS ordering, applicable add-ons are displayed with Veg/Non-Veg badges and dynamic line total calculations.
  - All chosen variants and add-ons are snapshotted in order documents and itemized cleanly on 80mm KOT kitchen tickets and customer receipts.

### 7. Role-Based Access Control (RBAC)
- **Admin**: Full authority to create/delete physical tables, open orders, add KOT rounds, adjust item status, apply discounts, finalize bills, collect payments, manage menu/addons, administer user accounts, and **edit/delete settled bills with automatic financial reversals**.
- **Manager**: Full operational POS & Floor authority — can open orders, dispatch KOT rounds, modify item preparation states, soft-cancel items, apply discounts, finalize bills, record payment settlements, clear reservations, and manage menu items/add-ons. Settled bill editing/deletion, physical table floor-plan creation/deletion, and user management remain strictly restricted to Administrators.
- **Staff**: Read-only POS visibility into live table occupancy and active orders with receipt/KOT reprinting capabilities (`Print Bill` and `Print KOT`). Order mutations return HTTP 403 Forbidden.

### 8. Admin-Only Settled Bill Editing, Deletion & Automatic Accounting Reversals
- **Strict Role Restriction (`adminOnly`)**:
  - Only authenticated users with the `admin` role can modify or delete paid (`status: 'paid'`) bills. Managers and staff are prevented both at API endpoint level (`HTTP 403 Forbidden`) and in the user interface.
- **Detailed Sales Report Exclusive Access (`/reports`)**:
  - In accordance with operational requirements, settled bill modifications are managed exclusively within the **Detailed Sales Report** (`/reports`), keeping live POS floor operations uncluttered.
  - Features quick-action row buttons (`Pencil` for Edit, `Trash2` for Delete) and prominent actions inside the expanded order details panel.
- **Automatic Financial Reconciliations & Reversals**:
  1. **Account Balances**:
     - *Deletion*: Deducts original settled amount from Cash Counter (cash) or Current Account / Bank (upi, card, other).
     - *Modification*: Reverses previous credit from original account and applies updated settlement amount to selected account.
  2. **Daily Sales Register (`SalesEntry`)**:
     - Automatically targets the consolidated sales record matching the order's settlement date in Indian Standard Time (IST, UTC+05:30).
     - Decrements the old payment mode breakdown (`cash`, `upi`, `card`, `bankTransfer`), increments the new payment mode breakdown, and recalculates total daily revenue and outlet sales.
  3. **GST Liability Reversal & Audit Trail (`BalanceSheet`)**:
     - Decrements/adjusts output GST liability in the company balance sheet (`BalanceSheet.gstLiability`).
     - Appends an audit note to `BalanceSheet.gstLog` recording bill number, timestamp, and amount adjusted.
  4. **Multi-Module Cache Invalidation**:
     - Automatically purges client-side localStorage caches across all 7 financial modules (`peyala_reports_sales_cache_v1`, `peyala_reports_daily_cache_v1`, `peyala_reports_pnl_cache_v1`, `peyala_sales_list_cache_v1`, `peyala_accounts_cache_v1`, `peyala_balancesheet_cache_v1`, `peyala_dashboard_cache_v1`).
- **Interactive Live Financial Diff & Item Editor**:
  - Modify item quantities, remove items, or add new items directly from the active menu catalog with variant selection.
  - Adjust Flat or Percentage discounts.
  - Change settlement payment method (Cash, UPI, Card, Other) or custom settled amount with automatic waived-off calculation.
  - Displays a live **Accounting Impact Preview** showing exact net change in settlement amount, account adjustments, and GST liability before saving.

### 9. Part Payment (Split Payment) Multi-Account Settlement Engine
- **Split Payment Workflow (e.g. ₹100 Cash + ₹20 UPI for ₹120 Bill)**:
  - Supports customer bill settlement split across multiple payment modes (**Cash Counter**, **UPI / QR**, **Card / POS**, **Other / Bank**).
  - Live allocation feedback in the POS (`/tables`): Displays total allocated, remaining balance with 1-tap **"+ Fill"** auto-completion buttons, and status indicator (exact match vs. waived off discrepancy vs. over-allocated alert).
- **Automated Multi-Account Ledger Settlements**:
  - Automatically routes and credits the cash portion (`paymentBreakdown.cash`) to the **Cash Counter** (`type: 'cash'`).
  - Automatically routes and credits all digital/bank portions (`upi`, `card`, `other`) to the **Current Account / Bank** (`type: { $in: ['bank', 'digital'] }`).
- **Daily Sales Register Bifurcation (`SalesEntry`)**:
  - Slices and increments individual daily buckets: `paymentBreakdown.cash`, `paymentBreakdown.upi`, `paymentBreakdown.card`, and `paymentBreakdown.bankTransfer`.
  - Maintains a single consolidated IST daily sales row without duplicate entries.
- **Detailed 80mm Thermal Receipts**:
  - Customer receipts render a bold `PART PAYMENT (PAID)` header and an itemized split subline: `Cash: ₹100.00 | UPI: ₹20.00`.
- **Full Auditability & Admin Reversals (`/reports`)**:
  - **Filter**: Filter sales report specifically by "Part Payment".
  - **Table Badge & Expanded Card**: Renders amber `PART` badge with split amounts and detailed split breakdown card.
  - **Admin Edit Modal**: Fully supports changing to/from Part Payment or adjusting split amounts with live multi-account reconciliation preview (`Cash Counter: +₹...`, `Bank / Digital: -₹...`).
  - **Admin Delete Modal**: Outlines exact deductions debited from Cash Counter and Bank account before permanent erasure.

### 10. Mobile-First Responsive Design & Desktop Drawer Auto-Minimisation
- **Full Viewport Sizing & Unconstrained Page Scrolling**:
  - **Screen-Locked Viewport (`h-screen h-[100dvh] max-h-screen`)**: App container is strictly bounded to the exact device viewport height, eliminating vertical clipping bugs where content exceeded viewport boundaries without scrolling.
  - **Flexbox Scroll Constraints (`min-h-0 h-full overflow-y-auto`)**: The main content wrapper utilizes `min-h-0` on all flex parents, ensuring vertical overflow triggers smooth internal scrolling across every page (Tables, Reports, Sales, Attendance, Dashboard, Menu, Inventory, etc.).
  - **Generous Bottom Padding (`pb-36 md:pb-24`)**:
    - **Mobile Viewports**: Generous `pb-36` (144px / 9rem) bottom padding guarantees the fixed bottom mobile navigation bar (~60px) never covers bottom cards, buttons, totals, or form inputs.
    - **Desktop/Laptop Viewports**: `md:pb-24` (96px / 6rem) bottom padding provides clean visual breathing room at the bottom of the table floor plan and data tables.
  - **Scrollable Modals (`max-h-[92dvh] sm:max-h-[88dvh]`)**: All modal dialogs (Order Details, Add Table, Customize Item, Sales Entry, Edit Settled Bill) operate with flex-column headers and `overflow-y-auto flex-1 min-h-0 pb-8` bodies, preventing bottom action buttons from being cut off.
- **Mobile Viewports (< 768px) — Clean, Drawer-Free Layout**:
  - **No Side Navigation Drawer**: The side drawer and backdrop are completely removed on mobile (`hidden md:flex`) so screen space is 100% unobstructed.
  - **Bottom Mobile Navigation Bar**: Mobile operators navigate smoothly using the dedicated, horizontally-scrollable bottom navigation bar (`<footer className="md:hidden ...">`).
  - **Mobile Topbar**: Features the brand logo icon, current page title, dark mode toggle, and a dedicated 1-tap mobile logout button. The desktop hamburger button is hidden.
- **Bigger Screens (Laptops & Desktops ≥ 768px) — Persistent Auto-Minimizing Drawer**:
  - **Compact Default**: Defaults to a compact 64px (`w-16`) icon rail, maximizing screen real estate for the high-density dining table grid, POS order panels, and data tables.
  - **Auto-Minimization Triggers**:
    - **Clicking Any Page Link**: Clicking on any navigation link in the drawer immediately auto-minimizes the drawer to the 64px icon rail and persists `localStorage.setItem('peyala_sidebar_open', 'false')`.
    - **Navigating to Tables**: Navigating to or loading the **Tables** page (`/tables`) always auto-minimizes the drawer.
    - **Clicking Page Content**: If the drawer is expanded, clicking anywhere on page content (`<main>`, including dining table cards or background) immediately auto-minimizes the drawer.
  - **Strict State Persistence**: Once minimized, **it stays strictly minimized across all pages and route navigations** unless explicitly expanded by the operator.
  - **Explicit User Control**: The topbar hamburger button (`hidden md:flex`) allows toggling between expanded (`w-60`) and minimized (`w-16`).
  - **Minimized Mode Enhancements**: Icons are centered, the brand logo scales down cleanly to 32px, and native hover tooltips (`title={label}`) display the section name.
- Every page, table, and modal is responsive down to 375px mobile viewports (iPhone/Android).
- Tables feature smooth horizontal scrolling (`overflow-x-auto`).

### 11. High-Contrast & Mobile-Optimized Attendance UI
- Bold, vibrant, accessible status badges for **Present (P - Emerald)**, **Absent (A - Rose)**, **Leave (L - Amber)**, and **Half Day (H - Blue)** with crisp white text.
- **Congestion-Free Mobile Layout**:
  - Staff member column scales responsively (`w-28 sm:w-40 md:w-56`) so phone viewports dedicate over 260px of screen real estate to the days.
  - The Summary column is sticky only on desktop (`lg:sticky lg:right-0`), completely preventing mobile viewports from being sandwiched between two overlapping sticky pillars.
  - Mobile quick navigation bar includes one-tap jump buttons (`Staff`, `📅 Today`, `Summary 📊`) and a horizontal swipe prompt.
  - Automatically scrolls to and centers today's date upon loading the current month.
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
