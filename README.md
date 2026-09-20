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
| **Wastage** | `/wastage` | Food and inventory wastage tracking with 3 core entry fields (Item Name, Qty, Approx Value), date filtering, loss analytics, and P&L integration. |
| **Expense Leak Detector** | `/expense-leak-detector` | Autonomous financial & operational leak detection engine, statistical price/usage spike alerts, sales-adjusted spending anomalies, anti-double-counting clustering, and 30-day dismissal feedback. |
| **Staff & Attendance** | `/staff`, `/attendance` | Employee directory, monthly attendance calendar with leave cap enforcement, 2-shift duty time tracking (entry/exit), pro-rata salary deductions, advances, bonuses, and salary disbursals. |
| **Balance Sheet** | `/balancesheet` | Dynamic statement of Assets (bank/cash accounts), Liabilities (GST liability, supplier dues, loans), and Net Equity. |
| **Outlet Design & Floor Zones** | `/settings/outlet-design` | Floor category management (Indoor, Outdoor, Other), table reassignment, section reordering, and revenue analytics per zone. |
| **Settings & Security** | `/settings` | Role-based user administration, audit logging, payment categories, database backup/restore, and dark/light mode. |
| **Features Showcase & Login** | `/login` | 12-slide interactive scrollable feature showcase paired with right-hand business authentication portal and 1-tap demo credentials. |

---

## 🌟 Key Highlights & Operational Capabilities

### 1. Dine-In POS & Multi-Round Kitchen Order Tickets (KOT)
- **5-Stage Restaurant POS Lifecycle & Architecture**:
  - **Stage 1: Taking Order (Blank Table)**:
    - Available tables render with a grey dashed border (`border-2 border-dashed border-gray-300`).
    - Tapping the table opens the POS Order Screen for Round 1 to choose items, portions, and add-ons.
  - **Stage 2: Sending KOT (Kitchen Preparation / Running KOT)**:
    - Tapping `[ KOT ]` or `[ KOT & Print ]` dispatches the kitchen ticket to the counter printer.
    - Table immediately transitions to **Yellow** (`border-2 border-amber-400 bg-amber-100/90 text-amber-950`) with an active pulsating **`KOT Active`** status pill and elapsed timer (`X Min`).
    - Table card features both an optional `[ 🍽️ Served ]` quick button and a direct `[ 🖨️ Bill ]` quick button so staff can skip food served and bill immediately without interruption.
  - **Stage 3: Food Served (Dining / Running Table — Optional & Non-Blocking)**:
    - When kitchen preparation completes and dishes are delivered to the guest, staff can tap `[ 🍽️ Served ]` on the table card (or `[ Food Served ]` in order details) to transition the table to **Blue** (`border-2 border-blue-400 bg-blue-50/90 text-blue-950`) with a **`Food Served`** status pill.
    - **Completely Non-Blocking**: If staff forget or skip marking food as served, the order flow is never held back. Staff can tap `[ 🖨️ Bill ]` directly from the Yellow table card or settle payment right away. The backend automatically records `foodServedAt` and marks pending items as `served`.
    - Clicking the table card body allows guests to order Round 2+ (add-ons revert table to Yellow until newly ordered dishes are served).
    - Table card features a 1-tap `[ 🖨️ Bill ]` quick button to immediately advance to billing.
  - **Stage 4: Generating Bill (Bill Given to Customer / Printed Table)**:
    - Tapping `[ 🖨️ Bill ]` (from Yellow or Blue cards) or the Printer icon prints/queues the 80mm customer bill.
    - Table transitions to **Emerald Green** (`border-2 border-emerald-500 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-400/40`) with a pulsating **`Bill Given`** status pill.
    - Floor staff instantly know the bill has been delivered to the customer and payment is pending.
    - Clicking the table card body (or the dedicated `[ 💵 Settle ]` quick button) directly launches the Payment Collection dialog.
  - **Stage 5: Collecting Payment (Settle & Free Table)**:
    - Operator selects payment mode (Cash, UPI, Card, Other, Part Payment) and enters received amount.
    - Live calculations provide instant change due or waived shortage feedback.
    - Tapping `[ Settle Table & Free ]` commits payment to MongoDB, syncs daily sales accounting and real balance sheet accounts, prints/queues the final receipt, and immediately frees the table back to **Blank Table (Stage 1)**.
  - **View B: Live POS Order Taking Screen (3-Column Layout)**:
    - **Column 1 (Category Rail)**: Vertical list of menu categories with active crimson red highlight (`border-l-4 border-l-red-600 bg-red-50 text-red-600 font-bold`).
    - **Column 2 (Item Catalog & Search)**: Real-time search bar + item cards grid with **Veg / Non-Veg Left Edge Stripes** (emerald green for veg, red for non-veg), price tags, and blue active ring when present in cart.
    - **Column 3 (Live Order / Cart Panel)**:
      - Service type tabs: `Dine In` (active red), `Delivery`, `Pick Up`.
      - Table indicator badge + guest count stepper + notes.
      - Item rows with red delete `(X)`, indented variant/addon sub-lines, check item indicators, quantity steppers `[-] 1 [+]`, and prices.
      - **Top-Aligned Items List & Enlarged Typography**: Items added to the cart stack rigidly from the top immediately below the header (`flex flex-col justify-start`) without vertical centering or gap stretching when only a few items are selected. Fonts across item titles, variant modifiers, quantity steppers, line prices, grand total (`text-xl font-black`), and action buttons are enlarged for fast touch readability.
      - Financial breakdown: Subtotal, Tax/GST, Discount, and Grand Total.
      - Payment chips: `[ Cash ✓ ]`, `[ Card ✓ ]`, `[ Due / UPI ✓ ]`, `[ Part Payment ]` with `It's Paid` checkbox.
      - Petpooja Action buttons: `[ Save ]` (Red), `[ Save & Print ]` (Red), `[ KOT ]` (Charcoal dark gray), `[ KOT & Print ]` (Charcoal dark gray).
      - **Auto-Return Workflow**: As soon as a KOT is dispatched (`[ KOT ]` or `[ KOT & Print ]`), the system sends the ticket to the kitchen, notifies the print station, and **automatically returns to Table View**!
    - **Mobile-Friendly POS Order Taking (Zero-Scroll Cart Architecture)**:
      - **Sticky Floating Bottom Cart Bar (`lg:hidden`)**: Rendered persistently at the bottom of the screen showing live item count, table badge, live total amount, and a prominent `[ Review & KOT → ]` action button.
      - **Instant Visual Addition Feedback**: When waitstaff taps an item in the menu grid, a floating confirmation pill pops up (`✓ Added {Item} to Cart`) without requiring the user to scroll anywhere to confirm.
      - **Slide-Up Mobile Cart Drawer Sheet (`lg:hidden`)**: Tapping the floating bar or header cart badge smoothly slides up an interactive bottom sheet containing all selected items, portion modifiers, special kitchen notes, quantity steppers `[-] 1 [+]`, and direct `[ KOT ]` / `[ Save ]` action buttons.
      - **Segmented Top View Switcher on Mobile**: Quick toggle tabs (`[ 🍽️ Menu Items ]` vs `[ 🛒 Review Cart ]`) allow switching between catalog browsing and cart inspection in 1 tap.
  - **View C: Kitchen Display System (KDS) (`/kds`)**:
    - **Smart "Prep Next" Station (Item-Wise Aggregator)**: Consolidates identical pending dishes across all open tables into high-efficiency prep cards (e.g. *5x Momo, 3x Coffee*), sorted by oldest wait time (FIFO) or highest quantity. Cooks can batch-prepare identical dishes in one go!
    - **"KOT Tickets" Live Queue**: FIFO order cards with table number, token #, elapsed timer (Green $\le$ 10m, Amber 10-20m, Red $>$ 20m), round tag, checklist of items, and 1-tap `[ Start Prep ]` / `[ Order Ready ]` buttons.
    - **Beverage Ordering Behind Food**: Dishes categorized under `beverage` automatically display **after** food items on kitchen tickets, allowing cooks to focus on hot stove prep while beverages queue below.
    - **Multi-Round Identification**: Tickets for Round 2, Round 3, Round 4... display distinct badges (`Round 2`, `Round 3`...) on card headers to distinguish re-orders from initial meals.
    - **"Fulfilled History" & Active Dining Retention**: Fulfilled tab maintains served KOT lists until the table is finalized and settled/paid, clearing automatically upon billing. Includes a `[ ↩ Recall ]` button to restore any order bumped by mistake.
    - **Web Audio API Kitchen Chime**: Synthesizes a dual-tone kitchen bell chime (`880Hz` $\rightarrow$ `1320Hz`) automatically whenever a new KOT arrives from the floor or mobile device.
    - **Station & Diet Filters**: Instant filters for `All`, `Veg Only`, and `Bar / Beverages`.
  - **View D: Add-on & Variant Customization Modal**:
    - Item title + unit price header with close `(X)`.
    - Search addon item input.
    - Portions/Variants selection (Required).
    - Grouped Add-ons grid with limit badges (`[ Min: 0, Max: 5 ]`) and veg/non-veg indicator stripes.
    - Kitchen instruction / special request input.
    - Quantity stepper and `[ Cancel ]` / `[ Save ]` (Red) buttons.
  - **View D: Move KOT / Items Modal (Petpooja Architecture)**:
    - Dedicated `<ArrowRightLeft />` button directly on occupied table cards and "Move Table" button in the Order Details modal.
    - **Table Wise Tab**: Sectioned floor layout (`Indoor`, `Outdoor`, `Pick Up`, `Other`) showing available and occupied tables with dashed badges.
      - Tapping a destination table highlights it with a red dashed border and populates the `Table No.` footer input.
      - **Move to Empty Table**: Seamlessly transfers the entire active order, KOT tickets, and elapsed timer to the new table, instantly freeing the original table.
      - **Move to Occupied Table (Order Merge)**: Merges active items and KOT rounds into the target table's order, recalculates bill totals, and frees the source table.
    - **KOT Wise Tab**: Checklist of individual KOT rounds allowing partial transfers to other tables.
    - **Item Wise Tab**: Checklist with stepper controls allowing individual item and quantity transfers between tables.
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
    1. **Dashboard** (`peyala_dashboard_cache_v2`) — includes IST today/yesterday summaries, purchases, sales trends, and cached Owner Notice.
    2. **Sales** (`peyala_sales_list_cache_v1`)
    3. **Accounts** (`peyala_accounts_cache_v1`)
    4. **Inventory** (`peyala_inventory_cache_v1`)
    5. **Purchases** (`peyala_purchases_list_cache_v1` & `peyala_purchases_refdata_cache_v1`)
    6. **Suppliers** (`peyala_suppliers_cache_v1`)
    7. **Payments** (`peyala_payments_cache_v1`)
    8. **Staff** (`peyala_staff_cache_v1`)
    9. **Attendance** (`peyala_attendance_staff_cache_v1` & `peyala_attendance_{year}_{month}_v1`)
    10. **Balance Sheet** (`peyala_balancesheet_cache_v1`)
    11. **Reports** (`peyala_reports_sales_cache_v1`, `peyala_reports_daily_cache_v1`, `peyala_reports_pnl_cache_v2`)
  - **Manual "Refresh" Button with Live Timestamp**: Every single one of these modules features a standard `Refresh` button with an animated spinner and a `Cached (HH:MM)` indicator in its header. Data is only requested from the remote database when the user explicitly clicks Refresh (or upon very first visit if local cache is empty).
  - **Single Daily Sales Consolidation & IST Date Alignment**: Every POS order settled throughout the day automatically updates and bifurcates into **one consolidated daily sales row** in Indian Standard Time (IST, UTC+05:30) via `getIstDayRange`. The dashboard's Yesterday and Today sections match exact IST calendar ranges with order fallback reconciliation, eliminating UTC timezone drift across cloud hosts. When an admin updates the Owner Notice in Settings, the dashboard cache is automatically purged and the notice displays immediately.
  - **Explicit POS Exception (`/tables`)**: The `/tables` Dine-In POS page does **NOT** cache live floor orders in `localStorage`. It always stays fresh after every request (order creation, add-on rounds, status updates, bill finalization, and payment collection). The counter Print Station background polling runs at 4000ms and pauses automatically whenever the browser tab is hidden or laptop screen locked.

### 5. Multi-Device Distributed Print Station & Chrome Silent Auto-Print
- **Multi-Device Architecture**:
  - **Mobile Waiter Devices**: Waiters take orders on phones or tablets connected to the web app (hosted on Vercel or local network).
    - **Remote KOT Dispatch**: When placing an initial order or adding a KOT round, the mobile device saves the order directly to MongoDB without popping open a local print dialog, displaying a confirmation toast: *"KOT sent to Counter Printer 🖨️"*.
    - **Remote Finalized Bill Printing**: When staff taps the **Printer icon** on any table card, taps **"Save & Print"** on the live POS order taker, taps **"Print Bill"** in the order details modal, or collects payment via **"Collect Payment"**, the customer bill is explicitly queued in MongoDB (`billPrintQueued: true`, `billPrintSeq++`, and `status = 'billed'`) and a toast notifies the waiter: *"Customer bill for Table X sent to Counter Printer 🖨️"*. No mobile browser print dialog is shown!
  - **Central Windows Counter Laptop**: Connected physically (via USB) to the 80mm thermal receipt printer. It runs Chrome with the POS page (`/tables`) open and the **"Print Station"** mode toggled **ON** in the header.
  - **Automated Database Reconciliation**: The Print Station polls both `GET /api/orders/pending-kots` and `GET /api/orders/pending-bills` every 4 seconds (automatically pausing when minimized or screen is locked to conserve serverless quota).
    - When new unprinted KOT rounds arrive, the station formats the 80mm kitchen slip, prints it silently via `printKOT(job, 'production')`, and marks `printed: true` via `POST /api/orders/:orderId/rounds/:roundId/mark-printed`.
    - When new customer bill requests arrive (`billPrintQueued: true`), the station formats the 80mm customer receipt, prints it silently via `printCustomerBill(job, 'production')`, and marks `billPrinted: true` via `POST /api/orders/:orderId/mark-bill-printed` with sequence tracking (`seq: billPrintSeq`).
  - **Remote KOT Reprint & Bill Queuing**: Waiters on mobile devices can tap "Send KOT to Printer" or tap the table card printer icon to queue immediate remote printing on the counter printer without leaving the guest's table.
  - **In-Flight Deduplication & Sequence Tracking**: Prevents duplicate concurrent prints during polling using in-memory job locking (`inFlightKotsRef` and `inFlightBillsRef` with `${orderId}-seq-${billPrintSeq}`). Reprints increment the sequence number so fresh print requests are never blocked by stale cache.
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
### 12. Full-Screen Balance Sheet & Financial Statements
- **Widescreen Responsive Architecture (`/balancesheet`)**:
  - Replaced restrictive container constraints (`max-w-6xl`) with full-viewport fluid scaling (`w-full`).
  - Scales seamlessly across laptops, wide monitors, and tablets without artificial margins or cramped rows.
- **Enlarged KPI Summary Cards**:
  - Padded stat cards (`p-6 sm:p-7`) with bold, prominent figures (`text-3xl sm:text-4xl lg:text-5xl font-black`) for Total Assets, Liabilities, and Net Worth.
- **Enhanced 3-Column Breakdown**:
  - Assets, Liabilities, and Equity sections expanded with padded line items (`p-3.5 sm:p-4 text-base`), high-contrast account badges, and bold monetary values (`text-2xl sm:text-3xl font-black`).

### 13. Universal Interactive Button Feedback & Toast Notification System
- **Centralized Toast Notification Engine**:
  - Zero-dependency client-side toast system (`/lib/toast.ts` & `Toast.tsx`) mounted globally at root layout (`/app/layout.tsx`).
  - Supports `toast.success`, `toast.error`, `toast.warning`, and `toast.info` with smooth slide-in/fade animations, Lucide icons, and 4-second auto-dismissal.
  - **100% Elimination of Native `alert(...)` Dialogs**: Completely removed all intrusive, thread-blocking browser alert popups across the entire codebase (`/tables`, `/menu`, `/reports`, `/inventory`, `/purchases`, `/settings`, `/settings/backup`, etc.).
- **Interactive Button Loading States & Double-Click Guarding**:
  - Every single action and form submission button across all 13 modules displays instant visual feedback:
    1. **Dynamic Button Text**: Replaces static action labels with active status descriptions (e.g. `Saving Item...`, `Saving Supplier...`, `Recording Payment...`, `Transferring...`, `Sending KOT...`, `Saving Notice...`, `Clearing Due...`).
    2. **Inline Spinners**: Renders an animated `<RefreshCw className="w-4 h-4 animate-spin" />` or `<Loader2 className="w-4 h-4 animate-spin" />` icon while the request is in flight.
    3. **Duplicate Submission Prevention**: Buttons and forms are programmatically disabled (`disabled={saving || loading}`) while async promises are resolving, completely eliminating duplicate database submissions and race conditions.
- **Immediate Input Validation & Clear Error Reason Toasts**:
  - Instant client-side validation prevents invalid submissions and displays user-friendly, descriptive toast error messages (e.g., missing name, invalid amount, rate <= 0, account selection).
  - API errors are caught in unified try/catch/finally blocks and surfaced cleanly with the exact server reason.

### 14. Staff Duty & Shift Time Tracking (Dynamic Multi-Row Entry / Exit) & Auto-Deductions
- **Manager & Admin Only Shift Management (`/attendance`)**:
  - Located at the bottom of the Attendance page, providing a dedicated daily duty tracker for staff entry and exit times.
  - Non-authorized roles receive a read-only badge, while Managers and Administrators can log or edit shift times.
- **Staff Duty Hours Logging Permission Control (`logDutyHours: Boolean`)**:
  - Administrators and Managers can selectively enable or disable duty hours logging for each staff member in the Staff management section (`/staff`).
  - **When Log Duty is Checked (`logDutyHours: true`)**: The employee is active for shift time logging, target duty hours, pro-rata shortage deductions, and penalty fines.
  - **When Log Duty is Unchecked (`logDutyHours: false`)**:
    - The staff member's duty hours **cannot be logged** in the daily shift table or the time log modal.
    - Excluded from the bottom daily shift tracker table and the time modal staff selector to keep the interface focused on hourly staff.
    - Protected by backend API validation: `POST /api/attendance/time-log` rejects any attempt to log shift hours with a 400 bad request.
    - **Fully Accessible on Main Attendance Table**: The staff member remains 100% accessible on the top monthly calendar grid (`/attendance`), where managers can mark Present (`P`), Absent (`A`), Leave (`L`), and Half Day (`H`) with remarks.
    - Displayed with an **"Attendance Only"** badge on their staff card (`/staff`) and on their monthly calendar row (`/attendance`).
- **Dynamic Multi-Row Duty Timings (Entry & Exit Rows with `+ Add Row`)**:
  - Replaced rigid "Shift 1 / Enable Shift 2" toggle with dynamic rows of **Entry Time** and **Exit Time**.
  - Tapping **`+ Add Row`** dynamically adds additional entry and exit sessions (supporting split shifts, lunch breaks, tea breaks, or multiple duties across the day).
  - Individual session duration badges show real-time elapsed time per slot (`Xh Ym`).
  - Row removal via trash icon (minimum 1 row preserved).
  - Table view displays unified **`Timings (Entry → Exit)`** badges for all logged sessions.
  - Handles day shifts and cross-midnight/overnight shifts (automatically wrapping 24-hour durations).
  - Fully backward-compatible with MongoDB records storing legacy `shift1` and `shift2`.
- **Mandatory Target Duty Hours & Gross Daily Salary Inputs**:
  - Both Target Duty Hours (e.g. 10.0 hrs) and Gross Daily Salary (e.g. ₹300) are strictly mandatory fields.
  - Automatically pre-filled from the staff member's profile (`staff.dailySalary || Math.round(monthlySalary / 30)` and `staff.defaultDutyHours`) and customizable on the fly.
- **Pro-Rata Shortage & Salary Deduction Engine**:
  - Computes total time present (`shift1 + shift2`), absent shortage hours (`dutyHours - presentHours`), hourly wage rate (`dailySalary / dutyHours`), and suggested wage deductions:
    $$\text{Hourly Rate} = \frac{\text{Daily Salary}}{\text{Duty Hours}}$$
    $$\text{Deduction} = \text{Absent Hours} \times \text{Hourly Rate}$$
    $$\text{Net Payable} = \text{Daily Salary} - \text{Deduction}$$
  - *Example*: ₹300 daily salary with 10 hrs duty and 8 hrs worked yields ₹30/hr rate, 2 hrs shortage, **₹60 deduction**, and **₹240 net day pay**.
- **Automatic Attendance Status Synchronization**:
  - If any entry time is recorded, the staff member's attendance is automatically marked as **Present (`P`)**.
  - If no entry times are recorded, it is automatically marked as **Absent (`A`)**.
  - Persisted in the `Attendance` collection, instantly updating both the bottom shift table and the top monthly attendance grid.
- **Penalty Section (Reason & Amount Fine)**:
  - Inside the "Add Duty Hours" modal, a dedicated **Penalty** section allows managers/administrators to levy disciplinary or breakage fines for the day:
    - **Penalty Reason**: Text input for incident context (e.g. *Late arrival*, *Uniform violation*, *Broken crockery/glassware*, *Customer complaint*).
    - **Penalty Amount (₹)**: Monetary fine in rupees.
  - Dynamically updates the Live Calculation Breakdown and reduces **Net Day Payable**:
    $$\text{Net Payable} = \max(0, \text{Daily Salary} - \text{Shortage Deduction} - \text{Penalty Amount})$$
  - Appears in the table's Deduction column with an amber/rose fine badge and hover tooltip showing the penalty reason.
- **Daily Aggregate KPI Bar**:
  - Live aggregate footer displaying total staff on duty, total present hours, total shortage hours, total daily gross wages, total deductions (shortage + penalties), and net day pay.

### 15. Analytics, Daily Averages & Visual Bar Graph Trends (`/dashboard` & `/reports`)
- **Dashboard 30-Day Revenue Bar Graph (`/dashboard`)**:
  - Replaced AreaChart with a clean, high-contrast `<BarChart>` displaying daily revenue bars with top rounded corners (`radius={[4, 4, 0, 0]}`), IST date labels, hover currency tooltips, and an active day count pill.
- **Real-Time Current Daily Averages (`/dashboard`)**:
  - **Top KPI (This Month Revenue)**: Displays an `Avg: ₹X/day` badge calculated dynamically from month-to-date revenue divided by elapsed calendar days in the current month.
  - **Sales Channel Performance**: Each sales channel card (Outlet Sales, Zomato, Fatafat, Other Sales) features a dedicated `Daily Avg: ₹X /day` badge showing current average daily sales performance per channel.
- **P&L Statement Per-Day Sales Bar Graph (`/reports`)**:
  - **Backend IST Aggregation (`GET /api/reports/pnl`)**: Aggregates daily sales directly from `SalesEntry` using Indian Standard Time (`$dateToString` with timezone `+05:30`). For date ranges up to 62 days, builds a complete calendar timeline with 0-fill for days without sales, guaranteeing that the sum of the daily bars exactly equals the P&L statement's Total Revenue.
  - **Visual Daily Sales Chart**: Features a responsive `<BarChart>` with readable date labels (e.g. `14 Sep`), formatted currency tooltips displaying channel breakdowns, total period revenue, and recorded day counts.
- **Authentic Restaurant Dining Table Icon**:
  - Replaced generic grid squares with an authentic dining table icon (`DiningTableIcon.tsx`) featuring a circular dining table, place setting, and paired dining chairs across the sidebar drawer, mobile bottom bar, and floor plan header.

### 16. Expense Leak Detector & Anti-Double-Counting Engine (`/expense-leak-detector`)
- **Autonomous Financial Anomaly & Leak Detection**:
  - Statistically scans real historical business expenses (`Payment`), inventory procurement entries (`PurchaseEntry`), and daily sales entries (`SalesEntry` / `Order`) to pinpoint operational waste and unusual price spikes.
  - Adheres strictly to **non-accusatory, constructive terminology** (*"Potential leak"*, *"Unusual expense"*, *"Requires investigation"*, *"Estimated impact"*, *"Possible cause"*).
- **8 Deterministic Statistical Detectors**:
  1. **Price Spike Detector**: Flags raw material unit prices climbing > 15% over historical median price (requiring $\ge$ 2 historical purchases).
  2. **Expense Spike Detector**: Flags operating/overhead category spending in the period exceeding 25% above its monthly baseline.
  3. **Usage Spike Detector**: Flags physical consumption (quantity per business day) exceeding 20% above historical daily usage rate.
  4. **Sales-Adjusted Expense Anomaly Detector**: Flags expenses rising disproportionately against revenue while suppressing false alarms when expense growth is backed by proportional sales expansion.
  5. **Small Expense Accumulation Detector**: Exposes frequent petty expenses (< ₹500 or < ₹1,000) that invisibly accumulate into significant leakages (> ₹3,000 across $\ge$ 4 transactions).
  6. **Duplicate Expense Detector**: Detects identical amounts disbursed to the same payee or category within a 72-hour window.
  7. **Supplier Price Variance Detector**: Identifies when different suppliers charge $\ge$ 10% price variance for the exact same raw material item.
  8. **Purchase Frequency Anomaly Detector**: Identifies abnormal purchasing cadences (e.g. daily ordering when the normal cadence is weekly).
- **Anti-Double-Counting Cluster Architecture**:
  - Groups overlapping item-level and category-level anomalies under shared root causes (e.g., Chicken price spike ₹18,200 under Raw Materials category spike ₹22,000 grouped under `cluster_food_cost_and_raw_materials`).
  - Total Potential Monthly Impact is deduplicated as:
    $$\text{Cluster Impact} = \max(\text{Category Anomaly Impact}, \sum \text{Item Anomaly Impacts})$$
- **Persistent User Review & 30-Day Dismissal**:
  - Users can mark anomalies as normal (30-day mute stored in `ExpenseLeakReview` with audit log), preventing alert fatigue.
  - Captures 👍 / 👎 learning feedback with structured reason tags to refine future alert prioritization.
- **Investigation Modal & Recharts Visualizations**:
  - Displays historical trend charts, multi-supplier comparison tables, raw transaction audit logs, and operational action checklists.

### 17. Wastage Entry Module, 10 PM Prompt Banner & P&L Integration (`/wastage`)
- **Frictionless Wastage Recording**:
  - Dedicated interface capturing the 3 core required fields: **Name of the Item**, **Quantity (Qty)**, and **Approximate Value (₹)**.
  - Automatically captures entry date (defaults to today in IST), measurement unit (`kg`, `g`, `pcs`, `plates`, `portions`, `litres`, etc.), optional reason tag (`Spoiled`, `Expired`, `Burnt`, `Dropped`), and the recording user.
- **Persistent 10:00 PM End-of-Day Prompt Banner**:
  - Automatically mounts at the top of every page in `AppLayout` after 10:00 PM IST (22:00 to 04:00 AM closing hours).
  - Prominently prompts the closing manager/staff: *"End of Day Check: Daily Wastage Log Pending"*.
  - **Strictly Persistent**: Has no dismiss/close button and **only disappears** once wastage is logged or zero wastage is officially signed.
  - Direct 1-click modal triggers: `[ Record Wastage ]` fast-entry modal and `[ Sign Zero Wastage ]` verification modal.
- **Zero Wastage Sign-off with Double Confirmation**:
  - When no food or raw materials were discarded during the shift, staff can sign off on zero wastage.
  - Requires explicit double-confirmation (checking audit checkbox and confirming staff sign-off).
  - Creates a verified record (`approxValue: 0`, `isZeroWastage: true`) displaying an emerald `Zero Wastage Verified` badge in the ledger, satisfying the closing requirement without altering P&L metrics.
- **P&L Statement Integration (`/reports` P&L Tab)**:
  - Aggregates total recorded wastage value and quantity for any chosen date range.
  - **Zero Financial Impact**: Per operational requirements, wastage is displayed strictly as an informational metric (`Recorded Wastage: ₹X`) and does not modify revenue, gross profit, or net profit calculations.
  - Features a dedicated summary card and a detailed informational banner with a direct link to the wastage ledger.
- **Operational Loss Analytics**:
  - 4 KPI cards: Total Wastage Value, Total Quantity Discarded, Total Incidents, and Daily Average Loss.
  - Filter bar with quick presets (`Today`, `7D`, `This Month`, `Last Month`, `Custom Range`) and real-time search.
  - Local cache synchronization: Immediately invalidates P&L client-side cache upon any add/edit/delete so reports stay synchronized.

### 18. Attendance Split-Duty Penalty Tracking & Fine Deductions (`/attendance`)
- **Penalty Integration within Duty Hours Modal**:
  - Administrators and managers can log disciplinary penalties directly inside the Duty Hours entry modal (`shift1` and `shift2`):
    - **Penalty Reason**: Text justification (e.g. *Crockery Breakage*, *Unannounced Absence*, *Uniform Violation*).
    - **Penalty Amount (₹)**: Deducted from the employee's daily net pay.
- **Pro-Rata Shortage Deduction & Net Pay Formula**:
  - Shortage hours calculated automatically: `absentHours = Math.max(0, targetDutyHours - totalPresentHours)`.
  - Hourly rate computed as `dailySalary / targetDutyHours`.
  - Daily net pay calculated as: `payableAmount = Math.max(0, dailySalary - shortageDeduction - penaltyAmount)`.
- **Monthly Rollup**:
  - Employee cards and payroll exports display cumulative penalty fines for the month with high-contrast badge indicators.

### 19. Features Showcase Landing Page & Side-by-Side Login Architecture (`/login`)
- **Side-by-Side Split Column Design**:
  - **Right Column (`lg:w-[440px] xl:w-[480px]`)**: Clean enterprise authentication portal with 1-tap demo credentials (`👑 Admin`, `💼 Manager`, `🍽️ Staff`), password reveal toggle, and production status indicator.
  - **Left Column (`flex-1`)**: Vertically scrollable snap-scroll slides (`snap-y snap-mandatory scroll-smooth`) presenting all 12 modules of Peyala v8.
- **12 Interactive Feature Slides with Live Mockup Widgets**:
  1. *Platform Overview*: All-In-One Autonomous Restaurant Operating System (Consolidating 5 tools, ₹0 SaaS rent, 100% data sovereignty).
  2. *Floor Operations*: 5-Stage Live Dining Room Lifecycle & Table Management (Petpooja-style table moves, instant status cues).
  3. *High-Speed Ordering*: High-Velocity POS Order Engine & Zero-Scroll Mobile Cart (3-column terminal, 3.8s order dispatch).
  4. *Kitchen Automation*: Kitchen Display System (KDS) & Prep Next Batching Engine (Cross-table dish aggregation, urgency color codes, kitchen chimes).
  5. *Algorithmic Auditing*: Autonomous Expense Leak Detector (8 statistical detectors, price spike alerts, sales-adjusted spending anomalies).
  6. *Loss Prevention*: Disciplined Wastage Control with 10:00 PM Closing Check (Frictionless 3-field capture and non-bypassable EOD prompt).
  7. *Financial Integrity*: Real-Time P&L Statements with IST Per-Day Sales (0-day reporting latency, per-day sales bar chart, audit trails).
  8. *Supply Chain*: Weighted Average Unit Costing (WAC) & Procurement Intelligence (Dynamic recipe costing, vendor dues ledger).
  9. *Treasury & Liquidity*: Multi-Account Vaults & Internal Fund Transfers (Cash counter, bank account, UPI pool, and petty cash tracking).
  10. *Workforce & Payroll*: 2-Shift Duty Tracking, Pro-Rata Deductions & Penalty Fines (Daily shortage calculations and reason logs).
  11. *Hardware Integration*: Dual-Mode 80mm ESC/POS Thermal Printing Architecture (Canvas/PDF preview mode & silent hardware dispatch).
  12. *Enterprise Security*: Role-Based Access Control, Tamper-Proof Audit & 1-Click Backup (Admin/Manager/Staff tiers and instant JSON dump).
- **Feature Showcase Navigation Controls**:
  - Slide counter (`01 / 12`), `[ Prev ]`, `[ Play/Pause ]`, `[ Next ]` buttons.
  - Keyboard arrow key navigation (`↑`/`↓`/`←`/`→`).
  - Sticky top category pills with bi-directional `IntersectionObserver` sync and auto-centering.
  - Bottom slide dot indicator bar with responsive mobile view switcher (`Features` vs `Sign In`).

### 20. "Viewer" Read-Only Demo User Role & Zero-Write Protection
- **Purpose & Intent**:
  - A dedicated user role built specifically for giving prospective investors, partners, and viewers an end-to-end walkthrough of the live application without risking any data mutation or disruption to running business operations.
- **Backend Zero-Write Enforcement (`backend/src/middleware/auth.js`)**:
  - The core `auth` middleware intercepts all state-mutating HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`) for users with `role: 'viewer'`.
  - Automatically returns `403 Forbidden`: `Viewer role is read-only. You cannot create, edit, or delete data in demo mode.`, making accidental or manual API data modification impossible.
  - Clean exceptions for safe session actions (`/api/auth/logout`, `/api/auth/complete-walkthrough`).
  - Strict exclusion from privileged middleware checks (`adminOnly`, `managerOrAdmin`, `staffOrAdmin`).
- **Auto-Provisioned Default Demo Account**:
  - Credentials: `viewer@peyala.com` / `peyala123` (Name: *Demo Viewer*).
  - Seeded in `backend/src/utils/seed.js` and auto-ensured on startup/login in `backend/src/routes/auth.js`.
- **1-Tap Quick Demo Access on Login Portal (`/login`)**:
  - Features an `👀 Viewer` autofill button alongside `👑 Admin`, `💼 Manager`, and `🍽️ Staff` for instant single-tap credential population.
- **Comprehensive UI Read-Only Adaptation**:
  - **Global Header Banner (`AppLayout.tsx`)**: Prominent amber banner notifying users: `👀 Viewer Demo Mode: You have read-only access. Creating, editing, or deleting business data is disabled.`
  - **Sidebar Role Badge**: Displays `Viewer (Demo)` under user avatar.
  - **Control Guarding Across Modules**: Mutation buttons (Add Item, Settle Table, Pay Staff, Add Purchase, Add Sales Entry, Record Expense, Record Wastage, Transfer Funds) are safely hidden or disabled across `/tables`, `/menu`, `/staff`, `/attendance`, `/sales`, `/purchases`, `/inventory`, `/payments`, `/accounts`, and `/suppliers`.
- **Sensitive Financial & Staff Salary Data Masking (Dual-Layer Defense)**:
  - **Backend API Sanitization**: When `req.user.role === 'viewer'`, API endpoints (`/api/dashboard/summary`, `/api/reports/pnl`, `/api/reports/daily`, `/api/reports/sales`, `/api/sales`, `/api/staff`, `/api/attendance`, `/api/attendance/time-logs`, `/api/payments`) nullify live aggregate figures and confidential compensation data: total revenue, total expenses, gross profit, net profit, channel sales, sales trends, settled order amounts, staff monthly/daily salaries, total salary/advance/bonus paid, hourly rates, pro-rata deductions, daily net payables, and staff payment amounts. Viewers cannot inspect confidential figures via browser DevTools.
  - **UI Masking & Demo Placeholders**:
    - `/dashboard`: Total Revenue, Total Expenses, Gross Profit, Net Profit KPI cards display `••••••` with `Protected in Demo` badges. 30-Day Revenue Trend and Expense Breakdown charts are replaced with confidentiality demo placeholders. Yesterday sales/purchases totals and channel performance are masked. Enhanced mobile viewport ergonomics with dedicated bottom padding (`pb-20 sm:pb-6`) clearing fixed bottom navigation.
    - `/staff`: Roster header masks monthly bill as `••••••`. Staff cards mask Monthly Salary, Total Advance, Salary Paid, Bonus Paid, and Remaining Salary as `••••••`; advance progress bar is neutralized to 0%. Payment history modal masks summary metrics, individual payment amounts, and total paid footer.
    - `/attendance`: Daily Shift Timings & Pro-Rata Salary Deduction table masks Daily Salary, Shortage Deductions, and Day Net Pay as `••••••`. Aggregate KPI bar masks Total Daily Gross, Total Deductions, and Net Day Payable as `••••••`.
    - `/reports` (P&L, Daily, Detailed Sales): Financial summary metrics, daily revenue charts, category expense distributions, and payment mode breakdowns display `••••••` or demo protection cards. CSV exports are blocked for viewers.
    - `/sales`: Daily sales ledger table columns (Outlet Sales, Cash, UPI/Card, Zomato, Fatafat, Other, Total) display `••••••`.
    - `/payments`: Staff expense payments display `••••••` for transaction amounts.
  - **Safe Caching Isolation**: Client-side localStorage caches for dashboard, sales, reports, staff, attendance, and payments are strictly partitioned by user role (`_viewer` vs `_admin`) preventing stale cache bleed across different account sessions.

### 22. Quarterly GST-Compliant Bill Numbering System (IST)
- **Indian Fiscal Quarter Auto-Reset**:
  - Bill numbers strictly restart from **1** at `00:00:00 IST` on the first day of every quarter:
    - **Q1**: April 1st – June 30th (Resets to 1 on April 1 at 00:00 IST)
    - **Q2**: July 1st – September 30th (Resets to 1 on July 1 at 00:00 IST)
    - **Q3**: October 1st – December 31st (Resets to 1 on October 1 at 00:00 IST)
    - **Q4**: January 1st – March 31st (Resets to 1 on January 1 at 00:00 IST)
- **Plain Sequential Numbering Without Suffixes**:
  - Increments by 1 with each finalized bill (e.g. `1`, `2`, `3`... `9877`), providing clean sequential auditing for quarterly GST filings and tax compliance.
- **Universal Bill Number Allocation Guarantee**:
  - Implemented via `BillSequence` collection in MongoDB (`backend/src/utils/billingSequence.js`).
  - Bill numbers are assigned immediately when a bill is generated/printed or when an order is settled directly without printing (via Cash, Due, Card, UPI, or Part Payment), ensuring complete transparency and un-gapped accounting records.
- **Thermal Slip & Report Integration**:
  - 80mm receipts render `Bill No: {order.billNumber}`.
  - The Detailed Sales Report (`/reports`) displays the quarterly bill number for all historical transactions.

### 23. Outlet Design, Floor Categories & Dynamic Section Sorting (`/settings/outlet-design`)
- **Custom Dining Zones & Floor Categories (`TableCategory`)**:
  - Configure custom floor categories (e.g., *Indoor*, *Outdoor*, *Rooftop*, *Patio*, *Pick Up*, *Other*) with dedicated colors and emoji icons.
- **1-Click Table Moving & Category Reassignment**:
  - Instantly move any table to another zone (e.g., reassigning table `ratnadeep` to `Other`) using the table card dropdown, with zero downtime.
- **Real-Time Revenue Analytics Per Zone**:
  - Track how much revenue each floor zone generates: Total Settled Sales, percentage of outlet revenue (`% of total`), order counts, table counts, and Average Order Value (AOV) across filters: Today, This Week, This Month, This Quarter, and All Time.
- **Configurable Floor Section Sorting & Reordering**:
  - **One-Click Arrow Reorder**: Category cards in Outlet Design feature **`←`** (Move Left) and **`→`** (Move Right) buttons with a sequence badge (`#1`, `#2`, etc.) to easily adjust layout sequence.
  - **Numeric Display Sequence**: Add/Edit Category modal includes an explicit `Display Sequence / Order` field.
  - **POS Tables Screen Integration (`/tables`)**: The POS floor plan dynamically orders section filter pills, dining floor layout grids, and table transfer modal dialogs strictly by this configured sequence.

### 24. Due Purchases & Supplier Ledger Consistency
- **Accurate Vendor Dues**:
  - Purchases marked on due (`isPaid: false`) accurately post to raw material stock while recording the outstanding payable in the Supplier Ledger and Balance Sheet liabilities (`supplierDues`).
  - When paid through payment vouchers (`/payments`), funds are debited from the chosen account and supplier dues are reduced, maintaining double-entry balance sheet accuracy.

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
│   │   │   ├── ExpenseLeakReview.js # Anomaly dismissal state & feedback learning
│   │   │   ├── Wastage.js          # Food & inventory wastage tracking
│   │   │   └── User.js             # System users & auth roles
│   │   ├── routes/         # Express REST API routes
│   │   │   ├── orders.js           # Order lifecycle, KOTs, billing, settlement (Admin protected)
│   │   │   ├── tables.js           # Table CRUD & live occupancy
│   │   │   ├── menu.js             # Menu items & categories
│   │   │   ├── sales.js            # Consolidated daily sales
│   │   │   ├── reports.js          # P&L, Daily summary, Detailed Sales Report
│   │   │   ├── purchases.js        # Inventory purchase orders
│   │   │   ├── attendance.js       # Attendance & leave caps
│   │   │   ├── expenseLeak.js      # Expense leak detection, reviews & feedback
│   │   │   ├── wastage.js          # Wastage CRUD, date filters & summary
│   │   │   └── ...                 # Accounts, payments, receipts, suppliers, staff, backup
│   │   ├── utils/          # Audit logging, date helpers (IST boundaries), expenseLeakEngine, seed data
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
    │   │   ├── expense-leak-detector/ # Expense Leak Detector dashboard & investigation modal
    │   │   ├── wastage/            # Wastage entry, loss analytics & date filtering
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
    │   │   ├── ui/DiningTableIcon.tsx # Restaurant dining table with chairs vector icon
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
| `POST` | `/api/orders` | `staffOrAdmin` | Open table order & generate Round 1 KOT |
| `POST` | `/api/orders/:id/items` | `staffOrAdmin` | Add items as subsequent KOT round |
| `GET` | `/api/orders/pending-kots` | Authenticated | Poll unprinted KOT rounds for Counter Print Station |
| `POST` | `/api/orders/:orderId/rounds/:roundId/mark-printed` | Authenticated | Acknowledge KOT round printed by Print Station |
| `POST` | `/api/orders/:orderId/rounds/:roundId/reprint` | Authenticated | Re-queue specific KOT round for printing |
| `POST` | `/api/orders/:orderId/reprint` | Authenticated | Re-queue full active order KOT for Counter Print Station |
| `GET` | `/api/orders/pending-bills` | Authenticated | Poll unprinted customer bills for Counter Print Station |
| `POST` | `/api/orders/:orderId/mark-bill-printed` | Authenticated | Acknowledge customer bill printed by Print Station |
| `POST` | `/api/orders/:orderId/queue-bill-print` | Authenticated | Queue customer bill print for Counter Print Station |
| `PATCH` | `/api/orders/:id/items/:itemId` | `staffOrAdmin` | Update item status (`pending`, `preparing`, `served`) |
| `DELETE` | `/api/orders/:id/items/:itemId` | `staffOrAdmin` | Soft-cancel an ordered item with note |
| `PATCH` | `/api/orders/:id/discount` | `staffOrAdmin` | Apply Flat (₹) or Percentage (%) discount |
| `POST` | `/api/orders/:id/bill` | `staffOrAdmin` | Finalize bill for guest review |
| `POST` | `/api/orders/:id/pay` | `staffOrAdmin` | Collect payment, record settlement & waived amount, free table |
| `POST` | `/api/orders/:id/cancel` | `staffOrAdmin` | Cancel live order and free table |
| `POST` | `/api/orders/:id/transfer` | `staffOrAdmin` | Move table, KOT rounds, or items to another table |

### Menu & Categories
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET` | `/api/menu/items` | Authenticated | List menu items with optional category/veg filters |
| `POST` | `/api/menu/items` | Authenticated | Create new menu item |
| `PUT` | `/api/menu/items/:id` | Authenticated | Update menu item details/pricing |
| `GET` | `/api/menu/categories` | Authenticated | List all menu categories |
| `POST` | `/api/menu/categories` | Authenticated | Create category |

### Dashboard & Analytics
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET` | `/api/dashboard/summary` | Authenticated | Live dashboard summary, MTD revenue, channel breakdown & daily averages, account balances, inventory values |
| `GET` | `/api/reports/sales` | Authenticated | Detailed order-by-order sales log, KOT details, waived sums |
| `GET` | `/api/reports/pnl` | Authenticated | Profit & Loss statement for date range |
| `GET` | `/api/reports/daily` | Authenticated | Daily operational overview |

### Expense Leak Detector
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET` | `/api/expense-leaks` | Authenticated | Run 8 statistical leak detectors over IST date range with anti-double-counting clustering |
| `POST` | `/api/expense-leaks/:anomalyId/review` | Authenticated | Review or mark anomaly as normal (30-day dismissal mute) |
| `POST` | `/api/expense-leaks/:anomalyId/feedback` | Authenticated | Submit machine learning feedback (thumbs up/down with reason tags) |

### Wastage
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET` | `/api/wastage` | Authenticated | List wastage records with date filtering, search, and period loss totals |
| `POST` | `/api/wastage` | Authenticated | Record new wastage entry with 3 core fields (itemName, quantity, approxValue) |
| `PUT` | `/api/wastage/:id` | Authenticated | Update existing wastage entry |
| `DELETE` | `/api/wastage/:id` | Authenticated | Remove wastage entry |
| `GET` | `/api/wastage/summary` | Authenticated | Quick KPI metrics for Today and This Month |

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
node --check src/routes/expenseLeak.js
node --check src/utils/expenseLeakEngine.js
node --check src/models/ExpenseLeakReview.js
node --check src/routes/wastage.js
node --check src/models/Wastage.js
```

---

Built with pride for **Peyala Café & Restaurant** · Howrah, West Bengal 🍵
