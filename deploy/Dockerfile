# Bootstrap image: pinned official npm distribution, until source-build packaging is validated.
FROM node:22-bookworm-slim
ARG DSH_VERSION=0.2.1-alpha.2

RUN apt-get update \
 && apt-get install -y --no-install-recommends bash git ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/dsh
RUN npm install --include=optional --no-audit --no-fund \
      "@deepseek-ai/dsh@${DSH_VERSION}" \
      "node-addon-require-builtin@0.1.9" \
      "node-addon-require-builtin-linux-x64-gnu@0.1.9" \
 && node -e "const a=require('node-addon-require-builtin'); const x=a.getBindingInfo(); if(!x.bindingPath) throw new Error('missing native binary'); console.log('addon verified', x.backend, x.bindingSource)"

RUN mkdir -p /data/dsh/.npm-cache /data/dsh/.cache /data/dsh/.hyperframes /workspace \
 && chown -R node:node /data/dsh /workspace \
 && chmod 0700 /data/dsh/.npm-cache /data/dsh/.cache /data/dsh/.hyperframes
ENV HOME=/data/dsh \
    DSH_HOME=/data/dsh \
    NPM_CONFIG_CACHE=/data/dsh/.npm-cache \
    XDG_CACHE_HOME=/data/dsh/.cache \
    NODE_ENV=production \
    NARB_DISABLE_NATIVE_CACHE=1 \
    PATH=/opt/dsh/node_modules/.bin:$PATH
WORKDIR /workspace
USER node
EXPOSE 3080
# CI preview only: bind solely to container loopback; no remote listener.
# Do NOT use this image with the public Traefik Portainer Stack.
CMD ["dsh", "web", "--no-open", "--port", "3080", "--host", "127.0.0.1"]
