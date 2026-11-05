# DCP feasibility experiment — QMIND

**Test date:** October 21, 2026 (America/New_York).  
**Conclusion:** DCP's local execution path can run a small ML workload, exchange model parameters across coordinated rounds, and load TensorFlow.js WASM. The experiment is runnable and measured. Execution across remote physical machines, automatic recovery after worker loss, real worker peak memory, and account-specific costs/limits remain unverified. This is sufficient to continue a synthetic feasibility study; it is not sufficient to select a healthcare deployment architecture.

## What was actually run

Windows 10.0.26300; Node.js 26.12.0; `dcp-client` 5.8.8; 16 available logical CPUs. Initialization contacted `https://scheduler.distributed.computer`. Jobs used the SDK's `localExec(1)`, with temporary identities and a zero-credit slice offer. All compute ran on this computer using local DCP evaluators. No paid remote job was submitted. No patient data was used.

| Assignment item | Observed result | Coverage |
| --- | --- | --- |
| Setup / basic execution | Four slices returned 1, 2809, 4, 144 in 6.34 seconds. | Local DCP execution passed; remote account authorization pending. |
| ML across workers | Four synthetic logistic-regression clients, partitioned over 1/2/4 local DCP worker instances; all reduced training loss. | Multiple local supervisors on one host; no claim of multiple remote machines. |
| Parameter / result exchange | Three rounds broadcast weights and sample-weighted FedAvg updates; received weights matched the previous aggregate. | Coordinator-mediated exchange passed; direct peer messaging untested. |
| Timing / size scaling | Six cases, two dataset sizes and three local worker counts, completed. | End-to-end and per-slice timings recorded; no reliable speedup shown. |
| Memory | Sampled submitter RSS, process max RSS, exact training-buffer bytes, TensorFlow tensor allocation. | Remote/whole-worker peak memory unavailable. |
| Failure / recovery | Injected exception emitted `EUNCAUGHT`; error result rejected; cancellation acknowledged; clean resubmission completed. | Application recovery passed; physical worker loss and scheduler retry untested. |
| Libraries | Published TensorFlow.js WASM package loaded; WASM backend selected; `[1,2,3]²` returned `[1,4,9]`. | Basic tensor operation passed; real-model training, Python packages, GPU untested. |
| Costs / restrictions | Explicit 0-DCC-per-slice submissions; no paid remote work. | Account balance, actual remote charges, quotas and free-worker availability unverified. |

## Measurements

Four client slices, 32 epochs per slice. Each row is a single run. Worker counts below mean concurrent local DCP supervisors/jobs, each requesting one core; they share one physical host. Timings include deployment, scheduling, sandbox creation and result collection.

| Rows/client | Local workers | End-to-end seconds | Mean compute ms/slice | Sampled submitter peak MiB |
| ---: | ---: | ---: | ---: | ---: |
| 256 | 1 | 6.71 | 5.26 | 210.0 |
| 256 | 2 | 19.77 | 6.85 | 228.4 |
| 256 | 4 | 27.25 | 5.81 | 210.9 |
| 4,096 | 1 | 7.04 | 34.43 | 209.5 |
| 4,096 | 2 | 19.18 | 44.13 | 220.2 |
| 4,096 | 4 | 24.64 | 43.00 | 236.9 |

These small jobs spent seconds in orchestration while work functions took milliseconds. More local workers did not improve elapsed time in these trials. This supports batching larger work units before attempting a performance comparison. It does not establish a DCP capacity ceiling or remote scaling behaviour. Warm-up, network variability and one observation per point limit conclusions.

Submitter RSS is sampled every 25 ms and may miss short peaks. All concurrent jobs share the submitter process, so the RSS cannot be attributed to one worker. Process lifetime max RSS reached 330.6 MiB during the full run; it is cumulative and excludes separate evaluator processes. Work functions did not expose `performance.memory`, so worker heap is recorded as `null`. The training data buffer was exactly 6,144 bytes/client at 256 rows and 98,304 bytes/client at 4,096 rows; those figures exclude other arrays, runtime overhead and model allocations. TensorFlow reported 24 bytes for two three-element float tensors; this is tensor accounting, not WASM heap or worker RSS.

Four clients, 1,024 synthetic examples/client, 12 local epochs per round:

| Round | Mean training loss before | Mean training loss after |
| ---: | ---: | ---: |
| 1 | 0.69315 | 0.47536 |
| 2 | 0.47570 | 0.38090 |
| 3 | 0.38118 | 0.32862 |

Final aggregate: `[1.7694116, 1.7071366, 0.0212989]`. Each round began from the previous aggregate. The small difference between one round's post-training loss and the next round's initial loss is expected: individual client models are averaged between rounds. These are training metrics on a deliberately easy synthetic problem; no validation accuracy or clinical usefulness is claimed.

## Technical limitations and implementation findings

1. **DCP workers are not automatically federated institutions.** DCP distributes computation to available workers. This experiment generated synthetic data within each work function; it did not demonstrate data remaining inside hospitals, stable client-to-worker placement or authenticated institutional participation. Those are separate architecture requirements.
2. **Resolved jobs can contain failed computations.** The deliberate exception generated an `error` event with `EUNCAUGHT`, but the SDK also resolved the job with an error object and reported the slice computed. The first harness assumed promise rejection and its failure test correctly exposed that assumption. The final harness validates client IDs, cardinality, duplicates and error payloads before accepting any job results. FedAvg additionally validates sample counts and finite weights. Do not infer successful training from the SDK's completion count alone.
3. **Local worker IDs need separation.** The SDK reused one persisted `localExec_` worker ID. Successive jobs stalled during initial experiments; preserving the expected prefix and 12-character suffix while assigning a fresh ID allowed repeated and concurrent jobs to complete. This is a local harness workaround, not a demonstrated remote platform limitation.
4. **Local and production fault behaviour differ.** SDK `localExec` disables no-progress enforcement. The fault test requests cancellation after the first exception and explicitly resubmits; it does not measure automatic retry count, reassignment, backoff, straggler handling or recovery after a physical worker disappears. Avoid side effects in work functions until retry semantics are established.
5. **Communication tested here has a coordinator barrier.** Updates return to Node, aggregate there, and become the next job's arguments. No direct worker-to-worker channel was tested. The spec describes scheduler-mediated shared state, but the sandbox probe returned `typeof worker === 'undefined'`; shared-state availability needs a separate version-specific check before relying on it.
6. **Dependencies must fit the sandbox.** `process` was unavailable; `require`, `fetch`, `WebAssembly` and `SharedArrayBuffer` were exposed in the tested local sandbox. The published `dcp-tfjs-wasm/tfjs-wasm.js` package worked. An ordinary Node/Python installation does not establish worker compatibility. Full training, model serialization, specific future model libraries, WebGPU and heterogeneous remote workers need their own probes. Local evaluators are a development facility and are not a production security boundary.
7. **Observability has gaps.** Per-slice elapsed time and job events were available; worker peak RSS, actual physical machine identity and remote worker-count control were not established. Remote scaling must record actual fleet participation rather than equating input slices or concurrent jobs with worker count.
8. **Cost and limits are account/pool dependent.** Official docs say the default market-price offer has no upper cap. The harness explicitly uses a numeric zero offer. That may find no eligible free workers. Published error categories include insufficient funds, too many tasks, work too large, slow slices, no progress and too many errors, but no account-specific numeric quotas were established. No fiat price or credit allocation was verified. Cancel acknowledgements are recorded; if cancellation fails or the submitter is interrupted, verify stopped status in the Portal.
9. **Credential/dependency readiness needs review before production.** An encrypted local identity keystore exists but has not been unlocked or authorized for these tests. The installed SDK dependency graph reports 4 low and 3 moderate npm advisories. No forced downgrade was applied. See [research/SOURCES.md](research/SOURCES.md).

## Evidence and reproducibility

- [Full local matrix, federated rounds and dependency probe](results/2026-10-21T23-51-22-308Z-local-all.json). Its initial failure check is marked false because it expected promise rejection; the emitted exception and serialized result are retained.
- [Corrected failure validation and successful coordinator retry](results/2026-10-21T23-54-58-677Z-local-failure.json): injected job failed validation in 4.91 seconds; cancellation acknowledged; four-client retry completed in 6.31 seconds; command exited 0.
- [Separate successful three-round run](results/2026-10-21T23-50-47-769Z-local-federated.json).
- `npm test`: 3/3 checks passed, covering deterministic loss reduction, unchanged broadcast weights, sample-weighted aggregation, invalid/incomplete/duplicate updates and resolved serialized exceptions.
- Earlier JSON files without `finishedAt` are interrupted diagnostic attempts. They are not successful runs. They document the original local-ID collision and two unsuccessful alternate ID formats before the final workaround.
- Source links and the inspected documentation snapshot are in [research/SOURCES.md](research/SOURCES.md). Platform documentation is not counted as a remote experiment result.

## Finish the remote portion this week

Use [README.md](README.md) for exact commands. Reuse/unlock the existing keystore in your own terminal, or download a new expiring Job Creation key linked to the intended account. Then run remote smoke, federated, failure and library cases. Record balances before/after and Portal job/worker evidence. For a controlled worker-count test, use an approved private group/fleet; run each point three times. Stop a worker you control mid-slice to measure automatic recovery, and confirm completion with all expected client updates present exactly once.

**Team update:** “We built and ran a minimal DCP experiment on synthetic data. Local DCP execution supports distributed client training, three rounds of coordinator-mediated model exchange, and TensorFlow.js WASM. Tiny jobs were dominated by orchestration overhead. We also found that worker exceptions can arrive as resolved error results, so updates must be validated. Remote fleet execution, worker-loss recovery, true worker memory and account costs are the remaining gates before we commit to a federated healthcare architecture.”
