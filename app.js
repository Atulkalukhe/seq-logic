(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const bit = value => Number(value) ? 1 : 0;
  const bitText = value => String(bit(value));
  const state = {
    signals: { 'comb-a': 0, 'comb-b': 0, 'mem-d': 0, 'rs-s': 0, 'rs-r': 0, 'jk-j': 1, 'jk-k': 1, 'jk-q': 0, 'serial-in': 0 },
    latchEnabled: false, latchQ: 0, dffQ: 0, rsType: 'NOR', rsQ: 0,
    ffType: 'SR', ffQ: 0, ffInputs: { S: 0, R: 0, J: 0, K: 0, T: 0, D: 0 },
    jkMode: 'level', raceDuration: 5,
    regMode: 'SISO', regDirection: 'right', regOp: 'hold', regBits: [0, 0, 0, 0], regParallel: [1, 0, 1, 1], serialOut: 0,
    counterType: 'sync', countDirection: 'up', modulus: 6, count: 0, ringIndex: 0, johnsonIndex: 0,
    history: [], timer: null
  };

  function paintBit(button, value) {
    button.textContent = bitText(value);
    button.classList.toggle('is-one', bit(value) === 1);
    button.setAttribute('aria-pressed', String(bit(value) === 1));
  }
  function paintLed(element, value) {
    if (!element) return;
    element.textContent = bitText(value);
    element.classList.toggle('is-one', bit(value) === 1);
  }
  function setLog(id, message) { const el = $('#' + id); if (el) el.textContent = message; }

  // Shared bit controls use event delegation so controls rendered by a simulator remain live.
  document.addEventListener('click', event => {
    const button = event.target.closest('.bit-button[data-bit]');
    if (!button) return;
    const key = button.dataset.bit;
    // The flip-flop workbench has its own input model and delegated handler below.
    if (key.startsWith('ff-')) return;
    state.signals[key] = bit(state.signals[key] ^ 1);
    paintBit(button, state.signals[key]);
    if (key === 'comb-a' || key === 'comb-b') renderCombinational();
    if (key === 'mem-d') {
      if (state.latchEnabled) state.latchQ = state.signals['mem-d'];
      renderMemory(state.latchEnabled ? `Enable is open · latch follows D = ${state.signals['mem-d']}.` : `D changed to ${state.signals['mem-d']} · stored outputs hold.`);
    }
    if (key === 'rs-s' || key === 'rs-r') updateRsButtonLabels();
    if (key === 'jk-j' || key === 'jk-k' || key === 'jk-q') renderRace('Inputs updated · ready for one clock cycle.');
    if (key === 'serial-in') renderRegister();
    if (key.startsWith('parallel-')) {
      const index = Number(key.split('-')[1]);
      state.regParallel[3 - index] = state.signals[key];
      renderParallel();
    }
  });

  function renderCombinational() {
    const y = state.signals['comb-a'] & state.signals['comb-b'];
    $('#combY').textContent = y;
    $('#combY').style.color = y ? 'var(--teal)' : '';
  }

  function renderMemory(message) {
    paintLed($('#basicQLed'), state.dffQ);
    paintLed($('#latchQ'), state.latchQ);
    paintLed($('#dffQ'), state.dffQ);
    $('#basicStateText').textContent = state.latchEnabled ? 'Latch is transparent while EN = 1' : 'Stored until the next active signal';
    const enable = $('#latchEnable');
    enable.setAttribute('aria-pressed', String(state.latchEnabled));
    enable.querySelector('span').textContent = state.latchEnabled ? 'ENABLED' : 'DISABLED';
    setLog('memoryLog', message);
  }
  $('#latchEnable').addEventListener('click', () => {
    state.latchEnabled = !state.latchEnabled;
    if (state.latchEnabled) state.latchQ = state.signals['mem-d'];
    renderMemory(state.latchEnabled ? `Enable opened · Q follows D = ${state.latchQ}.` : `Enable closed · latch holds Q = ${state.latchQ}.`);
  });
  $('#memoryPulse').addEventListener('click', () => {
    state.dffQ = state.signals['mem-d'];
    pulse($('#memoryPulse'));
    renderMemory(`Rising edge · D = ${state.signals['mem-d']} sampled into the flip-flop.`);
  });

  let rsLastMessage = 'Stable · holding previous state';
  function updateRsButtonLabels() {
    const isNor = state.rsType === 'NOR';
    $('#rsSLabel').textContent = isNor ? 'SET · S' : 'SET · S̅';
    $('#rsRLabel').textContent = isNor ? 'RESET · R' : 'RESET · R̅';
    $('#rsModeNote').textContent = isNor ? 'NOR latch: S and R are active high.' : 'NAND latch: S̅ and R̅ are active low.';
    const gates = $$('.gate-shape');
    gates.forEach(gate => { gate.setAttribute('d', isNor ? 'M85 28Q115 43 85 58L120 58Q155 43 120 28Z' : 'M85 28H105Q150 28 150 43Q150 58 105 58H85Q110 43 85 28Z'); });
    $$('.bubble').forEach(circle => circle.style.display = isNor ? '' : 'none');
    $$('.gate-label').forEach(label => { label.textContent = isNor ? 'OR' : 'AND'; });
  }
  function renderRs() {
    paintLed($('#rsQ'), state.rsQ);
    paintLed($('#rsQbar'), state.rsQ ^ 1);
    $('#rsStatus').textContent = rsLastMessage;
    $('#rsStatus').style.color = rsLastMessage.includes('invalid') ? 'var(--red)' : '';
    $('.simulator-card:has(#rsApply) .rs-lab')?.classList.toggle('nand', state.rsType === 'NAND');
  }
  $$('.segmented [data-rs-type]').forEach(button => button.addEventListener('click', () => {
    state.rsType = button.dataset.rsType;
    $$('.segmented [data-rs-type]').forEach(b => b.classList.toggle('selected', b === button));
    updateRsButtonLabels();
    rsLastMessage = state.rsType === 'NOR' ? 'NOR latch ready · active-high inputs.' : 'NAND latch ready · active-low inputs.';
    renderRs();
  }));
  $('#rsApply').addEventListener('click', () => {
    const s = state.signals['rs-s'], r = state.signals['rs-r'];
    if (state.rsType === 'NOR') {
      if (s && r) rsLastMessage = 'Invalid · NOR latch has S = R = 1.';
      else if (s) { state.rsQ = 1; rsLastMessage = 'Set · Q = 1.'; }
      else if (r) { state.rsQ = 0; rsLastMessage = 'Reset · Q = 0.'; }
      else rsLastMessage = 'Hold · both inputs are inactive.';
    } else {
      if (!s && !r) rsLastMessage = 'Invalid · NAND latch has S̅ = R̅ = 0.';
      else if (!s) { state.rsQ = 1; rsLastMessage = 'Set · active-low S̅ asserted.'; }
      else if (!r) { state.rsQ = 0; rsLastMessage = 'Reset · active-low R̅ asserted.'; }
      else rsLastMessage = 'Hold · both active-low inputs are released.';
    }
    renderRs();
  });

  const ffMeta = {
    SR: { inputs: ['S', 'R'], formula: 'Q⁺ = S + R̅Q', application: 'Simple control and status storage' },
    JK: { inputs: ['J', 'K'], formula: 'Q⁺ = JQ̅ + K̅Q', application: 'Counters and toggle-capable state machines' },
    T: { inputs: ['T'], formula: 'Q⁺ = T ⊕ Q', application: 'Binary counters and divide-by-two stages' },
    D: { inputs: ['D'], formula: 'Q⁺ = D', application: 'Registers, pipelines, and data synchronization' }
  };
  function ensureInputs(type) { ffMeta[type].inputs.forEach(key => { state.ffInputs[key] ??= 0; }); }
  function renderFfControls() {
    ensureInputs(state.ffType);
    const host = $('#ffInputControls');
    host.innerHTML = ffMeta[state.ffType].inputs.map(key => `<div class="ff-input-row"><span>${key}</span><button class="bit-button" data-bit="ff-${key.toLowerCase()}" aria-label="Toggle ${key} input">${state.ffInputs[key]}</button>${state.ffType === 'SR' && key === 'S' ? '<small>SET</small>' : ''}${state.ffType === 'SR' && key === 'R' ? '<small>RESET</small>' : ''}</div>`).join('') + '<div class="ff-input-row"><span>CLK</span><span class="clock-indicator">↑</span><small>RISING EDGE</small></div>';
    host.querySelectorAll('.bit-button').forEach(button => {
      const key = button.dataset.bit.slice(3).toUpperCase();
      paintBit(button, state.ffInputs[key]);
    });
    $('#ffLogicName').textContent = `${state.ffType} FLIP-FLOP`;
    $('#ffBlockName').textContent = state.ffType;
    $('#ffInputLabels').textContent = ffMeta[state.ffType].inputs.join(', ');
    $('#ffFormula').textContent = ffMeta[state.ffType].formula;
    $('#ffApplication').textContent = `APPLICATION · ${ffMeta[state.ffType].application}`;
    renderFfTables();
  }
  function makeTable(headers, rows, lastColumn = -1) {
    return `<table class="data-table"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map((v, i) => `<td class="${String(v).includes('Invalid') ? 'invalid' : ''} ${i === lastColumn ? 'result-cell' : ''}">${v}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  function renderFfTables() {
    const qValues = [0, 1];
    let characteristic, excitation;
    if (state.ffType === 'SR') {
      characteristic = qValues.flatMap(q => [[0, 0, q, q], [0, 1, q, 0], [1, 0, q, 1], [1, 1, q, 'Invalid']]);
      excitation = [[0, 0, 0, 'X'], [0, 1, 1, 'X'], [1, 0, 'X', 1], [1, 1, 'X', 0]];
      $('#ffTruthTable').innerHTML = makeTable(['S', 'R', 'Qₜ', 'Qₜ₊₁'], characteristic, 3);
      $('#ffExcitationTable').innerHTML = makeTable(['Qₜ', 'Qₜ₊₁', 'S', 'R'], excitation, 3);
    } else if (state.ffType === 'JK') {
      characteristic = qValues.flatMap(q => [[0, 0, q, q], [0, 1, q, 0], [1, 0, q, 1], [1, 1, q, q ^ 1]]);
      excitation = [[0, 0, 0, 'X'], [0, 1, 1, 'X'], [1, 0, 'X', 1], [1, 1, 'X', 0]];
      $('#ffTruthTable').innerHTML = makeTable(['J', 'K', 'Qₜ', 'Qₜ₊₁'], characteristic, 3);
      $('#ffExcitationTable').innerHTML = makeTable(['Qₜ', 'Qₜ₊₁', 'J', 'K'], excitation, 3);
    } else if (state.ffType === 'T') {
      characteristic = [[0, 0, 0], [0, 1, 1], [1, 0, 1], [1, 1, 0]];
      excitation = [[0, 0, 0], [0, 1, 1], [1, 0, 1], [1, 1, 0]];
      $('#ffTruthTable').innerHTML = makeTable(['T', 'Qₜ', 'Qₜ₊₁'], characteristic, 2);
      $('#ffExcitationTable').innerHTML = makeTable(['Qₜ', 'Qₜ₊₁', 'T'], excitation, 2);
    } else {
      characteristic = [[0, 0, 0], [0, 1, 0], [1, 0, 1], [1, 1, 1]];
      excitation = [[0, 0, 0], [0, 1, 1], [1, 0, 0], [1, 1, 1]];
      $('#ffTruthTable').innerHTML = makeTable(['D', 'Qₜ', 'Qₜ₊₁'], characteristic, 2);
      $('#ffExcitationTable').innerHTML = makeTable(['Qₜ', 'Qₜ₊₁', 'D'], excitation, 2);
    }
  }
  function renderFf(message = 'Ready · output holds until a rising edge.') {
    paintLed($('#ffQ'), state.ffQ);
    paintLed($('#ffQbar'), state.ffQ ^ 1);
    setLog('ffMessage', message);
  }
  function ffNext(type, inputs, q) {
    if (type === 'SR') {
      if (inputs.S && inputs.R) return null;
      return inputs.S ? 1 : inputs.R ? 0 : q;
    }
    if (type === 'JK') return inputs.J ? (inputs.K ? q ^ 1 : 1) : (inputs.K ? 0 : q);
    if (type === 'T') return q ^ inputs.T;
    return inputs.D;
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('#ffInputControls .bit-button');
    if (!button) return;
    const key = button.dataset.bit.slice(3).toUpperCase();
    state.ffInputs[key] ^= 1;
    paintBit(button, state.ffInputs[key]);
  });
  $$('[data-ff-type]').forEach(button => button.addEventListener('click', () => {
    state.ffType = button.dataset.ffType;
    $$('[data-ff-type]').forEach(b => b.classList.toggle('selected', b === button));
    renderFfControls();
    renderFf(`${state.ffType} selected · set inputs, then apply a rising edge.`);
  }));
  function pulse(button) { button.classList.remove('is-pulsing'); void button.offsetWidth; button.classList.add('is-pulsing'); setTimeout(() => button.classList.remove('is-pulsing'), 380); }
  $('#ffPulse').addEventListener('click', () => {
    const next = ffNext(state.ffType, state.ffInputs, state.ffQ);
    if (next === null) { renderFf('Invalid SR condition · S = R = 1 is forbidden. Output was not changed.'); return; }
    const before = state.ffQ;
    state.ffQ = next;
    pulse($('#ffPulse'));
    renderFf(`${state.ffType} rising edge · Q: ${before} → ${state.ffQ}.`);
  });
  $('#ffReset').addEventListener('click', () => { state.ffQ = 0; renderFf('Reset · Q = 0.'); });

  function renderRace(message = 'Ready · set J = K = 1 to demonstrate repeated toggling.') {
    const q = state.signals['jk-q'];
    paintLed($('#raceBefore'), q);
    paintLed($('#raceAfter'), q);
    $('#raceDurationValue').textContent = state.raceDuration;
    $('#raceEquation').innerHTML = state.jkMode === 'level' ? 'J = K = 1 <span>→</span> Q may toggle while CLK stays HIGH' : 'MASTER samples on HIGH <span>→</span> SLAVE updates on falling edge';
    $('#raceStatus').textContent = message;
    $('#raceTakeaway').innerHTML = state.jkMode === 'level'
      ? '<span>KEY IDEA</span> When the HIGH phase exceeds propagation delay, the level JK may toggle repeatedly. Physical final state depends on timing and device delays.'
      : '<span>KEY IDEA</span> The master captures during HIGH; the slave transfers once when CLK falls. Q avoids repeated output toggles within the HIGH phase.';
  }
  $$('[data-jk-mode]').forEach(button => button.addEventListener('click', () => {
    state.jkMode = button.dataset.jkMode;
    $$('[data-jk-mode]').forEach(b => b.classList.toggle('selected', b === button));
    $('#raceWave').classList.toggle('master-wave', state.jkMode === 'master');
    renderRace(state.jkMode === 'master' ? 'Master-slave mode · one output transfer per full cycle.' : 'Level-sensitive mode · pulse width can permit repeated toggles.');
  }));
  $('#raceDuration').addEventListener('input', event => { state.raceDuration = Number(event.target.value); renderRace('Pulse width updated · run a cycle to observe the model.'); });
  $('#raceRun').addEventListener('click', () => {
    const j = state.signals['jk-j'], k = state.signals['jk-k'], before = state.signals['jk-q'];
    let after, transitions, message;
    if (state.jkMode === 'master') {
      after = ffNext('JK', { J: j, K: k }, before);
      transitions = after === before ? [before] : [before, after];
      message = `Master captures on HIGH; slave transfers on falling edge · Q changes once to ${after}.`;
    } else if (j && k) {
      transitions = Array.from({ length: state.raceDuration + 1 }, (_, i) => before ^ (i & 1));
      after = transitions.at(-1);
      message = `Illustrative model: ${state.raceDuration} internal toggle${state.raceDuration === 1 ? '' : 's'} · Q ends at ${after}. Real count varies with propagation delay.`;
    } else {
      after = ffNext('JK', { J: j, K: k }, before);
      transitions = after === before ? [before] : [before, after];
      message = `One JK action for J=${j}, K=${k} · Q changes to ${after}.`;
    }
    state.signals['jk-q'] = after;
    paintBit($('[data-bit="jk-q"]'), after);
    paintLed($('#raceBefore'), before);
    paintLed($('#raceAfter'), after);
    $('#raceStatus').textContent = message;
    const qWave = $('#qWave');
    qWave.innerHTML = transitions.map((value, index) => `<i class="q-segment ${value ? 'high' : 'low'}" title="Q = ${value}${index ? ` after toggle ${index}` : ' before clock'}"></i>`).join('');
    pulse($('#raceRun'));
  });
  $('#raceReset').addEventListener('click', () => {
    state.signals['jk-q'] = 0; paintBit($('[data-bit="jk-q"]'), 0); $('#qWave').innerHTML = '';
    renderRace('Experiment reset · Q = 0.');
  });

  const registerNames = {
    SISO: 'Serial In / Serial Out', SIPO: 'Serial In / Parallel Out', PISO: 'Parallel In / Serial Out',
    PIPO: 'Parallel In / Parallel Out', BIDIR: 'Bidirectional Shift', UNIVERSAL: 'Universal · Hold / Shift / Load'
  };
  function renderParallel() {
    $('#parallelBits').innerHTML = state.regParallel.map((value, index) => `<button class="bit-button ${value ? 'is-one' : ''}" data-bit="parallel-${3 - index}" aria-label="Toggle parallel input D${3 - index}">${value}</button>`).join('');
    $('#parallelOutput').textContent = state.regBits.join('');
  }
  function renderRegister(message) {
    $('#registerModeLabel').textContent = `${state.regMode} · ${registerNames[state.regMode]}`;
    $('#registerDirection').style.display = state.regMode === 'BIDIR' ? '' : 'none';
    $('#universalControl').style.display = state.regMode === 'UNIVERSAL' ? 'flex' : 'none';
    $('#serialControl').style.display = ['SISO', 'SIPO', 'BIDIR', 'UNIVERSAL'].includes(state.regMode) ? 'flex' : 'none';
    $('#serialOutPort').style.display = ['SISO', 'PISO', 'BIDIR', 'UNIVERSAL'].includes(state.regMode) ? '' : 'none';
    $('#parallelPanel').style.display = ['SIPO', 'PIPO', 'PISO', 'UNIVERSAL'].includes(state.regMode) ? '' : 'none';
    $('.parallel-outputs').style.display = state.regMode === 'PISO' ? 'none' : '';
    $('#serialInPort').style.display = ['SISO', 'SIPO', 'BIDIR', 'UNIVERSAL'].includes(state.regMode) ? '' : 'none';
    $('#serialOut').textContent = state.serialOut;
    $('#serialInLed').textContent = state.signals['serial-in'];
    $('#serialInLed').classList.toggle('active', state.signals['serial-in'] === 1);
    $('#serialOutLed').textContent = state.serialOut;
    $('#serialOutLed').classList.toggle('active', state.serialOut === 1);
    $('#registerBits').innerHTML = state.regBits.map((value, index) => `<div class="register-bit ${value ? 'active' : ''}"><span>Q${3 - index}</span><b>${value}</b><small>D${3 - index}</small></div>`).join('');
    renderParallel();
    if (message) $('#registerStatus').textContent = message;
    $$('.register-bit').forEach(el => { el.classList.remove('shifted'); void el.offsetWidth; el.classList.add('shifted'); });
  }
  $$('[data-reg-mode]').forEach(button => button.addEventListener('click', () => {
    state.regMode = button.dataset.regMode;
    $$('[data-reg-mode]').forEach(b => b.classList.toggle('selected', b === button));
    renderRegister(`Mode changed to ${state.regMode} · existing register contents retained.`);
  }));
  $$('[data-direction]').forEach(button => button.addEventListener('click', () => {
    state.regDirection = button.dataset.direction;
    $$('[data-direction]').forEach(b => b.classList.toggle('selected', b === button));
  }));
  $$('[data-reg-op]').forEach(button => button.addEventListener('click', () => {
    state.regOp = button.dataset.regOp;
    $$('[data-reg-op]').forEach(b => b.classList.toggle('selected', b === button));
  }));
  $('#registerPulse').addEventListener('click', () => {
    const old = state.regBits.slice();
    let direction = state.regDirection;
    if (state.regMode === 'UNIVERSAL') direction = state.regOp;
    if (state.regMode === 'PIPO' || (state.regMode === 'UNIVERSAL' && state.regOp === 'load')) {
      state.regBits = state.regParallel.slice();
      $('#registerStatus').textContent = `Clock edge · parallel word ${state.regBits.join('')} loaded into Q3…Q0.`;
    } else if (state.regMode === 'UNIVERSAL' && state.regOp === 'hold') {
      $('#registerStatus').textContent = `Clock edge · hold selected, word ${state.regBits.join('')} is unchanged.`;
    } else if (state.regMode === 'PISO' && !state.registerLoaded) {
      $('#registerStatus').textContent = 'Load a parallel word before shifting it out.';
      return;
    } else {
      if (direction === 'left') { state.serialOut = state.regBits[0]; state.regBits = [...state.regBits.slice(1), state.signals['serial-in']]; }
      else { state.serialOut = state.regBits[3]; state.regBits = [state.signals['serial-in'], ...state.regBits.slice(0, 3)]; }
      $('#registerStatus').textContent = `Rising edge · shifted ${state.regDirection === 'left' ? 'left' : 'right'}; serial out = ${state.serialOut}.`;
    }
    if (state.regMode === 'PISO') state.registerLoaded = true;
    pulse($('#registerPulse'));
    renderRegister($('#registerStatus').textContent);
    $('.register-stage').classList.add('is-pulsing'); setTimeout(() => $('.register-stage').classList.remove('is-pulsing'), 380);
    if (old.join('') !== state.regBits.join('')) $('#parallelOutput').textContent = state.regBits.join('');
  });
  $('#parallelLoad').addEventListener('click', () => {
    if (state.regMode === 'PISO' || state.regMode === 'UNIVERSAL' || state.regMode === 'PIPO') {
      state.regBits = state.regParallel.slice();
      state.regLoaded = true;
      state.registerLoaded = true;
      renderRegister(`Parallel load · Q3…Q0 = ${state.regBits.join('')}.`);
    } else {
      $('#registerStatus').textContent = 'Parallel loading is available in PISO, PIPO, and universal modes.';
    }
  });
  $('#registerReset').addEventListener('click', () => {
    state.regBits = [0, 0, 0, 0]; state.serialOut = 0; state.registerLoaded = false;
    renderRegister('Clear · all four storage bits are 0.');
  });

  function counterBits() {
    if (state.counterType === 'ring') return ['1000', '0100', '0010', '0001'][state.ringIndex].split('').map(Number);
    if (state.counterType === 'johnson') {
      const patterns = ['0000', '1000', '1100', '1110', '1111', '0111', '0011', '0001'];
      return patterns[state.johnsonIndex].split('').map(Number);
    }
    return state.count.toString(2).padStart(4, '0').slice(-4).split('').map(Number);
  }
  function activeModulus() {
    if (state.counterType === 'ring') return 4;
    if (state.counterType === 'johnson') return 8;
    if (state.counterType === 'decade') return 10;
    if (state.counterType === 'modn') return state.modulus;
    return 16;
  }
  function currentCounterIndex() {
    if (state.counterType === 'ring') return state.ringIndex;
    if (state.counterType === 'johnson') return state.johnsonIndex;
    return state.count;
  }
  function renderCounterBits() {
    const bits = counterBits();
    $('#counterBits').innerHTML = bits.map((value, index) => `<div class="counter-bit ${value ? 'active' : ''}"><span>Q${3 - index}</span><b>${value}</b></div>`).join('');
  }
  function nextCounterBits() {
    const bits = counterBits();
    if (state.counterType === 'ring') return bits.slice(1).concat(bits[0]);
    if (state.counterType === 'johnson') return [bits[3] ^ 1, bits[0], bits[1], bits[2]];
    const n = activeModulus();
    const direction = state.counterType === 'updown' ? state.countDirection : 'up';
    return ((state.count + (direction === 'up' ? 1 : -1) + n) % n).toString(2).padStart(4, '0').slice(-4).split('').map(Number);
  }
  function renderCounter() {
    const bits = counterBits(), n = activeModulus(), index = currentCounterIndex();
    $('#counterDecimal').textContent = state.counterType === 'ring' || state.counterType === 'johnson' ? String(index) : String(state.count);
    $('#modProgress').textContent = `MOD ${n} · ${index} / ${n} states`;
    $('#sequencePosition').textContent = `${index + 1} / ${n}`;
    $('#counterNext').textContent = nextCounterBits().join('');
    $('#modulusOption').style.display = state.counterType === 'modn' ? 'flex' : 'none';
    $('#countDirection').style.display = state.counterType === 'updown' ? 'flex' : 'none';
    $('#counterClock').textContent = 'LOW';
    $('#counterClock').style.color = 'var(--blue)';
    renderCounterBits();
    renderTiming();
  }
  function stepCounter() {
    const oldBits = counterBits();
    if (state.counterType === 'ring') state.ringIndex = (state.ringIndex + 1) % 4;
    else if (state.counterType === 'johnson') state.johnsonIndex = (state.johnsonIndex + 1) % 8;
    else {
      const n = activeModulus();
      const direction = state.counterType === 'updown' ? state.countDirection : 'up';
      state.count = (state.count + (direction === 'up' ? 1 : -1) + n) % n;
    }
    const newBits = counterBits();
    state.history.push(newBits.join(''));
    if (state.history.length > 9) state.history.shift();
    $('#counterClock').textContent = 'HIGH';
    $('#counterClock').style.color = 'var(--orange)';
    $('#counterAnimation').innerHTML = state.counterType === 'ripple'
      ? 'RIPPLE <i class="ripple-chain">Q0 → Q1 → Q2 → Q3</i>'
      : state.counterType === 'sync' || state.counterType === 'updown' || state.counterType === 'decade' || state.counterType === 'modn'
        ? 'SYNC <i>Q3…Q0 update together</i>' : 'FEEDBACK <i>one stage advances</i>';
    renderCounter();
    $$('.counter-bit').forEach((el, index) => {
      if (oldBits[index] === newBits[index]) return;
      const delay = state.counterType === 'ripple' ? (3 - index) * 85 : 0;
      setTimeout(() => { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }, delay);
    });
    $('#counterClock').textContent = 'HIGH';
    $('#counterClock').style.color = 'var(--orange)';
    $('#counterStatus').textContent = `${state.counterType === 'ripple' ? 'Ripple transition' : 'Rising clock edge'} · ${oldBits.join('')} → ${newBits.join('')} (${state.count}).`;
    setTimeout(() => { $('#counterClock').textContent = 'LOW'; $('#counterClock').style.color = 'var(--blue)'; }, 260);
  }
  function renderTiming() {
    const chart = $('#timingChart');
    if (!chart) return;
    const samples = state.history.length ? state.history : [counterBits().join('')];
    const intervals = Math.max(0, samples.length - 1), left = 45, right = 12, width = 840, plotW = width - left - right, step = plotW / Math.max(1, intervals);
    const rows = [{ name: 'CLK', color: 'CLK', y: 19 }, { name: 'Q3', color: 'Q3', y: 43 }, { name: 'Q2', color: 'Q2', y: 67 }, { name: 'Q1', color: 'Q1', y: 91 }, { name: 'Q0', color: 'Q0', y: 115 }];
    let svg = `<svg viewBox="0 0 ${width} 145" preserveAspectRatio="none" role="img" aria-label="Counter timing diagram with ${samples.length - 1} recorded clock intervals">`;
    rows.forEach(row => { svg += `<line class="chart-grid" x1="${left}" y1="${row.y}" x2="${width - right}" y2="${row.y}"/><text class="chart-label" x="7" y="${row.y + 3}">${row.name}</text>`; });
    for (let i = 0; i <= intervals; i++) { const x = left + i * step; svg += `<line class="chart-grid" x1="${x}" y1="8" x2="${x}" y2="128"/><text class="chart-time" x="${x - 3}" y="140">${i}</text>`; }
    rows.forEach(row => {
      const highY = row.y - 7, lowY = row.y + 7;
      let d = '';
      if (row.name === 'CLK') {
        if (intervals === 0) d = `M${left} ${lowY} H${width - right}`;
        else for (let i = 0; i < intervals; i++) {
          const x0 = left + i * step, rise = x0 + step * 0.5, fall = x0 + step * 0.85, x1 = x0 + step;
          d += `${i === 0 ? `M${x0} ${lowY}` : ''} L${rise} ${lowY} L${rise} ${highY} L${fall} ${highY} L${fall} ${lowY} L${x1} ${lowY} `;
        }
      } else {
        const bitIndex = Number(row.name[1]);
        const initial = Number(samples[0][3 - bitIndex]);
        d = `M${left} ${initial ? highY : lowY}`;
        for (let i = 1; i < samples.length; i++) {
          const x0 = left + (i - 1) * step, x1 = x0 + step;
          const previous = Number(samples[i - 1][3 - bitIndex]), current = Number(samples[i][3 - bitIndex]);
          if (previous === current) d += ` H${x1}`;
          else {
            const rippleDelay = state.counterType === 'ripple' ? 0.035 + (3 - bitIndex) * 0.06 : 0;
            const changeX = x0 + step * (0.5 + rippleDelay);
            d += ` H${changeX} V${current ? highY : lowY} H${x1}`;
          }
        }
        d += ` H${width - right}`;
      }
      svg += `<path class="chart-line chart-${row.color}" d="${d}"/>`;
    });
    svg += '</svg>';
    chart.innerHTML = svg;
  }
  function stopCounterRun() {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
    $('#counterRun').textContent = '▶ Run sequence';
    $('#counterRun').classList.remove('running');
  }
  $$('[data-counter]').forEach(button => button.addEventListener('click', () => {
    stopCounterRun();
    state.counterType = button.dataset.counter;
    state.count = 0; state.ringIndex = 0; state.johnsonIndex = 0;
    $$('[data-counter]').forEach(b => b.classList.toggle('selected', b === button));
    state.history = [counterBits().join('')];
    $('#counterStatus').textContent = `${button.querySelector('b').textContent} selected · sequence reset to its initial state.`;
    renderCounter();
  }));
  $$('[data-count-dir]').forEach(button => button.addEventListener('click', () => {
    state.countDirection = button.dataset.countDir;
    $$('[data-count-dir]').forEach(b => b.classList.toggle('selected', b === button));
    $('#counterStatus').textContent = `Direction set to ${state.countDirection}.`;
    renderCounter();
  }));
  $('#modulusInput').addEventListener('change', event => {
    const value = Math.max(2, Math.min(16, Math.round(Number(event.target.value) || 2)));
    event.target.value = value; state.modulus = value; state.count %= value;
    state.history = [counterBits().join('')];
    $('#counterStatus').textContent = `MOD-${value} selected · sequence reset within the new range.`;
    renderCounter();
  });
  $('#counterStep').addEventListener('click', stepCounter);
  $('#counterRun').addEventListener('click', () => {
    if (state.timer) { stopCounterRun(); $('#counterStatus').textContent = 'Sequence paused.'; return; }
    const speed = Number($('#runSpeed').value);
    $('#counterRun').textContent = 'Ⅱ Pause sequence';
    $('#counterRun').classList.add('running');
    $('#counterStatus').textContent = 'Sequence running · press pause to stop.';
    stepCounter();
    state.timer = setInterval(stepCounter, speed);
  });
  $('#runSpeed').addEventListener('change', () => {
    if (state.timer) { stopCounterRun(); $('#counterRun').click(); }
  });
  $('#counterReset').addEventListener('click', () => {
    stopCounterRun(); state.count = 0; state.ringIndex = 0; state.johnsonIndex = 0;
    state.history = [counterBits().join('')];
    $('#counterAnimation').innerHTML = 'CLK <i>▁▁▁▁</i>';
    $('#counterStatus').textContent = 'Reset · counter returned to its initial state.';
    renderCounter();
  });
  $('#clearTiming').addEventListener('click', () => {
    state.history = [counterBits().join('')]; renderTiming();
    $('#counterStatus').textContent = 'Timing history cleared · current state retained.';
  });

  function resetAll() {
    Object.keys(state.signals).forEach(key => { state.signals[key] = ({ 'jk-j': 1 }[key] ?? 0); });
    state.latchEnabled = false; state.latchQ = 0; state.dffQ = 0; state.rsQ = 0; rsLastMessage = 'Reset · Q = 0.';
    state.ffQ = 0; Object.keys(state.ffInputs).forEach(key => state.ffInputs[key] = 0);
    state.signals['jk-j'] = 1; state.signals['jk-k'] = 1; state.signals['jk-q'] = 0;
    state.regBits = [0, 0, 0, 0]; state.regParallel = [1, 0, 1, 1]; state.serialOut = 0; state.registerLoaded = false;
    stopCounterRun(); state.count = 0; state.ringIndex = 0; state.johnsonIndex = 0; state.history = [counterBits().join('')];
    $$('[data-bit]').forEach(button => {
      const key = button.dataset.bit;
      const value = key.startsWith('parallel-') ? state.regParallel[Number(key.slice(-1))] : (key.startsWith('ff-') ? state.ffInputs[key.slice(3).toUpperCase()] : state.signals[key]);
      if (value !== undefined) paintBit(button, value);
    });
    renderCombinational(); renderMemory('Reset · stored outputs are 0.'); renderRs(); renderFfControls(); renderFf('Reset · Q = 0.'); renderRace('Reset · Q = 0.'); renderRegister('Reset · register and serial output cleared.'); renderCounter();
  }

  $('#contrastButton').addEventListener('click', () => {
    document.body.classList.toggle('focus-mode');
    $('#contrastButton').setAttribute('aria-pressed', String(document.body.classList.contains('focus-mode')));
  });
  $('#menuButton').addEventListener('click', () => {
    const open = $('#sidebar').classList.toggle('open');
    $('#menuButton').setAttribute('aria-expanded', String(open));
    $('#menuButton').setAttribute('aria-label', open ? 'Close lesson navigation' : 'Open lesson navigation');
  });
  $$('.nav-link').forEach(link => link.addEventListener('click', () => { $('#sidebar').classList.remove('open'); $('#menuButton').setAttribute('aria-expanded', 'false'); }));
  document.addEventListener('keydown', event => {
    if (event.code === 'Space' && !event.repeat && !/INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement.tagName)) { event.preventDefault(); $('#ffPulse').click(); }
    if (event.key.toLowerCase() === 'r' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) resetAll();
    if (event.key === 'Escape') { $('#sidebar').classList.remove('open'); $('#menuButton').setAttribute('aria-expanded', 'false'); }
  });
  const sectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) $$('.nav-link').forEach(link => link.classList.toggle('active', link.hash === `#${entry.target.id}`)); });
  }, { rootMargin: '-20% 0px -65% 0px' });
  $$('.lesson-section').forEach(section => sectionObserver.observe(section));

  // Initial paint: each model starts in a defined, visible state.
  $$('[data-bit]').forEach(button => {
    const key = button.dataset.bit;
    const value = key.startsWith('ff-') ? state.ffInputs[key.slice(3).toUpperCase()] : key.startsWith('parallel-') ? state.regParallel[Number(key.slice(-1))] : state.signals[key];
    if (value !== undefined) paintBit(button, value);
  });
  renderCombinational(); renderMemory('Both outputs start at 0.'); renderRs(); updateRsButtonLabels(); renderFfControls(); renderFf(); renderRace(); renderRegister('Ready · pulse the clock to move the word.'); state.history = [counterBits().join('')]; renderCounter();
})();
