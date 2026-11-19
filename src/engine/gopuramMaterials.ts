import * as THREE from 'three';
import type { GopuramFinish } from './gopuramTypes';

export interface GopuramMaterialSet {
  primary: THREE.MeshStandardMaterial;
  secondary: THREE.MeshStandardMaterial;
  cornice: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  finial: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  plinth: THREE.MeshStandardMaterial;
  nicheInterior: THREE.MeshStandardMaterial;
  portalVoid: THREE.MeshStandardMaterial;
  dispose: () => void;
}

export interface FinishMetadata {
  id: GopuramFinish;
  name: string;
  category: 'painted' | 'printed';
  swatchPrimary: string;
  swatchSecondary: string;
  swatchAccent: string;
}

export const FINISH_CATALOG: readonly FinishMetadata[] = [
  {
    id: 'polychrome',
    name: 'Hand-painted',
    category: 'painted',
    swatchPrimary: '#F3E9D4',
    swatchSecondary: '#D44C3B',
    swatchAccent: '#5C9EC9',
  },
  {
    id: 'ivory',
    name: 'Ivory PLA',
    category: 'printed',
    swatchPrimary: '#F1ECE1',
    swatchSecondary: '#E3DBC9',
    swatchAccent: '#D8CEBA',
  },
  {
    id: 'granite',
    name: 'Granite Stone',
    category: 'printed',
    swatchPrimary: '#7F7869',
    swatchSecondary: '#645E51',
    swatchAccent: '#978F7E',
  },
  {
    id: 'sandstone',
    name: 'Terracotta',
    category: 'printed',
    swatchPrimary: '#C07A48',
    swatchSecondary: '#985B31',
    swatchAccent: '#D69564',
  },
  {
    id: 'limestone',
    name: 'Chalk White',
    category: 'printed',
    swatchPrimary: '#F7F5F0',
    swatchSecondary: '#E4E0D7',
    swatchAccent: '#CCC6BA',
  },
  {
    id: 'basalt',
    name: 'Basalt & Bronze',
    category: 'printed',
    swatchPrimary: '#3D3B38',
    swatchSecondary: '#2C2A28',
    swatchAccent: '#B58B42',
  },
];

let cachedStoneBumpMap: THREE.CanvasTexture | null = null;
let cachedRoughnessMap: THREE.CanvasTexture | null = null;
let cachedDiffuseGrainMap: THREE.CanvasTexture | null = null;

function createProceduralMaps() {
  if (typeof document === 'undefined') {
    return {
      bumpMap: null,
      roughnessMap: null,
      diffuseMap: null,
    };
  }
  if (cachedStoneBumpMap && cachedRoughnessMap && cachedDiffuseGrainMap) {
    return {
      bumpMap: cachedStoneBumpMap,
      roughnessMap: cachedRoughnessMap,
      diffuseMap: cachedDiffuseGrainMap,
    };
  }

  const size = 512;
  const makeCanvas = () => {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    return c;
  };

  const bumpCanvas = makeCanvas();
  const roughCanvas = makeCanvas();
  const diffCanvas = makeCanvas();

  const bCtx = bumpCanvas.getContext('2d');
  const rCtx = roughCanvas.getContext('2d');
  const dCtx = diffCanvas.getContext('2d');

  if (bCtx && rCtx && dCtx) {
    const bImg = bCtx.createImageData(size, size);
    const rImg = rCtx.createImageData(size, size);
    const dImg = dCtx.createImageData(size, size);

    let seed = 918273;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    for (let y = 0; y < size; y++) {
      // Subtle chiselled stone / horizontal 3D-print micro-striation
      const rowWave = Math.sin((y / size) * Math.PI * 110) * 6;
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const n1 = (rand() - 0.5) * 24;
        const n2 = Math.sin(x * 0.07) * Math.cos(y * 0.05) * 6;
        const speck = rand() > 0.985 ? -26 : rand() < 0.012 ? 20 : 0;

        const bVal = Math.max(0, Math.min(255, Math.round(128 + n1 + rowWave + speck * 0.5)));
        bImg.data[idx] = bVal;
        bImg.data[idx + 1] = bVal;
        bImg.data[idx + 2] = bVal;
        bImg.data[idx + 3] = 255;

        const rVal = Math.max(120, Math.min(255, Math.round(215 + n1 * 0.8 + n2)));
        rImg.data[idx] = rVal;
        rImg.data[idx + 1] = rVal;
        rImg.data[idx + 2] = rVal;
        rImg.data[idx + 3] = 255;

        // Subtle warm/mineral brightness variation around pure white (242..255) so vertex/material color tints cleanly
        const dVal = Math.max(228, Math.min(255, Math.round(248 + n1 * 0.32 + n2 * 0.35 + speck * 0.25)));
        dImg.data[idx] = dVal;
        dImg.data[idx + 1] = dVal;
        dImg.data[idx + 2] = Math.max(222, dVal - 2);
        dImg.data[idx + 3] = 255;
      }
    }

    bCtx.putImageData(bImg, 0, 0);
    rCtx.putImageData(rImg, 0, 0);
    dCtx.putImageData(dImg, 0, 0);
  }

  const configure = (tex: THREE.CanvasTexture, srgb: boolean) => {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    return tex;
  };

  cachedStoneBumpMap = configure(new THREE.CanvasTexture(bumpCanvas), false);
  cachedRoughnessMap = configure(new THREE.CanvasTexture(roughCanvas), false);
  cachedDiffuseGrainMap = configure(new THREE.CanvasTexture(diffCanvas), true);

  return {
    bumpMap: cachedStoneBumpMap,
    roughnessMap: cachedRoughnessMap,
    diffuseMap: cachedDiffuseGrainMap,
  };
}

export function createGopuramMaterials(
  finish: GopuramFinish,
  wireframe = false
): GopuramMaterialSet {
  const { bumpMap, roughnessMap, diffuseMap } = createProceduralMaps();

  const configs: Record<
    GopuramFinish,
    {
      primary: number;
      secondary: number;
      cornice: number;
      roof: number;
      finial: number;
      accent: number;
      plinth: number;
      nicheInterior: number;
      portalVoid: number;
      roughness: number;
      finialMetalness: number;
      finialRoughness: number;
      bumpScale: number;
    }
  > = {
    // Authentic South Indian Sudhai Polychrome as seen in the Gopuram Studio screenshots
    polychrome: {
      primary: 0xf4ead6,      // Warm lime-stucco temple body
      secondary: 0xecd8b6,    // Warm sandstone pilaster / pier trim
      cornice: 0xd84e3d,      // Vermilion terracotta Kapota eaves & moldings
      roof: 0xf0aa38,         // Golden ochre Sala-Shikhara & Kuta pavilions
      finial: 0xf3bc33,       // Burnished temple brass/gold Kalasams & medallions
      accent: 0x5c9ec9,       // Traditional cerulean-blue Dravidian pilasters
      plinth: 0xe3dac6,       // Carved limestone Adhishthanam & courtyard slab
      nicheInterior: 0x8f222d,// Deep temple crimson Devakoshta arch recesses
      portalVoid: 0x3b2c25,   // Dark sanctum wood / passage shadow
      roughness: 0.68,
      finialMetalness: 0.42,
      finialRoughness: 0.28,
      bumpScale: 0.01,
    },
    ivory: {
      primary: 0xf2ede2,
      secondary: 0xe7e0d2,
      cornice: 0xede6d8,
      roof: 0xf0eadc,
      finial: 0xf5f0e6,
      accent: 0xe0d8c7,
      plinth: 0xe3dbc9,
      nicheInterior: 0xc9bfa9,
      portalVoid: 0xb0a691,
      roughness: 0.72,
      finialMetalness: 0.05,
      finialRoughness: 0.56,
      bumpScale: 0.008,
    },
    granite: {
      primary: 0x837c6d,
      secondary: 0x6c6558,
      cornice: 0x766f61,
      roof: 0x716a5c,
      finial: 0xa19784,
      accent: 0x918979,
      plinth: 0x5f594d,
      nicheInterior: 0x454037,
      portalVoid: 0x2a2722,
      roughness: 0.88,
      finialMetalness: 0.14,
      finialRoughness: 0.58,
      bumpScale: 0.024,
    },
    sandstone: {
      primary: 0xc57f4b,
      secondary: 0xa76435,
      cornice: 0xb7713f,
      roof: 0xba723f,
      finial: 0xdba056,
      accent: 0xd99c6a,
      plinth: 0x8e552d,
      nicheInterior: 0x6d3b1e,
      portalVoid: 0x3b2214,
      roughness: 0.84,
      finialMetalness: 0.15,
      finialRoughness: 0.52,
      bumpScale: 0.02,
    },
    limestone: {
      primary: 0xf7f5f0,
      secondary: 0xe8e4db,
      cornice: 0xf0ede5,
      roof: 0xf2efe7,
      finial: 0xe7d6a5,
      accent: 0xdcd7cd,
      plinth: 0xded9cf,
      nicheInterior: 0xc2bcb0,
      portalVoid: 0x9d978c,
      roughness: 0.68,
      finialMetalness: 0.35,
      finialRoughness: 0.38,
      bumpScale: 0.008,
    },
    basalt: {
      primary: 0x3f3d3a,
      secondary: 0x312f2c,
      cornice: 0x494540,
      roof: 0x3a3734,
      finial: 0xc89d47,
      accent: 0x5b564f,
      plinth: 0x2a2825,
      nicheInterior: 0x1e1d1b,
      portalVoid: 0x141312,
      roughness: 0.78,
      finialMetalness: 0.84,
      finialRoughness: 0.24,
      bumpScale: 0.018,
    },
  };

  const c = configs[finish];

  const makeMat = (
    color: number,
    roughness: number,
    metalness = 0.04,
    bumpScale = c.bumpScale,
    useDiffuse = true
  ) =>
    new THREE.MeshStandardMaterial({
      color,
      map: useDiffuse ? diffuseMap : null,
      roughness,
      roughnessMap,
      metalness,
      bumpMap,
      bumpScale,
      wireframe,
    });

  const primary = makeMat(c.primary, c.roughness);
  const secondary = makeMat(c.secondary, Math.min(1, c.roughness + 0.04));
  const cornice = makeMat(c.cornice, Math.max(0.25, c.roughness - 0.04));
  const roof = makeMat(c.roof, Math.max(0.25, c.roughness - 0.05));
  const finial = makeMat(c.finial, c.finialRoughness, c.finialMetalness, 0.004, false);
  const accent = makeMat(c.accent, c.roughness);
  const plinth = makeMat(c.plinth, Math.min(1, c.roughness + 0.08));
  const nicheInterior = makeMat(c.nicheInterior, Math.min(1, c.roughness + 0.14), 0.02, c.bumpScale * 0.5);
  const portalVoid = new THREE.MeshStandardMaterial({
    color: c.portalVoid,
    roughness: 0.94,
    metalness: 0.02,
    wireframe,
  });

  const all = [
    primary,
    secondary,
    cornice,
    roof,
    finial,
    accent,
    plinth,
    nicheInterior,
    portalVoid,
  ];

  return {
    primary,
    secondary,
    cornice,
    roof,
    finial,
    accent,
    plinth,
    nicheInterior,
    portalVoid,
    dispose: () => {
      all.forEach((m) => m.dispose());
    },
  };
}
