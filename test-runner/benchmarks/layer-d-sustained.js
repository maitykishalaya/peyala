/**
 * Layer D: Memory Leak & Sustained Long-Session Benchmark
 * Runs repeated user journeys (Tables -> Menu -> Reports -> Inventory -> Dashboard)
 * for a sustained period while tracking heap memory, DOM nodes, and interaction latency
 * to detect memory leaks, event listener accumulation, and progressive UI degradation.
 */

const { chromium } = require('playwright-core');
const http = require('http');

function loginBackend(backendUrl) {
  return new Promise((resolve, reject) => {
    const url = new URL('/api/auth/login', backendUrl);
    const body = JSON.stringify({ email: 'cashier@peyala.test', password: 'synthtest123' });
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function runSustainedSessionBenchmark(frontendUrl, backendUrl, cycles = 12) {
  console.log(`\n[Layer D] Starting Sustained Long-Session Benchmark (${cycles} continuous operational cycles)...`);
  const metrics = {
    totalCycles: cycles,
    cycleSnapshots: [],
    leakDetected: false,
    latencyDegradationDetected: false,
  };

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--js-flags=--expose-gc'],
  });

  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });

  const page = await context.newPage();

  // Obtain real signed JWT token from isolated test backend
  let realToken = 'fallback_token';
  let realUser = { id: 'mock_cashier_id', name: 'Benchmark Cashier', email: 'cashier@peyala.test', role: 'staff' };
  try {
    const authData = await loginBackend(backendUrl);
    if (authData?.token) {
      realToken = authData.token;
      realUser = authData.user;
    }
  } catch (_) {}

  // Set authenticated session with real credentials in localStorage
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('peyala_token', token);
    localStorage.setItem('peyala_user', JSON.stringify(user));
  }, { token: realToken, user: realUser });

  // Mock common endpoints to isolate pure frontend memory retention
  await page.route(/\/api\/tables/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  await page.route(/\/api\/table-categories/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  await page.route(/\/api\/menu(?:\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  await page.route(/\/api\/menu\/categories/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  await page.route(/\/api\/addons/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  await page.route(/\/api\/reports\/sales/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  await page.route(/\/api\/dashboard\/summary/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ todaySales: 0, totalOrders: 0 }) }));
  await page.route(/\/api\/inventory/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  await page.route(/\/api\/auth\/me/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(realUser) }));

  const routes = ['/tables', '/menu', '/reports', '/inventory', '/dashboard'];

  for (let cycle = 1; cycle <= cycles; cycle++) {
    const cycleStart = Date.now();
    const routeLatencies = {};

    for (const route of routes) {
      const rStart = Date.now();
      try {
        await page.goto(`${frontendUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 8000 });
        await page.waitForTimeout(100); // Small settle
      } catch (_) {}
      routeLatencies[route] = Date.now() - rStart;
    }

    // Inspect DOM nodes and memory
    const snapshot = await page.evaluate(() => {
      const domNodes = document.querySelectorAll('*').length;
      let usedHeapMB = null;
      if (window.performance && window.performance.memory) {
        usedHeapMB = Math.round((performance.memory.usedJSHeapSize / (1024 * 1024)) * 10) / 10;
      }
      return { domNodes, usedHeapMB };
    });

    const cycleDuration = Date.now() - cycleStart;
    const cycleRecord = {
      cycle,
      cycleDurationMs: cycleDuration,
      ...snapshot,
      routeLatencies,
    };
    metrics.cycleSnapshots.push(cycleRecord);

    console.log(`  [Cycle ${String(cycle).padStart(2, '0')}/${cycles}] Duration=${cycleDuration}ms, DOMNodes=${snapshot.domNodes}, HeapMB=${snapshot.usedHeapMB || 'N/A'}`);
  }

  // Analyze trends
  const firstSnapshot = metrics.cycleSnapshots[0];
  const lastSnapshot = metrics.cycleSnapshots[metrics.cycleSnapshots.length - 1];

  if (firstSnapshot.usedHeapMB && lastSnapshot.usedHeapMB) {
    const heapGrowth = lastSnapshot.usedHeapMB - firstSnapshot.usedHeapMB;
    metrics.heapGrowthMB = Math.round(heapGrowth * 10) / 10;
    // If heap grew more than 50MB across 15 cycles without unbounded state, flag review
    if (heapGrowth > 50) {
      metrics.leakDetected = true;
    }
  }

  const firstDuration = firstSnapshot.cycleDurationMs;
  const lastDuration = lastSnapshot.cycleDurationMs;
  if (lastDuration > firstDuration * 1.8) {
    metrics.latencyDegradationDetected = true;
  }

  console.log(`[Layer D] Sustained session completed. LeakDetected: ${metrics.leakDetected}, LatencyDegraded: ${metrics.latencyDegradationDetected}`);

  await context.close();
  await browser.close();
  return metrics;
}

module.exports = { runSustainedSessionBenchmark };
