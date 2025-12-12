# Axis & Allies (Lite) — Fan-made Web Game (Simple Graphics)

This is a **small, playable, hotseat** web adaptation inspired by Axis & Allies.
It uses an **abstract rectangle map** (no official art) and implements a simplified “core loop”:

**Purchase → Combat Move → Conduct Combat → Noncombat Move → Mobilize → Collect Income**

> Not affiliated with, endorsed by, or connected to Hasbro / Avalon Hill.

## Run it

### Option A — open directly
Open `index.html` in a modern browser.

### Option B — local web server (recommended)
From this folder:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## What’s implemented

- 5 powers: **USSR, Germany, UK, Japan, USA** (hotseat)
- Abstract territories + sea zones, adjacency-based movement
- Unit purchases with IPC economy
- Combat with dice (A/D values) and automatic casualties
- Factories (capitals) auto-place purchased units during Mobilize (Lite convenience)
- Two victory presets (in Purchase):
  - **Long**: “capture 2 capitals” style
  - **Short**: “capture 1 capital” style
- Optional **Pacific-style VP mode** (checkbox):
  - Japan gains `floor(income/10)` VPs each Japan turn
  - (simplified) check at end of Japan’s income collection

## Deliberate simplifications (to keep it compact)

- No submarine surprise strike / submerge
- No AA guns
- No retreats UI (attackers fight on)
- Air landing is simplified (bombers can’t end at sea; fighters require carrier capacity)
- Amphibious is simplified (Load/Unload tools exist; no “naval battle first” ordering)

## Controls

- Click a territory to inspect it.
- Choose **Mode**:
  - **Select**: inspect
  - **Move**: click **source**, pick units, click **destination**
  - **Load to Transport**: source=land, select land units, click adjacent sea zone with friendly transport
  - **Unload from Transport**: source=sea, click adjacent land territory

## Save / Load

- **Save/Load** uses browser `localStorage`.
- **Export/Import JSON** lets you move saves between machines.

## Extending this into a “full map” project

Recommended next steps:

1. Replace `MAP` with a full territory graph (JSON).
2. Implement special rules (subs, AA, strategic bombing, convoy, scrambling, etc.).
3. Add a proper battle UI with retreats and manual casualties.
4. Add AI opponents / network multiplayer.

## Files

- `data.js` — map, units, scenario setup
- `game.js` — rules + UI
- `style.css` — UI styling
- `index.html` — shell

---
Have fun modding!
