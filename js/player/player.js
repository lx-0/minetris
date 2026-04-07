// Player — movement collision and keyboard input handlers.
// Requires: state.js, config.js

function checkPlayerCollision(deltaY) {
  playerOnGround = false;
  if (!controls) return false;
  const playerPosition = controls.getObject().position;
  const capsuleHalfHeight = PLAYER_HEIGHT / 2;
  const downRayOrigin = playerPosition.clone();
  const downRaycaster = new THREE.Raycaster(
    downRayOrigin,
    new THREE.Vector3(0, -1, 0),
    0,
    capsuleHalfHeight + 0.1
  );
  const downIntersects = downRaycaster.intersectObjects(
    worldGroup.children,
    true
  );
  let onSolidGround = false;
  if (downIntersects.length > 0) {
    const distance = downIntersects[0].distance;
    if (distance <= capsuleHalfHeight + 0.05) {
      playerVelocity.y = Math.max(0, playerVelocity.y);
      playerPosition.y += capsuleHalfHeight - distance + 0.01;
      onSolidGround = true;
    }
  }
  // Fallback floor at the surface level — skip in Survival mode.
  if (
    !onSolidGround &&
    !isSurvivalMode &&
    playerPosition.y <= capsuleHalfHeight + BLOCK_SIZE / 2
  ) {
    playerVelocity.y = Math.max(0, playerVelocity.y);
    playerPosition.y = capsuleHalfHeight + BLOCK_SIZE / 2;
    onSolidGround = true;
  }
  playerOnGround = onSolidGround;
  if (playerOnGround) {
    canJump = true;
    // Detect ice block underfoot for friction modifier.
    if (downIntersects.length > 0 && downIntersects[0].distance <= capsuleHalfHeight + 0.05) {
      const hitObj = downIntersects[0].object;
      const matType = hitObj.userData.materialType ||
        (hitObj.parent && hitObj.parent.userData.materialType);
      playerStandingOnIce = matType === "ice";
    } else {
      playerStandingOnIce = false;
    }
  } else {
    playerStandingOnIce = false;
  }
  return false;
}

/**
 * Teleport the player back to above the surface. Called as a safety net when
 * the player falls below the bedrock floor.
 */
function returnPlayerToSurface() {
  if (!controls) return;
  controls.getObject().position.set(
    controls.getObject().position.x,
    PLAYER_HEIGHT + BLOCK_SIZE,
    controls.getObject().position.z
  );
  playerVelocity.y = 0;
}

// Hold-C detection for co-op thumbs-up emote
var _cKeyHoldTimeout = null;

function onKeyDown(event) {
  // Emote wheel open — ESC cancels, arrow keys navigate, other keys pass through
  if (typeof chatEmotes !== 'undefined' && chatEmotes.isOpen()) {
    if (event.code === 'Escape') {
      chatEmotes.cancelWheel();
      return;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(event.code) >= 0) {
      event.preventDefault();
      chatEmotes.handleArrow(event.code);
      return;
    }
  }
  // When crafting panel is open the pointer is unlocked; still allow craft key/Escape to close it
  if (craftingPanelOpen) {
    if (_resolveKeyCode(event.code) === "KeyC" || event.code === "Escape") {
      closeCraftingPanel();
    }
    return;
  }
  // When co-op trade panel is open; Escape cancels
  if (typeof coopTradePanelOpen !== 'undefined' && coopTradePanelOpen) {
    if (event.code === "Escape") {
      if (typeof coopTrade !== 'undefined') coopTrade.closePanel();
    }
    return;
  }
  // Allow P to trigger Play Again from the game-over screen
  if (isGameOver && event.code === "KeyP") {
    if (typeof resetGame === "function") resetGame();
    return;
  }
  // F2: toggle input display overlay (works at any time including game-over / replay).
  if (event.code === 'F2') {
    if (typeof toggleInputDisplay === 'function') toggleInputDisplay();
    return;
  }
  // Replay: handle speed keys, pause, and Escape; all other input is blocked.
  if (typeof isReplayMode !== 'undefined' && isReplayMode) {
    if (event.code === 'Digit0' && typeof replaySetSpeed === 'function') replaySetSpeed(0.5);
    else if (event.code === 'Digit1' && typeof replaySetSpeed === 'function') replaySetSpeed(1);
    else if (event.code === 'Digit2' && typeof replaySetSpeed === 'function') replaySetSpeed(2);
    else if (event.code === 'Digit4' && typeof replaySetSpeed === 'function') replaySetSpeed(4);
    else if (event.code === 'Space' && typeof replayTogglePause === 'function') replayTogglePause();
    // Escape auto-unlocks pointer; cleanup is done via the pointerlockchange handler
    return;
  }
  if (!controls || !controls.isLocked || isGameOver) return;

  // ── Editor-mode shortcuts (intercept before regular gameplay bindings) ────
  if (isEditorMode) {
    const _ctrl = event.ctrlKey || event.metaKey;
    if (_ctrl) {
      if (event.code === "KeyZ" && !event.shiftKey) {
        event.preventDefault();
        if (typeof editorUndo === "function") editorUndo();
        return;
      }
      if (event.code === "KeyY" || (event.code === "KeyZ" && event.shiftKey)) {
        event.preventDefault();
        if (typeof editorRedo === "function") editorRedo();
        return;
      }
      if (event.code === "KeyC") {
        event.preventDefault();
        if (typeof editorCopyRow === "function") editorCopyRow();
        return;
      }
      if (event.code === "KeyV") {
        event.preventDefault();
        if (typeof editorPasteRow === "function") editorPasteRow();
        return;
      }
    }
    if (event.code === "Delete" || event.code === "Backspace") {
      if (typeof editorEraseBlock === "function") editorEraseBlock();
      return;
    }
    if (event.code === "Tab") {
      event.preventDefault();
      // Tab cycles the selected palette block type forward
      if (typeof selectEditorBlock === "function") {
        selectEditorBlock((editorSelectedIdx + 1) % (typeof EDITOR_PALETTE !== "undefined" ? EDITOR_PALETTE.length : 9));
      }
      return;
    }
  }

  // Record input for replay
  if (typeof replayRecordInput === 'function') {
    replayRecordInput('keydown', event.code,
      typeof gameElapsedSeconds !== 'undefined' ? gameElapsedSeconds : 0);
  }
  // Input display overlay — notify of raw key press.
  if (typeof inputDisplayKeyEvent === 'function') inputDisplayKeyEvent(event.code, true);
  // Translate the physical key code to its canonical default so existing
  // switch/case logic works unchanged after a rebind.
  const _keyCode = _resolveKeyCode(event.code);
  switch (_keyCode) {
    case "KeyW":
      moveForward = true;
      if (typeof tutorialNotify === "function") tutorialNotify("move");
      break;
    case "KeyA":
      moveLeft = true;
      if (typeof tutorialNotify === "function") tutorialNotify("move");
      break;
    case "KeyS":
      moveBackward = true;
      if (typeof tutorialNotify === "function") tutorialNotify("move");
      break;
    case "KeyD":
      moveRight = true;
      if (typeof tutorialNotify === "function") tutorialNotify("move");
      break;
    case "Space":
      if (isEditorMode) { moveUp = true; break; }
      if (canJump && playerOnGround) playerVelocity.y += JUMP_VELOCITY;
      canJump = false;
      playerOnGround = false;
      break;
    case "ShiftLeft":
    case "ShiftRight":
      if (isEditorMode) {
        moveDown = true;
        if (typeof _editorShiftDown !== "undefined") _editorShiftDown = true;
        break;
      }
      if (typeof dasKeyDown === 'function') dasKeyDown('softDrop');
      break;
    case "Digit1":
    case "Digit2":
    case "Digit3":
    case "Digit4":
    case "Digit5":
    case "Digit6":
    case "Digit7":
    case "Digit8":
    case "Digit9": {
      const idx = parseInt(event.code.replace("Digit", "")) - 1;
      if (isEditorMode) {
        if (typeof selectEditorBlock === "function") selectEditorBlock(idx);
      } else {
        const entries = Object.entries(inventory).filter(([, n]) => n > 0);
        if (idx < entries.length) selectBlockColor(entries[idx][0]);
      }
      break;
    }
    case "KeyC":
      if (isCoopMode && typeof coopEmote !== 'undefined') {
        // In co-op: hold C for thumbs-up; quick tap still opens crafting (handled on keyup)
        if (!_cKeyHoldTimeout) {
          _cKeyHoldTimeout = setTimeout(function () {
            _cKeyHoldTimeout = null;
            coopEmote.sendEmote('thumbsup');
          }, 400);
        }
        break;
      }
      // Non-coop: crafting is disabled in Sprint, Blitz, and No Iron Week
      if (!isSprintMode && !isBlitzMode && !weeklyNoIron) toggleCraftingPanel();
      break;
    case "KeyQ":
      // Reject incoming trade offer if one is pending
      if (isCoopMode && typeof coopTrade !== 'undefined' && coopTrade.hasPendingIncomingOffer()) {
        coopTrade.rejectIncomingOffer();
        break;
      }
      if (typeof dasKeyDown === 'function') dasKeyDown('q');
      break;
    case "KeyE":
      // Cave mouth interaction: open tier select when standing near the cave entrance
      if (isSurvivalMode && typeof isCaveMouthNearby === 'function' && isCaveMouthNearby()) {
        if (typeof openCaveMouthTierSelect === 'function') openCaveMouthTierSelect();
        break;
      }
      // Accept incoming trade offer if one is pending
      if (isCoopMode && typeof coopTrade !== 'undefined' && coopTrade.hasPendingIncomingOffer()) {
        coopTrade.acceptIncomingOffer();
        break;
      }
      if (typeof dasKeyDown === 'function') dasKeyDown('e');
      break;
    case "KeyZ":
      if (isCoopMode && typeof coopEmote !== 'undefined') {
        coopEmote.sendEmote('wave');
        break;
      }
      if (isPracticeMode) {
        if (typeof undoPracticePlacement === "function") undoPracticePlacement();
        break;
      }
      if (typeof isTrainingMode !== 'undefined' && isTrainingMode) {
        if (typeof undoTrainingPlacement === "function") undoTrainingPlacement();
        break;
      }
      if (typeof dasKeyDown === 'function') dasKeyDown('z');
      break;
    case "KeyY":
      if (typeof isTrainingMode !== 'undefined' && isTrainingMode) {
        if (typeof redoTrainingPlacement === "function") redoTrainingPlacement();
        break;
      }
      break;
    case "KeyX":
      if (isCoopMode && typeof coopEmote !== 'undefined') {
        coopEmote.sendEmote('point');
        break;
      }
      if (typeof dasKeyDown === 'function') dasKeyDown('x');
      break;
    case "KeyV":
      if (isCoopMode && typeof coopEmote !== 'undefined') {
        coopEmote.sendEmote('alert');
      }
      break;
    case "KeyG":
      if (isCoopMode && typeof coopEmote !== 'undefined') {
        coopEmote.sendQuickChat('nice');
      }
      break;
    case "KeyH":
      if (typeof doHoldPiece === 'function') { doHoldPiece(); break; }
      if (isCoopMode && typeof coopEmote !== 'undefined') {
        coopEmote.sendQuickChat('help');
      }
      break;
    case "KeyT":
      if (isCoopMode || isBattleMode) {
        // T key: toggle in-game text chat panel
        if (typeof chat !== 'undefined') {
          chat.toggle();
        } else if (typeof chatEmotes !== 'undefined') {
          // Fallback to emote wheel if chat module not loaded
          chatEmotes.openWheel();
        }
      }
      break;
    case "KeyR":
      // Practice mode: instant restart with same configuration
      if (isPracticeMode && typeof resetGame === "function") {
        resetGame();
      } else {
        if (typeof rotatePlayerPiece180 === 'function') rotatePlayerPiece180();
      }
      break;
    case "ControlLeft":
    case "ControlRight":
      if (typeof doHardDrop === 'function') doHardDrop();
      break;
    case "KeyZ":
      // Puzzle undo (Z key)
      if (isPuzzleMode && typeof puzzleUndo === "function") {
        puzzleUndo();
      }
      break;
    case "KeyF":
      // Co-op trade takes priority (not in puzzle mode)
      if (isCoopMode && !isPuzzleMode && typeof coopTrade !== 'undefined') {
        if (coopTrade.tryOpenPanel()) break;
      }
      if (isPuzzleMode) {
        if (typeof setThinkMode === "function") setThinkMode(true);
      } else if (equippedPowerUpType) {
        if (typeof activateEquippedPowerup === "function") activateEquippedPowerup();
      } else {
        if (typeof activateLavaFlask === "function") activateLavaFlask();
      }
      break;
    case "KeyG":
      if (typeof activateIceBridge === "function") activateIceBridge();
      break;
    case "KeyN":
      // Co-op: mark the current column as a highlight zone (signals intent to partner).
      if (isCoopMode && typeof triggerCoopHighlight === 'function') {
        triggerCoopHighlight();
      }
      break;
    case "KeyI":
      // Announce current score to screen readers on demand.
      if (typeof announceToScreenReader === 'function' && typeof score !== 'undefined') {
        var _lvl = (typeof level !== 'undefined') ? level : null;
        var _lines = (typeof linesCleared !== 'undefined') ? linesCleared : null;
        var _msg = 'Score: ' + score;
        if (_lvl !== null)   _msg += '. Level: ' + _lvl;
        if (_lines !== null) _msg += '. Lines: ' + _lines;
        announceToScreenReader(_msg, 'assertive');
      }
      break;
  }
}

function onKeyUp(event) {
  if (typeof isReplayMode !== 'undefined' && isReplayMode) return;
  // Record key-up for replay
  if (typeof replayRecordInput === 'function' && typeof controls !== 'undefined'
      && controls && controls.isLocked && !isGameOver) {
    replayRecordInput('keyup', event.code,
      typeof gameElapsedSeconds !== 'undefined' ? gameElapsedSeconds : 0);
  }
  // Input display overlay — notify of key release.
  if (typeof inputDisplayKeyEvent === 'function') inputDisplayKeyEvent(event.code, false);
  const _keyCode = _resolveKeyCode(event.code);
  switch (_keyCode) {
    case "KeyC":
      // Co-op: if hold timer is still pending it was a quick tap → open crafting
      if (isCoopMode && _cKeyHoldTimeout) {
        clearTimeout(_cKeyHoldTimeout);
        _cKeyHoldTimeout = null;
        if (!isSprintMode && !isBlitzMode && !weeklyNoIron) toggleCraftingPanel();
      }
      break;
    case "KeyW":
      moveForward = false;
      break;
    case "KeyA":
      moveLeft = false;
      break;
    case "KeyS":
      moveBackward = false;
      break;
    case "KeyD":
      moveRight = false;
      break;
    case "Space":
      if (isEditorMode) { moveUp = false; break; }
      canJump = true;
      break;
    case "ShiftLeft":
    case "ShiftRight":
      moveDown = false;
      if (typeof _editorShiftDown !== "undefined") _editorShiftDown = false;
      if (typeof dasKeyUp === 'function') dasKeyUp('softDrop');
      break;
    case "KeyQ":
      if (typeof dasKeyUp === 'function') dasKeyUp('q');
      break;
    case "KeyE":
      if (typeof dasKeyUp === 'function') dasKeyUp('e');
      break;
    case "KeyZ":
      if (typeof dasKeyUp === 'function') dasKeyUp('z');
      break;
    case "KeyX":
      if (typeof dasKeyUp === 'function') dasKeyUp('x');
      break;
    case "KeyF":
      if (isPuzzleMode && typeof setThinkMode === "function") setThinkMode(false);
      break;
    case "KeyT":
      // Only close emote wheel on keyup if chat module is not handling T
      if (typeof chat === 'undefined' && typeof chatEmotes !== 'undefined' && chatEmotes.isOpen()) {
        chatEmotes.closeWheel();
      }
      break;
  }
}
