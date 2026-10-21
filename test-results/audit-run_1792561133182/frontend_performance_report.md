# 🖥️ Layer A: Frontend-Only Performance Report

## 1. Core Web Vitals & Render Costs
- **First Contentful Paint (FCP)**: 0 ms
- **DOM Content Loaded**: 328 ms
- **DOM Interactive**: 328 ms
- **Rendered DOM Nodes**: 32 nodes

## 2. Search Responsiveness Across Scaled Catalogs
| Catalog Size | Typing Latency (p50) | Filter Render (p50) | Filter Render (p95) |
| :---: | :---: | :---: | :---: |
| **25 Items** | 238 ms | 10 ms | 21 ms |
| **100 Items** | 331 ms | 6 ms | 58 ms |
| **500 Items** | 373 ms | 12 ms | 52 ms |
| **1,000 Items** | 415 ms | 51 ms | 66 ms |

## 3. Main-Thread Long Tasks (>50ms)
- Total Long Tasks Detected: 14
- Max Long Task Duration: 217 ms

## 4. Memory Usage Snapshot
- Used JS Heap: 52.9 MB
- Total JS Heap: 126.4 MB
