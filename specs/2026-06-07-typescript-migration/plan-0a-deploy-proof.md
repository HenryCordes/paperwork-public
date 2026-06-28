# Increment 0a — Heroku Deploy Proof (tsx in production) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that running the (still 100% JavaScript) app under `tsx` in production mode works end-to-end, so the production runtime is validated before any TypeScript conversion begins.

**Architecture:** Swap the production entry command from `node server.js` to `tsx server.js` and move `tsx` into `dependencies` (so Heroku's post-build devDependency prune keeps it). The entry point stays in place, so `__dirname`-relative paths (`robots.txt`, `client/build`) are unchanged. Prove it locally in production mode, including a devDependency prune that reproduces Heroku's build.

**Tech Stack:** Node 20, Express, `tsx` (esbuild-based TS/JS runner), Bull/Redis, Mongoose/MongoDB.

**Spec:** [design.md](design.md) (Increment 0a)

**Branch:** `chore/typescript-migration` (already checked out)

---

## Context for the implementer

- This increment converts **no source files**. It only changes how the app is
  launched. Do not rename anything to `.ts`.
- `server.js` imports Bull queue processors at boot
  (`require("./services/queues/...")`), which connect to Redis. So the boot
  proof needs **Redis and MongoDB running locally**.
- `config/config.env` already exists locally (gitignored) and `dotenv` loads it
  regardless of `NODE_ENV`, so local env vars are available.
- `client/build` already exists; the server serves it via
  `express.static(path.join(__dirname, "client", "build"))`.
- Default port is `process.env.PORT || 5001`.
- Only `tsx` goes into `dependencies` here. `typescript` (the compiler, needed
  only for `tsc --noEmit` typechecking) is added later in Increment 0b as a
  devDependency — it is not needed at runtime by `tsx`.

---

## Task 1: Add tsx and switch the launch command to it

**Files:**
- Modify: `package.json` (dependencies + `start` script)
- Modify: `Procfile`

- [ ] **Step 1: Install tsx as a runtime dependency**

Run: `npm install tsx@^4 --save`
Expected: `tsx` appears under `"dependencies"` (NOT `devDependencies`) in
`package.json`, and `package-lock.json` updates.

- [ ] **Step 2: Verify tsx landed in dependencies**

Run: `node -e "console.log(require('./package.json').dependencies.tsx)"`
Expected: prints a version string like `^4.x.x` (not `undefined`).

- [ ] **Step 3: Point the `start` script at tsx**

In `package.json` scripts, change:
```json
"start": "node server.js",
```
to:
```json
"start": "tsx server.js",
```

- [ ] **Step 4: Point the Procfile at tsx**

Replace the entire contents of `Procfile` with:
```
web: tsx server.js
```

- [ ] **Step 5: Smoke-check tsx can launch the app (dev mode, quick)**

Ensure MongoDB and Redis are running first:
`brew services start mongodb-community@8.0 && brew services start redis`

Then run (boots, then we kill it after the listen log):
```bash
PORT=5001 npx tsx server.js & APP_PID=$!; sleep 8; \
curl -s -o /dev/null -w "GET / -> %{http_code}\n" http://localhost:5001/; \
kill $APP_PID 2>/dev/null
```
Expected: a startup log line `Server running in ... mode on port "5001"` and
`GET / -> 200`.

---

## Task 2: Prove it in production mode

**Files:** none (verification only)

- [ ] **Step 1: Build the client (production artifact the server serves)**

Run: `npm run build --prefix client`
Expected: completes with `client/build/index.html` present
(`test -f client/build/index.html && echo OK` prints `OK`).

- [ ] **Step 2: Boot in production mode under tsx and exercise it**

Run:
```bash
NODE_ENV=production PORT=5001 npx tsx server.js & APP_PID=$!; sleep 8; \
echo "--- / ---";        curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5001/; \
echo "--- /robots.txt ---"; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5001/robots.txt; \
echo "--- /api/subscriptions ---"; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5001/api/subscriptions; \
kill $APP_PID 2>/dev/null
```
Expected:
- Startup log says `Server running in "production" mode on port "5001"`.
- `/` -> `200` (serves `client/build/index.html`).
- `/robots.txt` -> `200` (proves the `__dirname`-relative path resolves).
- `/api/subscriptions` -> `200` (an `optionalAuth` route; proves the API +
  DB/queue wiring booted without crashing).

If any of these fail, STOP and report — the deploy strategy needs attention
before proceeding. Do not convert any files.

---

## Task 3: Reproduce Heroku's devDependency prune

**Files:** none (verification only; node_modules is restored at the end)

- [ ] **Step 1: Prune devDependencies (mimics Heroku post-build prune)**

Run: `npm prune --omit=dev`
Expected: completes; devDependencies (e.g. `jest`, `nodemon`) are removed from
`node_modules`, but `tsx` remains because it is a regular dependency.

- [ ] **Step 2: Confirm tsx survived the prune**

Run: `test -d node_modules/tsx && echo "tsx present after prune" || echo "tsx MISSING"`
Expected: `tsx present after prune`.

- [ ] **Step 3: Boot in production mode again, post-prune**

Run:
```bash
NODE_ENV=production PORT=5001 node_modules/.bin/tsx server.js & APP_PID=$!; sleep 8; \
curl -s -o /dev/null -w "GET / post-prune -> %{http_code}\n" http://localhost:5001/; \
kill $APP_PID 2>/dev/null
```
Expected: startup log + `GET / post-prune -> 200`. This is the faithful
production reproduction: only runtime dependencies present, app boots under tsx.

- [ ] **Step 4: Restore the full dependency tree for continued development**

Run: `npm install`
Expected: devDependencies reinstalled (`test -d node_modules/jest && echo OK`
prints `OK`).

- [ ] **Step 5: Confirm the test suite still passes after restore**

Run: `npm test`
Expected: `Tests: 18 passed, 18 total` (unchanged — no source was modified).

---

## Task 4: Commit the deploy-proof change

**Files:** `package.json`, `package-lock.json`, `Procfile`

- [ ] **Step 1: Stage and commit**

```bash
git add package.json package-lock.json Procfile
git commit -m "build: run the app under tsx in production

Move tsx into dependencies and launch via 'tsx server.js' (Procfile +
start script). The entry point stays in place so __dirname-relative
paths (robots.txt, client/build) are unchanged. Proven locally in
production mode, including a devDependency prune that reproduces
Heroku's build. No source files converted yet."
```

- [ ] **Step 2: Confirm the working tree is clean and on the right branch**

Run: `git status -sb`
Expected: `## chol... chore/typescript-migration` with a clean tree (nothing
staged/modified remaining).

---

## Self-Review (completed by plan author)

- **Spec coverage:** Implements Increment 0a exactly — tsx in `dependencies`
  (Task 1.1), Procfile/start -> tsx (Task 1.3-1.4), local prod-mode boot with
  client serve + robots + request (Task 2), devDep-prune reproduction (Task 3),
  no source conversion. Matches design.md "Increment 0a" and "Deploy delta".
- **Placeholder scan:** No TBD/TODO; every step has exact commands and expected
  output.
- **Consistency:** Port 5001, `tsx server.js`, and the route checks
  (`/`, `/robots.txt`, `/api/subscriptions`) match what `server.js` actually
  defines (verified: `app.listen(process.env.PORT || 5001)`,
  `app.use(robots(__dirname + "/robots.txt"))`, `app.get("/api/subscriptions", ...)`).

## Notes for the implementer

- Requires local MongoDB + Redis running (Task 1.5 starts them). If `brew
  services` is unavailable, start them however the machine provides them.
- `typescript` is intentionally NOT added here (tsx doesn't need it at runtime);
  it arrives as a devDependency in Increment 0b.
- This increment is fully reversible: reverting `Procfile` and `package.json`
  restores `node server.js`.
