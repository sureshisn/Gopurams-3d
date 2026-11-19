import {
  ChevronDown,
  ChevronUp,
  Shuffle,
  Sparkles,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { FINISH_CATALOG } from '../engine/gopuramMaterials';
import type {
  CameraPreset,
  GopuramArchetype,
  GopuramParams,
  GopuramStyle,
  LightingPreset,
  PortalStyle,
  PrintMetrics,
  TaperCurve,
} from '../engine/gopuramTypes';

interface StudioDockProps {
  params: GopuramParams;
  metrics: PrintMetrics | null;
  lighting: LightingPreset;
  cameraPreset: CameraPreset;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onChangeParams: (patch: Partial<GopuramParams>) => void;
  onRandomizeSeed: () => void;
  onApplySeedString: (val: string) => void;
  onOpen1000Gallery: () => void;
  onOpenPrintCheck: () => void;
  onChangeLighting: (l: LightingPreset) => void;
  onSelectCamera: (c: CameraPreset) => void;
}

type DockTab = 'style' | 'shape' | 'name' | 'look' | 'print';

export function StudioDock({
  params,
  metrics,
  lighting,
  cameraPreset,
  collapsed,
  onToggleCollapse,
  onChangeParams,
  onRandomizeSeed,
  onApplySeedString,
  onOpen1000Gallery,
  onOpenPrintCheck,
  onChangeLighting,
  onSelectCamera,
}: StudioDockProps) {
  const [dockTab, setDockTab] = useState<DockTab>('style');
  const [seedInput, setSeedInput] = useState(String(params.seed));

  useEffect(() => {
    setSeedInput(String(params.seed));
  }, [params.seed]);

  const handleSeedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onApplySeedString(seedInput);
  };

  const archetypes: { id: GopuramArchetype; label: string }[] = [
    { id: 'gopuram', label: 'Gopuram' },
    { id: 'vimana', label: 'Mandir' },
    { id: 'complex', label: 'Complex' },
    { id: 'relief', label: 'Wall Relief' },
  ];

  const styles: { id: GopuramStyle; label: string }[] = [
    { id: 'chola', label: 'Chola' },
    { id: 'pandya', label: 'Pandya' },
    { id: 'vijayanagara', label: 'Vijayanagara' },
    { id: 'nayak', label: 'Nayak' },
  ];

  const portals: { id: PortalStyle; label: string }[] = [
    { id: 'arched', label: 'Arched' },
    { id: 'cusped', label: 'Cusped' },
    { id: 'corbelled', label: 'Corbelled' },
    { id: 'stepped', label: 'Stepped' },
  ];

  const curves: { id: TaperCurve; label: string }[] = [
    { id: 'linear', label: 'Linear' },
    { id: 'concave', label: 'Concave' },
    { id: 'convex', label: 'Convex' },
    { id: 'stepped', label: 'Stepped' },
  ];

  const cameras: { id: CameraPreset; label: string }[] = [
    { id: 'perspective', label: '3/4 View' },
    { id: 'front', label: 'Front' },
    { id: 'side', label: 'Side' },
    { id: 'top', label: 'Top' },
  ];

  const lightings: { id: LightingPreset; label: string }[] = [
    { id: 'studio', label: 'Studio Daylight' },
    { id: 'golden', label: 'Golden Hour' },
    { id: 'dusk', label: 'Temple Dusk' },
  ];

  const isTower = params.archetype === 'gopuram' || params.archetype === 'complex';

  return (
    <div
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-20 w-[min(940px,94vw)] transition-transform duration-200 ease-out ${
        collapsed ? 'translate-y-[calc(100%-34px)]' : 'translate-y-0'
      }`}
    >
      {/* Top Collapse Handle */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-[#1E1916] bg-[#F7F3EC] border border-b-0 border-[#1E1916]/15 rounded-t-lg shadow-sm hover:bg-[#EFE9DF] cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#B8432A]"
        >
          {collapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
              Show Controls (H)
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              Hide Controls (H)
            </>
          )}
        </button>
      </div>

      {/* Main Dock Panel */}
      <div className="bg-[#F7F3EC] border border-[#1E1916]/15 rounded-xl shadow-lg p-4">
        {/* Reel 5-Step Dock Bar: Style · Shape · Name · Look · Print */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-3 border-b border-[#1E1916]/10">
          <div className="flex items-center gap-1 p-1 bg-[#EFE9DF] rounded-lg overflow-x-auto">
            {(
              [
                { id: 'style', label: 'Style' },
                { id: 'shape', label: 'Shape' },
                { id: 'name', label: 'Name & Seed' },
                { id: 'look', label: 'Look' },
                { id: 'print', label: 'Print' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setDockTab(t.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  dockTab === t.id
                    ? 'bg-[#F7F3EC] text-[#3B171E] shadow-xs'
                    : 'text-[#1E1916]/65 hover:text-[#1E1916]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRandomizeSeed}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#1E1916] bg-[#EFE9DF] hover:bg-[#E5DDD0] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Shuffle className="w-3.5 h-3.5" aria-hidden="true" />
              New Design
            </button>
            <button
              type="button"
              onClick={onOpen1000Gallery}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-[#F7F3EC] bg-[#B8432A] hover:bg-[#9E3620] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              1 Click = 1000+
            </button>
          </div>
        </div>

        {/* Step 1: Style (Archetype, Dynasty & Structural Add-ons) */}
        {dockTab === 'style' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-6 flex flex-col gap-1.5">
              <span className="text-xs font-medium text-[#1E1916]/75">
                Temple Archetype
              </span>
              <div className="flex items-center gap-1 p-1 bg-[#EFE9DF] rounded-lg">
                {archetypes.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() =>
                      onChangeParams({
                        archetype: a.id,
                        hasCourtyard: a.id === 'complex' ? true : a.id === 'relief' || a.id === 'vimana' ? false : params.hasCourtyard,
                        hasMandapam: a.id === 'complex' ? true : a.id === 'relief' || a.id === 'vimana' ? false : params.hasMandapam,
                      })
                    }
                    className={`flex-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      params.archetype === a.id
                        ? 'bg-[#F7F3EC] text-[#3B171E] shadow-xs'
                        : 'text-[#1E1916]/65 hover:text-[#1E1916]'
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="md:col-span-6 flex flex-col gap-1.5">
              <span className="text-xs font-medium text-[#1E1916]/75">
                Dynastic Proportion
              </span>
              <div className="flex items-center gap-1 p-1 bg-[#EFE9DF] rounded-lg">
                {styles.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onChangeParams({ style: s.id })}
                    className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      params.style === s.id
                        ? 'bg-[#F7F3EC] text-[#3B171E] shadow-xs'
                        : 'text-[#1E1916]/65 hover:text-[#1E1916]'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="md:col-span-12 flex flex-wrap items-center gap-4 pt-1">
              <label className="inline-flex items-center gap-2 text-xs text-[#1E1916]/85 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!isTower}
                  checked={isTower && params.hasCourtyard}
                  onChange={(e) => onChangeParams({ hasCourtyard: e.target.checked })}
                  className="accent-[#B8432A] w-3.5 h-3.5 disabled:opacity-40"
                />
                Prakaram Courtyard Walls
              </label>
              <label className="inline-flex items-center gap-2 text-xs text-[#1E1916]/85 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!isTower}
                  checked={isTower && params.hasMandapam}
                  onChange={(e) => onChangeParams({ hasMandapam: e.target.checked })}
                  className="accent-[#B8432A] w-3.5 h-3.5 disabled:opacity-40"
                />
                Mandapam Entrance Porch
              </label>
              <label className="inline-flex items-center gap-2 text-xs text-[#1E1916]/85 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!isTower}
                  checked={isTower && params.hasFlankingShrines}
                  onChange={(e) => onChangeParams({ hasFlankingShrines: e.target.checked })}
                  className="accent-[#B8432A] w-3.5 h-3.5 disabled:opacity-40"
                />
                Corner Gate Towers
              </label>
              <label className="inline-flex items-center gap-2 text-xs text-[#1E1916]/85 cursor-pointer">
                <input
                  type="checkbox"
                  checked={params.kuduDetail}
                  onChange={(e) => onChangeParams({ kuduDetail: e.target.checked })}
                  className="accent-[#B8432A] w-3.5 h-3.5"
                />
                Kudu Dormer Reliefs
              </label>
            </div>
          </div>
        )}

        {/* Step 2: Shape (Tiers, Proportions, Taper Curve & Portal) */}
        {dockTab === 'shape' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs">
                <span className="font-medium text-[#1E1916]/75">Storey Tiers (Talas)</span>
                <span className="font-mono-tabular font-medium text-[#3B171E]">
                  {params.tiers}
                </span>
              </div>
              <input
                type="range"
                min={3}
                max={11}
                step={1}
                disabled={params.archetype === 'relief'}
                value={params.tiers}
                onChange={(e) => onChangeParams({ tiers: Number(e.target.value) })}
                className="studio-slider w-full disabled:opacity-40"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs">
                <span className="font-medium text-[#1E1916]/75">Tower Height</span>
                <span className="font-mono-tabular font-medium text-[#3B171E]">
                  {params.heightMultiplier.toFixed(2)}×
                </span>
              </div>
              <input
                type="range"
                min={0.78}
                max={1.45}
                step={0.02}
                value={params.heightMultiplier}
                onChange={(e) =>
                  onChangeParams({ heightMultiplier: Number(e.target.value) })
                }
                className="studio-slider w-full"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs">
                <span className="font-medium text-[#1E1916]/75">Base Width Ratio</span>
                <span className="font-mono-tabular font-medium text-[#3B171E]">
                  {params.baseWidthRatio.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={1.0}
                max={2.2}
                step={0.05}
                value={params.baseWidthRatio}
                onChange={(e) =>
                  onChangeParams({ baseWidthRatio: Number(e.target.value) })
                }
                className="studio-slider w-full"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs">
                <span className="font-medium text-[#1E1916]/75">Kalasam Finials</span>
                <span className="font-mono-tabular font-medium text-[#3B171E]">
                  {params.archetype === 'vimana' ? 1 : params.kalasamCount}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={9}
                step={2}
                disabled={params.archetype === 'vimana' || params.archetype === 'relief'}
                value={params.archetype === 'vimana' ? 1 : params.kalasamCount}
                onChange={(e) => onChangeParams({ kalasamCount: Number(e.target.value) })}
                className="studio-slider w-full disabled:opacity-40"
              />
            </div>

            <div className="sm:col-span-2 flex flex-col gap-1.5">
              <span className="text-xs font-medium text-[#1E1916]/75">
                Taper Silhouette Curve
              </span>
              <div className="flex items-center gap-1 p-1 bg-[#EFE9DF] rounded-lg">
                {curves.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onChangeParams({ taperCurve: c.id })}
                    className={`flex-1 px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      params.taperCurve === c.id
                        ? 'bg-[#F7F3EC] text-[#3B171E] shadow-xs'
                        : 'text-[#1E1916]/65 hover:text-[#1E1916]'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="sm:col-span-2 flex flex-col gap-1.5">
              <span className="text-xs font-medium text-[#1E1916]/75">
                Vaasal Gateway Arch
              </span>
              <div className="flex items-center gap-1 p-1 bg-[#EFE9DF] rounded-lg">
                {portals.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onChangeParams({ portalStyle: p.id })}
                    className={`flex-1 px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      params.portalStyle === p.id
                        ? 'bg-[#F7F3EC] text-[#3B171E] shadow-xs'
                        : 'text-[#1E1916]/65 hover:text-[#1E1916]'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Name & Seed */}
        {dockTab === 'name' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <form onSubmit={handleSeedSubmit} className="md:col-span-6 flex flex-col gap-1.5">
              <label
                htmlFor="seed-input"
                className="text-xs font-medium text-[#1E1916]/75"
              >
                Seed Number or Inspiration Word
              </label>
              <div className="flex gap-1.5">
                <input
                  id="seed-input"
                  type="text"
                  value={seedInput}
                  onChange={(e) => setSeedInput(e.target.value)}
                  placeholder="e.g. 4821, Madurai, Thanjavur"
                  className="w-full px-2.5 py-1.5 text-xs font-mono-tabular bg-white border border-[#1E1916]/15 rounded-lg text-[#1E1916] focus:outline-2 focus:outline-[#B8432A]"
                />
                <button
                  type="submit"
                  className="px-3.5 py-1.5 text-xs font-medium bg-[#3B171E] text-[#F7F3EC] rounded-lg hover:bg-[#52212A] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Apply Seed
                </button>
              </div>
            </form>

            <div className="md:col-span-6 flex flex-col gap-1.5">
              <label
                htmlFor="custom-name-input"
                className="text-xs font-medium text-[#1E1916]/75"
              >
                Custom Temple Title (Optional)
              </label>
              <input
                id="custom-name-input"
                type="text"
                value={params.customName ?? ''}
                onChange={(e) => onChangeParams({ customName: e.target.value })}
                placeholder="e.g. Sri Meenakshi East Gopuram"
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#1E1916]/15 rounded-lg text-[#1E1916] focus:outline-2 focus:outline-[#B8432A]"
              />
            </div>
          </div>
        )}

        {/* Step 4: Look (Hand-Painted vs Filament Finishes + Camera + Lighting) */}
        {dockTab === 'look' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            <div className="md:col-span-7 flex flex-col gap-1.5">
              <span className="text-xs font-medium text-[#1E1916]/75">
                Surface Palette (Hand-painted Polychrome &amp; As-printed Materials)
              </span>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {FINISH_CATALOG.map((f) => {
                  const selected = params.finish === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => onChangeParams({ finish: f.id })}
                      className={`flex flex-col items-center gap-1 p-1.5 rounded-lg border text-center transition-colors cursor-pointer ${
                        selected
                          ? 'bg-white border-[#B8432A]'
                          : 'bg-[#EFE9DF]/70 border-transparent hover:border-[#1E1916]/20'
                      }`}
                    >
                      <span className="flex items-center w-full h-3.5 rounded overflow-hidden border border-[#1E1916]/10">
                        <span
                          className="flex-1 h-full"
                          style={{ backgroundColor: f.swatchPrimary }}
                        />
                        <span
                          className="flex-1 h-full"
                          style={{ backgroundColor: f.swatchSecondary }}
                        />
                        <span
                          className="w-2.5 h-full"
                          style={{ backgroundColor: f.swatchAccent }}
                        />
                      </span>
                      <span className="text-[11px] font-medium text-[#1E1916] whitespace-nowrap truncate max-w-full">
                        {f.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="md:col-span-5 flex flex-col gap-2">
              <div className="flex items-center gap-1 p-1 bg-[#EFE9DF] rounded-lg">
                {cameras.map((cam) => (
                  <button
                    key={cam.id}
                    type="button"
                    onClick={() => onSelectCamera(cam.id)}
                    className={`flex-1 px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      cameraPreset === cam.id
                        ? 'bg-[#F7F3EC] text-[#3B171E] shadow-xs'
                        : 'text-[#1E1916]/65 hover:text-[#1E1916]'
                    }`}
                  >
                    {cam.label}
                  </button>
                ))}
              </div>
              <select
                aria-label="Lighting preset"
                value={lighting}
                onChange={(e) => onChangeLighting(e.target.value as LightingPreset)}
                className="w-full px-2.5 py-1.5 text-xs font-medium bg-[#EFE9DF] border border-[#1E1916]/10 rounded-lg text-[#1E1916] cursor-pointer"
              >
                {lightings.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Step 5: Print Scale & Readiness */}
        {dockTab === 'print' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            <div className="md:col-span-5 flex flex-col gap-1.5">
              <div className="flex justify-between text-xs">
                <span className="font-medium text-[#1E1916]/75">STL Target Height</span>
                <span className="font-mono-tabular font-medium text-[#3B171E]">
                  {params.targetHeightMm} mm
                </span>
              </div>
              <input
                type="range"
                min={80}
                max={240}
                step={5}
                value={params.targetHeightMm}
                onChange={(e) =>
                  onChangeParams({ targetHeightMm: Number(e.target.value) })
                }
                className="studio-slider w-full"
              />
              <div className="text-[11px] text-[#1E1916]/60">
                Recommended: 0.16–0.20 mm layer height · 2 walls · 15% gyroid infill · 0 supports
              </div>
            </div>

            <div className="md:col-span-7 flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-[#EFE9DF]/70 border border-[#1E1916]/10">
              {metrics && (
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs font-mono-tabular">
                  <div>
                    <span className="text-[#1E1916]/55">Bed: </span>
                    <span className="font-semibold">
                      {metrics.widthMm} × {metrics.depthMm} × {metrics.heightMm} mm
                    </span>
                  </div>
                  <div>
                    <span className="text-[#1E1916]/55">Mass: </span>
                    <span className="font-semibold">{metrics.estimatedGrams} g PLA</span>
                  </div>
                  <div>
                    <span className="text-[#1E1916]/55">Overhang: </span>
                    <span className="font-semibold text-[#2C6E49]">
                      ≤ {metrics.maxOverhangDeg}° (No Supports)
                    </span>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={onOpenPrintCheck}
                className="px-3 py-1.5 text-xs font-semibold text-[#3B171E] bg-[#F7F3EC] border border-[#1E1916]/15 hover:bg-white rounded-md whitespace-nowrap shrink-0 cursor-pointer"
              >
                Full Print Check
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
