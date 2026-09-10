/**
 * StallMate P0 — STAGING SYNTHETIC SWEEP (admin; staging only; removes leftover test data).
 * Removes synthetic rooms/roomOwners (SR3_*, SMOKEPD_*, SR1_*), all ownerBindClaimsUsed,
 * synthetic ownerBindAudit, and Auth test users (sr3_/sr1_/smoke_/bs_ emails). Staging-guarded.
 * Env: GOOGLE_APPLICATION_CREDENTIALS (staging SA), STAGING_DATABASE_URL, STAGING_PROJECT_ID.
 */
'use strict';
const admin = require('firebase-admin');
const STAGING = 'stallmate-staging-2026-5f39f';
const dbURL = process.env.STAGING_DATABASE_URL;
const proj = process.env.STAGING_PROJECT_ID;
if (proj !== STAGING) { console.error('REFUSING: not staging'); process.exit(2); }
if (!dbURL || dbURL.indexOf(STAGING) === -1) { console.error('REFUSING: db url not staging'); process.exit(2); }
const app = admin.initializeApp({ databaseURL: dbURL, projectId: proj }, 'sweep');
if (admin.app('sweep').options.projectId !== STAGING) { console.error('REFUSING: admin not staging'); process.exit(2); }
const db = admin.database(app);
const isSynthetic = (k) => /^(SR3_|SMOKEPD_|SR1_|SR1_TEST_)/.test(k);

(async () => {
  let removed = { rooms: 0, roomOwners: 0, nonces: 0, audit: 0, users: 0 };
  const rooms = (await db.ref('rooms').once('value')).val() || {};
  for (const k of Object.keys(rooms)) { if (isSynthetic(k)) { await db.ref('rooms/' + k).remove(); removed.rooms++; } }
  const ro = (await db.ref('roomOwners').once('value')).val() || {};
  for (const k of Object.keys(ro)) { if (isSynthetic(k)) { await db.ref('roomOwners/' + k).remove(); removed.roomOwners++; } }
  // all synthetic claim nonces (staging test only) + audit for synthetic rooms
  const nonces = (await db.ref('ownerBindClaimsUsed').once('value')).val() || {};
  for (const k of Object.keys(nonces)) { await db.ref('ownerBindClaimsUsed/' + k).remove(); removed.nonces++; }
  const aud = (await db.ref('ownerBindAudit').once('value')).val() || {};
  for (const k of Object.keys(aud)) { const rc = aud[k] && aud[k].roomCode; if (!rc || isSynthetic(rc)) { await db.ref('ownerBindAudit/' + k).remove(); removed.audit++; } }
  // Auth test users by synthetic email prefix
  let pageToken;
  do {
    const res = await admin.auth(app).listUsers(1000, pageToken);
    for (const u of res.users) { if (u.email && /^(sr3_|sr1_|smoke_|bs_)/.test(u.email)) { try { await admin.auth(app).deleteUser(u.uid); removed.users++; } catch (e) {} } }
    pageToken = res.pageToken;
  } while (pageToken);
  console.log('SWEEP DONE (staging only):', JSON.stringify(removed));
  process.exit(0);
})().catch(e => { console.error('SWEEP ERROR', e && e.message || e); process.exit(1); });
