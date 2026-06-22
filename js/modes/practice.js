// Practice mode — undo system and game-over overlay.
// Requires: state.js (isPracticeMode, practiceUndoEnabled, practiceUndoHistory,
//           score, blocksMined, linesCleared, gameElapsedSeconds, comboCount,
//           lastClearTime, sessionHighestComboCount, isGameOver, gameTimerRunning,
//           controls, worldGroup, gridOccupancy),
//           gamestate.js (updateScoreHUD, updateDangerWarning),
//           world.js (createBlockMesh, registerBlock),
//           crafting.js (showCraftedBanner)

const PRACTICE_MAX_UNDO = 20;

/**
 * Capture a snapshot of the current landed blocks and stats onto the undo stack.
 * Called after each piece lands (from saveGameState when isPracticeMode is true).
 */
function capturePracticeSnapshot() {
  if (!isPracticeMode) return;
  const landedBlocks = [];
  worldGroup.children.forEach(function (obj) {
    if (obj.name === "landed_block" && obj.userData.isBlock && obj.userData.gridPos) {
      const gp = obj.userData.gridPos;
      landedBlocks.push({
        x: gp.x, y: gp.y, z: gp.z,
        color: (obj.userData.canonicalColor !== undefined)
          ? obj.userData.canonicalColor
          : obj.material.color.getHex()
      });
    }
  });
  const snapshot = {
    blocks: landedBlocks,
    score: score,
    linesCleared: linesCleared,
    blocksMined: blocksMined,
    comboCount: comboCount,
    lastClearTime: lastClearTime,
    sessionHighestComboCount: sessionHighestComboCount
  };
  if (practiceUndoHistory.length >= PRACTICE_MAX_UNDO) {
    practiceUndoHistory.shift();
  }
  practiceUndoHistory.push(snapshot);
}

/**
 * Restore the previous world state from the undo stack.
 * Clears all landed blocks and re-places them from the snapshot.
 */
function undoPracticePlacement() {
  if (!isPracticeMode || !practiceUndoEnabled) return;
  if (practiceUndoHistory.length === 0) {
    if (typeof showCraftedBanner === "function") showCraftedBanner("Nothing to undo.");
    return;
  }

  const snapshot = practiceUndoHistory.pop();

  // Remove all currently landed blocks from Three.js scene and gridOccupancy
  const toRemove = worldGroup.children.filter(function (obj) {
    return obj.name === "landed_block" && obj.userData.isBlock;
  });
  toRemove.forEach(function (obj) {
    if (obj.userData.gridPos) {
      const gp = obj.userData.gridPos;
      const key = gp.x + "," + gp.z;
      const row = gridOccupancy.get(gp.y);
      if (row) {
        row.delete(key);
        if (row.size === 0) gridOccupancy.delete(gp.y);
      }
    }
    worldGroup.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  });

  // Restore blocks from snapshot
  snapshot.blocks.forEach(function (b) {
    const block = createBlockMesh(b.color);
    block.position.set(b.x, b.y, b.z);
    block.name = "landed_block";
    worldGroup.add(block);
    registerBlock(block);
  });

  // Restore stats
  score                     = snapshot.score;
  linesCleared              = snapshot.linesCleared;
  blocksMined               = snapshot.blocksMined;
  comboCount                = snapshot.comboCount;
  lastClearTime             = snapshot.lastClearTime;
  sessionHighestComboCount  = snapshot.sessionHighestComboCount;

  // Refresh HUDs
  if (typeof updateScoreHUD       === "function") updateScoreHUD();
  if (typeof updateDangerWarning  === "function") updateDangerWarning();

  if (typeof showCraftedBanner === "function") showCraftedBanner("Undo");
}

/**
 * Freeze gameplay and show the practice-complete overlay on game over.
 * Does NOT submit lifetime stats, high scores, or award XP.
 */
function triggerPracticeGameOver() {
  if (isGameOver) return;
  isGameOver       = true;
  gameTimerRunning = false;

  // Hide danger overlay
  const dangerEl     = document.getElementById("danger-overlay");
  const dangerTextEl = document.getElementById("danger-text");
  if (dangerEl)     dangerEl.style.display     = "none";
  if (dangerTextEl) dangerTextEl.style.display = "none";

  // Populate session stats in the overlay
  const totalSecs = Math.floor(gameElapsedSeconds);
  const mm = Math.floor(totalSecs / 60).toString().padStart(2, "0");
  const ss = (totalSecs % 60).toString().padStart(2, "0");

  const statsEl = document.getElementById("practice-stats");
  if (statsEl) {
    statsEl.innerHTML =
      `<div><span class="go-label">LINES CLEARED</span><br>${linesCleared}</div>` +
      `<div><span class="go-label">MINED</span><br>${blocksMined}</div>` +
      `<div><span class="go-label">BEST COMBO</span><br>${sessionHighestComboCount}</div>` +
      `<div><span class="go-label">TIME</span><br>${mm}:${ss}</div>`;
  }

  const overlayEl = document.getElementById("practice-complete-screen");
  if (overlayEl) overlayEl.style.display = "flex";

  if (typeof stopBgMusic        === "function") stopBgMusic();
  if (typeof playGameOverJingle === "function") playGameOverJingle();

  if (controls && controls.isLocked) controls.unlock();
}
