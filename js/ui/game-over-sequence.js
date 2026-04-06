// game-over-sequence.js — Cinematic 3-second game over animation.
// Phase 1 (0-2s): board collapse top-to-bottom with stagger + shatter particles + dim.
// Phase 2 (2-3s): score zoom-in, count-up, personal best banner, stats fade, buttons slide.
// Skippable at any time via keypress or tap/click.

(function () {

  var _active    = false;
  var _skipped   = false;
  var _phase     = 0;          // 1 = collapse, 2 = reveal, 3 = done
  var _elapsed   = 0;
  var _callback  = null;       // called when sequence ends

  var _overlayEl = null;       // dim overlay
  var _revealEl  = null;       // score reveal panel

  // Blocks scheduled for falling animation: { block, delay(s), falling, vel }
  var _fallers = [];

  var PHASE1_DUR  = 2.0;       // seconds
  var PHASE2_DUR  = 1.0;       // seconds
  var ROW_STAGGER = 0.05;      // seconds between rows

  // ── Helpers ────────────────────────────────────────────────────────────────

  function _blockHex(block) {
    if (block.material && block.material.color) {
      var c = block.material.color;
      var r = Math.max(0, Math.min(255, Math.round(c.r * 255)));
      var g = Math.max(0, Math.min(255, Math.round(c.g * 255)));
      var b = Math.max(0, Math.min(255, Math.round(c.b * 255)));
      return (r << 16) | (g << 8) | b;
    }
    return 0x4ade80;
  }

  function _spawnShatterParticles(block) {
    if (typeof _acquireDustParticle === 'undefined') return;
    var wp = new THREE.Vector3();
    block.getWorldPosition(wp);
    var col = new THREE.Color(_blockHex(block));
    for (var i = 0; i < 5; i++) {
      var p = _acquireDustParticle(col, 0.9);
      p.mesh.position.copy(wp);
      p.mesh.position.x += (Math.random() - 0.5) * 0.5;
      p.mesh.position.z += (Math.random() - 0.5) * 0.5;
      scene.add(p.mesh);
      var speed = 3 + Math.random() * 5;
      dustParticles.push({
        mesh:      p.mesh,
        _pool:     p,
        velocity:  new THREE.Vector3(
          (Math.random() - 0.5) * speed,
          Math.random() * speed * 0.4 + 1,
          (Math.random() - 0.5) * speed
        ),
        startTime: clock.getElapsedTime(),
        lifetime:  0.55,
      });
    }
  }

  // ── Skip ───────────────────────────────────────────────────────────────────

  function _skipHandler() {
    if (!_active || _skipped) return;
    _skipped = true;
    // Remove all falling blocks instantly
    for (var i = 0; i < _fallers.length; i++) {
      var b = _fallers[i].block;
      if (b && b.parent) b.parent.remove(b);
    }
    _fallers.length = 0;
    _end();
  }

  // ── Update (called from game-loop.js each frame) ───────────────────────────

  function _update(delta) {
    if (!_active || _skipped) return;
    _elapsed += delta;

    if (_phase === 1) {
      // Dim overlay
      var dimFrac = Math.min(_elapsed / PHASE1_DUR, 1.0);
      if (_overlayEl) _overlayEl.style.opacity = String((dimFrac * 0.62).toFixed(3));

      // Process fallers
      for (var i = _fallers.length - 1; i >= 0; i--) {
        var f = _fallers[i];
        if (_elapsed < f.delay) continue;
        if (!f.falling) {
          f.falling = true;
          f.vel = -7 - Math.random() * 5;
          _spawnShatterParticles(f.block);
        }
        // Gravity
        f.vel -= 18 * delta;
        var b = f.block;
        if (b && b.parent) {
          b.position.y += f.vel * delta;
          // Remove once well below floor
          if (b.position.y < -25) {
            b.parent.remove(b);
            _fallers.splice(i, 1);
          }
        } else {
          _fallers.splice(i, 1);
        }
      }

      // Run particle system manually (skipped by game loop when isGameOver)
      if (typeof updateDustParticles === 'function') updateDustParticles(delta);

      if (_elapsed >= PHASE1_DUR) {
        _phase = 2;
        _startPhase2();
      }
    } else if (_phase === 2) {
      // Phase 2 is CSS-driven; just wait for its duration then end
      if (typeof updateDustParticles === 'function') updateDustParticles(delta);
      if (_elapsed - PHASE1_DUR >= PHASE2_DUR) {
        _phase = 3;
        _end();
      }
    }
  }

  // ── Phase 2: animated score reveal ─────────────────────────────────────────

  function _startPhase2() {
    if (!_revealEl) return;
    _revealEl.style.display = 'flex';
    // CSS enter animation — tiny delay allows display:flex to take effect
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        _revealEl.classList.add('gos-visible');
      });
    });
    // Count-up animation
    var numEl = document.getElementById('gos-score-num');
    if (numEl) {
      var target = parseInt(_revealEl.dataset.finalScore || '0', 10);
      var t0 = performance.now();
      var DUR = 500;
      (function tick() {
        var t = Math.min((performance.now() - t0) / DUR, 1);
        var eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
        numEl.textContent = Math.round(eased * target).toLocaleString();
        if (t < 1) requestAnimationFrame(tick);
      })();
    }
  }

  // ── End ────────────────────────────────────────────────────────────────────

  function _end() {
    _active = false;
    window._goSeqUpdateFn = null;
    document.removeEventListener('keydown',     _skipHandler);
    document.removeEventListener('pointerdown', _skipHandler);
    if (_overlayEl)  _overlayEl.style.display = 'none';
    if (_revealEl) { _revealEl.style.display = 'none'; _revealEl.classList.remove('gos-visible'); }
    if (_callback) _callback();
  }

  // ── Public entry point ─────────────────────────────────────────────────────

  /**
   * Run the game over sequence.
   * @param {number}   finalScore     - Player's final score.
   * @param {boolean}  isPersonalBest - Whether this is a new high score.
   * @param {object}   stats          - { linesCleared, blocksMined, timeStr }
   * @param {Function} onComplete     - Called when sequence finishes (or is skipped).
   */
  function startGameOverSequence(finalScore, isPersonalBest, stats, onComplete) {
    if (_active) return;
    _active    = true;
    _skipped   = false;
    _elapsed   = 0;
    _phase     = 1;
    _callback  = onComplete;
    _fallers   = [];

    // ── Dim overlay ────────────────────────────────────────────────────────
    _overlayEl = document.getElementById('go-seq-overlay');
    if (!_overlayEl) {
      _overlayEl = document.createElement('div');
      _overlayEl.id = 'go-seq-overlay';
      var gc = document.getElementById('game-container');
      if (gc) gc.appendChild(_overlayEl);
    }
    _overlayEl.style.opacity = '0';
    _overlayEl.style.display = 'block';

    // ── Reveal panel ───────────────────────────────────────────────────────
    _revealEl = document.getElementById('go-seq-reveal');
    if (!_revealEl) {
      _revealEl = document.createElement('div');
      _revealEl.id = 'go-seq-reveal';
      var gc2 = document.getElementById('game-container');
      if (gc2) gc2.appendChild(_revealEl);
    }
    _revealEl.classList.remove('gos-visible');
    _revealEl.style.display = 'none';
    _revealEl.dataset.finalScore = String(finalScore);

    var pbHtml = isPersonalBest
      ? '<div class="gos-pb">&#11088; NEW RECORD!</div>'
      : '';
    var mm = stats.timeStr || '00:00';
    _revealEl.innerHTML =
      '<div class="gos-title">GAME OVER</div>' +
      pbHtml +
      '<div class="gos-score-wrap">' +
        '<div class="gos-score" id="gos-score-num">0</div>' +
        '<div class="gos-score-label">SCORE</div>' +
      '</div>' +
      '<div class="gos-stats-wrap">' +
        '<div class="gos-stat gos-stat-1">Lines:&nbsp;' + (stats.linesCleared || 0) + '</div>' +
        '<div class="gos-stat gos-stat-2">Blocks:&nbsp;' + (stats.blocksMined || 0) + '</div>' +
        '<div class="gos-stat gos-stat-3">Time:&nbsp;' + mm + '</div>' +
      '</div>';
    // Re-apply data attr after innerHTML overwrite
    _revealEl.dataset.finalScore = String(finalScore);

    // ── Collect and schedule falling blocks ───────────────────────────────
    if (typeof worldGroup !== 'undefined' && worldGroup) {
      var rowMap = {};
      worldGroup.children.forEach(function (block) {
        if (block.name !== 'landed_block') return;
        var qy = Math.round(block.position.y * 2) / 2; // 0.5-unit quantize
        if (!rowMap[qy]) rowMap[qy] = [];
        rowMap[qy].push(block);
      });
      // Sort rows top→bottom (descending Y = highest first)
      var ys = Object.keys(rowMap).map(Number).sort(function (a, b) { return b - a; });
      ys.forEach(function (y, idx) {
        var delay = idx * ROW_STAGGER;
        rowMap[y].forEach(function (block) {
          _fallers.push({ block: block, delay: delay, falling: false, vel: 0 });
        });
      });
    }

    // ── Skip handlers ─────────────────────────────────────────────────────
    document.addEventListener('keydown',     _skipHandler);
    document.addEventListener('pointerdown', _skipHandler);

    // ── Hook into game loop ───────────────────────────────────────────────
    window._goSeqUpdateFn = _update;
  }

  // Export
  window.startGameOverSequence = startGameOverSequence;

}());
