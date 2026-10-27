const LOCAL_EXEC_TIMEOUT_MS = 120000;

async function main() {
  const { init } = require("dcp-client");
  await init("https://scheduler.distributed.computer");

  const compute = require("dcp/compute");
  const wallet = require("dcp/wallet");
  const identity = require("dcp/identity");
  const paymentAddress = await loadIdentity(identity, wallet);

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

  job.on("readystatechange", (state) => {
    console.log(`Job state: ${state}`);
  });
  job.on("error", (error) => {
    console.error("Job error:", error && error.message ? error.message : error);
  });

  console.log("Starting local execution...");
  const results = await withTimeout(
    job.localExec(),
    LOCAL_EXEC_TIMEOUT_MS,
    () => {
      job.cancel("Timed out waiting for localExec").catch(() => {});
    },
  );

  console.log("Final result:", Array.from(results).join(""));
}

async function loadIdentity(identity, wallet) {
  const identityKey = process.env.DCP_IDENTITY_KEY || process.env.DCP_API_KEY;
  if (identityKey) {
    try {
      await identity.set(identityKey);
    } catch (error) {
      if (error && error.message === "malformed keystore") {
        throw new Error(
          "DCP_API_KEY is not a portal API key. In the DCP Portal, open Keys, copy the key, and assign that value in this terminal. Do not paste the example placeholder.",
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

  return (await identity.get()).address;
}

function withTimeout(promise, ms, onTimeout) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      if (onTimeout) {
        onTimeout();
      }
      reject(new Error(
        `localExec timed out after ${ms}ms. The scheduler did not return every slice.`,
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
