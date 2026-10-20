#!/usr/bin/env bash
# Thay container bằng image mới, chờ healthcheck; lỗi thì chạy lại image cũ. Dùng trong job deploy
# (runner minisforum) của .github/workflows/web.yml và api.yml. Postgres/Redis KHÔNG do script này quản lý.
#
# Biến môi trường:
#   NAME            tên container (okia-web, okia-api)
#   IMAGE           image đầy đủ kèm tag, ví dụ ghcr.io/betaplamvan/okia-web:<sha>
#   PORT_MAP        ánh xạ cổng cho `docker run -p`, ví dụ 3000:3000 hoặc 127.0.0.1:8000:8000
#   NETWORK         docker network để container thấy Postgres/Redis (tạo nếu chưa có)
#   PASS_ENV        (tùy chọn) danh sách tên biến cách nhau bởi khoảng trắng, chuyển vào container
#                   nếu có giá trị (biến rỗng bị bỏ qua → app dùng mặc định trong config)
#   REQUIRED_ENV    (tùy chọn) các biến bắt buộc phải có giá trị
#   HEALTH_TIMEOUT  (tùy chọn) số giây chờ container healthy, mặc định 120
#   KEEP_IMAGES     (tùy chọn) số image cũ của repo giữ lại để quay về, mặc định 3
#   SKIP_PULL=1     (tùy chọn) dùng image có sẵn trên máy, không pull (thử script với image build local)
set -euo pipefail

: "${NAME:?}" "${IMAGE:?}" "${PORT_MAP:?}" "${NETWORK:?}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"
KEEP_IMAGES="${KEEP_IMAGES:-3}"
REPO="${IMAGE%:*}"

for var in ${REQUIRED_ENV:-}; do
  if [ -z "${!var:-}" ]; then
    echo "::error::Thiếu biến bắt buộc $var (đặt trong GitHub → Settings → Environments → production)"
    exit 1
  fi
done

env_args=()
for var in ${PASS_ENV:-}; do
  if [ -n "${!var:-}" ]; then env_args+=(-e "$var"); fi
done

run_container() {
  docker run -d \
    --name "$NAME" \
    --network "$NETWORK" \
    --restart unless-stopped \
    --add-host host.docker.internal:host-gateway \
    -p "$PORT_MAP" \
    "${env_args[@]}" \
    "$1" >/dev/null
}

wait_healthy() {
  local waited=0 status
  while [ "$waited" -lt "$HEALTH_TIMEOUT" ]; do
    status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$NAME" 2>/dev/null || echo missing)
    case "$status" in
      healthy) return 0 ;;
      unhealthy | exited | dead | missing) break ;;
    esac
    sleep 3
    waited=$((waited + 3))
  done
  echo "::error::$NAME không healthy (trạng thái: ${status:-?}) sau ${waited}s"
  docker logs --tail 100 "$NAME" || true
  return 1
}

if [ "${SKIP_PULL:-}" != "1" ]; then
  echo "▶ Pull $IMAGE"
  docker pull -q "$IMAGE"
fi

docker network inspect "$NETWORK" >/dev/null 2>&1 || docker network create "$NETWORK" >/dev/null

previous=$(docker inspect -f '{{.Config.Image}}' "$NAME" 2>/dev/null || true)
echo "▶ Thay $NAME: ${previous:-<chưa có>} → $IMAGE"
docker rm -f "$NAME" >/dev/null 2>&1 || true
run_container "$IMAGE"

if ! wait_healthy; then
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  if [ -n "$previous" ] && [ "$previous" != "$IMAGE" ]; then
    echo "▶ Quay về $previous"
    run_container "$previous"
    wait_healthy || echo "::warning::Image cũ cũng không healthy — kiểm tra Postgres/Redis trên máy"
  fi
  exit 1
fi
echo "✔ $NAME healthy với $IMAGE"

# Dọn image cũ của repo này (giữ KEEP_IMAGES bản gần nhất để quay về); không đụng image khác trên máy.
docker image ls "$REPO" --format '{{.CreatedAt}}\t{{.ID}}' | sort -r | awk -F'\t' '!seen[$2]++ {print $2}' |
  tail -n +"$((KEEP_IMAGES + 1))" | xargs -r docker rmi -f >/dev/null 2>&1 || true
