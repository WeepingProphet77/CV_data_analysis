#!/usr/bin/env bash
#
# Publish dist/ to the gh-pages branch.
#
# This is the fallback deploy path, used while the local gh token lacks the
# `workflow` scope needed to push .github/workflows/deploy.yml. Once that
# workflow is in the repo, pushing to main deploys automatically and this
# script is no longer needed.
#
#   npm run deploy
#
set -euo pipefail

REMOTE=$(git config --get remote.origin.url)
SRC_COMMIT=$(git rev-parse --short HEAD)
WORKTREE=$(mktemp -d)
trap 'rm -rf "$WORKTREE"' EXIT

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is dirty. Commit or stash before deploying." >&2
  exit 1
fi

npm test
npm run build
touch dist/.nojekyll   # keep Pages' Jekyll pass from dropping assets/

cp -R dist/. "$WORKTREE"/
cd "$WORKTREE"
git init -q -b gh-pages
git add -A
git commit -q -m "Deploy from main ${SRC_COMMIT}

Build output only -- edit source on main, never here."
git push -q --force "$REMOTE" gh-pages

echo "Deployed ${SRC_COMMIT} -> gh-pages"
