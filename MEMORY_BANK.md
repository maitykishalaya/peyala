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
6. **Financial Operations** (multi-account ledger, outgoing payments, incoming receipts, double-entry style balance sheet, and P&L statements).
7. **Staff & Payroll** (employee directory, monthly attendance calendar with leave cap enforcement, advances, bonuses, and salary disbursal).

---

## 2) Executive Summary of Architecture & System State

### Backend
- **Framework**: Node.js & Express.js (`backend/src/server.js`).
- **Database**: MongoDB via Mongoose (`backend/src/config/db.js`).
- **Authentication & RBAC**: JWT Bearer token via `auth` middleware, with strict role enforcement via `adminOnly` in `backend/src/middleware/auth.js`.
- **Timezone Standardization**: All daily consolidation and reporting logic operates strictly under Indian Standard Time (`Asia/Kolkata`, UTC+05:30) via `backend/src/utils/date.js` (`getIstDayRange()`).

### Frontend
- **Framework**: Next.js 15 (App Router), React 18/19, TypeScript (`frontend/`).
- **Styling**: Tailwind CSS with dark/light theme support.
- **State & Data Access**: Dedicated API clients (`frontend/src/lib/api.ts` and `frontend/src/lib/pos-api.ts`), React Context for Auth (`frontend/src/lib/auth.tsx`).
- **Printing**: Thermal print abstraction (`frontend/src/lib/thermal-print.ts`) supporting ESC/POS styling, HTML print frames, and visual canvas/PDF rendering via `ThermalPreviewModal.tsx`.
- **Responsive Layout**: Mobile-first architecture across all screens down to 375px viewports (`AppLayout.tsx`, `Modal.tsx`).

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

### 3.4 Single Daily Sales Row Consolidation (IST)
- Collecting POS orders does **NOT** create individual rows in the daily sales register.
- All order settlements on a calendar day locate today's single `SalesEntry` using `getIstDayRange()` in Indian Standard Time (`Asia/Kolkata`).
- Atomically increments `outletSales`, `paymentBreakdown.cash`, `paymentBreakdown.upi`, `paymentBreakdown.card`, and `paymentBreakdown.bankTransfer`.
- Creates the entry if it's the first order of the day; updates the existing entry for all subsequent orders.
- Exactly **one consolidated row** is maintained per calendar day.

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


### 3.7 Role-Based Access Control (Admin vs Staff)
- **Admin**: Full read and write permissions across all modules.
- **Staff / Manager**:
  - **Dine-In POS**: Read-only floor view and active order inspection. Allowed to trigger **"Print Bill"** and **"Print KOT"** to serve customer tickets.
  - **Blocked Actions**: Opening orders, adding KOT rounds, updating item statuses, cancelling items, applying discounts, finalizing bills, collecting payments, deleting orders, and table CRUD are strictly blocked via `adminOnly` (HTTP 403) and hidden in the UI.

### 3.8 Attendance & Leave Cap Enforcement & High-Contrast UI
- **Statuses**: `present` (P), `absent` (A), `leave` (L), `halfday` (H). Legacy `holiday` is automatically normalized to `halfday` (`H`).
- **Leave Cap**: Max 4 paid leaves per month per employee. On the 5th attempt, the backend automatically converts status to `absent` and logs the reason.
- **Notes**: Month-scoped remarks rendered in the sidebar notes card and attendance modal.
- **High-Contrast UI Conventions (`attendance/page.tsx`)**:
  - Replaced low-contrast pastel badge classes with rich, bold, accessible color tokens:
    - Present (P): `bg-emerald-600 text-white font-bold` (cell), emerald pill for summary.
    - Absent (A): `bg-rose-600 text-white font-bold` (cell), rose pill for summary.
    - Leave (L): `bg-amber-500 text-white font-bold` (cell), amber pill for summary.
    - Half Day (H): `bg-blue-600 text-white font-bold` (cell), blue pill for summary.
  - Cell states: Past unmarked cells use `border-2 border-dashed border-gray-300 bg-gray-50/80` with hover state; future dates are dimmed with `opacity-40 cursor-not-allowed`.
  - Sticky table columns: Header (`thead`), sticky Staff column, and sticky Summary column use bold 2px borders (`border-gray-300 dark:border-gray-700`) and elevation drop shadows (`shadow-[2px_0_5px_rgba(0,0,0,0.04)]`).
  - Sticky Summary column uses clean, spacious vertical metric rows (`P`, `A`, `H`, `Leaves`) with `space-y-1`, `text-xs`, bold labels, and `w-44 min-w-[150px]` to maintain layout integrity without squishing or wrapping.
  - Month/Year selector & chevrons use `border-2 border-gray-300 font-bold` controls.


---

## 4) Database Models & Schemas

| Model | File | Key Fields |
|-------|------|------------|
| **`Table`** | `backend/src/models/Table.js` | `tableNumber`, `capacity`, `status` (`available`, `occupied`, `reserved`), `activeOrder` (ref: Order). |
| **`Order`** | `backend/src/models/Order.js` | `orderNumber`, `table` (ref: Table), `type` (`dine_in`, `takeaway`), `status` (`open`, `billed`, `paid`, `cancelled`), `items` (array of `menuItem`, `name`, `quantity`, `price`, `taxPercent`, `status`, `notes`, `round`, `cancelledAt`, `cancelReason`), `kotRounds` (array of `roundNumber`, `roundTag`, `items`, `printed: Boolean`, `printedAt`, `createdAt`), `subtotal`, `taxAmount`, `discount`, `discountType`, `discountValue`, `total`, `settledAmount`, `waivedAmount`, `paymentMethod`, `kotCount`, `createdBy`. |
| **`MenuItem`** | `backend/src/models/MenuItem.js` | `name`, `category` (ref: MenuCategory), `price`, `taxPercent`, `isVeg`, `isAvailable`, `description`. |
| **`MenuCategory`** | `backend/src/models/MenuCategory.js` | `name`, `description`, `sortOrder`, `isActive`. |
| **`SalesEntry`** | `backend/src/models/SalesEntry.js` | `date`, `outletSales`, `paymentBreakdown` (`cash`, `upi`, `card`, `bankTransfer`), `zomato` (gross, deductions, net, settled), `fatafat`, `otherSales`, `totalSales`, `gstTotal`. |
| **`PurchaseEntry`** | `backend/src/models/PurchaseEntry.js` | `date`, `supplier` (ref: Supplier), `items` (`item`, `quantity`, `unit`, `pricePerUnit`, `gstPercent`, `totalPrice`), `totalAmount`, `paidFrom` (ref: Account), `paymentMode`, `isPaid`. |
| **`Account`** | `backend/src/models/Account.js` | `name`, `type` (`cash`, `bank`, `digital`), `currentBalance`, `color`, `isActive`. |
| **`Supplier`** | `backend/src/models/Supplier.js` | `name`, `phone`, `address`, `category`, `totalPurchased`, `totalPaid`, `outstanding`. |
| **`Staff`** | `backend/src/models/Staff.js` | `name`, `phone`, `position`, `monthlySalary`, `totalSalaryPaid`, `totalAdvancePaid`, `status`. |
| **`Attendance`** | `backend/src/models/Attendance.js` | `staff` (ref: Staff), `date`, `status` (`present`, `absent`, `leave`, `halfday`), `note`, `markedBy`. |
| **`Payment`** | `backend/src/models/Payment.js` | `date`, `amount`, `payee`, `category`, `subcategory`, `paidFrom`, `paymentMode`. |
| **`Receipt`** | `backend/src/models/Receipt.js` | `date`, `amount`, `source`, `category`, `receivedIn`, `referenceNumber`. |

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
- All mutation endpoints on live orders and tables MUST be wrapped with `adminOnly` in the route definition.
- In frontend views, wrap mutation buttons in `{isAdmin && (...)}` and provide descriptive fallback notices or disabled state labels for staff accounts.

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
