# How to set up QMIND Distributive testing

This project sends four strings to the Distributive Compute Platform, capitalizes each one, and joins them back into one sentence. The input is `hello `, `world `, `from `, `distributive`. A run has passed when the last line is:

```text
Final result: HELLO WORLD FROM DISTRIBUTIVE
```

Repository: https://github.com/NathanielCheung/QMIND-Distributive-Testing

Test results and credit use are recorded in `TESTING.md`.

## Accounts

Portal: https://portal.dcp.cloud/

The grant on the shared test account was 5,000.000 DCC. Two public jobs have cost 4 DCC each, so the balance is 4,992 DCC.

The portal key is a secret. It starts with `0x` and has 64 hexadecimal characters. Keep it in your own PowerShell window. Do not put it in a file, commit it, or paste it into chat.

Two different keys exist in the portal:

- The job key, from **Keys**, is the value for `DCP_API_KEY`. It pays for jobs.
- The worker registration key, from **Workers**, links an installed worker program to the account. It does not submit jobs, and it is not the value for `DCP_API_KEY`.

## What each person needs

- A Windows 10 or 11 computer
- [Node.js](https://nodejs.org/) 18 or newer
- [Git](https://git-scm.com/)
- PowerShell

A phone can open the portal. It cannot run this test. The **Workers** page only lists programs that were installed and registered. It does not compute slices.

## Install the project

```powershell
git clone https://github.com/NathanielCheung/QMIND-Distributive-Testing.git
cd QMIND-Distributive-Testing
npm install
```

`npm install` downloads `dcp-client`. That folder is not stored in git.

## Set the job key

In the portal, open **Keys**, copy the job key, and paste it between the quotes. The quotes are required. Without them, PowerShell treats a value that starts with `0x` as a number and the key is damaged. The quotes are not part of the key.

```powershell
$env:DCP_API_KEY = "0xpaste-the-key-here"
```

The finished line is one quoted value. It contains no plus sign and no extra words. This assignment lasts only for that PowerShell window.

## Run the free local test

This uses a worker inside the same script. It costs 0 DCC. Clear any key already set in the window so the run uses a temporary identity:

```powershell
Remove-Item Env:DCP_API_KEY -ErrorAction SilentlyContinue
Remove-Item Env:DCP_IDENTITY_KEY -ErrorAction SilentlyContinue
node capitalize.js
```

The script may print `Scheduler has not assigned slices yet` several times. That means it is waiting. The run can take a couple of minutes. It passed when the final line is the uppercase sentence above.

## Run the paid public test

This sends the same four slices to the public network. The price is 1 DCC per slice, so the job costs 4 DCC. Write down the portal balance before you start.

Set the job key in this window, then run:

```powershell
node capitalize.js remote
```

The script prints the ceiling, a shortened payment address, and a job id. Slice results can arrive out of order. The script sorts them before printing the final sentence. Check the portal balance again. The first public run, job `bA4j2urO6fDrzxoikaVJDp`, moved the balance from 5,000.000 DCC to 4,996 DCC.

If the script says the key is not a portal key, the variable contains example words or extra text. No job was deployed and no DCC was spent. Set the variable again with only the key between the quotes.

`node capitalize.js` by itself stays on the free local path. Only `node capitalize.js remote` spends credits.

## Use a second computer

The public test can be completed by any worker on the public network. To see our own machine do the work, use a second Windows laptop. Keep it plugged in and awake.

1. On that laptop, install the Windows worker from https://download.distributive.network/windows/latest/dcp-worker/ and approve the administrator prompt.
2. In the portal, open **Workers**. Use the registration-key link to create a worker registration key.
3. In the worker settings, open **Register** and paste that registration key.
4. Open **Economics** and choose the earnings account for the shared test account.
5. The Compute Groups tab can be left alone. The installer keeps the global group on unless that option is turned off. Save.
6. In the screensaver settings, choose **Preview**. The preview is a grey full-screen page. That is the worker running.
7. On the first computer, run `node capitalize.js remote`.

This sequence produced job `KgVfxFgvHQDWg8t3Q6Z8Ic` and the uppercase sentence. The balance fell from 4,996 DCC to 4,992 DCC, and the 4 DCC did not return. A public worker took the slices. Leaving our worker in the global group does not prove that our laptop did the work. A later test has to put the worker and the job in a private compute group.

Watch the second laptop while the job runs. If it shows slices being computed, that machine did the work. The slice payment goes to the earnings account selected on the worker. If the second laptop stays idle and the first computer still prints the uppercase sentence, a public worker did the job.

The **Your Workers** page stays at 0 until a worker program has been installed and registered. Opening that page on a phone does not start a worker.

## Stop the worker

On the second laptop, press Ctrl+Alt+Delete to leave the grey screensaver. Open the screensaver settings and set the screensaver to **(None)**, then click **Apply** and **OK**.

Open Command Prompt as administrator and run:

```cmd
net stop "DCP Worker"
```

A normal Command Prompt cannot stop the service. Right-click Command Prompt and choose **Run as administrator**. In `services.msc`, set **DCP Worker** to **Manual** if it should stay off after the next boot.

## Rules for the work function

A slice cannot read a file that happens to be on the worker, such as `data.txt`. The sandbox does not include Node `fs` or `require`. Data for a slice has to be included in the job input.

Slices are assigned by the scheduler. Nobody assigns them by hand in the portal.

Paid jobs in this project use a numeric price. `job.exec()` with no price uses market value, and that offer has no ceiling. This script offers 1 DCC per slice.

## Where we are

| Run | Command | Cost | Status |
| --- | --- | --- | --- |
| Local | `node capitalize.js` | 0 DCC | Passed |
| Public network | `node capitalize.js remote` | 4 DCC | Passed, job `bA4j2urO6fDrzxoikaVJDp` |
| Second computer, public group | `node capitalize.js remote` while our worker is running | 4 DCC | Job `KgVfxFgvHQDWg8t3Q6Z8Ic` passed. Payment did not return, so a public worker did it |
| Second computer, private group | Same command, job limited to our group | 4 DCC | Not run yet |
| Input-set data | A small array sent inside the job | 4 DCC | Not run yet |
