import type {
  GopuramArchetype,
  GopuramFinish,
  GopuramParams,
  GopuramStyle,
  PortalStyle,
  TaperCurve,
} from './gopuramTypes';

export function hashSeed(input: string | number): number {
  if (typeof input === 'number' && Number.isFinite(input)) {
    return (Math.abs(Math.floor(input)) || 104729) >>> 0;
  }
  const str = String(input).trim() || '104729';
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h || 104729) >>> 0;
}

export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function range(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

const ARCHETYPES: readonly GopuramArchetype[] = [
  'gopuram',
  'gopuram',
  'vimana',
  'complex',
  'relief',
];

const STYLES: readonly GopuramStyle[] = [
  'chola',
  'pandya',
  'vijayanagara',
  'nayak',
];

const FINISHES: readonly GopuramFinish[] = [
  'polychrome',
  'polychrome',
  'ivory',
  'granite',
  'sandstone',
  'limestone',
  'basalt',
];

const PORTALS: readonly PortalStyle[] = [
  'arched',
  'cusped',
  'corbelled',
  'stepped',
];

const TAPER_CURVES: readonly TaperCurve[] = [
  'linear',
  'concave',
  'convex',
  'stepped',
];

export function generateGopuramParamsFromSeed(
  rawSeed: number | string,
  overrides?: Partial<GopuramParams>
): GopuramParams {
  const seed = hashSeed(rawSeed);
  const rng = createRng(seed);

  const archetype = overrides?.archetype ?? pick(rng, ARCHETYPES);
  const style = overrides?.style ?? pick(rng, STYLES);
  const finish = overrides?.finish ?? pick(rng, FINISHES);

  let tiers = 5;
  let baseWidthRatio = 1.65;
  let heightMultiplier = 1.05;
  let taperExponent = 0.95;
  let taperCurve: TaperCurve = pick(rng, TAPER_CURVES);

  if (style === 'chola') {
    tiers = Math.floor(range(rng, 4, 7.9));
    baseWidthRatio = archetype === 'vimana' ? range(rng, 1.0, 1.12) : range(rng, 1.48, 1.78);
    heightMultiplier = range(rng, 0.95, 1.2);
    taperExponent = range(rng, 0.85, 1.12);
    taperCurve = rng() > 0.35 ? 'linear' : 'stepped';
  } else if (style === 'pandya') {
    tiers = Math.floor(range(rng, 5, 9.9));
    baseWidthRatio = archetype === 'vimana' ? range(rng, 1.0, 1.1) : range(rng, 1.55, 1.88);
    heightMultiplier = range(rng, 1.05, 1.3);
    taperExponent = range(rng, 0.72, 0.98);
    taperCurve = rng() > 0.3 ? 'concave' : 'linear';
  } else if (style === 'vijayanagara') {
    tiers = Math.floor(range(rng, 4, 8.9));
    baseWidthRatio = archetype === 'vimana' ? range(rng, 1.02, 1.15) : range(rng, 1.65, 2.02);
    heightMultiplier = range(rng, 0.92, 1.18);
    taperExponent = range(rng, 0.92, 1.2);
    taperCurve = rng() > 0.4 ? 'stepped' : 'convex';
  } else {
    tiers = Math.floor(range(rng, 7, 11.4));
    baseWidthRatio = archetype === 'vimana' ? range(rng, 1.0, 1.08) : range(rng, 1.62, 2.05);
    heightMultiplier = range(rng, 1.12, 1.38);
    taperExponent = range(rng, 0.68, 0.94);
    taperCurve = 'concave';
  }

  if (archetype === 'vimana') {
    tiers = Math.min(tiers, 5);
  } else if (archetype === 'relief') {
    tiers = Math.max(3, Math.min(5, tiers));
    baseWidthRatio = range(rng, 1.25, 1.55);
  }

  const portalStyle =
    overrides?.portalStyle ??
    (archetype === 'vimana' || archetype === 'relief' ? 'cusped' : pick(rng, PORTALS));
  const portalScale = range(rng, 0.25, 0.38);
  const shrineDensity = Math.floor(range(rng, 2, 5.8));
  const corniceProjection = range(rng, 0.055, 0.11);

  const kalasamOptions = archetype === 'vimana' ? [1] : [3, 5, 7, 9];
  const kalasamCount =
    overrides?.kalasamCount ??
    (archetype === 'vimana'
      ? 1
      : kalasamOptions[Math.min(kalasamOptions.length - 1, Math.floor(rng() * kalasamOptions.length))]);

  const hasCourtyard =
    overrides?.hasCourtyard ?? (archetype === 'complex' ? true : rng() > 0.72);
  const hasMandapam =
    overrides?.hasMandapam ?? (archetype === 'complex' ? true : rng() > 0.7);
  const hasFlankingShrines =
    overrides?.hasFlankingShrines ?? (archetype === 'complex' ? rng() > 0.2 : rng() > 0.85);

  return {
    seed,
    archetype,
    style,
    finish,
    tiers,
    baseWidthRatio: Number(baseWidthRatio.toFixed(2)),
    heightMultiplier: Number(heightMultiplier.toFixed(2)),
    taperExponent: Number(taperExponent.toFixed(2)),
    taperCurve,
    portalStyle,
    portalScale: Number(portalScale.toFixed(2)),
    shrineDensity,
    corniceProjection: Number(corniceProjection.toFixed(3)),
    kalasamCount,
    hasCourtyard,
    hasMandapam,
    hasFlankingShrines,
    kuduDetail: rng() > 0.12,
    targetHeightMm: 140,
    ...overrides,
  };
}

const STYLE_LABELS: Record<GopuramStyle, string> = {
  chola: 'Chola',
  pandya: 'Pandya',
  vijayanagara: 'Vijayanagara',
  nayak: 'Nayak',
};

const ARCHETYPE_LABELS: Record<GopuramArchetype, string> = {
  gopuram: 'Gopuram',
  vimana: 'Mandir Vimana',
  complex: 'Temple Complex',
  relief: 'Wall Relief',
};

export function formatGopuramTitle(params: GopuramParams): string {
  if (params.customName && params.customName.trim().length > 0) {
    return params.customName.trim();
  }
  return `${STYLE_LABELS[params.style]} ${ARCHETYPE_LABELS[params.archetype]}`;
}
