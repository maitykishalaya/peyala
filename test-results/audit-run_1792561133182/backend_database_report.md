# ⚡ Layer B: Backend & Database Performance Report

## 1. Single-User Baseline Latency (20 Sequential Requests Each)
| Endpoint | Method | p50 Latency | p95 Latency | Max Latency | Errors |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `/api/tables` | GET | 8 ms | 28 ms | 28 ms | 0 |
| `/api/menu` | GET | 26 ms | 77 ms | 77 ms | 0 |
| `/api/dashboard/summary` | GET | 41 ms | 126 ms | 126 ms | 0 |
| `/api/inventory/items` | GET | 3 ms | 7 ms | 7 ms | 0 |
| `/api/reports/sales` | GET | 3 ms | 5 ms | 5 ms | 0 |

## 2. Concurrency Escalation (Read Workload)
| Concurrency Level | Endpoint | Throughput (RPS) | p50 Latency | p95 Latency | Errors |
| :---: | :--- | :---: | :---: | :---: | :---: |
| **5 Users** | `/api/tables` | 297.6 | 15 ms | 25 ms | 0 |
| **10 Users** | `/api/tables` | 342.5 | 27 ms | 46 ms | 0 |
| **15 Users** | `/api/tables` | 526.3 | 27 ms | 43 ms | 0 |

## 3. High-Concurrency Write Mutations (POS Ordering & Settlements)
- **Order Creation (15 orders, Concurrency 5)**: RPS: 37.2, p50: 114 ms, p95: 189 ms, Errors: 0
- **Order Settlement (15 bills, Concurrency 5)**: RPS: 33.9, p50: 108 ms, p95: 122 ms, Errors: 3
