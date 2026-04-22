// share.js — Social sharing utilities.
// Covers: canvas screenshot capture, image clipboard copy, PNG download,
//         Web Share API (mobile), Twitter/X intent URL, and the in-game
//         screenshot button + share modal.
//
// Public API (window.Share):
//   Share.captureGameCanvas()          => HTMLCanvasElement|null
//   Share.copyImageToClipboard(canvas) => Promise<boolean>
//   Share.downloadImage(canvas, name)
//   Share.shareViaWebAPI(opts)         => Promise<boolean>   (opts: {text, url, canvas})
//   Share.twitterUrl(text, url)        => string
//   Share.buildShareText(opts)         => string  (opts: {score,lines,timeStr,mode,rank})
//   Share.openShareModal(opts)         (opts: same as buildShareText + {canvas})
//   Share.initScreenshotBtn()          wires the #screenshot-btn HUD button
//   Share.initGameOverExtras()         wires clipboard-image + twitter on game-over screen

(function (global) {
  "use strict";

  // ── Canvas capture ─────────────────────────────────────────────────────────

  /**
   * Capture the current THREE.js renderer canvas as an off-screen canvas
   * with the "Press Start 2P" game overlay (score, mode) burned in.
   * Returns the canvas element, or null if the renderer is not available.
   */
  function captureGameCanvas() {
    // Try the THREE.js renderer canvas first
    var rendererEl = null;
    if (typeof renderer !== 'undefined' && renderer && renderer.domElement) {
      rendererEl = renderer.domElement;
    } else {
      rendererEl = document.querySelector('canvas');
    }
    if (!rendererEl) return null;

    var w = rendererEl.width  || rendererEl.offsetWidth  || 800;
    var h = rendererEl.height || rendererEl.offsetHeight || 600;

    var out = document.createElement('canvas');
    out.width  = w;
    out.height = h;
    var ctx = out.getContext('2d');

    // Draw game frame
    try {
      ctx.drawImage(rendererEl, 0, 0, w, h);
    } catch (e) {
      // Canvas may be tainted; fall back to score-card only
      return null;
    }

    // Overlay: semi-transparent bar at bottom with score info
    var scoreEl = document.querySelector('.hud-score');
    var scoreVal = scoreEl ? scoreEl.textContent : '';
    if (scoreVal) {
      var barH = Math.round(h * 0.07);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, h - barH, w, barH);

      ctx.fillStyle = '#4ade80';
      ctx.font = 'bold ' + Math.round(barH * 0.45) + 'px "Press Start 2P", monospace';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText('MINETRIS  ' + scoreVal, Math.round(w * 0.02), h - barH / 2);

      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = Math.round(barH * 0.3) + 'px "Press Start 2P", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('minetris.game', w - Math.round(w * 0.02), h - barH / 2);
    }

    return out;
  }

  // ── Clipboard ──────────────────────────────────────────────────────────────

  /**
   * Copy a canvas as a PNG image to the clipboard.
   * Returns a Promise that resolves true on success, false on failure.
   */
  function copyImageToClipboard(canvas) {
    if (!canvas) return Promise.resolve(false);
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) {
        if (!blob) { resolve(false); return; }
        if (navigator.clipboard && navigator.clipboard.write && typeof ClipboardItem !== 'undefined') {
          var item = new ClipboardItem({ 'image/png': blob });
          navigator.clipboard.write([item]).then(function () {
            resolve(true);
          }).catch(function () {
            resolve(false);
          });
        } else {
          resolve(false);
        }
      }, 'image/png');
    });
  }

  // ── Download ───────────────────────────────────────────────────────────────

  function downloadImage(canvas, filename) {
    if (!canvas) return;
    filename = filename || 'minetris-screenshot.png';
    var link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  // ── Web Share API ──────────────────────────────────────────────────────────

  /**
   * Share via the Web Share API (mobile).
   * opts: { text {string}, url {string}, canvas {HTMLCanvasElement|null} }
   * Returns a Promise resolving true if shared, false otherwise.
   */
  function shareViaWebAPI(opts) {
    opts = opts || {};
    if (!navigator.share) return Promise.resolve(false);

    return new Promise(function (resolve) {
      // Try to share with image file if canvas is provided and canShare supports files
      if (opts.canvas && navigator.canShare) {
        var tryImageShare = new Promise(function (imgResolve) {
          opts.canvas.toBlob(function (blob) {
            try {
              if (!blob) { imgResolve(false); return; }
              var file = new File([blob], 'minetris-score.png', { type: 'image/png' });
              var data = { files: [file], text: opts.text || '', url: opts.url || '' };
              if (navigator.canShare(data)) {
                navigator.share(data).then(function () { imgResolve(true); }).catch(function () { imgResolve(false); });
              } else {
                imgResolve(false);
              }
            } catch (_) { imgResolve(false); }
          }, 'image/png');
        });

        tryImageShare.then(function (ok) {
          if (ok) { resolve(true); return; }
          // Fall back to text-only share
          navigator.share({ text: opts.text || '', url: opts.url || '' })
            .then(function () { resolve(true); })
            .catch(function () { resolve(false); });
        }).catch(function () { resolve(false); });
        return;
      }

      // Text-only share
      navigator.share({ text: opts.text || '', url: opts.url || '' })
        .then(function () { resolve(true); })
        .catch(function () { resolve(false); });
    });
  }

  // ── Twitter/X ──────────────────────────────────────────────────────────────

  function twitterUrl(text, url) {
    var t = encodeURIComponent(text || '');
    var u = url ? encodeURIComponent(url) : '';
    return 'https://twitter.com/intent/tweet?text=' + t + (u ? '&url=' + u : '');
  }

  // ── Share text builder ─────────────────────────────────────────────────────

  /**
   * Build the canonical share text for a game result.
   * opts: { score, lines, timeStr, mode, rank }
   */
  function buildShareText(opts) {
    opts = opts || {};
    var score = opts.score || 0;
    var lines = opts.lines || 0;
    var timeStr = opts.timeStr || '';
    var mode  = opts.mode  || 'Classic';
    var rank  = opts.rank;

    var rankPart = (rank && rank >= 1 && rank <= 10) ? ' | #' + rank + ' rank' : '';
    var timePart = timeStr ? ' | ' + timeStr : '';
    return 'MineCtris ' + mode + ' \u2014 Score: ' + score.toLocaleString() +
           ' | Lines: ' + lines + timePart + rankPart +
           '\nminetris.game';
  }

  // ── Share modal ────────────────────────────────────────────────────────────

  /**
   * Show the in-game share modal with copy-image, download, twitter and
   * web-share buttons.
   * opts: same as buildShareText + { canvas }
   */
  function openShareModal(opts) {
    opts = opts || {};
    var canvas = opts.canvas || null;
    var text   = buildShareText(opts);
    var url    = location.href.split('?')[0].split('#')[0];
    var shareUrl = url + '?share=' + encodeURIComponent(
      (opts.mode || 'Classic') + '-' + (opts.score || 0) + '-' + (opts.lines || 0) + '-0000'
    );
    var tweetText = 'I scored ' + (opts.score || 0).toLocaleString() +
                    ' in MineCtris ' + (opts.mode || 'Classic') + '! Can you beat me?\n' + shareUrl;

    // Remove any existing modal
    var existing = document.getElementById('share-social-modal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'share-social-modal';
    modal.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:99990',
      'background:rgba(0,0,0,0.82)',
      'display:flex', 'align-items:center', 'justify-content:center',
    ].join(';');

    var inner = document.createElement('div');
    inner.style.cssText = [
      'background:#111', 'border:1px solid rgba(74,222,128,0.35)', 'border-radius:8px',
      'padding:20px 24px', 'max-width:420px', 'width:92%',
      'font-family:"Press Start 2P",monospace', 'color:#fff',
      'display:flex', 'flex-direction:column', 'gap:12px',
    ].join(';');

    // Title
    var title = document.createElement('div');
    title.textContent = 'SHARE';
    title.style.cssText = 'font-size:11px;color:#4ade80;letter-spacing:0.1em;';
    inner.appendChild(title);

    // Canvas preview
    if (canvas) {
      var preview = document.createElement('canvas');
      preview.style.cssText = 'width:100%;height:auto;border-radius:4px;border:1px solid rgba(74,222,128,0.2);';
      preview.width  = canvas.width;
      preview.height = canvas.height;
      preview.getContext('2d').drawImage(canvas, 0, 0);
      inner.appendChild(preview);
    }

    // Share text display
    var textBox = document.createElement('textarea');
    textBox.value = text;
    textBox.readOnly = true;
    textBox.rows = 3;
    textBox.style.cssText = [
      'width:100%', 'background:rgba(255,255,255,0.06)', 'border:1px solid rgba(74,222,128,0.2)',
      'color:#ccc', 'font-family:"Press Start 2P",monospace', 'font-size:7px',
      'padding:8px', 'border-radius:4px', 'resize:none', 'box-sizing:border-box',
    ].join(';');
    inner.appendChild(textBox);

    // Button row
    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;';

    function _btn(label, primary) {
      var b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = [
        'flex:1', 'min-width:120px',
        'font-family:"Press Start 2P",monospace', 'font-size:7px',
        'padding:8px 10px', 'cursor:pointer', 'border-radius:4px', 'border:none',
        primary
          ? 'background:#4ade80;color:#111;'
          : 'background:transparent;color:#4ade80;border:1px solid rgba(74,222,128,0.4);',
      ].join(';');
      return b;
    }

    // Copy image button (only shown if ClipboardItem is available or canvas exists)
    if (canvas) {
      var copyImgBtn = _btn('\uD83D\uDCCB Copy Image', true);
      copyImgBtn.addEventListener('click', function () {
        copyImageToClipboard(canvas).then(function (ok) {
          copyImgBtn.textContent = ok ? '\u2713 Copied!' : '\u2717 Not supported';
          setTimeout(function () { copyImgBtn.textContent = '\uD83D\uDCCB Copy Image'; }, 2000);
        });
      });
      btnRow.appendChild(copyImgBtn);

      var dlBtn = _btn('\u2913 Save PNG', false);
      dlBtn.addEventListener('click', function () {
        downloadImage(canvas, 'minetris-' + (opts.mode || 'score').toLowerCase().replace(/\s+/g, '-') + '.png');
      });
      btnRow.appendChild(dlBtn);
    }

    // Copy text button
    var copyTxtBtn = _btn('\uD83D\uDD17 Copy Text', canvas ? false : true);
    copyTxtBtn.addEventListener('click', function () {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(tweetText).then(function () {
          copyTxtBtn.textContent = '\u2713 Copied!';
          setTimeout(function () { copyTxtBtn.textContent = '\uD83D\uDD17 Copy Text'; }, 2000);
        }).catch(function () { window.prompt('Copy text:', tweetText); });
      } else {
        window.prompt('Copy text:', tweetText);
      }
    });
    btnRow.appendChild(copyTxtBtn);

    // Twitter/X button
    var twitterBtn = _btn('\uD83D\uDC26 Twitter/X', false);
    twitterBtn.addEventListener('click', function () {
      window.open(twitterUrl(tweetText), '_blank', 'noopener,noreferrer');
    });
    btnRow.appendChild(twitterBtn);

    // Web Share API button (only on mobile / supported browsers)
    if (navigator.share) {
      var webShareBtn = _btn('\u2197 Share\u2026', false);
      webShareBtn.addEventListener('click', function () {
        shareViaWebAPI({ text: tweetText, url: shareUrl, canvas: canvas });
      });
      btnRow.appendChild(webShareBtn);
    }

    inner.appendChild(btnRow);

    // Close button
    var closeBtn = _btn('\u2715 Close', false);
    closeBtn.style.flex = 'none';
    closeBtn.style.width = '100%';
    closeBtn.addEventListener('click', function () { modal.remove(); });
    inner.appendChild(closeBtn);

    modal.appendChild(inner);
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }

  // ── Screenshot HUD button ──────────────────────────────────────────────────

  function initScreenshotBtn() {
    var btn = document.getElementById('screenshot-btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var canvas = captureGameCanvas();
      // Build current score info
      var scoreEl = document.querySelector('.hud-score');
      var linesEl = document.querySelector('.hud-stat:nth-child(3)');
      var score = scoreEl ? parseInt(scoreEl.textContent.replace(/,/g, ''), 10) || 0 : 0;
      var lines = linesEl ? parseInt(linesEl.textContent.replace(/\D/g, ''), 10) || 0 : 0;
      var mode = 'Classic';
      if (typeof isDailyChallenge !== 'undefined' && isDailyChallenge) mode = 'Daily Challenge';
      else if (typeof isBlitzMode !== 'undefined' && isBlitzMode) mode = 'Blitz';
      else if (typeof isWeeklyChallenge !== 'undefined' && isWeeklyChallenge) mode = 'Weekly';

      if (canvas) {
        openShareModal({ canvas: canvas, score: score, lines: lines, mode: mode });
      } else {
        // No renderer canvas (e.g. tainted) — generate score card instead
        if (typeof ScoreCard !== 'undefined') {
          var sc = ScoreCard.generate({ score: score, linesCleared: lines, mode: mode });
          openShareModal({ canvas: sc, score: score, lines: lines, mode: mode });
        } else {
          openShareModal({ score: score, lines: lines, mode: mode });
        }
      }
    });
  }

  // ── Game-over screen extras ─────────────────────────────────────────────────
  // Adds "Copy Image" and "Tweet" buttons next to the existing score card.

  function initGameOverExtras() {
    // Called after score card has been generated (deferred by caller).
    var wrap = document.getElementById('go-score-card-wrap');
    if (!wrap || document.getElementById('go-share-twitter-btn')) return;

    // Twitter share button
    var twitterBtn = document.createElement('button');
    twitterBtn.id = 'go-share-twitter-btn';
    twitterBtn.textContent = '\uD83D\uDC26 Twitter';
    twitterBtn.className = 'go-share-extra-btn';
    twitterBtn.addEventListener('click', function () {
      var canvas = document.getElementById('go-score-card-canvas');
      var shareText = _buildGameOverShareText();
      var url = _buildGameOverShareUrl();
      var tweet = shareText + '\n' + url;
      window.open(twitterUrl(tweet), '_blank', 'noopener,noreferrer');
    });

    // Copy image button
    var copyImgBtn = document.createElement('button');
    copyImgBtn.id = 'go-copy-image-btn';
    copyImgBtn.textContent = '\uD83D\uDCCB Copy Image';
    copyImgBtn.className = 'go-share-extra-btn';
    copyImgBtn.addEventListener('click', function () {
      var canvas = document.getElementById('go-score-card-canvas');
      copyImageToClipboard(canvas).then(function (ok) {
        copyImgBtn.textContent = ok ? '\u2713 Copied!' : '\u2717 Not supported';
        setTimeout(function () { copyImgBtn.textContent = '\uD83D\uDCCB Copy Image'; }, 2000);
      });
    });

    // Web Share button
    if (navigator.share) {
      var wsBtn = document.createElement('button');
      wsBtn.id = 'go-web-share-btn';
      wsBtn.textContent = '\u2197 Share\u2026';
      wsBtn.className = 'go-share-extra-btn';
      wsBtn.addEventListener('click', function () {
        var canvas = document.getElementById('go-score-card-canvas');
        var shareText = _buildGameOverShareText();
        var url = _buildGameOverShareUrl();
        shareViaWebAPI({ text: shareText + '\n' + url, url: url, canvas: canvas });
      });
      wrap.appendChild(wsBtn);
    }

    wrap.appendChild(copyImgBtn);
    wrap.appendChild(twitterBtn);
  }

  // Helpers that read current game state for the game-over share text/url.
  function _buildGameOverShareText() {
    var scoreEl  = document.querySelector('#game-over-screen .go-score-val, #gos-score-num');
    var score = 0;
    if (typeof state !== 'undefined' && state) {
      score = state.score || 0;
    } else if (scoreEl) {
      score = parseInt(scoreEl.textContent.replace(/,/g, ''), 10) || 0;
    }
    var mode = 'Classic';
    if (typeof isDailyChallenge !== 'undefined' && isDailyChallenge) mode = 'Daily';
    else if (typeof isBlitzMode !== 'undefined' && isBlitzMode) mode = 'Blitz';
    else if (typeof isWeeklyChallenge !== 'undefined' && isWeeklyChallenge) mode = 'Weekly';
    return buildShareText({ score: score, mode: mode });
  }

  function _buildGameOverShareUrl() {
    var score = 0;
    var lines = 0;
    if (typeof state !== 'undefined' && state) {
      score = state.score || 0;
      lines = state.linesCleared || 0;
    }
    var mode = 'Classic';
    if (typeof isDailyChallenge !== 'undefined' && isDailyChallenge) mode = 'Daily';
    else if (typeof isBlitzMode !== 'undefined' && isBlitzMode) mode = 'Blitz';
    else if (typeof isWeeklyChallenge !== 'undefined' && isWeeklyChallenge) mode = 'Weekly';
    var base = location.href.split('?')[0].split('#')[0];
    return base + '?share=' + encodeURIComponent(mode + '-' + score + '-' + lines + '-0000');
  }

  // ── Achievement share ──────────────────────────────────────────────────────

  /**
   * Share a specific achievement. Shows the share modal with achievement text.
   * opts: { name {string}, description {string} }
   */
  function shareAchievement(opts) {
    opts = opts || {};
    var text = 'I just unlocked "' + (opts.name || 'an achievement') + '" in MineCtris!\n' +
               (opts.description ? opts.description + '\n' : '') +
               'minetris.game';
    openShareModal({ score: 0, mode: 'Achievement', _overrideText: text });
  }

  // ── Exports ────────────────────────────────────────────────────────────────

  global.Share = {
    captureGameCanvas:   captureGameCanvas,
    copyImageToClipboard: copyImageToClipboard,
    downloadImage:       downloadImage,
    shareViaWebAPI:      shareViaWebAPI,
    twitterUrl:          twitterUrl,
    buildShareText:      buildShareText,
    openShareModal:      openShareModal,
    initScreenshotBtn:   initScreenshotBtn,
    initGameOverExtras:  initGameOverExtras,
    shareAchievement:    shareAchievement,
  };

})(window);
