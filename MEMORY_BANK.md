# Peyala v8 — Comprehensive Memory Bank

> [!IMPORTANT]
> **MANDATORY MAINTENANCE RULE**:
> **Whenever you make any significant change to this codebase, you MUST update both `README.md` and `MEMORY_BANK.md`.**
> This ensures project documentation and developer/AI context never drift from the live implementation.

---

## 1) Mission & Project Intent

Peyala v8 is a production-grade restaurant operations and management system built for **Peyala Café & Restaurant** (Howrah, West Bengal). It unifies:
1. **Dine-In POS & Table Management** (live floor status, guest seating, multi-round KOT dispatch, item status tracking, billing, and settlements).
2. **Thermal Printing Engine** (80mm KOT tickets & customer bills, with seamless toggle between visual preview/PDF in Test Mode and silent printing in Production Mode).
3. **Consolidated Sales Accounting** (single auto-updating daily sales row in IST + Zomato/Swiggy net settlements).
4. **Detailed Order Auditing** (granular sales report with order timeline, KOT history, waived amount loss tracking, and CSV export).
5. **Inventory & Costing** (raw material procurement, supplier ledgers, weighted average unit cost [WAC] calculation).
6. **Financial Operations** (multi-account ledger, outgoing payments, double-entry style balance sheet, and P&L statements).
7. **Staff & Payroll** (employee directory, monthly attendance calendar with leave cap enforcement, advances, bonuses, and salary disbursal).

---

## 2) Executive Summary of Architecture & System State

### Backend
- **Framework**: Node.js & Express.js (`backend/src/server.js`).
- **Database**: MongoDB via Mongoose (`backend/src/config/db.js`).
- **Authentication & RBAC**: JWT Bearer token via `auth` middleware, with role enforcement via `adminOnly` (for structural table layout changes, user administration) and `managerOrAdmin` (for operational POS orders, KOT rounds, billing, discounts, settlements, and table status updates) in `backend/src/middleware/auth.js`.
- **Timezone Standardization**: All daily consolidation and reporting logic operates strictly under Indian Standard Time (`Asia/Kolkata`, UTC+05:30) via `backend/src/utils/date.js` (`getIstDayRange()`).

### Frontend
- **Framework**: Next.js 15 (App Router), React 18/19, TypeScript (`frontend/`).
- **Styling**: Tailwind CSS with dark/light theme support.
- **State & Data Access**: Dedicated API clients (`frontend/src/lib/api.ts` and `frontend/src/lib/pos-api.ts`), React Context for Auth (`frontend/src/lib/auth.tsx`).
- **Printing**: Thermal print abstraction (`frontend/src/lib/thermal-print.ts`) supporting ESC/POS styling, HTML print frames, and visual canvas/PDF rendering via `ThermalPreviewModal.tsx`.
- **Responsive Layout, Screen Height Locking, Bottom Padding & Desktop Auto-Minimizing Drawer**: Mobile-first architecture across all screens down to 375px viewports (`AppLayout.tsx`, `Modal.tsx`). Full viewport height is strictly bounded (`h-screen h-[100dvh] max-h-screen`) with flex child shrinking (`min-h-0 h-full overflow-y-auto`), completely eliminating vertical content clipping and enabling smooth internal scrolling across all pages. Generous bottom padding (`pb-36` / 144px on mobile, `md:pb-24` / 96px on desktop) ensures the fixed bottom navigation bar (~60px) and window edge never cover or overlap bottom content, totals, or action buttons. On mobile viewports (`< 768px`), the side navigation drawer and backdrop are completely removed (`hidden md:flex`), navigating cleanly via the native bottom navigation bar and mobile topbar. On laptops/desktops (`>= 768px`), the navigation drawer operates with the persistent auto-minimization rail (`w-16` / `w-60`) governed by `peyala_sidebar_open`.

---

## 3) Core Business Rules & Implemented Workflows

### 3.1 Dine-In POS & Table Lifecycle
1. **Table States**:
   - `available`: Table is clean and ready. Tap opens menu picker to seat guests and launch the initial order.
   - `occupied`: Active order in progress. Tap opens live order management modal.
   - `reserved`: Reserved for upcoming guests.
2. **Order Lifecycle**:
   - `open`: Initial order placed, Round 1 KOT dispatched.
   - Additional rounds can be added at any time via `+ Add KOT Round`. Each add-on dispatches an incremental KOT ticket (`[ROUND X - ADD-ON]`) without re-printing earlier rounds.
   - Item statuses transition: `pending` → `preparing` → `served` (or `cancelled` with reason note).
   - `billed`: Finalized bill printed for guest. Table remains occupied until payment is recorded.
   - `paid`: Payment collected, settlement recorded, table automatically freed back to `available`.
   - `cancelled`: Order aborted, table freed.
3. **High-Density Half-Size Table Grid & Live KOT Wait Minutes**:
   - Table cards are half their previous size (2-3 cols on mobile, 4-6 on laptop, up to 8 on wide desktop, ~105px min height), displaying 24+ tables in a single viewport without scrolling.
   - Seating capacity clutter removed from table cards, modal titles, and creation forms.
   - Occupied tables display a live badge showing elapsed minutes since KOT creation (`<Clock /> {kotMins}m`), color-coded by service urgency (blue for < 15m, amber for 15–30m, red for ≥ 30m), auto-updating every 30 seconds via a live timer.

### 3.2 Dual Discount Engine
- Operators can toggle between **Flat Discount (₹)** and **Percentage Discount (%)**.
- Discount is calculated on `subtotal` before taxes.
- Percentage discount is capped between 0% and 100%.
- Saved on `Order` as `discount`, `discountType`, and `discountValue`, printed on customer receipts.

### 3.3 Settlement Amount & Waived Off Loss Tracking
- During payment collection on a billed order, the **Settlement Amount** input defaults to the exact `grandTotal`.
- If the customer is granted a concession or change is rounded down:
  - `settledAmount`: Actual amount collected (e.g. ₹500). Credited to the cash/bank account and daily sales.
  - `waivedAmount`: Difference `Math.max(0, grandTotal - settledAmount)` (e.g. ₹24).
  - An amber discrepancy alert is rendered in the UI, recorded on the order, and logged in audit trails.
  - Accounts and sales entries are never artificially inflated by the waived amount.

### 3.4 Single Daily Sales Row Consolidation (IST) & Instant UI Sync
- Collecting POS orders does **NOT** create individual rows in the daily sales register.
- All order settlements on a calendar day locate today's single `SalesEntry` using `getIstDayRange()` in Indian Standard Time (`Asia/Kolkata`).
- Atomically increments `outletSales`, `paymentBreakdown.cash`, `paymentBreakdown.upi`, `paymentBreakdown.card`, and `paymentBreakdown.bankTransfer`.
- Creates the entry if it's the first order of the day; updates the existing entry for all subsequent orders.
- Exactly **one consolidated row** is maintained per calendar day.
### 3.4 Zero-Quota Background Caching & Manual Refresh Architecture
- To strictly prevent exhausting free-tier hosting quotas (Vercel serverless execution seconds, Render free tier spins, and Mongo Atlas operations):
  1. Aggressive tab-focus polling (`window.addEventListener('focus')`) has been completely stripped across all management modules.
  2. Data across the following 11 operational modules is stored in and served directly from browser `localStorage`:
     - **Dashboard**: `peyala_dashboard_cache_v1`
     - **Sales**: `peyala_sales_list_cache_v1`
     - **Accounts**: `peyala_accounts_cache_v1`
     - **Inventory**: `peyala_inventory_cache_v1`
     - **Purchases**: `peyala_purchases_list_cache_v1` & `peyala_purchases_refdata_cache_v1`
     - **Suppliers**: `peyala_suppliers_cache_v1`
     - **Payments**: `peyala_payments_cache_v1`
     - **Staff**: `peyala_staff_cache_v1`
     - **Attendance**: `peyala_attendance_staff_cache_v1` & `peyala_attendance_{year}_{month}_v1`
     - **Balance Sheet**: `peyala_balancesheet_cache_v1`
     - **Reports**: `peyala_reports_sales_cache_v1`, `peyala_reports_daily_cache_v1`, `peyala_reports_pnl_cache_v1`
  3. **Manual "Refresh" Control**: Each page header features a standardized `Refresh` button with an active rotation spinner and a `Cached (HH:MM)` indicator. Navigating through tabs or switching pages makes **0 network requests**, rendering the local cache instantaneously.
  4. Server calls are ONLY triggered when:
     - The operator explicitly clicks the "Refresh" button.
     - The page is loaded for the first time and no local cache exists.
     - The user creates/edits/deletes an entity on that page.
  5. **Daily Sales Consolidation**: All order settlements on a calendar day locate today's single `SalesEntry` in IST (`Asia/Kolkata`) and atomically increment totals. Collecting payment on `/tables` purges `peyala_sales_list_cache_v1` so the next visit to `/sales` pulls fresh numbers once.
  6. **Live POS (`/tables`) Independent Lifecycle**: The `/tables` POS does NOT store orders in `localStorage` — it re-queries table occupancy and live orders after every user mutation (create order, add round, cancel item, update status, discount, finalize bill, payment collection) to guarantee 100% real-time POS accuracy across devices. The counter Print Station background polling runs at 4000ms and pauses automatically when hidden.

### 3.5 Detailed Sales Report (`/reports` Tab 3)
- Granular order-by-order audit log independent of daily consolidated rows.
- Filterable by: Start Date, End Date (presets: *Today*, *Yesterday*, *Last 7 Days*, *This Month*), Payment Method (*All, Cash, UPI, Card, Other*), and Order Status (*All, Paid, Billed, Open, Cancelled*).
- Live search across Bill #, Table #, Staff name, and Item names.
- Displays summary KPI cards: **Net Settled**, **Gross Sales**, **Tax / GST**, **Discounts**, **Waived Off**, and payment collection breakdown strip.
- Expandable rows show complete itemized timelines, kitchen notes, soft-cancelled items, and KOT ranges (`KOT-xxx-1 to -x`).
- **CSV Export**: Generates UTF-8 BOM formatted spreadsheets for Excel and Google Sheets.

### 3.6 Multi-Device Distributed Thermal Printing Engine & Chrome Silent Auto-Print
- **Multi-Device Distributed Architecture**:
  - **Mobile Waiter Devices (Ordering Clients)**: Waiters create orders and add KOT rounds from smartphones/tablets. On mobile devices (`isPrintStation = false`), the POS suppresses local print dialogs, stores the order in MongoDB with `kotRounds` (`printed: false`), and alerts the waiter: *"KOT sent to Counter Printer 🖨️"*.
  - **Counter Print Station (Windows Laptop with Thermal Printer)**: A designated laptop connected via USB to the 80mm thermal receipt printer runs Chrome in kiosk mode (`start-kiosk.bat`) with the POS `/tables` page open and **"Print Station"** mode toggled **ON** in the header.
  - **Automated Database Reconciliation**: The Print Station polls `GET /api/orders/pending-kots` every 2.5 seconds. When new unprinted KOT rounds arrive from any device, it automatically formats and sends them silently to the thermal printer via `printKOT(job, 'production')`, then acknowledges each job with `POST /api/orders/:orderId/rounds/:roundId/mark-printed`.
  - **Concurrency & Deduplication**: To avoid double printing during network latency, an in-memory lock (`inFlightKotsRef`) tracks round IDs currently printing.
  - **Remote KOT Reprint**: Waiters can tap "Send KOT to Printer" on any active order to queue an immediate reprint on the counter printer (`POST /api/orders/:orderId/reprint`).
- **Auto-Print Default (`'production'`)**: In Production Mode, KOTs and Bills bypass preview modals and immediately invoke `printThermalSlip(html)` via a hidden iframe.
- **Bypassing Chrome Print Dialog (Zero-Click Kiosk Printing)**:
  - Chrome requires `--kiosk-printing` to bypass its native print preview dialog.
  - **Windows Kiosk Architecture**:
    - `start-kiosk.bat`: Hardcoded by default to `https://peyala.vercel.app/login`. Automatically detects Chrome, creates dedicated profile (`%LOCALAPPDATA%\PeyalaPOSChrome`), and launches in true fullscreen kiosk mode (`--kiosk --kiosk-printing`). Supports `--windowed` flag for app-window mode.
    - `create-windows-shortcut.bat`: VBScript-powered utility placing a 1-click "Peyala POS Station" shortcut on the Windows desktop.
    - Press `Alt + F4` or `F11` to close or toggle fullscreen.
  - **macOS**: `start-kiosk.sh` / `start-kiosk.command` launches Chrome targeting `https://peyala.vercel.app/login` with:
    `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --kiosk-printing --user-data-dir="$HOME/Library/Application Support/PeyalaPOSChrome"`
  - Isolated user data profiles ensure the POS kiosk runs side-by-side with personal browser sessions without conflict.
- **Minimizing Top Whitespace in KOT & Bill PDFs**:
  - In `generateKOTHtml` and `generateBillHtml`, set `@page { size: 80mm auto; margin: 0 !important; }` and zeroed out all top margins on `html, body`.
  - Setting `@page { margin: 0 }` prevents Chrome from reserving 15-20mm of blank header space (used for page titles/dates) and guarantees receipt content starts immediately at the top edge of the thermal paper and PDF.
- **Test Mode (`'test'`)**: Allows operators to review the visual slip in `ThermalPreviewModal.tsx` before printing.


### 3.7 Item Variants & Add-ons Architecture
- **Portion Variants (e.g. Half Plate vs Full Plate)**:
  - Menu items configure `hasVariants: boolean` and `variants: [{ name, price, isVeg }]`.
  - In POS (`/tables`), selecting an item with variants triggers an interactive item customization modal displaying portion options, kitchen notes, and quantity.
  - Base price is derived dynamically: `(variant.price || menuItem.price)`.
  - Items without variants or add-ons continue to use fast 1-tap addition.
- **Add-ons & Extras Engine (e.g. Cheese, Dips, Extra Sauces)**:
  - Addon model (`name, price, isVeg, isActive, sortOrder`) with CRUD at `/api/addons`.
  - Addons can be assigned directly to specific menu items or inherited from category defaults (`defaultAddons`, e.g. Cheese on all Burgers).
  - Merged applicable addons are displayed as checkboxes in the customization modal with Veg/Non-Veg badges and real-time total updates.
  - Snapshotted on `Order.items[].selectedAddons` and `kotRounds[].items[].addons`.
  - Thermal printing engine (`lib/thermal-print.ts`) itemizes both variants and addons cleanly on 80mm KOT slips and customer receipts.
- **Cart Keying**:
  - Configured items use composite cart keys (`getCartKey(itemId, variantName, addonsList)`) so tables can order different portion configurations and addon combinations of the same base menu item simultaneously without collisions.

### 3.8 Role-Based Access Control (Admin vs Manager vs Staff)
- **Admin**: Full read and write permissions across all operational and administrative modules (including user account administration and physical dining table creation/deletion).
- **Manager**:
  - **Full Operational POS Authority**: Can open dining orders, dispatch KOT rounds, change item preparation states, soft-cancel items, apply discounts, finalize bills, collect payment settlements, clear table reservations, and manage menu items and add-ons.
  - Structural dining table setup (`POST/DELETE /api/tables`) and user administration remain strictly restricted to Administrators.
- **Staff**:
  - **Read-Only POS View**: Can monitor live table occupancy and active orders.
  - **Reprint Permissions**: Can trigger **"Print Bill"** and **"Print KOT"** to hand receipts to guests. All mutating operations return HTTP 403 Forbidden.

### 3.9 Attendance & Leave Cap Enforcement & High-Contrast UI
- **Statuses**: `present` (P), `absent` (A), `leave` (L), `halfday` (H). Legacy `holiday` is automatically normalized to `halfday` (`H`).
- **Leave Cap**: Max 4 paid leaves per month per employee. On the 5th attempt, the backend automatically converts status to `absent` and logs the reason.
- **Notes**: Month-scoped remarks rendered in the sidebar notes card and attendance modal.
- **High-Contrast & Mobile-Optimized UI Conventions (`attendance/page.tsx`)**:
  - Replaced low-contrast pastel badge classes with rich, bold, accessible color tokens:
    - Present (P): `bg-emerald-600 text-white font-bold` (cell), emerald pill for summary.
    - Absent (A): `bg-rose-600 text-white font-bold` (cell), rose pill for summary.
    - Leave (L): `bg-amber-500 text-white font-bold` (cell), amber pill for summary.
    - Half Day (H): `bg-blue-600 text-white font-bold` (cell), blue pill for summary.
  - Cell states: Past unmarked cells use `border-2 border-dashed border-gray-300 bg-gray-50/80` with hover state; future dates are dimmed with `opacity-40 cursor-not-allowed`.
  - **Responsive Staff Column**: `w-28 sm:w-40 md:w-56 max-w-[115px] sm:max-w-none px-2 sm:px-3 md:px-4`, pinned to `sticky left-0` with drop shadow. Mobile view truncates name cleanly and displays a concise role indicator, freeing up >260px for day cells on small screens.
  - **Non-Colliding Summary Column**: Sticky behavior is scoped to `lg:sticky lg:right-0`. On mobile/tablet screens (< lg), the summary is an inline column at the end of the month's days, eliminating sticky column collisions/overlaps that previously covered the scrollable day cells.
  - **Summary Metrics Layout**: Compact 2-column grid (`P`, `A`, `H`, `L`) with bold badges and values.
  - **Mobile Quick Navigation & Auto-Scroll**: Dedicated touch navigation bar on mobile (`lg:hidden`) with `Staff`, `📅 Today`, and `Summary 📊` jump buttons, accompanied by automatic smooth scrolling to today's column when the current month is loaded.
  - Month/Year selector & chevrons use `border-2 border-gray-300 font-bold` controls.

### 3.10 Admin-Only Settled Bill Editing, Deletion & Automatic Accounting Reversals
- **Strict Role Enforcement (`adminOnly`)**:
  - Modifying or deleting paid bills (`status: 'paid'`) is strictly restricted to Administrators (`req.user.role === 'admin'`). Managers and staff receive `HTTP 403 Forbidden`.
  - Frontend checks `const { user } = useAuth(); const isAdmin = user?.role === 'admin';` and only displays edit/delete buttons when authenticated as an Administrator.
- **Detailed Sales Report Placement (`/reports` Tab 3)**:
  - Per user requirement, settled bill controls exist exclusively in the **Detailed Sales Report** (`/reports`), keeping live POS floor operations (`/tables`) uncluttered.
  - Features quick row buttons (`Pencil` and `Trash2`) and prominent buttons in the expanded order details panel.
- **Backend Endpoints (`backend/src/routes/orders.js`)**:
  - `DELETE /api/orders/:id/settled`:
    - Reverses `order.settledAmount` from matching `Account` (`Cash Counter` if cash, `Current Account` if upi/card/other).
    - Locates the `SalesEntry` matching the order's settlement date (`order.paidAt || order.createdAt`) in IST using `getIstDayRange()`.
    - Decrements `paymentBreakdown[breakdownKey]` and recalculates `outletSales` and `totalRevenue`.
    - Decrements output GST from `BalanceSheet.gstLiability` and appends an audit reversal note to `BalanceSheet.gstLog`.
    - Deletes order record via `Order.findByIdAndDelete(order._id)`.
    - Logs audit trail entry in `AuditLog`.
  - `PUT /api/orders/:id/settled`:
    - Recalculates items `subtotal` and `taxAmount` (skipping any `cancelled` items).
    - Recomputes discounts (Flat or Percentage) and Grand Total.
    - Reconciles settlement amount and waived amount.
    - Reverses old credit from old account and credits new settlement amount to newly selected account.
    - Reconciles `SalesEntry.paymentBreakdown` for that settlement date and recalculates sales totals.
    - Adjusts `BalanceSheet.gstLiability` by `newGst - oldGst` and appends audit note in `BalanceSheet.gstLog`.
    - Saves updated order and logs audit trail entry.
- **Client Cache Invalidation**:
  - Any edit or deletion immediately purges `SALES_CACHE_KEY`, `DAILY_CACHE_KEY`, `PNL_CACHE_KEY`, `peyala_sales_list_cache_v1`, `peyala_accounts_cache_v1`, `peyala_balancesheet_cache_v1`, and `peyala_dashboard_cache_v1`, and reloads the sales report via `loadSales(true)`.
- **Interactive Modals**:
  - **Edit Modal**: Line items editor (adjust quantity, remove item, add item from menu with variants), discount adjustment, payment method selector, settlement amount with "Match Grand Total" helper, and live **Accounting Impact Preview** showing exact diffs before saving.
  - **Delete Modal**: Clear breakdown of exact amounts debited from accounts, subtracted from daily sales, and reversed from GST liability.


### 3.11 Part Payment (Split Payment) Multi-Account Settlement Architecture
- **Split Payment Workflow**:
  - Allows customers to settle a bill across multiple payment methods simultaneously (e.g. ₹100 Cash + ₹20 UPI for a ₹120 bill).
  - Mode enum: `['cash', 'card', 'upi', 'other', 'part']`.
  - Schema extension: `Order.paymentBreakdown` stored as `{ cash: Number, upi: Number, card: Number, other: Number }`. For backward compatibility and uniform reversal, single payment modes also store a full breakdown where their respective field holds the settled amount.
- **Automated Dual-Account Routing**:
  - `paymentBreakdown.cash` credits or debits the **Cash Counter** account (`type: 'cash'`).
  - `paymentBreakdown.upi`, `paymentBreakdown.card`, and `paymentBreakdown.other` credit or debit the **Current Account / Bank** account (`type: { $in: ['bank', 'digital'] }`).
- **Consolidated Daily Sales Register (`SalesEntry`)**:
  - Increments individual daily buckets in IST: `salesEntry.paymentBreakdown.cash`, `upi`, `card`, and `bankTransfer`.
  - Recalculates `outletSales` and `totalRevenue`.
- **Thermal Receipts (`lib/thermal-print.ts`)**:
  - 80mm customer receipt renders `PART PAYMENT (PAID)` and itemizes the exact portions paid: `Cash: ₹100.00 | UPI: ₹20.00`.
- **POS UX (`/tables`)**:
  - Part payment selector renders 4 dedicated input fields with dynamic "+ Fill" remaining balance buttons and live allocation indicators (Exact Match, Waived Off Discrepancy, Over-allocated Warning).
- **Audit & Reversals (`/reports`)**:
  - Sales report filter supports `part`.
  - Table row renders an amber `PART` badge with split summary.
  - Expanded order view renders itemized breakdown card.
  - Admin Edit Modal allows switching to/from part payment with live accounting preview (`Cash Counter: ±₹...`, `Bank / Digital: ±₹...`).
  - Admin Delete Modal details exact split deductions before permanent record deletion.

---

## 4) Database Models & Schemas

| Model | File | Key Fields |
|-------|------|------------|
| **`Table`** | `backend/src/models/Table.js` | `tableNumber`, `capacity`, `status` (`available`, `occupied`, `reserved`), `activeOrder` (ref: Order). |
| **`Order`** | `backend/src/models/Order.js` | `orderNumber`, `table` (ref: Table), `type` (`dine_in`, `takeaway`), `status` (`open`, `billed`, `paid`, `cancelled`), `items` (array of `menuItem`, `name`, `quantity`, `price`, `taxPercent`, `status`, `notes`, `round`, `cancelledAt`, `cancelReason`), `kotRounds` (array of `roundNumber`, `roundTag`, `items`, `printed: Boolean`, `printedAt`, `createdAt`), `subtotal`, `taxAmount`, `discount`, `discountType`, `discountValue`, `total`, `settledAmount`, `waivedAmount`, `paymentMethod` (`cash`, `card`, `upi`, `other`, `part`), `paymentBreakdown` (`cash`, `upi`, `card`, `other`), `kotCount`, `createdBy`. |
| **`MenuItem`** | `backend/src/models/MenuItem.js` | `name`, `category` (ref: MenuCategory), `price`, `taxPercent`, `isVeg`, `isAvailable`, `description`. |
| **`MenuCategory`** | `backend/src/models/MenuCategory.js` | `name`, `description`, `sortOrder`, `isActive`. |
| **`Addon`** | `backend/src/models/Addon.js` | `name`, `price`, `isVeg`, `isActive`, `sortOrder`. |
| **`SalesEntry`** | `backend/src/models/SalesEntry.js` | `date`, `outletSales`, `paymentBreakdown` (`cash`, `upi`, `card`, `bankTransfer`), `zomato` (gross, deductions, net, settled), `fatafat`, `otherSales`, `totalSales`, `gstTotal`. |
| **`PurchaseEntry`** | `backend/src/models/PurchaseEntry.js` | `date`, `supplier` (ref: Supplier), `items` (`item`, `quantity`, `unit`, `pricePerUnit`, `gstPercent`, `totalPrice`), `totalAmount`, `paidFrom` (ref: Account), `paymentMode`, `isPaid`. |
| **`Account`** | `backend/src/models/Account.js` | `name`, `type` (`cash`, `bank`, `digital`), `currentBalance`, `color`, `isActive`. |
| **`Supplier`** | `backend/src/models/Supplier.js` | `name`, `phone`, `address`, `category`, `totalPurchased`, `totalPaid`, `outstanding`. |
| **`Staff`** | `backend/src/models/Staff.js` | `name`, `phone`, `position`, `monthlySalary`, `totalSalaryPaid`, `totalAdvancePaid`, `status`. |
| **`Attendance`** | `backend/src/models/Attendance.js` | `staff` (ref: Staff), `date`, `status` (`present`, `absent`, `leave`, `halfday`), `note`, `markedBy`. |
| **`Payment`** | `backend/src/models/Payment.js` | `date`, `amount`, `payee`, `category`, `subcategory`, `paidFrom`, `paymentMode`. |

---

## 5) Code Conventions & Anti-Patterns to Avoid

### 5.1 Timezone Handling: Never Use `toISOString()` for Local Dates
- **Anti-Pattern**: `new Date().toISOString().split('T')[0]` causes date-shift bugs in IST (+05:30) between midnight and 5:30 AM.
- **Correct Pattern**: Always use `today()` or `formatDateInput()` from `frontend/src/lib/utils.ts` which uses `getFullYear()`, `getMonth()`, and `getDate()`.
- On the backend, always use `getIstDayRange(date)` from `backend/src/utils/date.js` for daily sales lookups and day boundaries.

### 5.2 Mobile Layout & Bottom Clearance
- `AppLayout.tsx` maintains a fixed bottom navigation bar on mobile viewports.
- The content container MUST use `pb-28 md:pb-8 safe-bottom`. Never use hardcoded small bottom padding (e.g. `pb-4`) on page containers or the navigation bar will cover buttons and inputs.
- Always wrap wide tables in `<div className="overflow-x-auto">` or `<div className="table-responsive">` with `<table className="w-full min-w-max">`.

### 5.3 Modal Sizing
- `Modal.tsx` uses `p-2 sm:p-4` outer padding and `p-3.5 sm:p-6` body padding to prevent horizontal viewport exhaustion on 375px screens.
- Form grids in modals must use responsive classes (`grid-cols-1 sm:grid-cols-2` or `grid-cols-1 sm:grid-cols-3`), never hardcoded multi-column classes like `grid-cols-2` or `grid-cols-3`.

### 5.4 RBAC Mutation Protection
- Mutation endpoints on live orders (`POST /api/orders`, items, rounds, discount, bill, pay, cancel) MUST use `managerOrAdmin`.
- Structural mutations (`POST/DELETE /api/tables`, `/api/users`) MUST remain wrapped with `adminOnly`.
- In frontend views, wrap POS ordering and settlement buttons in `{canManageOrders && (...)}` (where `canManageOrders = user?.role === 'admin' || user?.role === 'manager'`) and provide descriptive fallback notices for read-only staff accounts.

---

## 6) Verification & Quality Checklist

Whenever changes are made, run this validation suite before concluding:

1. **Frontend TypeScript Check**:
   ```bash
   cd frontend && npx tsc --noEmit
   ```
   *Must exit with code 0.*

2. **Backend Syntax Verification**:
   ```bash
   cd backend && node --check src/server.js && node --check src/middleware/auth.js && node --check src/routes/orders.js && node --check src/routes/tables.js && node --check src/routes/menu.js && node --check src/routes/sales.js && node --check src/routes/reports.js
   ```
   *Must exit with code 0.*

3. **Documentation Sync**:
   - Update `README.md` if any user-facing features, routes, or workflows changed.
   - Update `MEMORY_BANK.md` with architectural, schema, or convention decisions.

---

*Last Updated: September 2026 · Peyala v8 Engineering*
