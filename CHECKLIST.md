# Axis & Allies 1942.2 Web Game Checklist

Copy/paste spec saved for reference and progress tracking.

## Goal
- [ ] Implement Axis & Allies 1942.2 (Exact) hotseat web game with amphibious assaults and selectable victory conditions.

## Milestone 0 — Repo must load everywhere
- [x] Keep asset filenames clean (no spaces/special characters); board image at `assets/board.jpg`.
- [x] index.html loads hidden board image and canvas with deferred scripts (`data.js`, `game.js`).
- [ ] Acceptance: loads on GitHub Pages and via `python -m http.server`.

## Milestone 1 — Data contract
- [x] `data.js` defines global `AA` with `rules`, `map` (image, size, territories), `units`, `setup` (turnOrder, ipc, stacks).
- [x] Acceptance: game boots and draws some stacks on the map.

## Milestone 2 — Unit stats (1942.2 hardcoded)
- [x] Include full 1942.2 unit table (cost/att/def/move) in `AA.units`.
- [x] Acceptance: UI "Unit Reference" panel prints these exactly.

## Milestone 3 — Start screen options
- [x] Start overlay requires Victory Mode selection (VC_STANDARD default, VC_TOTAL, CAPITALS).
- [x] Map data flags victory cities and capitals; evaluate victory at end of USA turn.
- [ ] Acceptance: cannot start without selection; end-of-USA-turn check triggers winner overlay.

## Milestone 4 — Turn engine (state machine)
- [x] Implement phases: Purchase → Combat Move → Conduct Combat → Noncombat Move → Mobilize → Collect Income → Next Power.
- [x] Track `state = { round, currentPower, phase, options, pendingBattles, pendingAmphib }` with `nextPhase()/nextPower()` and validation scaffolding.
- [ ] Acceptance: "Next Phase" cycles correctly and UI shows current power + phase.

## Milestone 5 — Rendering + territory interaction
- [x] Draw board with pan/zoom, territory polygons, unit counters; hit testing for selection.
- [ ] Acceptance: clicking reliably selects intended territory.

## Milestone 6 — Movement legality
- [x] Move one unit at a time respecting movement points; Combat vs Noncombat legality; air movement distances (basic without landing enforcement).
- [ ] Acceptance: infantry 1, tank 2, ships 2, fighters 4, bombers 6.

## Milestone 7 — Combat core
- [x] Dice combat for land/sea with logs, casualty choice, retreat handling (retreats pending).
- [ ] Acceptance: reproducible battles with roll log.

## Milestone 8 — Amphibious assaults
- [ ] Implement transport load/offload rules, sequencing (sea combat → bombardment → land), retreat edge cases, and minimal UI flow.
- [ ] Acceptance: UK can run first-turn amphib assault end-to-end with logs.

## Milestone 9 — Economy
- [ ] Purchase, mobilize, collect income with IC rules when map supports.
- [ ] Acceptance: purchasing decreases IPC, mobilize places units, collect updates IPC.

## Milestone 10 — Save/Load
- [x] Export/import JSON for full game state (localStorage single slot).
- [ ] Acceptance: reload restores exact board state.

## Regression tests
- [ ] Add console tests for amphibious scenarios (no sea defenders, with destroyer, transport sunk edge case) reporting PASS/FAIL.
- [x] Add deterministic RNG, serialization, and scripted battle harness via `runSelfTests()`.

## Definition of Done
- [ ] Public v1: loads, board renders, selection works, turn phases work, legal movement, combat with dice log, amphibious assaults playable, economy, save/load.
