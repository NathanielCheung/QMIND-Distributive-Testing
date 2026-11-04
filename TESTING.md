# QMIND Distributive testing

Account: cnathaniel168@gmail.com
Balance: 5,000.000 DCC
Spent: 0 DCC
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

## What we had to fix

The first local runs deployed a job and then waited forever. The bundled local worker asks for slices with the null payment address, `0x000…0`, and the scheduler does not assign work to that address. `capitalize.js` now sets the worker payment address to the current identity before the worker starts, and it gives each run a new `localExec_` worker id so an interrupted run cannot leave an id that receives no slices.

The identity is read from `DCP_IDENTITY_KEY` or `DCP_API_KEY` in the shell. It is not stored in the repository. If neither variable is set, the script uses a temporary identity. That is the identity that passed the local test.

A portal page that shows an API key, or an active Chrome login, only shows that the account session exists. The job is working when the script prints the joined result.

## What we already ruled out

The work-function sandbox does not include Node `fs` or `require`. A slice cannot read a `data.txt` file that happens to sit on the worker laptop. Data for a slice has to be in the job input set, or fetched from a URL the sandbox is allowed to use.

`localExec` jobs cannot be added to a compute group. The scheduler rejects that with `DCPS-1110`.

Slices are assigned by the scheduler. There is no manual assignment step in the portal.

## How the 5,000 DCC will be spent

`job.localExec()` stays the free regression test. Repeat it whenever the script changes. It should keep printing `HELLO WORLD FROM DISTRIBUTIVE` and it should keep costing 0 DCC.

`job.exec()` with no price uses `compute.marketValue`, and that offer has no per-slice ceiling. Every paid test in this project will pass a numeric DCC amount. The most that job can cost is the number of slices multiplied by that amount. Source: [Job.exec](https://docs.dcp.dev/api/compute/classes/job.html) and [Compute API](https://docs.dcp.dev/specs/compute-api.html). Pricing background: [Compute Economics](https://distributive.network/docs/compute-economics.html).

Before the first paid job, record the portal balance. After it finishes, record the balance again. That difference is the measured cost. The market rate is unknown until that measurement exists.

Paid tests use the portal identity for `cnathaniel168@gmail.com`. The temporary identity that passed local execution has no credits.

Pre-ML ceiling: 120 DCC, which is 2.4% of the grant. The other 4,880 DCC stays unused until a measured per-slice cost exists. Cancel a job before raising its offer so the higher price replaces the lower one.

| Step | What it proves | Price | Ceiling | Pass |
| --- | --- | --- | --- | --- |
| Local regression | The script still joins four slices | `localExec`, price 0 | 0 DCC | `HELLO WORLD FROM DISTRIBUTIVE` |
| Public smoke | A remote worker can do the same job | `job.exec(1)` on 4 slices. If no worker accepts it, cancel and retry at 5, then 10 | 4, then 20, then 40 DCC | Same string, plus the balance change |
| Two laptops | Our own machines can take slices and return them in order | The offer that succeeded above | At most 40 DCC | Same string. Note which machine completed each slice |
| Input-set data | A small dataset can travel inside the job | Same offer, still 4 slices | At most 40 DCC | A short summary comes back, and the balance change is recorded |

Federated learning waits until those four steps have a measured DCC cost per slice. The first learning round, when it happens, uses a tiny model, a few slices, and a numeric offer. It scales only after that round's cost is known.
