# RestrOS — Deploying the prototype to GitHub Pages

The prototype is static HTML/CSS/JS with no build step, so publishing it is a
matter of packaging the repository and handing it to GitHub's CDN.

**Live URL:** `https://anupammo.github.io/restros/`
**Prototype:** `https://anupammo.github.io/restros/prototype/`

---

## What is already in place

| File | Role |
| --- | --- |
| `.github/workflows/pages.yml` | Validates and deploys on every push to `main` |
| `index.html` (repo root) | Forwards the bare URL to `prototype/` |
| `.nojekyll` | Stops Jekyll dropping `_`-prefixed paths (`data/_seed.mjs`) |

No prototype code needed changing: every asset path is relative and `BASE` is
derived from `import.meta.url`, so the app runs correctly from any sub-path.

---

## Step 1 — Push

```bash
cd /c/xampp/htdocs/restros
git add -A
git commit -m "Add RestrOS prototype, docs and GitHub Pages deployment"
git push -u origin main
```

The workflow only exists on GitHub once this push lands. Nothing happens before it.

---

## Step 2 — The first deployment, in detail

### 2.1 The push triggers the workflow automatically

`on: push: branches: [main]` fires the moment the push is received. You do not
start anything by hand.

The run has **two jobs**, and the second waits for the first:

```
build ──────────────────────────────► deploy
 ├─ checkout                           └─ actions/deploy-pages
 ├─ setup-node 22                         (publishes to the CDN,
 ├─ node tools/check.mjs                   prints the live URL)
 ├─ configure-pages (enablement: true)
 └─ upload-pages-artifact (path: .)
```

`build` runs the same validation you run locally — every JS module parses,
every JSON file parses, every stylesheet and script path resolves, every icon
reference exists in the sprite. **If that check fails, `deploy` never runs**, so
a broken prototype cannot reach the public URL.

### 2.2 Watch the run

1. Open `https://github.com/anupammo/restros`
2. Click the **Actions** tab (top row, between *Pull requests* and *Projects*)
3. In the left sidebar under *Workflows*, click **Deploy to GitHub Pages**
4. Click the newest run — it is titled with your commit message
5. You will see the two jobs. Click either to expand its live logs

A yellow dot means running, a green tick means done, a red cross means failed.
The whole thing takes roughly **40–90 seconds**.

### 2.3 Read the URL off the deploy job

When `deploy` goes green, its summary shows a box labelled **github-pages** with
the site URL beneath it. That is the `environment.url` declared in the workflow.

Click it, or go straight to `https://anupammo.github.io/restros/`.

### 2.4 Confirm Pages is switched on

`actions/configure-pages` runs with `enablement: true`, which turns Pages on
through the API if it has never been enabled — so this normally needs no action.

To verify: **Settings → Pages**. You should see:

- A green banner: *"Your site is live at https://anupammo.github.io/restros/"*
- Under **Build and deployment**, **Source** reading **GitHub Actions**

---

## Step 3 — If the run failed

### 3.1 `configure-pages` failed — Pages was not enabled

The usual cause is an account or organisation policy blocking API enablement.
Set it once by hand:

1. **Settings** (repo tab, far right — not your account settings)
2. **Pages** in the left sidebar, under *Code and automation*
3. **Build and deployment → Source** dropdown
4. Change **Deploy from a branch** → **GitHub Actions**
5. The page saves immediately; there is no Save button

Then re-run: **Actions → Deploy to GitHub Pages →** the failed run **→
Re-run all jobs** (top right).

### 3.2 `Resource not accessible by integration`

The workflow token lacks permission. Check **Settings → Actions → General →
Workflow permissions** and confirm it is **Read and write permissions**. The
workflow already declares what it needs:

```yaml
permissions:
  contents: read
  pages: write
  id-token: write
```

but an organisation-level policy can cap it below that.

### 3.3 `Get Pages site failed` / 404 from the API

Pages has never been enabled and enablement is blocked. Same fix as §3.1.

### 3.4 The build job failed at "Validate prototype"

A genuine problem in the prototype, not in the deployment. Reproduce it locally:

```bash
node --experimental-vm-modules tools/check.mjs
```

Fix, commit, push — the workflow re-runs on its own.

### 3.5 Pages is unavailable on the plan

GitHub Pages on a **private** repository requires a paid plan. If
`anupammo/restros` is private and the account is on Free, either make the
repository public (**Settings → General →** bottom, *Danger Zone* →
*Change repository visibility*) or upgrade.

---

## Step 4 — Verify the deployed site actually works

A green deploy only proves the files were uploaded. Check that the app runs:

| Check | Where | Proves |
| --- | --- | --- |
| The landing page renders with its mesh-gradient hero | `/restros/` | The root redirect and CSS load |
| Icons appear in the nav and cards | anywhere | `sprite.svg` resolves via `<use>` |
| **Dashboard charts and KPI numbers render** | `/restros/prototype/app/dashboard.html` | `fetch()` of `data/*.json` works — the most likely thing to break under a sub-path |
| POS grid fills with menu items | `…/app/pos.html` | `menu.json` loads and parses |
| Theme toggle switches light/dark | topbar, any page | `localStorage` and the token layer work |
| Guest menu loads on a phone | `…/guest/menu.html` | Responsive layout and the public surface |

If the dashboard shows the red *"Could not load … .json"* banner, the data files
did not publish — almost always Jekyll stripping something, which `.nojekyll`
prevents.

**First-visit note:** a fresh Pages site can return 404 for up to a minute while
the CDN warms up. If you hit that 404, wait, then hard-refresh
(<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>) — browsers cache 404s
aggressively.

---

## Step 5 — Subsequent deployments

Every push to `main` redeploys. Nothing else to do.

To redeploy without a code change (for example after flipping the Pages source):
**Actions → Deploy to GitHub Pages → Run workflow → Run workflow**. That button
exists because of `workflow_dispatch:` in the trigger list.

The `concurrency` block queues deploys rather than cancelling them, so a green
build always reaches the site even if you push twice in quick succession.

---

## Appendix — the alternative: deploy from a branch

Not recommended here, but worth knowing why.

**Settings → Pages → Source → Deploy from a branch**, choosing `main` and
`/ (root)`, publishes without Actions. The trade-offs:

- **Jekyll runs.** It ignores every path beginning with `_`, which would 404
  `prototype/data/_seed.mjs`. This is exactly what the committed `.nojekyll`
  file prevents — keep it if you use this route.
- **No validation gate.** A broken prototype publishes immediately, because
  `tools/check.mjs` never runs.
- **No deploy history** in the Actions tab.

The Actions route was chosen for the validation gate above all.
