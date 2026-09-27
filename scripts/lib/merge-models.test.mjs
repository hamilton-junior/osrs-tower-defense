import { describe, it, expect } from 'vitest';
import { ModelDefinition, ModelGroup } from 'osrscachereader';
import { mergeParts } from './merge-models.mjs';

/** A model part: vertices, their bone labels and faces, the way the loader leaves them. */
function part({ verts, labels, faces, alphas = [], priorities = [], priority }) {
  const m = new ModelDefinition();
  m.vertexCount = verts.length;
  m.vertexPositionsX = verts.map((v) => v[0]);
  m.vertexPositionsY = verts.map((v) => v[1]);
  m.vertexPositionsZ = verts.map((v) => v[2]);
  m.faceCount = faces.length;
  m.faceVertexIndices1 = faces.map((f) => f[0]);
  m.faceVertexIndices2 = faces.map((f) => f[1]);
  m.faceVertexIndices3 = faces.map((f) => f[2]);
  m.faceColors = faces.map(() => 1000);
  m.faceAlphas = alphas;
  m.faceRenderPriorities = priorities;
  m.priority = priority;
  m.vertexNormals = [];
  m.vertexGroups = [];
  labels.forEach((l, v) => (m.vertexGroups[l] ??= []).push(v));
  return m;
}

const corners = (m, f) => [m.faceVertexIndices1[f], m.faceVertexIndices2[f], m.faceVertexIndices3[f]];
const shareCorner = (m) => corners(m, 0).some((v) => corners(m, 1).includes(v));

// A thigh and a shin meeting at the knee: their end vertices coincide, on different bones.
const thigh = () => part({ verts: [[0, 0, 0], [10, 0, 0], [0, 50, 0]], labels: [1, 1, 1], faces: [[0, 1, 2]] });
const shin = () => part({ verts: [[0, 50, 0], [10, 50, 0], [0, 100, 0]], labels: [2, 2, 2], faces: [[0, 1, 2]] });

describe('mergeParts', () => {
  it('welds a coincident vertex onto the first part, as the client does', () => {
    const m = mergeParts(ModelDefinition, [thigh(), shin()]);
    expect(m.vertexCount).toBe(5);
    // The shin's knee corner is the thigh's knee vertex, so the knee bends with the thigh.
    expect(corners(m, 0)).toEqual([0, 1, 2]);
    expect(corners(m, 1)).toEqual([2, 3, 4]);
    expect(m.vertexGroups[1]).toEqual([0, 1, 2]);
    expect(m.vertexGroups[2]).toEqual([3, 4]);
    // The library's own merge keeps the LAST of a coincident pair instead, so the
    // thigh's face ends on the shin's knee and bends with the wrong bone.
    const lib = new ModelGroup([thigh(), shin()]).getMergedModel();
    expect(corners(lib, 0)).toContain(3);
  });

  it('welds only exact matches, not everything within a unit', () => {
    const near = part({ verts: [[1, 50, 0], [10, 50, 0], [0, 100, 0]], labels: [2, 2, 2], faces: [[0, 1, 2]] });
    const m = mergeParts(ModelDefinition, [thigh(), near]);
    expect(m.vertexCount).toBe(6);
    expect(shareCorner(m)).toBe(false);
  });

  it("carries each kept vertex's own skinning data along", () => {
    const a = thigh(), b = shin();
    a.animayaGroups = [[1], [1], [1]]; a.animayaScales = [[255], [255], [255]];
    b.animayaGroups = [[7], [8], [9]]; b.animayaScales = [[100], [101], [102]];
    const m = mergeParts(ModelDefinition, [a, b]);
    expect(m.animayaGroups).toEqual([[1], [1], [1], [8], [9]]);
    expect(m.animayaScales).toEqual([[255], [255], [255], [101], [102]]);
  });

  it("puts each part's alphas on its own faces", () => {
    const body = part({ verts: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], labels: [1, 1, 1], faces: [[0, 1, 2], [0, 2, 1]] });
    const glow = part({ verts: [[0, 0, 5], [1, 0, 5], [0, 1, 5]], labels: [2, 2, 2], faces: [[0, 1, 2]], alphas: [175] });
    const m = mergeParts(ModelDefinition, [body, glow]);
    expect(m.faceAlphas).toEqual([0, 0, 175]);
  });

  it('spreads a whole-model priority over that part\'s faces', () => {
    const cape = part({ verts: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], labels: [1, 1, 1], faces: [[0, 1, 2], [0, 2, 1]], priority: 10 });
    const belt = part({ verts: [[0, 0, 5], [1, 0, 5], [0, 1, 5]], labels: [2, 2, 2], faces: [[0, 1, 2]], priorities: [3] });
    expect(mergeParts(ModelDefinition, [cape, belt]).faceRenderPriorities).toEqual([10, 10, 3]);
  });

  it('skins exactly the vertices the mesh has', () => {
    const m = mergeParts(ModelDefinition, [thigh(), shin()]);
    expect(m.vertexPositionsX).toHaveLength(m.vertexCount);
    expect(m.animayaGroups).toHaveLength(m.vertexCount);
    expect(m.animayaScales).toHaveLength(m.vertexCount);
  });

  it('returns a lone part as it is', () => {
    const p = thigh();
    expect(mergeParts(ModelDefinition, [p])).toBe(p);
  });
});
