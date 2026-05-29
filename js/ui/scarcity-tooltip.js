// Scarcity HUD hover/long-press tooltips — shows ore phase labels.
// Requires: scarcity.js (getScarcityPhase, _SCARCITY_HUD_TYPES)

const _scTooltipEl = (() => {
  const el = document.createElement('div');
  el.className = 'scarcity-tooltip';
  el.innerHTML = '<div class="ore-name"></div><div class="phase-label"></div><div class="timing-hint"></div>';
  document.body.appendChild(el);
  return el;
})();

let _scTooltipTarget = null;
let _scLongPressTimer = null;
let _scTouchStartXY = null;

function _scShowTooltip(swatchEl) {
  const idx = parseInt(swatchEl.getAttribute('data-type-idx'), 10);
  const meta = _SCARCITY_HUD_TYPES.find(t => t.idx === idx);
  const phase = getScarcityPhase(idx);
  if (!meta || !phase) return;

  _scTooltipEl.querySelector('.ore-name').textContent = meta.label;
  const phaseEl = _scTooltipEl.querySelector('.phase-label');
  phaseEl.textContent = phase.label;
  phaseEl.style.color = phase.color;
  _scTooltipEl.querySelector('.timing-hint').textContent = phase.hint;

  const rect = swatchEl.getBoundingClientRect();
  const ttW = 140;
  let left = rect.left + rect.width / 2 - ttW / 2;
  left = Math.max(4, Math.min(left, window.innerWidth - ttW - 4));

  let top = rect.top - _scTooltipEl.offsetHeight - 4;
  if (top < 4) top = rect.bottom + 4;

  _scTooltipEl.style.left = left + 'px';
  _scTooltipEl.style.top = top + 'px';
  _scTooltipEl.classList.add('visible');
  _scTooltipTarget = swatchEl;
}

function _scHideTooltip() {
  _scTooltipEl.classList.remove('visible');
  _scTooltipTarget = null;
}

function _scCancelLongPress() {
  if (_scLongPressTimer) { clearTimeout(_scLongPressTimer); _scLongPressTimer = null; }
}

document.addEventListener('DOMContentLoaded', () => {
  const hud = document.getElementById('scarcity-hud');
  if (!hud) return;

  hud.addEventListener('mouseenter', (e) => {
    const sw = e.target.closest('.sc-swatch');
    if (sw) _scShowTooltip(sw);
  }, true);

  hud.addEventListener('mouseleave', (e) => {
    const sw = e.target.closest('.sc-swatch');
    if (sw && sw === _scTooltipTarget) _scHideTooltip();
  }, true);

  hud.addEventListener('mousemove', (e) => {
    const sw = e.target.closest('.sc-swatch');
    if (sw && sw !== _scTooltipTarget) _scShowTooltip(sw);
    else if (!sw && _scTooltipTarget) _scHideTooltip();
  }, true);

  hud.addEventListener('touchstart', (e) => {
    const sw = e.target.closest('.sc-swatch');
    if (!sw) return;
    const touch = e.touches[0];
    _scTouchStartXY = { x: touch.clientX, y: touch.clientY };
    _scCancelLongPress();
    _scLongPressTimer = setTimeout(() => { _scShowTooltip(sw); _scLongPressTimer = null; }, 400);
  }, { passive: true });

  hud.addEventListener('touchmove', (e) => {
    if (!_scLongPressTimer && !_scTooltipTarget) return;
    const touch = e.touches[0];
    if (_scTouchStartXY) {
      const dx = touch.clientX - _scTouchStartXY.x;
      const dy = touch.clientY - _scTouchStartXY.y;
      if (dx * dx + dy * dy > 100) { _scCancelLongPress(); _scHideTooltip(); }
    }
  }, { passive: true });

  hud.addEventListener('touchend', () => { _scCancelLongPress(); _scHideTooltip(); }, { passive: true });
});
