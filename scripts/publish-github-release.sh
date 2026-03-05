#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ORG="${ORG:-rundecktoolkit}"
REPO="${REPO:-plugin-active-jobs-indicator}"
TAG="${TAG:-v1.0.0}"
RELEASE_NAME="${RELEASE_NAME:-plugin-active-jobs-indicator ${TAG}}"
NOTES_FILE="${NOTES_FILE:-$ROOT_DIR/docs/release-notes-v1.0.0.md}"

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "error: GITHUB_TOKEN is required (repo scope)" >&2
  exit 1
fi

cd "$ROOT_DIR"
./gradlew clean jar >/dev/null

JAR_PATH="$ROOT_DIR/build/libs/ui-active-jobs-navbar-indicator-1.0.0.jar"
if [[ ! -f "$JAR_PATH" ]]; then
  echo "error: jar not found at $JAR_PATH" >&2
  exit 1
fi

AUTH_HEADER="Authorization: Bearer ${GITHUB_TOKEN}"
API_HEADER="Accept: application/vnd.github+json"

# Create repo if it does not exist. Supports owner type User or Organization.
OWNER_JSON="$(curl -sS "https://api.github.com/users/${ORG}" -H "$AUTH_HEADER" -H "$API_HEADER")"
OWNER_TYPE="$(echo "$OWNER_JSON" | sed -n 's/.*"type"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
if [[ "$OWNER_TYPE" == "Organization" ]]; then
  CREATE_URL="https://api.github.com/orgs/${ORG}/repos"
else
  CREATE_URL="https://api.github.com/user/repos"
fi

CREATE_BODY="{\"name\":\"${REPO}\",\"private\":false,\"description\":\"Rundeck active jobs navbar indicator plugin\"}"
CREATE_RESP="$(curl -sS -X POST "$CREATE_URL" \
  -H "$AUTH_HEADER" -H "$API_HEADER" -d "$CREATE_BODY" || true)"
if echo "$CREATE_RESP" | grep -q '"status": "401"'; then
  echo "error: unauthorized creating repo ${ORG}/${REPO}" >&2
  echo "$CREATE_RESP" >&2
  exit 1
fi
if echo "$CREATE_RESP" | grep -q '"name":"Repository creation failed."'; then
  echo "repo exists or creation not permitted; continuing."
fi

REMOTE_URL="https://github.com/${ORG}/${REPO}.git"
if git remote | grep -q '^origin$'; then
  git remote set-url origin "$REMOTE_URL"
else
  git remote add origin "$REMOTE_URL"
fi

git push -u origin main

if git rev-parse "$TAG" >/dev/null 2>&1; then
  git tag -f "$TAG"
else
  git tag "$TAG"
fi
git push origin "$TAG" --force

NOTES="$(cat "$NOTES_FILE")"
REL_BODY=$(printf '{"tag_name":"%s","name":"%s","body":"%s","draft":false,"prerelease":false}' \
  "$TAG" "$RELEASE_NAME" "$(printf "%s" "$NOTES" | sed 's/"/\\"/g; s/$/\\n/' | tr -d '\n')")

REL_RESP="$(curl -sS -X POST "https://api.github.com/repos/${ORG}/${REPO}/releases" \
  -H "$AUTH_HEADER" -H "$API_HEADER" -d "$REL_BODY" || true)"

if echo "$REL_RESP" | grep -q '"already_exists"'; then
  REL_RESP="$(curl -sS "https://api.github.com/repos/${ORG}/${REPO}/releases/tags/${TAG}" \
    -H "$AUTH_HEADER" -H "$API_HEADER")"
fi

UPLOAD_URL="$(echo "$REL_RESP" | sed -n 's/.*"upload_url":[[:space:]]*"\([^"]*\){.*$/\1/p' | head -n1)"
if [[ -z "$UPLOAD_URL" ]]; then
  echo "error: could not obtain release upload URL" >&2
  echo "$REL_RESP" >&2
  exit 1
fi

ASSET_NAME="$(basename "$JAR_PATH")"
curl -sS -X POST "${UPLOAD_URL}?name=${ASSET_NAME}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/java-archive" \
  --data-binary "@${JAR_PATH}" >/dev/null

echo "published:"
echo "  repo: https://github.com/${ORG}/${REPO}"
echo "  release: https://github.com/${ORG}/${REPO}/releases/tag/${TAG}"
echo "  asset: ${ASSET_NAME}"
