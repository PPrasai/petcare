#!/bin/sh
# Rejects AI-attribution lines in a commit message file (SPEC 5.7, 6).
if grep -qiE '^co-authored-by:|generated with' "$1"; then
  echo "commit rejected: remove Co-Authored-By and Generated-with lines" >&2
  exit 1
fi
