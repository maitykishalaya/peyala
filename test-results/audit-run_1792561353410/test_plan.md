# 🧪 Peyala POS Load Test & Performance Audit Plan

## 1. Test Architecture & Boundaries
- **Run Identifier**: `run_1792561353410`
- **Isolated Database Port**: `27019` (Dedicated test process; completely separated from production `27017`)
- **Isolated Storage Directory**: `backend/data/db_test_run_1792561353410`
- **Isolated Backend API**: `http://127.0.0.1:4000`
- **Isolated Frontend Next.js**: `http://127.0.0.1:3000`
- **Central Sync Outbox**: Blocked & Disabled (`MONGODB_CENTRAL_URI=""`)
- **External Side Effects**: Disabled (SMS, WhatsApp, real payment gateways mocked/blocked)

## 2. Low-End Laptop Safeguards
- Host CPU: Intel(R) Core(TM) i7-8750H CPU @ 2.20GHz (6 cores)
- Host RAM: 16239 MB Total (~5211 MB Free)
- Disk Available: 11 GB
- Chromium headless automation via Playwright Core with zero redundant binary downloads
- Progressive concurrency ladder: 1 -> 2 -> 3 -> 5 concurrent browser sessions
- Memory leak detection: 12 sustained operational cycles across all main routes
