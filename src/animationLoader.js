/**
 * animationLoader.js – Fuzzy-match loader for Colour1/Colour2 PNG strip sheets.
 *
 * Given a folder path and the exact list of filenames (from the fighter manifest),
 * it loads every PNG as a SpriteSheetAnimator (120×80, single-row strip where
 * frameCount = image.width / 120), then maps each file to a canonical game-state
 * name by keyword matching — so filename differences between Colour1 and Colour2
 * (_AttackCombo2hit vs _AttackCombo, _CrouchFull vs _CrouchAll, etc.) are handled
 * automatically without hardcoding a shared list.
 */
import { SpriteSheetAnimator } from './spritesheet.js';

const FRAME_W = 120;
const FRAME_H = 80;
const DEFAULT_FPS = 12;

/** Normalise a filename to a lower-case keyword string for matching. */
function normalise(filename) {
  return filename
    .replace(/^_/, '')
    .replace(/\.png$/i, '')
    .replace(/[_\-\s]/g, '')
    .toLowerCase();
}

/**
 * Map a normalised filename to a canonical animation state key.
 * Ordered most-specific first to avoid false matches.
 * Returns null if the file should be skipped (e.g. preview GIFs).
 */
function matchState(filename) {
  const n = normalise(filename);

  // --- Attack variants (order: most specific first) ---
  if (n.includes('attackcombo'))           return 'combo_attack';
  if (n.includes('attack2nomov') ||
      n.includes('attack2nomovement'))     return 'heavy_attack_hold';
  if (n.includes('attack2'))               return 'heavy_attack';
  if (n.includes('crouchattack'))          return 'crouch_attack';
  if (n.includes('attacknomov') ||
      n.includes('attacknomovement'))      return 'light_attack_hold';
  if (n.includes('attack'))               return 'light_attack';

  // --- Crouch variants ---
  if (n.includes('crouchwalk') ||
      n.includes('crouchrun'))             return 'crouch_walk';
  if (n.includes('crouchtransition'))      return 'crouch_transition';
  // "crouchfull" (C1) or "crouchall" (C2) → full crouch animation
  if (n.includes('crouchfull') ||
      n.includes('crouchall'))             return 'crouch_full';
  if (n.includes('crouchidle') ||
      n.includes('crouch'))               return 'crouch';

  // --- Block ---
  if (n.includes('shieldblockmid') ||
      n.includes('blockmid'))             return 'block_hold';
  if (n.includes('shieldblockstart') ||
      n.includes('blockstart'))           return 'block_start';

  // --- Movement ---
  if (n.includes('runbackwards') ||
      n.includes('runback'))              return 'run_back';
  if (n.includes('run'))                  return 'run';
  if (n.includes('strafeleft'))           return 'strafe_left';
  if (n.includes('straferight'))          return 'strafe_right';
  if (n.includes('walk'))                 return 'walk';
  if (n.includes('dash'))                 return 'dash';

  // --- Aerial ---
  if (n.includes('jumpfall') ||
      n.includes('jumpfallinbetween'))    return 'jump_fall';
  if (n.includes('jump'))                 return 'jump';
  if (n.includes('fall'))                 return 'fall';
  if (n.includes('frontflip'))            return 'roll';
  if (n.includes('roll'))                 return 'roll';

  // --- Slide ---
  if (n.includes('slidetransitionstart')) return 'slide_start';
  if (n.includes('slidetransitionend'))   return 'slide_end';
  if (n.includes('slidefull') ||
      n.includes('slideall'))             return 'slide_full';
  if (n.includes('slidestart'))           return 'slide_start';
  if (n.includes('slideend'))             return 'slide_end';
  if (n.includes('slide'))               return 'slide';

  // --- Wall ---
  if (n.includes('wallclimnomov') ||
      n.includes('wallclimbnomovement'))  return 'wall_climb_hold';
  if (n.includes('wallclimb'))            return 'wall_climb';
  if (n.includes('wallslide'))            return 'wall_slide';
  if (n.includes('wallhang'))             return 'wall_hang';

  // --- Misc ---
  if (n.includes('turnaround') ||
      n.includes('180turn'))              return 'turnaround';
  if (n.includes('deathnomov') ||
      n.includes('deathnomovement'))      return 'death_hold';
  if (n.includes('death') ||
      n.includes('die'))                  return 'death';
  if (n.includes('takedamage') ||
      n.includes('hit'))                  return 'hurt';
  if (n.includes('unsheathsword'))        return 'intro';
  if (n.includes('castspell'))            return 'cast_spell';
  if (n.includes('special'))              return 'special';
  if (n.includes('meleespin') ||
      n.includes('pummel'))               return 'combo_attack';
  if (n.includes('meleerun'))             return 'light_attack';
  if (n.includes('melee'))               return 'light_attack';
  if (n.includes('kick'))                 return 'heavy_attack';
  if (n.includes('idle2') ||
      n.includes('idle'))                 return 'idle';

  return null; // unrecognised
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img   = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => {
      console.warn(`[AnimLoader] Failed to load: ${src}`);
      resolve(null);
    };
    img.src = src;
  });
}

/** Non-looping states (play once then freeze on last frame). */
const ONE_SHOT_STATES = new Set([
  'light_attack', 'heavy_attack', 'combo_attack', 'crouch_attack',
  'hurt', 'death', 'death_hold', 'slide_start', 'slide_end',
  'roll', 'dash', 'turnaround', 'intro', 'crouch_transition',
]);

/**
 * Load all PNG strips for one fighter folder.
 *
 * @param {string}   basePath  Path relative to index.html (e.g. "Character Colour1/Outline/120x80_PNGSheets")
 * @param {string[]} files     Exact filenames present in that folder
 * @param {number}   [fps=12]  Default playback fps
 * @returns {Promise<Record<string, SpriteSheetAnimator>>}
 */
export async function loadFighterAnimations(basePath, files, fps = DEFAULT_FPS) {
  const primary   = {}; // state → best animator (non-NoMovement preferred)
  const secondary = {}; // state → NoMovement fallback

  await Promise.all(files.map(async (filename) => {
    const state = matchState(filename);
    if (!state) {
      console.warn(`[AnimLoader] No match for: ${filename}`);
      return;
    }

    const url   = `${basePath}/${filename}`;
    const image = await loadImage(url);
    if (!image) return;

    const cols = Math.max(1, Math.round(image.width / FRAME_W));
    const anim = new SpriteSheetAnimator({
      image, frameW: FRAME_W, frameH: FRAME_H,
      cols, rows: 1,
      fps,
      loop: !ONE_SHOT_STATES.has(state),
      detectFrames: false,
    });

    console.log(`[AnimLoader] ${filename.padEnd(38)} → ${state.padEnd(20)} (${cols} frames)`);

    const isNoMovement = normalise(filename).includes('nomov') ||
                         normalise(filename).includes('nomovement');

    if (isNoMovement) {
      if (!secondary[state]) secondary[state] = anim;
    } else {
      if (!primary[state]) primary[state] = anim;
    }
  }));

  // Merge: primary wins; fill missing with secondary
  const result = { ...secondary, ...primary };

  // Fallback chain for states that might be missing
  const fallbacks = {
    run_back:         ['run'],
    walk:             ['run'],
    strafe_left:      ['walk', 'run'],
    strafe_right:     ['walk', 'run'],
    jump_fall:        ['fall', 'jump'],
    fall:             ['jump_fall', 'jump'],
    block_start:      ['block_hold', 'crouch'],
    block_hold:       ['crouch'],
    crouch_walk:      ['crouch', 'run'],
    crouch_full:      ['crouch'],
    crouch_transition:['crouch'],
    combo_attack:     ['heavy_attack', 'light_attack'],
    heavy_attack:     ['light_attack'],
    light_attack_hold:['light_attack'],
    heavy_attack_hold:['heavy_attack'],
    death_hold:       ['death'],
    slide_start:      ['slide', 'dash'],
    slide_end:        ['slide', 'idle'],
    slide_full:       ['slide', 'dash'],
    slide:            ['dash', 'roll'],
    roll:             ['dash', 'slide'],
    dash:             ['run'],
    turnaround:       ['idle'],
    wall_climb:       ['jump'],
    wall_climb_hold:  ['wall_climb', 'jump'],
    wall_slide:       ['fall'],
    wall_hang:        ['crouch'],
    cast_spell:       ['idle'],
    special:          ['combo_attack', 'heavy_attack'],
    intro:            ['idle'],
  };

  for (const [state, chain] of Object.entries(fallbacks)) {
    if (!result[state]) {
      for (const fb of chain) {
        if (result[fb]) { result[state] = result[fb]; break; }
      }
    }
  }

  console.log(`[AnimLoader] Done. States loaded:`, Object.keys(result).sort().join(', '));
  return result;
}
