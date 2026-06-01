# maneuver-core

**The template authority for year-agnostic FRC scouting infrastructure**

`maneuver-core` is the shared framework shell behind season-specific scouting apps like `maneuver-2026`. It owns the year-agnostic surfaces teams should inherit unchanged: routing, persistence, transfer flows, shared pages, and the inherited test harness. Each yearly repo layers its own game bindings and game-specific UI onto that shell.

## What this repo is responsible for

- **Framework shell**: the shared React app structure, routes, layouts, contexts, and shell-owned pages
- **Offline-first infrastructure**: IndexedDB persistence, PWA install/update plumbing, QR transfer, JSON import/export, and peer transfer wiring
- **Shared analysis surfaces**: team stats, strategy, validation, pick lists, pit scouting, scout management, and achievements pages
- **Template-owned contracts**: TypeScript interfaces in `src\types\game-interfaces.ts`
- **Inherited test harness**: the core regression suite plus the game compatibility suite structure yearly repos inherit

## What yearly repos own

A yearly repo should customize the `src\game-template\` layer and keep `src\core\` framework code generic.

- **Game bindings**: `config`, `scoring`, `validation`, `analysis`, `transformation`, and `ui`
- **Game-specific UI**: scouting screens, pit questions, option panels, labels, field images, and season workflows
- **Season-specific tests**: `src\game-template\testing\editable-yearly\`

See [CONTEXT.md](CONTEXT.md) for the shared language used in this repo, especially **template authority**, **framework shell**, **game compatibility suite**, **PR lane**, and **heavy confidence lane**.

## Repository structure

```text
maneuver-core/
|- src/
|  |- core/                 # Year-agnostic framework shell
|  |- game-template/        # Starter yearly implementation layer
|  |- types/                # Contract types and framework-facing exports
|  |- contexts/             # Public context exports
|  |- hooks/                # Public hook exports
|  |- components/           # Public component exports
|  \- db/                   # Public database exports
|- docs/                    # User-facing framework documentation
|- tests/                   # Browser-based framework shell coverage
\- .github/workflows/       # PR lane and heavy confidence lane automation
```

## Current architecture

The app entrypoint is intentionally thin:

```tsx
import { FrameworkShell } from '@/core/app/frameworkShell';

function App() {
  return <FrameworkShell />;
}
```

`FrameworkShell` owns the shared routes and wraps them in `GameProvider`. By default it wires the starter implementation from `src\game-template\`, but yearly repos can replace those bindings while keeping the shell and inherited routes intact.

### Shared routes in the framework shell

The shell currently provides these routes out of the box:

- `/`
- `/game-start`
- `/auto-start`
- `/auto-scoring`
- `/teleop-scoring`
- `/endgame`
- `/clear-data`
- `/pit-scouting`
- `/api-data`
- `/json-transfer`
- `/peer-transfer`
- `/qr-transfer`
- `/team-stats`
- `/strategy-overview`
- `/match-strategy`
- `/pick-list`
- `/scout-management`
- `/pit-assignments`
- `/achievements`
- `/match-validation`
- `/dev-utilities`

Game-specific repos can change what happens inside these flows through bindings and `src\game-template\game-schema.ts`, but the shell remains the template-owned source of truth.

## Quick start

### Create a yearly repo

1. Use this repository as a template or fork it.
2. Rename the new repo to `maneuver-YYYY`.
3. Replace the starter implementation in `src\game-template\`.
4. Keep framework code in `src\core\` game-agnostic.

### Local development

```bash
git clone https://github.com/ShinyShips/maneuver-core.git maneuver-2026
cd maneuver-2026
npm install
npm run dev
```

### Receiving Updates from maneuver-core

If you want to pull bug fixes and enhancements from `maneuver-core` into your year-specific repo, you have two options:

#### Option 1: Fork (Recommended for external teams)

**fork** the repository instead of using it as a template. This maintains git history and makes pulling updates easy:

```bash
# In your forked repo, pull upstream changes anytime
git fetch upstream
git merge upstream/main
```

#### Option 2: Add upstream remote (For template-based repos)

If you used the template, manually add maneuver-core as an upstream remote:

```bash
# One-time setup: add maneuver-core as upstream
git remote add upstream https://github.com/ShinyShips/maneuver-core.git

# First merge requires --allow-unrelated-histories (template repos have no shared history)
git fetch upstream
git merge upstream/main --allow-unrelated-histories
# Resolve conflicts: keep YOUR version for game-template/, keep UPSTREAM for core/

# Future updates are simple
git fetch upstream
git merge upstream/main
```

> **Tip**: When resolving conflicts, game-specific files in `src/game-template/` should keep your version, while framework files in `src/core/` should typically use the upstream version.

### Environment Setup

If you need API-backed validation or event data, copy `.env.example` to `.env` and add your keys:

```env
VITE_TBA_API_KEY=your_tba_api_key_here
VITE_NEXUS_API_KEY=your_nexus_api_key_here
```

## Testing model

The repo uses a shared **test harness** with two execution lanes:

- **PR lane**: `npm run test:pr`
- **Heavy confidence lane**: `npm run test:heavy`

Supporting commands:

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:e2e:pr
npm run test:e2e:heavy
```

### Game compatibility suite ownership

Yearly repos inherit the compatibility suite in three layers:

| Layer | Path | Ownership |
| --- | --- | --- |
| Locked core contract layer | `src\core\testing\game-compatibility\` | `maneuver-core` |
| Yearly compatibility manifest | `src\game-template\testing\compatibilityManifest.tsx` | yearly repo |
| Editable yearly layer | `src\game-template\testing\editable-yearly\` | yearly repo |

See [docs/GAME_COMPATIBILITY_SUITE.md](docs/GAME_COMPATIBILITY_SUITE.md) for the inheritance rules.

## Customizing the starter game layer

The starter game implementation is intentionally schema-driven so a new yearly repo can change one place first and derive the rest.

Start in:

- `src\game-template\game-schema.ts`
- `src\game-template\scoring.ts`
- `src\game-template\analysis.ts`
- `src\game-template\transformation.ts`
- `src\game-template\components\`
- `src\game-template\testing\`

The schema is a starter pattern, not the framework contract. The actual framework contract is the interface set exported from `src\types\game-interfaces.ts`.

## Documentation map

| Topic | Link |
| --- | --- |
| Shared terminology | [CONTEXT.md](CONTEXT.md) |
| Documentation index | [docs/README.md](docs/README.md) |
| Framework contract | [docs/FRAMEWORK_DESIGN.md](docs/FRAMEWORK_DESIGN.md) |
| Architecture strategy | [docs/ARCHITECTURE_STRATEGY.md](docs/ARCHITECTURE_STRATEGY.md) |
| Game compatibility suite | [docs/GAME_COMPATIBILITY_SUITE.md](docs/GAME_COMPATIBILITY_SUITE.md) |

## Syncing updates into a yearly repo

If a yearly repo forked `maneuver-core`, pull updates from `upstream`:

```bash
git fetch upstream
git merge upstream/main
```

If a yearly repo was created from the template without shared history:

```bash
git remote add upstream https://github.com/ShinyShips/maneuver-core.git
git fetch upstream
git merge upstream/main --allow-unrelated-histories
```

When resolving conflicts, keep **yearly repo** changes inside `src\game-template\` and prefer **upstream** changes inside `src\core\` unless the yearly repo intentionally extended a shell-owned contract.
