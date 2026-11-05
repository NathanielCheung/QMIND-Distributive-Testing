# Synthetic federated-learning experiment

The imported harness runs four deterministic synthetic clients, each with 1,024 examples and 12 local epochs, starting from `[0,0,0]`. A coordinator checks every returned client and loss, then uses sample-weighted FedAvg. `round` runs the first round of the earlier three-round experiment; local and remote use the same work function and inputs. No patient data is involved.

From the repository root, install with `npm ci`, then:

```powershell
cd synthetic-ml
node --test workload.test.js
node experiment.js local round
# In your own terminal, set DCP_API_KEY as in ../SETUP.md, then:
node experiment.js remote round
node compare.js results/<local-file>.json results/<remote-file>.json
```

Use actual filenames rather than angle brackets. Remote mode requires the portal job identity (`DCP_API_KEY` or `DCP_IDENTITY_KEY`) and is restricted to `round`: four slices offered 1 DCC each, for a 4 DCC offer ceiling. It does not fall back to a keystore or an uncapped market offer. The local run uses an ephemeral identity and a zero offer. Never put keys in the repo or evidence files. Record the Portal balance before and after; the offer ceiling is not a measurement of the charge. Check the Portal if a job times out or cancellation is not acknowledged.

JSON evidence goes into `results/` relative to the working directory. Results include events, client outputs, aggregate, timing and SDK/environment details. The comparison checks aggregates within 1e-9, losses and elapsed times. Confirm both files used the same code revision and inputs: the reports do not record a source hash. One measurement per mode is a correctness and feasibility comparison, not a scaling or speed claim. Report unexpected errors and incomplete jobs as such.

The synthetic datasets are generated on workers; this does not establish institutional data residency, trusted worker placement, or healthcare suitability. The coordinator mediates parameter exchange. Separate experiments will test performance, controlled worker placement, and failure/recovery.

The original October 21 findings are in [PREVIOUS-RESULTS.md](PREVIOUS-RESULTS.md), with selected raw local evidence and documentation snapshots. Those were local DCP evaluator runs, not remote machine tests. Their three rounds show how the first round feeds subsequent rounds.
