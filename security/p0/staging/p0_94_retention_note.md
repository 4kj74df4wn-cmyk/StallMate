# §9.4 backup retention (no key)
- Encrypted backup file: `~/LocalBackups/StallMateP0Backup.sparsebundle` — APFS 256-bit AES sparse bundle on **local-only storage** (home dir; NOT iCloud/Desktop/Documents sync, NOT any cloud drive, NOT Git).
- Raw `backup.json` lives ONLY inside this encrypted bundle when mounted at `/Volumes/StallMateP0Backup`; the bundle is currently unmounted.
- Passphrase: held out-of-band by owner; NOT stored in repo/Drive/chat.
- export sha256: 0f3a94b7dc71e0a5fa5fbd7c501a3759a44762db77aa4516b3e19b5ecb784649
- export bytes: 1104991 ; timestamp: 2026-09-03T14:15:50Z
- Plaintext export + emulator restore state existed ONLY on the mounted encrypted volume; temp removed; volume force-unmounted.
- **Location correction:** the bundle was initially created under `~/Documents` (which is iCloud-synced). It was **moved to `~/LocalBackups` (local-only)** and a duplicate copy (`StallMateP0Backup .sparsebundle`) was deleted, so the encrypted backup no longer resides on any cloud drive. The raw plaintext never left the mounted encrypted volume at any point.
