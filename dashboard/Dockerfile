# syntax=docker/dockerfile:1
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
# npm ci is strict about lock-file completeness across all platform-specific
# optional binaries (@rolldown/@tailwindcss wasm32-wasi bundled deps, etc.)
# — regenerating the lock to satisfy it on Linux drops Windows-resolved
# peerDeps like @testing-library/dom. Use npm install with the lock as a
# preference so CI builds against the published versions while tolerating
# the platform-binary asymmetry. A proper lock regen inside a Linux
# container is filed as a follow-up.
RUN npm install --legacy-peer-deps --no-audit --no-fund

COPY . .
ARG VITE_LLM_CHAT_ASSISTANT=true
ENV VITE_LLM_CHAT_ASSISTANT=${VITE_LLM_CHAT_ASSISTANT}
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
USER root
RUN apk add --no-cache curl gettext
COPY --from=builder --chown=101:101 /app/dist /usr/share/nginx/html
COPY --chown=101:101 nginx.conf /etc/nginx/conf.d/default.conf
COPY --chown=101:101 nginx.conf.template /etc/nginx/templates/nginx.conf.template
COPY --chown=101:101 entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
USER 101

EXPOSE 8080
ENTRYPOINT ["/entrypoint.sh"]
