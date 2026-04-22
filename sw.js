// MINETRIS Service Worker
// Cache version — bump this string to trigger an update toast in the game
const CACHE_VERSION = 'minetris-v7.2.4';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// All static game assets to pre-cache on install
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './css/touch-controls.css',
  './css/mobile.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  // Sounds
  './sounds/leaf_break.wav',
  './sounds/leaf_hit.wav',
  './sounds/place.wav',
  './sounds/stone_break.wav',
  './sounds/stone_hit.wav',
  './sounds/wood_break.wav',
  './sounds/wood_hit.wav',
  // Data
  './data/seasonal-events.json',
  // JS — core
  './js/core/config.js',
  './js/core/state.js',
  './js/core/gamestate.js',
  './js/core/gamestate-reset.js',
  './js/core/gamestate-battle.js',
  './js/core/pieces.js',
  './js/core/lineclear.js',
  './js/core/inventory.js',
  './js/core/savestate.js',
  './js/core/replay.js',
  './js/core/finesse.js',
  './js/core/error-reporter.js',
  './js/core/game-loop.js',
  // JS — player
  './js/player/player.js',
  './js/player/input.js',
  './js/player/haptics.js',
  './js/player/touch-controls.js',
  './js/player/keybindings.js',
  './js/player/crafting.js',
  './js/player/gamepad.js',
  './js/player/powerups.js',
  // JS — world
  './js/world/world.js',
  './js/world/worldmodifier.js',
  './js/world/mining.js',
  './js/world/hazard-blocks.js',
  './js/world/underground.js',
  './js/world/biome-rules.js',
  './js/world/biome-themes.js',
  './js/world/biome-particles.js',
  './js/world/biome-cosmetics.js',
  './js/world/cave-mouth.js',
  './js/world/world-spawn.js',
  // JS — rendering
  './js/rendering/graphics-quality.js',
  './js/rendering/shaders.js',
  './js/rendering/shadows.js',
  './js/rendering/board-backgrounds.js',
  './js/rendering/sky.js',
  './js/rendering/postprocessing.js',
  './js/rendering/particles.js',
  './js/rendering/aura.js',
  './js/rendering/trails.js',
  './js/rendering/resize.js',
  // JS — modes
  './js/modes/daily.js',
  './js/modes/weekly.js',
  './js/modes/sprint.js',
  './js/modes/blitz.js',
  './js/modes/survival.js',
  './js/modes/practice.js',
  './js/modes/puzzle.js',
  './js/modes/puzzle-completion.js',
  './js/modes/dungeon-modifier.js',
  './js/modes/infinite-weekly.js',
  './js/modes/marathon-endless.js',
  './js/modes/training.js',
  // JS — progression
  './js/progression/highscores.js',
  './js/progression/leveling.js',
  './js/progression/achievements.js',
  './js/progression/missions.js',
  './js/progression/season.js',
  './js/progression/season-pass.js',
  './js/progression/season-missions.js',
  './js/progression/season-recap.js',
  './js/progression/featured-season-pass.js',
  './js/progression/mastery.js',
  './js/progression/stats.js',
  './js/progression/loot-tables.js',
  './js/progression/mode-unlock.js',
  // JS — audio
  './js/audio/audio.js',
  './js/audio/audio-sfx.js',
  './js/audio/audio-event.js',
  './js/audio/audio-env.js',
  './js/audio/jukebox.js',
  // JS — UI
  './js/ui/history.js',
  './js/ui/settings.js',
  './js/ui/tutorial.js',
  './js/ui/coach-marks.js',
  './js/ui/leaderboard.js',
  './js/ui/notifications.js',
  './js/ui/mode-select.js',
  './js/ui/game-tooltips.js',
  './js/ui/editor.js',
  './js/ui/editor-tutorial.js',
  './js/ui/puzzle-codec.js',
  './js/ui/qr-canvas.js',
  './js/ui/share-modal-init.js',
  './js/ui/shareland.js',
  './js/ui/profile-page.js',
  './js/ui/theme-editor.js',
  './js/ui/mini-game.js',
  './js/ui/multiplayer-hud.js',
  // JS — social
  './js/social/chat.js',
  './js/social/community.js',
  './js/social/community-goals.js',
  './js/social/friends.js',
  './js/social/rooms.js',
  './js/social/rooms-init.js',
  './js/social/guild.js',
  './js/social/guild-home.js',
  './js/social/guild-chat.js',
  './js/social/guild-panel-views.js',
  './js/social/guild-war-helpers.js',
  './js/social/guild-profile.js',
  './js/social/guild-expedition.js',
  './js/social/clan-war-engine.js',
  './js/social/clan-war-results.js',
  './js/social/clan-war-standings.js',
  './js/social/coop.js',
  './js/social/coop-init.js',
  './js/social/coop-highlight.js',
  './js/social/coop-avatar.js',
  './js/social/coop-emote.js',
  './js/social/coop-trade.js',
  './js/social/tournament.js',
  './js/social/tournament-init.js',
  // JS — events/cosmetics/expedition
  './js/events/events.js',
  './js/events/events-creeper.js',
  './js/events/seasonal-events.js',
  './js/cosmetics/cosmetics.js',
  './js/cosmetics/boardskins.js',
  './js/cosmetics/story-fragments.js',
  './js/expedition/expedition-session.js',
  './js/expedition/expedition-map.js',
  './js/expedition/expedition-codex.js',
  './js/expedition/expedition-leaderboard.js',
  './js/expedition/expedition-reward-tracks.js',
  // JS — data/battle/main
  './js/data/metrics.js',
  './js/battle/battle.js',
  './js/battle/battle-hud.js',
  './js/battle/battle-fx.js',
  './js/battle/battle-garbage.js',
  './js/battle/battle-rating.js',
  './js/battle/battle-init.js',
  './js/battle/battle-spectator-init.js',
  './js/battle/matchmaking.js',
  './js/battle/battleroyale.js',
  // JS — themes & i18n
  './js/avatar.js',
  './js/netcode.js',
  './js/themes.js',
  './js/i18n/i18n.js',
  './js/loader.js',
  './js/main.js',
];

// CDN URLs that should be cached at runtime (not pre-cached to keep install fast)
const CDN_PATTERNS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
];

// API/multiplayer endpoints — network-first, never offline-only
const NETWORK_FIRST_PATTERNS = [
  '/api/',
  'leaderboard',
  'tournament',
  'coop',
  'multiplayer',
];

// ── Message: allow page to trigger skipWaiting ──────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Push notifications ──────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'MineCtris', body: 'You have a new notification.', icon: './icons/icon-192.png' };
  if (event.data) {
    try { Object.assign(data, event.data.json()); } catch (_) {
      data.body = event.data.text();
    }
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:  data.body,
      icon:  data.icon || './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag:   data.tag || 'minetris-notif',
      data:  { url: data.url || './' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) { client.focus(); return; }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});

// ── Install: pre-cache all static assets ────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      // Use individual adds so one 404 doesn't break the whole install
      return Promise.allSettled(
        STATIC_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Failed to cache:', url, err.message);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches ───────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => {
      self.clients.claim();
      // Notify all tabs that a new version is active
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) =>
          client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION })
        );
      });
    })
  );
});

// ── Fetch: route requests ────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and chrome-extension requests
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // Network-first for API / multiplayer calls
  if (NETWORK_FIRST_PATTERNS.some((p) => url.pathname.includes(p))) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Stale-while-revalidate for CDN assets (fonts, three.js, etc.)
  if (CDN_PATTERNS.some((p) => url.hostname.includes(p))) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    return;
  }

  // Cache-first for all local static assets
  event.respondWith(cacheFirst(request));
});

// ── Strategy helpers ─────────────────────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Return a minimal offline fallback for navigation requests
    if (request.mode === 'navigate') {
      const cached = await caches.match('./index.html');
      if (cached) return cached;
    }
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(JSON.stringify({ offline: true }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached || await fetchPromise || new Response('', { status: 503 });
}
