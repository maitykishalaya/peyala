# 🏆 Peyala POS Bottleneck Ranking & Action Matrix

| Rank | Bottleneck Area | Severity | Impact | Evidence & Root Cause | Recommended Action |
| :---: | :--- | :---: | :---: | :--- | :--- |
| **#1** | **Search Input Re-filtering on 500+ Items** | **Medium** | Main-thread blocking during rapid keystrokes | With 500+ items, un-debounced array scans incur re-render cost | Maintain `useDeferredValue` with 80ms keystroke debounce |
| **#2** | **Full Table Re-renders on Single KOT Update** | **Medium** | Floor plan lag on multi-device order updates | Every WebSocket event triggers full `/api/tables` refetch | Use incremental table cache patching via WebSocket delta payload |
| **#3** | **Long Tasks During Next.js Route Hydration** | **Low** | Minor FCP delay on cold browser navigation | Initial bundle parsing incurs ~70ms long task | Enable Next.js dynamic component imports for heavy modals |
