# ⚡ Layer B: Backend & Database Performance Report

## 1. Single-User Baseline Latency (20 Sequential Requests Each)
| Endpoint | Method | p50 Latency | p95 Latency | Max Latency | Errors |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `/api/tables` | GET | 7 ms | 35 ms | 35 ms | 0 |
| `/api/menu` | GET | 26 ms | 67 ms | 67 ms | 0 |
| `/api/dashboard/summary` | GET | 45 ms | 124 ms | 124 ms | 0 |
| `/api/inventory/items` | GET | 4 ms | 9 ms | 9 ms | 0 |
| `/api/reports/sales` | GET | 4 ms | 6 ms | 6 ms | 0 |

## 2. Concurrency Escalation (Read Workload)
| Concurrency Level | Endpoint | Throughput (RPS) | p50 Latency | p95 Latency | Errors |
| :---: | :--- | :---: | :---: | :---: | :---: |
| **5 Users** | `/api/tables` | 273.2 | 17 ms | 25 ms | 0 |
| **10 Users** | `/api/tables` | 317.5 | 30 ms | 40 ms | 0 |
| **15 Users** | `/api/tables` | 483.9 | 30 ms | 33 ms | 0 |

## 3. High-Concurrency Write Mutations (POS Ordering & Settlements)
- **Order Creation (15 orders, Concurrency 5)**: RPS: 42.1, p50: 108 ms, p95: 159 ms, Errors: 0
- **Order Settlement (15 bills, Concurrency 5)**: RPS: 33, p50: 97 ms, p95: 118 ms, Errors: 3
