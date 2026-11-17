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
 * Helper to create a 4-sided pyramidal frustum (perfect for 45-deg printable
 * Dravidian Kapota cornices and stepped plinth mouldings without unsupported overhangs).
 */
function createRectFrustumGeometry(
  bottomW: number,
  bottomD: number,
  topW: number,
  topD: number,
  height: number
): THREE.BufferGeometry {
  const hwB = bottomW / 2;
  const hdB = bottomD / 2;
  const hwT = topW / 2;
  const hdT = topD / 2;
  const y0 = 0;
  const y1 = height;

  // 8 corners: bottom (0..3), top (4..7)
  const v = [
    [-hwB, y0, hdB],  // 0: front-left bottom
    [hwB, y0, hdB],   // 1: front-right bottom
    [hwB, y0, -hdB],  // 2: back-right bottom
    [-hwB, y0, -hdB], // 3: back-left bottom
    [-hwT, y1, hdT],  // 4: front-left top
    [hwT, y1, hdT],   // 5: front-right top
    [hwT, y1, -hdT],  // 6: back-right top
    [-hwT, y1, -hdT], // 7: back-left top
  ];

  const quads = [
    [0, 1, 5, 4], // front
    [1, 2, 6, 5], // right
    [2, 3, 7, 6], // back
    [3, 0, 4, 7], // left
    [4, 5, 6, 7], // top
    [3, 2, 1, 0], // bottom
  ];

  const positions: number[] = [];
  for (const [a, b, c, d] of quads) {
    positions.push(...v[a], ...v[b], ...v[c]);
    positions.push(...v[a], ...v[c], ...v[d]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Authentic Dravidian Sala-Shikhara barrel-vaulted roof profile extruded along X.
 */
function createSalaRoofGeometry(
  lengthX: number,
  depthZ: number,
  heightY: number
): { geometry: THREE.BufferGeometry; bevelSize: number; bevelThickness: number } {
  const hd = depthZ / 2;
  const shape = new THREE.Shape();

  // Start bottom-left (eave)
  shape.moveTo(-hd * 1.08, 0);
  // Subtle outward flared eave lip
  shape.lineTo(-hd * 1.12, heightY * 0.08);
  // Sweeping concave Dravidian neck-to-vault curve up to apex
  shape.bezierCurveTo(
    -hd * 0.85,
    heightY * 0.22,
    -hd * 0.88,
    heightY * 0.88,
    0,
    heightY
  );
  // Mirror down right side
  shape.bezierCurveTo(
    hd * 0.88,
    heightY * 0.88,
    hd * 0.85,
    heightY * 0.22,
    hd * 1.12,
    heightY * 0.08
  );
  shape.lineTo(hd * 1.08, 0);
  shape.closePath();

  const bevelThickness = Math.min(lengthX, depthZ) * 0.04;
  const bevelSize = Math.min(lengthX, depthZ) * 0.03;

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: lengthX,
    bevelEnabled: true,
    bevelThickness,
    bevelSize,
    bevelSegments: 2,
    curveSegments: 14,
  });

  // Extrude is along +Z by default. Rotate Y by +90 deg so the barrel ridge runs along X.
  geo.translate(0, 0, -lengthX / 2);
  geo.rotateY(Math.PI / 2);
  geo.computeVertexNormals();
  return { geometry: geo, bevelSize, bevelThickness };
}

/**
 * Miniature Kudu (horseshoe arch) dormer motif for Kapota cornices and gables.
 */
function createKuduArchGeometry(width: number, height: number, depth: number): THREE.BufferGeometry {
  const hw = width / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-hw, 0);
  shape.lineTo(-hw * 0.82, height * 0.55);
  shape.quadraticCurveTo(0, height * 1.18, hw * 0.82, height * 0.55);
  shape.lineTo(hw, 0);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: depth * 0.14,
    bevelSize: width * 0.06,
    bevelSegments: 1,
    curveSegments: 8,
  });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Lathe-turned sacred Kalasam finial geometry with an embedded root collar (y = -0.02..0)
 * so every finial links cleanly into its ridge or dome pedestal without floating.
 */
function createKalasamGeometry(height: number, radius: number): THREE.BufferGeometry {
  const rootDepth = Math.max(0.015, height * 0.12);
  const pts = [
    new THREE.Vector2(0.001, -rootDepth),
    new THREE.Vector2(radius * 1.12, -rootDepth),
    new THREE.Vector2(radius * 1.12, 0),
    new THREE.Vector2(radius * 1.05, height * 0.12),
    new THREE.Vector2(radius * 0.72, height * 0.22),
    new THREE.Vector2(radius * 0.96, height * 0.38),
    new THREE.Vector2(radius * 0.88, height * 0.52),
    new THREE.Vector2(radius * 0.42, height * 0.64),
    new THREE.Vector2(radius * 0.54, height * 0.72),
    new THREE.Vector2(radius * 0.24, height * 0.86),
    new THREE.Vector2(radius * 0.09, height * 0.96),
    new THREE.Vector2(0.001, height),
  ];
  const geo = new THREE.LatheGeometry(pts, 16);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Dravidian Vimana octagonal/square bell-dome Shikhara (base at y = 0).
 */
function createVimanaDomeGeometry(
  width: number,
  height: number,
  sides: number
): THREE.BufferGeometry {
  const r = width * 0.56;
  const pts = [
    new THREE.Vector2(0.001, 0),
    new THREE.Vector2(r * 1.04, 0),
    new THREE.Vector2(r * 1.08, height * 0.1),
    new THREE.Vector2(r * 0.92, height * 0.26),
    new THREE.Vector2(r * 0.86, height * 0.52),
    new THREE.Vector2(r * 0.56, height * 0.78),
    new THREE.Vector2(r * 0.28, height * 0.93),
    new THREE.Vector2(0.001, height),
  ];
  const geo = new THREE.LatheGeometry(pts, sides);
  if (sides === 4) {
    geo.rotateY(Math.PI / 4);
  } else if (sides === 8) {
    geo.rotateY(Math.PI / 8);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a hollow/recessed gateway story with left pier, right pier, lintel,
 * and deep arched/corbelled/stepped Vaasal portal passage.
 */
function buildAditalaWithPortal(
  parent: THREE.Group,
  width: number,
  depth: number,
  height: number,
  yBase: number,
  plinthH: number,
  params: GopuramParams,
  mats: GopuramMaterialSet
) {
  const portalW = width * params.portalScale;
  const portalH = height * 0.66;
  const pierW = (width - portalW) / 2;

  // Left & Right structural piers (full depth so portal creates a real dark recessed passageway)
  const pierGeo = new THREE.BoxGeometry(pierW, height, depth);
  const leftPier = new THREE.Mesh(pierGeo, mats.primary);
  leftPier.position.set(-(portalW / 2 + pierW / 2), yBase + height / 2, 0);
  parent.add(leftPier);

  const rightPier = new THREE.Mesh(pierGeo.clone(), mats.primary);
  rightPier.position.set(portalW / 2 + pierW / 2, yBase + height / 2, 0);
  parent.add(rightPier);

  // Inner dark sanctum backing core (keeps model watertight & solid for 3D printing
  // while creating deep authentic portal shadow recess from both front and back)
  const coreWallDepth = depth * 0.34;
  const innerCoreGeo = new THREE.BoxGeometry(portalW + 0.02, height, coreWallDepth);
  const innerCore = new THREE.Mesh(innerCoreGeo, mats.portalVoid);
  innerCore.position.set(0, yBase + height / 2, 0);
  parent.add(innerCore);

  // Upper lintel block spanning above the portal opening
  const lintelH = height - portalH;
  const lintelGeo = new THREE.BoxGeometry(portalW + 0.04, lintelH, depth);
  const lintel = new THREE.Mesh(lintelGeo, mats.primary);
  lintel.position.set(0, yBase + portalH + lintelH / 2, 0);
  parent.add(lintel);

  // Portal jamb frames & arch treatment on front (+Z) and back (-Z)
  const jambW = Math.max(0.035, portalW * 0.11);
  const jambDepth = depth * 1.03;
  const jambGeo = new THREE.BoxGeometry(jambW, portalH, jambDepth);

  const leftJamb = new THREE.Mesh(jambGeo, mats.secondary);
  leftJamb.position.set(-portalW / 2 + jambW * 0.35, yBase + portalH / 2, 0);
  parent.add(leftJamb);

  const rightJamb = new THREE.Mesh(jambGeo.clone(), mats.secondary);
  rightJamb.position.set(portalW / 2 - jambW * 0.35, yBase + portalH / 2, 0);
  parent.add(rightJamb);

  // Portal arch / corbelled header
  if (params.portalStyle === 'arched') {
    const archGeo = createKuduArchGeometry(portalW * 1.12, lintelH * 0.92, depth * 1.04);
    const archMesh = new THREE.Mesh(archGeo, mats.cornice);
    archMesh.position.set(0, yBase + portalH * 0.88, 0);
    parent.add(archMesh);
  } else if (params.portalStyle === 'corbelled') {
    const steps = 3;
    for (let s = 0; s < steps; s++) {
      const frac = 1 - s * 0.24;
      const stepH = (lintelH * 0.65) / steps;
      const stepGeo = new THREE.BoxGeometry(portalW * frac, stepH, depth * 1.04);
      const stepMesh = new THREE.Mesh(stepGeo, mats.secondary);
      stepMesh.position.set(0, yBase + portalH - stepH * (s + 0.5) * 0.7, 0);
      parent.add(stepMesh);
    }
  } else if (params.portalStyle === 'stepped') {
    const capGeo = createRectFrustumGeometry(
      portalW * 1.24,
      depth * 1.05,
      portalW * 0.85,
      depth * 1.02,
      lintelH * 0.55
    );
    const cap = new THREE.Mesh(capGeo, mats.cornice);
    cap.position.set(0, yBase + portalH * 0.96, 0);
    parent.add(cap);
  }

  // Front Mandapa Entrance Porch if enabled
  if (params.hasMandapam) {
    const porchD = depth * 0.42;
    const porchW = portalW * 1.48;
    const colR = Math.max(0.025, porchW * 0.065);
    const colH = portalH * 0.92;
    const porchFloorY = yBase - plinthH;
    const porchFrontZ = depth / 2 + porchD * 1.04;
    const porchBackZ = depth * 0.32;
    const porchSpanD = porchFrontZ - porchBackZ;
    const porchCenterZ = (porchFrontZ + porchBackZ) / 2;

    // Stepped Mandapam porch plinth rising solidly from courtyard/ground (yBase - plinthH) up to yBase
    const porchLowerH = plinthH * 0.56;
    const porchUpperH = plinthH * 0.44;
    const porchPlinthLower = new THREE.Mesh(
      createRectFrustumGeometry(
        porchW * 1.16,
        porchSpanD + 0.06,
        porchW * 1.11,
        porchSpanD + 0.02,
        porchLowerH
      ),
      mats.plinth
    );
    porchPlinthLower.position.set(0, porchFloorY, porchCenterZ);
    parent.add(porchPlinthLower);

    const porchPlinthUpper = new THREE.Mesh(
      createRectFrustumGeometry(
        porchW * 1.11,
        porchSpanD + 0.02,
        porchW * 1.08,
        porchSpanD,
        porchUpperH + 0.006
      ),
      mats.secondary
    );
    porchPlinthUpper.position.set(0, porchFloorY + porchLowerH, porchCenterZ);
    parent.add(porchPlinthUpper);

    // Porch front steps (Sopana) descending from porch platform to courtyard/ground
    const porchStairW = porchW * 0.58;
    const stairCount = 3;
    for (let s = 0; s < stairCount; s++) {
      const sH = plinthH / stairCount;
      const sD = 0.08 * (stairCount - s);
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(porchStairW, sH + 0.004, sD),
        mats.plinth
      );
      step.position.set(0, porchFloorY + sH * (s + 0.5), porchFrontZ + sD / 2 - 0.02);
      parent.add(step);
    }

    const colPositions = [
      [-porchW * 0.42, depth / 2 + porchD * 0.8],
      [porchW * 0.42, depth / 2 + porchD * 0.8],
      [-porchW * 0.24, depth / 2 + porchD * 0.8],
      [porchW * 0.24, depth / 2 + porchD * 0.8],
    ];
    for (const [cx, cz] of colPositions) {
      // Square pillar base pedestal seated firmly on the porch plinth
      const baseH = colH * 0.14;
      const colBase = new THREE.Mesh(
        new THREE.BoxGeometry(colR * 2.5, baseH, colR * 2.5),
        mats.plinth
      );
      colBase.position.set(cx, yBase + baseH / 2 - 0.004, cz);
      parent.add(colBase);

      // Column shaft overlapping base & capital
      const colGeo = new THREE.CylinderGeometry(colR * 0.88, colR * 1.08, colH + 0.01, 8);
      const col = new THREE.Mesh(colGeo, mats.secondary);
      col.position.set(cx, yBase + colH / 2, cz);
      parent.add(col);

      // Bracket capital (Bodhigai) connecting shaft solidly to porch roof
      const capH = colH * 0.11;
      const colCap = new THREE.Mesh(
        new THREE.BoxGeometry(colR * 2.7, capH, colR * 2.5),
        mats.cornice
      );
      colCap.position.set(cx, yBase + colH - capH / 2 + 0.004, cz);
      parent.add(colCap);
    }

    // Porch roof slab + sloped kapota eave anchored back into the Aditala facade
    const porchRoofH = height * 0.14;
    const porchRoofGeo = createRectFrustumGeometry(
      porchW * 1.12,
      porchD * 1.18,
      porchW * 0.98,
      porchD * 1.04,
      porchRoofH
    );
    const porchRoof = new THREE.Mesh(porchRoofGeo, mats.cornice);
    porchRoof.position.set(0, yBase + colH - 0.004, depth / 2 + porchD * 0.48);
    parent.add(porchRoof);
  }

  // Wall Pilasters (Stambha) & Niche shrines (Devakoshta) on flanking piers
  const pilasterW = Math.max(0.022, pierW * 0.14);
  const pilasterDepth = depth + 0.036;
  const pilasterH = height * 0.86;
  const pilasterBays = Math.max(2, Math.min(4, Math.floor(params.shrineDensity * 0.8)));

  for (const side of [-1, 1]) {
    const pierCenterX = side * (portalW / 2 + pierW / 2);
    for (let b = 0; b < pilasterBays; b++) {
      const u = pilasterBays === 1 ? 0 : (b / (pilasterBays - 1) - 0.5) * 0.72;
      const px = pierCenterX + u * pierW;
      const pilGeo = new THREE.BoxGeometry(pilasterW, pilasterH, pilasterDepth);
      const pil = new THREE.Mesh(pilGeo, mats.secondary);
      pil.position.set(px, yBase + pilasterH / 2, 0);
      parent.add(pil);
    }

    // Central niche shrine relief on each flanking pier
    const nicheW = pierW * 0.46;
    const nicheH = height * 0.52;
    const nicheGeo = new THREE.BoxGeometry(nicheW, nicheH, depth + 0.055);
    const niche = new THREE.Mesh(nicheGeo, mats.accent);
    niche.position.set(pierCenterX, yBase + nicheH * 0.58, 0);
    parent.add(niche);

    const nicheRoofGeo = createRectFrustumGeometry(
      nicheW * 1.12,
      depth + 0.07,
      nicheW * 0.65,
      depth + 0.04,
      height * 0.12
    );
    const nicheRoof = new THREE.Mesh(nicheRoofGeo, mats.cornice);
    nicheRoof.position.set(pierCenterX, yBase + nicheH * 0.58 + nicheH / 2, 0);
    parent.add(nicheRoof);
  }

  // Side-wall pilasters along -X and +X faces
  const sideBays = Math.max(2, Math.floor(depth / 0.24));
  for (let s = 0; s < sideBays; s++) {
    const u = sideBays === 1 ? 0 : (s / (sideBays - 1) - 0.5) * 0.72;
    const pz = u * depth;
    const sPilGeo = new THREE.BoxGeometry(width + 0.036, pilasterH, pilasterW);
    const sPil = new THREE.Mesh(sPilGeo, mats.secondary);
    sPil.position.set(0, yBase + pilasterH / 2, pz);
    parent.add(sPil);
  }
}

/**
 * Builds a single Diminishing Tala (storey) with Kutas (corners), Shalas (center),
 * Panjaras (intermediate niches), and 45-deg printable Kapota cornice.
 */
function buildTalaTier(
  parent: THREE.Group,
  tierIndex: number,
  totalTiers: number,
  w: number,
  d: number,
  h: number,
  yBase: number,
  params: GopuramParams,
  mats: GopuramMaterialSet
): number {
  const wallH = h * 0.68;
  const corniceH = h * 0.32;

  // 1. Recessed tier masonry core
  const coreGeo = new THREE.BoxGeometry(w * 0.94, wallH + 0.01, d * 0.94);
  const core = new THREE.Mesh(coreGeo, mats.primary);
  core.position.set(0, yBase + wallH / 2, 0);
  parent.add(core);

  // 2. Four corner Kutas (square-plan miniature shrine pavilions)
  const kutaSize = Math.min(w, d) * 0.21;
  const kutaH = wallH * 0.92;
  const kutaRoofH = wallH * 0.24;
  const kx = w / 2 - kutaSize * 0.38;
  const kz = d / 2 - kutaSize * 0.38;

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const kutaBody = new THREE.Mesh(
        new THREE.BoxGeometry(kutaSize, kutaH, kutaSize),
        mats.secondary
      );
      kutaBody.position.set(sx * kx, yBase + kutaH / 2, sz * kz);
      parent.add(kutaBody);

      const kutaCap = new THREE.Mesh(
        createVimanaDomeGeometry(kutaSize * 1.15, kutaRoofH, 4),
        mats.roof
      );
      kutaCap.position.set(sx * kx, yBase + kutaH - 0.005, sz * kz);
      parent.add(kutaCap);
    }
  }

  // 3. Central Shalas (elongated barrel-vaulted pavilions on front/back and sides)
  const shalaW = Math.max(kutaSize * 1.25, w * 0.28);
  const shalaD = d + 0.055;
  const shalaH = wallH * 0.95;

  const shalaCenter = new THREE.Mesh(
    new THREE.BoxGeometry(shalaW, shalaH, shalaD),
    mats.secondary
  );
  shalaCenter.position.set(0, yBase + shalaH / 2, 0);
  parent.add(shalaCenter);

  // Central Shala miniature barrel crest
  const shalaCrestData = createSalaRoofGeometry(shalaW * 0.96, d * 0.26, wallH * 0.24);
  const shalaCrest = new THREE.Mesh(shalaCrestData.geometry, mats.roof);
  shalaCrest.position.set(0, yBase + shalaH - 0.008, d / 2 - d * 0.04);
  parent.add(shalaCrest);

  const shalaCrestBack = shalaCrest.clone();
  shalaCrestBack.position.set(0, yBase + shalaH - 0.008, -(d / 2 - d * 0.04));
  parent.add(shalaCrestBack);

  // Central Shala recessed doorway/niche accent
  const centerNiche = new THREE.Mesh(
    new THREE.BoxGeometry(shalaW * 0.44, shalaH * 0.62, shalaD + 0.018),
    mats.portalVoid
  );
  centerNiche.position.set(0, yBase + shalaH * 0.42, 0);
  parent.add(centerNiche);

  // Side Shala pavilions (along +X / -X) when depth allows
  if (d > 0.38) {
    const sideShalaD = Math.min(d * 0.32, shalaW * 0.72);
    const sideShala = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.05, shalaH * 0.92, sideShalaD),
      mats.secondary
    );
    sideShala.position.set(0, yBase + (shalaH * 0.92) / 2, 0);
    parent.add(sideShala);
  }

  // 4. Intermediate Panjara niches & pilasters along front/back span
  const spanBetween = kx - kutaSize * 0.55 - shalaW * 0.55;
  if (spanBetween > 0.06) {
    const panjaraCount = Math.max(
      1,
      Math.min(params.shrineDensity, Math.floor(spanBetween / 0.11))
    );
    const pW = Math.min(kutaSize * 0.68, (spanBetween / panjaraCount) * 0.72);
    const pH = wallH * 0.82;
    const pD = d + 0.038;

    for (const side of [-1, 1]) {
      for (let p = 0; p < panjaraCount; p++) {
        const frac = panjaraCount === 1 ? 0.5 : (p + 0.5) / panjaraCount;
        const px = side * (shalaW * 0.55 + frac * spanBetween);
        const panjara = new THREE.Mesh(
          new THREE.BoxGeometry(pW, pH, pD),
          p % 2 === 0 ? mats.accent : mats.secondary
        );
        panjara.position.set(px, yBase + pH / 2, 0);
        parent.add(panjara);

        if (params.kuduDetail && p % 2 === 0 && tierIndex < totalTiers - 1) {
          const kudu = new THREE.Mesh(
            createKuduArchGeometry(pW * 0.85, wallH * 0.22, pD + 0.018),
            mats.cornice
          );
          kudu.position.set(px, yBase + pH * 0.88, 0);
          parent.add(kudu);
        }
      }
    }
  }

  // 5. 45-degree printable flared Kapota Cornice + recessed neck band
  const proj = params.corniceProjection * (1 - (tierIndex / totalTiers) * 0.42);
  const corniceTopH = corniceH * 0.55;
  const corniceFlangeH = corniceH * 0.45;

  // Lower outward flare (45 deg safe angle)
  const flareGeo = createRectFrustumGeometry(
    w * 0.96,
    d * 0.96,
    w + proj * 2,
    d + proj * 2,
    corniceFlangeH
  );
  const flare = new THREE.Mesh(flareGeo, mats.cornice);
  flare.position.set(0, yBase + wallH, 0);
  parent.add(flare);

  // Upper cornice cap tapering cleanly back toward next tier
  const capGeo = createRectFrustumGeometry(
    w + proj * 2,
    d + proj * 2,
    w * 0.93,
    d * 0.93,
    corniceTopH
  );
  const cap = new THREE.Mesh(capGeo, mats.cornice);
  cap.position.set(0, yBase + wallH + corniceFlangeH, 0);
  parent.add(cap);

  return yBase + h;
}

/**
 * Generates the complete, watertight, multi-part procedural 3D Gopuram group
 * sitting grounded with its base at y = 0.
 */
export function buildGopuramGroup(
  params: GopuramParams,
  wireframe = false
): BuiltGopuram {
  const rng = createRng(params.seed);
  const mats = createGopuramMaterials(params.finish, wireframe);
  const root = new THREE.Group();
  root.name = `Gopuram_${params.seed}`;

  // Canonical base depth = 1.4 units so all camera/lighting scales stay consistent
  const baseD = 1.4;
  const baseW = baseD * (params.archetype === 'vimana' ? Math.min(1.16, params.baseWidthRatio) : params.baseWidthRatio);

  let currentY = 0;

  // ── 1. Optional Prakaram Courtyard Plinth & Compound Walls ──
  if (params.hasCourtyard) {
    const courtW = baseW * (params.archetype === 'complex' ? 1.85 : 1.45);
    const minMandapaDepth = params.hasMandapam ? baseD * 2.38 : baseD * 1.48;
    const courtD = Math.max(
      baseD * (params.archetype === 'complex' ? 2.05 : 1.48),
      minMandapaDepth
    );
    const courtH = 0.14;

    const courtBase = new THREE.Mesh(
      createRectFrustumGeometry(courtW * 1.04, courtD * 1.04, courtW, courtD, courtH),
      mats.plinth
    );
    courtBase.position.set(0, 0, 0);
    root.add(courtBase);

    // Compound perimeter walls (Madil) along left, right, and rear edges
    const wallT = 0.09;
    const wallH = 0.24;
    const leftWall = new THREE.Mesh(
      new THREE.BoxGeometry(wallT, wallH, courtD * 0.92),
      mats.secondary
    );
    leftWall.position.set(-courtW / 2 + wallT * 0.7, courtH + wallH / 2, 0);
    root.add(leftWall);

    const rightWall = new THREE.Mesh(
      new THREE.BoxGeometry(wallT, wallH, courtD * 0.92),
      mats.secondary
    );
    rightWall.position.set(courtW / 2 - wallT * 0.7, courtH + wallH / 2, 0);
    root.add(rightWall);

    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(courtW * 0.96, wallH, wallT),
      mats.secondary
    );
    backWall.position.set(0, courtH + wallH / 2, -courtD / 2 + wallT * 0.7);
    root.add(backWall);

    // Front approach stairs (Sopana)
    const stairW = baseW * 0.42;
    for (let s = 0; s < 3; s++) {
      const stepH = courtH / 3;
      const stepD = 0.12 * (3 - s);
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(stairW, stepH, stepD),
        mats.plinth
      );
      step.position.set(0, stepH * (s + 0.5), courtD / 2 + stepD / 2 - 0.04);
      root.add(step);
    }

    // Optional flanking satellite mini-shrines in complex mode
    if (params.hasFlankingShrines) {
      for (const sx of [-1, 1]) {
        const subX = sx * (courtW * 0.36);
        const subZ = courtD * 0.16;
        const subW = baseW * 0.22;
        const subH = 0.36;
        const subBody = new THREE.Mesh(
          new THREE.BoxGeometry(subW, subH, subW),
          mats.primary
        );
        subBody.position.set(subX, courtH + subH / 2, subZ);
        root.add(subBody);

        const subDome = new THREE.Mesh(
          createVimanaDomeGeometry(subW * 1.15, 0.22, 4),
          mats.roof
        );
        subDome.position.set(subX, courtH + subH - 0.006, subZ);
        root.add(subDome);

        const subFinial = new THREE.Mesh(
          createKalasamGeometry(0.11, 0.032),
          mats.finial
        );
        subFinial.position.set(subX, courtH + subH + 0.19, subZ);
        root.add(subFinial);
      }
    }

    currentY += courtH;
  }

  // ── 2. Adhishthanam Stepped Stone Plinth ──
  const plinthH = 0.32;
  const jagatiH = plinthH * 0.38;
  const kumudaH = plinthH * 0.26;
  const kanthamH = plinthH * 0.18;
  const pattikaH = plinthH * 0.18;

  const jagati = new THREE.Mesh(
    createRectFrustumGeometry(baseW * 1.12, baseD * 1.12, baseW * 1.07, baseD * 1.07, jagatiH),
    mats.plinth
  );
  jagati.position.set(0, currentY, 0);
  root.add(jagati);
  currentY += jagatiH;

  const kumuda = new THREE.Mesh(
    createRectFrustumGeometry(baseW * 1.07, baseD * 1.07, baseW * 1.1, baseD * 1.1, kumudaH),
    mats.secondary
  );
  kumuda.position.set(0, currentY, 0);
  root.add(kumuda);
  currentY += kumudaH;

  const kantham = new THREE.Mesh(
    new THREE.BoxGeometry(baseW * 1.01, kanthamH, baseD * 1.01),
    mats.accent
  );
  kantham.position.set(0, currentY + kanthamH / 2, 0);
  root.add(kantham);
  currentY += kanthamH;

  const pattika = new THREE.Mesh(
    createRectFrustumGeometry(baseW * 1.01, baseD * 1.01, baseW * 1.05, baseD * 1.05, pattikaH),
    mats.plinth
  );
  pattika.position.set(0, currentY, 0);
  root.add(pattika);
  currentY += pattikaH;

  // ── 3. Aditala Ground Storey + Vaasal Portal ──
  const aditalaH = (0.74 + rng() * 0.14) * params.heightMultiplier;
  buildAditalaWithPortal(root, baseW, baseD, aditalaH, currentY, plinthH, params, mats);
  currentY += aditalaH;

  // Aditala Kapota Cornice
  const mainCorniceH = 0.16;
  const p0 = params.corniceProjection * 1.15;
  const mainFlare = new THREE.Mesh(
    createRectFrustumGeometry(baseW, baseD, baseW + p0 * 2, baseD + p0 * 2, mainCorniceH * 0.5),
    mats.cornice
  );
  mainFlare.position.set(0, currentY, 0);
  root.add(mainFlare);

  const mainCap = new THREE.Mesh(
    createRectFrustumGeometry(baseW + p0 * 2, baseD + p0 * 2, baseW * 0.94, baseD * 0.94, mainCorniceH * 0.5),
    mats.cornice
  );
  mainCap.position.set(0, currentY + mainCorniceH * 0.5, 0);
  root.add(mainCap);
  currentY += mainCorniceH;

  // ── 4. Diminishing Talas (Storeys) ──
  const topWidthRatio = params.archetype === 'vimana' ? 0.34 : 0.42;
  const topDepthRatio = params.archetype === 'vimana' ? 0.34 : 0.32;
  const tierBaseH = ((0.38 + (9 - Math.min(9, params.tiers)) * 0.032) * params.heightMultiplier);

  let topW = baseW * 0.9;
  let topD = baseD * 0.9;

  for (let i = 0; i < params.tiers; i++) {
    const t = params.tiers === 1 ? 0 : i / (params.tiers - 1);

    let curveFactor = t;
    if (params.taperCurve === 'concave') {
      curveFactor = Math.pow(t, 0.78);
    } else if (params.taperCurve === 'convex') {
      curveFactor = Math.pow(t, 1.32);
    } else if (params.taperCurve === 'stepped') {
      curveFactor = Math.floor(t * Math.max(2, params.tiers)) / Math.max(2, params.tiers) * 0.25 + t * 0.75;
    }

    const scaleW = THREE.MathUtils.lerp(0.91, topWidthRatio, Math.pow(curveFactor, params.taperExponent));
    const scaleD = THREE.MathUtils.lerp(0.91, topDepthRatio, Math.pow(curveFactor, params.taperExponent));

    const tierW = baseW * scaleW;
    const tierD = baseD * scaleD;
    const tierH = tierBaseH * (1 - t * 0.34);

    currentY = buildTalaTier(
      root,
      i,
      params.tiers,
      tierW,
      tierD,
      tierH,
      currentY,
      params,
      mats
    );

    topW = tierW;
    topD = tierD;
  }

  // ── 5. Griva (Recessed Neck Transition) ──
  const grivaH = 0.14 * params.heightMultiplier;
  const grivaW = topW * 0.76;
  const grivaD = topD * 0.74;
  const grivaMesh = new THREE.Mesh(
    new THREE.BoxGeometry(grivaW, grivaH + 0.02, grivaD),
    mats.secondary
  );
  grivaMesh.position.set(0, currentY + grivaH / 2, 0);
  root.add(grivaMesh);
  currentY += grivaH;

  // ── 6. Crowning Shikhara Roof & Kalasam Finials ──
  if (params.archetype === 'vimana') {
    const domeH = Math.max(topW, topD) * 0.76 * params.heightMultiplier;
    const domeSides = params.style === 'chola' ? 8 : 4;
    const dome = new THREE.Mesh(
      createVimanaDomeGeometry(Math.max(grivaW, grivaD) * 1.18, domeH, domeSides),
      mats.roof
    );
    dome.position.set(0, currentY - 0.005, 0);
    root.add(dome);

    const kalasamH = 0.28 * params.heightMultiplier;
    const kalasamR = Math.max(0.055, grivaW * 0.14);

    // Solid lotus stupika pedestal seated cleanly onto the dome crown
    const stupikaH = 0.055;
    const stupika = new THREE.Mesh(
      new THREE.CylinderGeometry(kalasamR * 1.35, kalasamR * 1.75, stupikaH, domeSides === 8 ? 8 : 12),
      mats.cornice
    );
    stupika.position.set(0, currentY + domeH * 0.92, 0);
    root.add(stupika);

    const kalasam = new THREE.Mesh(
      createKalasamGeometry(kalasamH, kalasamR),
      mats.finial
    );
    kalasam.position.set(0, currentY + domeH * 0.92 + stupikaH * 0.45, 0);
    root.add(kalasam);
  } else {
    // Classic Dravidian Barrel-Vaulted Sala-Shikhara
    const roofL = topW * 0.96;
    const roofD = topD * 0.94;
    const roofH = Math.max(0.38, topD * 1.02) * params.heightMultiplier;

    const salaData = createSalaRoofGeometry(roofL, roofD, roofH);
    const salaRoof = new THREE.Mesh(salaData.geometry, mats.roof);
    salaRoof.position.set(0, currentY, 0);
    root.add(salaRoof);

    // Gable Mahanasika Horseshoe Frames at Left & Right Ends
    const gableGeo = createKuduArchGeometry(roofD * 0.92, roofH * 0.94, 0.045);
    const gableLeft = new THREE.Mesh(gableGeo, mats.cornice);
    gableLeft.rotation.y = -Math.PI / 2;
    gableLeft.position.set(
      -(roofL / 2 + salaData.bevelThickness * 0.35),
      currentY,
      0
    );
    root.add(gableLeft);

    const gableRight = new THREE.Mesh(gableGeo.clone(), mats.cornice);
    gableRight.rotation.y = Math.PI / 2;
    gableRight.position.set(
      roofL / 2 + salaData.bevelThickness * 0.35,
      currentY,
      0
    );
    root.add(gableRight);

    // Compute Kalasam dimensions first so the Ridge Stupika Spine supports every finial
    const kCount = Math.max(1, params.kalasamCount);
    const span = roofL * 0.72;
    const kHeight = Math.min(0.24, Math.max(0.14, roofL / (kCount * 1.65)));
    const kRadius = Math.min(0.045, Math.max(0.024, span / (kCount * 3.8)));

    // Actual apex of the bevelled Sala barrel vault is at currentY + roofH + salaData.bevelSize
    const vaultPeakY = currentY + roofH + salaData.bevelSize;
    const ridgeH = 0.065;
    const ridgeLength = Math.max(span + kRadius * 3.2, roofL * 0.88);
    const ridgeDepth = Math.max(kRadius * 2.5, roofD * 0.22);

    // Embed ridge spine firmly into the vault peak so there is zero gap
    const ridgeCenterY = vaultPeakY + ridgeH * 0.22;
    const ridgeTopY = ridgeCenterY + ridgeH * 0.5;
    const ridgeGeo = new THREE.BoxGeometry(ridgeLength, ridgeH, ridgeDepth);
    const ridge = new THREE.Mesh(ridgeGeo, mats.cornice);
    ridge.position.set(0, ridgeCenterY, 0);
    root.add(ridge);

    // Row of Lathe-Turned Kalasam Finials anchored cleanly onto the ridge spine
    const kalasamGeo = createKalasamGeometry(kHeight, kRadius);
    for (let k = 0; k < kCount; k++) {
      const kx = kCount === 1 ? 0 : (k / (kCount - 1) - 0.5) * span;
      const kalasam = new THREE.Mesh(kalasamGeo, mats.finial);
      kalasam.position.set(kx, ridgeTopY - 0.002, 0);
      root.add(kalasam);
    }
  }

  // Enable shadow casting & receiving across all composite meshes
  let triangleCount = 0;
  let meshCount = 0;
  root.traverse((obj) => {
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

  // Estimate printed PLA volume & weight at 15% infill + 2 walls
  const boundingVolCm3 = (widthMm * depthMm * heightMm) / 1000;
  const taperedFillFactor = params.archetype === 'vimana' ? 0.36 : 0.42;
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
    maxOverhangDeg: 45,
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
