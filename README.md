# 🍵 Peyala Business Admin

A complete self-hosted restaurant & café management system built specifically for Peyala.

---

## 📋 What's Included

| Module | Description |
|--------|-------------|
| **Dashboard** | Today's sales, account balances, KPIs, 30-day trend charts |
| **Accounts** | Cash, bank, digital accounts with transfer support |
| **Inventory** | Items grouped by category, low-stock alerts, weighted average cost |
| **Purchases** | Multi-item purchase entries — auto-updates inventory & account balances |
| **Suppliers** | Supplier profiles, purchase history, outstanding dues |
| **Sales** | Daily sales with full Zomato/Swiggy breakdown (gross → net settlement) |
| **Receipts** | Money received (settlements, deposits, loans) |
| **Payments** | All outgoing payments with category tracking |
| **Staff** | Staff records, salary tracking, one-click salary payment |
| **Reports** | P&L statement, daily report, charts |
| **Settings** | Profile, security, system info |

---

## 🚀 Quick Start (Local)

### Prerequisites
- **Node.js** 18+ → https://nodejs.org
- **MongoDB** running on `localhost:27017` → https://www.mongodb.com/try/download/community

### Step 1 — Get the project
Copy the `peyala/` folder to your computer.

### Step 2 — Install & seed
```bash
cd peyala
chmod +x install.sh start.sh
./install.sh
```

This will:
- Install all npm packages (backend + frontend)
- Connect to MongoDB and seed your database with:
  - Admin account: `admin@peyala.com` / `peyala123`
  - 4 accounts (Cash Counter, Current Account, Petty Cash, UPI)
  - 6 suppliers (Gate Bazaar, Bajrang Store, Bunty Chicken, etc.)
  - 8 inventory categories with 17 pre-loaded items
  - 3 staff members (Arpan Mandal, Joydev Mahato, Rahul Das)

### Step 3 — Start
```bash
./start.sh
```

Open **http://localhost:3000** in your browser.

---

## 🛠 Manual Start (if start.sh doesn't work)

Open **two terminals**:

**Terminal 1 — Backend:**
```bash
cd peyala/backend
npm run dev
# Should print: 🍵 Peyala API running on port 5000
```

**Terminal 2 — Frontend:**
```bash
cd peyala/frontend
npm run dev
# Should print: ▲ Next.js ready on http://localhost:3000
```

---

## 🐳 Docker (Alternative)

If you prefer Docker:
```bash
cd peyala
docker-compose up -d
```

Then run seed inside the container:
```bash
docker exec peyala-backend node src/utils/seed.js
```

---

## 🗂 Project Structure

```
peyala/
├── backend/
│   ├── src/
│   │   ├── config/         # MongoDB connection
│   │   ├── middleware/      # JWT auth middleware
│   │   ├── models/          # Mongoose schemas
│   │   │   ├── User.js
│   │   │   ├── Account.js
│   │   │   ├── Supplier.js
│   │   │   ├── InventoryCategory.js
│   │   │   ├── InventoryItem.js
│   │   │   ├── PurchaseEntry.js
│   │   │   ├── SalesEntry.js
│   │   │   ├── Payment.js
│   │   │   ├── Receipt.js
│   │   │   ├── Staff.js
│   │   │   └── Transfer.js
│   │   ├── routes/          # Express API routes
│   │   │   ├── auth.js
│   │   │   ├── accounts.js
│   │   │   ├── inventory.js
│   │   │   ├── purchases.js
│   │   │   ├── suppliers.js
│   │   │   ├── sales.js
│   │   │   ├── payments.js
│   │   │   ├── receipts.js
│   │   │   ├── staff.js
│   │   │   ├── transfers.js
│   │   │   ├── dashboard.js
│   │   │   └── reports.js
│   │   ├── utils/
│   │   │   └── seed.js      # Database seeder
│   │   └── server.js        # Entry point
│   ├── .env
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── app/             # Next.js 15 pages
│   │   │   ├── dashboard/
│   │   │   ├── accounts/
│   │   │   ├── inventory/
│   │   │   ├── purchases/
│   │   │   ├── suppliers/
│   │   │   ├── sales/
│   │   │   ├── receipts/
│   │   │   ├── payments/
│   │   │   ├── staff/
│   │   │   ├── reports/
│   │   │   ├── settings/
│   │   │   └── login/
│   │   ├── components/
│   │   │   ├── layout/      # AppLayout with sidebar
│   │   │   ├── dashboard/   # StatCard
│   │   │   └── ui/          # Modal
│   │   └── lib/
│   │       ├── api.ts       # All API calls
│   │       ├── auth.tsx     # Auth context
│   │       └── utils.ts     # Helpers, formatCurrency
│   ├── .env.local
│   └── package.json
│
├── install.sh
├── start.sh
├── docker-compose.yml
└── README.md
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login |
| GET | `/api/dashboard/summary` | Dashboard data |
| GET/POST | `/api/accounts` | Account management |
| GET/POST/DELETE | `/api/purchases` | Purchase entries (auto-updates inventory) |
| GET/POST | `/api/sales` | Daily sales entries |
| GET/POST/DELETE | `/api/payments` | Outgoing payments |
| GET/POST/DELETE | `/api/receipts` | Incoming receipts |
| GET/POST/PUT | `/api/inventory/items` | Inventory items |
| GET/POST/PUT | `/api/inventory/categories` | Categories |
| GET/POST/PUT | `/api/suppliers` | Supplier management |
| GET/POST | `/api/staff` | Staff records |
| POST | `/api/staff/:id/pay-salary` | Pay staff salary |
| POST | `/api/transfers` | Transfer between accounts |
| GET | `/api/reports/pnl` | P&L report |
| GET | `/api/reports/daily` | Daily report |

---

## ⚙️ Key Business Logic

### Purchase Entry (Auto-cascade)
When you save a purchase:
1. ✅ Inventory stock **increases** by quantity purchased
2. ✅ **Weighted average cost** recalculated per item
3. ✅ Selected account balance **decreases**
4. ✅ Supplier's `totalPurchased` **increases**

Deleting a purchase **reverses all of the above**.

### Payment Entry
When you save a payment:
1. ✅ Account balance **decreases**
2. ✅ If linked to supplier → `totalPaid` increases (reduces outstanding)

### Salary Payment
1. ✅ Creates a Payment record under "Staff Expenses"
2. ✅ Account balance decreases
3. ✅ Staff `totalSalaryPaid` increases

### Zomato/Swiggy Net Settlement
Formula used:
```
Net Settlement = Gross Sales
               − Platform Discount
               − Restaurant Discount
               − Commission
               − GST
```
This is tracked separately from your Cash/UPI outlet sales.

---

## 🔐 Default Login

```
Email:    admin@peyala.com
Password: peyala123
```

**Change your password** in Settings → Security after first login.

---

## 🐛 Troubleshooting

**"Cannot connect to MongoDB"**
- Make sure MongoDB is running: `mongod --dbpath /data/db`
- Or start it as a service: `sudo systemctl start mongod`

**"API not reachable"**
- Go to Settings → System → click "Test API Connection"
- Make sure backend is running on port 5000

**Blank dashboard / no data**
- Run `cd backend && npm run seed` to re-seed

**Port already in use**
```bash
lsof -ti:5000 | xargs kill -9
lsof -ti:3000 | xargs kill -9
```

---

## 📈 Suggested Next Steps

1. **Add your actual opening balances** in Accounts
2. **Add your full menu** items to Inventory
3. **Enter today's purchase** to test the auto-inventory flow
4. **Log today's sales** to see the dashboard come alive
5. Change the admin password in Settings

---

Built for Peyala Café · Howrah, West Bengal 🍵
