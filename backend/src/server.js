// Expand libuv thread pool so bcrypt/crypto cannot starve async I/O under concurrent logins
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '16';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const connectDB = require('./config/db');

const app = express();

// Connect Database
connectDB();

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
const fs = require('fs');
app.use(
  morgan('dev', {
    skip: (req) => {
      const url = req.originalUrl || req.url;
      return (
        url.includes('/api/orders/pending-') ||
        url.includes('/api/orders/kds/alerts') ||
        url.includes('/health')
      );
    },
  })
);

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

const http = require('http');
const realtimeHub = require('./services/realtimeHub');
const localDbRunner = require('./services/localDbRunner');

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/accounts', require('./routes/accounts'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/purchases', require('./routes/purchases'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/receipts', require('./routes/receipts'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/transfers', require('./routes/transfers'));
app.use('/api/auditlog', require('./routes/auditlog'));
app.use('/api/balancesheet', require('./routes/balancesheet'));
app.use('/api/owner-note', require('./routes/ownerNote'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/backup', require('./routes/backup'));
app.use('/api/menu', require('./routes/menu'));
app.use('/api/addons', require('./routes/addons'));
app.use('/api/tables', require('./routes/tables'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/expense-leaks', require('./routes/expenseLeak'));
app.use('/api/wastage', require('./routes/wastage'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/sync', require('./routes/sync'));
app.use('/api/maintenance', require('./routes/maintenance'));
app.use('/api/pos-settings', require('./routes/posSettings'));

// Health check endpoints for Render, Docker, and local pinging
const mongoose = require('mongoose');
app.get(['/health', '/api/health'], (req, res) =>
  res.json({
    status: 'ok',
    app: 'Peyala Business Admin',
    mode: 'local-first',
    dbStatus: mongoose.connection.readyState === 1 ? 'connected' : 'offline_recovering',
    timestamp: new Date().toISOString(),
  })
);

// Root route confirmation
app.get('/', (req, res) =>
  res.json({
    status: 'ok',
    app: 'Peyala Business Admin - Backend API',
    mode: 'local-first',
    health: '/health',
    version: '12.0.0',
  })
);

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || 'Internal Server Error' });
});

const PORT = process.env.PORT || 4000;
const server = http.createServer(app);

// Initialize Realtime WebSocket Hub on same port
realtimeHub.init(server);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🍵 Peyala Local-First API & Realtime Hub running on port ${PORT} (0.0.0.0)`);
});

// Clean shutdown handler
const gracefulShutdown = async () => {
  console.log('[Peyala Server] Shutting down gracefully...');
  server.close(async () => {
    try {
      await localDbRunner.stop();
    } catch (_) {}
    process.exit(0);
  });
};
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
