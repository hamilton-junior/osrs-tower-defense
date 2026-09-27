/**
 * The OSRS client's Vorbis decoder, for the music samples in cache index 14.
 *
 * Jagex stores instrument samples as bare Vorbis audio packets: no Ogg pages, no
 * identification or comment header, and one setup header shared by every sample
 * (group 0, file 0 of the index). No off-the-shelf decoder takes that, so this is
 * a port of the client's own decoder (`VorbisSample` and its codebook, floor-1,
 * residue and mapping classes). Mono only — every music sample is.
 *
 * The output is what the client's synth plays: signed 8-bit PCM, plus the loop
 * points the sample file carries.
 */

export interface RawSound {
  sampleRate: number;
  /** Signed 8-bit PCM. */
  samples: Int8Array;
  /** Loop start and end, in samples. */
  start: number;
  end: number;
  /** Ping-pong loop: play forward to `end`, then backward to `start`. */
  pingPong: boolean;
}

/** LSB-first bit reader over one packet (or the setup header). */
class Bits {
  data: Uint8Array = new Uint8Array(0);
  pos = 0;
  bit = 0;

  reset(data: Uint8Array) {
    this.data = data;
    this.pos = 0;
    this.bit = 0;
  }

  one() {
    const v = (this.data[this.pos] >> this.bit) & 1;
    this.bit++;
    this.pos += this.bit >> 3;
    this.bit &= 7;
    return v;
  }

  read(n: number) {
    let v = 0;
    let shift = 0;
    while (n >= 8 - this.bit) {
      const take = 8 - this.bit;
      v += ((this.data[this.pos] >> this.bit) & ((1 << take) - 1)) * 2 ** shift;
      this.bit = 0;
      this.pos++;
      shift += take;
      n -= take;
    }
    if (n > 0) {
      v += ((this.data[this.pos] >> this.bit) & ((1 << n) - 1)) * 2 ** shift;
      this.bit += n;
    }
    return v;
  }
}

/** Bits needed to hold `v` (Vorbis `ilog`). */
function ilog(v: number) {
  let bits = 0;
  if (v < 0 || v >= 65536) { v >>>= 16; bits += 16; }
  if (v >= 256) { v >>>= 8; bits += 8; }
  if (v >= 16) { v >>>= 4; bits += 4; }
  if (v >= 4) { v >>>= 2; bits += 2; }
  if (v >= 1) { v >>>= 1; bits++; }
  return bits + v;
}

function bitReverse(bits: number, v: number) {
  let r = 0;
  for (; bits > 0; bits--) {
    r = (r << 1) | (v & 1);
    v >>>= 1;
  }
  return r;
}

function float32Unpack(x: number) {
  let mantissa = x & 0x1fffff;
  const sign = x & 0x80000000;
  const exponent = (x >> 21) & 0x3ff;
  if (sign !== 0) mantissa = -mantissa;
  return Math.fround(mantissa * Math.pow(2, exponent - 788));
}

class Codebook {
  readonly dimensions: number;
  private readonly entries: number;
  private readonly lengths: Int32Array;
  private tree: Int32Array = new Int32Array(8);
  private values: Float32Array[] | null = null;

  constructor(b: Bits) {
    b.read(24);
    this.dimensions = b.read(16);
    this.entries = b.read(24);
    this.lengths = new Int32Array(this.entries);
    if (b.one() !== 0) {
      let i = 0;
      let len = b.read(5) + 1;
      while (i < this.entries) {
        const count = b.read(ilog(this.entries - i));
        for (let j = 0; j < count; j++) this.lengths[i++] = len;
        len++;
      }
    } else {
      const sparse = b.one() !== 0;
      for (let i = 0; i < this.entries; i++) {
        this.lengths[i] = sparse && b.one() === 0 ? 0 : b.read(5) + 1;
      }
    }
    this.buildTree();

    const lookup = b.read(4);
    if (lookup > 0) {
      const min = float32Unpack(b.read(32));
      const delta = float32Unpack(b.read(32));
      const valueBits = b.read(4) + 1;
      const sequence = b.one() !== 0;
      const count = lookup === 1 ? lookup1Values(this.entries, this.dimensions) : this.entries * this.dimensions;
      const mult = new Int32Array(count);
      for (let i = 0; i < count; i++) mult[i] = b.read(valueBits);
      this.values = new Array(this.entries);
      for (let e = 0; e < this.entries; e++) {
        const vec = new Float32Array(this.dimensions);
        let last = 0;
        if (lookup === 1) {
          let div = 1;
          for (let d = 0; d < this.dimensions; d++) {
            const v = Math.fround(Math.fround(Math.fround(mult[Math.floor(e / div) % count] * delta) + min) + last);
            vec[d] = v;
            if (sequence) last = v;
            div *= count;
          }
        } else {
          let at = e * this.dimensions;
          for (let d = 0; d < this.dimensions; d++) {
            const v = Math.fround(Math.fround(Math.fround(mult[at++] * delta) + min) + last);
            vec[d] = v;
            if (sequence) last = v;
          }
        }
        this.values[e] = vec;
      }
    }
  }

  /** The client's Huffman tree build: codewords assigned in entry order. */
  private buildTree() {
    const codes = new Int32Array(this.entries);
    const next = new Int32Array(33);
    for (let e = 0; e < this.entries; e++) {
      const len = this.lengths[e];
      if (len === 0) continue;
      const bit = 1 << (32 - len);
      const code = next[len];
      codes[e] = code;
      let after: number;
      if ((code & bit) === 0) {
        after = code | bit;
        for (let l = len - 1; l >= 1; l--) {
          const c = next[l];
          if (c !== code) break;
          const lb = 1 << (32 - l);
          if ((c & lb) !== 0) {
            next[l] = next[l - 1];
            break;
          }
          next[l] = c | lb;
        }
      } else {
        after = next[len - 1];
      }
      next[len] = after;
      for (let l = len + 1; l <= 32; l++) if (next[l] === code) next[l] = after;
    }

    let tree = new Int32Array(8);
    let free = 0;
    for (let e = 0; e < this.entries; e++) {
      const len = this.lengths[e];
      if (len === 0) continue;
      const code = codes[e];
      let node = 0;
      for (let i = 0; i < len; i++) {
        const mask = 0x80000000 >>> i;
        if ((code & mask) === 0) {
          node++;
        } else {
          if (tree[node] === 0) tree[node] = free;
          node = tree[node];
        }
        if (node >= tree.length) {
          const grown = new Int32Array(tree.length * 2);
          grown.set(tree);
          tree = grown;
        }
      }
      tree[node] = ~e;
      if (node >= free) free = node + 1;
    }
    this.tree = tree;
  }

  scalar(b: Bits) {
    let node = 0;
    while (this.tree[node] >= 0) node = b.one() === 0 ? node + 1 : this.tree[node];
    return ~this.tree[node];
  }

  vq(b: Bits) {
    return this.values![this.scalar(b)];
  }
}

function lookup1Values(entries: number, dimensions: number) {
  let v = Math.floor(Math.pow(entries, 1 / dimensions)) + 1;
  while (Math.pow(v, dimensions) > entries) v--;
  return v;
}

const RANGES = [256, 128, 86, 64];
/** Vorbis floor-1 inverse dB table (spec section 10.1), as the client stores it: floats. */
const INVERSE_DB = new Float32Array([
  1.0649863E-7, 1.1341951E-7, 1.2079015E-7, 1.2863978E-7, 1.369995E-7, 1.459025E-7, 1.5538409E-7, 1.6548181E-7,
  1.7623574E-7, 1.8768856E-7, 1.998856E-7, 2.128753E-7, 2.2670913E-7, 2.4144197E-7, 2.5713223E-7, 2.7384212E-7,
  2.9163792E-7, 3.1059022E-7, 3.307741E-7, 3.5226967E-7, 3.7516213E-7, 3.995423E-7, 4.255068E-7, 4.5315863E-7,
  4.8260745E-7, 5.1397E-7, 5.4737063E-7, 5.829419E-7, 6.208247E-7, 6.611694E-7, 7.041359E-7, 7.4989464E-7,
  7.98627E-7, 8.505263E-7, 9.057983E-7, 9.646621E-7, 1.0273513E-6, 1.0941144E-6, 1.1652161E-6, 1.2409384E-6,
  1.3215816E-6, 1.4074654E-6, 1.4989305E-6, 1.5963394E-6, 1.7000785E-6, 1.8105592E-6, 1.9282195E-6, 2.053526E-6,
  2.1869757E-6, 2.3290977E-6, 2.4804558E-6, 2.6416496E-6, 2.813319E-6, 2.9961443E-6, 3.1908505E-6, 3.39821E-6,
  3.619045E-6, 3.8542307E-6, 4.1047006E-6, 4.371447E-6, 4.6555283E-6, 4.958071E-6, 5.280274E-6, 5.623416E-6,
  5.988857E-6, 6.3780467E-6, 6.7925284E-6, 7.2339453E-6, 7.704048E-6, 8.2047E-6, 8.737888E-6, 9.305725E-6,
  9.910464E-6, 1.0554501E-5, 1.1240392E-5, 1.1970856E-5, 1.2748789E-5, 1.3577278E-5, 1.4459606E-5, 1.5399271E-5,
  1.6400005E-5, 1.7465769E-5, 1.8600793E-5, 1.9809577E-5, 2.1096914E-5, 2.2467912E-5, 2.3928002E-5, 2.5482977E-5,
  2.7139005E-5, 2.890265E-5, 3.078091E-5, 3.2781227E-5, 3.4911533E-5, 3.718028E-5, 3.9596467E-5, 4.2169668E-5,
  4.491009E-5, 4.7828602E-5, 5.0936775E-5, 5.424693E-5, 5.7772202E-5, 6.152657E-5, 6.552491E-5, 6.9783084E-5,
  7.4317984E-5, 7.914758E-5, 8.429104E-5, 8.976875E-5, 9.560242E-5, 1.0181521E-4, 1.0843174E-4, 1.1547824E-4,
  1.2298267E-4, 1.3097477E-4, 1.3948625E-4, 1.4855085E-4, 1.5820454E-4, 1.6848555E-4, 1.7943469E-4, 1.9109536E-4,
  2.0351382E-4, 2.167393E-4, 2.3082423E-4, 2.4582449E-4, 2.6179955E-4, 2.7881275E-4, 2.9693157E-4, 3.1622787E-4,
  3.3677815E-4, 3.5866388E-4, 3.8197188E-4, 4.0679457E-4, 4.3323037E-4, 4.613841E-4, 4.913675E-4, 5.2329927E-4,
  5.573062E-4, 5.935231E-4, 6.320936E-4, 6.731706E-4, 7.16917E-4, 7.635063E-4, 8.1312325E-4, 8.6596457E-4,
  9.2223985E-4, 9.821722E-4, 0.0010459992, 0.0011139743, 0.0011863665, 0.0012634633, 0.0013455702, 0.0014330129,
  0.0015261382, 0.0016253153, 0.0017309374, 0.0018434235, 0.0019632196, 0.0020908006, 0.0022266726, 0.0023713743,
  0.0025254795, 0.0026895993, 0.0028643848, 0.0030505287, 0.003248769, 0.0034598925, 0.0036847359, 0.0039241905,
  0.0041792067, 0.004450795, 0.004740033, 0.005048067, 0.0053761187, 0.005725489, 0.0060975635, 0.0064938175,
  0.0069158226, 0.0073652514, 0.007843887, 0.008353627, 0.008896492, 0.009474637, 0.010090352, 0.01074608,
  0.011444421, 0.012188144, 0.012980198, 0.013823725, 0.014722068, 0.015678791, 0.016697686, 0.017782796,
  0.018938422, 0.020169148, 0.021479854, 0.022875736, 0.02436233, 0.025945531, 0.027631618, 0.029427277,
  0.031339627, 0.03337625, 0.035545226, 0.037855156, 0.0403152, 0.042935107, 0.045725275, 0.048696756,
  0.05186135, 0.05523159, 0.05882085, 0.062643364, 0.06671428, 0.07104975, 0.075666964, 0.08058423,
  0.08582105, 0.09139818, 0.097337745, 0.1036633, 0.11039993, 0.11757434, 0.12521498, 0.13335215,
  0.14201812, 0.15124726, 0.16107617, 0.1715438, 0.18269168, 0.19456401, 0.20720787, 0.22067343,
  0.23501402, 0.25028655, 0.26655158, 0.28387362, 0.3023213, 0.32196787, 0.34289113, 0.36517414,
  0.3889052, 0.41417846, 0.44109413, 0.4697589, 0.50028646, 0.53279793, 0.5674221, 0.6042964,
  0.64356697, 0.6853896, 0.72993004, 0.777365, 0.8278826, 0.88168305, 0.9389798, 1.0,
]);

class Floor {
  private readonly classList: Int32Array;
  private readonly classDims: Int32Array;
  private readonly subclasses: Int32Array;
  private readonly masterBooks: Int32Array;
  private readonly subBooks: Int32Array[];
  private readonly multiplier: number;
  readonly xList: Int32Array;

  constructor(b: Bits) {
    if (b.read(16) !== 1) throw new Error('vorbis: only floor type 1');
    const partitions = b.read(5);
    let classes = 0;
    this.classList = new Int32Array(partitions);
    for (let i = 0; i < partitions; i++) {
      const c = b.read(4);
      this.classList[i] = c;
      if (c >= classes) classes = c + 1;
    }
    this.classDims = new Int32Array(classes);
    this.subclasses = new Int32Array(classes);
    this.masterBooks = new Int32Array(classes);
    this.subBooks = new Array(classes);
    for (let c = 0; c < classes; c++) {
      this.classDims[c] = b.read(3) + 1;
      const sub = (this.subclasses[c] = b.read(2));
      if (sub !== 0) this.masterBooks[c] = b.read(8);
      const books = new Int32Array(1 << sub);
      for (let i = 0; i < books.length; i++) books[i] = b.read(8) - 1;
      this.subBooks[c] = books;
    }
    this.multiplier = b.read(2) + 1;
    const rangeBits = b.read(4);
    let count = 2;
    for (let i = 0; i < partitions; i++) count += this.classDims[this.classList[i]];
    this.xList = new Int32Array(count);
    this.xList[1] = 1 << rangeBits;
    let at = 2;
    for (let i = 0; i < partitions; i++) {
      const c = this.classList[i];
      for (let d = 0; d < this.classDims[c]; d++) this.xList[at++] = b.read(rangeBits);
    }
  }

  /** Read this packet's floor curve into `st`; false = the channel is unused. */
  decode(b: Bits, books: Codebook[], st: FloorState) {
    if (b.one() === 0) return false;
    const n = this.xList.length;
    st.ensure(n);
    st.x.set(this.xList);
    const range = RANGES[this.multiplier - 1];
    const bits = ilog(range - 1);
    st.y[0] = b.read(bits);
    st.y[1] = b.read(bits);
    let at = 2;
    for (let i = 0; i < this.classList.length; i++) {
      const c = this.classList[i];
      const dims = this.classDims[c];
      const sub = this.subclasses[c];
      const mask = (1 << sub) - 1;
      let cval = 0;
      if (sub > 0) cval = books[this.masterBooks[c]].scalar(b);
      for (let d = 0; d < dims; d++) {
        const book = this.subBooks[c][cval & mask];
        cval >>>= sub;
        st.y[at++] = book >= 0 ? books[book].scalar(b) : 0;
      }
    }
    return true;
  }

  /** Multiply the residue spectrum `v[0..n)` by the decoded floor curve. */
  synthesize(st: FloorState, v: Float32Array, n: number) {
    const count = this.xList.length;
    const range = RANGES[this.multiplier - 1];
    const { x, y, step2 } = st;
    step2[0] = step2[1] = true;
    for (let i = 2; i < count; i++) {
      const lo = lowNeighbour(x, i);
      const hi = highNeighbour(x, i);
      const predicted = renderPoint(x[lo], y[lo], x[hi], y[hi], x[i]);
      const val = y[i];
      const highroom = range - predicted;
      const room = (highroom < predicted ? highroom : predicted) << 1;
      if (val === 0) {
        step2[i] = false;
        y[i] = predicted;
      } else {
        step2[lo] = step2[hi] = true;
        step2[i] = true;
        if (val >= room) {
          y[i] = highroom > predicted ? val - predicted + predicted : predicted - val + highroom - 1;
        } else {
          y[i] = (val & 1) === 0 ? predicted + (val >> 1) : predicted - ((val + 1) >> 1);
        }
      }
    }
    sortPoints(st, 0, count - 1);
    let lx = 0;
    let ly = y[0] * this.multiplier;
    for (let i = 1; i < count; i++) {
      if (!step2[i]) continue;
      const hx = x[i];
      const hy = y[i] * this.multiplier;
      renderLine(lx, ly, hx, hy, v, n);
      if (hx >= n) return;
      lx = hx;
      ly = hy;
    }
    const tail = INVERSE_DB[ly];
    for (let i = lx; i < n; i++) v[i] = Math.fround(v[i] * tail);
  }
}

class FloorState {
  x = new Int32Array(0);
  y = new Int32Array(0);
  step2: boolean[] = [];
  ensure(n: number) {
    if (this.x.length < n) {
      this.x = new Int32Array(n);
      this.y = new Int32Array(n);
      this.step2 = new Array(n).fill(false);
    }
  }
}

function lowNeighbour(x: Int32Array, i: number) {
  const v = x[i];
  let best = -1;
  let bestV = -Infinity;
  for (let j = 0; j < i; j++) {
    if (x[j] < v && x[j] > bestV) { best = j; bestV = x[j]; }
  }
  return best;
}

function highNeighbour(x: Int32Array, i: number) {
  const v = x[i];
  let best = -1;
  let bestV = Infinity;
  for (let j = 0; j < i; j++) {
    if (x[j] > v && x[j] < bestV) { best = j; bestV = x[j]; }
  }
  return best;
}

function renderPoint(x0: number, y0: number, x1: number, y1: number, x: number) {
  const dy = y1 - y0;
  const adx = x1 - x0;
  const ady = dy < 0 ? -dy : dy;
  const off = Math.trunc((ady * (x - x0)) / adx);
  return dy < 0 ? y0 - off : y0 + off;
}

function renderLine(x0: number, y0: number, x1: number, y1: number, v: Float32Array, n: number) {
  const dy = y1 - y0;
  const adx = x1 - x0;
  const ady = dy < 0 ? -dy : dy;
  const base = Math.trunc(dy / adx);
  let y = y0;
  let err = 0;
  const sy = dy < 0 ? base - 1 : base + 1;
  const absBase = base < 0 ? -base : base;
  const adj = ady - absBase * adx;
  v[x0] = Math.fround(v[x0] * INVERSE_DB[y0]);
  if (x1 > n) x1 = n;
  for (let x = x0 + 1; x < x1; x++) {
    err += adj;
    if (err >= adx) {
      err -= adx;
      y += sy;
    } else {
      y += base;
    }
    v[x] = Math.fround(v[x] * INVERSE_DB[y]);
  }
}

/** The client's quicksort of the floor points by x, carrying y and the step-2 flag. */
function sortPoints(st: FloorState, lo: number, hi: number) {
  if (lo >= hi) return;
  const { x, y, step2 } = st;
  let mid = lo;
  const px = x[lo];
  const py = y[lo];
  const pf = step2[lo];
  for (let i = lo + 1; i <= hi; i++) {
    const xi = x[i];
    if (xi < px) {
      x[mid] = xi;
      y[mid] = y[i];
      step2[mid] = step2[i];
      mid++;
      x[i] = x[mid];
      y[i] = y[mid];
      step2[i] = step2[mid];
    }
  }
  x[mid] = px;
  y[mid] = py;
  step2[mid] = pf;
  sortPoints(st, lo, mid - 1);
  sortPoints(st, mid + 1, hi);
}

class Residue {
  private readonly type: number;
  private readonly begin: number;
  private readonly end: number;
  private readonly partitionSize: number;
  private readonly classifications: number;
  private readonly classBook: number;
  private readonly books: Int32Array;

  constructor(b: Bits) {
    this.type = b.read(16);
    this.begin = b.read(24);
    this.end = b.read(24);
    this.partitionSize = b.read(24) + 1;
    this.classifications = b.read(6) + 1;
    this.classBook = b.read(8);
    const cascade = new Int32Array(this.classifications);
    for (let i = 0; i < this.classifications; i++) {
      const low = b.read(3);
      const high = b.one() !== 0 ? b.read(5) : 0;
      cascade[i] = (high << 3) | low;
    }
    this.books = new Int32Array(this.classifications * 8);
    for (let i = 0; i < this.books.length; i++) {
      this.books[i] = (cascade[i >> 3] & (1 << (i & 7))) === 0 ? -1 : b.read(8);
    }
  }

  decode(b: Bits, books: Codebook[], v: Float32Array, n: number, skip: boolean) {
    v.fill(0, 0, n);
    if (skip) return;
    const classDims = books[this.classBook].dimensions;
    const partitions = Math.trunc((this.end - this.begin) / this.partitionSize);
    const classes = new Int32Array(partitions);
    for (let pass = 0; pass < 8; pass++) {
      let part = 0;
      while (part < partitions) {
        if (pass === 0) {
          let word = books[this.classBook].scalar(b);
          for (let d = classDims - 1; d >= 0; d--) {
            if (part + d < partitions) classes[part + d] = word % this.classifications;
            word = Math.trunc(word / this.classifications);
          }
        }
        for (let d = 0; d < classDims; d++) {
          const book = this.books[classes[part] * 8 + pass];
          if (book >= 0) {
            const at = this.begin + part * this.partitionSize;
            const cb = books[book];
            if (this.type === 0) {
              const step = Math.trunc(this.partitionSize / cb.dimensions);
              for (let i = 0; i < step; i++) {
                const vec = cb.vq(b);
                for (let k = 0; k < cb.dimensions; k++) {
                  v[at + i + k * step] = Math.fround(v[at + i + k * step] + vec[k]);
                }
              }
            } else {
              let i = 0;
              while (i < this.partitionSize) {
                const vec = cb.vq(b);
                for (let k = 0; k < cb.dimensions; k++) {
                  v[at + i] = Math.fround(v[at + i] + vec[k]);
                  i++;
                }
              }
            }
          }
          part++;
          if (part >= partitions) break;
        }
      }
    }
  }
}

interface Mapping {
  submaps: number;
  mux: number;
  floors: Int32Array;
  residues: Int32Array;
}

function readMapping(b: Bits): Mapping {
  b.read(16);
  const submaps = b.one() === 0 ? 1 : b.read(4) + 1;
  if (b.one() !== 0) b.read(8);
  b.read(2);
  const mux = submaps > 1 ? b.read(4) : 0;
  const floors = new Int32Array(submaps);
  const residues = new Int32Array(submaps);
  for (let i = 0; i < submaps; i++) {
    b.read(8);
    floors[i] = b.read(8);
    residues[i] = b.read(8);
  }
  return { submaps, mux, floors, residues };
}

interface Trig {
  a: Float32Array;
  b: Float32Array;
  c: Float32Array;
  rev: Int32Array;
}

/** The setup header every music sample shares: codebooks, floors, residues, modes. */
export class VorbisSetup {
  readonly blockSize0: number;
  readonly blockSize1: number;
  readonly codebooks: Codebook[] = [];
  readonly floors: Floor[] = [];
  readonly residues: Residue[] = [];
  readonly mappings: Mapping[] = [];
  readonly modeBlockFlags: boolean[] = [];
  readonly modeMappings: number[] = [];
  readonly trig: [Trig, Trig];
  /** Scratch buffers, shared by every decode (the client keeps them static too). */
  readonly bits = new Bits();
  readonly floorState = new FloorState();

  constructor(data: Uint8Array) {
    const b = this.bits;
    b.reset(data);
    this.blockSize0 = 1 << b.read(4);
    this.blockSize1 = 1 << b.read(4);
    this.trig = [makeTrig(this.blockSize0), makeTrig(this.blockSize1)];
    const books = b.read(8) + 1;
    for (let i = 0; i < books; i++) this.codebooks.push(new Codebook(b));
    const times = b.read(6) + 1;
    for (let i = 0; i < times; i++) b.read(16);
    const floors = b.read(6) + 1;
    for (let i = 0; i < floors; i++) this.floors.push(new Floor(b));
    const residues = b.read(6) + 1;
    for (let i = 0; i < residues; i++) this.residues.push(new Residue(b));
    const mappings = b.read(6) + 1;
    for (let i = 0; i < mappings; i++) this.mappings.push(readMapping(b));
    const modes = b.read(6) + 1;
    for (let i = 0; i < modes; i++) {
      this.modeBlockFlags.push(b.one() !== 0);
      b.read(16);
      b.read(16);
      this.modeMappings.push(b.read(8));
    }
  }
}

function makeTrig(n: number): Trig {
  const n2 = n >> 1;
  const n4 = n >> 2;
  const n8 = n >> 3;
  const a = new Float32Array(n2);
  for (let i = 0; i < n4; i++) {
    a[i * 2] = Math.cos((i * 4 * Math.PI) / n);
    a[i * 2 + 1] = -Math.sin((i * 4 * Math.PI) / n);
  }
  const b = new Float32Array(n2);
  for (let i = 0; i < n4; i++) {
    b[i * 2] = Math.cos(((i * 2 + 1) * Math.PI) / (n * 2));
    b[i * 2 + 1] = Math.sin(((i * 2 + 1) * Math.PI) / (n * 2));
  }
  const c = new Float32Array(n4);
  for (let i = 0; i < n8; i++) {
    c[i * 2] = Math.cos(((i * 4 + 2) * Math.PI) / n);
    c[i * 2 + 1] = -Math.sin(((i * 4 + 2) * Math.PI) / n);
  }
  const rev = new Int32Array(n8);
  const bits = ilog(n8 - 1);
  for (let i = 0; i < n8; i++) rev[i] = bitReverse(bits, i);
  return { a, b, c, rev };
}

/** Decode one index-14 sample file against the shared setup. */
export function decodeVorbisSample(setup: VorbisSetup, data: Uint8Array): RawSound {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let o = 0;
  const i32 = () => { const v = view.getInt32(o); o += 4; return v; };
  const sampleRate = i32();
  const sampleCount = i32();
  const start = i32();
  let end = i32();
  let pingPong = false;
  if (end < 0) {
    end = ~end;
    pingPong = true;
  }
  const packetCount = i32();
  const packets: Uint8Array[] = new Array(packetCount);
  for (let i = 0; i < packetCount; i++) {
    let len = 0;
    let n: number;
    do {
      n = data[o++];
      len += n;
    } while (n >= 255);
    packets[i] = data.subarray(o, o + len);
    o += len;
  }

  const samples = new Int8Array(sampleCount);
  let written = 0;
  const dec = new PacketDecoder(setup);
  for (const packet of packets) {
    const out = dec.decode(packet);
    if (!out) continue;
    let len = out.length;
    if (len > sampleCount - written) len = sampleCount - written;
    for (let i = 0; i < len; i++) {
      let v = Math.trunc(Math.fround(Math.fround(out[i] * 128) + 128));
      if ((v & ~0xff) !== 0) v = ~v >> 31;
      samples[written++] = v - 128;
    }
  }
  return { sampleRate, samples, start, end, pingPong };
}

/** Per-sample decode state: the previous block's right half, for overlap-add. */
class PacketDecoder {
  private prevN = 0;
  private prevQuarter = 0;
  private prevNoResidue = false;
  private prev: Float32Array;
  private cur: Float32Array;
  private readonly s: VorbisSetup;

  constructor(s: VorbisSetup) {
    this.s = s;
    this.prev = new Float32Array(s.blockSize1);
    this.cur = new Float32Array(s.blockSize1);
  }

  decode(packet: Uint8Array): Float32Array | null {
    const s = this.s;
    const b = s.bits;
    b.reset(packet);
    b.one();
    const mode = b.read(ilog(s.modeMappings.length - 1));
    const long = s.modeBlockFlags[mode];
    const n = long ? s.blockSize1 : s.blockSize0;
    let prevFlag = false;
    let nextFlag = false;
    if (long) {
      prevFlag = b.one() !== 0;
      nextFlag = b.one() !== 0;
    }
    const half = n >> 1;
    let leftStart: number, leftEnd: number, leftN: number;
    if (long && !prevFlag) {
      leftStart = (n >> 2) - (s.blockSize0 >> 2);
      leftEnd = (n >> 2) + (s.blockSize0 >> 2);
      leftN = s.blockSize0 >> 1;
    } else {
      leftStart = 0;
      leftEnd = half;
      leftN = n >> 1;
    }
    let rightStart: number, rightEnd: number, rightN: number;
    if (long && !nextFlag) {
      rightStart = n - (n >> 2) - (s.blockSize0 >> 2);
      rightEnd = n + (s.blockSize0 >> 2) - (n >> 2);
      rightN = s.blockSize0 >> 1;
    } else {
      rightStart = half;
      rightEnd = n;
      rightN = n >> 1;
    }

    const mapping = s.mappings[s.modeMappings[mode]];
    const floor = s.floors[mapping.floors[mapping.mux]];
    const noResidue = !floor.decode(b, s.codebooks, s.floorState);
    const v = this.cur;
    for (let i = 0; i < mapping.submaps; i++) {
      s.residues[mapping.residues[i]].decode(b, s.codebooks, v, half, noResidue);
    }

    if (noResidue) {
      v.fill(0, half, n);
    } else {
      floor.synthesize(s.floorState, v, half);
      inverseMdct(v, n, s.trig[long ? 1 : 0]);
      for (let i = leftStart; i < leftEnd; i++) {
        const t = Math.fround(Math.sin(((i - leftStart + 0.5) / leftN) * 0.5 * Math.PI));
        v[i] = Math.fround(v[i] * Math.fround(Math.sin(t * 1.5707963267948966 * t)));
      }
      for (let i = rightStart; i < rightEnd; i++) {
        const t = Math.fround(Math.sin(((i - rightStart + 0.5) / rightN) * 0.5 * Math.PI + 1.5707963267948966));
        v[i] = Math.fround(v[i] * Math.fround(Math.sin(t * 1.5707963267948966 * t)));
      }
    }

    let out: Float32Array | null = null;
    if (this.prevN > 0) {
      out = new Float32Array((this.prevN + n) >> 2);
      if (!this.prevNoResidue) {
        for (let i = 0; i < this.prevQuarter; i++) out[i] += this.prev[(this.prevN >> 1) + i];
      }
      if (!noResidue) {
        for (let i = leftStart; i < half; i++) out[out.length + i - half] += v[i];
      }
    }
    this.cur = this.prev;
    this.prev = v;
    this.prevN = n;
    this.prevQuarter = rightEnd - half;
    this.prevNoResidue = noResidue;
    return out;
  }
}

/** The client's in-place inverse MDCT (Vorbis spec algorithm, float32 throughout). */
function inverseMdct(v: Float32Array, n: number, t: Trig) {
  const n2 = n >> 1;
  const n4 = n >> 2;
  const n8 = n >> 3;
  const A = t.a;
  const B = t.b;
  const C = t.c;
  const f = Math.fround;
  for (let k = 0; k < n2; k++) v[k] = f(v[k] * 0.5);
  for (let k = n2; k < n; k++) v[k] = -v[n - k - 1];
  for (let k = 0; k < n4; k++) {
    const a = f(v[k * 4] - v[n - k * 4 - 1]);
    const b = f(v[k * 4 + 2] - v[n - k * 4 - 3]);
    const c = A[k * 2];
    const d = A[k * 2 + 1];
    v[n - k * 4 - 1] = f(f(a * c) - f(b * d));
    v[n - k * 4 - 3] = f(f(a * d) + f(b * c));
  }
  for (let k = 0; k < n8; k++) {
    const a = v[n2 + k * 4 + 3];
    const b = v[n2 + k * 4 + 1];
    const c = v[k * 4 + 3];
    const d = v[k * 4 + 1];
    v[n2 + k * 4 + 3] = f(a + c);
    v[n2 + k * 4 + 1] = f(b + d);
    const e = A[n2 - k * 4 - 4];
    const g = A[n2 - k * 4 - 3];
    v[k * 4 + 3] = f(f(f(a - c) * e) - f(f(b - d) * g));
    v[k * 4 + 1] = f(f(f(b - d) * e) + f(f(a - c) * g));
  }
  const logN = ilog(n - 1);
  for (let l = 0; l < logN - 3; l++) {
    const k0 = n >> (l + 2);
    const k1 = 8 << l;
    for (let s = 0; s < 2 << l; s++) {
      const e0 = n - k0 * 2 * s;
      const e1 = n - k0 * (s * 2 + 1);
      for (let r = 0; r < n >> (l + 4); r++) {
        const i = r * 4;
        const a = v[e0 - i - 1];
        const b = v[e0 - i - 3];
        const c = v[e1 - i - 1];
        const d = v[e1 - i - 3];
        v[e0 - i - 1] = f(a + c);
        v[e0 - i - 3] = f(b + d);
        const w0 = A[r * k1];
        const w1 = A[r * k1 + 1];
        v[e1 - i - 1] = f(f(f(a - c) * w0) - f(f(b - d) * w1));
        v[e1 - i - 3] = f(f(f(b - d) * w0) + f(f(a - c) * w1));
      }
    }
  }
  for (let l = 1; l < n8 - 1; l++) {
    const j = t.rev[l];
    if (l < j) {
      const a = l * 8;
      const b = j * 8;
      let tmp = v[a + 1]; v[a + 1] = v[b + 1]; v[b + 1] = tmp;
      tmp = v[a + 3]; v[a + 3] = v[b + 3]; v[b + 3] = tmp;
      tmp = v[a + 5]; v[a + 5] = v[b + 5]; v[b + 5] = tmp;
      tmp = v[a + 7]; v[a + 7] = v[b + 7]; v[b + 7] = tmp;
    }
  }
  for (let l = 0; l < n2; l++) v[l] = v[l * 2 + 1];
  for (let l = 0; l < n8; l++) {
    v[n - l * 2 - 1] = v[l * 4];
    v[n - l * 2 - 2] = v[l * 4 + 1];
    v[n - n4 - l * 2 - 1] = v[l * 4 + 2];
    v[n - n4 - l * 2 - 2] = v[l * 4 + 3];
  }
  for (let l = 0; l < n8; l++) {
    const b = C[l * 2];
    const c = C[l * 2 + 1];
    const d = v[n2 + l * 2];
    const e = v[n2 + l * 2 + 1];
    const g = v[n - l * 2 - 2];
    const h = v[n - l * 2 - 1];
    const x = f(f(c * f(d - g)) + f(b * f(e + h)));
    v[n2 + l * 2] = f(f(f(d + g) + x) * 0.5);
    v[n - l * 2 - 2] = f(f(f(d + g) - x) * 0.5);
    const y = f(f(c * f(e + h)) - f(b * f(d - g)));
    v[n2 + l * 2 + 1] = f(f(f(e + y) - h) * 0.5);
    v[n - l * 2 - 1] = f(f(f(h + y) - e) * 0.5);
  }
  for (let l = 0; l < n4; l++) {
    v[l] = f(f(v[l * 2 + n2] * B[l * 2]) + f(v[l * 2 + n2 + 1] * B[l * 2 + 1]));
    v[n2 - l - 1] = f(f(v[l * 2 + n2] * B[l * 2 + 1]) - f(v[l * 2 + n2 + 1] * B[l * 2]));
  }
  for (let l = 0; l < n4; l++) v[n + l - n4] = -v[l];
  for (let l = 0; l < n4; l++) v[l] = v[n4 + l];
  for (let l = 0; l < n4; l++) v[n4 + l] = -v[n4 - l - 1];
  for (let l = 0; l < n4; l++) v[n2 + l] = v[n - l - 1];
}
