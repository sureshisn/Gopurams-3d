import { ChevronLeft, ChevronRight, Download, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { buildGopuramGroup, disposeBuiltGopuram } from '../engine/gopuramGenerator';
import { FINISH_CATALOG } from '../engine/gopuramMaterials';
import type {
  GalleryEntry,
  GopuramArchetype,
  GopuramFinish,
  GopuramParams,
} from '../engine/gopuramTypes';
import { formatGopuramTitle, generateGopuramParamsFromSeed } from '../engine/prng';
import { exportGroupToBinarySTL } from '../engine/stlExporter';
import { thumbnailRenderer } from '../engine/thumbnailRenderer';

interface Gallery1000Props {
  baseBatchSeed: number;
  onRegenerateBatch: () => void;
  onSelectGopuram: (params: GopuramParams) => void;
}

const TOTAL_COUNT = 1008;
const PAGE_SIZE = 28; // 7 columns x 4 rows matching the reel layout

export function Gallery1000({
  baseBatchSeed,
  onRegenerateBatch,
  onSelectGopuram,
}: Gallery1000Props) {
  const [archetypeFilter, setArchetypeFilter] = useState<'all' | GopuramArchetype>('all');
  const [finishFilter, setFinishFilter] = useState<'all' | GopuramFinish>('all');
  const [page, setPage] = useState(0);
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});

  // Deterministically generate all 1,008 unique gopuram specs in milliseconds
  const allEntries = useMemo<GalleryEntry[]>(() => {
    const entries: GalleryEntry[] = [];
    for (let i = 0; i < TOTAL_COUNT; i++) {
      const seed = (baseBatchSeed + i * 7919 + 104729) >>> 0;
      const params = generateGopuramParamsFromSeed(seed);
      entries.push({
        index: i,
        seed,
        params,
        label: formatGopuramTitle(params),
      });
    }
    return entries;
  }, [baseBatchSeed]);

  const filteredEntries = useMemo(() => {
    return allEntries.filter((entry) => {
      if (archetypeFilter !== 'all' && entry.params.archetype !== archetypeFilter) {
        return false;
      }
      if (finishFilter !== 'all' && entry.params.finish !== finishFilter) {
        return false;
      }
      return true;
    });
  }, [allEntries, archetypeFilter, finishFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);

  const visibleEntries = useMemo(() => {
    const start = safePage * PAGE_SIZE;
    return filteredEntries.slice(start, start + PAGE_SIZE);
  }, [filteredEntries, safePage]);

  // Reset page when filters or batch change
  useEffect(() => {
    setPage(0);
  }, [archetypeFilter, finishFilter, baseBatchSeed]);

  // Progressive non-blocking 3D WebGL thumbnail rendering (2 per animation frame)
  useEffect(() => {
    let cancelled = false;
    let rafId = 0;

    // Immediately load any cached thumbnails
    const initialMap: Record<number, string> = {};
    const pending: GalleryEntry[] = [];

    for (const entry of visibleEntries) {
      const key = `${entry.params.seed}_${entry.params.finish}_${entry.params.archetype}_${entry.params.tiers}`;
      const cached = thumbnailRenderer.getCached(key);
      if (cached) {
        initialMap[entry.seed] = cached;
      } else {
        pending.push(entry);
      }
    }

    setThumbnails((prev) => ({ ...prev, ...initialMap }));

    if (pending.length === 0) return;

    let cursor = 0;
    const step = () => {
      if (cancelled) return;
      const batch: Record<number, string> = {};
      const limit = Math.min(cursor + 2, pending.length);
      for (; cursor < limit; cursor++) {
        const entry = pending[cursor];
        const url = thumbnailRenderer.renderThumbnail(entry.params);
        if (url) {
          batch[entry.seed] = url;
        }
      }
      if (Object.keys(batch).length > 0) {
        setThumbnails((prev) => ({ ...prev, ...batch }));
      }
      if (cursor < pending.length) {
        rafId = requestAnimationFrame(step);
      }
    };

    rafId = requestAnimationFrame(step);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [visibleEntries]);

  const handleQuickSTL = (e: React.MouseEvent, params: GopuramParams) => {
    e.stopPropagation();
    const built = buildGopuramGroup(params);
    exportGroupToBinarySTL(
      built.group,
      params.targetHeightMm,
      `gopuram-${params.style}-${params.seed}.stl`
    );
    disposeBuiltGopuram(built);
  };

  return (
    <main className="min-h-[calc(100vh-57px)] bg-[#F7F3EC] px-6 py-8">
      <div className="max-w-7xl mx-auto">
        {/* Reel-Inspired Showcase Header Card */}
        <section className="bg-[#FAF7F2] border border-[#3B171E]/20 rounded-2xl p-6 md:p-8 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b border-[#1E1916]/10">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <span className="font-display text-5xl md:text-6xl font-semibold tracking-tight text-[#5E1A22] font-mono-tabular">
                1,008
              </span>
              <div>
                <h1 className="font-display text-2xl md:text-3xl font-semibold text-[#1E1916] tracking-tight">
                  new gopurams
                </h1>
                <p className="mt-1 text-sm text-[#1E1916]/65">
                  every one different · all print-ready · click any tower to inspect or export STL
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onRegenerateBatch}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-[#F7F3EC] bg-[#B8432A] hover:bg-[#9E3620] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" aria-hidden="true" />
                1 Click = 1,000+ New
              </button>
            </div>
          </div>

          {/* Filter Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 bg-[#EFE9DF] rounded-lg">
                {(
                  [
                    { id: 'all', label: 'All Structures' },
                    { id: 'gopuram', label: 'Gopurams' },
                    { id: 'vimana', label: 'Vimanas' },
                    { id: 'complex', label: 'Complexes' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setArchetypeFilter(item.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      archetypeFilter === item.id
                        ? 'bg-white text-[#3B171E] shadow-xs'
                        : 'text-[#1E1916]/65 hover:text-[#1E1916]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <select
                aria-label="Filter by material finish"
                value={finishFilter}
                onChange={(e) =>
                  setFinishFilter(e.target.value as 'all' | GopuramFinish)
                }
                className="px-3 py-2 text-xs font-medium bg-[#EFE9DF] border border-[#1E1916]/10 rounded-lg text-[#1E1916] cursor-pointer"
              >
                <option value="all">All Finishes</option>
                {FINISH_CATALOG.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3 text-xs font-mono-tabular text-[#1E1916]/65">
              <span>
                Showing {filteredEntries.length === 0 ? 0 : safePage * PAGE_SIZE + 1}–
                {Math.min((safePage + 1) * PAGE_SIZE, filteredEntries.length)} of{' '}
                {filteredEntries.length.toLocaleString()}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={safePage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  aria-label="Previous page"
                  className="p-1.5 rounded-md bg-[#EFE9DF] hover:bg-[#E4DDD0] disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2">
                  {safePage + 1} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages - 1}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  aria-label="Next page"
                  className="p-1.5 rounded-md bg-[#EFE9DF] hover:bg-[#E4DDD0] disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* 7-Column Tile Grid Matching Reel Thumbnail */}
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 pt-2">
            {visibleEntries.map((entry) => {
              const thumbUrl = thumbnails[entry.seed];
              return (
                <div
                  key={entry.seed}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectGopuram(entry.params)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectGopuram(entry.params);
                    }
                  }}
                  className="group relative flex flex-col items-center bg-[#EFE9DF]/75 hover:bg-[#EFE9DF] border border-[#1E1916]/8 hover:border-[#B8432A]/45 rounded-xl p-2 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#B8432A]"
                >
                  <div className="relative w-full aspect-square flex items-center justify-center overflow-hidden rounded-lg bg-[#F5F1E9]">
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt={`${entry.label} seed ${entry.seed}`}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-contain transition-transform duration-200 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-[11px] font-mono-tabular text-[#1E1916]/40">
                        <span>#{entry.seed % 10000}</span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={(e) => handleQuickSTL(e, entry.params)}
                      title={`Download STL (${entry.label})`}
                      aria-label={`Download STL for seed ${entry.seed}`}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 absolute top-1.5 right-1.5 p-1.5 rounded-md bg-[#3B171E] text-[#F7F3EC] shadow-sm transition-opacity cursor-pointer"
                    >
                      <Download className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="mt-1.5 w-full flex items-center justify-between gap-1 px-0.5 text-[11px]">
                    <span className="font-medium text-[#1E1916]/85 truncate">
                      {entry.params.tiers}T · {entry.params.style}
                    </span>
                    <span className="font-mono-tabular text-[#1E1916]/50 shrink-0">
                      #{entry.seed % 10000}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
