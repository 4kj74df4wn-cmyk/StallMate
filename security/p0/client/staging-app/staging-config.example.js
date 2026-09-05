// StallMate P0 SR1 — STAGING web config (EXAMPLE). Copy to `staging-config.js` (gitignored) and fill
// from Firebase console -> Project settings -> your Web app. STAGING ONLY.
// The app REFUSES to run unless projectId === stallmate-staging-2026-5f39f and databaseURL is a real
// staging RTDB instance. Never put production (stallmate-9caac) values here.
window.__SM_STAGING__ = {
  apiKey: "PASTE_STAGING_WEB_API_KEY",
  authDomain: "stallmate-staging-2026-5f39f.firebaseapp.com",
  projectId: "stallmate-staging-2026-5f39f",
  databaseURL: "https://stallmate-staging-2026-5f39f-default-rtdb.asia-southeast1.firebasedatabase.app"
};
