#!/usr/bin/env bash
# Đẩy bí mật từ deploy/.env.production (file local, gitignore) lên GitHub secrets — file local là nguồn gốc.
#   bash deploy/sync-secrets.sh            # đẩy mọi biến có giá trị
#   bash deploy/sync-secrets.sh --dry-run  # chỉ liệt kê sẽ đẩy gì (không in giá trị)
# Cần gh CLI đã đăng nhập, quyền admin repo. Biến rỗng hoặc còn chứa ${...} chưa thay → bỏ qua.
set -euo pipefail

REPO="${REPO:-betaplamvan/okia}"
FILE="$(dirname "$0")/.env.production"
ENV_SECRETS="DATABASE_URL REDIS_URL JWT_SECRET GOOGLE_CLIENT_SECRET RESEND_API_KEY RESEND_WEBHOOK_SECRET"
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

echo "Environment production:"
for n in $ENV_SECRETS; do push "$n" -e production; done
echo "Cấp repo:"
for n in $REPO_SECRETS; do push "$n"; done
