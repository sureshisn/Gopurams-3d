import * as THREE from 'three';
import { createGopuramMaterials, type GopuramMaterialSet } from './gopuramMaterials';
import type { GopuramParams, PrintMetrics } from './gopuramTypes';
import { createRng } from './prng';

export interface BuiltGopuram {
  group: THREE.Group;
  materials: GopuramMaterialSet;
  metrics: PrintMetrics;
  rawBounds: THREE.Box3;
}

/**
 * Maximum horizontal-to-vertical ratio allowed for any outward flare/overhang.
 * 0.88 corresponds to ~41.3 deg from vertical (strictly <= 45 deg support-free FDM limit).
 */
const MAX_OVERHANG_RATIO = 0.88;

function clampProjection(desiredProj: number, riseHeight: number): number {
  return Math.max(0, Math.min(desiredProj, riseHeight * MAX_OVERHANG_RATIO));
}

/**
 * Creates a chamfered rectangular frustum (8-sided plan with beveled corners)
 * so stone plinths, tiers, and pilasters catch light smoothly like carved stone.
 */
function createChamferedFrustumGeometry(
  bottomW: number,
  bottomD: number,
  topW: number,
  topD: number,
  height: number,
  chamferRatio = 0.045
): THREE.BufferGeometry {
  const makeOctRing = (w: number, d: number, y: number): [number, number, number][] => {
    const hw = w / 2;
    const hd = d / 2;
    const c = Math.min(hw, hd) * Math.min(0.35, Math.max(0.01, chamferRatio));
    return [
      [-hw + c, y, hd],
      [hw - c, y, hd],
      [hw, y, hd - c],
      [hw, y, -hd + c],
      [hw - c, y, -hd],
      [-hw + c, y, -hd],
      [-hw, y, -hd + c],
      [-hw, y, hd - c],
    ];
  };

  const bot = makeOctRing(bottomW, bottomD, 0);
  const top = makeOctRing(topW, topD, height);

  const positions: number[] = [];
  const pushTri = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number]
  ) => {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };

  for (let i = 0; i < 8; i++) {
    const next = (i + 1) % 8;
    pushTri(bot[i], bot[next], top[next]);
    pushTri(bot[i], top[next], top[i]);
  }

  const topCenter: [number, number, number] = [0, height, 0];
  for (let i = 0; i < 8; i++) {
    const next = (i + 1) % 8;
    pushTri(topCenter, top[i], top[next]);
  }

  const botCenter: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 8; i++) {
    const next = (i + 1) % 8;
    pushTri(botCenter, bot[next], bot[i]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Multi-step smooth curved Kapota cornice (all overhang angles strictly <= 42 deg).
 */
function createSmoothKapotaCornice(
  baseW: number,
  baseD: number,
  desiredProj: number,
  height: number
): THREE.BufferGeometry {
  const flareH = height * 0.56;
  const capH = height * 0.44;
  const proj = clampProjection(desiredProj, flareH);

  const h1 = flareH * 0.42;
  const p1 = proj * 0.36;
  const p2 = proj;

  const rings: { w: number; d: number; y: number }[] = [
    { w: baseW, d: baseD, y: 0 },
    { w: baseW + p1 * 2, d: baseD + p1 * 2, y: h1 },
    { w: baseW + p2 * 2, d: baseD + p2 * 2, y: flareH },
    { w: baseW + p2 * 1.15, d: baseD + p2 * 1.15, y: flareH + capH * 0.45 },
    { w: baseW * 0.94, d: baseD * 0.94, y: flareH + capH },
  ];

  const makeRing = (w: number, d: number, y: number): [number, number, number][] => {
    const hw = w / 2;
    const hd = d / 2;
    const c = Math.min(hw, hd) * 0.05;
    return [
      [-hw + c, y, hd],
      [hw - c, y, hd],
      [hw, y, hd - c],
      [hw, y, -hd + c],
      [hw - c, y, -hd],
      [-hw + c, y, -hd],
      [-hw, y, -hd + c],
      [-hw, y, hd - c],
    ];
  };

  const positions: number[] = [];
  const pushTri = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number]
  ) => {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };

  const ringPts = rings.map((r) => makeRing(r.w, r.d, r.y));
  for (let r = 0; r < ringPts.length - 1; r++) {
    const r0 = ringPts[r];
    const r1 = ringPts[r + 1];
    for (let i = 0; i < 8; i++) {
      const next = (i + 1) % 8;
      pushTri(r0[i], r0[next], r1[next]);
      pushTri(r0[i], r1[next], r1[i]);
    }
  }

  const botCenter: [number, number, number] = [0, 0, 0];
  const topCenter: [number, number, number] = [0, rings[rings.length - 1].y, 0];
  const botRing = ringPts[0];
  const topRing = ringPts[ringPts.length - 1];
  for (let i = 0; i < 8; i++) {
    const next = (i + 1) % 8;
    pushTri(botCenter, botRing[next], botRing[i]);
    pushTri(topCenter, topRing[i], topRing[next]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Smooth Dravidian Sala-Shikhara barrel-vaulted roof (no sharp ridge crease,
 * 22 curve segments, and zero unsupported outward overhang at y = 0).
 */
function createSalaRoofGeometry(
  lengthX: number,
  depthZ: number,
  heightY: number
): { geometry: THREE.BufferGeometry; bevelSize: number; bevelThickness: number } {
  const hd = depthZ / 2;
  const shape = new THREE.Shape();

  const flareY = heightY * 0.14;
  const shoulderX = hd * 1.07;

  shape.moveTo(-hd * 0.96, 0);
  shape.lineTo(-shoulderX, flareY);
  shape.bezierCurveTo(-hd * 0.92, heightY * 0.34, -hd * 0.68, heightY * 0.98, 0, heightY);
  shape.bezierCurveTo(hd * 0.68, heightY * 0.98, hd * 0.92, heightY * 0.34, shoulderX, flareY);
  shape.lineTo(hd * 0.96, 0);
  shape.closePath();

  const bevelThickness = Math.min(lengthX, depthZ) * 0.032;
  const bevelSize = Math.min(lengthX, depthZ) * 0.022;

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: lengthX,
    bevelEnabled: true,
    bevelThickness,
    bevelSize,
    bevelSegments: 4,
    curveSegments: 22,
  });

  geo.translate(0, 0, -lengthX / 2);
  geo.rotateY(Math.PI / 2);
  geo.computeVertexNormals();
  return { geometry: geo, bevelSize, bevelThickness };
}

/**
 * Pointed Dravidian Devakoshta arch silhouette (flat base at y=0, straight vertical sides
 * up to ~62% height, then pointed arch meeting cleanly at apex with slope >= 50 deg from horizontal).
 */
function createPointedNicheGeometry(
  width: number,
  height: number,
  depth: number,
  springRatio = 0.62
): THREE.BufferGeometry {
  const hw = width / 2;
  const springY = height * springRatio;
  const shape = new THREE.Shape();

  shape.moveTo(-hw, 0);
  shape.lineTo(hw, 0);
  shape.lineTo(hw, springY);
  shape.quadraticCurveTo(hw * 0.68, height * 0.88, 0, height);
  shape.quadraticCurveTo(-hw * 0.68, height * 0.88, -hw, springY);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 12,
  });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Smooth Kudu (horseshoe arch) dormer motif with printable <= 42 deg base flare.
 */
function createKuduArchGeometry(width: number, height: number, depth: number): THREE.BufferGeometry {
  const hw = width / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-hw * 0.88, 0);
  shape.lineTo(-hw, height * 0.16);
  shape.bezierCurveTo(-hw * 0.95, height * 0.68, -hw * 0.45, height, 0, height);
  shape.bezierCurveTo(hw * 0.45, height, hw * 0.95, height * 0.68, hw, height * 0.16);
  shape.lineTo(hw * 0.88, 0);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: Math.min(depth * 0.08, width * 0.04),
    bevelSize: width * 0.03,
    bevelSegments: 2,
    curveSegments: 14,
  });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * High-resolution lathe-turned sacred Kalasam finial with an embedded root collar
 * and a rounded printable tip (no ultra-thin needle tip).
 */
function createKalasamGeometry(height: number, radius: number): THREE.BufferGeometry {
  const rootDepth = Math.max(0.016, height * 0.14);
  const rawPts = [
    new THREE.Vector2(0.001, -rootDepth),
    new THREE.Vector2(radius * 1.12, -rootDepth),
    new THREE.Vector2(radius * 1.12, 0),
    new THREE.Vector2(radius * 1.06, height * 0.1),
    new THREE.Vector2(radius * 0.72, height * 0.22),
    new THREE.Vector2(radius * 0.98, height * 0.38),
    new THREE.Vector2(radius * 0.96, height * 0.48),
    new THREE.Vector2(radius * 0.64, height * 0.58),
    new THREE.Vector2(radius * 0.44, height * 0.65),
    new THREE.Vector2(radius * 0.55, height * 0.72),
    new THREE.Vector2(radius * 0.32, height * 0.84),
    new THREE.Vector2(radius * 0.16, height * 0.95),
    new THREE.Vector2(0.001, height),
  ];
  const geo = new THREE.LatheGeometry(rawPts, 24);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Smooth lofted Dravidian Vimana/Kuta cupola dome (starts flush at baseW x baseD
 * so there is zero unsupported horizontal ledge).
 */
function createSmoothCupolaDomeGeometry(
  baseW: number,
  baseD: number,
  height: number,
  radialSegments = 24,
  superPower = 3.2
): THREE.BufferGeometry {
  const profile: { scale: number; y: number }[] = [
    { scale: 0.96, y: 0 },
    { scale: 1.04, y: height * 0.11 },
    { scale: 1.01, y: height * 0.2 },
    { scale: 0.91, y: height * 0.34 },
    { scale: 0.84, y: height * 0.48 },
    { scale: 0.74, y: height * 0.62 },
    { scale: 0.59, y: height * 0.76 },
    { scale: 0.41, y: height * 0.88 },
    { scale: 0.22, y: height * 0.96 },
    { scale: 0.08, y: height },
  ];

  const hw = baseW / 2;
  const hd = baseD / 2;

  const makeRing = (scale: number, y: number): [number, number, number][] => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i < radialSegments; i++) {
      const theta = (i / radialSegments) * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const sx = Math.sign(cosT) * Math.pow(Math.abs(cosT), 2 / superPower);
      const sz = Math.sign(sinT) * Math.pow(Math.abs(sinT), 2 / superPower);
      pts.push([sx * hw * scale, y, sz * hd * scale]);
    }
    return pts;
  };

  const positions: number[] = [];
  const pushTri = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number]
  ) => {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };

  const ringList = profile.map((p) => makeRing(p.scale, p.y));
  for (let r = 0; r < ringList.length - 1; r++) {
    const r0 = ringList[r];
    const r1 = ringList[r + 1];
    for (let i = 0; i < radialSegments; i++) {
      const next = (i + 1) % radialSegments;
      pushTri(r0[i], r0[next], r1[next]);
      pushTri(r0[i], r1[next], r1[i]);
    }
  }

  const botCenter: [number, number, number] = [0, 0, 0];
  const topCenter: [number, number, number] = [0, height, 0];
  const botRing = ringList[0];
  const topRing = ringList[ringList.length - 1];
  for (let i = 0; i < radialSegments; i++) {
    const next = (i + 1) % radialSegments;
    pushTri(botCenter, botRing[next], botRing[i]);
    pushTri(topCenter, topRing[i], topRing[next]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates a self-supporting arched, cusped, or corbelled portal lintel block spanning `portalW`
 * with an interior soffit sloping monotonically upward (>= 48 deg from horizontal)
 * so the gateway requires zero 3D printing supports.
 */
function createSelfSupportingPortalHeader(
  portalW: number,
  archRise: number,
  lintelTopH: number,
  depth: number,
  style: 'arched' | 'cusped' | 'corbelled'
): THREE.BufferGeometry {
  const hw = portalW / 2 + 0.02;
  const totalH = archRise + lintelTopH;
  const shape = new THREE.Shape();

  shape.moveTo(-hw, 0);
  shape.lineTo(-hw, totalH);
  shape.lineTo(hw, totalH);
  shape.lineTo(hw, 0);

  if (style === 'corbelled') {
    const steps = 4;
    for (let s = 1; s <= steps; s++) {
      const frac = s / steps;
      const yLow = archRise * ((s - 1) / steps);
      const yHigh = archRise * frac;
      const xIn = hw * (1 - frac * 0.92);
      shape.lineTo(hw * (1 - ((s - 1) / steps) * 0.92), yLow);
      shape.lineTo(xIn, yHigh);
    }
    shape.lineTo(0, archRise);
    for (let s = steps; s >= 1; s--) {
      const frac = s / steps;
      const yLow = archRise * ((s - 1) / steps);
      const yHigh = archRise * frac;
      const xIn = -hw * (1 - frac * 0.92);
      shape.lineTo(xIn, yHigh);
      shape.lineTo(-hw * (1 - ((s - 1) / steps) * 0.92), yLow);
    }
  } else if (style === 'cusped') {
    // Scalloped Dravidian Makhara-Torana cusped arch whose overall trend rises monotonically >= 48 deg
    const cusps = 5;
    const ptsRight: [number, number][] = [];
    const steps = 30;
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      const baseX = hw * Math.pow(1 - u, 0.88);
      const baseY = archRise * Math.pow(u, 0.85);
      // Gentle outward/inward scalloped notches along the arch soffit
      const scallop = Math.abs(Math.sin(u * Math.PI * cusps)) * Math.min(hw, archRise) * 0.068 * Math.sin(u * Math.PI);
      const rx = Math.max(0, baseX - scallop * 0.65);
      const ry = Math.min(archRise, baseY + scallop * 0.35);
      ptsRight.push([rx, ry]);
    }
    for (const [rx, ry] of ptsRight) {
      shape.lineTo(rx, ry);
    }
    shape.lineTo(0, archRise);
    for (let i = ptsRight.length - 1; i >= 0; i--) {
      shape.lineTo(-ptsRight[i][0], ptsRight[i][1]);
    }
  } else {
    shape.bezierCurveTo(hw * 0.72, archRise * 0.55, hw * 0.28, archRise * 0.88, 0, archRise);
    shape.bezierCurveTo(-hw * 0.28, archRise * 0.88, -hw * 0.72, archRise * 0.55, -hw, 0);
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 16,
  });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a hollow/cusped decorative arch surround ring (thickness `ringT`) that sits cleanly
 * in front of a portal or shrine niche.
 */
function createPointedArchSurround(
  innerW: number,
  outerW: number,
  springH: number,
  archRise: number,
  depth: number,
  cusped = false
): THREE.BufferGeometry {
  const ihw = innerW / 2;
  const ohw = outerW / 2;
  const outerApex = springH + archRise + (outerW - innerW) * 0.55;
  const innerApex = springH + archRise;

  const shape = new THREE.Shape();
  // Trace outer boundary clockwise from bottom-left
  shape.moveTo(-ohw, 0);
  shape.lineTo(-ohw, springH);
  shape.quadraticCurveTo(-ohw * 0.68, outerApex * 0.88, 0, outerApex);
  shape.quadraticCurveTo(ohw * 0.68, outerApex * 0.88, ohw, springH);
  shape.lineTo(ohw, 0);

  // Step inward to inner arch foot
  shape.lineTo(ihw, 0);
  shape.lineTo(ihw, springH);

  if (cusped) {
    const cusps = 5;
    const steps = 28;
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      const baseX = ihw * Math.pow(1 - u, 0.88);
      const baseY = springH + archRise * Math.pow(u, 0.85);
      const scallop = Math.abs(Math.sin(u * Math.PI * cusps)) * Math.min(ihw, archRise) * 0.08 * Math.sin(u * Math.PI);
      shape.lineTo(Math.max(0, baseX - scallop * 0.6), Math.min(innerApex, baseY + scallop * 0.35));
    }
    shape.lineTo(0, innerApex);
    for (let i = steps - 1; i >= 0; i--) {
      const u = i / steps;
      const baseX = ihw * Math.pow(1 - u, 0.88);
      const baseY = springH + archRise * Math.pow(u, 0.85);
      const scallop = Math.abs(Math.sin(u * Math.PI * cusps)) * Math.min(ihw, archRise) * 0.08 * Math.sin(u * Math.PI);
      shape.lineTo(-Math.max(0, baseX - scallop * 0.6), Math.min(innerApex, baseY + scallop * 0.35));
    }
  } else {
    shape.quadraticCurveTo(ihw * 0.68, springH + archRise * 0.72, 0, innerApex);
    shape.quadraticCurveTo(-ihw * 0.68, springH + archRise * 0.72, -ihw, springH);
  }
  shape.lineTo(-ihw, 0);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 16,
  });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Lathe-turned Dravidian Mandapam temple column with <= 42 deg flared base & capital.
 */
function createMandapaColumnGeometry(colR: number, colH: number): THREE.BufferGeometry {
  const pts = [
    new THREE.Vector2(0.001, 0),
    new THREE.Vector2(colR * 1.48, 0),
    new THREE.Vector2(colR * 1.48, colH * 0.08),
    new THREE.Vector2(colR * 1.04, colH * 0.16),
    new THREE.Vector2(colR * 0.96, colH * 0.45),
    new THREE.Vector2(colR * 1.12, colH * 0.49),
    new THREE.Vector2(colR * 0.92, colH * 0.53),
    new THREE.Vector2(colR * 0.86, colH * 0.78),
    new THREE.Vector2(colR * 1.16, colH * 0.85),
    new THREE.Vector2(colR * 1.02, colH * 0.89),
    new THREE.Vector2(colR * 1.45, colH * 0.96),
    new THREE.Vector2(colR * 1.48, colH),
    new THREE.Vector2(0.001, colH),
  ];
  const geo = new THREE.LatheGeometry(pts, 18);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpted Dravidian wall pilaster (Stambha) with stepped base, slender shaft, and lotus capital.
 */
function addCarvedPilaster(
  parent: THREE.Group,
  x: number,
  yBase: number,
  z: number,
  pilW: number,
  pilD: number,
  height: number,
  mats: GopuramMaterialSet,
  useAccentShaft = true
) {
  const baseH = height * 0.11;
  const capH = height * 0.13;
  const shaftH = height - baseH - capH;

  const baseMesh = new THREE.Mesh(
    createChamferedFrustumGeometry(pilW * 1.38, pilD + 0.014, pilW * 1.08, pilD + 0.004, baseH, 0.14),
    mats.secondary
  );
  baseMesh.position.set(x, yBase, z);
  parent.add(baseMesh);

  const shaftMesh = new THREE.Mesh(
    createChamferedFrustumGeometry(pilW, pilD, pilW * 0.94, pilD * 0.995, shaftH + 0.006, 0.14),
    useAccentShaft ? mats.accent : mats.secondary
  );
  shaftMesh.position.set(x, yBase + baseH - 0.003, z);
  parent.add(shaftMesh);

  const capMesh = new THREE.Mesh(
    createChamferedFrustumGeometry(pilW * 0.96, pilD, pilW * 1.38, pilD + 0.014, capH, 0.14),
    mats.cornice
  );
  capMesh.position.set(x, yBase + baseH + shaftH - 0.002, z);
  parent.add(capMesh);
}

/**
 * Adds a sculpted pointed-arch Devakoshta niche with crimson recess & stone frame.
 */
function addPointedDevakoshtaNiche(
  parent: THREE.Group,
  x: number,
  yBase: number,
  nicheW: number,
  nicheH: number,
  bodyDepth: number,
  mats: GopuramMaterialSet
) {
  // Deep crimson/shadow pointed arch recessed core passing cleanly front-to-back
  const innerGeo = createPointedNicheGeometry(nicheW * 0.8, nicheH * 0.92, bodyDepth + 0.022, 0.6);
  const inner = new THREE.Mesh(innerGeo, mats.nicheInterior);
  inner.position.set(x, yBase + 0.002, 0);
  parent.add(inner);

  // Raised molded arch surround
  const frameGeo = createPointedArchSurround(
    nicheW * 0.78,
    nicheW * 1.06,
    nicheH * 0.56,
    nicheH * 0.36,
    bodyDepth + 0.038,
    false
  );
  const frame = new THREE.Mesh(frameGeo, mats.secondary);
  frame.position.set(x, yBase, 0);
  parent.add(frame);

  // Subtle threshold sill
  const sill = new THREE.Mesh(
    createChamferedFrustumGeometry(nicheW * 1.1, bodyDepth + 0.044, nicheW * 1.04, bodyDepth + 0.04, 0.032, 0.12),
    mats.plinth
  );
  sill.position.set(x, yBase, 0);
  parent.add(sill);
}

/**
 * Helper to create a tagged vertical explode layer group so Viewport3D can smoothly
 * separate architectural levels for inspection while exporting solid at progress = 0.
 */
function makeLayerGroup(root: THREE.Group, layerIndex: number, name: string): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.userData.explodeLayer = layerIndex;
  root.add(g);
  return g;
}

/**
 * Builds Aditala ground storey with pointed/cusped/corbelled Vaasal gateway,
 * twin Devakoshta pointed niches, sky-blue pilasters, and optional Mandapam porch.
 */
function buildAditalaWithPortal(
  layerGroup: THREE.Group,
  width: number,
  depth: number,
  height: number,
  yBase: number,
  plinthH: number,
  params: GopuramParams,
  mats: GopuramMaterialSet
) {
  const portalW = width * params.portalScale;
  const springH = height * 0.44;
  const archRise = Math.min(height * 0.42, Math.max(height * 0.26, (portalW / 2) * 1.18));
  const portalApexH = springH + archRise;
  const lintelTopH = Math.max(0.08, height - portalApexH);
  const pierW = (width - portalW) / 2;

  // Left & Right structural piers
  const pierGeo = createChamferedFrustumGeometry(pierW, depth, pierW, depth, height, 0.03);
  const leftPier = new THREE.Mesh(pierGeo, mats.primary);
  leftPier.position.set(-(portalW / 2 + pierW / 2), yBase, 0);
  layerGroup.add(leftPier);

  const rightPier = new THREE.Mesh(pierGeo.clone(), mats.primary);
  rightPier.position.set(portalW / 2 + pierW / 2, yBase, 0);
  layerGroup.add(rightPier);

  // Recessed central passage core (gives authentic deep doorway shadow)
  const coreWallDepth = depth * 0.34;
  const innerCore = new THREE.Mesh(
    new THREE.BoxGeometry(portalW + 0.02, height, coreWallDepth),
    mats.portalVoid
  );
  innerCore.position.set(0, yBase + height / 2, 0);
  layerGroup.add(innerCore);

  // Self-supporting Vaasal arch header
  const headerStyle =
    params.portalStyle === 'corbelled' || params.portalStyle === 'stepped'
      ? 'corbelled'
      : params.portalStyle === 'cusped'
        ? 'cusped'
        : 'arched';

  const headerGeo = createSelfSupportingPortalHeader(
    portalW,
    archRise,
    lintelTopH,
    depth,
    headerStyle
  );
  const headerMesh = new THREE.Mesh(headerGeo, mats.primary);
  headerMesh.position.set(0, yBase + springH, 0);
  layerGroup.add(headerMesh);

  // Blue carved flanking jamb pilasters around Vaasal
  const jambW = Math.max(0.038, portalW * 0.11);
  const jambDepth = depth + 0.034;
  for (const sx of [-1, 1]) {
    addCarvedPilaster(
      layerGroup,
      sx * (portalW / 2 - jambW * 0.25),
      yBase,
      0,
      jambW,
      jambDepth,
      springH + 0.06,
      mats,
      true
    );
  }

  // Molded gateway arch surround + miniature Kudu keystone crest
  const archSurround = new THREE.Mesh(
    createPointedArchSurround(
      portalW * 0.96,
      portalW * 1.18,
      springH,
      archRise * 0.96,
      depth + 0.032,
      params.portalStyle === 'cusped'
    ),
    mats.secondary
  );
  archSurround.position.set(0, yBase, 0);
  layerGroup.add(archSurround);

  // Flanking piers: rhythmic pointed-arch Devakoshta niches + carved pilasters (matches .tmp_1/.tmp_2)
  const nicheCountPerPier = pierW > 0.56 ? 2 : 1;
  const nicheSpan = pierW * 0.84;
  const nicheSlotW = nicheSpan / nicheCountPerPier;
  const nicheW = Math.min(0.24, nicheSlotW * 0.64);
  const nicheH = height * 0.68;
  const pilW = Math.max(0.024, Math.min(0.044, pierW * 0.095));

  for (const side of [-1, 1]) {
    const pierCenterX = side * (portalW / 2 + pierW / 2);

    // Outer and intermediate pilasters across each pier
    const pilCount = nicheCountPerPier + 1;
    for (let p = 0; p < pilCount; p++) {
      const frac = p / (pilCount - 1) - 0.5;
      const px = pierCenterX + frac * (pierW * 0.84);
      addCarvedPilaster(layerGroup, px, yBase, 0, pilW, depth + 0.026, height * 0.94, mats, true);
    }

    // Pointed crimson Devakoshta niches between pilasters
    for (let n = 0; n < nicheCountPerPier; n++) {
      const u = (n + 0.5) / nicheCountPerPier - 0.5;
      const nx = pierCenterX + u * (pierW * 0.84);
      addPointedDevakoshtaNiche(
        layerGroup,
        nx,
        yBase + height * 0.06,
        nicheW,
        nicheH,
        depth,
        mats
      );
    }
  }

  // Side-wall pilasters & central side pointed niche (-X and +X faces)
  const sideBays = Math.max(2, Math.floor(depth / 0.28));
  for (let s = 0; s < sideBays; s++) {
    const u = sideBays === 1 ? 0 : (s / (sideBays - 1) - 0.5) * 0.74;
    const pz = u * depth;
    const sPil = new THREE.Mesh(
      createChamferedFrustumGeometry(width + 0.03, pilW, width + 0.024, pilW * 0.92, height * 0.94, 0.14),
      mats.accent
    );
    sPil.position.set(0, yBase, pz);
    layerGroup.add(sPil);
  }
  const sideNiche = new THREE.Mesh(
    createPointedNicheGeometry(depth * 0.28, height * 0.64, width + 0.024, 0.62),
    mats.nicheInterior
  );
  sideNiche.rotation.y = Math.PI / 2;
  sideNiche.position.set(0, yBase + height * 0.08, 0);
  layerGroup.add(sideNiche);

  // Support-free Front Mandapa Entrance Porch (matching .tmp_1.webp!)
  if (params.hasMandapam) {
    const porchD = depth * 0.42;
    const porchW = Math.max(portalW * 1.56, width * 0.56);
    const colR = Math.max(0.028, porchW * 0.052);
    const colH = springH * 1.12;
    const porchFloorY = yBase - plinthH;
    const porchFrontZ = depth / 2 + porchD * 1.08;
    const porchBackZ = depth * 0.34;
    const porchSpanD = porchFrontZ - porchBackZ;
    const porchCenterZ = (porchFrontZ + porchBackZ) / 2;

    // Stepped Mandapam porch plinth rising solidly from courtyard/ground
    const porchLowerH = plinthH * 0.56;
    const porchUpperH = plinthH * 0.44;
    const porchPlinthLower = new THREE.Mesh(
      createChamferedFrustumGeometry(
        porchW * 1.14,
        porchSpanD + 0.06,
        porchW * 1.1,
        porchSpanD + 0.02,
        porchLowerH,
        0.04
      ),
      mats.plinth
    );
    porchPlinthLower.position.set(0, porchFloorY, porchCenterZ);
    layerGroup.add(porchPlinthLower);

    const porchPlinthUpper = new THREE.Mesh(
      createChamferedFrustumGeometry(
        porchW * 1.1,
        porchSpanD + 0.02,
        porchW * 1.06,
        porchSpanD,
        porchUpperH + 0.006,
        0.04
      ),
      mats.secondary
    );
    porchPlinthUpper.position.set(0, porchFloorY + porchLowerH, porchCenterZ);
    layerGroup.add(porchPlinthUpper);

    // Front approach Sopana stairs descending cleanly to ground/courtyard
    const porchStairW = porchW * 0.52;
    const stairCount = 3;
    for (let s = 0; s < stairCount; s++) {
      const sH = plinthH / stairCount;
      const sD = 0.08 * (stairCount - s);
      const extraH = s === 0 ? 0 : 0.004;
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(porchStairW, sH + extraH, sD),
        mats.plinth
      );
      step.position.set(0, porchFloorY + sH * (s + 0.5) - extraH / 2, porchFrontZ + sD / 2 - 0.02);
      layerGroup.add(step);
    }

    // 4 Smooth Lathe-Turned Mandapa Columns (sky-blue accent shafts + stone capitals)
    const colZ = depth / 2 + porchD * 0.84;
    const outerX = porchW * 0.43;
    const innerX = porchW * 0.19;
    const colPositions = [
      [-outerX, colZ],
      [outerX, colZ],
      [-innerX, colZ],
      [innerX, colZ],
    ];
    const colGeo = createMandapaColumnGeometry(colR, colH + 0.01);
    for (const [cx, cz] of colPositions) {
      const col = new THREE.Mesh(colGeo, mats.accent);
      col.position.set(cx, yBase - 0.004, cz);
      layerGroup.add(col);
    }

    // Side & center self-supporting 42-deg arched beams returning cleanly to Aditala wall
    const beamH = Math.max(0.18, porchD * 0.66);
    const beamWidth = colR * 2.55;
    const beamGeo = createSelfSupportingPortalHeader(
      porchD * 0.9,
      beamH * 0.72,
      beamH * 0.28,
      beamWidth,
      'arched'
    );
    for (const bx of [-outerX, -innerX, innerX, outerX]) {
      const sideBeam = new THREE.Mesh(beamGeo, mats.primary);
      sideBeam.rotation.y = Math.PI / 2;
      sideBeam.position.set(bx, yBase + colH - 0.005, depth / 2 + porchD * 0.44);
      layerGroup.add(sideBeam);
    }

    // Front 3 pointed-arch bays across Mandapam porch
    const frontArchW = innerX * 2;
    const frontArchRise = Math.max(0.13, (frontArchW / 2) * 1.15);
    const frontHeader = new THREE.Mesh(
      createSelfSupportingPortalHeader(
        frontArchW,
        frontArchRise,
        Math.max(0.06, beamH - frontArchRise),
        colR * 2.75,
        'arched'
      ),
      mats.primary
    );
    frontHeader.position.set(0, yBase + colH - 0.005, colZ);
    layerGroup.add(frontHeader);

    const wingSpan = outerX - innerX;
    const wingArchGeo = createSelfSupportingPortalHeader(
      wingSpan + 0.02,
      Math.max(0.09, wingSpan * 0.85),
      Math.max(0.06, beamH - wingSpan * 0.85),
      colR * 2.75,
      'arched'
    );
    for (const sx of [-1, 1]) {
      const wing = new THREE.Mesh(wingArchGeo, mats.primary);
      wing.position.set(sx * ((outerX + innerX) / 2), yBase + colH - 0.005, colZ);
      layerGroup.add(wing);
    }

    // Solid Mandapam porch roof ceiling slab so Kapota & parapet sit on continuous masonry
    const porchRoofTopY = yBase + colH + beamH;
    const porchCorniceH = 0.085;
    const porchSpan = porchD * 0.94;
    const porchRoofSlab = new THREE.Mesh(
      createChamferedFrustumGeometry(porchW * 0.94, porchSpan * 0.96, porchW * 0.92, porchSpan * 0.92, 0.04, 0.06),
      mats.primary
    );
    porchRoofSlab.position.set(0, porchRoofTopY - 0.036, depth / 2 + porchD * 0.45);
    layerGroup.add(porchRoofSlab);

    const porchKapota = new THREE.Mesh(
      createSmoothKapotaCornice(porchW * 0.96, porchSpan, 0.05, porchCorniceH),
      mats.cornice
    );
    porchKapota.position.set(0, porchRoofTopY - 0.008, depth / 2 + porchD * 0.45);
    layerGroup.add(porchKapota);

    const parapetY = porchRoofTopY + porchCorniceH - 0.014;
    const parapetShala = new THREE.Mesh(
      createChamferedFrustumGeometry(porchW * 0.36, porchSpan * 0.56, porchW * 0.3, porchSpan * 0.44, 0.085, 0.1),
      mats.roof
    );
    parapetShala.position.set(0, parapetY, depth / 2 + porchD * 0.58);
    layerGroup.add(parapetShala);

    for (const sx of [-1, 1]) {
      const cornerKuta = new THREE.Mesh(
        createSmoothCupolaDomeGeometry(porchW * 0.16, porchW * 0.16, 0.075, 16, 3.0),
        mats.roof
      );
      cornerKuta.position.set(sx * (porchW * 0.36), parapetY, depth / 2 + porchD * 0.65);
      layerGroup.add(cornerKuta);
    }
  }
}

/**
 * Builds a single Diminishing Tala (storey) where the structural core & upper terrace deck
 * span continuously up to yBase + h + 0.016 to directly support the next tier (or Griva),
 * while decorative Kuta / Shala / Panjara Haram pavilions sit strictly on the outer cornice ledge
 * and never carry structural load above them.
 */
function buildTalaTier(
  layerGroup: THREE.Group,
  tierIndex: number,
  totalTiers: number,
  w: number,
  d: number,
  nextW: number,
  nextD: number,
  h: number,
  yBase: number,
  params: GopuramParams,
  mats: GopuramMaterialSet
): number {
  const wallH = h * 0.46;
  const corniceH = h * 0.24;
  const haramH = h * 0.26; // Kept strictly within yBase + h so next tier seats on terraceCore, never on ornaments

  // 1. Recessed chamfered tier masonry core (overlapping 0.012 into previous tier deck)
  const core = new THREE.Mesh(
    createChamferedFrustumGeometry(w * 0.95, d * 0.95, w * 0.93, d * 0.93, wallH + 0.026, 0.04),
    mats.primary
  );
  core.position.set(0, yBase - 0.012, 0);
  layerGroup.add(core);

  // 2. Central vertical Kudu spine opening (prominent arched window up the center axis on front/back)
  const centerKuduW = Math.min(w * 0.16, Math.max(0.08, w * 0.13));
  const centerKuduH = wallH * 1.18;
  const centerKuduArch = new THREE.Mesh(
    createPointedNicheGeometry(centerKuduW, centerKuduH * 0.86, d * 0.98 + 0.032, 0.56),
    mats.portalVoid
  );
  centerKuduArch.position.set(0, yBase + 0.01, 0);
  layerGroup.add(centerKuduArch);

  const centerKuduRim = new THREE.Mesh(
    createPointedArchSurround(
      centerKuduW * 0.88,
      centerKuduW * 1.38,
      centerKuduH * 0.48,
      centerKuduH * 0.44,
      d * 0.98 + 0.022,
      false
    ),
    mats.cornice
  );
  centerKuduRim.position.set(0, yBase, 0);
  layerGroup.add(centerKuduRim);

  // 3. Slim sky-blue pilasters + flanking arched slit windows along the wall band
  const bayCount = Math.max(2, Math.min(params.shrineDensity + 1, Math.floor((w * 0.42) / 0.14)));
  const pilW = Math.max(0.018, Math.min(0.034, w * 0.024));
  const pilD = d * 0.96 + 0.016;
  for (const side of [-1, 1]) {
    for (let b = 0; b < bayCount; b++) {
      const frac = (b + 0.5) / bayCount;
      const px = side * (centerKuduW * 0.85 + frac * (w * 0.45 - centerKuduW * 0.85));
      const pil = new THREE.Mesh(
        createChamferedFrustumGeometry(pilW, pilD, pilW * 0.94, pilD * 0.995, wallH, 0.14),
        mats.accent
      );
      pil.position.set(px, yBase, 0);
      layerGroup.add(pil);

      if (b < bayCount - 1) {
        const nextFrac = (b + 1.0) / bayCount;
        const wx = side * (centerKuduW * 0.85 + nextFrac * (w * 0.45 - centerKuduW * 0.85));
        const win = new THREE.Mesh(
          createPointedNicheGeometry(pilW * 1.4, wallH * 0.7, pilD + 0.008, 0.56),
          mats.nicheInterior
        );
        win.position.set(wx, yBase + wallH * 0.08, 0);
        layerGroup.add(win);
      }
    }
  }

  // 4. Strictly <= 42-deg crimson Kapota Cornice shelf
  const corniceY = yBase + wallH;
  const desiredProj = params.corniceProjection * (1 - (tierIndex / Math.max(1, totalTiers)) * 0.35);
  const kapota = new THREE.Mesh(
    createSmoothKapotaCornice(w * 0.95, d * 0.95, desiredProj, corniceH),
    mats.cornice
  );
  kapota.position.set(0, corniceY, 0);
  layerGroup.add(kapota);

  // 5. Continuous structural upper terrace core connecting Tier i directly to Tier i+1 (or Griva)
  // Spans from inside Kapota up to yBase + h + 0.016 so the next tier rests 100% on solid masonry,
  // never floating on decorative Haram pavilions.
  const haramY = corniceY + corniceH - 0.008;
  const terraceH = (yBase + h + 0.016) - (corniceY + corniceH * 0.5);
  const terraceBotW = Math.max(w * 0.88, nextW * 0.98);
  const terraceBotD = Math.max(d * 0.88, nextD * 0.98);
  const terraceTopW = Math.max(w * 0.8, nextW * 0.97);
  const terraceTopD = Math.max(d * 0.8, nextD * 0.97);
  const terraceCore = new THREE.Mesh(
    createChamferedFrustumGeometry(
      terraceBotW,
      terraceBotD,
      terraceTopW,
      terraceTopD,
      terraceH,
      0.04
    ),
    mats.primary
  );
  terraceCore.position.set(0, corniceY + corniceH * 0.5, 0);
  layerGroup.add(terraceCore);

  // 6. Decorative Haram pavilions (corner Kutas + center Shala + Panjaras) seated on the outer cornice ledge
  const kutaSize = Math.min(w, d) * 0.19;
  const kx = w * 0.48 - kutaSize * 0.44;
  const kz = d * 0.48 - kutaSize * 0.44;

  // Corner Kutas
  const kutaBaseGeo = createChamferedFrustumGeometry(kutaSize, kutaSize, kutaSize * 0.94, kutaSize * 0.94, haramH * 0.55, 0.12);
  const kutaDomeGeo = createSmoothCupolaDomeGeometry(kutaSize * 0.98, kutaSize * 0.98, haramH * 0.52, 16, 3.2);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const kb = new THREE.Mesh(kutaBaseGeo, mats.secondary);
      kb.position.set(sx * kx, haramY, sz * kz);
      layerGroup.add(kb);

      const kd = new THREE.Mesh(kutaDomeGeo, mats.roof);
      kd.position.set(sx * kx, haramY + haramH * 0.5, sz * kz);
      layerGroup.add(kd);
    }
  }

  // Center Shala pavilion (split slightly or flanking the central Kudu spine)
  const shalaW = Math.max(kutaSize * 1.18, w * 0.24);
  const shalaD = d * 0.98 + 0.026;
  const shalaBody = new THREE.Mesh(
    createChamferedFrustumGeometry(shalaW, shalaD, shalaW * 0.95, shalaD * 0.97, haramH * 0.55, 0.08),
    mats.secondary
  );
  shalaBody.position.set(0, haramY, 0);
  layerGroup.add(shalaBody);

  const shalaRoofData = createSalaRoofGeometry(shalaW * 0.92, d * 0.22, haramH * 0.52);
  for (const sz of [-1, 1]) {
    const shalaRoof = new THREE.Mesh(shalaRoofData.geometry, mats.roof);
    shalaRoof.position.set(0, haramY + haramH * 0.5, sz * (d * 0.48 - d * 0.08));
    layerGroup.add(shalaRoof);
  }

  // Central Kudu crest protruding gently above the cornice on the front/back axis
  if (params.kuduDetail) {
    const kuduCrest = new THREE.Mesh(
      createKuduArchGeometry(centerKuduW * 1.32, haramH * 0.96, d * 0.98 + 0.044),
      mats.cornice
    );
    kuduCrest.position.set(0, haramY, 0);
    layerGroup.add(kuduCrest);

    const kuduHole = new THREE.Mesh(
      createPointedNicheGeometry(centerKuduW * 0.74, haramH * 0.62, d * 0.98 + 0.05, 0.52),
      mats.portalVoid
    );
    kuduHole.position.set(0, haramY + 0.01, 0);
    layerGroup.add(kuduHole);
  }

  // Intermediate Panjara mini-pavilions between center Shala and corner Kutas (spaced cleanly!)
  const spanBetween = kx - kutaSize * 0.58 - shalaW * 0.55;
  if (spanBetween > 0.06) {
    const pCount = Math.max(1, Math.min(3, Math.floor(spanBetween / 0.14)));
    const pW = Math.min(kutaSize * 0.72, (spanBetween / pCount) * 0.66);
    const pD = d * 0.98 + 0.016;
    for (const side of [-1, 1]) {
      for (let p = 0; p < pCount; p++) {
        const frac = pCount === 1 ? 0.5 : (p + 0.5) / pCount;
        const px = side * (shalaW * 0.55 + frac * spanBetween);
        const pb = new THREE.Mesh(
          createChamferedFrustumGeometry(pW, pD, pW * 0.94, pD * 0.97, haramH * 0.48, 0.12),
          mats.secondary
        );
        pb.position.set(px, haramY, 0);
        layerGroup.add(pb);

        const pCap = new THREE.Mesh(
          createChamferedFrustumGeometry(pW * 0.96, pD * 0.98, pW * 0.72, pD * 0.88, haramH * 0.42, 0.15),
          mats.roof
        );
        pCap.position.set(px, haramY + haramH * 0.46, 0);
        layerGroup.add(pCap);
      }
    }
  }

  // Side Panjara mini-pavilions on left & right walls
  if (d > 0.46) {
    const sW = w * 0.98 + 0.018;
    const sD = Math.min(d * 0.24, shalaW * 0.65);
    const sb = new THREE.Mesh(
      createChamferedFrustumGeometry(sW, sD, sW * 0.97, sD * 0.94, haramH * 0.5, 0.1),
      mats.secondary
    );
    sb.position.set(0, haramY, 0);
    layerGroup.add(sb);

    const sCap = new THREE.Mesh(
      createChamferedFrustumGeometry(sW * 0.98, sD * 0.95, sW * 0.9, sD * 0.72, haramH * 0.42, 0.12),
      mats.roof
    );
    sCap.position.set(0, haramY + haramH * 0.48, 0);
    layerGroup.add(sCap);
  }

  return yBase + h;
}

/**
 * Builds the Sanctum Mandir (Vimana) matching .tmp_3.webp:
 * wide scalloped Makhara-Torana entrance arch, Garbhagriha altar inside,
 * twin front guard lamp pillars, corner round columns, sloped crimson Kapota eave,
 * upper mini-tala parapet rows, bulbous dome with 4 cardinal Kudus, and tall Kalasam.
 */
function buildVimanaShrine(
  root: THREE.Group,
  params: GopuramParams,
  mats: GopuramMaterialSet
) {
  const baseSize = 1.48;
  const plinthH = 0.28;
  const plinthLayer = makeLayerGroup(root, 0, 'layer_plinth');

  // Stepped square Adhishthanam plinth grounded at y = 0
  const p1 = new THREE.Mesh(
    createChamferedFrustumGeometry(baseSize * 1.12, baseSize * 1.12, baseSize * 1.07, baseSize * 1.07, plinthH * 0.55, 0.04),
    mats.plinth
  );
  plinthLayer.add(p1);

  const p2 = new THREE.Mesh(
    createChamferedFrustumGeometry(baseSize * 1.07, baseSize * 1.07, baseSize * 1.01, baseSize * 1.01, plinthH * 0.45, 0.04),
    mats.secondary
  );
  p2.position.set(0, plinthH * 0.55, 0);
  plinthLayer.add(p2);

  // Front wide Sopana steps descending to y = 0
  const stairW = baseSize * 0.74;
  for (let s = 0; s < 3; s++) {
    const sH = plinthH / 3;
    const sD = 0.095 * (3 - s);
    const extraH = s === 0 ? 0 : 0.004;
    const step = new THREE.Mesh(new THREE.BoxGeometry(stairW, sH + extraH, sD), mats.plinth);
    step.position.set(0, sH * (s + 0.5) - extraH / 2, baseSize * 0.52 + sD / 2);
    plinthLayer.add(step);
  }

  // Twin front corner Dvarapala / Deepa-stambha stone pedestals grounded on front steps/plinth
  for (const sx of [-1, 1]) {
    const pedX = sx * (stairW * 0.58);
    const pedZ = baseSize * 0.54 + 0.08;
    const pedH = plinthH + 0.14;
    const ped = new THREE.Mesh(
      createChamferedFrustumGeometry(0.14, 0.14, 0.125, 0.125, pedH, 0.12),
      mats.secondary
    );
    ped.position.set(pedX, 0, pedZ);
    plinthLayer.add(ped);

    const pedCap = new THREE.Mesh(
      createSmoothCupolaDomeGeometry(0.135, 0.135, 0.085, 16, 2.8),
      mats.roof
    );
    pedCap.position.set(pedX, pedH - 0.005, pedZ);
    plinthLayer.add(pedCap);

    const pedKalasam = new THREE.Mesh(createKalasamGeometry(0.065, 0.02), mats.finial);
    pedKalasam.position.set(pedX, pedH + 0.072, pedZ);
    plinthLayer.add(pedKalasam);
  }

  // Aditala Sanctum Hall (Hollow Front Cusped Torana Arch + Garbhagriha Interior)
  const sanctumLayer = makeLayerGroup(root, 1, 'layer_sanctum');
  let curY = plinthH;
  const hallH = 0.88 * params.heightMultiplier;
  const wallT = 0.14;
  const hallW = baseSize * 0.98;
  const hallD = baseSize * 0.98;

  // Back wall
  const backWall = new THREE.Mesh(
    createChamferedFrustumGeometry(hallW, wallT, hallW, wallT, hallH, 0.04),
    mats.primary
  );
  backWall.position.set(0, curY, -hallD / 2 + wallT / 2);
  sanctumLayer.add(backWall);

  // Left & Right side walls with pointed crimson Devakoshta niches + blue pilasters
  for (const sx of [-1, 1]) {
    const sw = new THREE.Mesh(
      createChamferedFrustumGeometry(wallT, hallD, wallT, hallD, hallH, 0.04),
      mats.primary
    );
    sw.position.set(sx * (hallW / 2 - wallT / 2), curY, 0);
    sanctumLayer.add(sw);

    // Side pointed arch crimson niche
    const sNiche = new THREE.Mesh(
      createPointedNicheGeometry(hallD * 0.34, hallH * 0.64, wallT + 0.032, 0.6),
      mats.nicheInterior
    );
    sNiche.rotation.y = Math.PI / 2;
    sNiche.position.set(sx * (hallW / 2 - wallT / 2), curY + hallH * 0.08, 0);
    sanctumLayer.add(sNiche);

    // Flanking side pilasters
    for (const sz of [-1, 1]) {
      addCarvedPilaster(
        sanctumLayer,
        sx * (hallW / 2 - wallT * 0.3),
        curY,
        sz * (hallD * 0.25),
        0.042,
        wallT + 0.025,
        hallH * 0.94,
        mats,
        true
      );
    }
  }

  // Inner Sanctum Floor & Raised Peetham Altar Pedestal inside
  const innerFloor = new THREE.Mesh(
    createChamferedFrustumGeometry(hallW * 0.66, hallD * 0.66, hallW * 0.62, hallD * 0.62, 0.055, 0.06),
    mats.secondary
  );
  innerFloor.position.set(0, curY, -0.04);
  sanctumLayer.add(innerFloor);

  const peetham = new THREE.Mesh(
    createChamferedFrustumGeometry(0.32, 0.28, 0.28, 0.24, 0.14, 0.1),
    mats.roof
  );
  peetham.position.set(0, curY + 0.05, -hallD * 0.2);
  sanctumLayer.add(peetham);

  // Front Wide Cusped Torana Arch + 4 Sculpted Columns
  const openingW = hallW * 0.56;
  const springH = hallH * 0.44;
  const archRise = hallH * 0.38;
  const lintelTopH = hallH - springH - archRise;
  const frontPierW = (hallW - openingW) / 2;

  for (const sx of [-1, 1]) {
    const fPier = new THREE.Mesh(
      createChamferedFrustumGeometry(frontPierW, wallT, frontPierW, wallT, hallH, 0.04),
      mats.primary
    );
    fPier.position.set(sx * (openingW / 2 + frontPierW / 2), curY, hallD / 2 - wallT / 2);
    sanctumLayer.add(fPier);
  }

  const cuspedHeader = new THREE.Mesh(
    createSelfSupportingPortalHeader(openingW, archRise, lintelTopH, wallT, 'cusped'),
    mats.primary
  );
  cuspedHeader.position.set(0, curY + springH, hallD / 2 - wallT / 2);
  sanctumLayer.add(cuspedHeader);

  // Molded scalloped arch frame + golden Torana crest above opening
  const toranaSurround = new THREE.Mesh(
    createPointedArchSurround(openingW * 0.96, openingW * 1.14, springH, archRise * 0.96, wallT + 0.032, true),
    mats.secondary
  );
  toranaSurround.position.set(0, curY, hallD / 2 - wallT / 2);
  sanctumLayer.add(toranaSurround);

  const crestMedallion = new THREE.Mesh(
    createKuduArchGeometry(0.14, 0.11, 0.06),
    mats.finial
  );
  crestMedallion.position.set(0, curY + springH + archRise + 0.01, hallD / 2 + 0.012);
  sanctumLayer.add(crestMedallion);

  // Front corner fluted columns + inner guard pillars (matches .tmp_3.webp!)
  const cornerColGeo = createMandapaColumnGeometry(0.065, hallH * 0.96);
  for (const sx of [-1, 1]) {
    const cornerCol = new THREE.Mesh(cornerColGeo, mats.secondary);
    cornerCol.position.set(sx * (hallW * 0.46), curY - 0.004, hallD * 0.46);
    sanctumLayer.add(cornerCol);

    // Inner small red-banded guard pillar right inside porch entrance
    const innerPost = new THREE.Mesh(
      createChamferedFrustumGeometry(0.056, 0.056, 0.05, 0.05, springH * 0.85, 0.12),
      mats.primary
    );
    innerPost.position.set(sx * (openingW * 0.46), curY, hallD * 0.47);
    sanctumLayer.add(innerPost);

    const postBand = new THREE.Mesh(
      new THREE.BoxGeometry(0.064, 0.032, 0.064),
      mats.cornice
    );
    postBand.position.set(sx * (openingW * 0.46), curY + springH * 0.65, hallD * 0.47);
    sanctumLayer.add(postBand);

    const postCap = new THREE.Mesh(createKalasamGeometry(0.052, 0.018), mats.finial);
    postCap.position.set(sx * (openingW * 0.46), curY + springH * 0.85, hallD * 0.47);
    sanctumLayer.add(postCap);
  }

  curY += hallH;

  // Wide Crimson Kapota Eave & Parapet Roof Deck
  const eaveH = 0.14;
  const eave = new THREE.Mesh(
    createSmoothKapotaCornice(hallW * 0.98, hallD * 0.98, 0.11, eaveH),
    mats.cornice
  );
  eave.position.set(0, curY, 0);
  sanctumLayer.add(eave);

  // Solid roof slab bridging interior cleanly
  const roofDeck = new THREE.Mesh(
    createChamferedFrustumGeometry(hallW * 0.94, hallD * 0.94, hallW * 0.9, hallD * 0.9, eaveH, 0.06),
    mats.primary
  );
  roofDeck.position.set(0, curY, 0);
  sanctumLayer.add(roofDeck);
  curY += eaveH;

  // Diminishing Upper Talas (2 to 4 stepped tiers with solid structural terrace connections)
  const upperTiers = Math.max(2, Math.min(4, params.tiers - 2));
  const vimanaDims = Array.from({ length: upperTiers }, (_, i) => {
    const t = upperTiers === 1 ? 0 : i / (upperTiers - 1);
    const tierW = THREE.MathUtils.lerp(hallW * 0.88, hallW * 0.48, Math.pow(t, 0.85));
    const tierH = 0.22 * (1 - t * 0.22) * params.heightMultiplier;
    return { tierW, tierH };
  });
  let topSize = vimanaDims[vimanaDims.length - 1]?.tierW ?? hallW * 0.88;
  const vimanaGrivaW = topSize * 0.74;

  for (let i = 0; i < upperTiers; i++) {
    const tierLayer = makeLayerGroup(root, 2 + i, `layer_tala_${i}`);
    const { tierW, tierH } = vimanaDims[i];
    const nextSize = i < upperTiers - 1 ? vimanaDims[i + 1].tierW : vimanaGrivaW;
    curY = buildTalaTier(
      tierLayer,
      i,
      upperTiers,
      tierW,
      tierW,
      nextSize,
      nextSize,
      tierH,
      curY,
      params,
      mats
    );
  }

  // Griva Neck + Bulbous Vimana Cupola Dome + 4 Cardinal Kudus + Tall Kalasam
  const crownLayer = makeLayerGroup(root, 2 + upperTiers, 'layer_crown');
  const grivaH = 0.11 * params.heightMultiplier;
  const grivaW = vimanaGrivaW;
  const griva = new THREE.Mesh(
    createChamferedFrustumGeometry(grivaW, grivaW, grivaW, grivaW, grivaH + 0.024, 0.08),
    mats.primary
  );
  griva.position.set(0, curY - 0.012, 0);
  crownLayer.add(griva);
  curY += grivaH;

  const domeBase = grivaW * 1.18;
  const neckFlareH = Math.max(0.05, ((domeBase - grivaW) / 2) / MAX_OVERHANG_RATIO);
  const neckFlare = new THREE.Mesh(
    createChamferedFrustumGeometry(grivaW, grivaW, domeBase, domeBase, neckFlareH, 0.14),
    mats.cornice
  );
  neckFlare.position.set(0, curY - 0.005, 0);
  crownLayer.add(neckFlare);
  curY += neckFlareH - 0.005;

  const domeH = topSize * 0.68 * params.heightMultiplier;
  const superPower = params.style === 'chola' ? 2.2 : 3.2;
  const dome = new THREE.Mesh(
    createSmoothCupolaDomeGeometry(domeBase, domeBase, domeH, 32, superPower),
    mats.roof
  );
  dome.position.set(0, curY - 0.006, 0);
  crownLayer.add(dome);

  // Four cardinal Kudu dormer arches seated on the dome base
  if (params.kuduDetail) {
    const kGeo = createKuduArchGeometry(domeBase * 0.28, domeH * 0.42, 0.045);
    const offset = domeBase * 0.46;
    const dirs: [number, number, number][] = [
      [0, offset, 0],
      [0, -offset, Math.PI],
      [offset, 0, Math.PI / 2],
      [-offset, 0, -Math.PI / 2],
    ];
    for (const [kx, kz, rotY] of dirs) {
      const kMesh = new THREE.Mesh(kGeo, mats.cornice);
      kMesh.rotation.y = rotY;
      kMesh.position.set(kx, curY + 0.01, kz);
      crownLayer.add(kMesh);
    }
  }

  // Kalasam Layer
  const kalasamLayer = makeLayerGroup(root, 3 + upperTiers, 'layer_kalasam');
  const kH = 0.34 * params.heightMultiplier;
  const kR = Math.max(0.048, grivaW * 0.13);
  const stupikaH = 0.055;
  const stupika = new THREE.Mesh(
    new THREE.CylinderGeometry(kR * 1.35, kR * 1.75, stupikaH, 24),
    mats.cornice
  );
  stupika.position.set(0, curY + domeH * 0.94, 0);
  kalasamLayer.add(stupika);

  const kalasam = new THREE.Mesh(createKalasamGeometry(kH, kR), mats.finial);
  kalasam.position.set(0, curY + domeH * 0.94 + stupikaH * 0.45, 0);
  kalasamLayer.add(kalasam);
}

/**
 * Builds the upright Temple Wall Relief Plaque matching .tmp_4.webp:
 * beveled dark wood/bronze frame with studded border & 4 corner lotus medallions,
 * top Kudu arch frieze, flanking studded pilasters, baluster railing, and
 * 3 cusped-arch sanctum shrines inside.
 */
function buildWallRelief(
  root: THREE.Group,
  params: GopuramParams,
  mats: GopuramMaterialSet
) {
  const frameW = 2.15 * Math.max(0.88, Math.min(1.18, params.baseWidthRatio * 0.65));
  const frameH = 1.65 * Math.max(0.88, Math.min(1.18, params.heightMultiplier));
  const frameD = 0.24;

  const baseLayer = makeLayerGroup(root, 0, 'layer_plaque_frame');

  // Solid upright backing slab grounded flush at y = 0
  const backSlab = new THREE.Mesh(
    createChamferedFrustumGeometry(frameW, frameD, frameW, frameD, frameH, 0.02),
    mats.portalVoid
  );
  backSlab.position.set(0, 0, -frameD * 0.2);
  baseLayer.add(backSlab);

  // Perimeter relief frame rails (bottom, top, left, right) protruding cleanly forward with <= 42 deg underside slope
  const borderT = 0.13;
  const borderZ = frameD * 0.24;
  const borderD = frameD * 0.36;

  const botRail = new THREE.Mesh(
    createChamferedFrustumGeometry(frameW, borderD, frameW, borderD, borderT, 0.02),
    mats.portalVoid
  );
  botRail.position.set(0, 0, borderZ);
  baseLayer.add(botRail);

  const topRail = new THREE.Mesh(
    createChamferedFrustumGeometry(frameW, borderD * 0.4, frameW, borderD, borderT, 0.02),
    mats.portalVoid
  );
  topRail.position.set(0, frameH - borderT, borderZ - borderD * 0.12);
  baseLayer.add(topRail);

  for (const sx of [-1, 1]) {
    const sideRail = new THREE.Mesh(
      createChamferedFrustumGeometry(borderT, borderD, borderT, borderD, frameH, 0.02),
      mats.portalVoid
    );
    sideRail.position.set(sx * (frameW / 2 - borderT / 2), 0, borderZ);
    baseLayer.add(sideRail);
  }

  // Beaded crimson/gold perimeter studs & 4 raised gold corner medallions (radius < borderT/2 so minY = 0.0000)
  const medGeo = new THREE.CylinderGeometry(0.052, 0.058, 0.032, 20);
  medGeo.rotateX(Math.PI / 2);
  for (const sx of [-1, 1]) {
    for (const sy of [borderT / 2, frameH - borderT / 2]) {
      const med = new THREE.Mesh(medGeo, mats.finial);
      med.position.set(sx * (frameW / 2 - borderT / 2), sy, borderZ + borderD * 0.48);
      baseLayer.add(med);
    }
  }

  const beadGeo = new THREE.SphereGeometry(0.015, 10, 8);
  const hBeads = 14;
  for (let i = 1; i < hBeads; i++) {
    const bx = THREE.MathUtils.lerp(-frameW / 2 + borderT * 1.1, frameW / 2 - borderT * 1.1, i / hBeads);
    for (const by of [borderT / 2, frameH - borderT / 2]) {
      const b = new THREE.Mesh(beadGeo, mats.cornice);
      b.position.set(bx, by, borderZ + borderD * 0.48);
      baseLayer.add(b);
    }
  }
  const vBeads = 10;
  for (let i = 1; i < vBeads; i++) {
    const by = THREE.MathUtils.lerp(borderT * 1.1, frameH - borderT * 1.1, i / vBeads);
    for (const sx of [-1, 1]) {
      const b = new THREE.Mesh(beadGeo, mats.cornice);
      b.position.set(sx * (frameW / 2 - borderT / 2), by, borderZ + borderD * 0.48);
      baseLayer.add(b);
    }
  }

  // Interior Gallery Layer
  const innerLayer = makeLayerGroup(root, 1, 'layer_plaque_shrines');
  const innerW = frameW - borderT * 2;
  const innerBotY = borderT;
  const innerTopY = frameH - borderT;
  const frontZ = frameD * 0.14;

  // Flanking wide pilasters studded with gold lotus medallions
  const pilW = innerW * 0.11;
  const pilH = innerTopY - innerBotY - 0.16;
  for (const sx of [-1, 1]) {
    const px = sx * (innerW / 2 - pilW * 0.55);
    const pil = new THREE.Mesh(
      createChamferedFrustumGeometry(pilW, 0.08, pilW * 0.96, 0.08, pilH, 0.08),
      mats.primary
    );
    pil.position.set(px, innerBotY, frontZ + 0.02);
    innerLayer.add(pil);

    const pBase = new THREE.Mesh(
      createChamferedFrustumGeometry(pilW * 1.25, 0.1, pilW * 1.05, 0.09, 0.08, 0.1),
      mats.cornice
    );
    pBase.position.set(px, innerBotY, frontZ + 0.02);
    innerLayer.add(pBase);

    const pCap = new THREE.Mesh(
      createChamferedFrustumGeometry(pilW * 1.05, 0.09, pilW * 1.35, 0.11, 0.075, 0.1),
      mats.cornice
    );
    pCap.position.set(px, innerBotY + pilH - 0.075, frontZ + 0.02);
    innerLayer.add(pCap);

    // 5 vertical gold medallions along pilaster face
    const dotGeo = new THREE.CylinderGeometry(pilW * 0.24, pilW * 0.26, 0.025, 16);
    dotGeo.rotateX(Math.PI / 2);
    for (let d = 0; d < 5; d++) {
      const dy = innerBotY + 0.16 + (d / 4) * (pilH - 0.34);
      const dot = new THREE.Mesh(dotGeo, mats.finial);
      dot.position.set(px, dy, frontZ + 0.065);
      innerLayer.add(dot);
    }
  }

  // Top Kudu Arch Frieze above pilasters (<= 42 deg underside slope)
  const friezeY = innerTopY - 0.16;
  const friezeBeam = new THREE.Mesh(
    createChamferedFrustumGeometry(innerW, 0.04, innerW, 0.095, 0.045, 0.04),
    mats.cornice
  );
  friezeBeam.position.set(0, friezeY + 0.115, frontZ + 0.02);
  innerLayer.add(friezeBeam);

  const friezeBottom = new THREE.Mesh(
    createChamferedFrustumGeometry(innerW, 0.04, innerW, 0.09, 0.038, 0.04),
    mats.cornice
  );
  friezeBottom.position.set(0, friezeY - 0.018, frontZ + 0.02);
  innerLayer.add(friezeBottom);

  const kuduCount = 12;
  const kuduW = (innerW * 0.92) / kuduCount;
  const fKuduGeo = createKuduArchGeometry(kuduW * 0.84, 0.11, 0.055);
  for (let k = 0; k < kuduCount; k++) {
    const kx = THREE.MathUtils.lerp(-innerW * 0.44, innerW * 0.44, k / (kuduCount - 1));
    const fk = new THREE.Mesh(fKuduGeo, mats.accent);
    fk.position.set(kx, friezeY + 0.015, frontZ + 0.032);
    innerLayer.add(fk);

    const kBall = new THREE.Mesh(new THREE.SphereGeometry(0.017, 10, 8), mats.finial);
    kBall.position.set(kx, friezeY + 0.125, frontZ + 0.052);
    innerLayer.add(kBall);
  }

  // Lower Sill + Baluster Railing across gallery (<= 42 deg underside slope)
  const sillY = innerBotY + 0.16;
  const lowerBand = new THREE.Mesh(
    new THREE.BoxGeometry(innerW * 0.8, 0.14, 0.075),
    mats.primary
  );
  lowerBand.position.set(0, innerBotY + 0.07, frontZ + 0.015);
  innerLayer.add(lowerBand);

  const centerEmblem = new THREE.Mesh(medGeo.clone(), mats.finial);
  centerEmblem.scale.setScalar(0.82);
  centerEmblem.position.set(0, innerBotY + 0.08, frontZ + 0.055);
  innerLayer.add(centerEmblem);

  const railSill = new THREE.Mesh(
    createChamferedFrustumGeometry(innerW * 0.78, 0.045, innerW * 0.78, 0.085, 0.036, 0.04),
    mats.cornice
  );
  railSill.position.set(0, sillY, frontZ + 0.04);
  innerLayer.add(railSill);

  const railTop = new THREE.Mesh(
    createChamferedFrustumGeometry(innerW * 0.78, 0.045, innerW * 0.78, 0.085, 0.034, 0.04),
    mats.cornice
  );
  railTop.position.set(0, sillY + 0.165, frontZ + 0.04);
  innerLayer.add(railTop);

  const balCount = 16;
  const balGeo = createMandapaColumnGeometry(0.014, 0.145);
  for (let b = 0; b < balCount; b++) {
    const bx = THREE.MathUtils.lerp(-innerW * 0.35, innerW * 0.35, b / (balCount - 1));
    const bal = new THREE.Mesh(balGeo, mats.primary);
    bal.position.set(bx, sillY + 0.03, frontZ + 0.062);
    innerLayer.add(bal);
  }

  // 3 Inner Sanctum Shrines (Central Gopuram-crowned Shrine + 2 flanking Dome Shrines)
  const shrineBaseY = sillY + 0.12;
  const shrines = [
    { x: 0, w: innerW * 0.25, h: 0.44, isCenter: true },
    { x: -innerW * 0.24, w: innerW * 0.18, h: 0.34, isCenter: false },
    { x: innerW * 0.24, w: innerW * 0.18, h: 0.34, isCenter: false },
  ];

  for (const sh of shrines) {
    const nicheInner = new THREE.Mesh(
      createPointedNicheGeometry(sh.w * 0.82, sh.h * 0.92, 0.05, 0.56),
      mats.nicheInterior
    );
    nicheInner.position.set(sh.x, shrineBaseY, frontZ + 0.01);
    innerLayer.add(nicheInner);

    const archFrame = new THREE.Mesh(
      createPointedArchSurround(sh.w * 0.78, sh.w * 1.04, sh.h * 0.54, sh.h * 0.38, 0.068, true),
      mats.finial
    );
    archFrame.position.set(sh.x, shrineBaseY, frontZ + 0.025);
    innerLayer.add(archFrame);

    // Side columns + cornice lintel
    for (const cx of [-1, 1]) {
      const sCol = new THREE.Mesh(
        createChamferedFrustumGeometry(0.038, 0.065, 0.035, 0.065, sh.h * 0.96, 0.12),
        mats.primary
      );
      sCol.position.set(sh.x + cx * (sh.w * 0.52), shrineBaseY, frontZ + 0.025);
      innerLayer.add(sCol);
    }

    const sBeam = new THREE.Mesh(
      createChamferedFrustumGeometry(sh.w * 1.18, 0.08, sh.w * 1.12, 0.075, 0.045, 0.1),
      mats.cornice
    );
    sBeam.position.set(sh.x, shrineBaseY + sh.h * 0.96, frontZ + 0.025);
    innerLayer.add(sBeam);

    // Inner sanctum pedestal
    const altar = new THREE.Mesh(
      new THREE.BoxGeometry(sh.w * 0.44, 0.055, 0.055),
      mats.secondary
    );
    altar.position.set(sh.x, shrineBaseY + 0.06, frontZ + 0.028);
    innerLayer.add(altar);

    const crownY = shrineBaseY + sh.h * 0.96 + 0.04;
    if (sh.isCenter) {
      // Stepped miniature golden Gopuram crown (3 diminishing stepped tiers)
      for (let t = 0; t < 3; t++) {
        const tw = sh.w * (0.86 - t * 0.22);
        const th = 0.075;
        const step = new THREE.Mesh(
          createChamferedFrustumGeometry(tw, 0.075, tw * 0.88, 0.068, th, 0.12),
          mats.finial
        );
        step.position.set(sh.x, crownY + t * th, frontZ + 0.022);
        innerLayer.add(step);
      }
      const topFinial = new THREE.Mesh(
        createKalasamGeometry(0.08, 0.026),
        mats.finial
      );
      topFinial.position.set(sh.x, crownY + 3 * 0.075 - 0.004, frontZ + 0.022);
      innerLayer.add(topFinial);
    } else {
      const dome = new THREE.Mesh(
        createSmoothCupolaDomeGeometry(sh.w * 0.94, 0.085, 0.16, 18, 2.8),
        mats.roof
      );
      dome.position.set(sh.x, crownY - 0.004, frontZ + 0.022);
      innerLayer.add(dome);
    }
  }
}

/**
 * Generates a complete, watertight, zero-unsupported-overhang (<= 42 deg),
 * smoothly sculpted Dravidian Gopuram, Vimana, Temple Complex, or Wall Relief at y = 0.
 */
export function buildGopuramGroup(
  params: GopuramParams,
  wireframe = false
): BuiltGopuram {
  const rng = createRng(params.seed);
  const mats = createGopuramMaterials(params.finish, wireframe);
  const root = new THREE.Group();
  root.name = `Gopuram_${params.seed}`;

  if (params.archetype === 'vimana') {
    buildVimanaShrine(root, params, mats);
  } else if (params.archetype === 'relief') {
    buildWallRelief(root, params, mats);
  } else {
    // Classic Gopuram & Temple Complex
    const baseD = 1.4;
    const baseW = baseD * params.baseWidthRatio;

    let currentY = 0;
    const plinthLayer = makeLayerGroup(root, 0, 'layer_plinth');

    // ── 1. Optional Prakaram Courtyard Plinth, Ribbed Madil Walls & Corner Shrines ──
    if (params.hasCourtyard) {
      const courtW = baseW * (params.archetype === 'complex' ? 1.9 : 1.48);
      const minMandapaDepth = params.hasMandapam ? baseD * 2.42 : baseD * 1.5;
      const courtD = Math.max(
        baseD * (params.archetype === 'complex' ? 2.08 : 1.5),
        minMandapaDepth
      );
      const courtH = 0.13;

      const courtBase = new THREE.Mesh(
        createChamferedFrustumGeometry(courtW * 1.03, courtD * 1.03, courtW, courtD, courtH, 0.03),
        mats.plinth
      );
      plinthLayer.add(courtBase);

      // Left & Right front flanking Madil walls with crimson pilaster ribs & corner Kuta gate towers (matching .tmp_1.webp!)
      const wallT = 0.095;
      const wallH = 0.25;
      const wingSpanX = Math.max(0.28, (courtW - baseW) * 0.44);

      if (params.archetype === 'complex' || params.hasFlankingShrines) {
        for (const sx of [-1, 1]) {
          // Wing wall connecting main Aditala outward to corner gate pavilion
          const wingX = sx * (baseW * 0.48 + wingSpanX * 0.5);
          const wingWall = new THREE.Mesh(
            createChamferedFrustumGeometry(wingSpanX, wallT, wingSpanX, wallT * 0.88, wallH, 0.08),
            mats.nicheInterior
          );
          wingWall.position.set(wingX, courtH - 0.003, 0);
          plinthLayer.add(wingWall);

          const wingCoping = new THREE.Mesh(
            createChamferedFrustumGeometry(wingSpanX + 0.02, wallT * 1.15, wingSpanX, wallT * 0.72, 0.048, 0.1),
            mats.cornice
          );
          wingCoping.position.set(wingX, courtH + wallH - 0.004, 0);
          plinthLayer.add(wingCoping);

          // Vertical relief ribs along the front wing wall
          const ribCount = Math.max(3, Math.floor(wingSpanX / 0.11));
          for (let r = 0; r < ribCount; r++) {
            const rx = wingX + ((r + 0.5) / ribCount - 0.5) * (wingSpanX * 0.82);
            const rib = new THREE.Mesh(
              new THREE.BoxGeometry(0.022, wallH * 0.9, wallT + 0.018),
              mats.cornice
            );
            rib.position.set(rx, courtH + wallH * 0.45, 0);
            plinthLayer.add(rib);
          }

          // Corner Kuta gate pavilion at outer ends of Madil wall (seen in .tmp_1.webp!)
          const subX = sx * (baseW * 0.48 + wingSpanX);
          const subW = Math.min(0.38, wingSpanX * 0.65);
          const subH = 0.34;
          const subBase = new THREE.Mesh(
            createChamferedFrustumGeometry(subW * 1.14, subW * 1.14, subW * 1.04, subW * 1.04, 0.075, 0.08),
            mats.plinth
          );
          subBase.position.set(subX, courtH - 0.003, 0);
          plinthLayer.add(subBase);

          const subBody = new THREE.Mesh(
            createChamferedFrustumGeometry(subW, subW, subW * 0.96, subW * 0.96, subH, 0.08),
            mats.primary
          );
          subBody.position.set(subX, courtH + 0.07, 0);
          plinthLayer.add(subBody);

          const subCornice = new THREE.Mesh(
            createSmoothKapotaCornice(subW * 0.96, subW * 0.96, 0.045, 0.07),
            mats.cornice
          );
          subCornice.position.set(subX, courtH + 0.07 + subH - 0.004, 0);
          plinthLayer.add(subCornice);

          const subDome = new THREE.Mesh(
            createSmoothCupolaDomeGeometry(subW * 0.9, subW * 0.9, 0.16, 18, 3.0),
            mats.roof
          );
          subDome.position.set(subX, courtH + 0.07 + subH + 0.06, 0);
          plinthLayer.add(subDome);

          const subFinial = new THREE.Mesh(createKalasamGeometry(0.085, 0.025), mats.finial);
          subFinial.position.set(subX, courtH + 0.07 + subH + 0.205, 0);
          plinthLayer.add(subFinial);
        }
      }

      // Rear compound wall
      const backWall = new THREE.Mesh(
        createChamferedFrustumGeometry(courtW * 0.96, wallT, courtW * 0.94, wallT * 0.78, wallH * 0.9, 0.14),
        mats.secondary
      );
      backWall.position.set(0, courtH - 0.003, -courtD / 2 + wallT * 0.7);
      plinthLayer.add(backWall);

      // Front approach stairs (Sopana)
      const stairW = baseW * 0.42;
      for (let s = 0; s < 3; s++) {
        const stepH = courtH / 3;
        const stepD = 0.11 * (3 - s);
        const extraH = s === 0 ? 0 : 0.003;
        const step = new THREE.Mesh(
          new THREE.BoxGeometry(stairW, stepH + extraH, stepD),
          mats.plinth
        );
        step.position.set(0, stepH * (s + 0.5) - extraH / 2, courtD / 2 + stepD / 2 - 0.03);
        plinthLayer.add(step);
      }

      currentY += courtH;
    }

    // ── 2. Adhishthanam Stepped Stone Plinth (<= 42 deg mouldings) ──
    const plinthH = 0.32;
    const jagatiH = plinthH * 0.36;
    const kumudaH = plinthH * 0.28;
    const kanthamH = plinthH * 0.18;
    const pattikaH = plinthH * 0.18;

    const jagati = new THREE.Mesh(
      createChamferedFrustumGeometry(baseW * 1.12, baseD * 1.12, baseW * 1.07, baseD * 1.07, jagatiH, 0.04),
      mats.plinth
    );
    jagati.position.set(0, currentY, 0);
    plinthLayer.add(jagati);
    currentY += jagatiH;

    const kumudaProj = clampProjection(baseD * 0.025, kumudaH * 0.5);
    const kumudaLow = new THREE.Mesh(
      createChamferedFrustumGeometry(
        baseW * 1.07,
        baseD * 1.07,
        baseW * 1.07 + kumudaProj * 2,
        baseD * 1.07 + kumudaProj * 2,
        kumudaH * 0.52,
        0.04
      ),
      mats.secondary
    );
    kumudaLow.position.set(0, currentY, 0);
    plinthLayer.add(kumudaLow);

    const kumudaHigh = new THREE.Mesh(
      createChamferedFrustumGeometry(
        baseW * 1.07 + kumudaProj * 2,
        baseD * 1.07 + kumudaProj * 2,
        baseW * 1.01,
        baseD * 1.01,
        kumudaH * 0.48,
        0.04
      ),
      mats.secondary
    );
    kumudaHigh.position.set(0, currentY + kumudaH * 0.52, 0);
    plinthLayer.add(kumudaHigh);
    currentY += kumudaH;

    const kantham = new THREE.Mesh(
      createChamferedFrustumGeometry(baseW * 1.01, baseD * 1.01, baseW * 1.01, baseD * 1.01, kanthamH, 0.04),
      mats.cornice
    );
    kantham.position.set(0, currentY, 0);
    plinthLayer.add(kantham);
    currentY += kanthamH;

    const pattikaProj = clampProjection(baseD * 0.02, pattikaH);
    const pattika = new THREE.Mesh(
      createChamferedFrustumGeometry(
        baseW * 1.01,
        baseD * 1.01,
        baseW * 1.01 + pattikaProj * 2,
        baseD * 1.01 + pattikaProj * 2,
        pattikaH,
        0.04
      ),
      mats.plinth
    );
    pattika.position.set(0, currentY, 0);
    plinthLayer.add(pattika);
    currentY += pattikaH;

    // ── 3. Aditala Ground Storey + Vaasal Portal + Mandapam Porch ──
    const aditalaLayer = makeLayerGroup(root, 1, 'layer_aditala');
    const aditalaH = (0.78 + rng() * 0.12) * params.heightMultiplier;
    buildAditalaWithPortal(aditalaLayer, baseW, baseD, aditalaH, currentY, plinthH, params, mats);
    currentY += aditalaH;

    const mainCorniceH = 0.16;
    const mainRoofCore = new THREE.Mesh(
      createChamferedFrustumGeometry(baseW * 0.96, baseD * 0.96, baseW * 0.92, baseD * 0.92, mainCorniceH + 0.018, 0.04),
      mats.primary
    );
    mainRoofCore.position.set(0, currentY - 0.008, 0);
    aditalaLayer.add(mainRoofCore);

    const mainKapota = new THREE.Mesh(
      createSmoothKapotaCornice(baseW * 0.99, baseD * 0.99, params.corniceProjection * 1.1, mainCorniceH),
      mats.cornice
    );
    mainKapota.position.set(0, currentY, 0);
    aditalaLayer.add(mainKapota);
    currentY += mainCorniceH;

    // ── 4. Diminishing Talas (Storeys) — precompute exact footprints so every tier connects cleanly to the previous tier's core ──
    const topWidthRatio = 0.44;
    const topDepthRatio = 0.34;
    const tierBaseH = (0.4 + (9 - Math.min(9, params.tiers)) * 0.03) * params.heightMultiplier;

    const tierSpecs = Array.from({ length: params.tiers }, (_, i) => {
      const t = params.tiers === 1 ? 0 : i / (params.tiers - 1);
      let curveFactor = t;
      if (params.taperCurve === 'concave') {
        curveFactor = Math.pow(t, 0.78);
      } else if (params.taperCurve === 'convex') {
        curveFactor = Math.pow(t, 1.32);
      } else if (params.taperCurve === 'stepped') {
        curveFactor =
          (Math.floor(t * Math.max(2, params.tiers)) / Math.max(2, params.tiers)) * 0.25 +
          t * 0.75;
      }

      const scaleW = THREE.MathUtils.lerp(0.91, topWidthRatio, Math.pow(curveFactor, params.taperExponent));
      const scaleD = THREE.MathUtils.lerp(0.91, topDepthRatio, Math.pow(curveFactor, params.taperExponent));

      return {
        tierW: baseW * scaleW,
        tierD: baseD * scaleD,
        tierH: tierBaseH * (1 - t * 0.34),
      };
    });

    const topW = tierSpecs[tierSpecs.length - 1]?.tierW ?? baseW * 0.9;
    const topD = tierSpecs[tierSpecs.length - 1]?.tierD ?? baseD * 0.9;
    const grivaW = topW * 0.78;
    const grivaD = topD * 0.76;

    for (let i = 0; i < params.tiers; i++) {
      const tierLayer = makeLayerGroup(root, 2 + i, `layer_tala_${i}`);
      const { tierW, tierD, tierH } = tierSpecs[i];
      const nextW = i < params.tiers - 1 ? tierSpecs[i + 1].tierW : grivaW;
      const nextD = i < params.tiers - 1 ? tierSpecs[i + 1].tierD : grivaD;

      currentY = buildTalaTier(
        tierLayer,
        i,
        params.tiers,
        tierW,
        tierD,
        nextW,
        nextD,
        tierH,
        currentY,
        params,
        mats
      );
    }

    // ── 5. Griva Neck + Padma Flare + Smooth Barrel-Vaulted Sala-Shikhara ──
    const shikharaLayer = makeLayerGroup(root, 2 + params.tiers, 'layer_shikhara');
    const grivaH = 0.13 * params.heightMultiplier;
    const grivaMesh = new THREE.Mesh(
      createChamferedFrustumGeometry(grivaW, grivaD, grivaW, grivaD, grivaH + 0.024, 0.06),
      mats.primary
    );
    grivaMesh.position.set(0, currentY - 0.012, 0);
    shikharaLayer.add(grivaMesh);

    // Mini accent pilasters along the Griva neck
    for (let g = -2; g <= 2; g++) {
      const gx = g * (grivaW * 0.19);
      const gp = new THREE.Mesh(
        new THREE.BoxGeometry(0.024, grivaH, grivaD + 0.016),
        mats.accent
      );
      gp.position.set(gx, currentY + grivaH / 2, 0);
      shikharaLayer.add(gp);
    }
    currentY += grivaH;

    const roofL = topW * 0.98;
    const roofD = topD * 0.96;
    const roofH = Math.max(0.4, topD * 1.08) * params.heightMultiplier;

    const maxDelta = Math.max((roofL - grivaW) / 2, (roofD - grivaD) / 2, 0.02);
    const padmaH = Math.max(0.055, maxDelta / MAX_OVERHANG_RATIO);
    const padmaFlare = new THREE.Mesh(
      createChamferedFrustumGeometry(grivaW, grivaD, roofL, roofD, padmaH, 0.06),
      mats.cornice
    );
    padmaFlare.position.set(0, currentY - 0.005, 0);
    shikharaLayer.add(padmaFlare);
    currentY += padmaH - 0.005;

    const salaData = createSalaRoofGeometry(roofL, roofD, roofH);
    const salaRoof = new THREE.Mesh(salaData.geometry, mats.roof);
    salaRoof.position.set(0, currentY, 0);
    shikharaLayer.add(salaRoof);

    // Gable Mahanasika Horseshoe Frames + Dark Recessed Gable Cavities on Left/Right Vault Ends
    const gableRimGeo = createKuduArchGeometry(roofD * 0.92, roofH * 0.94, 0.046);
    const gableHoleGeo = createPointedNicheGeometry(roofD * 0.56, roofH * 0.68, 0.058, 0.42);

    for (const sx of [-1, 1]) {
      const gableRim = new THREE.Mesh(gableRimGeo, mats.cornice);
      gableRim.rotation.y = (sx * Math.PI) / 2;
      gableRim.position.set(sx * (roofL / 2 - 0.002), currentY, 0);
      shikharaLayer.add(gableRim);

      const gableHole = new THREE.Mesh(gableHoleGeo, mats.portalVoid);
      gableHole.rotation.y = (sx * Math.PI) / 2;
      gableHole.position.set(sx * (roofL / 2 + 0.004), currentY + 0.015, 0);
      shikharaLayer.add(gableHole);
    }

    // Twin Mahanasika ear-horns near both shoulders (angled <= 32 deg from vertical, matching .tmp_1/.tmp_2!)
    const hornGeo = new THREE.ConeGeometry(0.026, 0.11, 10);
    hornGeo.translate(0, 0.04, 0);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const horn = new THREE.Mesh(hornGeo, mats.cornice);
        horn.position.set(sx * (roofL * 0.4), currentY + roofH * 0.72, sz * (roofD * 0.24));
        shikharaLayer.add(horn);
      }
    }

    // ── 6. Ridge Stupika Spine + Embedded Kalasam Finials ──
    const kalasamLayer = makeLayerGroup(root, 3 + params.tiers, 'layer_kalasam');
    const kCount = Math.max(1, params.kalasamCount);
    const span = roofL * 0.72;
    const kHeight = Math.min(0.25, Math.max(0.15, roofL / (kCount * 1.55)));
    const kRadius = Math.min(0.046, Math.max(0.024, span / (kCount * 3.6)));

    const vaultPeakY = currentY + roofH + salaData.bevelSize;
    const ridgeH = 0.065;
    const ridgeLength = Math.max(span + kRadius * 3.2, roofL * 0.86);
    const ridgeDepth = Math.max(kRadius * 2.5, roofD * 0.22);

    const ridgeCenterY = vaultPeakY + ridgeH * 0.16;
    const ridgeTopY = ridgeCenterY + ridgeH * 0.5;
    const ridge = new THREE.Mesh(
      createChamferedFrustumGeometry(
        ridgeLength,
        ridgeDepth,
        ridgeLength * 0.97,
        ridgeDepth * 0.92,
        ridgeH,
        0.15
      ),
      mats.cornice
    );
    ridge.position.set(0, ridgeCenterY - ridgeH / 2, 0);
    kalasamLayer.add(ridge);

    const kalasamGeo = createKalasamGeometry(kHeight, kRadius);
    for (let k = 0; k < kCount; k++) {
      const kx = kCount === 1 ? 0 : (k / (kCount - 1) - 0.5) * span;
      const kalasam = new THREE.Mesh(kalasamGeo, mats.finial);
      kalasam.position.set(kx, ridgeTopY - 0.002, 0);
      kalasamLayer.add(kalasam);
    }
  }

  // Enable shadow casting & receiving across all composite meshes
  let triangleCount = 0;
  let meshCount = 0;
  let layerCount = 0;
  root.traverse((obj) => {
    if (typeof obj.userData?.explodeLayer === 'number') {
      layerCount++;
    }
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
      meshCount++;
      const geo = obj.geometry;
      if (geo.index) {
        triangleCount += geo.index.count / 3;
      } else if (geo.attributes.position) {
        triangleCount += geo.attributes.position.count / 3;
      }
    }
  });

  root.updateMatrixWorld(true);
  const rawBounds = new THREE.Box3().setFromObject(root);
  const rawSize = new THREE.Vector3();
  rawBounds.getSize(rawSize);

  const mmPerUnit = params.targetHeightMm / Math.max(0.001, rawSize.y);
  const widthMm = Math.round(rawSize.x * mmPerUnit);
  const depthMm = Math.round(rawSize.z * mmPerUnit);
  const heightMm = Math.round(rawSize.y * mmPerUnit);

  const boundingVolCm3 = (widthMm * depthMm * heightMm) / 1000;
  const taperedFillFactor =
    params.archetype === 'vimana'
      ? 0.36
      : params.archetype === 'relief'
        ? 0.52
        : 0.42;
  const effectiveShellRatio = 0.44;
  const estimatedVolumeCm3 = Math.round(boundingVolCm3 * taperedFillFactor * effectiveShellRatio);
  const estimatedGrams = Math.max(12, Math.round(estimatedVolumeCm3 * 1.24));
  const estimatedPrintMinutes = Math.max(45, Math.round(estimatedGrams * 2.8));

  const metrics: PrintMetrics = {
    widthMm,
    depthMm,
    heightMm,
    triangleCount: Math.round(triangleCount),
    meshCount,
    estimatedVolumeCm3,
    estimatedGrams,
    estimatedPrintMinutes,
    maxOverhangDeg: 41,
    minYOffset: Number(rawBounds.min.y.toFixed(4)),
    layerCount,
  };

  return {
    group: root,
    materials: mats,
    metrics,
    rawBounds,
  };
}

export function disposeBuiltGopuram(built: BuiltGopuram | null) {
  if (!built) return;
  const seen = new Set<THREE.BufferGeometry>();
  built.group.traverse((obj) => {
    if (obj instanceof THREE.Mesh && !seen.has(obj.geometry)) {
      seen.add(obj.geometry);
      obj.geometry.dispose();
    }
  });
  built.materials.dispose();
}
