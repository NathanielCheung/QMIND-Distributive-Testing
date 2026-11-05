# 04 — Dependency downloads and reuse

Controlled local DCP worker, SDK 5.8.8; four slices per job, same TensorFlow.js dependency. Run `node run.js 1` or `node run.js 2` here. Temporary identity, 0 DCC. Instrumentation uses unsupported SDK internals and fails explicitly if unavailable.

- [First run](2026-11-05T17-04-38-779Z-local.json): one cache miss and one successful module fetch; four slices completed. One local evaluator requested. The sandbox identity was not recorded in this run.
- [Second run](2026-11-05T17-06-26-648Z-local.json): one cache miss and one successful module fetch; all four calls reported successive invocation numbers 1–4 in the same sandbox. Two cores were requested, but this does not prove two sandboxes participated. The first require took 111 ms; later calls took 0.018–0.062 ms. Each call's second require returned the same module object.
- Each job fetched a 2,943,254-byte module source with SHA-256 `f8b21807c9452d992ce4c9ff65d7d8bde8007b3293b6ccdf8fdb385e480f803d`; TensorFlow.js reported version 4.22.0. Those are source-text bytes, not measured network-wire bytes. Fetch operation times were 954 ms and 648 ms and include module resolution and network activity.
- No supervisor-cache hits were observed: the repeated calls reused a sandbox without another supervisor cache lookup. These observations establish reuse in this local sandbox, not cache behavior across public workers or jobs. Each local job created a fresh worker; we cannot infer persistent-worker behavior across jobs.
- The first instrumentation attempt failed and was cancelled before work; its JSON is retained. It used the wrong internal access path.

SDK 5.8.8 source says the supervisor caches module groups by requested module list, shares pending fetches, and removes entries when no job references remain. This is implementation evidence, not a guarantee for different SDK/worker versions. We did not capture cache hits, network bytes, offline behavior, or hospital-machine behavior.
