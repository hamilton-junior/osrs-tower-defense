/**
 * The sprite-bake pipeline runs over more than one **group** of NPCs. Enemies were
 * the first; the Distractions & Diversions cast is the second, and it wants a
 * different shape — no hurt/death, but three camera yaws, because a diversion turns
 * to face the way it is walking.
 *
 * The three scripts (export-enemy-gltf → bake-enemy-sprites-from-gltf →
 * generate-enemy-anims-data) all take `--group <name>`, defaulting to `enemies` so
 * every existing command keeps working unchanged.
 */

/**
 * `views` is what makes a group multi-camera: one bake per named yaw, all sharing a
 * single fit so the model does not change size when it turns. A group without it
 * bakes one view per clip, as the enemies always have.
 *
 * The diversion yaws match the static portraits in scripts/render-osrs-npcs.mjs
 * (front is the default ¾ view at yaw 30; side is yaw 90, which walks RIGHT — the
 * renderer mirrors it to walk left; back is the back) so a
 * clip and its fallback portrait sit at the same angle.
 */
export const GROUPS = {
  enemies: {
    label: 'enemies',
    config: 'enemy-anims.config.json',
    gltfDir: ['public', 'assets', 'enemies-gltf'],
    spriteDir: ['public', 'assets', 'enemies'],
    dataFile: ['lib', 'game', 'data', 'enemy-anims.data.ts'],
    table: 'ENEMY_ANIMS',
    typeName: 'EnemyAnimSet',
    typeModule: './enemy-anims',
    urlBase: '/assets/enemies',
    clipOrder: ['walk', 'hurt', 'death', 'burrow', 'emerge', 'rage', 'charge', 'breath'],
    views: null,
  },
  diversions: {
    label: 'diversions',
    config: 'diversion-anims.config.json',
    gltfDir: ['public', 'assets', 'diversions-gltf'],
    spriteDir: ['public', 'assets', 'diversions'],
    dataFile: ['lib', 'game', 'data', 'diversion-anims.data.ts'],
    table: 'DIVERSION_ANIMS',
    typeName: 'DiversionAnimSet',
    typeModule: './diversion-anims',
    urlBase: '/assets/diversions',
    clipOrder: ['stand', 'walk'],
    defaults: { yaw: 30, pitch: 12, loop: { stand: true, walk: true } },
    views: { front: 30, side: 90, back: 180 },
  },
};

/** `--group <name>` off the command line, defaulting to the enemies. */
export function pickGroup(argv) {
  const i = argv.indexOf('--group');
  const name = i !== -1 ? argv[i + 1] : 'enemies';
  const g = GROUPS[name];
  if (!g) throw new Error(`Unknown group "${name}". Known: ${Object.keys(GROUPS).join(', ')}`);
  return { name, ...g };
}
