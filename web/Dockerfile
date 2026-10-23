# Image production cho web (Next.js standalone). Build context là GỐC repo vì bước prebuild
# (scripts/build-audio.mjs) đọc ../shared/audio:
#   docker build -f web/Dockerfile -t okia-web .
# NEXT_PUBLIC_* được nhúng vào bundle lúc build → đổi giá trị thì phải build lại image.

FROM node:24-slim AS deps
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app/web
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY shared /app/shared
COPY web /app/web
# Để trống → client tự gọi http://<hostname-của-trang>:8000 (xem src/lib/api.ts).
ARG NEXT_PUBLIC_API_URL=""
ARG NEXT_PUBLIC_WS_URL=""
# Quảng cáo AdSense (docs/10): rỗng → không tải script, không ô nào.
ARG NEXT_PUBLIC_ADSENSE_CLIENT=""
ARG NEXT_PUBLIC_ADSENSE_SLOT_HOME=""
ARG NEXT_PUBLIC_ADSENSE_SLOT_PAGE=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL \
    NEXT_PUBLIC_ADSENSE_CLIENT=$NEXT_PUBLIC_ADSENSE_CLIENT \
    NEXT_PUBLIC_ADSENSE_SLOT_HOME=$NEXT_PUBLIC_ADSENSE_SLOT_HOME \
    NEXT_PUBLIC_ADSENSE_SLOT_PAGE=$NEXT_PUBLIC_ADSENSE_SLOT_PAGE \
    NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1
# chakra typegen sinh type cho recipe tùy biến (variant "sticker"...) — thiếu thì `next build` lỗi type.
RUN pnpm chakra:typegen && pnpm build

FROM node:24-slim AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/web/.next/standalone ./
COPY --from=build --chown=node:node /app/web/.next/static ./.next/static
COPY --from=build --chown=node:node /app/web/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
