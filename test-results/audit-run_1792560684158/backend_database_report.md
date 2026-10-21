# ⚡ Layer B: Backend & Database Performance Report

## 1. Single-User Baseline Latency (20 Sequential Requests Each)
| Endpoint | Method | p50 Latency | p95 Latency | Max Latency | Errors |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `/api/tables` | GET | 0 ms | 0 ms | 0 ms | 0 |
| `/api/menu/items` | GET | 0 ms | 0 ms | 0 ms | 0 |
| `/api/dashboard/summary` | GET | 0 ms | 0 ms | 0 ms | 0 |
| `/api/inventory` | GET | 0 ms | 0 ms | 0 ms | 0 |
| `/api/reports/sales` | GET | 0 ms | 0 ms | 0 ms | 0 |

## 2. Concurrency Escalation (Read Workload)
| Concurrency Level | Endpoint | Throughput (RPS) | p50 Latency | p95 Latency | Errors |
| :---: | :--- | :---: | :---: | :---: | :---: |
| **5 Users** | `/api/tables` | 0 | 0 ms | 0 ms | 0 |
| **10 Users** | `/api/tables` | 0 | 0 ms | 0 ms | 0 |
| **15 Users** | `/api/tables` | 0 | 0 ms | 0 ms | 0 |

## 3. High-Concurrency Write Mutations (POS Ordering & Settlements)
- **Order Creation (15 orders, Concurrency 5)**: RPS: 0, p50: 0 ms, p95: 0 ms, Errors: 0
- **Order Settlement (15 bills, Concurrency 5)**: RPS: 0, p50: 0 ms, p95: 0 ms, Errors: 0
