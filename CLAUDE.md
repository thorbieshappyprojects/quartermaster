# Quartermaster

Quartet-style card game for learning military equipment: one card per system, comparable core values, playful modes. A second deck (planned) teaches military ranks. English only. Users: the owner and friends, on phone and Mac; solo play first.

The repository is **public**. Planning documents live in `docs/` locally and are gitignored — never commit them, and keep code, data and commit messages neutral (no company framing, no paths to other local projects).

## Product

- Cards are virtual with five faces: **Identity** (name/variant, silhouette, role in one sentence, memorable fact, manufacturer, production site, origin), **Specs** (the category's trump values), **Service** (operators, units built, in service since, status, combat use), **Business** (unit cost estimate with basis, major contracts, manufacturer context), **Sources** (source, date and confidence for every value; shared sources are marked).
- Every category has one **category card**: purpose in modern warfare, strengths, weaknesses, typical counters, current trends (each item sourced).
- Every system card lists its direct **peers**; the relation is treated as symmetric and drives the match-up mode.
- Modes: trumps duel vs computer (easy/hard), flashcards with spaced repetition, silhouette recognition quiz, match-up, operator map.

## Non-negotiables

- **No invented values.** A value without a public source stays `null` and is logged as a gap. Empty values cannot be picked in the duel; if the opponent's value is empty the round is a tie.
- **Every value carries a source id and a confidence** (`high`, `medium`, `low`). Sources store URL, title, publisher, retrieval date (and optional `kind`).
- **Conflicting public figures are stored as a `range`**, with the displayed `value` chosen explicitly (it must lie inside the range).
- **Cost always has currency, price year and basis** (`unit_price` or `contract_per_unit`); the basis is shown on the card. The sourced figure stays in its original currency; for comparison the build converts it to EUR with the ECB annual average of the price year (`data/fx/ecb.yaml`, refreshed with `npm run fetch:fx`; an incomplete year uses the months published so far and is marked). EUR is shown first, the original next to it; not adjusted for inflation.
- **Names are short** (max 32 characters, the current variant, e.g. `Leopard 2A8`). Configuration or batch details go in `variant_note`, other designations in `aliases`.
- **Derived values** (e.g. power-to-weight) are never stored on cards: the category declares `derived: {op: divide, numerator, denominator}` and the build computes them, flagged "calc", with the lower of the two input confidences.
- **Public, catalogue-level information only.** No leaked, classified or export-controlled technical detail.
- **Source preference:** manufacturer and government publications first, then reference works and trade press. Wikipedia is a pointer (validator warns); cite the underlying source.
- **Neutral deck.** No manufacturer is highlighted on cards or in the interface.
- **Images:** original vector silhouettes only. No photos, nothing traced from copyrighted images. Cards without a drawing use the generic category placeholder `public/silhouettes/_<category>.svg` and are excluded from the recognition quiz.

## Stack

- Static single-page app, no backend: TypeScript, Vite, Preact (+ `@preact/signals`), hash routing.
- Card data: YAML in `data/`, validated against JSON Schemas (`schemas/`, Ajv 2020) plus cross-file rules, compiled to `src/generated/deck.json` (gitignored) at build time.
- Player progress: `localStorage` (`quartermaster.progress.v1`), export/import as JSON file.
- Tests: Vitest unit tests (`tests/unit`), one Playwright smoke test at phone and desktop width (`tests/e2e`).
- CI (`.github/workflows/ci.yml`): validate → broken fixture must fail → typecheck → unit → build → e2e. Deployment: own Compose stack `/opt/quartermaster` on the VPS (Caddy + its own Cloudflare Tunnel, no published port, no login yet); never touch the other stacks there; `npm run deploy` (local) or the deploy workflow once `DEPLOY_ENABLED` is set (see `DEPLOY.md`).

## Layout

```
data/categories/<category>.yaml      # indicators (id, label, unit, trump, derived?), category card, sources
data/systems/<category>/<id>.yaml    # one system card; file name = id, folder = category
data/sources/*.yaml                  # shared sources, referenced as "@id"
data/manufacturers/                  # optional manufacturer context (local import, gitignored)
schemas/                             # JSON Schemas: common, category, system, source
scripts/validate.ts                  # npm run validate [-- <root>] [--gaps]
scripts/build-data.ts                # npm run build:data
scripts/report.ts                    # npm run report [-- --md file.md]: gaps, low confidence, ranges, cost basis
scripts/research/                    # npm run research: API-driven research with a USD budget (see below)
src/game/                            # pure game logic (duel, srs, cards, progress) — unit tested
src/ui/                              # Preact components
tests/fixtures/{valid,broken}/       # validator fixtures; broken/ must always fail
```

## Data model (shape)

```yaml
id: leopard-2a8
category: main-battle-tank
name: Leopard 2A8                            # short, max 32 chars
variant_note: "..."                          # optional: configuration the values describe
manufacturer: { name: "...", benchmark_slug: optional-slug }
production_sites: [ { place: "...", country: DE, source: s1 } ]
origin: DE                                   # ISO 3166-1 alpha-2
role: "One sentence."
memorable_fact: { text: "...", source: s2 }
status: in_production                        # in_production | in_service | retired
in_service_since: { value: null, source: null, confidence: null }
units_built: { value: null, source: null, confidence: null }
combat_use: { text: "...", source: s3 }
specs:                                       # every non-derived indicator of the category, null if unknown
  combat_weight: { value: 66.5, range: { min: 64, max: 67 }, source: s1, confidence: high, note: "..." }
operators:
  - { country: DE, force: Army, state: ordered, quantity: null, source: s4 }   # in_service | ordered | retired | evaluating
cost: { value: null, currency: EUR, price_year: null, basis: contract_per_unit, source: s4, confidence: low }
contracts: [ { customer: "...", year: null, quantity: null, value: null, currency: EUR, source: s4 } ]
peers: [ m1a2-sepv3-abrams, k2-black-panther ]
silhouette: leopard-2a8.svg                  # optional, in public/silhouettes/
sources:
  - { id: s1, url: "...", title: "...", publisher: "...", retrieved: 2026-11-21, kind: manufacturer }
```

Trump directions: `higher_wins`, `lower_wins`, `not_playable`.

## Working rules

- Run `npm run validate` after any data change; `npm run build` must pass before committing.
- Research: `npm run research -- --category <id> [--only <system-id>] [--force]`. Uses `ANTHROPIC_API_KEY` from `.env`, model `claude-opus-5-5` with web search/fetch, and stops before `RESEARCH_BUDGET_USD` (ledger: `scripts/research/ledger.json`). Targets: `scripts/research/targets.yaml`; indicator definitions: `scripts/research/indicators/`. Logs per card in `scripts/research/logs/` include source URLs that never appeared in search results — check those first when reviewing.
- Never commit `.env` or `docs/`.
