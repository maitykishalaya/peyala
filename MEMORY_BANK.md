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
8. **Expense Leak Detection & Operational Waste Auditing** (autonomous statistical detection of price spikes, expense spikes, usage surges, sales-adjusted anomalies, duplicate payments, and supplier price variance with anti-double-counting clustering and 30-day review persistence).
9. **Wastage Tracking & Operational Loss Auditing** (logging spoiled, expired, or discarded food and ingredients via 3 core fields: item name, quantity, and approximate value, with real-time period aggregation on the P&L statement).

---

## 2) Executive Summary of Architecture & System State

### Backend
- **Framework**: Node.js & Express.js (`backend/src/server.js`).
- **Database**: MongoDB via Mongoose (`backend/src/config/db.js`).
- **Authentication & RBAC**: JWT Bearer token via `auth` middleware, with role enforcement via `adminOnly` (for structural table layout changes, user administration), `managerOrAdmin` (for table metadata and menu add-on configurations), `staffOrAdmin` (granting staff, manager, and admin users operational access for taking orders, KOT rounds, billing, printing, discounts, and payment settlements), and `viewer` (read-only demo role strictly blocking all mutations system-wide with `403 Forbidden`) in `backend/src/middleware/auth.js`.
- **Timezone Standardization**: All daily consolidation and reporting logic operates strictly under Indian Standard Time (`Asia/Kolkata`, UTC+05:30) via `backend/src/utils/date.js` (`getIstDayRange()`).

### Frontend
- **Framework**: Next.js 15 (App Router), React 18/19, TypeScript (`frontend/`).
- **Styling**: Tailwind CSS with dark/light theme support.
- **State & Data Access**: Dedicated API clients (`frontend/src/lib/api.ts` and `frontend/src/lib/pos-api.ts`), React Context for Auth (`frontend/src/lib/auth.tsx`).
- **Printing**: Thermal print abstraction (`frontend/src/lib/thermal-print.ts`) supporting ESC/POS styling, HTML print frames, and visual canvas/PDF rendering via `ThermalPreviewModal.tsx`.
- **Responsive Layout, Screen Height Locking, Bottom Padding & Desktop Auto-Minimizing Drawer**: Mobile-first architecture across all screens down to 375px viewports (`AppLayout.tsx`, `Modal.tsx`). Full viewport height is strictly bounded (`h-screen h-[100dvh] max-h-screen`) with flex child shrinking (`min-h-0 h-full overflow-y-auto`), completely eliminating vertical content clipping and enabling smooth internal scrolling across all pages. Generous bottom padding (`pb-36` / 144px on mobile, `md:pb-24` / 96px on desktop) ensures the fixed bottom navigation bar (~60px) and window edge never cover or overlap bottom content, totals, or action buttons. On mobile viewports (`< 768px`), the side navigation drawer and backdrop are completely removed (`hidden md:flex`), navigating cleanly via the native bottom navigation bar and mobile topbar. On laptops/desktops (`>= 768px`), the navigation drawer operates with the persistent auto-minimization rail (`w-16` / `w-60`) governed by `peyala_sidebar_open`.

---

## 3) Core Business Rules & Implemented Workflows

### 3.1 Petpooja POS Flow & Table Lifecycle (`/tables`)
1. **Two-View POS Architecture**:
   - **View A: Table View (Floor Plan)**:
     - Section groupings: **Indoor**, **Outdoor**, and **Pick Up**.
     - **5 Differentiated Status Colors**:
       - `Blank Table`: Grey dashed border (`border-dashed border-gray-400`). Tapping opens POS Order Screen for Round 1.
       - `Running Table`: Soft blue (`border-blue-400 bg-blue-50/90 text-blue-950`).
       - `Running KOT Table`: Soft yellow (`border-amber-400 bg-amber-100/90 text-amber-950`).
        - `Bill Given Table` (Billed / Printed): Distinct emerald green (`border-2 border-emerald-500 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-400/40`) with pulsing `Bill Given` pill, indicating bill has been delivered to customer and table is awaiting payment collection.
        - `Paid Table`: Soft orange (`border-orange-400 bg-orange-50 text-orange-950`).
      - **Context-Aware Table Card Interaction**:
        - `Card Body Click (Running Table)`: Clicking the body of an occupied table in blue/yellow state opens POS Order Taking in **Round 2 / Add Items mode**.
        - `Card Body Click (Bill Given / Green Table)`: Clicking the body of a green table directly opens the **Payment Collection & Settlement Dialog**!
        - `Quick Settle Button ([ 💵 Settle ])`: Dedicated button on green table cards to directly launch payment collection.
        - `Quick Print Bill Icon (<Printer />)`: Directly prints customer bill on counter printer or sends to print queue from mobile.
        - `Move Table (<ArrowRightLeft />)`: Opens Petpooja-style table transfer / KOT move modal.
        - `View Items (<Eye />)`: Opens full order details modal (status tracking, item cancellation, discount engine, bill finalization, and payment settlement).
      - **Live KOT Elapsed Minutes Indicator**: Live badge displaying minutes passed since latest KOT creation (`<Clock /> {kotMins} Min`), auto-updating every 30 seconds.
   - **View B: Live POS Order Taking Screen (3-Column Layout)**:
     - **Column 1 (Category Rail)**: Fixed vertical list of categories with active crimson red highlight (`border-l-4 border-l-red-600 bg-red-50 text-red-600 font-bold`).
     - **Column 2 (Item Catalog & Search)**: Real-time search bar + item cards grid with **Veg / Non-Veg Left Edge Stripes** (emerald green for veg, red for non-veg), price tags, and blue active ring when present in cart.
     - **Column 3 (Live Order / Cart Panel)**:
       - Service type switcher: `Dine In` (active red), `Delivery`, `Pick Up`.
       - Table indicator badge + guest count stepper + notes.
       - Items table with delete `(X)`, indented variant/addon sub-lines, check item indicators, quantity steppers `[-] 1 [+]`, and prices.
       - Subtotal, Tax/GST, Discount, and Grand Total.
       - Payment mode chips: `[ Cash ✓ ]`, `[ Card ✓ ]`, `[ Due / UPI ✓ ]`, `[ Part Payment ]` with `It's Paid` checkbox.
       - Petpooja Action buttons: `[ Save ]` (Red), `[ Save & Print ]` (Red), `[ KOT ]` (Charcoal dark gray), `[ KOT & Print ]` (Charcoal dark gray).
       - **Auto-Return Workflow**: As soon as a KOT is dispatched (`[ KOT ]` or `[ KOT & Print ]`), the system sends the ticket to the kitchen, notifies the print station, and **automatically returns to Table View**!
     - **Mobile POS Zero-Scroll Cart Architecture**:
       - **Sticky Floating Bottom Bar (`lg:hidden`)**: Shows real-time item count, table badge, live total, and `[ Review & KOT → ]` action button.
       - **Instant Feedback Pill**: Floating pill `✓ Added {Item} to Cart` confirms every addition without scrolling.
       - **Slide-Up Cart Drawer Sheet (`lg:hidden`)**: Opens full cart review modal with modifier breakdown, steppers, and direct `[ KOT ]` buttons.
       - **Top Segmented Switcher**: Quick toggle between Menu Catalog and Cart review.
   - **View C: Kitchen Display System (KDS) (`/kds`)**:
     - **Prep Next Station**: Aggregates pending items across all tables with batch quantities, oldest wait times, and batch completion.
     - **KOT Tickets Queue**: FIFO ticket cards with timers, checklist, and individual/order bump actions.
     - **Fulfilled History**: Recent completed tickets with 1-tap recall.
     - **Web Audio Chime**: Dual-tone synthesized chime on incoming KOTs.
   - **View D: Add-on & Variant Customization Modal**:
     - Modal title with item name and unit price + close `(X)`.
     - Real-time `Search addon item` input.
     - Portions/Variants selection (Required).
     - Grouped Add-ons grid with limit badges (`[ Min: 0, Max: 5 ]`) and veg/non-veg indicator stripes.
     - Kitchen instruction / special request input.
     - Quantity stepper and `[ Cancel ]` / `[ Save ]` (Red) buttons.
2. **5-Stage Restaurant POS Order Lifecycle (With Non-Blocking Stage 3)**:
   - **Stage 1: Taking Order (`available`)**: Blank table (grey dashed). Waiter selects table and enters items/variants/add-ons on the POS order screen.
   - **Stage 2: Sending KOT (`open` / `preparing`)**: Staff dispatches KOT round (`[ KOT ]` or `[ KOT & Print ]`). Table turns **Yellow** (`Running KOT`) with `KOT Active` status pill and elapsed timer. Food is being cooked in the kitchen. Table card displays **both** an optional `[ 🍽️ Served ]` button and a direct `[ 🖨️ Bill ]` button.
   - **Stage 3: Food Served (`served` — Optional & Non-Blocking)**: When dishes are delivered to guests, staff can tap `[ 🍽️ Served ]` on table card or `[ Food Served ]` in order details. Table turns **Blue** (`Running Table / Food Served`). Clicking card body allows Round 2 add-ons (reverting to Yellow until new round is served). Table card displays quick `[ 🖨️ Bill ]` button. **Skipping Allowed**: If staff forget or bypass marking food served, they can jump directly to Stage 4 (billing) or Stage 5 (payment) with zero interruption; backend automatically marks `foodServedAt` and updates items to `served`.
   - **Stage 4: Generating Bill (`billed`)**: Staff prints or queues customer bill. Table turns **Green** (`Bill Given`) with pulsing status pill. Clicking card body or quick `[ 💵 Settle ]` button directly opens payment collection.
   - **Stage 5: Collecting Payment (`paid`)**: Operator enters payment amount and selects mode (Cash, UPI, Card, Other, Part Payment). Clicking `[ Settle Table & Free ]` commits payment to MongoDB, syncs daily sales accounting and real accounts, prints receipt, and frees table to Available Blank (Stage 1).

### 3.2 Dual Discount Engine
- Operators can toggle between **Flat Discount (₹)** and **Percentage Discount (%)**.
- Discount is calculated on `subtotal` before taxes.
- Percentage discount is capped between 0% and 100%.
- Saved on `Order` as `discount`, `discountType`, and `discountValue`, printed on customer receipts.

### 3.3 Payment Collection & Settlement Workflow
- **Integrated Payment Collection Card**:
  - Accessible via green table body click, table card `[ 💵 Settle ]` quick button, or Order Details modal.
  - **Payment Mode Selector**: 5 modes with visual icons and active indicators: Cash (`<Banknote />`), UPI (`<Smartphone />`), Card (`<CreditCard />`), Other (`<Wallet />`), and Part Payment (`<Layers />`).
  - **Payment Amount Received Input**: Operator can freely enter the tendered amount (prefilled with exact `grandTotal`).
  - **Quick Action Chips**:
    - `Exact: ₹{total}`: Instantly restores input to the exact bill balance.
    - Cash Denominations: When Cash is selected, chips for next common notes (₹100, ₹200, ₹500, ₹1000, ₹2000) are dynamically offered.
  - **Real-Time Difference Calculation**:
    - **Cash Tendered > Total**: Displays emerald banner `💵 Cash Tendered: ₹X • Return Change: ₹Y`. (Backend caps `finalSettled = grandTotal` so change returned does not artificially inflate sales).
    - **Partial Received < Total**: Displays amber banner `⚠️ Receiving Partial: ₹X • Waived Shortage: ₹Y` (`waivedAmount` recorded for discrepancy audits and loss monitoring).
    - **Exact Total**: Displays emerald `✓ Exact payment` confirmation.
  - **Part Payment Split**: Supports granular multi-tender entry across Cash, UPI, Card, and Other with live balanced indicators.
  - **Settle Table & Free**: Single click triggers `ordersApi.pay`, records payment in MongoDB, updates the daily sales row, credits real cash/bank accounts, prints/queues receipt, and frees the table to `available`.

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
     - **Dashboard**: `peyala_dashboard_cache_v2` (caches today/yesterday IST metrics, graphs, accounts, and Owner Notice)
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
  5. **Daily Sales Consolidation & IST Alignment**: All order settlements on a calendar day locate today's single `SalesEntry` in IST (`Asia/Kolkata`) via `getIstDayRange` and atomically increment totals. Dashboard today and yesterday stats query exact IST calendar windows with fallback aggregation to settled orders, eliminating UTC timezone discrepancies on cloud server environments. Saving Owner Notice in Settings automatically invalidates the dashboard cache.
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
  - **Mobile Waiter Devices (Ordering Clients)**: Waiters create orders, add KOT rounds, and finalize bills from smartphones/tablets.
    - **Remote KOT Generation**: On mobile devices (`isPrintStation = false`), the POS suppresses local print dialogs, stores the order in MongoDB with `kotRounds` (`printed: false`), and alerts the waiter: *"KOT sent to Counter Printer 🖨️"*.
    - **Remote Customer Bill Printing**: When staff taps the **Printer icon** on any table card, taps **"Save & Print"** on the live POS order taker, taps **"Print Bill"** in the order details modal, or collects payment via **"Collect Payment"**, the customer bill is queued in MongoDB (`billPrintQueued: true`, `billPrintSeq++`, and `status = 'billed'`) via `POST /api/orders/:orderId/queue-bill-print` and alerts the waiter: *"Customer bill for Table X sent to Counter Printer 🖨️"*. No browser print dialog appears on the phone!
  - **Counter Print Station (Windows Laptop with Thermal Printer)**: A designated laptop connected via USB to the 80mm thermal receipt printer runs Chrome in kiosk mode (`start-kiosk.bat`) with the POS `/tables` page open and **"Print Station"** mode toggled **ON** in the header (`?printStation=true` / `localStorage.getItem('peyala_is_print_station')`).
  - **Automated Database Reconciliation**: The Print Station polls both `GET /api/orders/pending-kots` and `GET /api/orders/pending-bills` every 4 seconds (auto-pausing on tab hide/screen lock).
    - **Auto-Printing KOTs**: New unprinted KOT rounds are formatted as 80mm kitchen tickets, sent silently to the printer via `printKOT(job, 'production')`, and marked `printed: true` via `POST /api/orders/:orderId/rounds/:roundId/mark-printed`.
    - **Auto-Printing Bills**: Explicitly queued customer bills (`billPrintQueued: true`) are formatted as 80mm receipts (itemized variants, add-ons, discounts, GST/tax, settlement breakdown), sent silently to the printer via `printCustomerBill(job, 'production')`, and marked printed (`billPrintQueued: false`, `billPrinted: true`) via `POST /api/orders/:orderId/mark-bill-printed` with sequence tracking (`seq: billPrintSeq`).
  - **Concurrency & Deduplication**: To avoid double printing during network latency, in-memory locks (`inFlightKotsRef` and `inFlightBillsRef`) track unique job keys currently printing (e.g. `${orderId}-seq-${billPrintSeq}`). Because reprints increment `billPrintSeq`, duplicate reprints from mobile are never blocked by stale in-flight cache.
  - **Remote KOT Reprint & Bill Queuing**: Waiters can tap "Send KOT to Printer" or tap the printer icon on any occupied table card to queue an immediate print on the counter printer (`POST /api/orders/:orderId/reprint` or `POST /api/orders/:orderId/queue-bill-print`).
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
  - **Full Operational POS Authority (`staffOrAdmin`)**: Granted operational access for taking orders, dispatching multi-round KOT tickets, marking food served, generating customer bills, triggering remote prints, applying discounts, and collecting payment settlements to free tables.
  - Structural setup (tables layout creation/deletion, menu configuration, user management) and administrative edits/deletions of settled bills remain restricted to Manager/Admin.

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

### 3.12 POS Order-Taking Typography & Top-Alignment + Full-Screen Balance Sheet Layout
- **Cart Top-Alignment (`frontend/src/app/tables/page.tsx` Column 3)**:
  - Previously, `justify-between` and `max-h-56` caused flexbox to distribute vertical space between the table header and bottom totals, making 1 or 2 items appear to hang in the vertical center.
  - Updated cart panel outer container and items table container to `flex flex-col justify-start gap-3` with `min-h-[220px]`.
  - Items list container updated to `divide-y overflow-y-auto max-h-[360px] flex-1 flex flex-col justify-start items-stretch` so items rigidly stack top-down immediately beneath the column header.
- **POS Font Sizing & Readability**:
  - Table headers: `text-xs font-extrabold text-gray-700 uppercase tracking-wider py-2`.
  - Item names: `text-sm sm:text-base font-bold text-gray-900 dark:text-white`.
  - Addon / variant modifiers: `text-xs font-semibold text-gray-500`.
  - Stepper controls: `text-sm sm:text-base font-bold min-w-[1.25rem] text-center` with larger `w-4 h-4` icons.
  - Line item prices: `text-sm sm:text-base font-extrabold text-gray-900 dark:text-white`.
  - Grand total: `text-lg sm:text-xl font-black text-red-600`.
  - Payment chips: `px-2.5 py-1.5 text-xs font-bold`.
  - Action buttons (`Save`, `Save & Print`, `KOT`, `KOT & Print`): `text-sm font-bold py-2.5`.
  - Item catalog cards (Column 2): `text-sm font-bold` item names, `text-sm font-black` prices, `h-10 text-sm` search input.
- **Full-Screen Balance Sheet Layout (`frontend/src/app/balancesheet/page.tsx`)**:
  - Replaced restrictive `max-w-6xl` container (1152px) with `w-full`.
  - Page header enlarged to `text-2xl sm:text-3xl font-extrabold` with `w-6 h-6` icon.
  - KPI summary cards enlarged to `p-6 sm:p-7` with metrics styled at `text-3xl sm:text-4xl lg:text-5xl font-black`.
  - 3-column breakdown (Assets, Liabilities, Equity) updated to `p-6 space-y-5`, headers to `text-lg sm:text-xl`, account rows to `p-3.5 sm:p-4 text-base`, GST and Dues amounts to `text-2xl sm:text-3xl font-black`, and equity metrics to `text-2xl font-black`.

### 3.13 Move KOT / Table Transfer & Merge Architecture (Petpooja POS Alignment)
- **Problem & Operational Need**: Customers regularly switch tables midway through a meal or combine with friends at another table. Waiters must be able to move the entire active order, specific KOT rounds, or individual items to another table with automatic status reconciliation.
- **Backend Endpoint (`POST /api/orders/:id/transfer` with `managerOrAdmin`)**:
  - Accepts `targetTableId`, `transferType` (`'table' | 'kot' | 'item'`), `kotRoundNumbers`, and `itemTransfers`.
  - **Move to Empty/Available Table**:
    - Updates `order.table = targetTable._id`.
    - Updates `targetTable.activeOrder = order._id; targetTable.status = 'occupied'`.
    - Frees source table: `sourceTable.activeOrder = null; sourceTable.status = 'available'`.
    - Preserves all KOT rounds, timestamps, elapsed timer, and billing metadata.
  - **Move to Occupied Table (Order Merge)**:
    - Merges active items from source order into destination order.
    - Appends KOT rounds into target order with re-indexed round numbers and tag prefix `[FROM {sourceTable.tableNumber} - ROUND {n}]`.
    - Recalculates destination order subtotal, taxes, discounts, and total via `Order.calcTotals`.
    - Flags `billPrinted: false` so updated combined bill can be reprinted.
    - Cancels source order with reason: `Merged into Table {targetTable.tableNumber} (Order #{targetOrder.orderNumber})`.
    - Frees source table (`available`).
  - **KOT-Wise & Item-Wise Transfers**:
    - Splices selected KOT rounds or item quantities from source order and transfers to destination table (creating new order if target was empty, or merging into target's active order).
    - If source order has 0 active items left, automatically cancels source order and frees source table.
  - **Audit Logging**: All transfers recorded in `AuditLog` for management review.
- **Frontend Petpooja Modal (`Move KOT/Items - {tableNumber}`)**:
  - Accessible via the `<ArrowRightLeft />` icon on occupied table cards in the floor plan and via the "Move Table" button in the Order Details modal.
  - **3 Tabs**: `Table Wise` (Default), `KOT Wise`, `Item Wise`.
  - **Sectioned Floor Layout**: Displays destination tables categorized into `Indoor`, `Outdoor`, `Pick Up`, and `Other` with dashed outline badges (`border border-dashed border-gray-400`).
  - **Active Selection**: Clicking any destination table highlights it with a red dashed border (`border-2 border-dashed border-red-600 text-red-600 font-bold bg-red-50/60`) and synchronizes with the `Table No.` input at the bottom.
  - Fast execution: `Cancel` and solid red `Move` button (`#d32f2f`).

### 3.15 Universal Interactive Button Feedback & Toast Notification System
- **Global Reactive Toast Engine**:
  - `frontend/src/lib/toast.ts`: Zero-dependency custom-event notification dispatcher exposing `toast.success(message, duration?)`, `toast.error(...)`, `toast.warning(...)`, and `toast.info(...)`.
  - `frontend/src/components/ui/Toast.tsx`: Client-rendered animated floating notification container mounted at root level in `frontend/src/app/layout.tsx`. Features category-specific icons (`CheckCircle2`, `AlertCircle`, `AlertTriangle`, `Info`), smooth slide-in/fade animations, manual dismiss buttons (`X`), and auto-dismissal after 4000ms.
  - **Zero Native `alert(...)` Calls**: Replaced all intrusive native browser modal alerts across every single module (`tables`, `reports`, `inventory`, `purchases`, `settings/backup`, etc.) with non-blocking toast notifications.
- **Interactive Button Loading States & Double-Click Guarding**:
  - Every mutating action across all 13 core modules (`/menu`, `/tables`, `/inventory`, `/suppliers`, `/sales`, `/payments`, `/accounts`, `/staff`, `/attendance`, `/reports`, `/settings`, `/settings/users`, `/settings/categories`, `/settings/backup`, `/purchases`, `/balancesheet`) implements an explicit loading state (`saving`, `tableSaving`, `submittingAction`, `transferring`, `paying`, `catSaving`, `subSaving`, `noticeSaving`, `testingApi`, etc.).
  - While an operation is pending:
    1. Buttons are immediately disabled (`disabled={saving || loading}`) to physically guard against duplicate submissions and race conditions.
    2. Button labels dynamically reflect the active operation (e.g., `Saving Item...`, `Saving Supplier...`, `Recording Payment...`, `Sending KOT...`, `Clearing Due...`, `Testing Connection...`).
    3. An inline spinning icon (`<RefreshCw className="w-4 h-4 animate-spin" />`) is rendered alongside the label.
- **Immediate Input Validation & Actionable API Error Feedback**:
  - Client-side validation runs prior to API requests; if any required field is missing or invalid (e.g. empty item name, account mismatch, non-positive amount), a descriptive `toast.error(...)` is immediately shown and execution halts.
  - Backend errors are caught in standard try/catch blocks and surfaced with the exact reason via `toast.error(err.response?.data?.message || 'Failure reason')`.
  - Successful operations produce positive green toasts (e.g. `toast.success('Order settled successfully')`).

### 3.16 Staff Duty & Shift Time Tracking (Entry / Exit / 2 Shifts) & Auto-Deductions
- **Manager & Admin Only Operational Control**:
  - Located at the bottom of the Attendance page (`/attendance`), providing detailed daily shift monitoring, duty hours tracking, and pro-rata salary deduction calculation.
- **Staff Duty Hours Logging Permission Control (`logDutyHours: Boolean`)**:
  - Administrators and Managers can toggle whether a staff member's duty hours are trackable in `/staff`.
  - When unchecked (`logDutyHours: false`), the staff member's duty hours cannot be logged, and they are cleanly excluded from the bottom daily shift tracker table and modal staff picker.
  - Server-side validation in `POST /api/attendance/time-log` rejects any shift logging attempt for non-trackable staff.
  - **Main Attendance Table Full Access**: The staff member remains 100% accessible on the top monthly calendar grid (`/attendance`) to mark Present (`P`), Absent (`A`), Leave (`L`), and Half Day (`H`).
  - Rendered with an **"Attendance Only"** badge on their staff card (`/staff`) and monthly attendance calendar cell (`/attendance`).
- **Dynamic Multi-Row Duty Timings (Entry & Exit Rows with `+ Add Row`)**:
  - Replaced rigid "Shift 1 / Enable Shift 2" toggle with dynamic rows of **Entry Time** and **Exit Time**.
  - Tapping **`+ Add Row`** dynamically adds additional entry and exit sessions (supporting split shifts, lunch breaks, tea breaks, or multiple duties across the day).
  - Individual session duration badges show real-time elapsed time per slot (`Xh Ym`).
  - Row removal via trash icon (minimum 1 row preserved).
  - Table view displays unified **`Timings (Entry → Exit)`** badges for all logged sessions.
  - Handles day shifts and cross-midnight/overnight shifts (automatically wrapping 24-hour durations).
  - Fully backward-compatible with MongoDB records storing legacy `shift1` and `shift2`.
- **Mandatory Duty Hours & Gross Daily Salary Inputs**:
  - Target duty hours (e.g. 10 hrs) and Gross daily salary (e.g. ₹300) are strictly mandatory fields (`> 0`).
  - Auto-prefilled from staff profile defaults (`staff.dailySalary || Math.round(monthlySalary / 30)` and `staff.defaultDutyHours`) and customizable on the fly.
- **Pro-Rata Shortage, Penalty & Salary Deduction Engine**:
  - `totalPresentHours = sum(slotMinutes) / 60`
  - `absentHours = Math.max(0, dutyHours - totalPresentHours)`
  - `hourlyRate = dailySalary / dutyHours`
  - `deductionAmount = absentHours * hourlyRate`
  - `penaltyAmount = Math.max(0, parseFloat(penaltyAmount) || 0)`
  - `payableAmount = Math.max(0, dailySalary - deductionAmount - penaltyAmount)`
  - Displays instant live visual calculation as shift times and penalties are typed: Total Present, Duty Shortage, Suggested Deduction (-₹...), Penalty Fine (-₹...), and Net Day Payable.
- **Penalty Section (Reason & Amount)**:
  - Added dedicated Penalty card inside the "Add Duty Hours" modal with `penaltyReason` (contextual text) and `penaltyAmount` (monetary fine in ₹).
  - Saved on `Attendance` (`penaltyReason: String`, `penaltyAmount: Number, default: 0`).
  - Table view displays penalty badge under Deduction with hover reason tooltip, and KPI footer aggregates total shortage deductions + penalties.
- **Automatic Main Attendance Status Synchronization**:
  - If any entry time is logged (`shift1.entry` or `shift2.entry`), the staff's attendance status is automatically set to **`present`** (`P`).
  - If neither entry time is logged, the attendance status is automatically set to **`absent`** (`A`).
  - Persisted in the `Attendance` collection for `{ staff, date }`, synchronizing both the bottom shift table and the top monthly attendance calendar grid.

### 3.17 Visual Bar Graphs, Daily Averages & P&L Per-Day Sales Breakdown
- **Dashboard 30-Day Revenue Trend Bar Graph (`/dashboard`)**:
  - Replaced AreaChart with a clean, high-contrast `<BarChart>` displaying daily revenue bars with top rounded corners (`radius={[4, 4, 0, 0]}`), IST date labels, hover currency tooltips, and an active day count pill.
- **Dashboard Real-Time Daily Averages**:
  - **Top KPI (This Month Revenue)**: Displays an `Avg: ₹X/day` badge calculated dynamically from month-to-date revenue divided by elapsed calendar days in the current month.
  - **Sales Channel Performance Section**: Each sales channel card (Outlet Sales, Zomato, Fatafat, Other Sales) features a dedicated `Daily Avg: ₹X /day` badge showing current average daily sales performance per channel.
- **P&L Statement Per-Day Sales Bar Graph (`/reports`)**:
  - **Backend IST Aggregation (`GET /api/reports/pnl`)**: Aggregates daily sales directly from `SalesEntry` using Indian Standard Time (`$dateToString` with timezone `+05:30`). For date ranges up to 62 days, builds a complete calendar timeline with 0-fill for days without sales, guaranteeing that the sum of the daily bars exactly equals the P&L statement's Total Revenue.
  - **Visual Daily Sales Chart**: Features a responsive `<BarChart>` with readable date labels (e.g. `14 Sep`), formatted currency tooltips displaying channel breakdowns, total period revenue, and recorded day counts.
  - Cache bumped to `peyala_reports_pnl_cache_v2`.
- **Authentic Restaurant Dining Table Icon**:
  - Replaced generic grid icon with an authentic dining table icon (`DiningTableIcon.tsx`) featuring a circular dining table, place setting, and paired dining chairs across the sidebar drawer, mobile bottom bar, and floor plan header.

### 3.18 Expense Leak Detector & Anti-Double-Counting Cluster Architecture (`/expense-leak-detector`)
- **Operational Intent**:
  - Provide an autonomous financial leak auditing engine scanning real historical business expenses (`Payment`), raw material procurement (`PurchaseEntry`), and daily sales (`SalesEntry` / `Order`) to flag unusual spending, price hikes, inventory over-consumption, and duplicate vouchers without accusatory language.
- **8 Deterministic Statistical Detectors (`backend/src/utils/expenseLeakEngine.js`)**:
  1. **Price Spike**: Item unit price exceeds > 15% above its historical median (requires $\ge$ 2 prior purchases).
  2. **Expense Spike**: Category spending exceeds > 25% above its baseline monthly spend.
  3. **Usage Spike**: Physical item consumption (quantity per day) exceeds > 20% above its historical daily rate.
  4. **Sales-Adjusted Anomaly**: Compares expense growth against sales growth; suppresses alerts when expense expansion is driven by proportional sales growth (e.g. +40% raw material with +45% sales is not flagged).
  5. **Small Expense Accumulation**: Detects frequent petty expenses (< ₹500 or < ₹1,000) that aggregate to > ₹3,000 across $\ge$ 4 transactions.
  6. **Duplicate Expenses**: Identifies identical amounts paid to the same payee or category within a 72-hour window.
  7. **Supplier Price Variance**: Flags when different vendors charge $\ge$ 10% price variance for the exact same raw material item.
  8. **Purchase Frequency Anomaly**: Flags unusual buying intervals (e.g., ordering daily instead of regular 6-day intervals).
- **Anti-Double-Counting Root-Cause Clustering**:
  - Overlapping item-level anomalies (e.g., Chicken price spike ₹18,200) and category anomalies (e.g., Raw Materials food cost anomaly ₹22,000) are clustered under `cluster_food_cost_and_raw_materials`.
  - Deduplicated Cluster Impact = $\max(\text{Category Anomaly Impact}, \sum \text{Item Anomaly Impacts})$.
  - Top KPI cards display the deduplicated Potential Monthly Impact to prevent inflating projected losses.
- **Review Dismissal & Machine Feedback Learning (`backend/src/models/ExpenseLeakReview.js`)**:
  - Users can mark anomalies as normal, muting them for 30 days (`dismissedUntil = Date.now() + 30 * 86400000`) with audit logging.
  - Users can submit 👍 / 👎 feedback with reason tags (`seasonal_price_change`, `menu_expansion_or_rush`, `bulk_purchase_discount`, `incorrect_data_entry`, `other`) to tune future detection sensitivity.
- **UI & Visualization (`frontend/src/app/expense-leak-detector/page.tsx`)**:
  - Features Top 3 Action Priorities banner, multi-dimensional filter bar, expandable anomaly cards with deduplication badges, Recharts historical trend comparisons, multi-supplier comparison tables, and raw transaction audit trails.

### 3.19 Wastage Entry Module & P&L Statement Integration (`/wastage`)
- **Frictionless 3-Field Wastage Capture**:
  - Requires **`itemName`** (Name of the item), **`quantity`** (Qty > 0), and **`approxValue`** (Approximate value in ₹).
  - Defaults date to today (IST compatible), supports unit of measure (`kg`, `g`, `pcs`, `plates`, `portions`, `litres`, `box`), optional reason tags (`Spoiled`, `Expired`, `Burnt`, `Dropped`), and tracks the user who logged the entry.
- **P&L Statement Integration Without Profit Distortion (`/reports`)**:
  - `GET /api/reports/pnl` aggregates all `Wastage` entries in the query period `{ date: { $gte: start, $lte: end } }` to produce `wastage: { total, totalQty, count }`.
  - **Zero Impact on Financial Bottom-Line**: Per business requirement, recorded wastage is displayed as an informational operational loss metric; it does NOT alter or deduct from Revenue, Gross Profit, Total Expenses, or Net Profit calculations.
  - The P&L view displays a 5th **Recorded Wastage** KPI card (`Info` badge) and an informational banner with a 1-click jump button to the wastage log.
- **Client Cache Synchronization**:
  - Mutating wastage (create, edit, delete) purges `peyala_reports_pnl_cache_v2` and `peyala_wastage_cache_v1` so reports refresh immediately.

### 3.20 Attendance Split-Duty Penalty Tracking & Fine Deductions (`/attendance`)
- **Penalty Integration within Duty Hours Modal**:
  - When recording or updating staff duty hours (`shift1` and `shift2`), administrators and managers can log a **Penalty Fine** section with two dedicated fields:
    1. **`penaltyReason`**: Text describing the disciplinary reason (e.g., *Crockery Breakage*, *Unannounced Absence*, *Uniform Violation*).
    2. **`penaltyAmount`**: Disciplinary fine in ₹.
- **Automated Pro-Rata Daily Net Payable Calculation**:
  - `absentHours = Math.max(0, targetDutyHours - totalPresentHours)`
  - `hourlyRate = staff.dailySalary / targetDutyHours`
  - `deductionAmount = Math.round(absentHours * hourlyRate)`
  - `payableAmount = Math.max(0, staff.dailySalary - deductionAmount - penaltyAmount)`
- **Full Month Payroll Rollup**:
  - The monthly attendance summary aggregates total penalty fines across all days, displayed in a dedicated high-contrast badge on the employee payroll card.

### 3.21 10:00 PM Mandatory Daily Wastage Closing Check Enforcement
- **Universal Header Banner (`frontend/src/components/Header.tsx`)**:
  - At or after **10:00 PM IST (22:00:00)**, if no wastage entry exists for the current IST calendar day, a prominent amber notification banner appears across all authenticated dashboard and management pages.
- **Double-Confirmation Zero Wastage Verification**:
  - Staff can either click **`[ 📝 Record Wastage ]`** to open the 3-field entry form or click **`[ 🛡️ Sign Zero Wastage ]`**.
  - Signing Zero Wastage requires a secondary confirmation modal to prevent accidental bypassing. Once confirmed, a zero-value verified entry (`itemName: 'Zero Wastage Recorded'`, `approxValue: 0`, `reason: 'Verified Zero Wastage'`) is logged to MongoDB, immediately dismissing the banner for the rest of the day.

### 3.22 Features Showcase Landing Page & Side-by-Side Login Architecture (`/login`)
- **Side-by-Side Dual Column Responsive Layout**:
  - **Right Column (`lg:w-[440px] xl:w-[480px]`)**: Dedicated, secure business login portal featuring 1-tap demo logins (`👑 Admin`, `💼 Manager`, `🍽️ Staff`), email/password inputs with toggle visibility, live authentication error handling, and production status indicators.
  - **Left Column (`flex-1`)**: Interactive feature showcase presenting all 12 platform modules as vertically scrollable snap slides (`snap-y snap-mandatory scroll-smooth`).
- **12 Comprehensive Feature Slides**:
  1. *Platform Overview*: All-In-One Autonomous Restaurant Operating System (Consolidating 5 tools, ₹0 SaaS rent, 100% data sovereignty).
  2. *Floor Operations*: 5-Stage Live Dining Room Lifecycle & Table Management (Petpooja-style table moves and instant card actions).
  3. *High-Speed Ordering*: High-Velocity POS Order Engine & Zero-Scroll Mobile Cart (3-column terminal, 3.8s average order time).
  4. *Kitchen Automation*: Kitchen Display System (KDS) & Prep Next Batching Engine (Cross-table dish aggregation, urgency color codes, and kitchen chimes).
  5. *Algorithmic Auditing*: Autonomous Expense Leak Detector (8 statistical detectors, price spike alerts, sales-adjusted spending anomalies).
  6. *Loss Prevention*: Disciplined Wastage Control with 10:00 PM Closing Check (Frictionless 3-field capture and non-bypassable EOD prompt).
  7. *Financial Integrity*: Real-Time P&L Statements with IST Per-Day Sales (0-day reporting latency, per-day sales bar chart, audit trails).
  8. *Supply Chain*: Weighted Average Unit Costing (WAC) & Procurement Intelligence (Dynamic recipe costing, vendor dues ledger).
  9. *Treasury & Liquidity*: Multi-Account Vaults & Internal Fund Transfers (Cash counter, bank account, UPI pool, and petty cash tracking).
  10. *Workforce & Payroll*: 2-Shift Duty Tracking, Pro-Rata Deductions & Penalty Fines (Daily shortage calculations and reason logs).
  11. *Hardware Integration*: Dual-Mode 80mm ESC/POS Thermal Printing Architecture (Canvas/PDF preview mode & silent hardware dispatch).
  12. *Enterprise Security*: Role-Based Access Control, Tamper-Proof Audit & 1-Click Backup (Admin/Manager/Staff tiers and instant JSON dump).
- **Interactive Feature Navigation & Controls**:
  - Slide counter (`01 / 12`), `[ Prev ]`, `[ Play/Pause ]`, `[ Next ]` controls.
  - Keyboard arrow key navigation (`↑`/`↓`/`←`/`→`).
  - Top category pills scroller with bi-directional `IntersectionObserver` sync and auto-centering.
  - Interactive live feature mockup widgets for every slide.
  - Bottom slide indicator dots bar with mobile switch tabs (`Features` vs `Sign In`).

---

## 4) Database Models & Schemas

| Model | File | Key Fields |
|-------|------|------------|
| **`Table`** | `backend/src/models/Table.js` | `tableNumber`, `capacity`, `status` (`available`, `occupied`, `reserved`), `activeOrder` (ref: Order). |
| **`Order`** | `backend/src/models/Order.js` | `orderNumber`, `table` (ref: Table), `type` (`dine_in`, `takeaway`), `status` (`open`, `billed`, `paid`, `cancelled`), `items` (array of `menuItem`, `name`, `quantity`, `price`, `taxPercent`, `status`, `notes`, `round`, `cancelledAt`, `cancelReason`), `kotRounds` (array of `roundNumber`, `roundTag`, `items`, `printed: Boolean`, `printedAt`, `createdAt`), `subtotal`, `taxAmount`, `discount`, `discountType`, `discountValue`, `total`, `settledAmount`, `waivedAmount`, `paymentMethod` (`cash`, `card`, `upi`, `other`, `part`), `paymentBreakdown` (`cash`, `upi`, `card`, `other`), `kotCount`, `billPrinted`, `billPrintedAt`, `billPrintQueued`, `billPrintQueuedAt`, `billPrintSeq`, `createdBy`. |
| **`MenuItem`** | `backend/src/models/MenuItem.js` | `name`, `category` (ref: MenuCategory), `price`, `taxPercent`, `isVeg`, `isAvailable`, `description`. |
| **`MenuCategory`** | `backend/src/models/MenuCategory.js` | `name`, `description`, `sortOrder`, `isActive`. |
| **`Addon`** | `backend/src/models/Addon.js` | `name`, `price`, `isVeg`, `isActive`, `sortOrder`. |
| **`SalesEntry`** | `backend/src/models/SalesEntry.js` | `date`, `outletSales`, `paymentBreakdown` (`cash`, `upi`, `card`, `bankTransfer`), `zomato` (gross, deductions, net, settled), `fatafat`, `otherSales`, `totalSales`, `gstTotal`. |
| **`PurchaseEntry`** | `backend/src/models/PurchaseEntry.js` | `date`, `supplier` (ref: Supplier), `items` (`item`, `quantity`, `unit`, `pricePerUnit`, `gstPercent`, `totalPrice`), `totalAmount`, `paidFrom` (ref: Account), `paymentMode`, `isPaid`. |
| **`Account`** | `backend/src/models/Account.js` | `name`, `type` (`cash`, `bank`, `digital`), `currentBalance`, `color`, `isActive`. |
| **`Supplier`** | `backend/src/models/Supplier.js` | `name`, `phone`, `address`, `category`, `totalPurchased`, `totalPaid`, `outstanding`. |
| **`Staff`** | `backend/src/models/Staff.js` | `name`, `phone`, `position`, `monthlySalary`, `dailySalary`, `defaultDutyHours`, `logDutyHours`, `totalSalaryPaid`, `totalAdvancePaid`, `status`. |
| **`Attendance`** | `backend/src/models/Attendance.js` | `staff` (ref: Staff), `date`, `status` (`present`, `absent`, `leave`, `halfday`), `dutyHours`, `timeSlots` (`entry`, `exit`), `shift1` (`entry`, `exit`), `shift2` (`entry`, `exit`), `totalPresentHours`, `absentHours`, `dailySalary`, `hourlyRate`, `deductionAmount`, `penaltyReason`, `penaltyAmount`, `payableAmount`, `note`, `markedBy`. |
| **`Payment`** | `backend/src/models/Payment.js` | `date`, `amount`, `payee`, `category`, `subcategory`, `paidFrom`, `paymentMode`. |
| **`ExpenseLeakReview`** | `backend/src/models/ExpenseLeakReview.js` | `anomalyId` (unique hash), `detector`, `entityType`, `entityKey`, `status` (`new`, `reviewed`, `dismissed`), `dismissedUntil` (30d date), `feedback` (`isUseful`, `reason`, `notes`), `reviewedBy`. |
| **`Wastage`** | `backend/src/models/Wastage.js` | `itemName`, `quantity`, `unit`, `approxValue`, `date`, `reason`, `createdBy`. |

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
- Operational endpoints on live orders (`POST /api/orders`, items, rounds, discount, mark-served, bill, pay, cancel, transfer) MUST use `staffOrAdmin` (granting `staff`, `manager`, and `admin` permission to take orders, dispatch KOTs, generate/print bills, and collect payments).
- Structural mutations (`POST/DELETE /api/tables`, `/api/users`, `PUT/DELETE /api/orders/:id/settled`) MUST remain wrapped with `adminOnly`.
- In frontend views, wrap POS ordering, KOT dispatch, and billing buttons in `canManageOrders` (where `canManageOrders = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'staff'`).

### 5.5 POS Navigation & Drawer Icons
- The dining tables section uses `DiningTableIcon` (`frontend/src/components/ui/DiningTableIcon.tsx`) instead of generic abstract grid icons (`LayoutGrid`), depicting an authentic restaurant dining table flanked with chairs matching standard 24x24 Lucide vector styling.

### 5.6 Dashboard Daily Averages & MTD Metrics
- The dashboard (`/dashboard`) displays current daily average sales for the active month both at the top in the "This Month Revenue" StatCard (`badge: Avg: ₹X/day`) and broken down per channel in the bottom "This Month — Sales Channel Performance" section (Outlet, Zomato, Fatafat, Other).
- The daily average is computed server-side in `backend/src/routes/dashboard.js` based on IST calendar days elapsed (`daysElapsed = Math.max(1, currentDay)`) with total days in month (`totalDaysInMonth`), with seamless client-side fallbacks in `frontend/src/app/dashboard/page.tsx`.

### 5.7 Wastage Entry, 10 PM Persistent Prompt & P&L Statement Conventions
- **3 Core Fields Required**: `itemName` (String), `quantity` (Number > 0), `approxValue` (Number >= 0). Optional fields: `unit` (defaults to 'units'), `reason`, `notes`.
- **P&L Integrity Rule**: Total wastage for the selected period is reported strictly as an informational metric (`wastage: { total, totalQty, count }`) on `GET /api/reports/pnl` and displayed on the P&L page (`/reports`). Per strict user instructions, it does NOT deduct from Gross Profit or Net Profit.
- **10:00 PM Persistent Prompt Banner**: Mounted in `AppLayout.tsx` (`<WastagePromptBanner />`). When current time $\ge 22:00$ (or overnight $< 04:00$), checks `GET /api/wastage/today-status`. If no entry exists for the current IST day, renders a non-dismissible amber/rose alert across every page until recorded.
- **Zero-Wastage Sign-Off Flow**: Provides a double-confirmation modal (`POST /api/wastage/zero-wastage`) creating an audited zero-value entry (`approxValue: 0`, `isZeroWastage: true`) satisfying the end-of-day checklist without distorting financial figures.
- **Cross-Component Event Notification**: Mutating wastage emits `window.dispatchEvent(new CustomEvent('peyala_wastage_updated'))` and invalidates `peyala_reports_pnl_cache_v2` for immediate real-time sync across pages without full reloads.

### 5.8 "Viewer" Read-Only Demo Role Architecture & Security Model
- **Core Motivation**: Prospective investors and partners need frictionless demo access to explore real-time kitchen operations, dining tables, analytics, and accounting without any hazard of accidental or intentional changes to active restaurant data.
- **Middleware-Level Zero-Write Guarantee**:
  - The `auth` middleware (`backend/src/middleware/auth.js`) automatically intercepts all incoming `POST`, `PUT`, `PATCH`, and `DELETE` requests for any user with `role === 'viewer'`.
  - Blocks requests immediately with `403 Forbidden` (`Viewer role is read-only. You cannot create, edit, or delete data in demo mode.`).
  - Whitelist: Only harmless session cleanup (`/api/auth/logout`, `/api/auth/complete-walkthrough`) is allowed through.
  - Exclusions: `adminOnly`, `managerOrAdmin`, and `staffOrAdmin` explicitly reject `viewer`.
- **Default Account**: `viewer@peyala.com` / `peyala123` (Name: `Demo Viewer`, role: `viewer`), ensured in `seed.js` and verified on DB connect in `backend/src/routes/auth.js`.
- **Client-Side UX & Controls**:
  - Top amber banner rendered in `AppLayout.tsx` alerting that demo mode is active and read-only.
  - `WastagePromptBanner.tsx` suppressed for viewers (`user.role === 'viewer'`), eliminating closing checklist popups during demos.
  - Top navigation bar & table/item action buttons across `/tables`, `/menu`, `/staff`, `/attendance`, `/sales`, `/purchases`, `/inventory`, `/payments`, `/accounts`, and `/suppliers` conditionally hide or disable mutation controls using `canWrite` from `useAuth()`.
- **Confidential Financial Masking (Dual-Layer Defense Model)**:
  - **Backend Layer (Defense in Depth)**:
    - In `backend/src/routes/dashboard.js`: `/api/dashboard/summary` nullifies `revenue`, `expenses`, `grossProfit`, `netProfit`, `outlet`, `zomato`, `fatafat`, `other`, daily averages, and sets `charts.salesTrend: []`, `charts.expenseTrend: []`, `charts.expenseByCategory: []` whenever `req.user.role === 'viewer'`.
    - In `backend/src/routes/reports.js`:
      - `/api/reports/pnl`: Nullifies `income.total`, `expenses.total`, `grossProfit`, `netProfit`, `grossMargin`, `netMargin`, and sets `dailySales: []`.
      - `/api/reports/daily`: Nullifies `totalRevenue`, `totalExpenses`, `netProfit`, `sales`, and masks monetary fields on purchases/payments.
      - `/api/reports/sales`: Nullifies `summary.totalGrossSales`, `summary.totalSettled`, `summary.paymentBreakdown`, and order-level monetary totals.
    - In `backend/src/routes/sales.js`: `/api/sales` and `/api/sales/today` nullify `totalRevenue`, `outletSales`, and channel net amounts.
  - **Frontend Layer**:
    - `formatCurrency` in `frontend/src/lib/utils.ts` handles `null`/`undefined`/`NaN` gracefully by displaying `••••••`.
    - `/dashboard`: KPI cards display `••••••` with `Protected in Demo` tags; 30-Day Revenue Trend and Expense Breakdown render dedicated `EyeOff` protection placeholders; quick stats and yesterday banner figures are masked.
    - `/reports`: Summary cards, daily revenue charts, comparison bar charts, and category expense charts show `••••••` or demo protection notice; CSV export is blocked with notification.
    - `/sales`: Sales ledger columns display `••••••`.
    - Caching keys for dashboard, sales, and reports are partitioned by `userRole` (`_viewer` vs `_admin`) to eliminate cross-session data leaks.

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
   cd backend && node --check src/server.js && node --check src/middleware/auth.js && node --check src/routes/auth.js && node --check src/routes/orders.js && node --check src/routes/tables.js && node --check src/routes/menu.js && node --check src/routes/sales.js && node --check src/routes/reports.js && node --check src/routes/expenseLeak.js && node --check src/utils/expenseLeakEngine.js && node --check src/models/ExpenseLeakReview.js && node --check src/routes/wastage.js && node --check src/models/Wastage.js
   ```
   *Must exit with code 0.*

3. **Automated Unit Tests**:
   ```bash
   node scratch/test_expense_leak_engine.js
   node scratch/test_wastage_and_pnl.js
   node scratch/test_viewer_role.js
   ```
   *All tests must pass.*

4. **Documentation Sync**:
   - Update `README.md` if any user-facing features, routes, or workflows changed.
   - Update `MEMORY_BANK.md` with architectural, schema, or convention decisions.

---

*Last Updated: September 2026 · Peyala v8 Engineering*
