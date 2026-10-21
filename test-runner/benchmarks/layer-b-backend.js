/**
 * Layer B: Backend-Only API & Database Performance Benchmark
 * Tests isolated test backend on port 4001 against disposable MongoDB on port 27019.
 * Measures throughput, p50, p95, p99 latency, DB query duration, and concurrency scaling.
 */

const http = require('http');

function calculateStats(latencies) {
  if (!latencies.length) return { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0, count: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const avg = Math.round(sum / sorted.length);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const p50 = sorted[Math.floor(sorted.length * 0.50)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  return { min, max, avg, p50, p95, p99, count: sorted.length };
}

function httpRequest({ baseUrl, method = 'GET', path, body = null, token = null, timeout = 10000 }) {
  return new Promise((resolve) => {
    const url = new URL(path, baseUrl);
    const postData = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout,
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    if (postData) options.headers['Content-Length'] = Buffer.byteLength(postData);

    const start = Date.now();
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        const duration = Date.now() - start;
        let parsed;
        try { parsed = JSON.parse(data); } catch (_) { parsed = data; }
        resolve({ status: res.statusCode, duration, data: parsed });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 504, error: 'TIMEOUT', duration: Date.now() - start });
    });
    req.on('error', (err) => {
      resolve({ status: 500, error: err.message, duration: Date.now() - start });
    });

    if (postData) req.write(postData);
    req.end();
  });
}

async function runConcurrentBatch({ workerFn, totalRequests, concurrency }) {
  let currentIndex = 0;
  const results = [];
  const start = Date.now();

  const worker = async () => {
    while (currentIndex < totalRequests) {
      const idx = currentIndex++;
      try {
        const res = await workerFn(idx);
        results.push(res);
      } catch (err) {
        results.push({ status: 500, error: err.message, duration: 0 });
      }
    }
  };

  const pool = Array.from({ length: concurrency }, () => worker());
  await Promise.all(pool);
  const totalTimeMs = Date.now() - start;
  const rps = Math.round((results.length / (totalTimeMs / 1000)) * 10) / 10;
  return { results, totalTimeMs, rps };
}

async function runBackendBenchmark(baseUrl) {
  console.log(`\n[Layer B] Starting Backend API & Database Benchmark on ${baseUrl}...`);
  const metrics = {};

  // 1. Authenticate with synthetic cashier
  const loginRes = await httpRequest({
    baseUrl,
    method: 'POST',
    path: '/api/auth/login',
    body: { email: 'cashier@peyala.test', password: 'synthtest123' },
  });

  if (loginRes.status !== 200 || !loginRes.data?.token) {
    throw new Error(`Layer B Auth Failed: Status ${loginRes.status} - ${JSON.stringify(loginRes.data)}`);
  }
  const token = loginRes.data.token;
  console.log(`[Layer B] Authenticated successfully as ${loginRes.data.user.name}. Token received.`);

  // Endpoints to benchmark under single-user and concurrency
  const testEndpoints = [
    { name: 'GET_Tables', path: '/api/tables' },
    { name: 'GET_MenuItems', path: '/api/menu' },
    { name: 'GET_DashboardSummary', path: '/api/dashboard/summary' },
    { name: 'GET_Inventory', path: '/api/inventory/items' },
    { name: 'GET_SalesReport', path: '/api/reports/sales' },
  ];

  // A. Baseline Single-Request Latency (20 sequential requests each)
  console.log('[Layer B] Running Baseline Single-Request Latency (20 sequential iterations)...');
  metrics.singleUser = {};
  for (const ep of testEndpoints) {
    const latencies = [];
    let errCount = 0;
    for (let i = 0; i < 20; i++) {
      const res = await httpRequest({ baseUrl, path: ep.path, token });
      if (res.status === 200) latencies.push(res.duration);
      else errCount++;
    }
    const stats = calculateStats(latencies);
    stats.errorCount = errCount;
    metrics.singleUser[ep.name] = stats;
    console.log(`  -> ${ep.name.padEnd(25)}: avg=${stats.avg}ms, p50=${stats.p50}ms, p95=${stats.p95}ms, max=${stats.max}ms`);
  }

  // B. Concurrency Escalation (Concurrency 5, 10, 15)
  metrics.concurrency = {};
  const concurrencyLevels = [5, 10, 15];

  for (const c of concurrencyLevels) {
    console.log(`[Layer B] Testing Read Concurrency (Concurrency: ${c}, Total Requests: ${c * 10})...`);
    metrics.concurrency[`c_${c}`] = {};

    for (const ep of testEndpoints) {
      const { results, totalTimeMs, rps } = await runConcurrentBatch({
        workerFn: () => httpRequest({ baseUrl, path: ep.path, token }),
        totalRequests: c * 10,
        concurrency: c,
      });

      const latencies = results.filter((r) => r.status === 200).map((r) => r.duration);
      const errors = results.filter((r) => r.status !== 200).length;
      const stats = calculateStats(latencies);
      stats.rps = rps;
      stats.errors = errors;
      stats.totalTimeMs = totalTimeMs;
      metrics.concurrency[`c_${c}`][ep.name] = stats;

      console.log(`  [C=${c}] ${ep.name.padEnd(24)}: RPS=${rps}, p50=${stats.p50}ms, p95=${stats.p95}ms, errors=${errors}`);
    }
  }

  // C. Write Concurrency (Simultaneous POS Order Creation & Settlements)
  console.log('[Layer B] Testing High-Concurrency Write Mutations (15 concurrent order creations & settlements)...');
  const tablesRes = await httpRequest({ baseUrl, path: '/api/tables', token });
  const tables = tablesRes.data || [];
  const menuRes = await httpRequest({ baseUrl, path: '/api/menu', token });
  const menuItems = menuRes.data || [];

  const createdOrderIds = [];
  const writeLatencies = [];
  let writeErrors = 0;

  const { results: orderResults, rps: orderRps } = await runConcurrentBatch({
    workerFn: async (idx) => {
      const table = tables[idx % tables.length];
      const item1 = menuItems[idx % menuItems.length];
      const item2 = menuItems[(idx + 1) % menuItems.length];

      const createRes = await httpRequest({
        baseUrl,
        method: 'POST',
        path: '/api/orders',
        token,
        body: {
          tableId: table._id,
          items: [
            { menuItemId: item1._id, quantity: 2, price: item1.price, name: item1.name },
            { menuItemId: item2._id, quantity: 1, price: item2.price, name: item2.name },
          ],
        },
      });

      const orderId = createRes.data?._id || createRes.data?.order?._id;
      if ((createRes.status === 200 || createRes.status === 201) && orderId) {
        createdOrderIds.push(orderId);
      }
      return createRes;
    },
    totalRequests: 15,
    concurrency: 5,
  });

  const orderStats = calculateStats(orderResults.filter(r => r.status === 200 || r.status === 201).map(r => r.duration));
  orderStats.rps = orderRps;
  orderStats.errors = orderResults.filter(r => r.status !== 200 && r.status !== 201).length;
  metrics.orderCreation = orderStats;
  console.log(`  -> Order Creation (15 orders): RPS=${orderRps}, p50=${orderStats.p50}ms, p95=${orderStats.p95}ms, errors=${orderStats.errors}`);

  // Settle each created order
  const { results: payResults, rps: payRps } = await runConcurrentBatch({
    workerFn: async (idx) => {
      const orderId = createdOrderIds[idx];
      if (!orderId) return { status: 400, duration: 0 };
      // Bill order
      await httpRequest({ baseUrl, method: 'POST', path: `/api/orders/${orderId}/bill`, token });
      // Settle payment
      const payRes = await httpRequest({
        baseUrl,
        method: 'POST',
        path: `/api/orders/${orderId}/pay`,
        token,
        body: { paymentMethod: 'cash' },
      });
      return payRes;
    },
    totalRequests: createdOrderIds.length,
    concurrency: 5,
  });

  const payStats = calculateStats(payResults.filter(r => r.status === 200).map(r => r.duration));
  payStats.rps = payRps;
  payStats.errors = payResults.filter(r => r.status !== 200).length;
  metrics.orderSettlement = payStats;
  console.log(`  -> Order Settlement (${createdOrderIds.length} bills): RPS=${payRps}, p50=${payStats.p50}ms, p95=${payStats.p95}ms, errors=${payStats.errors}`);

  return metrics;
}

module.exports = { runBackendBenchmark };
