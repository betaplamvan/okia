#!/usr/bin/env bash
# Đẩy bí mật từ deploy/.env.production (file local, gitignore) lên GitHub secrets — file local là nguồn gốc.
#   bash deploy/sync-secrets.sh            # đẩy mọi biến có giá trị
#   bash deploy/sync-secrets.sh --dry-run  # chỉ liệt kê sẽ đẩy gì (không in giá trị)
# Cần gh CLI đã đăng nhập, quyền admin repo. Biến rỗng hoặc còn chứa ${...} chưa thay → bỏ qua.
set -euo pipefail

REPO="${REPO:-betaplamvan/okia}"
FILE="$(dirname "$0")/.env.production"
ENV_SECRETS="DATABASE_URL REDIS_URL JWT_SECRET GOOGLE_CLIENT_SECRET RESEND_API_KEY RESEND_WEBHOOK_SECRET S3_ACCESS_KEY S3_SECRET_KEY SEPAY_API_KEY KOFI_VERIFICATION_TOKEN"
# Biến không mật (gh variable set) — cùng Environment production.
ENV_VARS="APP_BASE_URL API_BASE_URL CORS_ORIGINS COOKIE_SECURE COOKIE_DOMAIN GOOGLE_CLIENT_ID EMAIL_PROVIDER EMAIL_FROM S3_ENDPOINT_URL S3_BUCKET S3_PUBLIC_URL ADMIN_EMAILS DONATE_BANK_BIN DONATE_BANK_NAME DONATE_ACCOUNT_NO DONATE_ACCOUNT_NAME DONATE_KOFI_URL"
REPO_SECRETS="TEST_DATABASE_URL TEST_REDIS_URL"
DRY=0; [ "${1:-}" = "--dry-run" ] && DRY=1

[ -f "$FILE" ] || { echo "Không thấy $FILE"; exit 1; }
set -a
# shellcheck disable=SC1090
. "$FILE"
set +a

push() { # push <tên> <cờ phạm vi...>
  local name="$1"; shift
  local value="${!name:-}"
  if [ -z "$value" ]; then echo "  bỏ qua $name (rỗng)"; return; fi
  if [[ "$value" == *'${'* || "$value" == *'://:@'* ]]; then echo "  bỏ qua $name (thiếu giá trị con)"; return; fi
  if [ "$DRY" = 1 ]; then echo "  sẽ đặt $name $*"; return; fi
  printf '%s' "$value" | gh secret set "$name" -R "$REPO" "$@" >/dev/null && echo "  ✔ $name $*"
}

push_var() { # push_var <tên> — Variable (không mật) của Environment production
  local name="$1"
  local value="${!name:-}"
  if [ -z "$value" ]; then echo "  bỏ qua $name (rỗng)"; return; fi
  if [ "$DRY" = 1 ]; then echo "  sẽ đặt variable $name"; return; fi
  gh variable set "$name" -R "$REPO" -e production --body "$value" >/dev/null && echo "  ✔ variable $name"
}

echo "Environment production — secret:"
for n in $ENV_SECRETS; do push "$n" -e production; done
echo "Environment production — variable:"
for n in $ENV_VARS; do push_var "$n"; done
echo "Cấp repo:"
for n in $REPO_SECRETS; do push "$n"; done
