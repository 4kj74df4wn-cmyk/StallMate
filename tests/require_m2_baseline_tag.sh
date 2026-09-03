#!/usr/bin/env bash
git rev-parse -q --verify refs/tags/m2-baseline >/dev/null 2>&1 || { echo "FAIL: m2-baseline tag missing (create after MIGRATION PASS)"; exit 1; }
echo "m2-baseline tag present"
