// history.js — Match history panel: list UI, filters, sort, expand, export.
// Data backend: loadSessionHistory() / logSession() from stats.js.
// Provides:
//   renderMatchHistoryContent(containerEl) — embed in profile History tab
//   openMatchHistoryOverlay()              — open standalone overlay

(function () {

  // ── Mode metadata ──────────────────────────────────────────────────────────

  var MH_MODES = [
    { key: 'all',             label: 'All',        icon: '🎮' },
    { key: 'classic',         label: 'Classic',    icon: '🎮' },
    { key: 'daily',           label: 'Daily',      icon: '📅' },
    { key: 'weekly',          label: 'Weekly',     icon: '📆' },
    { key: 'marathon',        label: 'Marathon',   icon: '🏃' },
    { key: 'sprint',          label: 'Sprint',     icon: '⚡' },
    { key: 'blitz',           label: 'Blitz',      icon: '💥' },
    { key: 'survival',        label: 'Survival',   icon: '🌲' },
    { key: 'endless',         label: 'Endless',    icon: '♾️' },
    { key: 'battle',          label: 'Battle',     icon: '⚔️' },
    { key: 'puzzle',          label: 'Puzzle',     icon: '🧩' },
    { key: 'combo_challenge', label: 'Combo',      icon: '🔗' },
    { key: 'countdown',       label: 'Countdown',  icon: '⏱️' },
    { key: 'zen',             label: 'Zen',        icon: '🧘' },
  ];

  var MH_MODE_MAP = {};
  for (var _mi = 0; _mi < MH_MODES.length; _mi++) {
    MH_MODE_MAP[MH_MODES[_mi].key] = MH_MODES[_mi];
  }

  var MH_MODE_COLORS = {
    classic:         '#4fc3f7',
    sprint:          '#81c784',
    blitz:           '#ff8a65',
    daily:           '#ffd740',
    weekly:          '#ce93d8',
    survival:        '#a5d6a7',
    battle:          '#ef9a9a',
    puzzle:          '#b39ddb',
    marathon:        '#80cbc4',
    endless:         '#90caf9',
    combo_challenge: '#f48fb1',
    countdown:       '#ffcc02',
    zen:             '#a8e6cf',
    all:             '#4fc3f7',
  };

  // ── State ──────────────────────────────────────────────────────────────────

  var _state = {
    modeFilter: 'all',
    dateFrom:   '',
    dateTo:     '',
    sort:       'date',   // 'date' | 'score' | 'lines'
    expandedIdx: null,    // index in filtered list that is expanded
    page:       0,        // for pagination (20 rows per page)
  };

  var ROWS_PER_PAGE = 20;

  // ── Helpers ────────────────────────────────────────────────────────────────

  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _fmtTime(secs) {
    var s = Math.floor(secs || 0);
    var m = Math.floor(s / 60);
    return m + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  }

  function _fmtDate(iso) {
    if (!iso) return '—';
    return iso.slice(0, 10);
  }

  function _modeLabel(mode) {
    var m = MH_MODE_MAP[mode];
    return m ? m.icon + ' ' + m.label : _esc(mode || '—');
  }

  function _resultBadge(result) {
    if (!result || result === 'complete') return '<span class="mh-result mh-result-complete">✓</span>';
    if (result === 'win')   return '<span class="mh-result mh-result-win">WIN</span>';
    if (result === 'loss')  return '<span class="mh-result mh-result-loss">LOSS</span>';
    return '<span class="mh-result">' + _esc(result) + '</span>';
  }

  // ── Data ───────────────────────────────────────────────────────────────────

  function _getData() {
    return typeof loadSessionHistory === 'function' ? loadSessionHistory() : [];
  }

  function _applyFilters(history, state) {
    var filtered = history;
    if (state.modeFilter && state.modeFilter !== 'all') {
      filtered = filtered.filter(function (s) { return s.mode === state.modeFilter; });
    }
    if (state.dateFrom) {
      filtered = filtered.filter(function (s) { return (s.date || '') >= state.dateFrom; });
    }
    if (state.dateTo) {
      filtered = filtered.filter(function (s) { return (s.date || '') <= state.dateTo; });
    }
    // Sort
    var arr = filtered.slice();
    if (state.sort === 'score') {
      arr.sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
    } else if (state.sort === 'lines') {
      arr.sort(function (a, b) { return (b.lines || 0) - (a.lines || 0); });
    }
    // Default sort (date) — history is already newest first from logSession
    return arr;
  }

  // ── Summary stats ──────────────────────────────────────────────────────────

  function _computeSummary(history) {
    var totalGames = history.length;
    var totalLines = 0;
    var totalScore = 0;
    var bestScore  = 0;
    var battleWins = 0;
    var battleTotal = 0;

    for (var i = 0; i < history.length; i++) {
      var s = history[i];
      totalLines += (s.lines || 0);
      totalScore += (s.score || 0);
      if ((s.score || 0) > bestScore) bestScore = s.score || 0;
      if (s.mode === 'battle') {
        battleTotal++;
        if (s.result === 'win') battleWins++;
      }
    }

    return {
      totalGames:  totalGames,
      totalLines:  totalLines,
      avgScore:    totalGames > 0 ? Math.round(totalScore / totalGames) : 0,
      bestScore:   bestScore,
      winRate:     battleTotal > 0 ? Math.round((battleWins / battleTotal) * 100) + '%' : '—',
    };
  }

  // ── Render: summary strip ──────────────────────────────────────────────────

  function _renderSummary(history) {
    var s = _computeSummary(history);
    return '<div class="mh-summary">' +
      '<div class="mh-sum-item"><div class="mh-sum-val">' + s.totalGames.toLocaleString() + '</div><div class="mh-sum-label">Games</div></div>' +
      '<div class="mh-sum-item"><div class="mh-sum-val">' + s.totalLines.toLocaleString() + '</div><div class="mh-sum-label">Lines</div></div>' +
      '<div class="mh-sum-item"><div class="mh-sum-val">' + s.avgScore.toLocaleString() + '</div><div class="mh-sum-label">Avg Score</div></div>' +
      '<div class="mh-sum-item"><div class="mh-sum-val">' + s.bestScore.toLocaleString() + '</div><div class="mh-sum-label">Best Score</div></div>' +
      '<div class="mh-sum-item"><div class="mh-sum-val">' + s.winRate + '</div><div class="mh-sum-label">Win Rate</div></div>' +
    '</div>';
  }

  // ── Render: filter bar ─────────────────────────────────────────────────────

  function _renderFilters() {
    var html = '<div class="mh-filters">';

    // Mode filter pills (scrollable)
    html += '<div class="mh-mode-pills">';
    for (var i = 0; i < MH_MODES.length; i++) {
      var m = MH_MODES[i];
      var active = m.key === _state.modeFilter ? ' mh-pill-active' : '';
      html += '<button class="mh-pill' + active + '" data-mh-mode="' + m.key + '">' +
        m.icon + ' ' + m.label + '</button>';
    }
    html += '</div>';

    // Date range + sort
    html += '<div class="mh-filter-row">';
    html += '<label class="mh-filter-label">From <input type="date" class="mh-date-input" id="mh-date-from" value="' + _esc(_state.dateFrom) + '"></label>';
    html += '<label class="mh-filter-label">To <input type="date" class="mh-date-input" id="mh-date-to" value="' + _esc(_state.dateTo) + '"></label>';
    html += '<label class="mh-filter-label">Sort ';
    html += '<select class="mh-sort-select" id="mh-sort-select">';
    html += '<option value="date"' + (_state.sort === 'date' ? ' selected' : '') + '>Date</option>';
    html += '<option value="score"' + (_state.sort === 'score' ? ' selected' : '') + '>Score</option>';
    html += '<option value="lines"' + (_state.sort === 'lines' ? ' selected' : '') + '>Lines</option>';
    html += '</select></label>';
    html += '</div>';

    html += '</div>'; // .mh-filters
    return html;
  }

  // ── Render: table rows ─────────────────────────────────────────────────────

  function _renderRows(filtered, page) {
    if (filtered.length === 0) {
      return '<div class="mh-empty">No sessions match this filter.</div>';
    }

    var start = page * ROWS_PER_PAGE;
    var end   = Math.min(start + ROWS_PER_PAGE, filtered.length);
    var slice = filtered.slice(start, end);

    var html = '<div class="mh-table-wrap"><table class="mh-table">';
    html += '<thead><tr>' +
      '<th>Date</th><th>Mode</th><th>Score</th>' +
      '<th>Lines</th><th>Duration</th><th>Result</th>' +
    '</tr></thead><tbody>';

    for (var i = 0; i < slice.length; i++) {
      var s = slice[i];
      var absIdx = start + i;
      var modeColor = MH_MODE_COLORS[s.mode] || '#aaa';
      var isExpanded = (_state.expandedIdx === absIdx);
      var rowCls = 'mh-row' + (isExpanded ? ' mh-row-expanded' : '');

      html += '<tr class="' + rowCls + '" data-mh-idx="' + absIdx + '">';
      html += '<td>' + _esc(_fmtDate(s.date)) + '</td>';
      html += '<td><span class="mh-mode-badge" style="color:' + modeColor + '">' + _modeLabel(s.mode) + '</span></td>';
      html += '<td>' + (s.score || 0).toLocaleString() + '</td>';
      html += '<td>' + (s.lines || 0) + '</td>';
      html += '<td>' + _fmtTime(s.durationSecs) + '</td>';
      html += '<td>' + _resultBadge(s.result) + '</td>';
      html += '</tr>';

      // Expanded detail row
      if (isExpanded) {
        html += '<tr class="mh-detail-row"><td colspan="6">';
        html += _renderDetailPanel(s);
        html += '</td></tr>';
      }
    }

    html += '</tbody></table></div>';

    // Pagination
    var totalPages = Math.ceil(filtered.length / ROWS_PER_PAGE);
    if (totalPages > 1) {
      html += '<div class="mh-pagination">';
      html += '<button class="mh-page-btn" id="mh-prev-btn"' + (page === 0 ? ' disabled' : '') + '>&laquo; Prev</button>';
      html += '<span class="mh-page-info">Page ' + (page + 1) + ' / ' + totalPages + ' (' + filtered.length + ' games)</span>';
      html += '<button class="mh-page-btn" id="mh-next-btn"' + (page >= totalPages - 1 ? ' disabled' : '') + '>Next &raquo;</button>';
      html += '</div>';
    } else {
      html += '<div class="mh-row-count">' + filtered.length + ' game' + (filtered.length !== 1 ? 's' : '') + '</div>';
    }

    return html;
  }

  function _renderDetailPanel(s) {
    var html = '<div class="mh-detail">';
    html += '<div class="mh-detail-grid">';

    var stats = [
      { label: 'Score',         value: (s.score || 0).toLocaleString() },
      { label: 'Lines',         value: (s.lines || 0).toLocaleString() },
      { label: 'Duration',      value: _fmtTime(s.durationSecs) },
      { label: 'Mode',          value: _modeLabel(s.mode) },
    ];
    if (s.level != null && s.level > 0) stats.push({ label: 'Level Reached', value: s.level });
    if (s.maxCombo > 0)      stats.push({ label: 'Max Combo',    value: s.maxCombo + '×' });
    if (s.tetrises > 0)      stats.push({ label: 'Tetrises',     value: s.tetrises });
    if (s.tSpins > 0)        stats.push({ label: 'T-Spins',      value: s.tSpins });
    if (s.piecesPlaced > 0)  stats.push({ label: 'Pieces',       value: s.piecesPlaced.toLocaleString() });
    if (s.apm > 0)           stats.push({ label: 'APM',          value: s.apm });
    if (s.result && s.result !== 'complete') stats.push({ label: 'Result', value: s.result.toUpperCase() });

    for (var i = 0; i < stats.length; i++) {
      html += '<div class="mh-detail-item">' +
        '<div class="mh-detail-label">' + stats[i].label + '</div>' +
        '<div class="mh-detail-val">' + stats[i].value + '</div>' +
      '</div>';
    }

    html += '</div>';

    // Replay link if replay data available for this session
    if (typeof replayGetLatest === 'function') {
      var replay = replayGetLatest();
      if (replay) {
        html += '<div class="mh-detail-actions">' +
          '<button class="mh-detail-btn" id="mh-view-replay-btn">▶ Watch Replay</button>' +
        '</div>';
      }
    }

    html += '</div>';
    return html;
  }

  // ── Render: actions bar ────────────────────────────────────────────────────

  function _renderActions() {
    return '<div class="mh-actions">' +
      '<button class="mh-action-btn" id="mh-export-csv-btn">⬇ Export CSV</button>' +
      '<button class="mh-action-btn mh-action-danger" id="mh-clear-btn">🗑 Clear History</button>' +
    '</div>';
  }

  // ── Wire events ────────────────────────────────────────────────────────────

  function _wireEvents(containerEl, history, filtered) {
    // Mode pills
    var pills = containerEl.querySelectorAll('.mh-pill');
    for (var pi = 0; pi < pills.length; pi++) {
      pills[pi].addEventListener('click', function (e) {
        _state.modeFilter = e.currentTarget.getAttribute('data-mh-mode') || 'all';
        _state.expandedIdx = null;
        _state.page = 0;
        _refresh(containerEl);
      });
    }

    // Date from/to
    var fromEl = containerEl.querySelector('#mh-date-from');
    var toEl   = containerEl.querySelector('#mh-date-to');
    if (fromEl) {
      fromEl.addEventListener('change', function (e) {
        _state.dateFrom = e.target.value;
        _state.expandedIdx = null;
        _state.page = 0;
        _refreshTable(containerEl);
      });
    }
    if (toEl) {
      toEl.addEventListener('change', function (e) {
        _state.dateTo = e.target.value;
        _state.expandedIdx = null;
        _state.page = 0;
        _refreshTable(containerEl);
      });
    }

    // Sort select
    var sortEl = containerEl.querySelector('#mh-sort-select');
    if (sortEl) {
      sortEl.addEventListener('change', function (e) {
        _state.sort = e.target.value;
        _state.expandedIdx = null;
        _state.page = 0;
        _refreshTable(containerEl);
      });
    }

    // Row expand/collapse
    _wireRowClicks(containerEl);

    // Pagination
    _wirePagination(containerEl);

    // Export CSV
    var exportBtn = containerEl.querySelector('#mh-export-csv-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        _exportCSV(_getData());
      });
    }

    // Clear history
    var clearBtn = containerEl.querySelector('#mh-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        _confirmClear(containerEl);
      });
    }

    // Replay button (if in expanded row)
    var replayBtn = containerEl.querySelector('#mh-view-replay-btn');
    if (replayBtn) {
      replayBtn.addEventListener('click', function () {
        if (typeof openReplayOverlay === 'function') openReplayOverlay();
        else if (typeof openReplayPanel === 'function') openReplayPanel();
      });
    }
  }

  function _wireRowClicks(containerEl) {
    var rows = containerEl.querySelectorAll('.mh-row');
    for (var ri = 0; ri < rows.length; ri++) {
      rows[ri].addEventListener('click', function (e) {
        var idx = parseInt(e.currentTarget.getAttribute('data-mh-idx'), 10);
        _state.expandedIdx = (_state.expandedIdx === idx) ? null : idx;
        _refreshTable(containerEl);
      });
    }
  }

  function _wirePagination(containerEl) {
    var prevBtn = containerEl.querySelector('#mh-prev-btn');
    var nextBtn = containerEl.querySelector('#mh-next-btn');
    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        if (_state.page > 0) { _state.page--; _state.expandedIdx = null; _refreshTable(containerEl); }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        _state.page++;
        _state.expandedIdx = null;
        _refreshTable(containerEl);
      });
    }
  }

  // ── Refresh helpers ────────────────────────────────────────────────────────

  function _getTableWrap(containerEl) {
    return containerEl.querySelector('.mh-table-section');
  }

  function _refresh(containerEl) {
    // Full re-render (mode filter changed — rebuild pills + table)
    var history = _getData();
    var filtered = _applyFilters(history, _state);
    containerEl.innerHTML = _buildHTML(history, filtered);
    _wireEvents(containerEl, history, filtered);
    _injectCSS();
  }

  function _refreshTable(containerEl) {
    // Partial re-render — just the table section
    var history = _getData();
    var filtered = _applyFilters(history, _state);
    var tableSection = containerEl.querySelector('.mh-table-section');
    if (tableSection) {
      tableSection.innerHTML = _renderRows(filtered, _state.page);
      _wireRowClicks(containerEl);
      _wirePagination(containerEl);
      // Re-wire replay button if visible
      var replayBtn = containerEl.querySelector('#mh-view-replay-btn');
      if (replayBtn) {
        replayBtn.addEventListener('click', function () {
          if (typeof openReplayOverlay === 'function') openReplayOverlay();
        });
      }
    }
  }

  // ── Build full HTML ────────────────────────────────────────────────────────

  function _buildHTML(history, filtered) {
    var html = '';
    html += _renderSummary(history);
    html += _renderFilters();
    html += '<div class="mh-table-section">';
    html += _renderRows(filtered, _state.page);
    html += '</div>';
    html += _renderActions();
    return html;
  }

  // ── Export CSV ─────────────────────────────────────────────────────────────

  function _exportCSV(history) {
    var rows = [
      ['Date', 'Mode', 'Score', 'Lines', 'Duration (s)', 'Level', 'Max Combo',
       'Tetrises', 'T-Spins', 'Pieces', 'APM', 'Result'].join(',')
    ];
    for (var i = 0; i < history.length; i++) {
      var s = history[i];
      rows.push([
        s.date || '',
        s.mode || '',
        s.score || 0,
        s.lines || 0,
        s.durationSecs || 0,
        s.level || '',
        s.maxCombo || 0,
        s.tetrises || 0,
        s.tSpins || 0,
        s.piecesPlaced || 0,
        s.apm || 0,
        s.result || '',
      ].join(','));
    }
    try {
      var blob = new Blob([rows.join('\n')], { type: 'text/csv' });
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement('a');
      a.href     = url;
      a.download = 'minetris-match-history.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (_) {}
  }

  // ── Clear history ──────────────────────────────────────────────────────────

  function _confirmClear(containerEl) {
    var existing = containerEl.querySelector('.mh-confirm-overlay');
    if (existing) return;

    var overlay = document.createElement('div');
    overlay.className = 'mh-confirm-overlay';
    overlay.innerHTML =
      '<div class="mh-confirm-box">' +
        '<div class="mh-confirm-title">Clear Match History?</div>' +
        '<div class="mh-confirm-msg">This will permanently erase all ' + _getData().length + ' recorded games. This cannot be undone.</div>' +
        '<div class="mh-confirm-btns">' +
          '<button class="mh-confirm-yes">Clear All</button>' +
          '<button class="mh-confirm-no">Cancel</button>' +
        '</div>' +
      '</div>';

    containerEl.style.position = 'relative';
    containerEl.appendChild(overlay);

    overlay.querySelector('.mh-confirm-yes').addEventListener('click', function () {
      try { localStorage.removeItem('mineCtris_sessionHistory'); } catch (_) {}
      _state.expandedIdx = null;
      _state.page = 0;
      containerEl.removeChild(overlay);
      _refresh(containerEl);
    });
    overlay.querySelector('.mh-confirm-no').addEventListener('click', function () {
      containerEl.removeChild(overlay);
    });
  }

  // ── CSS injection ──────────────────────────────────────────────────────────

  function _injectCSS() {
    if (document.getElementById('mh-styles')) return;
    var style = document.createElement('style');
    style.id = 'mh-styles';
    style.textContent = [
      /* Summary strip */
      '.mh-summary{display:flex;flex-wrap:wrap;gap:8px;padding:10px 0 14px;border-bottom:1px solid rgba(0,255,0,0.1);margin-bottom:12px;}',
      '.mh-sum-item{flex:1 1 80px;text-align:center;background:rgba(0,255,0,0.04);border-radius:6px;padding:8px 6px;}',
      '.mh-sum-val{font-family:"Press Start 2P",monospace;font-size:11px;color:#4ade80;margin-bottom:4px;}',
      '.mh-sum-label{font-size:9px;color:#6b8a6b;letter-spacing:0.08em;}',
      /* Filters */
      '.mh-filters{margin-bottom:10px;}',
      '.mh-mode-pills{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;}',
      '.mh-pill{font-family:"Press Start 2P",monospace;font-size:8px;padding:4px 8px;background:rgba(0,0,0,0.5);border:1px solid rgba(0,255,0,0.2);color:#6b8a6b;border-radius:4px;cursor:pointer;}',
      '.mh-pill:hover{border-color:#0f0;color:#0f0;}',
      '.mh-pill-active{border-color:#0f0;color:#0f0;background:rgba(0,255,0,0.08);}',
      '.mh-filter-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;}',
      '.mh-filter-label{font-size:9px;color:#6b8a6b;display:flex;align-items:center;gap:6px;}',
      '.mh-date-input{background:#111;border:1px solid rgba(0,255,0,0.2);color:#ccc;font-size:10px;padding:3px 6px;border-radius:4px;}',
      '.mh-sort-select{background:#111;border:1px solid rgba(0,255,0,0.2);color:#ccc;font-size:9px;padding:3px 6px;border-radius:4px;}',
      /* Table */
      '.mh-table-wrap{overflow-x:auto;margin-bottom:8px;}',
      '.mh-table{width:100%;border-collapse:collapse;font-size:10px;}',
      '.mh-table th{text-align:left;padding:6px 8px;color:#6b8a6b;font-size:8px;letter-spacing:0.08em;border-bottom:1px solid rgba(0,255,0,0.15);}',
      '.mh-table td{padding:7px 8px;border-bottom:1px solid rgba(0,255,0,0.06);color:#ccc;}',
      '.mh-row{cursor:pointer;transition:background 0.15s;}',
      '.mh-row:hover td{background:rgba(0,255,0,0.04);}',
      '.mh-row-expanded td{background:rgba(0,255,0,0.06);color:#4ade80;}',
      '.mh-detail-row td{padding:0;background:rgba(0,255,0,0.03);}',
      /* Expanded detail */
      '.mh-detail{padding:12px 14px;}',
      '.mh-detail-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin-bottom:10px;}',
      '.mh-detail-item{background:rgba(0,0,0,0.3);border-radius:5px;padding:8px 10px;}',
      '.mh-detail-label{font-size:8px;color:#6b8a6b;margin-bottom:3px;}',
      '.mh-detail-val{font-family:"Press Start 2P",monospace;font-size:9px;color:#4ade80;}',
      '.mh-detail-actions{margin-top:8px;}',
      '.mh-detail-btn{font-family:"Press Start 2P",monospace;font-size:8px;padding:5px 10px;background:rgba(0,255,0,0.1);border:1px solid rgba(0,255,0,0.3);color:#4ade80;border-radius:4px;cursor:pointer;}',
      '.mh-detail-btn:hover{background:rgba(0,255,0,0.18);}',
      /* Mode badge */
      '.mh-mode-badge{font-size:9px;}',
      /* Result badge */
      '.mh-result{font-family:"Press Start 2P",monospace;font-size:7px;padding:2px 5px;border-radius:3px;}',
      '.mh-result-win{color:#4ade80;border:1px solid rgba(74,222,128,0.3);}',
      '.mh-result-loss{color:#ef4444;border:1px solid rgba(239,68,68,0.3);}',
      '.mh-result-complete{color:#6b8a6b;}',
      /* Pagination */
      '.mh-pagination{display:flex;align-items:center;justify-content:center;gap:12px;padding:8px 0;}',
      '.mh-page-btn{font-family:"Press Start 2P",monospace;font-size:8px;padding:5px 10px;background:rgba(0,0,0,0.5);border:1px solid rgba(0,255,0,0.2);color:#6b8a6b;border-radius:4px;cursor:pointer;}',
      '.mh-page-btn:hover:not(:disabled){border-color:#0f0;color:#0f0;}',
      '.mh-page-btn:disabled{opacity:0.35;cursor:not-allowed;}',
      '.mh-page-info{font-size:9px;color:#6b8a6b;}',
      '.mh-row-count{font-size:9px;color:#6b8a6b;text-align:center;padding:6px 0;}',
      /* Empty state */
      '.mh-empty{padding:24px;text-align:center;color:#6b8a6b;font-size:10px;}',
      /* Actions */
      '.mh-actions{display:flex;gap:8px;flex-wrap:wrap;padding:10px 0;border-top:1px solid rgba(0,255,0,0.1);margin-top:8px;}',
      '.mh-action-btn{font-family:"Press Start 2P",monospace;font-size:8px;padding:6px 12px;background:rgba(0,0,0,0.5);border:1px solid rgba(0,255,0,0.25);color:#6b8a6b;border-radius:4px;cursor:pointer;}',
      '.mh-action-btn:hover{border-color:#0f0;color:#0f0;}',
      '.mh-action-danger{border-color:rgba(239,68,68,0.3);color:#ef9090;}',
      '.mh-action-danger:hover{border-color:#ef4444;color:#ef4444;}',
      /* Confirm overlay */
      '.mh-confirm-overlay{position:absolute;inset:0;background:rgba(0,0,0,0.75);z-index:200;display:flex;align-items:center;justify-content:center;}',
      '.mh-confirm-box{background:#0d1f0d;border:1px solid rgba(0,255,0,0.3);border-radius:8px;padding:20px 24px;text-align:center;max-width:340px;}',
      '.mh-confirm-title{font-family:"Press Start 2P",monospace;font-size:10px;color:#4ade80;margin-bottom:12px;}',
      '.mh-confirm-msg{font-size:10px;color:#aaa;margin-bottom:16px;line-height:1.6;}',
      '.mh-confirm-btns{display:flex;gap:10px;justify-content:center;}',
      '.mh-confirm-yes{font-family:"Press Start 2P",monospace;font-size:8px;padding:7px 14px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.4);color:#ef4444;border-radius:4px;cursor:pointer;}',
      '.mh-confirm-yes:hover{background:rgba(239,68,68,0.22);}',
      '.mh-confirm-no{font-family:"Press Start 2P",monospace;font-size:8px;padding:7px 14px;background:rgba(0,0,0,0.5);border:1px solid rgba(0,255,0,0.2);color:#6b8a6b;border-radius:4px;cursor:pointer;}',
      '.mh-confirm-no:hover{border-color:#0f0;color:#0f0;}',
      /* Standalone overlay */
      '#match-history-overlay{position:fixed;inset:0;z-index:2500;background:rgba(0,0,0,0.88);display:none;align-items:center;justify-content:center;overflow-y:auto;}',
      '#match-history-panel{width:min(860px,97vw);max-height:92vh;overflow-y:auto;background:#0d1f0d;border:1px solid rgba(0,255,0,0.25);border-radius:10px;padding:20px 22px;position:relative;}',
      '#match-history-title{font-family:"Press Start 2P",monospace;font-size:13px;color:#4ade80;margin-bottom:16px;text-align:center;letter-spacing:0.1em;}',
      '#match-history-close{position:absolute;top:14px;right:16px;background:none;border:none;color:#6b8a6b;font-size:18px;cursor:pointer;line-height:1;}',
      '#match-history-close:hover{color:#fff;}',
    ].join('');
    document.head.appendChild(style);
  }

  // ── Public API: embed in any container ────────────────────────────────────

  function renderMatchHistoryContent(containerEl) {
    if (!containerEl) return;
    _injectCSS();
    var history  = _getData();
    var filtered = _applyFilters(history, _state);
    containerEl.innerHTML = _buildHTML(history, filtered);
    _wireEvents(containerEl, history, filtered);
  }

  // ── Public API: standalone overlay ────────────────────────────────────────

  function openMatchHistoryOverlay() {
    _injectCSS();

    var overlay = document.getElementById('match-history-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'match-history-overlay';
      overlay.style.display = 'none';
      document.body.appendChild(overlay);
    }

    if (!overlay.querySelector('#match-history-panel')) {
      overlay.innerHTML =
        '<div id="match-history-panel">' +
          '<div id="match-history-title">&#128202; MATCH HISTORY</div>' +
          '<button id="match-history-close" aria-label="Close">&#10005;</button>' +
          '<div id="match-history-body"></div>' +
        '</div>';

      overlay.querySelector('#match-history-close').addEventListener('click', closeMatchHistoryOverlay);
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeMatchHistoryOverlay();
      });
    }

    overlay.style.display = 'flex';

    var bodyEl = overlay.querySelector('#match-history-body');
    if (bodyEl) renderMatchHistoryContent(bodyEl);
  }

  function closeMatchHistoryOverlay() {
    var overlay = document.getElementById('match-history-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  // ── Exports ────────────────────────────────────────────────────────────────

  window.renderMatchHistoryContent = renderMatchHistoryContent;
  window.openMatchHistoryOverlay   = openMatchHistoryOverlay;
  window.closeMatchHistoryOverlay  = closeMatchHistoryOverlay;

}());
