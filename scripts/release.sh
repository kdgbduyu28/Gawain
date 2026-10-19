#!/usr/bin/env bash
#
# Build Gawain for the web and deploy it to Cloudflare Pages.
#
#   ./scripts/release.sh               # build + deploy to gawain-ccn.pages.dev
#   ./scripts/release.sh --no-deploy   # build only
#   ./scripts/release.sh --clean       # clear the bundler cache first
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

for arg in "$@"; do
  case "$arg" in
    --no-deploy) DEPLOY=false ;;
    --clean)     CLEAN=true ;;
    -h|--help)   sed -n '3,9p' "$0"; exit 0 ;;
    *) echo "release.sh: unknown option '$arg'" >&2; exit 2 ;;
  esac
done

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
