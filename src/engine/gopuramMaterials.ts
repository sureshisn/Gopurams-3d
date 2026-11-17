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
  portalVoid: THREE.MeshStandardMaterial;
  dispose: () => void;
}

export interface FinishMetadata {
  id: GopuramFinish;
  name: string;
  swatchPrimary: string;
  swatchSecondary: string;
  swatchAccent: string;
}

export const FINISH_CATALOG: readonly FinishMetadata[] = [
  {
    id: 'ivory',
    name: 'Ivory PLA',
    swatchPrimary: '#F1ECE1',
    swatchSecondary: '#E3DBC9',
    swatchAccent: '#D8CEBA',
  },
  {
    id: 'polychrome',
    name: 'Polychrome',
    swatchPrimary: '#EFE5D3',
    swatchSecondary: '#C84E2C',
    swatchAccent: '#3D6F9A',
  },
  {
    id: 'granite',
    name: 'Granite Stone',
    swatchPrimary: '#7F7869',
    swatchSecondary: '#645E51',
    swatchAccent: '#978F7E',
  },
  {
    id: 'sandstone',
    name: 'Terracotta',
    swatchPrimary: '#C07A48',
    swatchSecondary: '#985B31',
    swatchAccent: '#D69564',
  },
  {
    id: 'limestone',
    name: 'Chalk White',
    swatchPrimary: '#F7F5F0',
    swatchSecondary: '#E4E0D7',
    swatchAccent: '#CCC6BA',
  },
  {
    id: 'basalt',
    name: 'Basalt & Bronze',
    swatchPrimary: '#3D3B38',
    swatchSecondary: '#2C2A28',
    swatchAccent: '#B58B42',
  },
];

let cachedStoneBumpMap: THREE.CanvasTexture | null = null;

function getProceduralStoneBumpMap(): THREE.CanvasTexture {
  if (cachedStoneBumpMap) return cachedStoneBumpMap;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);

    // Subtle micro-grain for stone / 3D-printed matte PLA feel
    let seed = 918273;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    const imgData = ctx.getImageData(0, 0, size, size);
    const data = imgData.data;
    for (let y = 0; y < size; y++) {
      // Very subtle horizontal micro-striation reminiscent of layer lines or chiselled stone
      const rowBias = Math.sin((y / size) * Math.PI * 64) * 5;
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const grain = (rand() - 0.5) * 26 + rowBias;
        const v = Math.max(0, Math.min(255, Math.round(128 + grain)));
        data[idx] = v;
        data[idx + 1] = v;
        data[idx + 2] = v;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  // Data / bump map stays linear (NoColorSpace)
  texture.colorSpace = THREE.NoColorSpace;
  cachedStoneBumpMap = texture;
  return texture;
}

export function createGopuramMaterials(
  finish: GopuramFinish,
  wireframe = false
): GopuramMaterialSet {
  const bumpMap = getProceduralStoneBumpMap();

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
      portalVoid: number;
      roughness: number;
      finialMetalness: number;
      finialRoughness: number;
      bumpScale: number;
    }
  > = {
    ivory: {
      primary: 0xf1ece0,
      secondary: 0xe6dfd0,
      cornice: 0xebe4d6,
      roof: 0xeee8db,
      finial: 0xf5f0e5,
      accent: 0xdfd7c7,
      plinth: 0xe2dac9,
      portalVoid: 0xc2b9a7,
      roughness: 0.72,
      finialMetalness: 0.06,
      finialRoughness: 0.58,
      bumpScale: 0.008,
    },
    polychrome: {
      primary: 0xf2ead9,
      secondary: 0xdf8e3b,
      cornice: 0xc74d2c,
      roof: 0xcb4a2a,
      finial: 0xdca02a,
      accent: 0x3b6f9c,
      plinth: 0xb9aa96,
      portalVoid: 0x3a2a24,
      roughness: 0.65,
      finialMetalness: 0.78,
      finialRoughness: 0.24,
      bumpScale: 0.012,
    },
    granite: {
      primary: 0x7e7768,
      secondary: 0x686154,
      cornice: 0x736c5e,
      roof: 0x6f685a,
      finial: 0x9b927f,
      accent: 0x8b8373,
      plinth: 0x5c564a,
      portalVoid: 0x2c2924,
      roughness: 0.88,
      finialMetalness: 0.12,
      finialRoughness: 0.65,
      bumpScale: 0.022,
    },
    sandstone: {
      primary: 0xc47e49,
      secondary: 0xa46233,
      cornice: 0xb56f3d,
      roof: 0xb8703c,
      finial: 0xd99b52,
      accent: 0xd79966,
      plinth: 0x8c532b,
      portalVoid: 0x3c2315,
      roughness: 0.84,
      finialMetalness: 0.15,
      finialRoughness: 0.52,
      bumpScale: 0.02,
    },
    limestone: {
      primary: 0xf6f4ef,
      secondary: 0xe7e3da,
      cornice: 0xefece4,
      roof: 0xf2efe7,
      finial: 0xe6d4a2,
      accent: 0xd9d4ca,
      plinth: 0xdcd7cd,
      portalVoid: 0xb5afa3,
      roughness: 0.68,
      finialMetalness: 0.35,
      finialRoughness: 0.38,
      bumpScale: 0.008,
    },
    basalt: {
      primary: 0x3b3936,
      secondary: 0x2e2c2a,
      cornice: 0x45423e,
      roof: 0x363431,
      finial: 0xc59a45,
      accent: 0x56524c,
      plinth: 0x272523,
      portalVoid: 0x171615,
      roughness: 0.8,
      finialMetalness: 0.85,
      finialRoughness: 0.22,
      bumpScale: 0.018,
    },
  };

  const c = configs[finish];

  const makeMat = (
    color: number,
    roughness: number,
    metalness = 0.04,
    bumpScale = c.bumpScale
  ) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      bumpMap,
      bumpScale,
      wireframe,
    });

  const primary = makeMat(c.primary, c.roughness);
  const secondary = makeMat(c.secondary, Math.min(1, c.roughness + 0.05));
  const cornice = makeMat(c.cornice, Math.max(0.25, c.roughness - 0.05));
  const roof = makeMat(c.roof, Math.max(0.25, c.roughness - 0.04));
  const finial = makeMat(c.finial, c.finialRoughness, c.finialMetalness, 0.004);
  const accent = makeMat(c.accent, c.roughness);
  const plinth = makeMat(c.plinth, Math.min(1, c.roughness + 0.08));
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
    portalVoid,
    dispose: () => {
      all.forEach((m) => m.dispose());
    },
  };
}
