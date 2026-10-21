# 🖥️ Layer A: Frontend-Only Performance Report

## 1. Core Web Vitals & Render Costs
- **First Contentful Paint (FCP)**: 0 ms
- **DOM Content Loaded**: 239 ms
- **DOM Interactive**: 239 ms
- **Rendered DOM Nodes**: 32 nodes

## 2. Search Responsiveness Across Scaled Catalogs
| Catalog Size | Typing Latency (p50) | Filter Render (p50) | Filter Render (p95) |
| :---: | :---: | :---: | :---: |
| **25 Items** | 218 ms | 6 ms | 91 ms |
| **100 Items** | 369 ms | 21 ms | 89 ms |
| **500 Items** | 496 ms | 4 ms | 172 ms |
| **1,000 Items** | 671 ms | 53 ms | 580 ms |

## 3. Main-Thread Long Tasks (>50ms)
- Total Long Tasks Detected: 47
- Max Long Task Duration: 319 ms

## 4. Memory Usage Snapshot
- Used JS Heap: 14 MB
- Total JS Heap: 125.9 MB
