# ⚡ Layer B: Backend & Database Performance Report

## 1. Single-User Baseline Latency (20 Sequential Requests Each)
| Endpoint | Method | p50 Latency | p95 Latency | Max Latency | Errors |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `/api/tables` | GET | 7 ms | 30 ms | 30 ms | 0 |
| `/api/menu` | GET | 24 ms | 61 ms | 61 ms | 0 |
| `/api/dashboard/summary` | GET | 38 ms | 101 ms | 101 ms | 0 |
| `/api/inventory/items` | GET | 3 ms | 8 ms | 8 ms | 0 |
| `/api/reports/sales` | GET | 4 ms | 5 ms | 5 ms | 0 |

## 2. Concurrency Escalation (Read Workload)
| Concurrency Level | Endpoint | Throughput (RPS) | p50 Latency | p95 Latency | Errors |
| :---: | :--- | :---: | :---: | :---: | :---: |
| **5 Users** | `/api/tables` | 287.4 | 16 ms | 23 ms | 0 |
| **10 Users** | `/api/tables` | 343.6 | 28 ms | 38 ms | 0 |
| **15 Users** | `/api/tables` | 614.8 | 24 ms | 28 ms | 0 |

## 3. High-Concurrency Write Mutations (POS Ordering & Settlements)
- **Order Creation (15 orders, Concurrency 5)**: RPS: 46.3, p50: 94 ms, p95: 140 ms, Errors: 0
- **Order Settlement (15 bills, Concurrency 5)**: RPS: 36.8, p50: 94 ms, p95: 105 ms, Errors: 3
