# StallMate — Code System of Record (Claude Code)
Single-file vendor POS (vanilla JS + Firebase RTDB), GitHub Pages (main/index.html).

## Immutable snapshots — NEVER modify (verify.sh guards by SHA)
- baseline/v7.9.8.13_523df939.html  (.13 LIVE snapshot) 523df939fae65166c30fce6394f12a7b780927cdcee4a3e02836a3388a9cb58e
- baseline/v7.9.8.14_M2_d806e672.html (M2 baseline)      d806e672b4409bbefb4f0b57980580720e291f69c268c8b74d08834a7f227a11

## Files that DO change
- stallmate_v7.9.8.14.html = active development candidate (M3 edits this)
- index.html = PRODUCTION; changes ONLY at a Room 00-approved Release Gate (update RELEASE_INDEX_SHA in verify.sh at that gate)

## Guards (one command: ./verify.sh <candidate>)
C5 syntax → C3 snapshot+index → C1 harness EXACT 209/209 + 95/95 + exit 0 → C2 protected-scope (A3 bill-count + A4-6 backup/restore/clear must not change during M3)

## Workflow (Room 00-approved)
DEV HQ = single implement + independent-review owner. Room 00 = independent final gate. One active work order / one candidate / one delivery channel. M3 on branch m3/a1-credit-ledger. No deploy/merge to main without Room 00 authorization. No real shop data.

## Current: M3 — A1 Credit Ledger
credit sale↔collection separate events; partial collection; sale-date↔collection-date separate; dup collection prevented; pending-op recovery tested; cancel=reversal/void (never hard delete); original revenue unchanged; regressions M2 209/209 + M0+M1 95/95 still pass.
