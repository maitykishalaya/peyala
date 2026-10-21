# 🔁 Benchmark Reproduction Instructions

To rerun this exact isolated benchmark at any time without risking production data:

```powershell
# 1. Switch to test branch
git checkout test/full-stack-load-audit

# 2. Execute automated isolated load test runner
node test-runner/run-full-audit.js
```

The test runner will automatically:
- Verify preflight safety boundaries.
- Spawn a dedicated test MongoDB process on port 27019.
- Seed purely synthetic test data.
- Run Layer A, Layer B, Layer C, and Layer D benchmarks.
- Clean up test processes and delete test storage upon completion.
