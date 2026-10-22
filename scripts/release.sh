#!/usr/bin/env bash
#
# Build Gawain for the web and deploy it to Cloudflare Pages.
#
#   ./scripts/release.sh               # build + deploy to gawain-ccn.pages.dev
#   ./scripts/release.sh --no-deploy   # build only
#   ./scripts/release.sh --clean       # clear the bundler cache first
#   ./scripts/release.sh --apk         # Android: tag + push; GitHub builds the APK into Releases
#   ./scripts/release.sh --apk=v1.2.0  # same, with an explicit version (default: app.json)
#
# After a successful deploy the built dist/ folder is deleted (it's on Cloudflare
# now); the bundler cache is kept so the next build is fast. --no-deploy keeps dist/.
#
# Same Cloudflare account and flow as health-platform-fe/scripts/release.sh.
# Always a production deploy, whatever git branch you are on.

set -euo pipefail

PROJECT=gawain
WRANGLER=(npx --yes wrangler@4)
# Stops wrangler from pausing on a hidden metrics prompt.
export WRANGLER_SEND_METRICS=false

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY=true
CLEAN=false
APK=false
APK_TAG=

for arg in "$@"; do
  case "$arg" in
    --no-deploy) DEPLOY=false ;;
    --clean)     CLEAN=true ;;
    --apk)       APK=true ;;
    --apk=*)     APK=true; APK_TAG="${arg#--apk=}" ;;
    -h|--help)   sed -n '3,14p' "$0"; exit 0 ;;
    *) echo "release.sh: unknown option '$arg'" >&2; exit 2 ;;
  esac
done

# --apk: tag this commit and push the tag. GitHub Actions
# (.github/workflows/android-release.yml) builds the APK from that tag and attaches it to
# the repository's Releases page, so nothing is built here and it costs nothing.
release_apk() {
  local tag="$1"
  cd "$ROOT"
  [[ -n "$tag" ]] || tag="v$(node -p 'require("./app.json").expo.version')"
  [[ "$tag" == v* ]] || tag="v$tag"
  if ! git remote get-url origin >/dev/null 2>&1; then
    echo "release.sh: no GitHub remote yet; create the repo and push it first" >&2
    exit 1
  fi
  if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    echo "release.sh: commit your changes first; the APK is built from GitHub, not this folder" >&2
    exit 1
  fi
  git fetch --quiet origin
  if ! git merge-base --is-ancestor HEAD '@{u}' 2>/dev/null; then
    echo "release.sh: push this branch first (git push); the APK is built from GitHub" >&2
    exit 1
  fi
  if git rev-parse --quiet --verify "refs/tags/$tag" >/dev/null \
      || git ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null; then
    echo "release.sh: $tag already exists; bump the version or pass --apk=vX.Y.Z" >&2
    exit 1
  fi
  git tag -a "$tag" -m "$tag"
  git push --quiet origin "refs/tags/$tag"
  local repo
  repo="$(git remote get-url origin | sed -E 's#^(git@github\.com:|https://github\.com/)##; s#\.git$##')"
  echo "Tagged $tag; GitHub Actions is building the APK (15-25 min):"
  echo "  progress: https://github.com/$repo/actions/workflows/android-release.yml"
  echo "  download: https://github.com/$repo/releases/tag/$tag"
}

if [[ "$APK" == true ]]; then
  release_apk "$APK_TAG"
  exit 0
fi

if [[ "$DEPLOY" == true ]]; then
  echo "==> checking Cloudflare login"
  if ! whoami_out="$("${WRANGLER[@]}" whoami </dev/null 2>&1)" \
      || ! grep -qi "you are logged in" <<<"$whoami_out"; then
    echo "$whoami_out" >&2
    echo "release.sh: not signed in. Run: npx wrangler@4 login   (or pass --no-deploy)" >&2
    exit 1
  fi
  grep -i "you are logged in" <<<"$whoami_out" | sed 's/^/    /' || true
fi

echo "==> building"
cd "$ROOT"
extra=()
if [[ "$CLEAN" == true ]]; then
  rm -rf .expo
  extra=(--clear)
fi
rm -rf dist
npx expo export --platform web --output-dir dist ${extra[@]+"${extra[@]}"} </dev/null

# Wrangler never uploads folders named node_modules, so fonts Expo exports to
# assets/node_modules/... (the Ionicons font) would 404 and fall through to the
# SPA rewrite, breaking every icon. Move them and point the bundle at the new path.
if [[ -d dist/assets/node_modules ]]; then
  mv dist/assets/node_modules dist/assets/vendor
  grep -rlF '/assets/node_modules/' dist --include='*.js' --include='*.html' --include='*.css' \
    | xargs sed -i.bak 's#/assets/node_modules/#/assets/vendor/#g'
  find dist -name '*.bak' -delete
fi

# Precache every built file in the service worker so the app opens offline after
# the first visit, and name the cache after this build so old files get dropped.
node -e '
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else files.push("/" + path.relative("dist", p).split(path.sep).join("/"));
  }
})("dist");
const keep = files.filter((f) => !/(^\/sw\.js$|^\/_redirects$|\.map$)/.test(f));
const hash = crypto.createHash("sha1").update(keep.map((f) => f + fs.statSync("dist" + f).size).join()).digest("hex").slice(0, 10);
let sw = fs.readFileSync("dist/sw.js", "utf8");
sw = sw.replace(/const CACHE = .*;/, `const CACHE = "gawain-${hash}";`).replace(/const SHELL = .*;/, `const SHELL = ${JSON.stringify(["/", ...keep])};`);
fs.writeFileSync("dist/sw.js", sw);
console.log(`    precached ${keep.length} files (gawain-${hash})`);
'

if [[ "$DEPLOY" == false ]]; then
  echo "Built: $ROOT/dist ($(du -sh dist | cut -f1)), not deployed"
  exit 0
fi

# Create the Pages project on first deploy; later runs skip this. Newer
# wrangler tries to create a Workers project instead and fails on a plain
# assets folder; --force keeps it a classic Pages project like the rowph* apps.
if ! "${WRANGLER[@]}" pages project list </dev/null 2>/dev/null | grep -q "│ ${PROJECT} "; then
  echo "==> creating Pages project ${PROJECT}"
  "${WRANGLER[@]}" pages project create "$PROJECT" --production-branch main --force </dev/null
fi

echo "==> deploying to Cloudflare Pages project ${PROJECT}"
"${WRANGLER[@]}" pages deploy dist --project-name "$PROJECT" --branch main --commit-dirty=true </dev/null

# gawain.pages.dev was already taken by someone else, so Cloudflare gave the
# project its own subdomain. Print whatever it really is.
domain="$("${WRANGLER[@]}" pages project list </dev/null 2>/dev/null | awk -F'│' -v p="$PROJECT" '{gsub(/ /,"",$2)} $2==p {gsub(/ /,"",$3); print $3}')"
echo ""
echo "Live: https://${domain:-${PROJECT}.pages.dev}"

# Only reached when the deploy succeeded (set -e stops on any failure above).
rm -rf "$ROOT/dist"
echo "Removed local build (dist/)"
