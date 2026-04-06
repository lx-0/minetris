// Input display overlay — real-time key press visualiser for streaming / replays.
// Requires: keybindings.js (getKeyBinding, _kbDisplayCode) loaded first.
//
// Public API:
//   initInputDisplay()            — call once after DOM ready
//   toggleInputDisplay()          — toggle on/off (also bound to F2)
//   inputDisplayKeyEvent(code, isDown) — called from onKeyDown / onKeyUp

const INPUT_DISPLAY_STORAGE_KEY = 'mineCtris_inputDisplay';

// Global enabled flag (read by settings toggle).
let inputDisplayEnabled = false;

// Map of action → current press state (true = active).
const _idActiveActions = {};

// Map of action → total press count this session.
const _idPressCounts = {};

// Actions to visualise, in layout order.
// Each entry: { action, label } where label is a short display name.
const _INPUT_DISPLAY_ACTIONS = [
  // Row 1 — rotations
  { action: 'nudgeLeft',  label: 'CCW',  row: 0, col: 0 },
  { action: 'rotate180',  label: '180',  row: 0, col: 1 },
  { action: 'nudgeRight', label: 'CW',   row: 0, col: 2 },
  // Row 2 — lateral / soft drop
  { action: 'moveLeft',   label: '←',    row: 1, col: 0 },
  { action: 'softDrop',   label: 'SD',   row: 1, col: 1 },
  { action: 'moveRight',  label: '→',    row: 1, col: 2 },
  // Row 3 — depth / hard drop
  { action: 'nudgeBack',  label: 'Z',    row: 2, col: 0 },
  { action: 'hardDrop',   label: 'HD',   row: 2, col: 1 },
  { action: 'nudgeFwd',   label: 'X',    row: 2, col: 2 },
  // Row 4 — hold (centred)
  { action: 'hold',       label: 'HLD',  row: 3, col: 1 },
];

let _idOverlay      = null; // outer wrapper
let _idKeyEls       = {};   // action → { wrapper, keyEl, countEl }
let _idStyleInjected = false;

// ── Style injection ───────────────────────────────────────────────────────────

function _injectInputDisplayStyle() {
  if (_idStyleInjected) return;
  _idStyleInjected = true;
  const style = document.createElement('style');
  style.textContent = [
    '#input-display-overlay {',
    '  position: fixed;',
    '  bottom: 80px;',
    '  left: 12px;',
    '  z-index: 2000;',
    '  pointer-events: none;',
    '  display: grid;',
    '  grid-template-rows: repeat(4, 34px);',
    '  grid-template-columns: repeat(3, 34px);',
    '  gap: 4px;',
    '  padding: 8px;',
    '  background: rgba(0,0,0,0.45);',
    '  border-radius: 8px;',
    '  border: 1px solid rgba(255,255,255,0.1);',
    '  transition: opacity 0.2s;',
    '}',
    '#input-display-overlay.id-hidden { display: none; }',
    '.id-key-cell {',
    '  display: flex;',
    '  flex-direction: column;',
    '  align-items: center;',
    '  justify-content: center;',
    '}',
    '.id-key {',
    '  width: 30px;',
    '  height: 24px;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  border-radius: 4px;',
    '  border: 1px solid rgba(255,255,255,0.25);',
    '  background: rgba(255,255,255,0.08);',
    '  font-family: "Press Start 2P", monospace;',
    '  font-size: 6px;',
    '  color: rgba(255,255,255,0.3);',
    '  transition: background 0.05s, color 0.05s, border-color 0.05s, box-shadow 0.05s;',
    '  line-height: 1;',
    '}',
    '.id-key.id-active {',
    '  background: rgba(255,255,255,0.9);',
    '  color: #111;',
    '  border-color: rgba(255,255,255,0.9);',
    '  box-shadow: 0 0 6px rgba(255,255,255,0.55);',
    '}',
    '.id-key-label {',
    '  font-family: "Press Start 2P", monospace;',
    '  font-size: 5px;',
    '  color: rgba(255,255,255,0.4);',
    '  margin-top: 2px;',
    '  white-space: nowrap;',
    '  overflow: hidden;',
    '  max-width: 32px;',
    '  text-align: center;',
    '}',
    '.id-count {',
    '  font-family: "Press Start 2P", monospace;',
    '  font-size: 4px;',
    '  color: rgba(255,255,255,0.3);',
    '  margin-top: 1px;',
    '  min-height: 6px;',
    '}',
  ].join('\n');
  document.head.appendChild(style);
}

// ── DOM creation ─────────────────────────────────────────────────────────────

function _buildInputDisplayOverlay() {
  _idOverlay = document.createElement('div');
  _idOverlay.id = 'input-display-overlay';
  _idOverlay.classList.add('id-hidden');
  _idOverlay.setAttribute('aria-hidden', 'true');

  for (const entry of _INPUT_DISPLAY_ACTIONS) {
    const cell = document.createElement('div');
    cell.className = 'id-key-cell';
    // Grid placement (1-indexed).
    cell.style.gridRow    = String(entry.row + 1);
    cell.style.gridColumn = String(entry.col + 1);

    const keyEl = document.createElement('div');
    keyEl.className = 'id-key';

    const labelEl = document.createElement('div');
    labelEl.className = 'id-key-label';

    const countEl = document.createElement('div');
    countEl.className = 'id-count';
    countEl.textContent = '';

    cell.appendChild(keyEl);
    cell.appendChild(labelEl);
    cell.appendChild(countEl);
    _idOverlay.appendChild(cell);

    _idKeyEls[entry.action] = { keyEl, labelEl, countEl };
    _idActiveActions[entry.action] = false;
    _idPressCounts[entry.action]   = 0;
  }

  document.body.appendChild(_idOverlay);
  _refreshKeyLabels();
}

// ── Label refresh (after keybindings change) ──────────────────────────────────

function _refreshKeyLabels() {
  for (const entry of _INPUT_DISPLAY_ACTIONS) {
    const els = _idKeyEls[entry.action];
    if (!els) continue;
    // Show the currently bound key code in short form.
    let keyLabel = entry.label; // fallback to action shortname
    if (typeof getKeyBinding === 'function' && typeof _kbDisplayCode === 'function') {
      const code = getKeyBinding(entry.action);
      if (code) keyLabel = _kbDisplayCode(code);
    }
    els.keyEl.textContent   = keyLabel;
    els.labelEl.textContent = entry.label;
  }
}

// ── Toggle ────────────────────────────────────────────────────────────────────

function toggleInputDisplay() {
  inputDisplayEnabled = !inputDisplayEnabled;
  _applyInputDisplayVisible();
  try {
    localStorage.setItem(INPUT_DISPLAY_STORAGE_KEY, String(inputDisplayEnabled));
  } catch (_) {}
  // Sync settings toggle if panel is open.
  const toggle = document.getElementById('input-display-toggle');
  if (toggle) toggle.checked = inputDisplayEnabled;
}

function _applyInputDisplayVisible() {
  if (!_idOverlay) return;
  _idOverlay.classList.toggle('id-hidden', !inputDisplayEnabled);
}

function _loadInputDisplay() {
  try {
    const raw = localStorage.getItem(INPUT_DISPLAY_STORAGE_KEY);
    if (raw !== null) inputDisplayEnabled = (raw === 'true');
  } catch (_) {}
}

// ── Key event handler ─────────────────────────────────────────────────────────

/**
 * Called from onKeyDown / onKeyUp in player.js.
 * @param {string} code  — KeyboardEvent.code (raw, before _resolveKeyCode)
 * @param {boolean} isDown
 */
function inputDisplayKeyEvent(code, isDown) {
  if (!inputDisplayEnabled) return;
  // Find which action this code is bound to.
  if (typeof _kbReverseMap === 'undefined') return;
  const action = _kbReverseMap[code];
  if (!action || !_idKeyEls[action]) return;

  const wasDown = _idActiveActions[action];
  _idActiveActions[action] = isDown;

  const els = _idKeyEls[action];
  if (els) {
    els.keyEl.classList.toggle('id-active', isDown);
    if (isDown && !wasDown) {
      _idPressCounts[action]++;
      els.countEl.textContent = _idPressCounts[action];
    }
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

function initInputDisplay() {
  _injectInputDisplayStyle();
  _loadInputDisplay();
  _buildInputDisplayOverlay();
  _applyInputDisplayVisible();
}
