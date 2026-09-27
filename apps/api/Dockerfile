# syntax=docker/dockerfile:1.7
#
# The API image. Built by Render (see render.yaml), but nothing here is Render-specific — any
# Docker host will do.
#
# Build context is the REPO ROOT, not apps/api: @pmp/shared has no dist and exposes
# ./src/index.ts directly, so its TypeScript source is a genuine runtime input.
#
# API 镜像。由 Render 构建（见 render.yaml），但这里没有任何 Render 专有的东西——
# 任何 Docker 宿主都能用。
#
# 构建上下文是「仓库根目录」而非 apps/api：@pmp/shared 没有 dist、直接暴露
# ./src/index.ts，所以它的 TypeScript 源码是真正的运行时输入。

# ---------------------------------------------------------------------------
# base — shared by the build and runtime stages.
# Pinned to bookworm-slim (glibc + OpenSSL 3.0). Using one base for both stages means the engine
# that Prisma's default binaryTargets = "native" resolves at generate time is necessarily the same
# one needed at runtime. Alpine would require an explicit linux-musl-openssl-3.0.x target.
# openssl is a hard dependency for Prisma on slim images — without it: "failed to detect libssl".
#
# base —— 构建阶段与运行阶段共用的底座。
# 钉在 bookworm-slim（glibc + OpenSSL 3.0）。两个阶段用同一个底座，
# 这样 Prisma 默认 binaryTargets = "native" 在生成期解析出的引擎，
# 和运行时需要的必然是同一个。换 alpine 就要显式加 linux-musl-openssl-3.0.x。
# openssl 是 Prisma 在 slim 镜像上的硬依赖，缺了会报 "failed to detect libssl"。
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PRISMA_HIDE_UPDATE_MESSAGE=1
WORKDIR /repo

# ---------------------------------------------------------------------------
# toolchain — pnpm is only needed while building.
# Installed via npm -g rather than corepack: corepack caches under root's home, which a later
# `USER node` cannot read, silently degrading to a network fetch that then fails.
#
# toolchain —— 只有构建阶段需要 pnpm。
# 用 npm -g 而非 corepack：corepack 的缓存在 root 的 home 下，
# 后面 `USER node` 读不到，会静默退化成联网下载然后失败。
# ---------------------------------------------------------------------------
FROM base AS toolchain
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
RUN npm install -g pnpm@12.3.4

# ---------------------------------------------------------------------------
# deps — the expensive layer. Only manifests are copied, so its cache key is independent of
# any source change.
#
# deps —— 最贵的一层。只拷清单文件，缓存键与任何源码改动无关。
# ---------------------------------------------------------------------------
FROM toolchain AS deps
# All four package.json files are required: miss one and --frozen-lockfile fails with
# ERR_PNPM_OUTDATED_LOCKFILE because the lockfile has an importer with no matching manifest.
# pnpm-workspace.yaml is mandatory too — allowBuilds lives in it, and without it the install
# scripts for prisma engines and esbuild are SILENTLY skipped, which breaks tsx at runtime.
# 四个 package.json 全都要：少一个，--frozen-lockfile 会因为 lockfile 里存在
# 找不到对应清单的 importer 而报 ERR_PNPM_OUTDATED_LOCKFILE。
# pnpm-workspace.yaml 同样必需——allowBuilds 就在里面，缺了的话 prisma engines
# 和 esbuild 的安装脚本会被「静默」跳过，运行时 tsx 直接废掉。
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json        apps/api/
COPY apps/web/package.json        apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/engine/package.json packages/engine/

# --filter-prod "@pmp/api..." does two things at once: only materialise @pmp/api and its
# workspace dependency @pmp/shared (apps/web and packages/engine are not installed at all), and
# drop devDependencies. tsx and prisma are prod dependencies precisely so they survive this.
# --filter-prod "@pmp/api..." 一次做两件事：只物化 @pmp/api 及其 workspace 依赖
# @pmp/shared（apps/web 和 packages/engine 一个字节都不装），以及去掉 devDependencies。
# tsx 和 prisma 之所以是 prod 依赖，正是为了活过这一步。
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile --prod \
        --store-dir /pnpm/store \
        --filter-prod "@pmp/api..."

# ---------------------------------------------------------------------------
# builder — generate the Prisma Client, then add application source.
#
# builder —— 生成 Prisma Client，然后加入应用源码。
# ---------------------------------------------------------------------------
FROM deps AS builder

# prisma/ is copied on its own so only a schema or migration change re-runs generate; editing
# business code does not. generate reads the schema without connecting, so a placeholder URL is
# enough to satisfy the datasource's env() lookup (the CI workflow does the same).
# prisma/ 单独拷贝，所以只有 schema 或迁移变动才会重跑 generate，改业务代码不会。
# generate 只读 schema 不连库，占位 URL 足够满足 datasource 的 env() 求值（CI 里就是这么做的）。
COPY apps/api/prisma apps/api/prisma
RUN DATABASE_URL=postgresql://placeholder \
    pnpm --filter @pmp/api exec prisma generate

# Source last: editing code only invalidates these few KB-sized layers.
# tsconfig files are required — tsx reads apps/api/tsconfig.json, which extends
# ../../tsconfig.base.json, and get-tsconfig throws outright if the base is missing.
# 源码放最后：改代码只让这几个 KB 级的层失效。
# tsconfig 必须带上——tsx 会读 apps/api/tsconfig.json，而它 extends
# ../../tsconfig.base.json，base 缺失时 get-tsconfig 会直接抛错。
COPY tsconfig.base.json ./
COPY packages/shared/tsconfig.json packages/shared/
COPY packages/shared/src           packages/shared/src
COPY apps/api/tsconfig.json        apps/api/
COPY apps/api/src                  apps/api/src

# Build-time smoke test: import the real app module. This proves in one shot that the Prisma
# Client was generated and resolves, that its engine binary matches this platform, that
# @pmp/shared's runtime exports load through the pnpm symlink farm, and that better-auth
# initialises. Without it all of these would only surface as a crash loop after deploy.
# The placeholder secret must not contain "dev-only" or env.ts's production guard rejects it.
# 构建期冒烟测试：import 真实的 app 模块。这一步同时证明 Prisma Client 已生成且可解析、
# 引擎二进制与本平台匹配、@pmp/shared 的运行时导出能穿过 pnpm 的符号链接农场加载、
# 以及 better-auth 能初始化。没有它，这些问题只会在部署后表现为崩溃重启循环。
# 占位密钥不能含 "dev-only"，否则会被 env.ts 的生产环境防呆拒绝。
WORKDIR /repo/apps/api
RUN DATABASE_URL=postgresql://placeholder \
    BETTER_AUTH_SECRET=build-time-smoke-test-placeholder \
    node --import tsx -e "await import('./src/app.js'); console.log('[check] app 模块加载正常');"

# ---------------------------------------------------------------------------
# runner — clean base, no pnpm.
# The whole /repo tree must be copied AND land at the same path. Three reasons:
#   - pnpm's node_modules is a farm of RELATIVE symlinks; move it and every link dangles
#   - the generated Prisma Client lives in
#     node_modules/.pnpm/@prisma+client@<peer-hash>/node_modules/.prisma/client/, NOT in
#     apps/api/node_modules — and that directory name embeds a peer hash that changes with any
#     version bump, so it can never be hardcoded in a COPY path
#   - @pmp/shared is apps/api/node_modules/@pmp/shared -> ../../../../packages/shared
#
# runner —— 干净底座，不带 pnpm。
# 必须整棵 /repo 一起拷贝，且落点路径保持不变。三个理由：
#   - pnpm 的 node_modules 是「相对」符号链接农场，挪了位置所有链接全断
#   - 生成的 Prisma Client 在 node_modules/.pnpm/@prisma+client@<peer-hash>/
#     node_modules/.prisma/client/，不在 apps/api/node_modules 里——而那个目录名
#     带 peer 哈希，任何版本变动都会变，所以绝不能在 COPY 路径里写死
#   - @pmp/shared 是 apps/api/node_modules/@pmp/shared -> ../../../../packages/shared
# ---------------------------------------------------------------------------
FROM base AS runner
COPY --from=builder --chown=node:node /repo /repo
WORKDIR /repo/apps/api
USER node

# Informational only. The actual port comes from PORT (Render injects it, default 10000),
# falling back to API_PORT and then 8787 — see apps/api/src/env.ts.
# 仅作说明。实际端口来自 PORT（Render 会注入，默认 10000），
# 其次 API_PORT，最后 8787——见 apps/api/src/env.ts。
EXPOSE 8787

# `node --import tsx` rather than ./node_modules/.bin/tsx: sidesteps pnpm's platform-dependent
# choice between a symlink and an sh wrapper script.
# 用 `node --import tsx` 而非 ./node_modules/.bin/tsx：绕开 pnpm 在不同平台上
# 生成符号链接还是 sh 包装脚本的差异。
CMD ["node", "--import", "tsx", "src/server.ts"]
