// Inventory system — item collection and HUD rendering.
// Requires: state.js (inventory, controls), config.js (INV_MAX_PER_TYPE, INV_MAX_TOTAL)

function inventoryTotal() {
  return Object.values(inventory).reduce((sum, n) => sum + n, 0);
}

// ── Inventory rejection feedback ──────────────────────────────────────────────

let _invRejectTooltipShown = { total_full: false, type_full: false };

function _onInventoryRejected(reason) {
  // Audio clunk with cooldown
  if (typeof playInventoryFullSound === 'function') playInventoryFullSound();

  // Visual flash on #inventory-hud
  var hudEl = document.getElementById('inventory-hud');
  if (hudEl) {
    hudEl.classList.remove('inv-full-flash');
    // Force reflow so re-adding the class restarts the animation
    void hudEl.offsetWidth;
    hudEl.classList.add('inv-full-flash');
    setTimeout(function () { hudEl.classList.remove('inv-full-flash'); }, INV_REJECT_FLASH_MS);
  }

  // One-time educational tooltip
  if (!_invRejectTooltipShown[reason] && typeof gameTooltip === 'function') {
    _invRejectTooltipShown[reason] = true;
    if (reason === 'type_full') {
      gameTooltip('inventoryTypeFull');
    } else {
      gameTooltip('inventoryFull');
    }
  }
}

/** Add one block of the given CSS hex color to inventory.
 *  Returns true if added, false if caps were reached. */
function addToInventory(cssColor) {
  if (inventoryTotal() >= INV_MAX_TOTAL) {
    _onInventoryRejected('total_full');
    return false;
  }
  const current = inventory[cssColor] || 0;
  if (current >= INV_MAX_PER_TYPE) {
    _onInventoryRejected('type_full');
    return false;
  }
  inventory[cssColor] = current + 1;
  // Auto-select first block type collected
  if (!selectedBlockColor) selectedBlockColor = cssColor;
  updateInventoryHUD();
  // Contextual game tooltip: first inventory pickup
  if (typeof gameTooltip === 'function') gameTooltip('inventoryPickup');
  // Context-sensitive crafting hint (fires once when player first gets Wood)
  // Suppress in Sprint/Blitz modes where crafting is disabled.
  if (cssColor === '#8b4513' && typeof craftHintCheck === 'function' &&
      !isSprintMode && !isBlitzMode) {
    craftHintCheck(inventory);
  }
  return true;
}

/** Return the currently selected color if still in inventory, else auto-pick first available. */
function getSelectedColor() {
  const entries = Object.entries(inventory).filter(([, n]) => n > 0);
  if (!entries.length) return null;
  if (selectedBlockColor && inventory[selectedBlockColor] > 0) return selectedBlockColor;
  // Auto-pick first available
  selectedBlockColor = entries[0][0];
  return selectedBlockColor;
}

/** Select a specific color as the active block type. */
function selectBlockColor(color) {
  if (!color || !inventory[color] || inventory[color] <= 0) return;
  selectedBlockColor = color;
  updateInventoryHUD();
}

/** Cycle through available inventory colors. direction: +1 forward, -1 backward. */
function cycleSelectedBlock(direction) {
  const entries = Object.entries(inventory).filter(([, n]) => n > 0);
  if (!entries.length) return;
  const colors = entries.map(([c]) => c);
  const current = getSelectedColor();
  const idx = colors.indexOf(current);
  const newIdx = ((idx + direction) + colors.length) % colors.length;
  selectedBlockColor = colors[newIdx];
  updateInventoryHUD();
}

/** Re-render the bottom inventory bar from current inventory state. */
function updateInventoryHUD() {
  const hud = document.getElementById("inventory-hud");
  const slotsEl = document.getElementById("inventory-slots");
  const totalEl = document.getElementById("inventory-total");

  const total = inventoryTotal();
  const entries = Object.entries(inventory).filter(([, n]) => n > 0);

  if (entries.length === 0) {
    hud.style.display = "none";
    return;
  }

  // Only show during active play
  if (controls && controls.isLocked) {
    hud.style.display = "flex";
  }
  totalEl.textContent = "Inventar: " + total + "/" + INV_MAX_TOTAL;
  // Amber warning at 90%+ capacity
  if (total >= Math.floor(INV_MAX_TOTAL * INV_WARN_THRESHOLD)) {
    totalEl.classList.add('inv-warning');
  } else {
    totalEl.classList.remove('inv-warning');
  }

  slotsEl.innerHTML = "";
  const currentSelected = getSelectedColor();
  entries.forEach(([color, count], i) => {
    const slot = document.createElement("div");
    slot.className = color === currentSelected ? "inv-slot selected" : "inv-slot";
    slot.dataset.color = color;

    const numEl = document.createElement("div");
    numEl.className = "inv-slot-num";
    numEl.textContent = i + 1;

    const swatch = document.createElement("div");
    swatch.className = "inv-slot-color";
    swatch.style.backgroundColor = color;

    const countEl = document.createElement("div");
    countEl.className = "inv-slot-count";
    countEl.textContent = count;

    slot.appendChild(numEl);
    slot.appendChild(swatch);
    slot.appendChild(countEl);
    slotsEl.appendChild(slot);
  });
}

/** Convert a THREE.Color to a CSS hex color string. */
function threeColorToCss(threeColor) {
  return "#" + threeColor.getHexString();
}
