#!/usr/bin/env bash
# Usage: carry-downloads.sh <release tag> <file name> <count from before this existed> [<old>:<new>]
# Prints how often <file name> of a rolling release has been downloaded over all its builds.
# GitHub resets a file's download count whenever the file is replaced, which every build does. So each
# build writes the running total into its release notes (an HTML comment the website reads), and the
# next build adds the replaced file's own count to it before deleting the old release.
# <old>:<new> replaces a stored total of exactly <old> with <new> (a one-time correction; once a build
# has stored a different total it no longer matches).
set -u
tag="$1"; file="$2"; seed="${3:-0}"; fix="${4:-}"
fix_old="${fix%%:*}"; fix_new="${fix#*:}"
[ -n "$fix" ] || { fix_old=-1; fix_new=-1; }
# `gh release view --json` names the count downloadCount; the REST API calls it download_count
filter='((((.body // "") | capture("muriel-downloads-before: (?<n>[0-9]+)") | .n | tonumber)) // $seed
    | if . == $fix_old then $fix_new else . end)
  + ([.assets[] | select(.name == $file) | (.downloadCount // .download_count // 0)] | add // 0)'
total="$(gh release view "$tag" --json body,assets 2>/dev/null | jq -r --arg file "$file" --argjson seed "$seed" \
  --argjson fix_old "$fix_old" --argjson fix_new "$fix_new" "$filter" 2>/dev/null || true)"
case "$total" in ''|*[!0-9]*) total="$seed" ;; esac
echo "$total"
