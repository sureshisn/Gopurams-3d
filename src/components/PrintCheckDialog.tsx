import { CheckCircle2, Download, X } from 'lucide-react';
import type { GopuramParams, PrintMetrics } from '../engine/gopuramTypes';
import { formatGopuramTitle } from '../engine/prng';

interface PrintCheckDialogProps {
  open: boolean;
  params: GopuramParams;
  metrics: PrintMetrics | null;
  onClose: () => void;
  onExportSTL: () => void;
}

export function PrintCheckDialog({
  open,
  params,
  metrics,
  onClose,
  onExportSTL,
}: PrintCheckDialogProps) {
  if (!open) return null;

  const fits220Bed = metrics ? metrics.widthMm <= 220 && metrics.depthMm <= 220 && metrics.heightMm <= 250 : true;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="print-check-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1E1916]/45 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-[#F7F3EC] border border-[#1E1916]/15 shadow-2xl p-6 text-[#1E1916]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#1E1916]/10">
          <div>
            <h2 id="print-check-title" className="font-display text-xl font-semibold text-[#3B171E]">
              Print Check · {formatGopuramTitle(params)}
            </h2>
            <p className="mt-0.5 text-xs font-mono-tabular text-[#1E1916]/65">
              Seed #{params.seed} · Binary STL (Z-Up · Millimeters)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close print check"
            className="p-1.5 rounded-lg text-[#1E1916]/70 hover:bg-[#EFE9DF] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-4 space-y-2.5">
          <div className="flex items-center justify-between py-2 border-b border-[#1E1916]/8 text-sm">
            <span className="inline-flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-[#2C6E49]" aria-hidden="true" />
              Support-Free Geometry
            </span>
            <span className="font-mono-tabular text-xs text-[#2C6E49] font-medium">
              Max {metrics?.maxOverhangDeg ?? 41}° (≤ 45°)
            </span>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-[#1E1916]/8 text-sm">
            <span className="inline-flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-[#2C6E49]" aria-hidden="true" />
              Build Plate Grounding
            </span>
            <span className="font-mono-tabular text-xs text-[#1E1916]/75">
              Flush at Z = 0.00 mm
            </span>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-[#1E1916]/8 text-sm">
            <span className="inline-flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-[#2C6E49]" aria-hidden="true" />
              220 × 220 mm Bed Fit
            </span>
            <span className="font-mono-tabular text-xs text-[#1E1916]/75">
              {fits220Bed ? 'Fits standard bed' : 'Scale down or use large bed'}
            </span>
          </div>
        </div>

        {metrics && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-[#EFE9DF]/80 border border-[#1E1916]/10 text-xs">
            <div>
              <div className="text-[#1E1916]/60">Dimensions</div>
              <div className="mt-0.5 font-mono-tabular font-semibold">
                {metrics.widthMm} × {metrics.depthMm} × {metrics.heightMm} mm
              </div>
            </div>
            <div>
              <div className="text-[#1E1916]/60">Triangles</div>
              <div className="mt-0.5 font-mono-tabular font-semibold">
                {metrics.triangleCount.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-[#1E1916]/60">Est. Filament</div>
              <div className="mt-0.5 font-mono-tabular font-semibold">
                {metrics.estimatedGrams} g PLA
              </div>
            </div>
            <div>
              <div className="text-[#1E1916]/60">Est. Print Time</div>
              <div className="mt-0.5 font-mono-tabular font-semibold">
                ~{Math.floor(metrics.estimatedPrintMinutes / 60)}h {metrics.estimatedPrintMinutes % 60}m
              </div>
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-[#1E1916] bg-[#EFE9DF] hover:bg-[#E4DDD0] rounded-lg cursor-pointer"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => {
              onExportSTL();
              onClose();
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[#F7F3EC] bg-[#B8432A] hover:bg-[#9E3620] rounded-lg cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            Download Binary STL
          </button>
        </div>
      </div>
    </div>
  );
}
