# Purrcels Studio

Open [Purrcels Studio](https://purrcels.devinnovations.co.in/dashboard/) and sign in with the operator username and password issued by the game administrator. The sign-in page checks the game API before enabling the form. If the connection fails, use **Retry connection**. Players continue to use their existing Android sign-in.

## Read and handle results

- **Overview** shows ranked starts, verified completions, completion rate and median server time. Use the date selector for the reporting period. Counts group attempts by UTC start date. Comparisons use the same elapsed time in the previous period.
- **Game results** lets you filter by game mode, outcome, Daily Bento difficulty and puzzle or attempt key. Open an attempt to inspect its timing, stars and mistakes. Select **Flag for review** to save a note.
- **Review queue** lists flagged results within the loaded reporting window. Open a result to read the operator and update time, then resolve or reopen it. Each edit adds a revision in PostgreSQL. If someone saves an edit first, reopen the attempt to see their latest note. Reviews preserve the verified score.
- **Export CSV** downloads the filtered results and their review notes to the operator’s device.
- **Data sources** shows the signed-in username, reporting window and live counts of profiles, synced puzzle records and ranked personal bests. Choose **Refresh** for an immediate update. The visible workspace otherwise refreshes about once a minute while you are outside an editor.
- **Competitors** links each manually checked download band and comparator feature to its public source and shows the observation date. These store figures have a different scope from Purrcels’ ranked-play counts.

The API reads up to 56 UTC days. For a busy period it returns the most recent complete dates that fit the 50,000-attempt limit. If the current day alone exceeds capacity, the dashboard shows the error. A successful query with zero matching attempts shows an empty view. Pseudonymous keys identify attempts. Player IDs, boards, proofs, wallet transactions and purchase receipts remain on the server.

## Access and storage

An eight-hour session uses a host-only HTTP-only cookie on the game API. Sign out when finished. Password rotation and account disablement revoke sessions. Review notes and account changes apply across devices through the game database. The previous website’s browser annotations and local review files stay on their original device and do not appear in the shared queue.

The website serves static HTML and JavaScript. No credentials or results are bundled in it. The game repository contains the [deployment and account guide](https://github.com/sharan036/Purrcels-Cat-Logic-Puzzle/blob/main/backend/STUDIO.md). The SQL file beside this guide remains available to administrators for a standalone read-only export.

Run website checks from the checkout with `node --test tests/*.test.cjs tests/*.test.mjs`. The game backend repository tests the HTTP and PostgreSQL integration on a disposable database.

## Superadmin workspace

After the game administrator grants the superadmin role, sign in again with the existing Studio password. **Players** includes a searchable game directory and a paginated Firebase account directory. Open a player to view their profile, sign-in and token-refresh times, progress, results, wallet ledger, shop purchases, ad rewards, latest integrity check and moderation history. **View player** in a ranked result opens the same record. The dashboard reads each history 25 records at a time. Missing Firebase data is labelled separately.

The overview includes player metrics. **Players** adds unique ranked players for 24 hours, 7 days and 28 days, a 14-day UTC trend, new profiles, premium ownership and active purchase holders. A ranked player has started a ranked attempt in the specified period.

Choose **Ban player** on the player record to suspend online access for 24 hours, 7 days, 30 days or until reinstated. Give a reason and confirm. **Moderation** shows the operator, reason, decision time and expiry. Reinstatement also requires a reason and retains the original scores and audit history. The game API enforces active bans and filters public ranked and historical scoreboards. The [game server guide](https://github.com/sharan036/Purrcels-Cat-Logic-Puzzle/blob/main/backend/STUDIO.md) includes role activation and demotion.
