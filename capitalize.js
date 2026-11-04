const LOCAL_EXEC_TIMEOUT_MS = 120000;
const REMOTE_EXEC_TIMEOUT_MS = 180000;
const REMOTE_DCC_PER_SLICE = 1;

async function main() {
  const remote = parseMode(process.argv.slice(2));
  if (remote && !process.env.DCP_IDENTITY_KEY && !process.env.DCP_API_KEY) {
    throw new Error(
      "Remote execution spends DCC from the portal account. Set DCP_API_KEY in this terminal, then run: node capitalize.js remote",
    );
  }

  const { init } = require("dcp-client");
  await init("https://scheduler.distributed.computer");

  const compute = require("dcp/compute");
  const wallet = require("dcp/wallet");
  const identity = require("dcp/identity");
  const paymentAccount = await loadIdentity(identity, wallet);
  const paymentAddress = paymentAccount.address;

  const chunks = [
    "hello ",
    "world ",
    "from ",
    "distributive",
  ];

  function capitalize(text) {
    progress();
    return text.toUpperCase();
  }

  const job = compute.for(chunks, capitalize);

  job.on("accepted", () => {
    console.log(`Job accepted: ${job.id}`);
  });
  job.on("result", (value) => {
    console.log("Slice result:", value);
  });
  job.on("readystatechange", (state) => {
    console.log(`Job state: ${state}`);
  });
  job.on("error", (error) => {
    console.error("Job error:", error && error.message ? error.message : error);
  });

  let results;
  if (remote) {
    const ceiling = REMOTE_DCC_PER_SLICE * chunks.length;
    const shown = String(paymentAddress);
    console.log(
      `Starting remote execution at ${REMOTE_DCC_PER_SLICE} DCC per slice. Ceiling: ${ceiling} DCC.`,
    );
    console.log(`Paying from ${shown.slice(0, 6)}...${shown.slice(-4)}`);
    results = await withTimeout(
      job.exec(REMOTE_DCC_PER_SLICE, paymentAccount),
      REMOTE_EXEC_TIMEOUT_MS,
      () => {
        job.cancel("Timed out waiting for remote workers").catch(() => {});
      },
      "remote workers",
    );
  } else {
    // Registered before localExec(), so this runs before the in-process worker starts.
    // dcp-client gives that worker the null payment address, and the scheduler will not
    // assign slices to 0x000...0. A fresh worker id avoids an id stuck by an interrupted run.
    job.on("accepted", () => {
      const { randomBytes } = require("crypto");
      const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      const bytes = randomBytes(12);
      let suffix = "";
      for (let i = 0; i < bytes.length; i++) {
        suffix += alphabet[bytes[i] % alphabet.length];
      }

      job.localWorker.id = `localExec_${suffix}`;
      job.localWorker.config.paymentAddress = paymentAddress;
      console.log(`Local worker ${job.localWorker.id} is waiting for slices`);

      job.localWorker.on("fetch", (task) => {
        const count = task && task.slices ? Object.keys(task.slices).length : 0;
        console.log(count ? `Received ${count} slice(s)` : "Scheduler has not assigned slices yet");
      });
      job.localWorker.on("error", (error) => {
        console.error("Worker error:", error && error.message ? error.message : error);
      });
    });

    console.log("Starting local execution...");
    results = await withTimeout(
      job.localExec(),
      LOCAL_EXEC_TIMEOUT_MS,
      () => {
        job.cancel("Timed out waiting for localExec").catch(() => {});
      },
      "localExec",
    );
  }

  console.log("Final result:", Array.from(results).join(""));
}

function parseMode(args) {
  if (args.length === 0) {
    return false;
  }
  if (args.length === 1 && args[0] === "remote") {
    return true;
  }
  throw new Error("Usage: node capitalize.js [remote]");
}

async function loadIdentity(identity, wallet) {
  const identityKey = process.env.DCP_IDENTITY_KEY || process.env.DCP_API_KEY;
  if (identityKey) {
    try {
      await identity.set(identityKey);
    } catch (error) {
      if (error && error.message === "malformed keystore") {
        throw new Error(
          "DCP_API_KEY is not a portal key, so no job was deployed and no DCC was spent. Paste the key from the DCP Portal between the quotes. It starts with 0x and has 64 hex characters. Do not leave the example words in the command.",
        );
      }
      throw error;
    }
  } else {
    try {
      await identity.set(await wallet.getId());
    } catch (error) {
      if (!error || error.code !== "ENOENT") {
        throw error;
      }
      await identity.set(await new wallet.IdKeystore(null, ""));
      console.warn(
        "No DCP_IDENTITY_KEY or DCP_API_KEY is set, and ~/.dcp/id.keystore was not found. Using a temporary identity.",
      );
    }
  }

  return identity.get();
}

function withTimeout(promise, ms, onTimeout, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      if (onTimeout) {
        onTimeout();
      }
      reject(new Error(
        `${label} timed out after ${ms}ms. The scheduler did not return every slice.`,
      ));
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  });
