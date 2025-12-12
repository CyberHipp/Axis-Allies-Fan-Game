// Axis & Allies 1942.2 prototype
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

  const state = {
    started: false,
    victoryMode: null,
    round: 1,
    powerIndex: 0,
    phaseIndex: 0,
    selected: null,
    pendingBattles: [],
    pendingAmphib: [],
    ownership: {},
    stacks: {},
    ipc: {},
    log: [],
    view: { x: 0, y: 0, scale: 0.35 },
  };

  function deepCopy(x) { return JSON.parse(JSON.stringify(x)); }

  function log(msg) {
    const time = new Date().toLocaleTimeString();
    const line = `[${time}] ${msg}`;
    state.log.push(line);
    const el = document.getElementById('log');
    const div = document.createElement('div');
    div.className = 'line';
    div.textContent = line;
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  }

  function setOwnershipFromMap() {
    state.ownership = {};
    Object.entries(AA.map.territories).forEach(([id, t]) => {
      state.ownership[id] = t.owner || null;
    });
  }

  function buildStacks() {
    state.stacks = {};
    Object.entries(AA.setup.stacks).forEach(([tid, perPower]) => {
      state.stacks[tid] = deepCopy(perPower);
    });
    state.ipc = deepCopy(AA.setup.ipc);
  }

  function resetLog() {
    state.log = [];
    document.getElementById('log').innerHTML = '';
  }

  function polygonContains(pt, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
        (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi + 1e-6) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function screenToWorld(x, y) {
    return {
      x: (x - state.view.x) / state.view.scale,
      y: (y - state.view.y) / state.view.scale,
    };
  }

  function drawTerritoryOutline(poly, color, lineWidth = 2, dash = []) {
    ctx.save();
    ctx.beginPath();
    poly.forEach((p, idx) => {
      if (idx === 0) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    });
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(dash);
    ctx.stroke();
    ctx.restore();
  }

  function centerOfPolygon(poly) {
    let x = 0, y = 0;
    poly.forEach(p => { x += p[0]; y += p[1]; });
    return { x: x / poly.length, y: y / poly.length };
  }

  function render() {
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(state.view.x, state.view.y);
    ctx.scale(state.view.scale, state.view.scale);

    if (boardImg.complete) {
      ctx.drawImage(boardImg, 0, 0, AA.map.width, AA.map.height);
    }

    Object.entries(AA.map.territories).forEach(([tid, t]) => {
      const color = t.type === 'land' ? 'rgba(125, 211, 252, 0.6)' : 'rgba(148, 163, 184, 0.5)';
      drawTerritoryOutline(t.polygon, color, 2);
      if (state.selected === tid) {
        drawTerritoryOutline(t.polygon, '#f59e0b', 4, [6, 6]);
      }
    });

    // units summary circles
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
        ctx.beginPath();
        ctx.arc(center.x, center.y + offsetY, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0b0f14';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(total.toString(), center.x, center.y + offsetY);
        ctx.restore();
        offsetY += 26;
      });
    });

    ctx.restore();
  }

  function updateTerritoryPanel(tid) {
    const panel = document.getElementById('panel-territory');
    if (!tid) {
      panel.innerHTML = '<div class="muted">Click a territory on the map.</div>';
      return;
    }
    const t = AA.map.territories[tid];
    const owner = state.ownership[tid] || 'Neutral';
    const neighbors = t.neighbors.map(n => AA.map.territories[n]?.name || n).join(', ');
    const stack = state.stacks[tid] || {};
    const units = Object.entries(stack).flatMap(([power, entries]) => {
      return Object.entries(entries).map(([type, count]) => `${power} ${type}×${count}`);
    }).join(', ');
    panel.innerHTML = `
      <div class="kv"><b>Name</b><div>${t.name}</div></div>
      <div class="kv"><b>Type</b><div>${t.type}</div></div>
      <div class="kv"><b>Owner</b><div>${owner}</div></div>
      <div class="kv"><b>IPC</b><div>${t.ipc ?? 0}</div></div>
      <div class="kv"><b>Neighbors</b><div>${neighbors || '—'}</div></div>
      <div class="kv"><b>Units</b><div>${units || '—'}</div></div>
      <div class="kv"><b>VC/Capital</b><div>${t.isVC ? 'VC' : ''} ${t.isCapital ? 'Capital' : ''}</div></div>
    `;
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
      const att = st.att ?? '—';
      const def = st.def ?? '—';
      const move = st.move ?? '—';
      return `<div class="unit-card"><div class="name">${id}</div><div class="stats">Cost ${st.cost} • Att ${att} • Def ${def} • Move ${move}</div></div>`;
    }).join('');
    panel.innerHTML = `<div class="unit-ref">${rows}</div>`;
  }

  function refreshPills() {
    document.getElementById('pill-round').textContent = `Round: ${state.round}`;
    document.getElementById('pill-power').textContent = `Power: ${AA.setup.turnOrder[state.powerIndex]}`;
    document.getElementById('pill-phase').textContent = `Phase: ${PHASES[state.phaseIndex]}`;
  }

  function selectTerritory(tid) {
    state.selected = tid;
    updateTerritoryPanel(tid);
    updateHUD(tid);
    render();
  }

  function winnerOverlay(text) {
    const dlg = document.getElementById('dlg');
    document.getElementById('dlg-title').textContent = 'Victory';
    document.getElementById('dlg-body').textContent = text;
    const actions = document.getElementById('dlg-actions');
    actions.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = 'Close';
    btn.onclick = () => dlg.close();
    actions.appendChild(btn);
    dlg.showModal();
  }

  function victoryCheck() {
    if (!state.victoryMode) return;
    const ownership = state.ownership;
    const sideOf = (owner) => SIDE[owner] || 'Neutral';
    const vcCounts = { Axis: 0, Allies: 0 };
    Object.entries(AA.map.territories).forEach(([tid, t]) => {
      if (!t.isVC) return;
      const owner = ownership[tid];
      const side = sideOf(owner);
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
      const axisHold = ['us_east', 'uk', 'moscow'].every(id => sideOf(ownership[id]) === 'Axis');
      const alliesHold = ['germany', 'japan'].every(id => sideOf(ownership[id]) === 'Allies');
      if (axisHold) winnerOverlay('Axis win (capitals condition).');
      if (alliesHold) winnerOverlay('Allies win (capitals condition).');
    }
  }

  function nextPhase() {
    state.phaseIndex = (state.phaseIndex + 1) % PHASES.length;
    if (state.phaseIndex === 0) {
      // move to next power
      state.powerIndex = (state.powerIndex + 1) % AA.setup.turnOrder.length;
      if (state.powerIndex === 0) state.round += 1;
      // victory evaluated at end of USA turn
      if (AA.setup.turnOrder[(state.powerIndex - 1 + AA.setup.turnOrder.length) % AA.setup.turnOrder.length] === 'USA') {
        victoryCheck();
      }
    }
    refreshPills();
  }

  function setupInteractions() {
    canvas.addEventListener('click', (ev) => {
      const rect = canvas.getBoundingClientRect();
      const pt = screenToWorld(ev.clientX - rect.left, ev.clientY - rect.top);
      const hit = Object.entries(AA.map.territories).find(([tid, t]) => polygonContains(pt, t.polygon));
      if (hit) selectTerritory(hit[0]);
    });

    let dragging = false;
    let last = { x: 0, y: 0 };
    canvas.addEventListener('mousedown', (ev) => { dragging = true; last = { x: ev.clientX, y: ev.clientY }; });
    window.addEventListener('mouseup', () => dragging = false);
    window.addEventListener('mousemove', (ev) => {
      if (!dragging) return;
      const dx = ev.clientX - last.x;
      const dy = ev.clientY - last.y;
      last = { x: ev.clientX, y: ev.clientY };
      state.view.x += dx;
      state.view.y += dy;
      render();
    });

    canvas.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const scale = state.view.scale * (ev.deltaY < 0 ? 1.05 : 0.95);
      state.view.scale = Math.max(0.1, Math.min(1.5, scale));
      render();
    }, { passive: false });

    document.getElementById('btn-next-phase').addEventListener('click', () => {
      if (!state.started) return;
      nextPhase();
      log(`Advanced to ${PHASES[state.phaseIndex]} for ${AA.setup.turnOrder[state.powerIndex]}`);
    });

    document.getElementById('btn-help').addEventListener('click', () => {
      const dlg = document.getElementById('dlg');
      document.getElementById('dlg-title').textContent = 'Quick Rules';
      document.getElementById('dlg-body').innerHTML = `
        <p>Phases: ${PHASES.join(' → ')}.</p>
        <p>Victory evaluated at end of USA turn per selected mode.</p>
        <p>Amphibious assaults and full combat engine are planned milestones.</p>
      `;
      const actions = document.getElementById('dlg-actions');
      actions.innerHTML = '';
      const close = document.createElement('button');
      close.className = 'btn';
      close.textContent = 'Close';
      close.onclick = () => dlg.close();
      actions.appendChild(close);
      dlg.showModal();
    });

    document.getElementById('btn-start').addEventListener('click', () => {
      const mode = document.getElementById('victory-mode').value;
      if (!mode) {
        alert('Select a victory mode to start.');
        return;
      }
      state.victoryMode = mode;
      state.started = true;
      document.getElementById('start-overlay').classList.add('hidden');
      resetLog();
      log(`Game start. Victory mode: ${mode}.`);
      refreshPills();
      render();
    });
  }

  function initialOwnershipIpc() {
    Object.entries(AA.map.territories).forEach(([tid, t]) => {
      if (!state.ownership[tid]) return;
      const owner = state.ownership[tid];
      if (state.ipc[owner] === undefined) state.ipc[owner] = 0;
      if (t.type === 'land') state.ipc[owner] += (t.ipc || 0);
    });
  }

  function init() {
    renderUnitReference();
    setOwnershipFromMap();
    buildStacks();
    initialOwnershipIpc();
    setupInteractions();
    refreshPills();
    boardImg.onload = () => {
      AA.map.width = boardImg.naturalWidth;
      AA.map.height = boardImg.naturalHeight;
      render();
    };
    if (boardImg.complete) {
      AA.map.width = boardImg.naturalWidth;
      AA.map.height = boardImg.naturalHeight;
      render();
    }
  }

  init();
})();
