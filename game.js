// Axis & Allies (Lite) — core game logic + UI
// Hotseat multiplayer. Simplified rules. See README.md for details.
//
// IMPORTANT:
// - This is NOT an official product.
// - No official art/assets are used.
// - It is a learning project / fan adaptation.

(() => {
  "use strict";

  // ---------- helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const deepCopy = (x) => JSON.parse(JSON.stringify(x));
  const nowHHMMSS = () => new Date().toLocaleTimeString();
  const die = () => 1 + Math.floor(Math.random() * 6);

  function fmtUnitsSummary(units) {
    const by = {};
    for (const u of units) {
      const key = `${u.owner}:${u.type}`;
      by[key] = (by[key] || 0) + 1;
    }
    const parts = Object.entries(by).map(([k, n]) => {
      const [owner, type] = k.split(":");
      return `${owner} ${type}×${n}`;
    });
    return parts.length ? parts.join(", ") : "—";
  }

  function groupBy(arr, fnKey) {
    const m = new Map();
    for (const x of arr) {
      const k = fnKey(x);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(x);
    }
    return m;
  }

  function powerSide(p) { return POWERS[p]?.side || "Neutral"; }

  function territoryById(id) { return MAP.find(t => t.id === id); }

  function isFactory(tid) { return FACTORIES.has(tid); }

  function isLand(tid) { return territoryById(tid)?.type === "land"; }
  function isSea(tid) { return territoryById(tid)?.type === "sea"; }

  function canShareSpace(ownerA, ownerB) {
    // Mixed allied stacks are allowed in defense in many A&A variants.
    // Lite rule: units may stack with same-side powers only.
    return ownerA === ownerB || (powerSide(ownerA) === powerSide(ownerB));
  }

  // ---------- state ----------
  let _uid = 0;
  function newUnitId() { _uid += 1; return `u${_uid}`; }

  function makeUnit(type, owner) {
    const st = UNIT_STATS[type];
    return {
      id: newUnitId(),
      type,
      owner,
      hp: st.hp || 1,
      moved: 0,        // how many moves spent this turn
      from: null,      // last origin (for retreat)
      flags: {},       // { combatMoved: true }
      cargo: [],       // for transports only: array of unit objects (land units)
    };
  }

  function defaultState() {
    _uid = 0;
    const territories = {};
    for (const t of MAP) {
      territories[t.id] = {
        id: t.id,
        owner: (t.type === "land") ? (START_OWNER[t.id] || null) : null,
        units: [],
      };
    }

    // place starting units
    for (const [tid, owner, entries] of START_UNITS) {
      const slot = territories[tid];
      for (const [type, count] of entries) {
        for (let i = 0; i < count; i++) slot.units.push(makeUnit(type, owner));
      }
    }

    // compute starting IPC: sum of owned land IPC values
    const ipc = {};
    for (const p of Object.keys(POWERS)) ipc[p] = 0;
    for (const t of MAP) {
      if (t.type !== "land") continue;
      const o = territories[t.id].owner;
      if (o && ipc[o] !== undefined) ipc[o] += (t.ipc || 0);
    }

    return {
      version: "aalite-0.1",
      round: 1,
      turnIndex: 0,
      phaseIndex: 0,
      territories,
      ipc,
      purchases: { USSR: [], Germany: [], UK: [], Japan: [], USA: [] }, // [{type,count}]
      vpMode: false,
      vpJapan: 0,
      victoryRule: "long", // long|short
      battles: [],         // built after combat move
      history: [],
      selected: null,      // selected territory id
      move: { source: null, pending: null }, // pending: {unitIds:[], mode:'move'|'load'|'unload'}
    };
  }

  let S = defaultState();

  // ---------- logging ----------
  function log(msg) {
    const line = `[${nowHHMMSS()}] ${msg}`;
    S.history.push(line);
    const logEl = $("#log");
    const div = document.createElement("div");
    div.className = "line";
    div.textContent = line;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function resetLogFromState() {
    const logEl = $("#log");
    logEl.innerHTML = "";
    for (const line of S.history) {
      const div = document.createElement("div");
      div.className = "line";
      div.textContent = line;
      logEl.appendChild(div);
    }
    logEl.scrollTop = logEl.scrollHeight;
  }

  // ---------- rules / computations ----------
  function currentPower() { return TURN_ORDER[S.turnIndex]; }
  function currentPhase() { return PHASES[S.phaseIndex]; }

  function friendlyToCurrent(owner) {
    return owner && powerSide(owner) === powerSide(currentPower());
  }

  function computeIncome(power) {
    let inc = 0;
    for (const t of MAP) {
      if (t.type !== "land") continue;
      const o = S.territories[t.id].owner;
      if (o === power) inc += (t.ipc || 0);
    }
    return inc;
  }

  function listFactories(power) {
    return MAP
      .filter(t => t.type === "land" && isFactory(t.id) && S.territories[t.id].owner === power)
      .map(t => t.id);
  }

  function resetUnitsForNewTurn(power) {
    for (const tid in S.territories) {
      for (const u of S.territories[tid].units) {
        if (u.owner === power) {
          u.moved = 0;
          u.from = null;
          u.flags = {};
        }
        // cargo units (owned by someone) also reset only on their owner's turn
        if (u.type === "trn" && u.cargo?.length) {
          for (const cu of u.cargo) {
            if (cu.owner === power) {
              cu.moved = 0;
              cu.from = null;
              cu.flags = {};
            }
          }
        }
      }
    }
  }

  function unitMoveLeft(u) {
    const st = UNIT_STATS[u.type];
    return Math.max(0, (st.move || 0) - (u.moved || 0));
  }

  function isEnemyLand(tid, attackerPower) {
    const t = territoryById(tid);
    if (!t || t.type !== "land") return false;
    const o = S.territories[tid].owner;
    return o && powerSide(o) !== powerSide(attackerPower);
  }

  function hasEnemyUnits(tid, attackerPower) {
    const units = S.territories[tid].units;
    return units.some(u => powerSide(u.owner) !== powerSide(attackerPower));
  }

  function isHostileSpace(tid, attackerPower) {
    return isEnemyLand(tid, attackerPower) || (isSea(tid) && hasEnemyUnits(tid, attackerPower));
  }

  function validateMove(u, fromId, toId, phase) {
    const fromT = territoryById(fromId);
    const toT = territoryById(toId);
    if (!fromT || !toT) return { ok:false, why:"Unknown space." };

    // adjacency (one step per click)
    const neigh = fromT.neighbors || [];
    if (!neigh.includes(toId)) return { ok:false, why:"Not adjacent." };

    const st = UNIT_STATS[u.type];
    if (!st) return { ok:false, why:"Unknown unit." };

    if (unitMoveLeft(u) < 1) return { ok:false, why:"No movement left." };

    // domain restrictions
    if (st.domain === "land") {
      if (toT.type !== "land") return { ok:false, why:"Land units can't enter sea." };
    } else if (st.domain === "sea") {
      if (toT.type !== "sea") return { ok:false, why:"Sea units can't enter land (use load/unload for transports)." };
    } else if (st.domain === "air") {
      // air can move anywhere (adjacent step)
    }

    // phase restrictions
    if (phase === "Noncombat Move") {
      // cannot enter hostile spaces
      if (isHostileSpace(toId, currentPower())) return { ok:false, why:"Noncombat can't enter hostile spaces." };
    }

    if (phase === "Combat Move") {
      // ok to enter hostile
      // but cannot move allied units into a battle they don't own (lite simplification)
      if (u.owner !== currentPower()) return { ok:false, why:"Combat moves: only the current power's units (Lite rule)." };
    }

    // stacking restrictions
    // - In Combat Move, entering a hostile space is allowed (that's how attacks are declared).
    // - Otherwise, stacks must be same-side.
    const destUnits = S.territories[toId].units;
    const enteringHostile = (phase === "Combat Move") && isHostileSpace(toId, currentPower());
    if (!enteringHostile) {
      for (const du of destUnits) {
        if (!canShareSpace(du.owner, u.owner)) {
          return { ok:false, why:"Can't stack with enemy units outside Combat Move." };
        }
      }
    }

    // Combat rule (Lite): once a unit enters a hostile space in Combat Move, it must stop.
    if (phase === "Combat Move" && u.flags?.enteredHostile) {
      return { ok:false, why:"This unit already entered a hostile space this phase." };
    }

    return { ok:true };
  }

  function moveUnit(u, fromId, toId, isCombatMove=false) {
    const fromSlot = S.territories[fromId];
    const toSlot = S.territories[toId];
    fromSlot.units = fromSlot.units.filter(x => x.id !== u.id);

    // mark origin for retreat + combat-entry stop rule
    if (isCombatMove) {
      u.from = fromId;
      u.flags.combatMoved = true;
      if (isHostileSpace(toId, currentPower())) {
        u.flags.enteredHostile = true;
      }
    }

    u.moved = (u.moved || 0) + 1;
    toSlot.units.push(u);
  }

  function chooseAutoCasualties(units, hits) {
    // Remove cheapest first; transports first; battleships take 2 hits.
    // Returns array of unit ids to apply hits to in order.
    const sorted = [...units].sort((a,b) => {
      const sa = UNIT_STATS[a.type];
      const sb = UNIT_STATS[b.type];
      const ta = (a.type === "trn") ? -1 : 0;
      const tb = (b.type === "trn") ? -1 : 0;
      if (ta !== tb) return ta - tb;
      const ca = sa?.cost ?? 999;
      const cb = sb?.cost ?? 999;
      if (ca !== cb) return ca - cb;
      return (a.hp || 1) - (b.hp || 1);
    });

    const picks = [];
    let remaining = hits;
    let i = 0;
    while (remaining > 0 && i < sorted.length) {
      picks.push(sorted[i].id);
      remaining -= 1;
      i += 1;
    }
    return picks;
  }

  function applyHitsAtLocation(tid, targetSide, hitCount, auto=true) {
    // targetSide is "Axis" or "Allies" for coalition defense in this Lite mode.
    const slot = S.territories[tid];
    const candidates = slot.units.filter(u => powerSide(u.owner) === targetSide);
    if (candidates.length === 0) return;

    const ids = auto ? chooseAutoCasualties(candidates, hitCount) : chooseAutoCasualties(candidates, hitCount); // placeholder for manual
    for (const uid of ids) {
      const u = slot.units.find(x => x.id === uid);
      if (!u) continue;
      u.hp = (u.hp || 1) - 1;
      if (u.hp <= 0) {
        // sunk/killed — remove unit
        slot.units = slot.units.filter(x => x.id !== uid);
      }
    }
  }

  function rollForSide(units, mode /* 'atk'|'def' */) {
    const rolls = [];
    let hits = 0;
    for (const u of units) {
      const st = UNIT_STATS[u.type];
      if (!st) continue;
      const target = (mode === "atk") ? st.atk : st.def;
      if (!target || target <= 0) {
        const r0 = die();
        rolls.push({ unit:u, roll:r0, hit:false, target:target||0 });
        continue;
      }
      const r = die();
      const hit = r <= target;
      if (hit) hits += 1;
      rolls.push({ unit:u, roll:r, hit, target });
    }
    return { hits, rolls };
  }

  function resolveBattle(battle, autoCasualties=true) {
    const tid = battle.tid;
    const p = battle.attacker;
    const attackerSide = powerSide(p);
    const defenderSide = attackerSide === "Axis" ? "Allies" : "Axis";

    const loc = S.territories[tid];
    // Attacker units: current power's units that were marked combatMoved into this location this turn
    const attackerUnits = loc.units.filter(u => u.owner === p && u.flags?.combatMoved);
    // Defender: all opposite-side units
    const defenderUnits = loc.units.filter(u => powerSide(u.owner) === defenderSide);

    if (attackerUnits.length === 0 || defenderUnits.length === 0) return { done:true, note:"No battle." };

    log(`Battle at ${territoryById(tid).name}: ${p} attacks (${attackerUnits.length}) vs ${defenderSide} defenders (${defenderUnits.length}).`);

    let rounds = 0;
    while (rounds < 20) {
      rounds += 1;
      const atk = rollForSide(attackerUnits, "atk");
      const def = rollForSide(defenderUnits, "def");

      const atkRollStr = atk.rolls.map(x => `${x.unit.type}:${x.roll}${x.hit?"✓":""}`).join(" ");
      const defRollStr = def.rolls.map(x => `${x.unit.type}:${x.roll}${x.hit?"✓":""}`).join(" ");
      log(`  Round ${rounds}: ATK hits=${atk.hits} [${atkRollStr}] | DEF hits=${def.hits} [${defRollStr}]`);

      applyHitsAtLocation(tid, defenderSide, atk.hits, autoCasualties);
      applyHitsAtLocation(tid, attackerSide, def.hits, autoCasualties);

      // refresh unit arrays (they may have died)
      const loc2 = S.territories[tid];
      const attackerUnits2 = loc2.units.filter(u => u.owner === p && u.flags?.combatMoved);
      const defenderUnits2 = loc2.units.filter(u => powerSide(u.owner) === defenderSide);

      if (attackerUnits2.length === 0 && defenderUnits2.length === 0) {
        log(`  Battle ends: mutual destruction at ${territoryById(tid).name}.`);
        break;
      }
      if (defenderUnits2.length === 0) {
        log(`  Battle ends: attacker wins at ${territoryById(tid).name}.`);
        break;
      }
      if (attackerUnits2.length === 0) {
        log(`  Battle ends: defender holds at ${territoryById(tid).name}.`);
        break;
      }

      // In this Lite build, we don't prompt for retreat; attackers fight on.
    }

    // Capture if land and attacker has surviving LAND units (not air-only)
    const t = territoryById(tid);
    if (t.type === "land") {
      const loc3 = S.territories[tid];
      const attackerLand = loc3.units.filter(u => u.owner === p && UNIT_STATS[u.type].domain === "land");
      const defenderAny = loc3.units.filter(u => powerSide(u.owner) !== powerSide(p));
      if (defenderAny.length === 0 && attackerLand.length > 0) {
        const prevOwner = loc3.owner;
        loc3.owner = p;
        log(`  Territory captured: ${t.name} now controlled by ${p} (was ${prevOwner ?? "None"}).`);
      } else if (defenderAny.length === 0 && attackerLand.length === 0) {
        log(`  No capture (air-only survivors) in ${t.name}.`);
      }
    }

    // clear combatMoved flags for units in this battle location (so they don't keep "attacking")
    const loc4 = S.territories[tid];
    for (const u of loc4.units) {
      if (u.owner === p) u.flags.combatMoved = false;
    }

    return { done:true };
  }

  function rebuildBattlesAfterCombatMove() {
    const p = currentPower();
    const battles = [];
    for (const t of MAP) {
      const loc = S.territories[t.id];
      if (!loc.units.length) continue;
      const hasAtk = loc.units.some(u => u.owner === p && u.flags?.combatMoved);
      if (!hasAtk) continue;
      const hasDef = loc.units.some(u => powerSide(u.owner) !== powerSide(p));
      if (hasDef) battles.push({ tid: t.id, attacker: p });
    }
    S.battles = battles;
    if (battles.length) log(`Combat Move complete: ${battles.length} battle(s) queued.`);
  }


  function applyAutoCapturesForEmptyEnemyTerritories() {
    const p = currentPower();
    for (const t of MAP) {
      if (t.type !== "land") continue;
      const loc = S.territories[t.id];
      const owner = loc.owner;
      if (!owner) continue;
      if (powerSide(owner) === powerSide(p)) continue; // not enemy-controlled

      const hasAtk = loc.units.some(u => u.owner === p && u.flags?.combatMoved);
      if (!hasAtk) continue;

      const hasDef = loc.units.some(u => powerSide(u.owner) !== powerSide(p));
      if (hasDef) continue;

      const attackerLand = loc.units.filter(u => u.owner === p && UNIT_STATS[u.type].domain === "land");
      if (!attackerLand.length) continue;

      const prevOwner = loc.owner;
      loc.owner = p;
      // clear combatMoved so they don't keep counting as "attacking"
      for (const u of loc.units) if (u.owner === p) u.flags.combatMoved = false;
      log(`Unopposed capture: ${t.name} now controlled by ${p} (was ${prevOwner}).`);
    }
  }


  function enforceAirLanding() {
    // Lite: if an air unit ends in enemy land, destroy it.
    // If it ends in sea, require enough friendly carriers (each CV carries 2 fighters; bombers cannot land at sea).
    const p = currentPower();
    const side = powerSide(p);

    // compute carrier capacity by sea zone
    for (const t of MAP) {
      const loc = S.territories[t.id];
      if (!loc.units.length) continue;

      const airHere = loc.units.filter(u => UNIT_STATS[u.type].domain === "air");
      if (!airHere.length) continue;

      if (t.type === "land") {
        if (loc.owner && powerSide(loc.owner) !== side) {
          // hostile land: destroy all air
          for (const u of airHere) {
            loc.units = loc.units.filter(x => x.id !== u.id);
            log(`Air unit ${u.type} (${u.owner}) destroyed (cannot end turn in hostile territory: ${t.name}).`);
          }
        }
      } else {
        // sea
        const bombers = airHere.filter(u => u.type === "bmb");
        for (const u of bombers) {
          loc.units = loc.units.filter(x => x.id !== u.id);
          log(`Bomber (${u.owner}) destroyed (Lite rule: bombers cannot land at sea) in ${t.name}.`);
        }
        const fighters = loc.units.filter(u => u.type === "ftr");
        if (fighters.length) {
          const carriers = loc.units.filter(u => u.type === "cv" && powerSide(u.owner) === side);
          const cap = carriers.reduce((a,c) => a + (UNIT_STATS[c.type].airCap||0), 0);
          if (fighters.length > cap) {
            const kill = fighters.length - cap;
            // destroy extras (arbitrary)
            const doomed = fighters.slice(0, kill);
            for (const u of doomed) {
              loc.units = loc.units.filter(x => x.id !== u.id);
              log(`Fighter (${u.owner}) destroyed (no carrier capacity) in ${t.name}.`);
            }
          }
        }
      }
    }
  }

  function checkVictoryIfAny(triggerPower) {
    const rule = VICTORY_RULES[S.victoryRule];
    const p = triggerPower;

    // capital control helpers
    const controls = (power, tid) => S.territories[tid].owner === power;

    // Allies win check (at end of Japan turn for long rule)
    if (rule.alliesWin.type === "capitals") {
      if (p === "Japan") {
        const ok = rule.alliesWin.mustHold.every(tid => powerSide(S.territories[tid].owner) === "Allies");
        if (ok) return { winner:"Allies", reason:`Allies control required capitals (${rule.alliesWin.mustHold.join(", ")}).` };
      }
    }
    if (rule.alliesWin.type === "capitalsAny1") {
      if (p === "Japan") {
        const ok = rule.alliesWin.enemyCapitals.some(tid => powerSide(S.territories[tid].owner) === "Allies");
        if (ok) return { winner:"Allies", reason:`Allies captured an Axis capital.` };
      }
    }

    // Axis win checks (at end of USA turn for 1941-style rule)
    if (rule.axisWin.type === "capitalsAny2") {
      if (p === "USA") {
        const held = rule.axisWin.alliedCapitals.filter(tid => powerSide(S.territories[tid].owner) === "Axis");
        if (held.length >= 2) return { winner:"Axis", reason:`Axis controls two Allied capitals (${held.join(", ")}).` };
      }
    }
    if (rule.axisWin.type === "capitalsAny1") {
      if (p === "USA") {
        const ok = rule.axisWin.enemyCapitals.some(tid => powerSide(S.territories[tid].owner) === "Axis");
        if (ok) return { winner:"Axis", reason:`Axis captured an Allied capital.` };
      }
    }

    // Optional Pacific-style VP mode (Japan only, simplified):
    // - Japan gains floor(income/10) VPs at end of its turn (turn-by-turn).
    // - Japan wins if VP >= 22.
    // - Allies win if Japan gains 0 VP on Japan turn (i.e., income <= 9).
    if (S.vpMode && p === "Japan") {
      if (S.vpJapan >= 22) return { winner:"Axis", reason:`Japan reached 22 victory points.` };
      // We track last gain in S._lastJapanVPGain
      if ((S._lastJapanVPGain || 0) === 0) return { winner:"Allies", reason:`Japan gained 0 VP this turn (income <= 9).` };
    }

    return null;
  }

  // ---------- UI: territory panel ----------
  function renderTerritoryPanel(tid) {
    const el = $("#panel-territory");
    if (!tid) {
      el.innerHTML = `<div class="muted">Click a territory on the map.</div>`;
      return;
    }
    const t = territoryById(tid);
    const slot = S.territories[tid];
    const owner = slot.owner || "—";
    const units = slot.units;

    const income = (t.type === "land") ? `${t.ipc} IPC` : "—";
    const factory = (t.type === "land" && isFactory(tid)) ? "Yes" : "No";
    const cap = t.capital ? `Capital of ${t.capital}` : "—";

    el.innerHTML = `
      <div class="kv">
        <b>Name</b><div>${t.name}</div>
        <b>Type</b><div>${t.type}</div>
        <b>Owner</b><div>${owner}</div>
        <b>Income</b><div>${income}</div>
        <b>Factory</b><div>${factory}</div>
        <b>Capital</b><div>${cap}</div>
      </div>
      <div class="units">
        ${renderUnitsList(units)}
      </div>
      <div class="muted" style="margin-top:10px">
        Neighbors: ${(t.neighbors||[]).map(n => territoryById(n)?.name || n).join(", ")}
      </div>
    `;
  }

  function renderUnitsList(units) {
    if (!units.length) return `<div class="muted">No units.</div>`;
    const byOwner = groupBy(units, u => u.owner);
    const rows = [];
    for (const [owner, list] of byOwner.entries()) {
      const byType = groupBy(list, u => u.type);
      const parts = [];
      for (const [type, tl] of byType.entries()) parts.push(`${type}×${tl.length}`);
      rows.push(`
        <div class="unit-row">
          <div class="l"><span class="badge">${owner.slice(0,2).toUpperCase()}</span> <b>${owner}</b></div>
          <div>${parts.join("  ")}</div>
        </div>
      `);
    }
    return rows.join("");
  }

  // ---------- UI: purchase ----------
  function renderPurchaseUI() {
    const p = currentPower();
    const phase = currentPhase();
    const wrap = $("#purchase-ui");
    if (phase !== "Purchase") {
      wrap.innerHTML = `<div class="muted">Not in Purchase phase.</div>`;
      return;
    }
    const funds = S.ipc[p];

    const purch = Object.entries(UNIT_STATS)
      .filter(([k, st]) => st.cost > 0)
      .sort((a,b) => a[1].cost - b[1].cost);

    const lines = purch.map(([type, st]) => {
      return `
        <div class="purch-item">
          <div class="name">
            <span class="badge">${type.toUpperCase()}</span>
            <div>
              <div><b>${st.name}</b> <span class="muted">(${type})</span></div>
              <div class="small">Cost ${st.cost} • A${st.atk} D${st.def} • Move ${st.move} • ${st.domain}</div>
            </div>
          </div>
          <input type="number" min="0" value="0" data-buy="${type}" />
        </div>
      `;
    }).join("");

    wrap.innerHTML = `
      <div class="kv">
        <b>Funds</b><div><span class="pill">${funds} IPC</span></div>
        <b>Queue</b><div class="muted">${(S.purchases[p]||[]).map(x => `${x.type}×${x.count}`).join(", ") || "—"}</div>
      </div>
      <div class="purch-grid">${lines}</div>
      <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap">
        <button class="btn" id="btn-buy">Buy Selected</button>
        <button class="btn" id="btn-clear-buy">Clear Queue</button>
        <select id="sel-victory-rule" title="Victory condition preset">
          <option value="long">Victory: ${VICTORY_RULES.long.name}</option>
          <option value="short">Victory: ${VICTORY_RULES.short.name}</option>
        </select>
      </div>
      <div class="muted" style="margin-top:8px">
        Lite rule: purchases are placed during Mobilize in your <b>factory</b> territories (capitals only in this scenario).
      </div>
    `;

    $("#sel-victory-rule").value = S.victoryRule;

    $("#btn-buy").onclick = () => {
      const inputs = [...wrap.querySelectorAll("input[data-buy]")];
      const wants = inputs
        .map(inp => ({ type: inp.dataset.buy, count: parseInt(inp.value || "0", 10) }))
        .filter(x => x.count > 0);

      let cost = 0;
      for (const w of wants) cost += UNIT_STATS[w.type].cost * w.count;
      if (cost > S.ipc[p]) {
        log(`Purchase denied: need ${cost} IPC, have ${S.ipc[p]}.`);
        return;
      }

      S.ipc[p] -= cost;
      const q = S.purchases[p] || [];
      for (const w of wants) {
        const ex = q.find(x => x.type === w.type);
        if (ex) ex.count += w.count;
        else q.push({ type: w.type, count: w.count });
      }
      S.purchases[p] = q;
      log(`${p} purchased ${wants.map(w => `${w.type}×${w.count}`).join(", ")} for ${cost} IPC.`);
      renderPurchaseUI();
      draw();
      updateTopbar();
    };

    $("#btn-clear-buy").onclick = () => {
      // Refund queue (Lite convenience)
      const q = S.purchases[p] || [];
      let refund = 0;
      for (const it of q) refund += UNIT_STATS[it.type].cost * it.count;
      S.ipc[p] += refund;
      S.purchases[p] = [];
      log(`${p} cleared purchase queue (refunded ${refund} IPC).`);
      renderPurchaseUI();
      draw();
      updateTopbar();
    };

    $("#sel-victory-rule").onchange = (e) => {
      S.victoryRule = e.target.value;
      log(`Victory preset set: ${VICTORY_RULES[S.victoryRule].name}`);
    };
  }

  // ---------- UI: dialogs ----------
  const dlg = $("#dlg");
  function showDialog(title, bodyHTML, actions /* [{label, cls, fn}] */) {
    $("#dlg-title").textContent = title;
    $("#dlg-body").innerHTML = bodyHTML;
    const act = $("#dlg-actions");
    act.innerHTML = "";
    for (const a of actions) {
      const b = document.createElement("button");
      b.className = `btn ${a.cls || ""}`.trim();
      b.textContent = a.label;
      b.onclick = () => { try { a.fn?.(); } finally { dlg.close(); } };
      act.appendChild(b);
    }
    dlg.showModal();
  }

  function promptUnitSelection(tid, mode /* move|load|unload */, cb /* (unitIds)=>void */) {
    const p = currentPower();
    const phase = currentPhase();
    const loc = S.territories[tid];
    const t = territoryById(tid);

    let candidates = loc.units;

    if (mode === "move") {
      // In Combat Move, only current power's units (Lite simplification)
      if (phase === "Combat Move") candidates = candidates.filter(u => u.owner === p);
      // In Noncombat, allow current power + same side units (still hotseat; but keep simple)
      if (phase === "Noncombat Move") candidates = candidates.filter(u => powerSide(u.owner) === powerSide(p));
      // No purchases etc.
    }

    if (mode === "load") {
      // choose land units on this territory
      candidates = candidates.filter(u => UNIT_STATS[u.type].domain === "land" && powerSide(u.owner) === powerSide(p));
    }

    if (candidates.length === 0) {
      log(`No selectable units at ${t.name} for mode=${mode}.`);
      return;
    }

    const rows = candidates.map(u => {
      const st = UNIT_STATS[u.type];
      return `
        <label style="display:flex; gap:10px; align-items:center; padding:6px 0">
          <input type="checkbox" data-unit="${u.id}" />
          <span class="badge">${u.type.toUpperCase()}</span>
          <span><b>${st.name}</b> <span class="small">(${u.owner})</span></span>
          <span class="small" style="margin-left:auto">Move left: ${unitMoveLeft(u)}</span>
        </label>
      `;
    }).join("");

    showDialog(
      `Select Units — ${t.name}`,
      `<div class="small">Mode: <b>${mode}</b> • Phase: <b>${phase}</b></div><hr/>${rows}`,
      [
        { label:"Cancel", cls:"", fn:()=>{} },
        { label:"Select", cls:"", fn:() => {
            const ids = [...$("#dlg-body").querySelectorAll("input[data-unit]:checked")]
              .map(x => x.dataset.unit);
            cb(ids);
          }
        },
      ]
    );
  }

  // ---------- actions: moves / transports ----------
  function startMoveFrom(tid) {
    S.move.source = tid;
    S.move.pending = null;
    $("#hud-source").textContent = territoryById(tid).name;
    $("#hud-target").textContent = "—";
  }

  function startPendingMove(unitIds, mode) {
    S.move.pending = { unitIds, mode };
    $("#hud-tip").textContent = `Now click a destination for ${unitIds.length} unit(s).`;
  }

  function executePendingMove(toId) {
    const phase = currentPhase();
    const fromId = S.move.source;
    if (!fromId || !S.move.pending) return;

    const pending = S.move.pending;
    const fromT = territoryById(fromId);
    const toT = territoryById(toId);

    // Apply for each unit
    const fromSlot = S.territories[fromId];
    const movedUnits = [];
    for (const uid of pending.unitIds) {
      const u = fromSlot.units.find(x => x.id === uid);
      if (!u) continue;
      const v = validateMove(u, fromId, toId, phase);
      if (!v.ok) { log(`Move blocked: ${v.why}`); continue; }
      moveUnit(u, fromId, toId, phase === "Combat Move");
      movedUnits.push(u);
    }

    if (movedUnits.length) {
      log(`${currentPower()} moved ${movedUnits.map(u=>u.type).join(", ")} from ${fromT.name} to ${toT.name}.`);
    }

    // If combat move into hostile, keep combatMoved flags; battles built when leaving Combat Move
    // Clear move selection
    S.move.pending = null;
    $("#hud-target").textContent = territoryById(toId).name;
    $("#hud-tip").textContent = "Move complete. Select more units or End Phase.";

    renderTerritoryPanel(S.selected);
    draw();
    updateTopbar();
  }

  function findTransportAtSeaZone(seaId, side) {
    const loc = S.territories[seaId];
    return loc.units.filter(u => u.type === "trn" && powerSide(u.owner) === side);
  }

  function loadToTransport(landId, seaId, unitIds) {
    const p = currentPower();
    const side = powerSide(p);
    const landT = territoryById(landId);
    const seaT = territoryById(seaId);
    const landSlot = S.territories[landId];
    const seaSlot = S.territories[seaId];

    // validate adjacency
    if (!(landT.neighbors||[]).includes(seaId)) { log("Load blocked: not adjacent."); return; }
    if (seaT.type !== "sea") { log("Load blocked: target is not sea."); return; }

    const transports = findTransportAtSeaZone(seaId, side);
    if (!transports.length) { log("Load blocked: no friendly transport in that sea zone."); return; }

    // choose first transport with space
    let tr = null;
    for (const t of transports) {
      const cap = UNIT_STATS[t.type].capacity || 0;
      if ((t.cargo?.length || 0) < cap) { tr = t; break; }
    }
    if (!tr) { log("Load blocked: all transports full."); return; }

    const canLoad = unitIds
      .map(uid => landSlot.units.find(u => u.id === uid))
      .filter(u => u && UNIT_STATS[u.type].domain === "land" && powerSide(u.owner) === side);

    let loaded = 0;
    for (const u of canLoad) {
      const cap = UNIT_STATS[tr.type].capacity || 0;
      if ((tr.cargo.length) >= cap) break;
      landSlot.units = landSlot.units.filter(x => x.id !== u.id);
      tr.cargo.push(u);
      loaded += 1;
    }

    if (loaded) log(`${p} loaded ${loaded} unit(s) onto a transport in ${seaT.name}.`);
    else log("Load: nothing loaded.");

    draw(); renderTerritoryPanel(S.selected);
  }

  function unloadFromTransport(seaId, landId) {
    const p = currentPower();
    const side = powerSide(p);
    const seaT = territoryById(seaId);
    const landT = territoryById(landId);
    const seaSlot = S.territories[seaId];
    const landSlot = S.territories[landId];

    if (!(seaT.neighbors||[]).includes(landId)) { log("Unload blocked: not adjacent."); return; }
    if (landT.type !== "land") { log("Unload blocked: target is not land."); return; }

    // pick first transport with cargo
    const transports = seaSlot.units.filter(u => u.type === "trn" && powerSide(u.owner) === side && (u.cargo?.length||0) > 0);
    if (!transports.length) { log("Unload blocked: no friendly loaded transport here."); return; }
    const tr = transports[0];

    // Noncombat: cannot unload into hostile land (Lite). Combat: allowed, triggers battle.
    const phase = currentPhase();
    if (phase === "Noncombat Move") {
      if (isEnemyLand(landId, p)) { log("Unload blocked: cannot unload into hostile land in Noncombat."); return; }
      if (hasEnemyUnits(landId, p)) { log("Unload blocked: enemy units present."); return; }
    }

    // Offload all cargo
    const cargo = tr.cargo.splice(0, tr.cargo.length);
    for (const u of cargo) {
      // Offloaded units are considered "moved" if the transport moved; we ignore that for Lite.
      landSlot.units.push(u);
      // If unloading as combat into hostile, mark as combatMoved so the battle builder picks it up
      if (phase === "Combat Move" && isHostileSpace(landId, p)) {
        u.flags.combatMoved = true;
        u.from = seaId;
      }
    }

    log(`${p} unloaded ${cargo.length} unit(s) from transport to ${landT.name}.`);

    draw(); renderTerritoryPanel(S.selected);
  }

  // ---------- phase transitions ----------
  function endPhase() {
    const p = currentPower();
    const phase = currentPhase();

    if (phase === "Combat Move") {
      rebuildBattlesAfterCombatMove();
      applyAutoCapturesForEmptyEnemyTerritories();
    }

    if (phase === "Conduct Combat") {
      if (S.battles.length) {
        log("You still have unresolved battles. Click 'Resolve Battles' or End Phase to auto-resolve.");
        // Auto resolve all if user insists (advance anyway)
        for (const b of [...S.battles]) resolveBattle(b, $("#chk-auto-casualties").checked);
        S.battles = [];
      }
    }

    if (phase === "Noncombat Move") {
      enforceAirLanding();
    }

    if (phase === "Mobilize") {
      // Place queued purchases if any
      const q = S.purchases[p] || [];
      if (q.length) {
        const factories = listFactories(p);
        if (!factories.length) {
          log(`${p} has no factories to place new units. Purchases remain queued.`);
        } else {
          // auto place everything in first factory (capital), Lite convenience
          const target = factories[0];
          const slot = S.territories[target];
          let placed = 0;
          for (const it of q) {
            for (let i = 0; i < it.count; i++) {
              slot.units.push(makeUnit(it.type, p));
              placed += 1;
            }
          }
          S.purchases[p] = [];
          log(`${p} mobilized ${placed} new unit(s) in ${territoryById(target).name}.`);
        }
      }
    }

    if (phase === "Collect Income") {
      const inc = computeIncome(p);
      S.ipc[p] += inc;
      log(`${p} collects ${inc} IPC.`);

      // VP mode (Japan only)
      if (S.vpMode && p === "Japan") {
        const gain = Math.floor(inc / 10);
        S._lastJapanVPGain = gain;
        S.vpJapan += gain;
        log(`Japan VP gain this turn: ${gain} (total VP=${S.vpJapan}).`);
      }

      // Victory check after income (matches several variants' timing)
      const v = checkVictoryIfAny(p);
      if (v) {
        showDialog(
          `Game Over — ${v.winner} Win`,
          `<div><b>${v.winner}</b> wins.</div><div class="small" style="margin-top:8px">${v.reason}</div>`,
          [
            { label:"OK", cls:"", fn:()=>{} },
            { label:"Reset", cls:"danger", fn:()=>{ S = defaultState(); syncAll(); } },
          ]
        );
        log(`GAME OVER: ${v.winner} wins. (${v.reason})`);
      }

      // next power
      S.phaseIndex = 0;
      S.turnIndex = (S.turnIndex + 1) % TURN_ORDER.length;
      if (S.turnIndex === 0) S.round += 1;
      resetUnitsForNewTurn(currentPower());
      syncAll();
      return;
    }

    // advance phase
    S.phaseIndex = (S.phaseIndex + 1) % PHASES.length;
    syncAll();
  }

  // ---------- battles UI ----------
  function resolveAllBattles() {
    const phase = currentPhase();
    if (phase !== "Conduct Combat") {
      log("Resolve Battles is intended for Conduct Combat phase.");
    }
    if (!S.battles.length) { log("No battles to resolve."); return; }

    const auto = $("#chk-auto-casualties").checked;
    for (const b of [...S.battles]) resolveBattle(b, auto);
    S.battles = [];
    log("All queued battles resolved.");
    syncAll();
  }

  // ---------- rendering ----------
  const canvas = $("#map");
  const ctx = canvas.getContext("2d");

  function draw() {
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0,0,w,h);

    // background stars
    ctx.globalAlpha = 0.25;
    for (let i=0;i<120;i++){
      const x = (Math.sin(i*999) * 0.5 + 0.5) * w;
      const y = (Math.cos(i*777) * 0.5 + 0.5) * h;
      ctx.fillStyle = "white";
      ctx.fillRect(x,y,1,1);
    }
    ctx.globalAlpha = 1;

    // draw territories
    for (const t of MAP) {
      const slot = S.territories[t.id];

      // fill
      if (t.type === "sea") {
        ctx.fillStyle = "rgba(30, 58, 138, 0.22)";
      } else {
        const o = slot.owner;
        if (o) {
          const col = POWERS[o]?.color || "#475569";
          ctx.fillStyle = col + "33";
        } else {
          ctx.fillStyle = "rgba(148,163,184,0.12)";
        }
      }

      // border
      ctx.strokeStyle = "rgba(148,163,184,0.35)";
      ctx.lineWidth = 1;

      roundRect(ctx, t.x, t.y, t.w, t.h, 14, true, true);

      // selection highlight
      if (S.selected === t.id) {
        ctx.strokeStyle = "rgba(125,211,252,0.95)";
        ctx.lineWidth = 2;
        roundRect(ctx, t.x+1, t.y+1, t.w-2, t.h-2, 14, false, true);
      }

      // label
      ctx.fillStyle = "rgba(226,232,240,0.9)";
      ctx.font = "12px ui-sans-serif, system-ui";
      ctx.fillText(t.name, t.x+10, t.y+18);

      // IPC value for land
      if (t.type === "land") {
        ctx.fillStyle = "rgba(226,232,240,0.75)";
        ctx.font = "11px ui-sans-serif, system-ui";
        ctx.fillText(`IPC ${t.ipc}`, t.x+10, t.y+34);
      }

      // factory marker
      if (t.type === "land" && isFactory(t.id)) {
        ctx.fillStyle = "rgba(226,232,240,0.85)";
        ctx.font = "11px ui-sans-serif, system-ui";
        ctx.fillText("🏭", t.x + t.w - 26, t.y + 18);
      }

      // unit summary
      const u = slot.units;
      if (u.length) {
        // quick stacked counts by owner (first 2 groups)
        const by = groupBy(u, x => x.owner);
        let y = t.y + t.h - 10;
        let shown = 0;
        for (const [owner, list] of by.entries()) {
          const col = POWERS[owner]?.color || "#94a3b8";
          ctx.fillStyle = col;
          ctx.globalAlpha = 0.9;
          ctx.fillRect(t.x+10, y-10, 10, 10);
          ctx.globalAlpha = 1;
          ctx.fillStyle = "rgba(226,232,240,0.85)";
          ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
          ctx.fillText(`${owner}:${list.length}`, t.x+24, y-1);
          y -= 14;
          shown += 1;
          if (shown >= 2) break;
        }
        if (u.length > 0 && by.size > 2) {
          ctx.fillStyle = "rgba(226,232,240,0.7)";
          ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
          ctx.fillText(`+${by.size-2} sides`, t.x+10, t.y + t.h - 44);
        }
      }
    }

    // top-left status box
    ctx.fillStyle = "rgba(2,6,23,0.65)";
    ctx.strokeStyle = "rgba(148,163,184,0.25)";
    roundRect(ctx, 14, 14, 330, 86, 14, true, true);
    ctx.fillStyle = "rgba(226,232,240,0.9)";
    ctx.font = "12px ui-sans-serif, system-ui";
    ctx.fillText(`Power: ${currentPower()} (${powerSide(currentPower())})`, 26, 38);
    ctx.fillText(`Phase: ${currentPhase()}`, 26, 56);
    ctx.fillText(`Round: ${S.round}`, 26, 74);
    if (S.vpMode) ctx.fillText(`VP (Japan): ${S.vpJapan}`, 26, 92);
  }

  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    const rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr, y);
    ctx.arcTo(x+w, y, x+w, y+h, rr);
    ctx.arcTo(x+w, y+h, x, y+h, rr);
    ctx.arcTo(x, y+h, x, y, rr);
    ctx.arcTo(x, y, x+w, y, rr);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  function pickTerritoryAt(px, py) {
    for (let i=MAP.length-1;i>=0;i--){
      const t = MAP[i];
      if (px>=t.x && px<=t.x+t.w && py>=t.y && py<=t.y+t.h) return t.id;
    }
    return null;
  }

  // ---------- topbar / HUD ----------
  function updateTopbar() {
    const p = currentPower();
    $("#pill-round").textContent = `Round: ${S.round}`;
    $("#pill-power").textContent = `Power: ${p}`;
    $("#pill-phase").textContent = `Phase: ${currentPhase()}`;
    $("#pill-ipc").textContent = `IPC: ${S.ipc[p]}`;

    $("#chk-vp-mode").checked = S.vpMode;
  }

  function syncHUD() {
    $("#hud-source").textContent = S.move.source ? territoryById(S.move.source).name : "—";
    $("#hud-target").textContent = "—";
  }

  // ---------- persistence ----------
  function saveLocal() {
    localStorage.setItem("aalite_state", JSON.stringify(S));
    log("Saved to localStorage.");
  }
  function loadLocal() {
    const raw = localStorage.getItem("aalite_state");
    if (!raw) { log("No saved game found."); return; }
    try {
      S = JSON.parse(raw);
      // defensive defaults
      S.history = S.history || [];
      log("Loaded from localStorage.");
      syncAll(true);
    } catch(e) {
      log("Load failed: " + e.message);
    }
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(S, null, 2)], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "axis_and_allies_lite_save.json";
    a.click();
    URL.revokeObjectURL(url);
    log("Exported JSON save.");
  }

  function importJSON() {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "application/json";
    inp.onchange = () => {
      const f = inp.files?.[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          S = JSON.parse(r.result);
          S.history = S.history || [];
          log("Imported JSON save.");
          syncAll(true);
        } catch(e) {
          log("Import failed: " + e.message);
        }
      };
      r.readAsText(f);
    };
    inp.click();
  }

  // ---------- help ----------
  function showHelp() {
    showDialog(
      "Quick Rules (Lite)",
      `
      <div>
        <div><b>What this is:</b> a simplified, fan-made A&A-like hotseat game with an abstract map and a “core loop” of Purchase → Move → Combat → Place → Income.</div>
        <hr/>
        <div class="small">
          <b>Turn phases:</b> ${PHASES.join(" → ")}.<br/>
          <b>Movement:</b> set Mode=Move, click a source, pick units, then click a destination (one step per click).<br/>
          <b>Combat:</b> in Combat Move you may enter hostile spaces; click <b>Resolve Battles</b> in Conduct Combat.<br/>
          <b>Factories:</b> capitals have 🏭. Purchases auto-place to your first available factory in Mobilize (Lite convenience).<br/>
          <b>Victory:</b> choose long/short preset in Purchase. (Long: Allies must hold Berlin+Tokyo at end of Japan turn; Axis must hold any two Allied capitals at end of USA turn.)<br/>
          <b>Optional VP mode:</b> enable “Pacific-style VP mode” (Japan gains floor(income/10) VPs each Japan turn; end-of-turn win checks).<br/>
        </div>
        <hr/>
        <div class="small">
          <b>Deliberate simplifications:</b> no surprise strikes, no AA fire, no complex air return paths, no retreats UI. This keeps the code compact and hackable.
        </div>
      </div>
      `,
      [
        { label:"Close", cls:"", fn:()=>{} },
      ]
    );
  }

  // ---------- events ----------
  canvas.addEventListener("click", (ev) => {
    const rect = canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left) * (canvas.width / rect.width);
    const y = (ev.clientY - rect.top) * (canvas.height / rect.height);
    const tid = pickTerritoryAt(x, y);
    if (!tid) return;

    S.selected = tid;
    renderTerritoryPanel(tid);

    const mode = $("#mode").value;

    if (mode === "select") {
      // nothing else
      draw();
      return;
    }

    if (!S.move.source) {
      startMoveFrom(tid);
      $("#hud-tip").textContent = `Source selected. Choose units (click again or select another territory).`;
      draw();
      return;
    }

    // If source chosen and pending exists, treat click as destination for move/unload
    if (S.move.pending) {
      if (S.move.pending.mode === "move") {
        executePendingMove(tid);
      } else if (S.move.pending.mode === "load") {
        // pending stores land unit ids; destination should be a sea zone adjacent to the land source
        loadToTransport(S.move.source, tid, S.move.pending.unitIds);
        S.move.pending = null;
      }
      draw();
      return;
    }

    // Source chosen but no pending: depending on mode, prompt unit selection or unload.
    if (mode === "move") {
      const src = S.move.source;
      promptUnitSelection(src, "move", (ids) => startPendingMove(ids, "move"));
    } else if (mode === "load") {
      const src = S.move.source; // should be land
      if (!isLand(src)) { log("Load mode: source must be land."); return; }
      promptUnitSelection(src, "load", (ids) => startPendingMove(ids, "load"));
      $("#hud-tip").textContent = "Now click an adjacent sea zone with a friendly transport.";
    } else if (mode === "unload") {
      const src = S.move.source; // should be sea
      if (!isSea(src)) { log("Unload mode: source must be sea."); return; }
      unloadFromTransport(src, tid);
    }

    draw();
  });

  $("#mode").addEventListener("change", () => {
    S.move.source = null;
    S.move.pending = null;
    syncHUD();
    $("#hud-tip").textContent = "Mode changed. Click a territory to select source or inspect.";
  });

  $("#btn-end-phase").onclick = endPhase;
  $("#btn-resolve").onclick = resolveAllBattles;
  $("#btn-help").onclick = showHelp;

  $("#chk-vp-mode").onchange = (e) => {
    S.vpMode = !!e.target.checked;
    log(`VP mode: ${S.vpMode ? "ON" : "OFF"}.`);
    draw(); updateTopbar();
  };

  $("#btn-save").onclick = saveLocal;
  $("#btn-load").onclick = loadLocal;
  $("#btn-export").onclick = exportJSON;
  $("#btn-import").onclick = importJSON;
  $("#btn-reset").onclick = () => {
    showDialog(
      "Reset Game?",
      `<div class="small">This will clear current state (local save remains unless you overwrite it).</div>`,
      [
        { label:"Cancel", cls:"", fn:()=>{} },
        { label:"Reset", cls:"danger", fn:()=>{ S = defaultState(); syncAll(true); log("Game reset."); } },
      ]
    );
  };

  // ---------- sync ----------
  function syncAll(rebuildLog=false) {
    updateTopbar();
    if (rebuildLog) resetLogFromState();
    renderPurchaseUI();
    renderTerritoryPanel(S.selected);
    syncHUD();
    draw();
  }

  // initial
  log("Game initialized. Choose a territory to inspect, then play USSR → Germany → UK → Japan → USA.");
  resetUnitsForNewTurn(currentPower());
  syncAll(true);

})();
