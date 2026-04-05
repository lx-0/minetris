// Parallax biome background — CSS-based layers behind the Three.js canvas.
// Six biomes: plains, forest, desert, nether, end, ocean.
// Three CSS layers per biome: far (sky), mid (terrain), near (foreground).
// Layers scroll horizontally at different speeds based on difficultyMultiplier.
// Day/night cycle runs over 5 minutes for applicable biomes.
// Requires: state.js (scene, difficultyMultiplier), biome-themes.js (activeBiomeId),
//           dungeon-modifier.js (activeDungeonId)

const PARALLAX_BIOME_KEY    = 'mineCtris_parallaxBiome';   // 'plains'|…|'random'
const PARALLAX_ENABLED_KEY  = 'mineCtris_parallaxEnabled'; // 'true'|'false'
const PARALLAX_DAY_CYCLE    = 300;   // 5-minute full day/night cycle, seconds
const PARALLAX_BASE_SPEED   = 48;    // px/s for near layer at 1× difficulty

// Map expedition/dungeon biome IDs to parallax biome IDs
const _BIOME_MAP = {
  stone:  'plains',
  forest: 'forest',
  nether: 'nether',
  ice:    'plains',
  desert: 'desert',
};

// Dungeon tier → parallax biome
const _DUNGEON_MAP = {
  shallow_mines: 'plains',
  deep_caverns:  'forest',
  abyssal_rift:  'end',
  infinite:      'nether',
};

const _RANDOM_POOL = ['plains', 'forest', 'desert', 'nether', 'end', 'ocean'];

// Module state
let _parallaxEnabled = true;
let _selectedBiome   = 'random';  // player preference
let _activeBiome     = 'plains';  // currently rendered
let _randomBiome     = 'plains';  // chosen for this session when mode = 'random'
let _offset          = 0;         // accumulated scroll offset in px
let _dayPhase        = 0.5;       // 0 = midnight, 0.5 = noon
let _dayTimer        = PARALLAX_DAY_CYCLE * 0.5; // start at noon

let _container, _layerFar, _layerMid, _layerNear, _nightOverlay;
let _initialized     = false;

// ── SVG layer builders ────────────────────────────────────────────────────────

function _svg(w, h, content) {
  return 'url("data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${content}</svg>`
  ) + '")';
}

// ── Plains ───────────────────────────────────────────────────────────────────

function _plainsFar() {
  return _svg(800, 300, `
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#6AB4E8"/>
        <stop offset="62%" stop-color="#B8E0F5"/>
        <stop offset="62%" stop-color="#6EAE42"/>
        <stop offset="100%" stop-color="#4E8A2E"/>
      </linearGradient>
    </defs>
    <rect width="800" height="300" fill="url(#sky)"/>
    <circle cx="650" cy="55" r="36" fill="#FFE840" opacity=".9"/>
    <ellipse cx="150" cy="38" rx="72" ry="22" fill="white" opacity=".82"/>
    <ellipse cx="130" cy="42" rx="50" ry="16" fill="white" opacity=".7"/>
    <ellipse cx="450" cy="28" rx="60" ry="18" fill="white" opacity=".78"/>
    <ellipse cx="430" cy="33" rx="44" ry="14" fill="white" opacity=".65"/>
    <path d="M0 222 Q80 194 160 210 Q240 182 320 205 Q400 175 480 198 Q560 172 640 192 Q720 180 800 194 L800 222Z" fill="#5A9A32"/>
    <path d="M0 235 Q100 218 200 228 Q300 210 400 222 Q500 208 600 220 Q700 212 800 218 L800 235Z" fill="#4E8A2E"/>
  `);
}

function _plainsMid() {
  return _svg(800, 300, `
    <rect width="800" height="300" fill="transparent"/>
    <path d="M0 300 L0 220 Q40 200 80 218 Q120 196 160 214 Q200 190 240 212 Q280 188 320 208 Q360 192 400 210 Q440 190 480 206 Q520 182 560 202 Q600 188 640 200 Q680 186 720 198 Q760 190 800 196 L800 300Z" fill="#48881E"/>
    <rect x="60" y="180" width="14" height="60" fill="#5A3A1A"/>
    <ellipse cx="67" cy="172" rx="28" ry="22" fill="#2D7A1C"/>
    <ellipse cx="67" cy="162" rx="20" ry="16" fill="#3A9922"/>
    <rect x="180" y="170" width="16" height="70" fill="#5A3A1A"/>
    <ellipse cx="188" cy="162" rx="32" ry="24" fill="#2D7A1C"/>
    <ellipse cx="188" cy="150" rx="22" ry="18" fill="#3A9922"/>
    <rect x="440" y="175" width="14" height="65" fill="#5A3A1A"/>
    <ellipse cx="447" cy="167" rx="28" ry="22" fill="#2D7A1C"/>
    <ellipse cx="447" cy="157" rx="20" ry="16" fill="#3A9922"/>
    <rect x="650" y="178" width="16" height="62" fill="#5A3A1A"/>
    <ellipse cx="658" cy="170" rx="30" ry="23" fill="#2D7A1C"/>
    <ellipse cx="658" cy="160" rx="22" ry="17" fill="#3A9922"/>
    <rect x="760" y="172" width="14" height="68" fill="#5A3A1A"/>
    <ellipse cx="767" cy="164" rx="28" ry="21" fill="#2D7A1C"/>
    <ellipse cx="767" cy="154" rx="20" ry="15" fill="#3A9922"/>
  `);
}

function _plainsNear() {
  return _svg(800, 300, `
    <rect width="800" height="300" fill="transparent"/>
    <rect x="0" y="258" width="800" height="42" fill="#3E7218"/>
    <rect x="20" y="248" width="8" height="18" fill="#4A8820" transform="rotate(-8,24,258)"/>
    <rect x="20" y="248" width="8" height="20" fill="#5AAA28" transform="rotate(5,24,258)"/>
    <rect x="90" y="246" width="8" height="16" fill="#4A8820" transform="rotate(-5,94,258)"/>
    <rect x="90" y="246" width="8" height="18" fill="#5AAA28" transform="rotate(10,94,258)"/>
    <rect x="190" y="250" width="8" height="16" fill="#4A8820" transform="rotate(-10,194,258)"/>
    <rect x="190" y="250" width="8" height="18" fill="#5AAA28" transform="rotate(4,194,258)"/>
    <rect x="340" y="248" width="8" height="20" fill="#4A8820" transform="rotate(6,344,258)"/>
    <rect x="340" y="248" width="8" height="16" fill="#5AAA28" transform="rotate(-7,344,258)"/>
    <rect x="500" y="244" width="8" height="18" fill="#4A8820" transform="rotate(-4,504,258)"/>
    <rect x="500" y="244" width="8" height="20" fill="#5AAA28" transform="rotate(8,504,258)"/>
    <rect x="640" y="248" width="8" height="16" fill="#4A8820" transform="rotate(7,644,258)"/>
    <rect x="640" y="248" width="8" height="18" fill="#5AAA28" transform="rotate(-6,644,258)"/>
    <rect x="740" y="246" width="8" height="20" fill="#4A8820" transform="rotate(-9,744,258)"/>
    <circle cx="55" cy="253" r="5" fill="#FFD700"/>
    <circle cx="57" cy="251" r="3" fill="#FFA500"/>
    <circle cx="270" cy="252" r="5" fill="#FF6060"/>
    <circle cx="272" cy="250" r="3" fill="#FF3030"/>
    <circle cx="420" cy="254" r="5" fill="#FFD700"/>
    <circle cx="600" cy="252" r="5" fill="#FF6060"/>
    <circle cx="710" cy="253" r="5" fill="#FFD700"/>
  `);
}

// ── Forest ───────────────────────────────────────────────────────────────────

function _forestFar() {
  return _svg(800, 300, `
    <defs>
      <linearGradient id="fsky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1A3A1A"/>
        <stop offset="45%" stop-color="#2D6E2D"/>
        <stop offset="45%" stop-color="#1C5218"/>
        <stop offset="100%" stop-color="#143A10"/>
      </linearGradient>
    </defs>
    <rect width="800" height="300" fill="url(#fsky)"/>
    <ellipse cx="100" cy="20" rx="50" ry="15" fill="#2A7A2A" opacity=".7"/>
    <ellipse cx="300" cy="10" rx="70" ry="20" fill="#246224" opacity=".65"/>
    <ellipse cx="550" cy="15" rx="60" ry="18" fill="#2A7A2A" opacity=".72"/>
    <ellipse cx="720" cy="8" rx="55" ry="16" fill="#246224" opacity=".68"/>
    <line x1="200" y1="0" x2="198" y2="135" stroke="rgba(255,240,200,0.08)" stroke-width="12"/>
    <line x1="450" y1="0" x2="447" y2="135" stroke="rgba(255,240,200,0.07)" stroke-width="10"/>
    <line x1="650" y1="0" x2="648" y2="135" stroke="rgba(255,240,200,0.09)" stroke-width="14"/>
  `);
}

function _forestMid() {
  return _svg(800, 300, `
    <rect width="800" height="300" fill="transparent"/>
    <rect x="0" y="240" width="800" height="60" fill="#1A4A10"/>
    <rect x="30" y="60" width="28" height="240" fill="#3A2010"/>
    <ellipse cx="44" cy="52" rx="52" ry="38" fill="#1E5E14"/>
    <ellipse cx="44" cy="38" rx="38" ry="28" fill="#237018"/>
    <rect x="160" y="80" width="24" height="220" fill="#3A2010"/>
    <ellipse cx="172" cy="72" rx="46" ry="34" fill="#1E5E14"/>
    <ellipse cx="172" cy="58" rx="34" ry="26" fill="#237018"/>
    <rect x="340" y="50" width="30" height="250" fill="#3A2010"/>
    <ellipse cx="355" cy="42" rx="58" ry="42" fill="#1E5E14"/>
    <ellipse cx="355" cy="26" rx="42" ry="30" fill="#237018"/>
    <rect x="520" y="70" width="26" height="230" fill="#3A2010"/>
    <ellipse cx="533" cy="62" rx="50" ry="36" fill="#1E5E14"/>
    <ellipse cx="533" cy="48" rx="36" ry="27" fill="#237018"/>
    <rect x="680" y="65" width="28" height="235" fill="#3A2010"/>
    <ellipse cx="694" cy="57" rx="52" ry="38" fill="#1E5E14"/>
    <ellipse cx="694" cy="43" rx="38" ry="28" fill="#237018"/>
  `);
}

function _forestNear() {
  return _svg(800, 300, `
    <rect width="800" height="300" fill="transparent"/>
    <rect x="0" y="260" width="800" height="40" fill="#143010"/>
    <path d="M0 260 Q20 240 40 255 Q60 238 80 252 Q100 235 120 250 Q140 238 160 252 Q180 235 200 248 Q220 232 240 248 Q260 235 280 250 Q300 238 320 252 Q340 236 360 250 Q380 235 400 250 Q420 238 440 252 Q460 236 480 250 Q500 235 520 248 Q540 236 560 250 Q580 235 600 248 Q620 232 640 246 Q660 234 680 248 Q700 232 720 246 Q740 234 760 248 Q780 232 800 245 L800 260Z" fill="#1C4818"/>
    <rect x="0" y="220" width="12" height="80" fill="#2A1808"/>
    <rect x="100" y="215" width="14" height="85" fill="#2A1808"/>
    <rect x="240" y="210" width="12" height="90" fill="#2A1808"/>
    <rect x="400" y="218" width="14" height="82" fill="#2A1808"/>
    <rect x="560" y="212" width="12" height="88" fill="#2A1808"/>
    <rect x="700" y="216" width="14" height="84" fill="#2A1808"/>
    <ellipse cx="6" cy="215" rx="22" ry="12" fill="#1C5010"/>
    <ellipse cx="107" cy="210" rx="24" ry="13" fill="#1C5010"/>
    <ellipse cx="246" cy="205" rx="22" ry="12" fill="#1C5010"/>
    <ellipse cx="407" cy="213" rx="24" ry="12" fill="#1C5010"/>
    <ellipse cx="566" cy="207" rx="22" ry="12" fill="#1C5010"/>
    <ellipse cx="707" cy="211" rx="24" ry="13" fill="#1C5010"/>
  `);
}

// ── Desert ───────────────────────────────────────────────────────────────────

function _desertFar() {
  return _svg(800, 300, `
    <defs>
      <linearGradient id="dsky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#E8A820"/>
        <stop offset="55%" stop-color="#F5D080"/>
        <stop offset="55%" stop-color="#D4A844"/>
        <stop offset="100%" stop-color="#C89030"/>
      </linearGradient>
    </defs>
    <rect width="800" height="300" fill="url(#dsky)"/>
    <circle cx="700" cy="60" r="42" fill="#FFD050" opacity=".95"/>
    <ellipse cx="700" cy="60" rx="56" ry="56" fill="none" stroke="#FFE880" stroke-width="8" opacity=".4"/>
    <path d="M80 165 L160 130 L240 165 Z" fill="#B8882A"/>
    <path d="M140 165 L240 118 L340 165 Z" fill="#C4942E"/>
    <path d="M500 165 L580 125 L660 165 Z" fill="#B8882A"/>
    <path d="M0 165 L800 165 L800 300 L0 300 Z" fill="#C89030"/>
    <path d="M0 175 Q100 165 200 170 Q300 162 400 168 Q500 160 600 166 Q700 158 800 164 L800 175Z" fill="#B07828"/>
  `);
}

function _desertMid() {
  return _svg(800, 300, `
    <rect width="800" height="300" fill="transparent"/>
    <rect x="0" y="195" width="800" height="105" fill="#C08828"/>
    <path d="M0 195 Q60 175 120 190 Q180 170 240 185 Q300 170 360 183 Q420 168 480 182 Q540 170 600 182 Q660 168 720 180 Q760 172 800 178 L800 195Z" fill="#B07820"/>
    <rect x="70" y="148" width="18" height="66" fill="#3A8820"/>
    <rect x="61" y="158" width="18" height="10" fill="#3A8820"/>
    <rect x="79" y="162" width="18" height="10" fill="#3A8820"/>
    <rect x="280" y="138" width="18" height="76" fill="#3A8820"/>
    <rect x="271" y="150" width="18" height="10" fill="#3A8820"/>
    <rect x="289" y="155" width="18" height="10" fill="#3A8820"/>
    <rect x="560" y="145" width="18" height="68" fill="#3A8820"/>
    <rect x="551" y="158" width="18" height="10" fill="#3A8820"/>
    <rect x="569" y="163" width="18" height="10" fill="#3A8820"/>
    <rect x="720" y="150" width="16" height="62" fill="#3A8820"/>
    <rect x="711" y="162" width="16" height="10" fill="#3A8820"/>
    <rect x="727" y="168" width="16" height="10" fill="#3A8820"/>
  `);
}

function _desertNear() {
  return _svg(800, 300, `
    <rect width="800" height="300" fill="transparent"/>
    <rect x="0" y="248" width="800" height="52" fill="#B07018"/>
    <path d="M0 248 Q50 234 100 244 Q150 232 200 242 Q250 230 300 240 Q350 228 400 238 Q450 226 500 236 Q550 228 600 238 Q650 226 700 236 Q750 230 800 238 L800 248Z" fill="#C88020"/>
    <rect x="40" y="198" width="20" height="60" fill="#2A7A18"/>
    <rect x="28" y="210" width="22" height="14" fill="#2A7A18"/>
    <rect x="50" y="215" width="22" height="14" fill="#2A7A18"/>
    <rect x="28" y="202" width="12" height="18" fill="#2A7A18"/>
    <rect x="50" y="206" width="12" height="18" fill="#2A7A18"/>
    <rect x="200" y="192" width="20" height="66" fill="#2A7A18"/>
    <rect x="188" y="204" width="22" height="14" fill="#2A7A18"/>
    <rect x="210" y="210" width="22" height="14" fill="#2A7A18"/>
    <rect x="430" y="196" width="20" height="62" fill="#2A7A18"/>
    <rect x="418" y="208" width="22" height="14" fill="#2A7A18"/>
    <rect x="440" y="214" width="22" height="14" fill="#2A7A18"/>
    <rect x="650" y="194" width="20" height="64" fill="#2A7A18"/>
    <rect x="638" y="206" width="22" height="14" fill="#2A7A18"/>
    <rect x="660" y="212" width="22" height="14" fill="#2A7A18"/>
  `);
}

// ── Nether ───────────────────────────────────────────────────────────────────

function _netherFar() {
  return _svg(800, 300, `
    <defs>
      <linearGradient id="nsky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#180000"/>
        <stop offset="40%" stop-color="#500000"/>
        <stop offset="40%" stop-color="#8B1A00"/>
        <stop offset="100%" stop-color="#C03000"/>
      </linearGradient>
    </defs>
    <rect width="800" height="300" fill="url(#nsky)"/>
    <rect x="0" y="0" width="800" height="40" fill="#0A0000"/>
    <path d="M0 40 Q50 28 100 38 Q150 24 200 36 Q250 20 300 34 Q350 22 400 36 Q450 20 500 34 Q550 22 600 38 Q650 24 700 36 Q750 20 800 32 L800 40Z" fill="#1A0000"/>
    <ellipse cx="120" cy="200" rx="60" ry="15" fill="#FF4400" opacity=".3"/>
    <ellipse cx="120" cy="200" rx="30" ry="8" fill="#FF6600" opacity=".5"/>
    <ellipse cx="480" cy="210" rx="80" ry="18" fill="#FF4400" opacity=".28"/>
    <ellipse cx="480" cy="210" rx="40" ry="10" fill="#FF6600" opacity=".45"/>
    <ellipse cx="700" cy="195" rx="50" ry="12" fill="#FF4400" opacity=".32"/>
  `);
}

function _netherMid() {
  return _svg(800, 300, `
    <rect width="800" height="300" fill="transparent"/>
    <rect x="0" y="220" width="800" height="80" fill="#6A0A00"/>
    <path d="M0 220 Q30 200 60 215 Q90 195 120 212 Q150 192 180 210 Q210 192 240 208 Q270 190 300 206 Q330 188 360 205 Q390 185 420 204 Q450 185 480 202 Q510 188 540 205 Q570 188 600 204 Q630 188 660 202 Q690 186 720 200 Q750 186 780 198 L800 200 L800 220Z" fill="#8B1200"/>
    <rect x="50" y="150" width="30" height="90" fill="#4A0A00"/>
    <rect x="38" y="145" width="54" height="16" fill="#3A0800"/>
    <rect x="150" y="140" width="24" height="100" fill="#4A0A00"/>
    <rect x="140" y="136" width="44" height="14" fill="#3A0800"/>
    <rect x="310" y="145" width="28" height="95" fill="#4A0A00"/>
    <rect x="298" y="141" width="52" height="14" fill="#3A0800"/>
    <rect x="480" y="148" width="26" height="92" fill="#4A0A00"/>
    <rect x="468" y="144" rx="0" ry="0" width="50" height="14" fill="#3A0800"/>
    <rect x="650" y="142" width="28" height="98" fill="#4A0A00"/>
    <rect x="638" y="138" width="52" height="14" fill="#3A0800"/>
    <rect x="0" y="180" width="800" height="8" fill="#FF5500" opacity=".12"/>
  `);
}

function _netherNear() {
  return _svg(800, 300, `
    <rect width="800" height="300" fill="transparent"/>
    <rect x="0" y="252" width="800" height="48" fill="#500800"/>
    <path d="M0 252 Q20 238 40 250 Q60 234 80 246 Q100 232 120 244 Q140 232 160 246 Q180 232 200 244 Q220 232 240 246 Q260 230 280 244 Q300 230 320 244 Q340 230 360 244 Q380 232 400 246 Q420 232 440 244 Q460 232 480 244 Q500 232 520 244 Q540 232 560 246 Q580 232 600 244 Q620 232 640 244 Q660 234 680 248 Q700 234 720 246 Q740 232 760 244 Q780 232 800 244 L800 252Z" fill="#FF5500" opacity=".35"/>
    <rect x="20" y="180" width="18" height="82" fill="#3A0800"/>
    <rect x="14" y="172" width="30" height="14" fill="#300600"/>
    <rect x="100" y="170" width="20" height="92" fill="#3A0800"/>
    <rect x="94" y="162" width="32" height="14" fill="#300600"/>
    <rect x="260" y="175" width="18" height="87" fill="#3A0800"/>
    <rect x="254" y="168" width="30" height="12" fill="#300600"/>
    <rect x="440" y="172" width="20" height="90" fill="#3A0800"/>
    <rect x="434" y="165" width="32" height="12" fill="#300600"/>
    <rect x="620" y="176" width="18" height="86" fill="#3A0800"/>
    <rect x="614" y="169" width="30" height="12" fill="#300600"/>
    <rect x="760" y="170" width="20" height="92" fill="#3A0800"/>
    <rect x="754" y="163" width="32" height="14" fill="#300600"/>
    <rect x="0" y="248" width="800" height="6" fill="#FF6600" opacity=".6"/>
  `);
}

// ── End ──────────────────────────────────────────────────────────────────────

function _endFar() {
  // Void black with scattered end stars
  const stars = [];
  const rng = _seededRng(42);
  for (let i = 0; i < 80; i++) {
    const x = Math.floor(rng() * 800);
    const y = Math.floor(rng() * 160);
    const r = rng() > 0.8 ? 2.5 : 1.5;
    const opacity = (0.5 + rng() * 0.5).toFixed(2);
    stars.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="white" opacity="${opacity}"/>`);
  }
  // End crystals on horizon
  return _svg(800, 300, `
    <rect width="800" height="300" fill="#050010"/>
    <rect x="0" y="0" width="800" height="170" fill="url(#endvoid)"/>
    <defs>
      <radialGradient id="endvoid" cx="50%" cy="0%" r="80%">
        <stop offset="0%" stop-color="#0A0028"/>
        <stop offset="100%" stop-color="#020008"/>
      </radialGradient>
    </defs>
    ${stars.join('')}
    <path d="M0 170 L800 170 L800 300 L0 300 Z" fill="#1A1428"/>
    <path d="M0 170 Q100 155 200 165 Q300 150 400 162 Q500 148 600 160 Q700 150 800 158 L800 170Z" fill="#141020"/>
    <ellipse cx="400" cy="172" rx="200" ry="8" fill="#4400AA" opacity=".35"/>
    <ellipse cx="400" cy="172" rx="120" ry="5" fill="#6622CC" opacity=".45"/>
  `);
}

function _endMid() {
  return _svg(800, 300, `
    <rect width="800" height="300" fill="transparent"/>
    <rect x="0" y="200" width="800" height="100" fill="#1A1428"/>
    <rect x="50" y="120" width="30" height="110" fill="#1C1030"/>
    <rect x="42" y="108" width="46" height="22" fill="#220E40"/>
    <rect x="38" y="95" width="54" height="18" fill="#1A0A30"/>
    <rect x="46" y="80" width="38" height="18" fill="#160828"/>
    <rect x="220" y="100" width="28" height="130" fill="#1C1030"/>
    <rect x="212" y="88" width="44" height="20" fill="#220E40"/>
    <rect x="208" y="76" width="52" height="16" fill="#1A0A30"/>
    <rect x="214" y="62" width="36" height="16" fill="#160828"/>
    <rect x="440" y="110" width="32" height="120" fill="#1C1030"/>
    <rect x="432" y="98" width="48" height="22" fill="#220E40"/>
    <rect x="428" y="84" width="56" height="18" fill="#1A0A30"/>
    <rect x="434" y="68" width="44" height="18" fill="#160828"/>
    <rect x="620" y="105" width="28" height="125" fill="#1C1030"/>
    <rect x="612" y="93" width="44" height="20" fill="#220E40"/>
    <rect x="608" y="80" width="52" height="16" fill="#1A0A30"/>
    <rect x="614" y="66" width="36" height="16" fill="#160828"/>
    <circle cx="65" cy="76" r="12" fill="#8844FF" opacity=".7"/>
    <circle cx="65" cy="76" r="7" fill="#AACCFF" opacity=".9"/>
    <circle cx="236" cy="58" r="14" fill="#8844FF" opacity=".7"/>
    <circle cx="236" cy="58" r="8" fill="#AACCFF" opacity=".9"/>
    <circle cx="456" cy="64" r="12" fill="#8844FF" opacity=".7"/>
    <circle cx="456" cy="64" r="7" fill="#AACCFF" opacity=".9"/>
    <circle cx="634" cy="62" r="13" fill="#8844FF" opacity=".7"/>
    <circle cx="634" cy="62" r="7" fill="#AACCFF" opacity=".9"/>
  `);
}

function _endNear() {
  return _svg(800, 300, `
    <rect width="800" height="300" fill="transparent"/>
    <rect x="0" y="258" width="800" height="42" fill="#0E0C1E"/>
    <path d="M0 258 Q20 245 40 255 Q60 242 80 252 Q100 240 120 250 Q140 238 160 248 Q180 240 200 252 Q220 240 240 250 Q260 240 280 252 Q300 240 320 250 Q340 240 360 252 Q380 240 400 250 Q420 238 440 252 Q460 238 480 250 Q500 240 520 252 Q540 240 560 250 Q580 238 600 248 Q620 238 640 250 Q660 238 680 250 Q700 240 720 252 Q740 240 760 250 Q780 240 800 250 L800 258Z" fill="#1E1840"/>
    <rect x="30" y="195" width="8" height="65" fill="#2A1850"/>
    <path d="M34 195 L20 178 L28 178 L22 162 L34 170 L46 162 L40 178 L48 178 Z" fill="#2A1850"/>
    <rect x="150" y="185" width="8" height="75" fill="#2A1850"/>
    <path d="M154 185 L140 168 L148 168 L142 152 L154 160 L166 152 L160 168 L168 168 Z" fill="#2A1850"/>
    <rect x="300" y="190" width="8" height="70" fill="#2A1850"/>
    <path d="M304 190 L290 173 L298 173 L292 157 L304 165 L316 157 L310 173 L318 173 Z" fill="#2A1850"/>
    <rect x="480" y="192" width="8" height="68" fill="#2A1850"/>
    <path d="M484 192 L470 175 L478 175 L472 159 L484 167 L496 159 L490 175 L498 175 Z" fill="#2A1850"/>
    <rect x="650" y="188" width="8" height="72" fill="#2A1850"/>
    <path d="M654 188 L640 171 L648 171 L642 155 L654 163 L666 155 L660 171 L668 171 Z" fill="#2A1850"/>
  `);
}

// ── Ocean ─────────────────────────────────────────────────────────────────────

function _oceanFar() {
  return _svg(800, 300, `
    <defs>
      <linearGradient id="osky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0A3860"/>
        <stop offset="48%" stop-color="#1464A0"/>
        <stop offset="48%" stop-color="#0A5080"/>
        <stop offset="100%" stop-color="#063050"/>
      </linearGradient>
    </defs>
    <rect width="800" height="300" fill="url(#osky)"/>
    <ellipse cx="400" cy="0" rx="600" ry="30" fill="#0A7AB8" opacity=".4"/>
    <path d="M0 144 Q50 136 100 142 Q150 134 200 140 Q250 132 300 138 Q350 130 400 136 Q450 130 500 136 Q550 128 600 136 Q650 128 700 134 Q750 128 800 134 L800 148 Q750 142 700 146 Q650 140 600 146 Q550 140 500 146 Q450 140 400 146 Q350 140 300 146 Q250 140 200 146 Q150 140 100 146 Q50 140 0 148Z" fill="#0E86CC" opacity=".5"/>
    <path d="M0 152 Q50 144 100 150 Q150 142 200 148 Q250 140 300 146 Q350 138 400 144 Q450 138 500 144 Q550 136 600 144 Q650 136 700 142 Q750 136 800 142 L800 152Z" fill="#1496DC" opacity=".3"/>
    <circle cx="650" cy="55" r="34" fill="#FFE850" opacity=".7"/>
  `);
}

function _oceanMid() {
  return _svg(800, 300, `
    <rect width="800" height="300" fill="transparent"/>
    <rect x="0" y="155" width="800" height="145" fill="#0A4A78"/>
    <path d="M0 155 Q40 142 80 152 Q120 140 160 150 Q200 138 240 148 Q280 136 320 148 Q360 138 400 148 Q440 138 480 148 Q520 138 560 148 Q600 136 640 148 Q680 136 720 146 Q760 136 800 144 L800 155Z" fill="#1260A0"/>
    <rect x="60" y="180" width="12" height="90" fill="#0A6828"/>
    <path d="M66 180 Q50 160 60 145 Q66 140 72 145 Q82 160 66 180" fill="#0A7030"/>
    <rect x="160" y="185" width="10" height="85" fill="#0A6828"/>
    <path d="M165 185 Q150 165 158 150 Q165 145 172 150 Q180 165 165 185" fill="#0A7030"/>
    <rect x="320" y="178" width="12" height="92" fill="#0A6828"/>
    <path d="M326 178 Q310 158 320 143 Q326 138 332 143 Q342 158 326 178" fill="#0A7030"/>
    <rect x="510" y="182" width="10" height="88" fill="#0A6828"/>
    <path d="M515 182 Q500 162 508 147 Q515 142 522 147 Q530 162 515 182" fill="#0A7030"/>
    <rect x="680" y="176" width="12" height="94" fill="#0A6828"/>
    <path d="M686 176 Q670 156 680 141 Q686 136 692 141 Q702 156 686 176" fill="#0A7030"/>
    <ellipse cx="130" cy="230" rx="30" ry="14" fill="#CC4422" opacity=".7"/>
    <ellipse cx="400" cy="240" rx="25" ry="12" fill="#CC4422" opacity=".65"/>
    <ellipse cx="600" cy="235" rx="28" ry="13" fill="#8B3A8B" opacity=".7"/>
    <path d="M200 200 Q210 195 220 200 Q215 188 225 190 Q222 200 230 198" fill="none" stroke="#FFFFFF" stroke-width="1.5" opacity=".4"/>
    <path d="M450 210 Q460 205 470 210 Q465 198 475 200 Q472 210 480 208" fill="none" stroke="#FFFFFF" stroke-width="1.5" opacity=".4"/>
  `);
}

function _oceanNear() {
  return _svg(800, 300, `
    <rect width="800" height="300" fill="transparent"/>
    <rect x="0" y="255" width="800" height="45" fill="#063050"/>
    <path d="M0 255 Q20 242 40 252 Q60 238 80 250 Q100 236 120 248 Q140 234 160 246 Q180 234 200 246 Q220 232 240 244 Q260 232 280 244 Q300 232 320 244 Q340 234 360 246 Q380 232 400 244 Q420 232 440 244 Q460 234 480 246 Q500 232 520 244 Q540 232 560 244 Q580 232 600 244 Q620 232 640 244 Q660 234 680 246 Q700 232 720 244 Q740 232 760 244 Q780 234 800 246 L800 255Z" fill="#0A4A78"/>
    <ellipse cx="50" cy="244" rx="20" ry="8" fill="#DD5533" opacity=".65"/>
    <ellipse cx="240" cy="248" rx="18" ry="7" fill="#9944AA" opacity=".6"/>
    <ellipse cx="420" cy="246" rx="22" ry="9" fill="#DD5533" opacity=".6"/>
    <ellipse cx="600" cy="244" rx="20" ry="8" fill="#9944AA" opacity=".65"/>
    <ellipse cx="760" cy="248" rx="18" ry="7" fill="#DD5533" opacity=".6"/>
    <path d="M120 238 Q130 230 138 238 Q144 226 152 232 Q144 238 155 236" fill="none" stroke="#FFFFFF" stroke-width="2" opacity=".5"/>
    <path d="M330 240 Q340 232 348 240 Q354 228 362 234 Q354 240 365 238" fill="none" stroke="#FFFFFF" stroke-width="2" opacity=".5"/>
    <path d="M510 236 Q520 228 528 236 Q534 224 542 230 Q534 236 545 234" fill="none" stroke="#FFFFFF" stroke-width="2" opacity=".5"/>
    <path d="M680 240 Q690 232 698 240 Q704 228 712 234 Q704 240 715 238" fill="none" stroke="#FFFFFF" stroke-width="2" opacity=".5"/>
  `);
}

// ── Simple seeded RNG for deterministic star placement ────────────────────────

function _seededRng(seed) {
  let s = seed;
  return function() {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// ── Biome configuration ───────────────────────────────────────────────────────

const _BIOME_DEFS = {
  plains: {
    label: 'Plains', icon: '🌿',
    fog: [135, 206, 235],
    noDayNight: false,
  },
  forest: {
    label: 'Forest', icon: '🌲',
    fog: [30, 80, 30],
    noDayNight: false,
  },
  desert: {
    label: 'Desert', icon: '🏜',
    fog: [232, 200, 80],
    noDayNight: false,
  },
  nether: {
    label: 'Nether', icon: '🔥',
    fog: [120, 20, 0],
    noDayNight: true,
  },
  end: {
    label: 'End', icon: '🌌',
    fog: [5, 0, 20],
    noDayNight: true,
  },
  ocean: {
    label: 'Ocean', icon: '🌊',
    fog: [10, 80, 140],
    noDayNight: false,
  },
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialise the parallax background system.
 * Must be called after the DOM is ready and after the Three.js renderer exists.
 */
function initParallaxBg() {
  _container    = document.getElementById('parallax-bg');
  _layerFar     = document.getElementById('parallax-far');
  _layerMid     = document.getElementById('parallax-mid');
  _layerNear    = document.getElementById('parallax-near');
  _nightOverlay = document.getElementById('parallax-night-overlay');

  if (!_container) return;

  _loadParallaxSettings();
  _pickActiveBiome();
  _applyBiomeLayers(_activeBiome);
  _initialized = true;
}

/** Called from game-loop.js at 30fps. delta is seconds since last call. */
function updateParallaxBg(delta) {
  if (!_initialized || !_parallaxEnabled) return;

  // Update biome based on active expedition biome or dungeon
  _syncBiomeFromGameMode();

  // Advance scroll offset
  const speed = (typeof difficultyMultiplier !== 'undefined' ? difficultyMultiplier : 1.0);
  _offset += delta * PARALLAX_BASE_SPEED * speed;

  // Update layer positions via CSS background-position
  const farX  = -(_offset * 0.2);
  const midX  = -(_offset * 0.5);
  const nearX = -(_offset * 1.0);

  if (_layerFar)  _layerFar.style.backgroundPositionX  = farX  + 'px';
  if (_layerMid)  _layerMid.style.backgroundPositionX  = midX  + 'px';
  if (_layerNear) _layerNear.style.backgroundPositionX = nearX + 'px';

  // Day/night cycle
  const def = _BIOME_DEFS[_activeBiome];
  if (def && !def.noDayNight) {
    _dayTimer = (_dayTimer + delta) % PARALLAX_DAY_CYCLE;
    _dayPhase = _dayTimer / PARALLAX_DAY_CYCLE;
    // 0 = midnight, 0.25 = dawn, 0.5 = noon, 0.75 = dusk, 1 = midnight
    const nightness = _calcNightness(_dayPhase);
    if (_nightOverlay) {
      _nightOverlay.style.opacity = nightness.toFixed(3);
    }
    // Sync scene fog to biome sky color modulated by night
    _syncFog(def, nightness);
  } else {
    if (_nightOverlay) _nightOverlay.style.opacity = '0';
    if (def) _syncFog(def, 0);
  }
}

/** Called from settings UI when the player picks a biome. */
function setParallaxBiomePref(biomeId) {
  _selectedBiome = biomeId;
  try { localStorage.setItem(PARALLAX_BIOME_KEY, biomeId); } catch (_) {}
  if (biomeId !== 'random') {
    _activeBiome = biomeId;
    _applyBiomeLayers(biomeId);
  }
  _updateSettingsUI();
}

/** Enable or disable the parallax background. */
function setParallaxEnabled(enabled) {
  _parallaxEnabled = enabled;
  try { localStorage.setItem(PARALLAX_ENABLED_KEY, String(enabled)); } catch (_) {}
  if (_container) _container.style.display = enabled ? 'block' : 'none';
  // Toggle sky mesh visibility
  if (typeof skyMesh !== 'undefined' && skyMesh) {
    skyMesh.visible = !enabled;
  }
  if (typeof scene !== 'undefined' && scene) {
    scene.background = enabled ? null : (scene.background || null);
  }
  _updateSettingsUI();
}

/** Returns the currently active biome ID (used by sky.js override). */
function getParallaxActive() {
  return _parallaxEnabled && _initialized;
}

/**
 * Should be called when a new game session starts (Classic mode biome randomise).
 */
function onParallaxGameStart() {
  if (_selectedBiome === 'random') {
    _randomBiome = _RANDOM_POOL[Math.floor(Math.random() * _RANDOM_POOL.length)];
    _activeBiome = _randomBiome;
    _applyBiomeLayers(_activeBiome);
  }
  _offset = 0;
  _dayTimer = PARALLAX_DAY_CYCLE * 0.5; // reset to noon
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _loadParallaxSettings() {
  try {
    const biome = localStorage.getItem(PARALLAX_BIOME_KEY);
    if (biome && (_BIOME_DEFS[biome] || biome === 'random' || biome === 'off')) {
      _selectedBiome = biome;
    }
    const enabled = localStorage.getItem(PARALLAX_ENABLED_KEY);
    if (enabled === 'false') _parallaxEnabled = false;
  } catch (_) {}

  if (_container) _container.style.display = _parallaxEnabled ? 'block' : 'none';

  // Toggle sky mesh if already available
  if (typeof skyMesh !== 'undefined' && skyMesh) {
    skyMesh.visible = !_parallaxEnabled;
  }
  if (typeof scene !== 'undefined' && scene && _parallaxEnabled) {
    scene.background = null;
  }
}

function _pickActiveBiome() {
  if (_selectedBiome === 'random' || _selectedBiome === 'off') {
    _randomBiome = _RANDOM_POOL[Math.floor(Math.random() * _RANDOM_POOL.length)];
    _activeBiome = _randomBiome;
  } else {
    _activeBiome = _selectedBiome;
  }
}

function _syncBiomeFromGameMode() {
  // Expedition/dungeon biome overrides player preference
  if (typeof activeBiomeId !== 'undefined' && activeBiomeId) {
    const mapped = _BIOME_MAP[activeBiomeId];
    if (mapped && mapped !== _activeBiome) {
      _activeBiome = mapped;
      _applyBiomeLayers(_activeBiome);
    }
    return;
  }
  if (typeof activeDungeonId !== 'undefined' && activeDungeonId) {
    const mapped = _DUNGEON_MAP[activeDungeonId];
    if (mapped && mapped !== _activeBiome) {
      _activeBiome = mapped;
      _applyBiomeLayers(_activeBiome);
    }
    return;
  }
  // Use player preference (already set)
}

function _applyBiomeLayers(biomeId) {
  if (!_layerFar) return;
  const layers = _buildBiomeLayers(biomeId);
  _layerFar.style.backgroundImage  = layers.far;
  _layerMid.style.backgroundImage  = layers.mid;
  _layerNear.style.backgroundImage = layers.near;
}

function _buildBiomeLayers(biomeId) {
  switch (biomeId) {
    case 'forest':  return { far: _forestFar(),  mid: _forestMid(),  near: _forestNear()  };
    case 'desert':  return { far: _desertFar(),  mid: _desertMid(),  near: _desertNear()  };
    case 'nether':  return { far: _netherFar(),  mid: _netherMid(),  near: _netherNear()  };
    case 'end':     return { far: _endFar(),     mid: _endMid(),     near: _endNear()     };
    case 'ocean':   return { far: _oceanFar(),   mid: _oceanMid(),   near: _oceanNear()   };
    default:        return { far: _plainsFar(),  mid: _plainsMid(),  near: _plainsNear()  };
  }
}

/**
 * Calculate night darkness (0 = full day, 1 = full night).
 * Phase: 0=midnight, 0.25=dawn, 0.5=noon, 0.75=dusk, 1=midnight
 */
function _calcNightness(phase) {
  // Noon is bright (0), midnight is dark (1), smooth sinusoidal
  return 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
}

function _syncFog(def, nightness) {
  if (typeof scene === 'undefined' || !scene || !scene.fog) return;
  const r = def.fog[0] / 255 * (1 - nightness * 0.85);
  const g = def.fog[1] / 255 * (1 - nightness * 0.85);
  const b = def.fog[2] / 255 * (1 - nightness * 0.85) + nightness * 0.03;
  scene.fog.color.setRGB(r, g, b);
}

function _updateSettingsUI() {
  // Update biome selector buttons
  document.querySelectorAll('.parallax-biome-btn').forEach(function(btn) {
    const bId = btn.dataset.biome;
    btn.classList.toggle('parallax-biome-btn-selected', bId === _selectedBiome);
  });
  // Update enabled toggle
  const toggle = document.getElementById('parallax-bg-toggle');
  if (toggle) toggle.checked = _parallaxEnabled;
}
