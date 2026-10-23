---
kind: dependency_management
name: npm + Node.js Dependency Management (Next.js 15 Monorepo)
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - package-lock.json
    - .gitignore
---

## System / Approach

Laris uses **npm** as its package manager for a single Next.js 15 application. Dependencies are declared in `package.json` and pinned via a generated `package-lock.json`. There is no vendoring, no private registry configuration, and no Yarn/PNPM setup — only npm conventions.

## Key Files

- `package.json` — sole manifest declaring runtime dependencies (`next`, `react`, `@supabase/*`, `ai`, `@ai-sdk/google`, `lucide-react`, `server-only`, `zod`) and dev dependencies (`eslint`, `tailwindcss`, `typescript`, `@types/*`).
- `package-lock.json` — deterministic lockfile committed to the repo.
- `.gitignore` — excludes `/node_modules`, `.pnp*`, `.yarn/*`; includes generic npm/Yarn/PNPM debug log patterns.
- `scripts/seed.ts`, `scripts/rls.test.ts`, `scripts/eval-voice.ts` — Node scripts executed directly with `node --experimental-strip-types --env-file=.env`, not through a bundler.

## Architecture & Conventions

- **Single-package layout**: all third-party packages live under one `package.json` at the repository root; there are no workspace or monorepo sub-packages.
- **Version pinning strategy**: runtime framework packages (`next`, `eslint-config-next`) use exact versions (`15.5.28`), while most libraries use caret ranges (`^4.0.99`, `^2.118.0`, `^1.59.0`, `^4.6.7`). This mixes strict pins for the build toolchain with flexible ranges for libraries.
- **Lockfile-first**: `package-lock.json` is present and should be treated as the source of truth for reproducible installs; `node_modules` is gitignored.
- **No vendoring**: no `vendor/`, no `pnpm-lock.yaml`, no Yarn Berry config — dependencies are installed into `node_modules` at install time.
- **No private registry**: there is no `.npmrc`, no `GOPRIVATE`, no custom registry entries visible in the repository.
- **Dev vs runtime split**: `dependencies` vs `devDependencies` are cleanly separated; dev tools (ESLint, Tailwind, TypeScript, type definitions) do not leak into production bundles.
- **Script execution model**: custom scripts bypass `next` and run directly under Node using `--experimental-strip-types` (TypeScript without transpilation) plus `--env-file=.env` for environment loading. The test runner is Node's built-in `node --test`.

## Conventions & Constraints

- `node_modules` is excluded from version control (enforced by `.gitignore`).
- Lockfile (`package-lock.json`) is committed alongside `package.json`, so CI and other developers resolve an identical tree.
- Environment variables are loaded per-script via `--env-file=.env` rather than globally, keeping script invocations self-contained.
- No postinstall hooks, no prepack/postpack scripts, and no publish configuration — the project is marked `"private": true` and is not published to any registry.