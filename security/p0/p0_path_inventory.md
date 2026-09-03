# P0 Phase 2A — Source-derived Firebase path inventory (HOLD-3/HOLD-4, Room 00 C4)

> **HOLD-4 update:** record-level `.write` cascades to descendants, so field-integrity is enforced by schema-aware `.validate` at each record boundary (see `p0_rulesA/B` `.validate`). Sale record protected fields (no-drop, accepts modern+legacy): `total,totalSatang,price,priceSatang,cashAmount,cashSatang,scanAmount,scanSatang,thaiAmount,thaiSatang,creditAmount,creditSatang,orderId,id,time` + must retain `total`|`totalSatang`. Session no-drop `id,roundId,startedAt,open`; checkin `deviceId,at`; staff `active,secondaryPasswordHash,name,id`; branch `meta,menu,trial,markets,sellers`. Proven by `p0_emulator_results.txt` (183/183).


**Method:** static scan of the real files (`stallmate_v7.9.8.14.html`, `owner_daily.html`, `stallmate_admin.html`) for `.ref(...)`, `.child(...)`, `.set/.update/.remove/.transaction/.push`, including dynamic template concatenation. Every production operation is mapped to an exact Rules A/B predicate. Unknown room children default DENY (no rule → root `.write:false`).

**Important finding:** the 45 `.remove()` occurrences in `.14` are mostly DOM calls (`classList.remove`, element `.remove()`). The **actual Firebase deletes** are only: `rooms/$c/salesRecords/$key`, `rooms/$c/branches/$id`, `rooms/$c/branches/$id/trial`, `rooms/$c/staff/$id`, `rooms/$c/sales` (legacy), `trialRegistry/$deviceId`.

## rooms/$roomCode subtree (owner-only; read at room level, writes at record leaves)

| Path | App op (file) | Rules A predicate | Delete? |
|---|---|---|---|
| `rooms/$c` | read whole room (`.14`,`owner_daily`) | `.read` owner; **no `.write`** | whole-room write/delete DENY |
| `rooms/$c/salesRecords/$saleId` | push/set/update sale (`.14`) | owner && `newData.exists()` | **hard-delete DENY** |
| `rooms/$c/salesRecords/$key` `.remove()` | "delete sale" flow (`.14`) | — | **DENY → must become soft-delete (move to deletedSales)** ⚠️R1 |
| `rooms/$c/deletedSales/$key` | push void ledger (`.14`,`owner_daily`) | owner && newData.exists() && `!data.exists()` (append-only) | mutate/delete DENY |
| `rooms/$c/sales` (legacy) | legacy read + one-time remove (`.14`) | client DENY (backend/admin migration only) | DENY |
| `rooms/$c/sessions/$sessionId` | set/update session (`.14`,`owner_daily`) | owner && newData.exists() | delete DENY |
| `rooms/$c/checkins/$day/$id` | set check-in (`.14`,`owner_daily`) | owner && newData.exists() | delete DENY |
| `rooms/$c/config/$key` (e.g. maxBranches) | set (`.14`) | owner && newData.exists() | child delete DENY |
| `rooms/$c/staff/$staffId` (+/active,/secondaryPasswordHash) | set/update (`.14`) | owner && newData.exists() (descendant updates cascade-allowed) | **record delete DENY → deactivate via `active=false`** ⚠️R1 |
| `rooms/$c/staff/$id` `.remove()` | "delete staff" flow (`.14`) | — | **DENY → soft-deactivate** ⚠️R1 |
| `rooms/$c/branches/$branchId` (+/markets,/meta/active,/sellers,/trial,/config; menu/menuTs via `fbMenuRootPath` update) | update menu/stock, branch mgmt (`.14`) | owner && newData.exists() (descendant updates cascade-allowed) | **record delete DENY → deactivate via meta/active=false** ⚠️R1 |
| `rooms/$c/branches/$id` / `/trial` `.remove()` | branch/trial removal (`.14`) | — | **DENY → soft-deactivate** ⚠️R1 |

Menu/stock are written by **replacing** the `menu` array via `.update({menu,menuTs})` at the branch node — that is create/update (newData exists), so it is **ALLOW** and not a delete. Confirmed by emulator test "update branch menu = ALLOW" (Rules A).

## Non-rooms paths

| Path | App op | Rules A predicate |
|---|---|---|
| `trialRegistry/$deviceId` | set trial; (remove already denied on live) | read `boundUid===auth.uid`; **write (HOLD-5): create only if unclaimed & bound to self; update only by current boundUid owner; no boundUid reassignment; no delete** |
| `licenses` / `licenses/$code` | read + `transaction` redeem (`.14`,`admin`) | parent read DENY; `$code` read only if `boundTo===auth.uid`; **all client write DENY → redeem via Cloud Function (R4)** |
| `shopProfiles/$ownerId` (+/firstSeenAt,/customTags) | set/update (`.14`,`admin`) | `auth.uid===$ownerId`, newData.exists() |
| `config/latestVersion`,`config/teamPricingEra` | read (all) / set (admin) | read auth!=null; **write backend/admin-only DENY for client** |
| `affiliates`/`affiliates/$id` | read/push/update (`.14`,`admin`) | parent read DENY; per-id read own; create-only if ownerId===auth.uid |
| `referrals`/`referrals/$id` | read/push (`.14`,`admin`) | parent read DENY; per-id read own; create-only if refereeId===auth.uid |
| `affiliateConfig/*` | read / admin set | read auth!=null; write DENY (admin) |
| `dailyLoads/$date/$ownerId` | set/transaction (`.14`,`admin`) | own-owner read/write, newData.exists() |
| `pilotOverrides/$roomCode` | read (`.14`) / admin set | read owner; write DENY (admin) |

## ⚠️ Required R1 app-code changes (transitional rules will block current hard-deletes)
The transitional rules deny **all** client hard-deletes in `rooms/*`. Before R3, the client must convert these existing flows to soft-delete/deactivate (the primitives already exist in the code):
1. **Delete-sale** → move record to `deletedSales` (append) instead of `salesRecords/$key .remove()`.
2. **Delete-branch** → set `branches/$id/meta/active=false` instead of `.remove()`.
3. **Delete-staff** → set `staff/$id/active=false` instead of `.remove()`.
4. **Legacy `sales` cleanup** → one-time backend/admin migration, not a client op.
5. **trialRegistry remove** already fails on live rules; client should stop attempting it.

These are captured as R1 client tasks; they are **not** performed in Phase 2A (design/staging only).

## Positive SOLO-flow coverage (proven ALLOW under Rules A, emulator)
create/update sale · append deletedSales · update session · write checkin · update config child · soft-deactivate staff · update branch menu · soft-deactivate branch · read own license · read own trial · write own shopProfile. All other/unknown room children default DENY.
