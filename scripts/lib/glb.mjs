/**
 * Pack a JSON glTF into the binary GLB container.
 *
 * `osrscachereader`'s GLTFExporter writes every accessor's bytes as its own
 * `data:` URI — one per morph target per frame, hundreds of them for an animated
 * NPC. Base64 costs a third more than the bytes it carries, and the JSON around it
 * is not free either: the enemy set weighs 59.5 MB as `.gltf` against 43.5 MB of
 * actual binary. GLB carries that binary as one chunk instead, so the same models
 * ship ~27% smaller with nothing re-exported and nothing lost — every accessor,
 * bufferView and animation channel is preserved exactly, only re-addressed.
 *
 * Images keep whatever URI they had: there is at most one per model here, and a
 * `data:` image is legal inside a GLB.
 */

const MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

/** Round up to the 4-byte boundary the GLB spec requires of every chunk. */
const pad4 = (n) => (n + 3) & ~3;

/**
 * @param {string|object} gltf a glTF 2.0 document (JSON text or parsed)
 * @returns {Buffer} the equivalent .glb
 */
export function gltfToGlb(gltf) {
  const doc = typeof gltf === 'string' ? JSON.parse(gltf) : structuredClone(gltf);
  const buffers = doc.buffers ?? [];

  // Decode every buffer once, then lay them out end to end. Each buffer starts on
  // a 4-byte boundary because bufferView.byteOffset inherits that alignment and
  // an accessor of floats read from an odd offset is undefined behaviour.
  const parts = [];
  const offsets = [];
  let total = 0;
  for (const b of buffers) {
    if (!b.uri) throw new Error('buffer has no uri — already GLB?');
    const comma = b.uri.indexOf(',');
    if (!b.uri.startsWith('data:') || comma === -1) {
      throw new Error(`buffer uri is not a data: URI (${b.uri.slice(0, 40)})`);
    }
    const data = Buffer.from(b.uri.slice(comma + 1), 'base64');
    offsets.push(total);
    parts.push(data);
    total = pad4(total + data.length);
  }
  const bin = Buffer.alloc(total);
  parts.forEach((p, i) => p.copy(bin, offsets[i]));

  // Every bufferView now points into the single chunk, shifted by where its old
  // buffer landed.
  for (const v of doc.bufferViews ?? []) {
    v.byteOffset = offsets[v.buffer ?? 0] + (v.byteOffset ?? 0);
    v.buffer = 0;
  }
  doc.buffers = total ? [{ byteLength: total }] : [];

  // JSON pads with spaces (it must stay parseable), BIN with zeros.
  const jsonRaw = Buffer.from(JSON.stringify(doc), 'utf8');
  const json = Buffer.alloc(pad4(jsonRaw.length), 0x20);
  jsonRaw.copy(json);

  const out = Buffer.alloc(12 + 8 + json.length + (total ? 8 + bin.length : 0));
  let o = 0;
  o = out.writeUInt32LE(MAGIC, o);
  o = out.writeUInt32LE(2, o);
  o = out.writeUInt32LE(out.length, o);
  o = out.writeUInt32LE(json.length, o);
  o = out.writeUInt32LE(CHUNK_JSON, o);
  o += json.copy(out, o);
  if (total) {
    o = out.writeUInt32LE(bin.length, o);
    o = out.writeUInt32LE(CHUNK_BIN, o);
    bin.copy(out, o);
  }
  return out;
}
