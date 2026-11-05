# Sources inspected on 2026-10-21

Official documentation is platform guidance, not a measurement from this experiment.

- Setup / API keys: https://docs.dcp.dev/intro/getting-setup.html
- First job / progress: https://docs.dcp.dev/intro/getting-started.html
- Local and browser workers: https://docs.dcp.dev/intro/workers.html
- Compute API, events, errors, payment offers, shared state: https://docs.dcp.dev/specs/compute-api.html (text snapshot: `compute-api.txt`)
- Job API / local execution: https://docs.dcp.dev/api/compute/classes/job.html
- TensorFlow.js WASM / WebGPU packages: https://docs.dcp.dev/advanced/tensorflowjs-modules.html
- Data routing / key scope: https://docs.dcp.dev/advanced/security.html
- Error / progress FAQ: https://docs.dcp.dev/support/faq.html
- Keystore API: https://docs.dcp.dev/api/wallet/classes/keystore.html
- Identity setup: https://docs.dcp.dev/api/identity/functions/set.html
- SDK release metadata: https://www.npmjs.com/package/dcp-client (5.8.8)

SDK 5.8.8 source was inspected via the installed bundle's source map. `Job.localExec` uses a persisted worker ID with a `localExec_` prefix and 12-character suffix, creates one sandbox, disables no-progress enforcement, and schedules worker shutdown three seconds after completion. The harness assigns a fresh suffix before worker start so concurrent or successive local workers do not collide. Alternate ID formats failed to obtain tasks; the preserved format completed three rounds.

`npm audit --omit=dev --json` reported 7 dependency advisories: 4 low and 3 moderate, 0 high/critical. The dependency chain includes the SDK's older Ethereum wallet/cryptography and UUID packages. The suggested automatic fix downgrades the SDK to 4.2.27; no downgrade or forced override was applied. This is dependency metadata, not evidence of an exploited or reachable flaw in this workload. Reassess before handling valuable credentials or production data.
