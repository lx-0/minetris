// score-card.js — Canvas-based score card generator for social sharing.
// API:
//   ScoreCard.generate(opts) => HTMLCanvasElement
//   ScoreCard.render(canvas, opts)
//   ScoreCard.downloadPNG(canvas, filename)
//
// opts: {
//   score       {number}  — final score
//   linesCleared{number}  — lines cleared
//   blocksMined {number}  — blocks mined
//   timeStr     {string}  — "MM:SS"
//   mode        {string}  — display mode name (e.g. "Classic", "Daily Challenge")
//   theme       {string}  — theme key (classic|nether|ocean|candy|fossil|storm|void|legendary|diamond|ender)
//   rank        {number|null} — personal best rank (1-based), or null
//   date        {string}  — date string, e.g. "Apr 5, 2026"
//   playerName  {string}  — display name or ""
//   isReplay    {boolean} — whether this is from a replay
//   dailyNumber {number|null} — daily challenge number if applicable
// }

(function (global) {
  "use strict";

  // Card dimensions (logical pixels, drawn at 2x for sharpness)
  var W = 560, H = 280, SCALE = 2;

  // Theme accent colours
  var THEME_COLORS = {
    classic:   '#4ade80',
    nether:    '#ef4444',
    ocean:     '#06b6d4',
    candy:     '#ec4899',
    fossil:    '#f59e0b',
    storm:     '#8b5cf6',
    void:      '#7c3aed',
    legendary: '#fbbf24',
    diamond:   '#67e8f9',
    ender:     '#a855f7',
  };

  // Pixel-block icon: a 6×6 simplified block face
  function _drawPixelBlock(ctx, x, y, size, color) {
    var s = size;
    // face
    ctx.fillStyle = color;
    ctx.fillRect(x, y, s, s);
    // top highlight
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x, y, s, Math.max(1, s * 0.2));
    ctx.fillRect(x, y, Math.max(1, s * 0.2), s);
    // bottom shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x, y + s - Math.max(1, s * 0.2), s, Math.max(1, s * 0.2));
    ctx.fillRect(x + s - Math.max(1, s * 0.2), y, Math.max(1, s * 0.2), s);
  }

  // Draw subtle background grid of tiny pixel blocks
  function _drawBg(ctx, accent) {
    var cw = W * SCALE, ch = H * SCALE;
    // solid dark bg
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, cw, ch);

    // subtle grid pattern
    var bs = 14 * SCALE; // block size
    ctx.globalAlpha = 0.04;
    for (var gy = 0; gy < ch; gy += bs) {
      for (var gx = 0; gx < cw; gx += bs) {
        if ((Math.floor(gx / bs) + Math.floor(gy / bs)) % 3 === 0) {
          ctx.fillStyle = accent;
          ctx.fillRect(gx + 1, gy + 1, bs - 2, bs - 2);
        }
      }
    }
    ctx.globalAlpha = 1.0;

    // top accent bar
    var barH = 4 * SCALE;
    var grad = ctx.createLinearGradient(0, 0, cw, 0);
    grad.addColorStop(0, accent);
    grad.addColorStop(0.5, accent + 'cc');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, barH);

    // left accent bar
    var lGrad = ctx.createLinearGradient(0, 0, 0, ch);
    lGrad.addColorStop(0, accent);
    lGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = lGrad;
    ctx.fillRect(0, barH, barH, ch - barH);
  }

  function _px(n) { return n * SCALE; }

  function _drawText(ctx, text, x, y, opts) {
    opts = opts || {};
    var size    = opts.size    || 14;
    var color   = opts.color   || '#ffffff';
    var align   = opts.align   || 'left';
    var alpha   = opts.alpha   || 1.0;
    var weight  = opts.weight  || 'normal';
    var font    = weight + ' ' + _px(size) + 'px "Press Start 2P", monospace';
    ctx.font        = font;
    ctx.fillStyle   = color;
    ctx.globalAlpha = alpha;
    ctx.textAlign   = align;
    ctx.textBaseline = opts.baseline || 'alphabetic';
    ctx.fillText(text, _px(x), _px(y));
    ctx.globalAlpha = 1.0;
  }

  function _wrapNumber(n) {
    if (typeof n !== 'number') return '0';
    return n.toLocaleString();
  }

  function render(canvas, opts) {
    opts = opts || {};
    var score        = opts.score        || 0;
    var linesCleared = opts.linesCleared || 0;
    var blocksMined  = opts.blocksMined  || 0;
    var timeStr      = opts.timeStr      || '00:00';
    var mode         = opts.mode         || 'Classic';
    var theme        = (opts.theme       || 'classic').toLowerCase();
    var rank         = opts.rank         != null ? opts.rank : null;
    var date         = opts.date         || '';
    var playerName   = opts.playerName   || '';
    var isReplay     = opts.isReplay     || false;
    var dailyNumber  = opts.dailyNumber  != null ? opts.dailyNumber : null;

    var accent = THEME_COLORS[theme] || THEME_COLORS.classic;

    canvas.width  = W * SCALE;
    canvas.height = H * SCALE;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';

    var ctx = canvas.getContext('2d');

    // Background
    _drawBg(ctx, accent);

    // Decorative pixel blocks top-right corner
    var bSz = 12;
    var cornerX = W - 4;
    var cornerY = 4;
    var blockColors = [accent, accent + '99', accent + '55'];
    for (var bi = 0; bi < 3; bi++) {
      _drawPixelBlock(ctx, _px(cornerX - (bi + 1) * (bSz + 2)), _px(cornerY + 2), _px(bSz), blockColors[bi]);
    }

    // Logo — top left
    _drawText(ctx, 'MINETRIS', 18, 28, { size: 14, color: accent });

    // Mode badge — top right area (after blocks)
    var modeLabel = isReplay ? mode + ' \u25B6 REPLAY' : (dailyNumber != null ? 'DAILY #' + dailyNumber : mode.toUpperCase());
    _drawText(ctx, modeLabel, W - cornerX + (3 * (bSz + 2)) + 6, 28, { size: 7, color: accent, alpha: 0.85 });

    // Divider line
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = accent;
    ctx.fillRect(_px(16), _px(36), _px(W - 32), _px(1));
    ctx.globalAlpha = 1.0;

    // Big score number
    var scoreText = _wrapNumber(score);
    _drawText(ctx, scoreText, W / 2, 90, { size: 32, color: '#ffffff', align: 'center' });

    // Score label
    _drawText(ctx, 'FINAL SCORE', W / 2, 108, { size: 7, color: accent, align: 'center', alpha: 0.75 });

    // Stats row  — lines | time | [rank] | [blocks]
    var stats = [];
    stats.push({ label: 'LINES', value: String(linesCleared) });
    stats.push({ label: 'TIME', value: timeStr });
    if (blocksMined > 0) {
      stats.push({ label: 'MINED', value: _wrapNumber(blocksMined) });
    }
    if (rank != null && rank >= 1 && rank <= 10) {
      stats.push({ label: 'RANK', value: '#' + rank });
    }

    var statCount = stats.length;
    var statSpacing = Math.min(130, Math.floor((W - 40) / statCount));
    var statStartX = Math.floor((W - statSpacing * (statCount - 1)) / 2);

    for (var si = 0; si < statCount; si++) {
      var sx = statStartX + si * statSpacing;
      _drawText(ctx, stats[si].label, sx, 148, { size: 5.5, color: accent, align: 'center', alpha: 0.65 });
      _drawText(ctx, stats[si].value, sx, 162, { size: 9,   color: '#ffffff', align: 'center' });
    }

    // Separator
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(_px(16), _px(178), _px(W - 32), _px(1));
    ctx.globalAlpha = 1.0;

    // Footer row — player name left, date right
    if (playerName) {
      _drawText(ctx, playerName, 18, 210, { size: 7, color: '#ffffff', alpha: 0.6 });
    }
    if (date) {
      _drawText(ctx, date, W - 18, 210, { size: 7, color: '#ffffff', alpha: 0.4, align: 'right' });
    }

    // Site URL
    _drawText(ctx, 'minetris.game', W / 2, 255, { size: 6, color: accent, align: 'center', alpha: 0.35 });
  }

  function generate(opts) {
    var canvas = document.createElement('canvas');
    render(canvas, opts);
    return canvas;
  }

  function downloadPNG(canvas, filename) {
    filename = filename || 'minetris-score.png';
    var link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  global.ScoreCard = { generate: generate, render: render, downloadPNG: downloadPNG };
})(window);
