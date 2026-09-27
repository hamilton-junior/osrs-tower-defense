/**
 * Merge an NPC's model parts into one mesh the way the client does.
 *
 * The client's `ModelData(ModelData[], int)` copies the parts in order, face by face,
 * and places each face corner through a helper that looks for a vertex already copied
 * at exactly the same x, y, z: if there is one the corner reuses it, bone and all, and
 * only otherwise is the vertex copied with its own bone. So coincident vertices ARE
 * welded, and the first one copied wins — where a shin meets a thigh, the knee follows
 * whichever part the NPC lists first, and the seam never opens.
 *
 * osrscachereader's own merge (`new ModelGroup(parts).getMergedModel()`) gets four
 * things wrong for a model that is going to be animated:
 *
 * 1. Its weld (`removeCommonVerticies`) joins vertices up to one unit apart, not just
 *    identical ones, and walks every pair both ways, so the LAST vertex of a
 *    coincident pair survives instead of the first. A welded corner then bends with
 *    the other part's bone: the ice troll's knee stretched with each step.
 * 2. `mergeWith` concatenates each part's per-face arrays as they stand, and a part
 *    with no translucent faces carries an empty `faceAlphas`. Every alpha after it
 *    then lands on the wrong face — the last part's lands on the first part's: Ket-Zek's
 *    glow turned his own body see-through, and the ice troll's translucent club did the
 *    same to his leg. `faceRenderPriorities` has the same hole wherever a part gives one
 *    `priority` for the whole model instead of one per face. The client fills both per
 *    face, with 0 alpha and the part's own priority where a part has none.
 * 3. It sizes its `animayaGroups`/`animayaScales` fallback with the ALREADY-INCREMENTED
 *    `vertexCount`, then concatenates the real per-vertex data on top — leaving the
 *    arrays longer than the mesh and every vertex skinned to the wrong bone (Scurrius'
 *    geometry exploded). The excess is exactly the placeholder block and it sits at the
 *    FRONT (`[...this, ...other]` into a blank model), so the tail is kept — asserted
 *    rather than assumed, since the dependency is a caret range and a reversed concat
 *    upstream would mis-skin silently instead of throwing.
 *
 * So the parts are concatenated with `mergeWith` (which offsets the faces and the bone
 * groups correctly), the per-face and animaya arrays are put right, and the client's
 * weld is then replayed on the result.
 *
 * `rev229` decides whether maya keyframes are read from index 22 (KEYFRAMES) or index 0
 * (FRAMES). The loader stamps it on each model it reads, but a fresh model never gets
 * it, so it is carried over from the parts: forcing it would send a pre-rev-229 cache's
 * keyframes to index 22 and crash a bake that should have worked.
 *
 * A lone part is returned as it is — the client only merges, and so only welds, an
 * NPC made of several.
 *
 * @template {{ vertexCount: number, faceCount: number, mergeWith(o: any): any }} M
 * @param {new () => M} Model  osrscachereader's `ModelDefinition`
 * @param {M[]} parts
 * @returns {M}
 */
export function mergeParts(Model, parts) {
  if (parts.length === 1) return parts[0];
  // Read before merging: mergeWith pads a part's missing arrays in place.
  const faceAlphas = perFace(parts, 'faceAlphas', () => 0);
  const faceRenderPriorities = perFace(parts, 'faceRenderPriorities', (p) => p.priority ?? 0);

  const model = new Model();
  for (const p of parts) model.mergeWith(p);
  model.faceAlphas = faceAlphas;
  model.faceRenderPriorities = faceRenderPriorities;
  model.rev229 = parts.some((p) => p.rev229);

  const first = parts[0].vertexCount;
  for (const k of ['animayaGroups', 'animayaScales']) {
    const excess = (model[k]?.length ?? 0) - model.vertexCount;
    if (excess <= 0) continue;
    if (excess !== first) {
      throw new Error(
        `${k}: expected ${first} placeholder entries at the front, found ${excess}. ` +
        `osrscachereader's mergeWith() has changed shape — re-check which end holds the real data.`,
      );
    }
    model[k] = model[k].slice(excess);
  }
  weldLikeTheClient(model);
  return model;
}

/**
 * The client's corner-by-corner copy, replayed on a concatenated model: each corner,
 * in face order, takes the first vertex seen at its exact position. A vertex no face
 * uses is never copied, as in the client.
 */
function weldLikeTheClient(m) {
  const X = m.vertexPositionsX, Y = m.vertexPositionsY, Z = m.vertexPositionsZ;
  const at = new Map();
  const remap = new Int32Array(m.vertexCount).fill(-1);
  const kept = [];
  const corners = [m.faceVertexIndices1, m.faceVertexIndices2, m.faceVertexIndices3];
  for (let f = 0; f < m.faceCount; f++) {
    for (const c of corners) {
      const v = c[f];
      if (remap[v] < 0) {
        const key = `${X[v]},${Y[v]},${Z[v]}`;
        let n = at.get(key);
        if (n === undefined) { n = kept.length; kept.push(v); at.set(key, n); }
        remap[v] = n;
      }
      c[f] = remap[v];
    }
  }

  const bone = [];
  m.vertexGroups.forEach((vs, label) => vs?.forEach((v) => { bone[v] = label; }));
  m.vertexGroups = Array.from({ length: m.vertexGroups.length }, () => []);
  kept.forEach((v, n) => { if (bone[v] !== undefined) m.vertexGroups[bone[v]].push(n); });

  const pick = (arr) => kept.map((v) => arr[v]);
  m.vertexPositionsX = pick(X);
  m.vertexPositionsY = pick(Y);
  m.vertexPositionsZ = pick(Z);
  for (const k of ['animayaGroups', 'animayaScales', 'vertexSkins', 'vertexNormals']) {
    if (m[k]?.length === m.vertexCount) m[k] = pick(m[k]);
  }
  m.vertexCount = kept.length;
}

/** One entry per face of every part, in order; `fill` stands in where a part has none. */
function perFace(parts, key, fill) {
  const out = [];
  for (const p of parts) {
    const own = p[key];
    for (let f = 0; f < p.faceCount; f++) out.push(own?.[f] ?? fill(p));
  }
  return out;
}
