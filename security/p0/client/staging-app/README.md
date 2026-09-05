# SR1 Staging Client — isolated staging app (repo: security/p0/client/staging-app/)

Isolated staging test app derived from the .14 sale/satang model. **Not** the frozen production app; **frozen .13/.14 are untouched.** Wires R1 client-auth into startup / auth-state / sale write / recovery UI. **Staging project only** (refuses any other projectId; refuses non-staging RTDB URL). **No Hosting deploy** — serve/test locally + emulator. No Blaze. No production. Owner binding is the R2 callable — the app never writes `roomOwners` in staging (an emulator-only dev seed button exists solely under `?emulator=1`).

Files: `index.html` · `stallmate_auth.browser.js` (generated from stallmate_auth.js, `window.StallMateAuth`) · `staging-config.example.js` · this README.

## A) EMULATOR browser smoke (now — no Blaze)
```
# terminal 1: RTDB emulator
JAR=$(ls ~/.cache/firebase/emulators/firebase-database-emulator-*.jar | tail -1)
java -jar "$JAR" --host 127.0.0.1 --port 9000
# terminal 2: Auth emulator
npx -y firebase-tools emulators:start --only auth --project demo-sr1
# terminal 3: serve the app
cd security/p0/client/staging-app && python3 -m http.server 8080
```
Open **http://localhost:8080/index.html?emulator=1** and verify:
1. Config shows `EMULATOR (demo-sr1)`.
2. **Anonymous bootstrap** → Auth = anonymous, `permanent=false`.
3. **Owner sign-in** (any email + `pw123456`; click sign-in creates the emulator user) → Auth = owner.
4. **Sign out** → signed-out; **Re-auth owner** → owner again.
5. Click **Seed owner (emulator only)** → binds roomOwners (dev-only).
6. **Toggle offline** → **Record sale** → result `queued`, Pending=1, amounts unchanged.
7. **Toggle offline** (back online) → **Reconnect & replay (flush)** → sale written, Pending=0.
8. Change **total** to a different value, keep the same **opId**, **Record sale** → `OPID_CONFLICT` (original unchanged).

Expected: matches the automated harness `p0_sr1_staging_client.js` → **SR1 CLIENT 11/11 PASS**.

## B) STAGING browser smoke (later — no Blaze; needs staging Auth enabled)
```
cp staging-config.example.js staging-config.js   # fill from Firebase console (staging web app). gitignored.
cd security/p0/client/staging-app && python3 -m http.server 8080
```
Open **http://localhost:8080/index.html** (no `?emulator`). Verify config shows `STAGING stallmate-staging-2026-5f39f`, then anonymous bootstrap / owner sign-in / sign-out / re-auth. (Owner-authorized sale write requires the R2 callable binding — available only after SR2; not part of SR1.)

## Guardrails
Frozen `.13/.14` untouched · production project refused · `roomOwners` never written by the client in staging · no Hosting deploy · no Blaze.
