# Purrcels: Cat Logic Puzzle

Static HTML, CSS, and JavaScript. No build step or runtime dependencies.

## Preview

Run `python3 -m http.server 8080` from this directory, then open `http://localhost:8080/`.

Run `node --test tests/puzzle.test.cjs` to check the puzzle rules and each board's unique solution.

## Studio dashboard

Sign in to [Purrcels Studio](./dashboard/) with an operator account to inspect ranked attempts, save review notes, export filtered results and compare public competitor figures. Studio reads the game’s existing Node.js and PostgreSQL backend. The public sign-in page contains no game records. Superadmins can investigate individual player accounts, inspect Firebase sign-in and game activity statistics, and manage time-limited or indefinite online bans with an audit log.

The [operator guide](./tools/dashboard/README.md) covers account setup, live data and review handling. Run `node --test tests/*.test.cjs tests/*.test.mjs` for the website and dashboard regression suite.

## GitHub Pages

1. Create or open a repository dedicated to this site.
2. Commit these files at the root of its default branch. Include the hidden `.nojekyll` file.
3. Under **Settings → Pages → Build and deployment**, choose **Deploy from a branch**, the default branch, and **/(root)**.
4. Use the URL displayed by GitHub after the deployment succeeds. Check the home, privacy, and terms pages.

The Privacy Policy and Terms cover the website only. Before using a Privacy Policy in Play Console, publish an app-specific policy that identifies the publisher and privacy contact and accurately describes the Android app, its SDKs, data handling, retention, and deletion. Add store links only after confirming the actual Purrcels listing.

Design direction adapts the linked [Liquid Glass guidance](https://github.com/affaan-m/ECC/blob/main/skills/liquid-glass-design/SKILL.md) to HTML and CSS. The puzzle experience uses Purrcels artwork and boards.
