# QMIND Distributive testing

Account: cnathaniel168@gmail.com
Balance: 4,996 DCC
Spent: 4 DCC
Repository: https://github.com/NathanielCheung/QMIND-Distributive-Testing

## What already works

The first test splits four strings across DCP slices, capitalizes each slice, and joins the results in order.

Input: `hello `, `world `, `from `, `distributive`

On 4 November 2026, `node capitalize.js` finished with a temporary identity and no portal key. The last line was:

```text
Final result: HELLO WORLD FROM DISTRIBUTIVE
```

That run used `job.localExec()`. The client sets the slice price to 0 for local execution, so this test did not spend any of the 5,000 DCC. The worker polled several times before the scheduler returned a slice. Those empty polls are normal. The pass line is the joined uppercase string.

Environment: Windows, PowerShell, Node, `dcp-client` 5.8.8, scheduler `https://scheduler.distributed.computer`.

## Remote test on 4 November 2026

The same four strings were sent to the public network with the portal identity. The command was `node capitalize.js remote`, which calls `job.exec(1)`. The offer was 1 DCC per slice. Four slices made the ceiling 4 DCC. The payment address shown by the script was `0x8F0c...Bfcc`.

The scheduler accepted the job as `bA4j2urO6fDrzxoikaVJDp`. Slices came back from the network out of order:

| Arrival | Slice | Result |
| --- | --- | --- |
| 1 | 2 | `WORLD ` |
| 2 | 4 | `DISTRIBUTIVE` |
| 3 | 1 | `HELLO ` |
| 4 | 3 | `FROM ` |

The script sorted those results by slice number and printed:

```text
Final result: HELLO WORLD FROM DISTRIBUTIVE
```

The portal balance was 5,000.000 DCC before the job and 4,996 DCC after it. The charge was 4 DCC, which is the full offer: 1 DCC for each slice. A public worker completed the job at that price, so the offer does not need to be raised for this workload.

## What we had to fix

The first local runs deployed a job and then waited forever. The bundled local worker asks for slices with the null payment address, `0x000…0`, and the scheduler does not assign work to that address. `capitalize.js` now sets the worker payment address to the current identity before the worker starts, and it gives each run a new `localExec_` worker id so an interrupted run cannot leave an id that receives no slices.

The identity is read from `DCP_IDENTITY_KEY` or `DCP_API_KEY` in the shell. It is not stored in the repository. If neither variable is set, the script uses a temporary identity. That is the identity that passed the local test.

A portal page that shows an API key, or an active Chrome login, only shows that the account session exists. The job is working when the script prints the joined result.

## What we already ruled out

The work-function sandbox does not include Node `fs` or `require`. A slice cannot read a `data.txt` file that happens to sit on the worker laptop. Data for a slice has to be in the job input set, or fetched from a URL the sandbox is allowed to use.

`localExec` jobs cannot be added to a compute group. The scheduler rejects that with `DCPS-1110`.

Slices are assigned by the scheduler. There is no manual assignment step in the portal.

## How the remaining DCC will be spent

`job.localExec()` stays the free regression test. Repeat it whenever the script changes. It should keep printing `HELLO WORLD FROM DISTRIBUTIVE` and it should keep costing 0 DCC.

`job.exec()` with no price uses `compute.marketValue`, and that offer has no per-slice ceiling. Every paid test in this project passes a numeric DCC amount. The most that job can cost is the number of slices multiplied by that amount. Source: [Job.exec](https://docs.dcp.dev/api/compute/classes/job.html) and [Compute API](https://docs.dcp.dev/specs/compute-api.html). Pricing background: [Compute Economics](https://distributive.network/docs/compute-economics.html).

The measured price for this workload is 1 DCC per slice. The 4 November remote job cost 4 DCC, and 4,996 DCC remains. Paid tests use the portal identity for `cnathaniel168@gmail.com`. The temporary identity that passed local execution has no credits.

The pre-ML envelope is still 120 DCC. This test used 4 DCC of it, so 116 DCC remains inside that envelope. The other 4,880 DCC stays unused. Another four-slice job at this same offer costs 4 DCC.

| Step | What it proves | Price | Result |
| --- | --- | --- | --- |
| Local regression | The script still joins four slices | `localExec`, price 0 | Passed on 4 November 2026. Cost 0 DCC |
| Public smoke | A remote worker can do the same job | `node capitalize.js remote`, `job.exec(1)`, 4 slices | Passed on 4 November 2026. Job `bA4j2urO6fDrzxoikaVJDp`. Cost 4 DCC |
| Two laptops | Our own machines can take slices and return them in order | 1 DCC per slice | Not run. Expected cost 4 DCC for four slices |
| Input-set data | A small dataset can travel inside the job | 1 DCC per slice, four slices | Not run. Expected cost 4 DCC |

The first learning round uses a tiny model, a few slices, and a numeric offer. The laptop and input-set tests remain useful separate experiments.

## Synthetic federated learning

The branch includes the prior local synthetic ML harness under [synthetic-ml](synthetic-ml/README.md). A matched one-round local/remote experiment with four synthetic clients passed; its result files and comparison are recorded below. The remote offer is capped at 1 DCC per slice, or 4 DCC for this four-slice job. The user reported the Portal balance before and after the remote run; see below. Further performance and worker-failure studies are separate experiments.


### One-round comparison, November 5, 2026

- Local: [raw evidence](synthetic-ml/results/2026-11-05T15-38-18-080Z-local-round.json). All four updates were valid and reduced loss; mean loss fell from 0.693147 to 0.475357. FedAvg weights were `[0.8237028771, 0.7915492703, 0.0170594851]`. End-to-end job time was 95.06 s, with scheduler waiting included; this is one observation, not a speed benchmark.
- Remote: [raw evidence](synthetic-ml/results/2026-11-05T15-42-31-800Z-remote-round.json), job `sPmBC8drAVc28jWkUbBSuj`. All four updates passed the same checks, with identical mean losses and aggregate weights. The job took 53.89 s end to end. It offered 1 DCC per slice, a 4 DCC ceiling. The user reported a Portal balance of 5,000 DCC before and 4,996 DCC after, a 4 DCC decrease.
- [Comparison](synthetic-ml/results/2026-11-05-local-remote-comparison.json): all three aggregate weight differences were zero. Local and remote used the same synthetic workload and starting weights. Timing includes scheduling and job setup; one run in each mode cannot establish a speedup or scaling behavior. The record does not establish the number or identities of physical remote workers.
