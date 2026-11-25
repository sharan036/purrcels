# Purrcels Studio operator dashboard

Open `/dashboard/` on the website for the sample workspace, local JSON imports and competitor research. The page runs without a build, remote fonts, analytics SDKs or runtime dependencies. It can also connect to the Android game's ranked-attempt data through the local operator service.

## Read current ranked results

Requirements are Node.js 22 or later, the PostgreSQL client (`psql` on PATH), an authorized connection to the existing `purrcels` database, and the game's ranked-attempts migration 004. PostgreSQL 16 is the production schema reference. Use an account with SELECT access to `public.ranked_puzzle_attempts`. Client configuration uses libpq's PGHOST, PGPORT, PGUSER, PGDATABASE, PGSERVICE and password-file conventions. Credentials stay outside the website and repository.

From the website checkout on the machine with database access, run:

```sh
PGDATABASE=purrcels node tools/dashboard/serve.mjs
```

Open `http://127.0.0.1:8787/dashboard/` on that machine. For a remote host, forward the port through your existing SSH login, replacing `your-ssh-host` with its configured alias:

```sh
ssh -N -L 8787:127.0.0.1:8787 your-ssh-host
```

The listener binds to IPv4 loopback. Operators with access to that listener share review notes. Keep it behind the local connection or SSH tunnel. The static public site has no route to the operator service. An unsuccessful live load displays the connection error. Select **Data sources → Load current data** to refresh. The query cache lasts 15 seconds.

## Export a snapshot for the static dashboard

Run from the website checkout. Keep the JSON file outside the directory served by GitHub Pages.

```sh
umask 077
psql -XqAt -d purrcels -f tools/dashboard/snapshot.sql > "$HOME/purrcels-ranked.json"
```

On the dashboard, choose **Data sources → Choose JSON file**. The selected file stays in memory for the tab. Closing or reloading the hosted page returns it to sample data. Local review notes return when the same attempt keys are loaded again in the same browser. Export CSV from Game results or Review queue to keep a copy of the currently filtered results and notes.

The default snapshot covers 56 UTC calendar dates including today. Both the manual export and operator service use the same read-only, time-limited query. It returns a capacity error when more than 50,000 starts match. Use a shorter window with `psql -v days=7` or `DASHBOARD_DAYS=7` (1–56). Windows with incomplete historical coverage are labelled. The export contains puzzle IDs, hashed attempt keys, times, mode, grid size, daily difficulty, mistakes and stars. Player identities, boards, proofs and purchases stay in the game database.

## Result handling

The summary counts starts in the selected period. Each completed attempt counts once. Completion rate includes open and expired starts in its denominator. The median uses server-calculated durations from verified starts. Neko Tower is identified from the `tower_` prefix on campaign rows. Daily difficulty comes from the ranked attempt itself. Earlier comparisons use the same UTC cutoff in the prior period. These counts cover ranked attempts. Best-score projections, historical scores and offline progress have different meanings.

Flag an attempt to add a note, resolve it after investigation and reopen it if follow-up is needed. Reviews cover the entire loaded snapshot. The operator service writes immutable note revisions under `$XDG_STATE_HOME/purrcels-studio/reviews` (default `~/.local/state/purrcels-studio/reviews`). Simultaneous edits of the same revision produce a conflict. Use the same state directory across restarts. Set `DASHBOARD_STATE_DIR` to choose another private directory outside the website checkout, and `DASHBOARD_PORT` to select another loopback port. Browser imports and samples have separate local annotation storage. All review actions preserve scores and rankings.

## Sources and checks

The Competitors page links every observed download band to its Play listing and dates the manual check. Published results features for LinkedIn Queens and NYT Connections and the GameAnalytics progression dashboard are linked separately. Update the dated figures and links together when refreshing the research.

```sh
node --test tests/*.test.cjs tests/*.test.mjs
```

The tests cover the existing web puzzle, dashboard metrics, source separation, review persistence and concurrent edits. They use temporary data and ephemeral loopback ports. The game schema is maintained in the [Android repository](https://github.com/sharan036/Purrcels-Cat-Logic-Puzzle/blob/main/backend/migrations/004_ranked_attempts.sql).
