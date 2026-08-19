# apOS container edition — the web app + worker in one image.
# Ollama is NOT here: on macOS, containers get no Metal GPU, so Ollama runs
# natively on the host and the container reaches it at host.docker.internal.
#
# tsx (worker) and drizzle-kit (migrate) are devDependencies, so all deps are
# installed (not --prod). Next is not in standalone mode, so we ship node_modules
# + .next and run `next start`.
FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# pnpm via corepack — pinned to the version this repo builds with. (Without a
# pin, corepack pulls the latest pnpm, which exits non-zero on ignored builds.)
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# Install deps first (cached unless the lockfile changes).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# pnpm 10 fails a fresh non-interactive install if a dep's build script is
# neither approved nor ignored. esbuild ships a prebuilt platform binary and
# needs no build step, so ignore it here (in-image only — the repo file is not
# modified). sharp / unrs-resolver are already ignored in pnpm-workspace.yaml.
RUN sed -i '/^ignoredBuiltDependencies:/a\  - esbuild' pnpm-workspace.yaml
RUN pnpm install --frozen-lockfile

# App source + build.
COPY . .
RUN pnpm build

EXPOSE 3777

# Overridden per service in compose (web / worker / migrate).
CMD ["pnpm", "start"]
