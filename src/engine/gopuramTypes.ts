export type GopuramArchetype = 'gopuram' | 'vimana' | 'complex';

export type GopuramStyle = 'chola' | 'pandya' | 'vijayanagara' | 'nayak';

export type GopuramFinish =
  | 'ivory'
  | 'polychrome'
  | 'granite'
  | 'sandstone'
  | 'limestone'
  | 'basalt';

export type PortalStyle = 'arched' | 'corbelled' | 'mandapa' | 'stepped';

export type TaperCurve = 'linear' | 'concave' | 'convex' | 'stepped';

export type LightingPreset = 'studio' | 'golden' | 'dusk';

export type CameraPreset = 'perspective' | 'front' | 'side' | 'top';

export interface GopuramParams {
  seed: number;
  archetype: GopuramArchetype;
  style: GopuramStyle;
  finish: GopuramFinish;
  tiers: number; // 3 to 11
  baseWidthRatio: number; // 1.0 to 2.2 (width / depth)
  heightMultiplier: number; // 0.78 to 1.45
  taperExponent: number; // 0.65 to 1.45
  taperCurve: TaperCurve;
  portalStyle: PortalStyle;
  portalScale: number; // 0.24 to 0.42
  shrineDensity: number; // 2 to 6 bays per half-side
  corniceProjection: number; // 0.04 to 0.14
  kalasamCount: number; // 1, 3, 5, 7, 9
  hasCourtyard: boolean;
  hasMandapam: boolean;
  hasFlankingShrines: boolean;
  kuduDetail: boolean;
  targetHeightMm: number; // 80 to 240
}

export interface PrintMetrics {
  widthMm: number;
  depthMm: number;
  heightMm: number;
  triangleCount: number;
  meshCount: number;
  estimatedVolumeCm3: number;
  estimatedGrams: number;
  estimatedPrintMinutes: number;
  maxOverhangDeg: number;
}

export interface GalleryEntry {
  index: number;
  seed: number;
  params: GopuramParams;
  label: string;
}
