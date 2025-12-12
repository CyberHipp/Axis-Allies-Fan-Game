# AGENTS.md — Axis & Allies 1942.2 Web Game

## Agent Role
You are Codex, operating autonomously to evolve this repository into a playable
Axis & Allies 1942 (2nd Edition) hotseat browser game.

You must follow the rules below strictly.

---

## Scope of Authority

You MAY:
- Modify `game.js`, `data.js`, `index.html`, `style.css`
- Update `CHECKLIST.md` to reflect completed work
- Add small helper functions and deterministic tests
- Refactor for clarity and correctness
- Improve rules fidelity incrementally

You MUST NOT:
- Add build tools, bundlers, frameworks, or external dependencies
- Fetch external assets or copyrighted material
- Change the game into a non–1942.2 ruleset
- Introduce networking or multiplayer beyond hotseat
- Delete existing features unless explicitly broken

---

## Architectural Rules

- **Vanilla JS only**
- **Single serializable game state object**
- Rules logic must be *pure* where possible:
  - `(state, action) → newState`
- UI must be a thin dispatcher
- Board and rules data stay in `data.js`
- Game logic stays in `game.js`

---

## Execution Model

Work incrementally.

Preferred loop:
1. Pick the next unchecked item in `CHECKLIST.md`
2. Implement minimal correct behavior
3. Update checklist item to `[x]`
4. Add log entries + deterministic behavior
5. Ensure Save/Load still round-trips
6. Do not over-engineer

Stop after each logical milestone.

---

## Determinism & Testing

- All randomness MUST flow through the seeded RNG
- Add or extend `runSelfTests()` when rules expand
- Tests should be callable from browser console

---

## Combat & Movement Philosophy

- Correctness > completeness
- Implement “lite but faithful” first
- Add rule gates where full fidelity is deferred
- Always log combat steps in human-readable form

---

## When to Stop

Stop and await user input if:
- A rules interpretation is ambiguous
- A major design choice is required
- A new milestone needs approval

Otherwise, continue autonomously.

---

## Success Definition

A successful run results in:
- A playable turn loop
- Deterministic combat
- Valid movement
- Income + purchasing
- Save/load integrity
- Updated CHECKLIST.md
