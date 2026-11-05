# 02 — Dependency training

One slice trained logistic regression on 1,024 synthetic examples for 12 epochs. WASM backend; valid weights; loss fell from 0.69315 to 0.48071.

- Local: passed; 179.29 s job time. [Evidence](2026-11-05T16-50-24-756Z-local.json).
- Remote: passed; 5.12 s job time, 100 ms backend initialization, 20 ms training. Job `Cbv0oCLlsCYRGNVCtpNw32`. [Evidence](2026-11-05T16-55-45-238Z-remote.json).
- Local and remote weights matched exactly. Remote training and the following federated round together decreased the user-reported balance by 5 DCC; individual charges were not recorded.
