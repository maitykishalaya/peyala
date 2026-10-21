# 🖥️ Layer A: Frontend-Only Performance Report

## 1. Core Web Vitals & Render Costs
- **First Contentful Paint (FCP)**: 0 ms
- **DOM Content Loaded**: 280 ms
- **DOM Interactive**: 280 ms
- **Rendered DOM Nodes**: 32 nodes

## 2. Search Responsiveness Across Scaled Catalogs
| Catalog Size | Typing Latency (p50) | Filter Render (p50) | Filter Render (p95) |
| :---: | :---: | :---: | :---: |
| **25 Items** | 265 ms | 6 ms | 15 ms |
| **100 Items** | 266 ms | 5 ms | 52 ms |
| **500 Items** | 385 ms | 12 ms | 79 ms |
| **1,000 Items** | 440 ms | 17 ms | 51 ms |

## 3. Main-Thread Long Tasks (>50ms)
- Total Long Tasks Detected: 13
- Max Long Task Duration: 184 ms

## 4. Memory Usage Snapshot
- Used JS Heap: 77.1 MB
- Total JS Heap: 136.4 MB
