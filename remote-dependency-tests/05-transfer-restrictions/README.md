# 05 — Transfer and restricted access

## Public-network sandbox reuse

Four slices returned four distinct random sandbox markers, all on their first call. No same-sandbox reuse was observed in this job; marker differences do not identify physical machines or rule out a shared worker cache. All returned TensorFlow.js 4.22.0 and correct results. Job `4Vd3z4IgQKWc3d8MjVcVZW`; user-reported balance 4,990 → 4,986 DCC. [Evidence](2026-11-05T17-13-48-215Z-public.json).

## Transfer on a controlled local worker

One completed HTTPS response from `cdn.packages.distributed.computer` carried 2,943,254 response-body bytes, matching its `Content-Length`; no `Content-Encoding` was reported. This excludes HTTP headers, redirects without captured responses, TLS and TCP overhead. One earlier request was observed without a completed response, so this is not the total network traffic. [Evidence](2026-11-05T17-12-12-266Z-measure-local.json).

## Restricted access

A fresh local sandbox could not complete its slices when dependency HTTP requests to `packages.distributed.computer` were blocked; the job was cancelled and the scheduler acknowledged cancellation. [Evidence](2026-11-05T17-17-59-751Z-deny-local.json). This blocks dependency requests inside this process only, not all network traffic.

The [first denial attempt](2026-11-05T17-13-25-578Z-deny-local.json) also blocked its cancellation request, which failed; its `passed` flag only reflected blocked requests and must not be treated as a clean pass. The corrected probe excludes cancellation from the restriction. The local job used a temporary identity and a zero offer.

After the module was fetched, a second local test enabled dependency-request denial. Four calls completed in the same sandbox with no further module fetch attempted. [Evidence](2026-11-05T17-19-07-817Z-warm-deny-local.json). This does not show that a worker, scheduler, or new job can operate offline.

A real hospital test still needs an approved worker and network policy, dependency approval, controlled placement, and authorized local data access. No hospital or whole-machine offline environment was tested.

Run locally from this directory with `node run.js measure`, `node run.js deny`, or `node run.js warm-deny` (0 DCC). Run the public probe with `node public.js` after setting the portal key in your terminal (four slices, 4 DCC offer ceiling). The local trace uses unsupported SDK internals. Never store credentials here.
