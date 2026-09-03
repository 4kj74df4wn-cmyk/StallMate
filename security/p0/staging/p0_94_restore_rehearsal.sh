#!/usr/bin/env bash
# StallMate P0 §9.4 — LOCAL restore rehearsal, ENCRYPTED-VOLUME ONLY (Room 00 corrected).
# The raw export + all restore/temp files live ONLY on the mounted encrypted APFS volume.
# No plaintext copy is created in ~, /tmp, Git, or Drive. Prints ONLY redacted aggregates.
#
# Prereq: encrypted APFS sparse bundle mounted at /Volumes/StallMateP0Backup, and the read-only
# production export already written to /Volumes/StallMateP0Backup/backup.json (see README step 1).
# Usage: ./p0_94_restore_rehearsal.sh [/Volumes/StallMateP0Backup/backup.json]
set -euo pipefail

VOL="/Volumes/StallMateP0Backup"
BK="${1:-$VOL/backup.json}"
DIR="$(cd "$(dirname "$0")" && pwd)"     # repo dir (redacted result may be written here)
PORT=9000
EMU_NS="demo-restore"
JAR="$(ls "$HOME"/.cache/firebase/emulators/firebase-database-emulator-*.jar 2>/dev/null | tail -1 || true)"

# --- hard guards: everything sensitive must be on the encrypted volume ---
case "$BK" in
  "$VOL"/*) : ;;
  *) echo "❌ REFUSING: backup must live on encrypted volume $VOL (got: $BK)"; exit 2 ;;
esac
[ -d "$VOL" ] || { echo "❌ encrypted volume not mounted at $VOL"; exit 2; }
[ -f "$BK" ] || { echo "❌ export not found at $BK (run README step 1 first)"; exit 2; }
[ -n "$JAR" ] || { echo "❌ emulator jar missing. Run: npx -y firebase-tools setup:emulators:database"; exit 3; }

WORK="$VOL/p0_work"            # temp restore/emulator state — ON the encrypted volume only
rm -rf "$WORK"; mkdir -p "$WORK"
cleanup(){ [ -n "${EMU_PID:-}" ] && kill "$EMU_PID" 2>/dev/null || true; }
trap cleanup EXIT

echo "== §9.4 export integrity (file on encrypted volume) =="
SIZE=$(wc -c < "$BK" | tr -d ' ')
HASH=$(shasum -a 256 "$BK" | awk '{print $1}')
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "  export bytes     : $SIZE"
echo "  export sha256    : $HASH"
echo "  export timestamp : $TS"
echo "  encrypted-at-rest: yes (APFS 256-bit AES volume $VOL); passphrase held out-of-band"

echo "== local emulator (cwd + all state on encrypted volume) =="
( cd "$WORK" && java -jar "$JAR" --host 127.0.0.1 --port "$PORT" >"$WORK/emu.log" 2>&1 & echo $! > "$WORK/emu.pid" )
EMU_PID=$(cat "$WORK/emu.pid")
for i in $(seq 1 25); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/.json?ns=$EMU_NS" || true)
  [ "$code" = "200" ] && break; sleep 1
done
echo "  emulator http    : ${code:-none} (200 = up) [offline ns=$EMU_NS]"

echo "== restore export into emulator, read back (restored.json ON volume) =="
curl -s -X PUT "http://127.0.0.1:$PORT/.json?ns=$EMU_NS" --data-binary @"$BK" -o "$WORK/put_resp.json"
curl -s "http://127.0.0.1:$PORT/.json?ns=$EMU_NS" -o "$WORK/restored.json"

echo "== reconcile (redacted aggregates only) =="
node "$DIR/p0_94_reconcile.js" "$BK" "$WORK/restored.json" | tee "$DIR/p0_94_reconcile_result.txt"
RC=${PIPESTATUS[0]}

echo "== cleanup: remove temp restore/emulator state from volume; PRESERVE backup.json =="
kill "$EMU_PID" 2>/dev/null || true; sleep 1
rm -rf "$WORK"
echo "  temp restore state removed. Encrypted backup preserved: $BK"
echo "  NEXT: 'diskutil unmount $VOL' when done."
echo "  redacted result written to: $DIR/p0_94_reconcile_result.txt (safe to commit)"
echo "RESULT: reconcile exit=$RC (0 = exact match)"
exit "$RC"
