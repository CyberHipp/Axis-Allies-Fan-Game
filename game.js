// Axis & Allies 1942.2 prototype with basic state machine, combat, and save/load
(() => {
  'use strict';

  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const boardImg = document.getElementById('boardImg');

  const PHASES = [
    'Purchase',
    'Combat Move',
    'Conduct Combat',
    'Noncombat Move',
    'Mobilize',
    'Collect Income',
  ];

  const POWER_COLORS = {
    Soviet: '#ef4444',
    Germany: '#f59e0b',
    UK: '#22c55e',
    Japan: '#e11d48',
    USA: '#60a5fa',
  };

  const SIDE = { Soviet: 'Allies', Germany: 'Axis', UK: 'Allies', Japan: 'Axis', USA: 'Allies' };

  const SEA_UNITS = new Set(['destroyer', 'sub', 'cruiser', 'carrier', 'battleship', 'transport']);
  const AIR_UNITS = new Set(['fighter', 'bomber']);

  const CARGO_CAPACITY = 2; // per transport

  const STORAGE_KEY = 'aa1942-save';

  const state = createInitialState();
  let rng = makeRng(state.rngSeed);

  function createInitialState() {
    const ownership = {};
    Object.entries(AA.map.territories).forEach(([tid, t]) => ownership[tid] = t.owner || null);
    const stacks = {};
    Object.entries(AA.setup.stacks).forEach(([tid, perPower]) => stacks[tid] = deepCopy(perPower));
    return {
      started: false,
      victoryMode: null,
      round: 1,
      powerIndex: 0,
      phaseIndex: 0,
      selected: null,
      ownership,
      stacks,
      purchases: {},
      pendingBattles: [],
      embarked: {},
      movePool: {},
      rngSeed: 1,
      log: [],
      view: { x: 0, y: 0, scale: 0.35 },
      ipc: deepCopy(AA.setup.ipc),
    };
  }

  function deepCopy(x) { return JSON.parse(JSON.stringify(x)); }

  function makeRng(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      s >>>= 0;
      state.rngSeed = s;
      return s;
    };
  }

  function rollDie() { return (rng() % 6) + 1; }
  function rollMany(count) { const res = []; for (let i = 0; i < count; i++) res.push(rollDie()); return res; }

  function log(msg) {
    const line = `[R${state.round} ${activePower()} ${PHASES[state.phaseIndex]}] ${msg}`;
    state.log.push(line);
    const el = document.getElementById('log');
    const div = document.createElement('div');
    div.className = 'line';
    div.textContent = line;
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  }

  function activePower() { return AA.setup.turnOrder[state.powerIndex]; }

  function polygonContains(pt, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      const intersect = ((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi + 1e-6) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function screenToWorld(x, y) {
    return { x: (x - state.view.x) / state.view.scale, y: (y - state.view.y) / state.view.scale };
  }

  function drawTerritoryOutline(poly, color, lineWidth = 2, dash = []) {
    ctx.save();
    ctx.beginPath();
    poly.forEach((p, idx) => { if (idx === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(dash);
    ctx.stroke();
    ctx.restore();
  }

  function centerOfPolygon(poly) {
    let x = 0, y = 0; poly.forEach(p => { x += p[0]; y += p[1]; }); return { x: x / poly.length, y: y / poly.length };
  }

  function render() {
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(state.view.x, state.view.y);
    ctx.scale(state.view.scale, state.view.scale);

    if (boardImg.complete) ctx.drawImage(boardImg, 0, 0, AA.map.width, AA.map.height);

    Object.entries(AA.map.territories).forEach(([tid, t]) => {
      const color = t.type === 'land' ? 'rgba(125, 211, 252, 0.6)' : 'rgba(148, 163, 184, 0.5)';
      drawTerritoryOutline(t.polygon, color, 2);
      if (state.selected === tid) drawTerritoryOutline(t.polygon, '#f59e0b', 4, [6, 6]);
      if (state.hovered === tid) drawTerritoryOutline(t.polygon, '#a855f7', 3, [4, 4]);
      if (state.pendingBattles.find(b => b.territoryId === tid)) drawTerritoryOutline(t.polygon, '#ef4444', 3, [2, 3]);
      if (state.selected && t.neighbors?.includes(state.selected)) drawTerritoryOutline(t.polygon, '#22c55e', 2, [2, 4]);
    });

    Object.entries(state.stacks).forEach(([tid, perPower]) => {
      const t = AA.map.territories[tid];
      if (!t) return;
      const center = centerOfPolygon(t.polygon);
      let offsetY = 0;
      Object.entries(perPower).forEach(([power, units]) => {
        const total = Object.values(units).reduce((a, b) => a + b, 0);
        if (total <= 0) return;
        ctx.save();
        ctx.fillStyle = POWER_COLORS[power] || '#fff';
        ctx.beginPath(); ctx.arc(center.x, center.y + offsetY, 18, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0b0f14';
        ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(total.toString(), center.x, center.y + offsetY);
        ctx.restore();
        offsetY += 26;
      });
    });

    ctx.restore();
  }

  function updateHUD(tid) {
    const t = tid ? AA.map.territories[tid] : null;
    document.getElementById('hud-selected').textContent = t ? t.name : '—';
    document.getElementById('hud-owner').textContent = t ? (state.ownership[tid] || 'Neutral') : '—';
    document.getElementById('hud-ipc').textContent = t ? (t.ipc ?? 0) : '—';
    document.getElementById('hud-neighbors').textContent = t ? t.neighbors.join(', ') : '—';
  }

  function renderUnitReference() {
    const panel = document.getElementById('panel-units');
    const rows = Object.entries(AA.units).map(([id, st]) => {
      const att = st.att ?? '—'; const def = st.def ?? '—'; const move = st.move ?? '—';
      return `<div class="unit-card"><div class="name">${id}</div><div class="stats">Cost ${st.cost} • Att ${att} • Def ${def} • Move ${move}</div></div>`;
    }).join('');
    panel.innerHTML = `<div class="unit-ref">${rows}</div>`;
  }

  function refreshPills() {
    document.getElementById('pill-round').textContent = `Round: ${state.round}`;
    document.getElementById('pill-power').textContent = `Power: ${activePower()}`;
    document.getElementById('pill-phase').textContent = `Phase: ${PHASES[state.phaseIndex]}`;
  }

  function currentPrompt() {
    const phase = PHASES[state.phaseIndex];
    if (phase === 'Combat Move') return 'Move units into hostile territories to queue battles.';
    if (phase === 'Conduct Combat') return 'Resolve pending battles (dice auto-roll).';
    if (phase === 'Noncombat Move') return 'Redeploy into friendly territories only.';
    if (phase === 'Mobilize') return 'Place purchased units onto owned land territories.';
    if (phase === 'Collect Income') return 'Income will be tallied automatically on Next Phase.';
    return 'Spend IPC to buy units.';
  }

  function updateTerritoryPanel(tid) {
    const panel = document.getElementById('panel-territory');
    if (!tid) { panel.innerHTML = '<div class="muted">Click a territory on the map.</div>'; return; }
    const t = AA.map.territories[tid];
    const owner = state.ownership[tid] || 'Neutral';
    const neighbors = t.neighbors.map(n => AA.map.territories[n]?.name || n).join(', ');
    const stack = state.stacks[tid] || {};
    const unitLines = Object.entries(stack).flatMap(([power, entries]) => Object.entries(entries).map(([type, count]) => `${power} ${type}×${count}`)).join(', ');

    const powerUnits = stack[activePower()] || {};
    const options = Object.entries(powerUnits).filter(([, c]) => c > 0).map(([type, count]) => `<option value="${type}">${type} (${count})</option>`).join('');
    const neighborButtons = t.neighbors.map(n => `<button class="btn tiny move-btn" data-target="${n}">Move → ${AA.map.territories[n]?.name || n}</button>`).join(' ');

    const phase = PHASES[state.phaseIndex];
    const purchaseList = (state.purchases[activePower()] || []).map(p => `${p.type}×${p.count}`).join(', ');
    const purchaseBlock = phase === 'Purchase'
      ? `<div class="kv"><b>Purchase</b><div>IPC: ${state.ipc[activePower()]}<br/><select id="buy-type">${unitOptions()}</select> <input id="buy-count" type="number" min="1" value="1" style="width:60px" /> <button class="btn tiny" id="btn-buy">Buy</button><div class="small">Queued: ${purchaseList || '—'}</div></div></div>`
      : '';
    const mobilizeBlock = phase === 'Mobilize'
      ? `<div class="kv"><b>Mobilize</b><div>${owner === activePower() && t.type === 'land' ? `<button class="btn tiny" id="btn-place" data-territory="${tid}">Place here</button>` : '<span class="muted">Own a land territory to place.</span>'}<div class="small">Remaining: ${purchaseList || '—'}</div></div></div>`
      : '';

    panel.innerHTML = `
      <div class="kv"><b>Prompt</b><div>${currentPrompt()}</div></div>
      <div class="kv"><b>Name</b><div>${t.name}</div></div>
      <div class="kv"><b>Type</b><div>${t.type}</div></div>
      <div class="kv"><b>Owner</b><div>${owner}</div></div>
      <div class="kv"><b>IPC</b><div>${t.ipc ?? 0}</div></div>
      <div class="kv"><b>Neighbors</b><div>${neighbors || '—'}</div></div>
      <div class="kv"><b>Units</b><div>${unitLines || '—'}</div></div>
      <div class="kv"><b>VC/Capital</b><div>${t.isVC ? 'VC' : ''} ${t.isCapital ? 'Capital' : ''}</div></div>
      <hr />
      <div class="kv"><b>Move</b><div>${options ? `<select id="move-unit-type">${options}</select> <input id="move-count" type="number" min="1" value="1" style="width:60px" />` : '<span class="muted">No units to move</span>'}</div></div>
      <div class="kv"><b>Targets</b><div>${neighborButtons || '—'}</div></div>
      ${purchaseBlock}
      ${mobilizeBlock}
    `;

    panel.querySelectorAll('.move-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const unitTypeEl = document.getElementById('move-unit-type');
        if (!unitTypeEl) { alert('No movable units owned by active power here.'); return; }
        const unitType = unitTypeEl.value;
        const count = Math.max(1, parseInt(document.getElementById('move-count').value, 10) || 1);
        performMove(tid, btn.dataset.target, unitType, count);
      });
    });

    const buyBtn = panel.querySelector('#btn-buy');
    if (buyBtn) {
      buyBtn.addEventListener('click', () => {
        const type = document.getElementById('buy-type').value;
        const count = Math.max(1, parseInt(document.getElementById('buy-count').value, 10) || 1);
        queuePurchase(type, count);
        updateTerritoryPanel(tid);
      });
    }

    const placeBtn = panel.querySelector('#btn-place');
    if (placeBtn) {
      placeBtn.addEventListener('click', () => {
        placePurchase(placeBtn.dataset.territory);
        updateTerritoryPanel(tid);
      });
    }
  }

  function selectTerritory(tid) {
    state.selected = tid;
    updateTerritoryPanel(tid);
    updateHUD(tid);
    render();
  }

  function ensureEmbarked(seaId, power) {
    state.embarked[seaId] = state.embarked[seaId] || {};
    state.embarked[seaId][power] = state.embarked[seaId][power] || {};
    return state.embarked[seaId][power];
  }

  function embarkedCount(seaId, power) {
    const pool = state.embarked[seaId]?.[power];
    if (!pool) return 0;
    return Object.values(pool).reduce((a, b) => a + b, 0);
  }

  function transportCapacity(seaId, power) {
    const transports = state.stacks[seaId]?.[power]?.transport || 0;
    return transports * CARGO_CAPACITY - embarkedCount(seaId, power);
  }

  function seaIsHostile(seaId, power) {
    const t = AA.map.territories[seaId];
    if (!t || t.type !== 'sea') return false;
    return Object.entries(state.stacks[seaId] || {}).some(([p, units]) => p !== power && Object.keys(units).length);
  }

  function moveCargo(fromSea, toSea, power) {
    const cargo = state.embarked[fromSea]?.[power];
    if (!cargo) return;
    const dest = ensureEmbarked(toSea, power);
    Object.entries(cargo).forEach(([type, count]) => {
      dest[type] = (dest[type] || 0) + count;
    });
    delete state.embarked[fromSea][power];
    if (!Object.keys(state.embarked[fromSea]).length) delete state.embarked[fromSea];
  }

  function consumeCargo(seaId, power, type, count) {
    const cargo = state.embarked[seaId]?.[power];
    if (!cargo || (cargo[type] || 0) < count) return false;
    cargo[type] -= count;
    if (cargo[type] <= 0) delete cargo[type];
    if (!Object.keys(cargo).length) delete state.embarked[seaId][power];
    if (state.embarked[seaId] && !Object.keys(state.embarked[seaId]).length) delete state.embarked[seaId];
    return true;
  }

  function performMove(fromId, toId, unitType, count) {
    if (!state.started) { alert('Start the game first.'); return; }
    if (activePower() !== state.ownership[fromId]) { alert('You can only move units you own.'); return; }
    const phase = PHASES[state.phaseIndex];
    if (phase !== 'Combat Move' && phase !== 'Noncombat Move') { alert('Moves allowed only during move phases.'); return; }
    const from = state.stacks[fromId] && state.stacks[fromId][activePower()];
    ensureMovePool();
    const terr = AA.map.territories[fromId];
    if (!terr.neighbors.includes(toId)) { alert('Must move to adjacent territory.'); return; }
    const moveCap = AA.units[unitType]?.move || 0;
    if (moveCap < 1) { alert('Unit cannot move.'); return; }

    const toTerr = AA.map.territories[toId];
    if (!toTerr) { alert('Invalid destination'); return; }
    const fromType = terr.type;
    const toType = toTerr.type;

    // special: disembark cargo
    if (!SEA_UNITS.has(unitType) && !AIR_UNITS.has(unitType) && fromType === 'sea') {
      if (!consumeCargo(fromId, activePower(), unitType, count)) { alert('No such cargo on transports.'); return; }
      const targetOwner = state.ownership[toId];
      if (phase === 'Noncombat Move' && targetOwner && targetOwner !== activePower()) { alert('Noncombat cannot enter hostile territory.'); ensureEmbarked(fromId, activePower())[unitType] = (ensureEmbarked(fromId, activePower())[unitType] || 0) + count; return; }
      state.stacks[toId] = state.stacks[toId] || {};
      state.stacks[toId][activePower()] = state.stacks[toId][activePower()] || {};
      state.stacks[toId][activePower()][unitType] = (state.stacks[toId][activePower()][unitType] || 0) + count;
      if (targetOwner && targetOwner !== activePower() && phase === 'Combat Move') {
        queueBattle(toId, { amphibious: true, seaZoneId: fromId });
        log(`Amphibious landing: ${count} ${unitType} from ${AA.map.territories[fromId].name} into ${AA.map.territories[toId].name}.`);
      } else {
        log(`Landed ${count} ${unitType} from transports into ${AA.map.territories[toId].name}.`);
      }
      selectTerritory(toId);
      return;
    }

    if (!from || (from[unitType] || 0) < count) { alert('Not enough units to move.'); return; }
    const taken = takeFromPool(fromId, unitType, count);
    if (!taken) { alert('No movement points remaining for those units.'); return; }
    const revert = () => addBackToPool(fromId, unitType, taken);

    if (!SEA_UNITS.has(unitType) && !AIR_UNITS.has(unitType) && toType === 'sea') {
      if (seaIsHostile(toId, activePower())) { alert('Cannot load in hostile sea zone.'); revert(); return; }
      if (transportCapacity(toId, activePower()) < count) { alert('Not enough transport capacity.'); revert(); return; }
      from[unitType] -= count; if (from[unitType] <= 0) delete from[unitType];
      const pool = ensureEmbarked(toId, activePower());
      pool[unitType] = (pool[unitType] || 0) + count;
      log(`Loaded ${count} ${unitType} onto transports in ${AA.map.territories[toId].name}.`);
      return;
    }

    if (SEA_UNITS.has(unitType)) {
      if (fromType !== 'sea' || toType !== 'sea') { alert('Sea units must stay in sea zones.'); revert(); return; }
    } else if (AIR_UNITS.has(unitType)) {
      const remainingAfter = taken.reduce((r, seg) => Math.min(r, seg.remaining - 1), Infinity);
      const friendlyLanding = (state.ownership[toId] === activePower() || state.ownership[toId] === null) && toTerr.type === 'land';
      if (remainingAfter <= 0 && !friendlyLanding) {
        alert('Air units must end movement on friendly land.');
        revert();
        return;
      }
    } else {
      if (fromType !== 'land' || toType !== 'land') { alert('Land units must move between land territories.'); revert(); return; }
    }

    // subtract
    from[unitType] -= count;
    if (from[unitType] <= 0) delete from[unitType];

    state.stacks[toId] = state.stacks[toId] || {};
    state.stacks[toId][activePower()] = state.stacks[toId][activePower()] || {};
    state.stacks[toId][activePower()][unitType] = (state.stacks[toId][activePower()][unitType] || 0) + count;

    if (unitType === 'transport' && fromType === 'sea' && toType === 'sea') {
      moveCargo(fromId, toId, activePower());
    }

    pushToPool(toId, unitType, taken);

    const targetOwner = state.ownership[toId];
    const friendly = targetOwner === activePower() || targetOwner === null;
    if (phase === 'Noncombat Move' && !friendly) {
      alert('Noncombat cannot enter hostile territory.');
      undoMove(fromId, toId, unitType, count);
      return;
    }

    const enemyStack = Object.entries(state.stacks[toId]).filter(([p]) => p !== activePower());
    if (enemyStack.length && phase === 'Combat Move') {
      queueBattle(toId);
      log(`Moved ${count} ${unitType} into ${AA.map.territories[toId].name} (battle queued).`);
    } else if (!enemyStack.length && targetOwner && targetOwner !== activePower() && phase === 'Combat Move') {
      // capturing empty
      state.ownership[toId] = activePower();
      log(`${activePower()} captured ${AA.map.territories[toId].name}.`);
    } else {
      log(`Moved ${count} ${unitType} into ${AA.map.territories[toId].name}.`);
    }

    selectTerritory(toId);
  }

  function undoMove(fromId, toId, unitType, count) {
    state.stacks[toId][activePower()][unitType] -= count;
    if (state.stacks[toId][activePower()][unitType] <= 0) delete state.stacks[toId][activePower()][unitType];
    state.stacks[fromId][activePower()] = state.stacks[fromId][activePower()] || {};
    state.stacks[fromId][activePower()][unitType] = (state.stacks[fromId][activePower()][unitType] || 0) + count;
  }

  function queueBattle(tid, info = {}) {
    const existing = state.pendingBattles.find(b => b.territoryId === tid);
    if (existing) { Object.assign(existing, info); return; }
    state.pendingBattles.push({ territoryId: tid, ...info });
  }

  function casualtyStep(units, hits) {
    const ordered = Object.entries(units).sort((a, b) => (AA.units[a[0]].cost || 0) - (AA.units[b[0]].cost || 0));
    let remaining = hits;
    ordered.forEach(([type, count]) => {
      if (remaining <= 0) return;
      const kill = Math.min(count, remaining);
      units[type] -= kill;
      remaining -= kill;
      if (units[type] <= 0) delete units[type];
    });
  }

  function tallyHits(unitSet, isAttack) {
    let hits = 0;
    Object.entries(unitSet).forEach(([type, count]) => {
      const stat = isAttack ? AA.units[type].att : AA.units[type].def;
      if (stat == null) return;
      const rolls = rollMany(count);
      rolls.forEach(r => { if (r <= stat) hits += 1; });
      log(`${isAttack ? 'Atk' : 'Def'} ${type} rolled [${rolls.join(', ')}] vs ${stat}`);
    });
    return hits;
  }

  function resolveBattle(battle) {
    const tid = battle.territoryId;
    const stacks = state.stacks[tid] || {};
    const attackers = stacks[activePower()] || {};
    const defenders = Object.fromEntries(Object.entries(stacks).filter(([p]) => p !== activePower()));
    const defenderUnits = {};
    Object.values(defenders).forEach(map => {
      Object.entries(map).forEach(([type, count]) => {
        defenderUnits[type] = (defenderUnits[type] || 0) + count;
      });
    });

    if (!Object.keys(attackers).length) { log('No attackers present; battle skipped.'); return false; }
    if (!Object.keys(defenderUnits).length) { log('No defenders present; territory already clear.'); return true; }

    log(`Battle at ${AA.map.territories[tid].name} begins.${battle.amphibious ? ' (Amphibious)' : ''}`);
    let round = 1;
    while (Object.keys(attackers).length && Object.keys(defenderUnits).length) {
      log(`Round ${round}`);
      const atkHits = tallyHits(attackers, true);
      const defHits = tallyHits(defenderUnits, false);
      casualtyStep(defenderUnits, atkHits);
      casualtyStep(attackers, defHits);
      round += 1;
    }

    if (!Object.keys(attackers).length) {
      // attackers wiped
      delete state.stacks[tid][activePower()];
      log('Attackers destroyed. Territory holds.');
      return false;
    }

    // defenders gone
    state.stacks[tid] = { [activePower()]: attackers };
    state.ownership[tid] = activePower();
    log(`${activePower()} capture ${AA.map.territories[tid].name}.`);
    return true;
  }

  function resolveAllBattles() {
    if (PHASES[state.phaseIndex] !== 'Conduct Combat') { alert('Only during Conduct Combat.'); return; }
    const battles = [...state.pendingBattles];
    state.pendingBattles = [];
    battles.forEach(b => resolveBattle(b));
    render();
    updateTerritoryPanel(state.selected);
  }

  function collectIncome(power) {
    let income = 0;
    Object.entries(AA.map.territories).forEach(([tid, t]) => {
      if (t.type === 'land' && state.ownership[tid] === power) income += (t.ipc || 0);
    });
    state.ipc[power] = income;
    log(`${power} income tallied: ${income} IPC.`);
  }

  function victoryCheck() {
    if (!state.victoryMode) return;
    const ownership = state.ownership;
    const vcCounts = { Axis: 0, Allies: 0 };
    Object.entries(AA.map.territories).forEach(([tid, t]) => {
      if (!t.isVC) return;
      const side = SIDE[ownership[tid]];
      if (side === 'Axis') vcCounts.Axis += 1;
      if (side === 'Allies') vcCounts.Allies += 1;
    });

    if (state.victoryMode === 'VC_STANDARD') {
      if (vcCounts.Axis >= 9) winnerOverlay('Axis win (9 Victory Cities).');
      if (vcCounts.Allies >= 10) winnerOverlay('Allies win (10 Victory Cities).');
    } else if (state.victoryMode === 'VC_TOTAL') {
      if (vcCounts.Axis >= 13) winnerOverlay('Axis win (13 Victory Cities).');
      if (vcCounts.Allies >= 13) winnerOverlay('Allies win (13 Victory Cities).');
    } else if (state.victoryMode === 'CAPITALS') {
      const axisHold = ['us_east', 'uk', 'moscow'].every(id => SIDE[ownership[id]] === 'Axis');
      const alliesHold = ['germany', 'japan'].every(id => SIDE[ownership[id]] === 'Allies');
      if (axisHold) winnerOverlay('Axis win (capitals condition).');
      if (alliesHold) winnerOverlay('Allies win (capitals condition).');
    }
  }

  function nextPhase() {
    const phase = PHASES[state.phaseIndex];
    if (phase === 'Collect Income') {
      collectIncome(activePower());
      if (activePower() === 'USA') victoryCheck();
    }
    const nextIndex = (state.phaseIndex + 1) % PHASES.length;
    if (nextIndex === 0) {
      state.powerIndex = (state.powerIndex + 1) % AA.setup.turnOrder.length;
      if (state.powerIndex === 0) state.round += 1;
      log(`Turn passes to ${activePower()}.`);
    }
    state.phaseIndex = nextIndex;
    enterPhase(PHASES[state.phaseIndex]);
    refreshPills();
    updateTerritoryPanel(state.selected);
  }

  function enterPhase(phaseName) {
    if (phaseName === 'Combat Move' || phaseName === 'Noncombat Move') {
      buildMovePool();
    } else {
      state.movePool = {};
    }
    if (phaseName === 'Purchase') {
      ensurePurchaseBucket();
    }
    if (phaseName === 'Mobilize') {
      ensurePurchaseBucket();
    }
  }

  function winnerOverlay(text) {
    const dlg = document.getElementById('dlg');
    document.getElementById('dlg-title').textContent = 'Victory';
    document.getElementById('dlg-body').textContent = text;
    const actions = document.getElementById('dlg-actions');
    actions.innerHTML = '';
    const btn = document.createElement('button'); btn.className = 'btn'; btn.textContent = 'Close'; btn.onclick = () => dlg.close(); actions.appendChild(btn);
    dlg.showModal();
  }

  function saveGame() {
    const payload = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, payload);
    log('Game saved to localStorage.');
  }

  function loadGame() {
    const payload = localStorage.getItem(STORAGE_KEY);
    if (!payload) { alert('No saved game.'); return; }
    const loaded = JSON.parse(payload);
    Object.keys(state).forEach(k => delete state[k]);
    Object.assign(state, loaded);
    state.embarked = state.embarked || {};
    rng = makeRng(state.rngSeed);
    enterPhase(PHASES[state.phaseIndex]);
    rebuildLog();
    refreshPills();
    render();
    updateTerritoryPanel(state.selected);
    log('Game loaded from localStorage.');
  }

  function rebuildLog() {
    const el = document.getElementById('log');
    el.innerHTML = '';
    (state.log || []).forEach(line => {
      const div = document.createElement('div');
      div.className = 'line';
      div.textContent = line;
      el.appendChild(div);
    });
    el.scrollTop = el.scrollHeight;
  }

  function resetGame() {
    const fresh = createInitialState();
    Object.keys(state).forEach(k => delete state[k]);
    Object.assign(state, fresh);
    rng = makeRng(state.rngSeed);
    document.getElementById('start-overlay').classList.remove('hidden');
    document.getElementById('log').innerHTML = '';
    render();
    updateTerritoryPanel(null);
    refreshPills();
  }

  function setupInteractions() {
    canvas.addEventListener('click', (ev) => {
      const rect = canvas.getBoundingClientRect();
      const pt = screenToWorld(ev.clientX - rect.left, ev.clientY - rect.top);
      const hit = Object.entries(AA.map.territories).find(([tid, t]) => polygonContains(pt, t.polygon));
      if (hit) { selectTerritory(hit[0]); state.hovered = hit[0]; }
    });

    let dragging = false; let last = { x: 0, y: 0 };
    canvas.addEventListener('mousedown', (ev) => { dragging = true; last = { x: ev.clientX, y: ev.clientY }; });
    window.addEventListener('mouseup', () => dragging = false);
    window.addEventListener('mousemove', (ev) => {
      if (dragging) {
        const dx = ev.clientX - last.x; const dy = ev.clientY - last.y; last = { x: ev.clientX, y: ev.clientY }; state.view.x += dx; state.view.y += dy; render();
      } else {
        const rect = canvas.getBoundingClientRect();
        const pt = screenToWorld(ev.clientX - rect.left, ev.clientY - rect.top);
        const hit = Object.entries(AA.map.territories).find(([tid, t]) => polygonContains(pt, t.polygon));
        const hoveredId = hit ? hit[0] : null;
        if (hoveredId !== state.hovered) { state.hovered = hoveredId; render(); }
      }
    });
    canvas.addEventListener('wheel', (ev) => { ev.preventDefault(); state.view.scale = Math.max(0.1, Math.min(1.5, state.view.scale * (ev.deltaY < 0 ? 1.05 : 0.95))); render(); }, { passive: false });

    document.getElementById('btn-next-phase').addEventListener('click', () => {
      if (!state.started) return;
      nextPhase();
      log(`Advanced to ${PHASES[state.phaseIndex]} for ${activePower()}.`);
    });

    document.getElementById('btn-resolve').addEventListener('click', resolveAllBattles);
    document.getElementById('btn-save').addEventListener('click', saveGame);
    document.getElementById('btn-load').addEventListener('click', loadGame);
    document.getElementById('btn-reset').addEventListener('click', resetGame);

    document.getElementById('btn-help').addEventListener('click', () => {
      const dlg = document.getElementById('dlg');
      document.getElementById('dlg-title').textContent = 'Quick Rules';
      document.getElementById('dlg-body').innerHTML = `
        <p>Phases: ${PHASES.join(' → ')}.</p>
        <p>Move during Combat/Noncombat; resolve battles in Conduct Combat.</p>
        <p>Save/Load uses localStorage; run <code>runSelfTests()</code> from console for deterministic checks.</p>
      `;
      const actions = document.getElementById('dlg-actions'); actions.innerHTML = '';
      const close = document.createElement('button'); close.className = 'btn'; close.textContent = 'Close'; close.onclick = () => dlg.close(); actions.appendChild(close);
      dlg.showModal();
    });

    document.getElementById('btn-start').addEventListener('click', () => {
      const mode = document.getElementById('victory-mode').value;
      if (!mode) { alert('Select a victory mode to start.'); return; }
      state.victoryMode = mode;
      state.started = true;
      document.getElementById('start-overlay').classList.add('hidden');
      document.getElementById('log').innerHTML = '';
      log(`Game start. Victory mode: ${mode}.`);
      refreshPills();
      enterPhase(PHASES[state.phaseIndex]);
      render();
    });
  }

  function init() {
    renderUnitReference();
    updateTerritoryPanel(null);
    refreshPills();
    setupInteractions();
    boardImg.onload = () => { AA.map.width = boardImg.naturalWidth; AA.map.height = boardImg.naturalHeight; render(); };
    if (boardImg.complete) { AA.map.width = boardImg.naturalWidth; AA.map.height = boardImg.naturalHeight; render(); }
  }

  function unitOptions() {
    return Object.keys(AA.units).map(u => `<option value="${u}">${u} (${AA.units[u].cost} IPC)</option>`).join('');
  }

  function ensurePurchaseBucket() {
    state.purchases[activePower()] = state.purchases[activePower()] || [];
  }

  function queuePurchase(type, count) {
    if (PHASES[state.phaseIndex] !== 'Purchase') { alert('You can only purchase during Purchase phase.'); return; }
    ensurePurchaseBucket();
    const cost = (AA.units[type]?.cost || 0) * count;
    if (cost <= 0) { alert('Invalid unit.'); return; }
    if (state.ipc[activePower()] < cost) { alert('Not enough IPC.'); return; }
    state.ipc[activePower()] -= cost;
    const bucket = state.purchases[activePower()];
    const existing = bucket.find(p => p.type === type);
    if (existing) existing.count += count; else bucket.push({ type, count });
    log(`${activePower()} purchased ${count} ${type} for ${cost} IPC.`);
  }

  function placePurchase(tid) {
    if (PHASES[state.phaseIndex] !== 'Mobilize') { alert('Place during Mobilize phase.'); return; }
    const t = AA.map.territories[tid];
    if (!t || t.type !== 'land') { alert('Place on owned land territory.'); return; }
    if (state.ownership[tid] !== activePower()) { alert('You must own the territory to place units.'); return; }
    ensurePurchaseBucket();
    const bucket = state.purchases[activePower()];
    if (!bucket.length) { alert('No purchased units to place.'); return; }
    const item = bucket[0];
    state.stacks[tid] = state.stacks[tid] || {};
    state.stacks[tid][activePower()] = state.stacks[tid][activePower()] || {};
    state.stacks[tid][activePower()][item.type] = (state.stacks[tid][activePower()][item.type] || 0) + 1;
    item.count -= 1;
    if (item.count <= 0) bucket.shift();
    log(`${activePower()} placed 1 ${item.type} in ${t.name}.`);
  }

  function buildMovePool() {
    state.movePool = {};
    const power = activePower();
    Object.entries(state.stacks).forEach(([tid, perPower]) => {
      const units = perPower[power];
      if (!units) return;
      Object.entries(units).forEach(([type, count]) => {
        const move = AA.units[type]?.move ?? 0;
        if (move <= 0) return;
        state.movePool[tid] = state.movePool[tid] || {};
        state.movePool[tid][type] = [{ remaining: move, count }];
      });
    });
  }

  function ensureMovePool() {
    if (!state.movePool || !Object.keys(state.movePool).length) buildMovePool();
  }

  function takeFromPool(tid, type, count) {
    const arr = state.movePool[tid]?.[type];
    if (!arr) return null;
    let need = count;
    const taken = [];
    while (need > 0 && arr.length) {
      const seg = arr[0];
      const use = Math.min(seg.count, need);
      taken.push({ remaining: seg.remaining, count: use });
      seg.count -= use; need -= use;
      if (seg.count <= 0) arr.shift();
    }
    if (need > 0) {
      pushToPool(tid, type, taken);
      return null;
    }
    return taken;
  }

  function pushToPool(tid, type, segments) {
    if (!segments || !segments.length) return;
    state.movePool[tid] = state.movePool[tid] || {};
    state.movePool[tid][type] = state.movePool[tid][type] || [];
    const arr = state.movePool[tid][type];
    segments.forEach(seg => {
      const remaining = seg.remaining - 1;
      if (remaining <= 0) return;
      arr.push({ remaining, count: seg.count });
    });
  }

  function addBackToPool(tid, type, segments) {
    if (!segments) return;
    state.movePool[tid] = state.movePool[tid] || {};
    state.movePool[tid][type] = state.movePool[tid][type] || [];
    const arr = state.movePool[tid][type];
    segments.forEach(seg => arr.push(seg));
  }

  function runSelfTests() {
    const snapshot = JSON.stringify(state);
    const logSnapshot = document.getElementById('log').innerHTML;
    const results = [];
    // deterministic RNG
    rng = makeRng(1); state.rngSeed = 1;
    const seq = rollMany(5);
    const expectedSeq = [4,2,4,6,6];
    results.push({ name: 'RNG deterministic', pass: JSON.stringify(seq) === JSON.stringify(expectedSeq), detail: seq.join(',') });

    // serialization roundtrip
    const snap = JSON.stringify(state);
    const restored = JSON.stringify(JSON.parse(snap));
    results.push({ name: 'Serialization roundtrip', pass: snap === restored });

    // scripted battle
    const tid = 'test_zone';
    AA.map.territories[tid] = { name: 'Test Zone', type: 'land', ipc: 0, polygon: [[0,0],[10,0],[10,10],[0,10]], neighbors: [], owner: null };
    state.stacks[tid] = { Soviet: { bomber:1, fighter:1 }, Germany: { infantry:1 } };
    state.ownership[tid] = 'Germany';
    rng = makeRng(1); state.rngSeed = 1;
    const battlePassed = resolveBattle({ territoryId: tid }) && state.ownership[tid] === 'Soviet';
    results.push({ name: 'Scripted battle (bomber+fighter vs infantry)', pass: battlePassed });
    delete AA.map.territories[tid]; delete state.stacks[tid]; delete state.ownership[tid];

    // amphibious load/unload
    state.started = true;
    state.powerIndex = AA.setup.turnOrder.indexOf('UK');
    state.phaseIndex = PHASES.indexOf('Combat Move');
    state.pendingBattles = [];
    state.embarked = {};
    state.stacks.uk = { UK: { infantry: 1 } };
    state.stacks.baltic = { UK: { transport: 1 } };
    state.stacks.germany = { Germany: { infantry: 1 } };
    state.ownership.uk = 'UK';
    state.ownership.baltic = null;
    state.ownership.germany = 'Germany';
    buildMovePool();
    performMove('uk', 'baltic', 'infantry', 1);
    const loaded = state.embarked.baltic?.UK?.infantry === 1;
    performMove('baltic', 'germany', 'infantry', 1);
    const queued = state.pendingBattles.some(b => b.territoryId === 'germany' && b.amphibious);
    state.phaseIndex = PHASES.indexOf('Conduct Combat');
    resolveAllBattles();
    const captured = state.ownership.germany === 'UK';
    results.push({ name: 'Amphibious (load + land into Germany)', pass: loaded && queued && captured });

    const restored = JSON.parse(snapshot);
    Object.keys(state).forEach(k => delete state[k]);
    Object.assign(state, restored);
    rng = makeRng(state.rngSeed);
    document.getElementById('log').innerHTML = logSnapshot;
    refreshPills();
    render();

    console.table(results.map(r => ({ test: r.name, pass: r.pass, detail: r.detail || '' })));
    results.forEach(r => log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}`));
    return results;
  }

  window.runSelfTests = runSelfTests;

  init();
})();
