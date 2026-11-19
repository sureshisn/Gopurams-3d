import { ArrowRight } from 'lucide-react';
import type { GopuramParams } from '../engine/gopuramTypes';
import { generateGopuramParamsFromSeed } from '../engine/prng';

interface ArchitectureGuideProps {
  onLoadPreset: (params: GopuramParams) => void;
}

const ANATOMY_ITEMS = [
  {
    index: '01',
    term: 'Adhishthanam (Stepped Plinth)',
    detail:
      'The foundational stone pedestal composed of Jagati, chamfered Tripatta Kumuda, recessed Kantham, and upper Pattika platform that anchors the tower flush on the print bed.',
  },
  {
    index: '02',
    term: 'Aditala & Vaasal (Gateway Storey)',
    detail:
      'Monumental ground storey pierced by an arched, cusped, or corbelled central passageway, flanked by pointed Devakoshta niches and rhythmic blue pilasters.',
  },
  {
    index: '03',
    term: 'Talas (Diminishing Storeys)',
    detail:
      'Stacked tapering levels featuring corner square Kuta pavilions, central elongated Shala vaults, alternating Panjara miniature shrines, and a central spine of Kudu arches.',
  },
  {
    index: '04',
    term: 'Kapota & Kudu (Print-Safe Cornices)',
    detail:
      'Flared horizontal cornice overhangs angled strictly ≤ 42° with horseshoe Kudu dormer reliefs, engineered to print cleanly without support material.',
  },
  {
    index: '05',
    term: 'Griva & Sala-Shikhara (Vaulted Crest)',
    detail:
      'A recessed transition neck supporting either a barrel-vaulted Sala-Shikhara roof with horn finials and gable arches, a Mandir dome, or a framed Wall Relief plaque.',
  },
  {
    index: '06',
    term: 'Kalasams (Sacred Finials)',
    detail:
      'Lathe-turned ceremonial pot finials embedded cleanly along the top ridge spine with thickened tips for crisp FDM or resin reproduction.',
  },
];

const CURATED_PRESETS: {
  title: string;
  subtitle: string;
  params: GopuramParams;
}[] = [
  {
    title: 'Temple Complex with Courtyard & Mandapam',
    subtitle: '9 Tiers · Hand-Painted Polychrome · Corner Shrines',
    params: generateGopuramParamsFromSeed(8841, {
      archetype: 'complex',
      style: 'pandya',
      finish: 'polychrome',
      tiers: 9,
      portalStyle: 'arched',
      kalasamCount: 7,
      hasCourtyard: true,
      hasMandapam: true,
      hasFlankingShrines: true,
    }),
  },
  {
    title: 'Polychrome Rajagopuram Tower',
    subtitle: '9 Tiers · Nayak Concave Taper · 7 Kalasams',
    params: generateGopuramParamsFromSeed(7007, {
      archetype: 'gopuram',
      style: 'nayak',
      finish: 'polychrome',
      tiers: 9,
      portalStyle: 'arched',
      kalasamCount: 7,
      hasCourtyard: false,
      hasMandapam: false,
    }),
  },
  {
    title: 'Sanctum Mandir Vimana',
    subtitle: '5 Tiers · Cusped Torana Arch · Cupola Dome',
    params: generateGopuramParamsFromSeed(3312, {
      archetype: 'vimana',
      style: 'chola',
      finish: 'polychrome',
      tiers: 4,
      portalStyle: 'cusped',
      kalasamCount: 1,
      hasCourtyard: false,
      hasMandapam: false,
    }),
  },
  {
    title: 'Framed Temple Wall Relief Plaque',
    subtitle: '3 Sanctums · Baluster Gallery · Medallion Border',
    params: generateGopuramParamsFromSeed(5204, {
      archetype: 'relief',
      style: 'vijayanagara',
      finish: 'polychrome',
      tiers: 3,
      portalStyle: 'cusped',
      kalasamCount: 1,
      hasCourtyard: false,
      hasMandapam: false,
    }),
  },
];

export function ArchitectureGuide({ onLoadPreset }: ArchitectureGuideProps) {
  return (
    <main className="min-h-[calc(100vh-57px)] bg-[#F7F3EC] px-6 py-10">
      <div className="max-w-5xl mx-auto space-y-12">
        <section className="max-w-2xl">
          <h1 className="font-display text-3xl md:text-4xl font-semibold text-[#3B171E] tracking-tight">
            Dravidian Gopuram Anatomy &amp; Print Engineering
          </h1>
          <p className="mt-3 text-base leading-relaxed text-[#1E1916]/75">
            Every seed synthesizes a complete multi-tiered South Indian temple tower, sanctum mandir, courtyard complex, or wall relief—engineered with flat bed contact and ≤ 42° self-supporting cornices.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-[#1E1916] pb-3 border-b border-[#1E1916]/12">
            Structural Hierarchy
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6 pt-6">
            {ANATOMY_ITEMS.map((item) => (
              <div
                key={item.index}
                className="pb-5 border-b border-[#1E1916]/8"
              >
                <div className="text-xs font-mono-tabular text-[#B8432A] font-medium">
                  {item.index}.
                </div>
                <h3 className="mt-1 text-base font-semibold text-[#1E1916]">
                  {item.term}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[#1E1916]/70">
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-[#1E1916] pb-3 border-b border-[#1E1916]/12">
            Showcase Archetypes
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-6">
            {CURATED_PRESETS.map((preset) => (
              <button
                key={preset.title}
                type="button"
                onClick={() => onLoadPreset(preset.params)}
                className="group flex items-center justify-between gap-4 p-5 bg-[#FAF7F2] hover:bg-white border border-[#1E1916]/12 hover:border-[#B8432A]/45 rounded-xl text-left transition-colors cursor-pointer"
              >
                <div>
                  <h3 className="font-display text-lg font-semibold text-[#3B171E]">
                    {preset.title}
                  </h3>
                  <p className="mt-1 text-xs font-mono-tabular text-[#1E1916]/65">
                    {preset.subtitle}
                  </p>
                </div>
                <ArrowRight
                  className="w-4 h-4 text-[#B8432A] shrink-0 transition-transform group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
