# Remote dependency tests

Three ordered tests use `dcp-tfjs-wasm/tfjs-wasm.js` and synthetic data. Each folder contains its run notes and JSON evidence.

1. [Smoke](01-smoke/README.md): load TensorFlow.js WASM and square numbers.
2. [Training](02-training/README.md): train logistic regression on one synthetic dataset.
3. [Federated](03-federated/README.md): train four separate models and average their weights.

From this directory, run `node run.js local training` for the local check. In your own terminal, set `DCP_API_KEY` as in [SETUP.md](../SETUP.md), then run `node run.js remote all`. The remote sequence stops at the first failure. Offers are capped at 1 DCC per slice (1 + 1 + 4 = 6 DCC maximum); check the Portal for actual charges and job status after errors or interruption. Do not store keys here.

Initialization time includes module loading/backend setup, not necessarily a download; these tests do not measure cache reuse. Public workers are not hospital clients, and no real data is used.

November 5: all three remote tests passed. The user-reported balance fell from 4,996 to 4,990 DCC across them. Times are individual observations, not a scaling benchmark.

4. [Cache observation](04-cache-observation/README.md): instrumented local-worker module fetches and reuse; no DCC used.

5. [Transfer and restrictions](05-transfer-restrictions/README.md): public sandbox markers, local HTTP-body measurement, and dependency-access denial.
