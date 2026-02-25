import { useState, type ReactNode } from "react";
import { useStageEditorStore } from "../../store/stageEditorStore";
import { ModelPreview } from "./ModelPreview";
import {
  floorMaterials,
  wallMaterials,
  type MaterialDefinition,
} from "../../materials/registry";
import { stageDefinitions, type StageDefinition } from "../../stages/registry";
import { ObjectInspector } from "./ObjectInspector";

// ─── Section Tabs ──────────────────────────────────────────────────────────────

function SectionTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex mb-3 border-b border-gray-800">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex-1 py-1.5 text-[10px] font-medium transition-colors ${
            active === tab.id
              ? "text-blue-400 border-b-2 border-blue-400 -mb-px"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ─── Collapsible Section ───────────────────────────────────────────────────────

function CollapsibleSection({ title, children }: { title: string; children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <div className="border-b border-gray-800">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-medium text-gray-400 hover:text-gray-200 transition-colors"
      >
        <span className="uppercase tracking-wider">{title}</span>
        <span className="text-gray-600">{isOpen ? "▾" : "▸"}</span>
      </button>
      {isOpen && <div className="px-3 pb-4">{children}</div>}
    </div>
  );
}

// ─── Tile Size Slider ──────────────────────────────────────────────────────────

function TileSizeSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2 px-1 mb-3">
      <span className="text-xs text-gray-500 flex-shrink-0">Tile size</span>
      <input
        type="range"
        min={0.1}
        max={15}
        step={0.1}
        value={value}
        onPointerDown={() => useStageEditorStore.getState()._pauseHistory()}
        onPointerUp={() => useStageEditorStore.getState()._resumeHistory()}
        onChange={(event) => onChange(Number(event.target.value))}
        className="flex-1 accent-blue-500"
      />
      <span className="text-xs text-gray-400 w-8 text-right">{value.toFixed(1)}×</span>
    </div>
  );
}

// ─── Material Option ───────────────────────────────────────────────────────────

function MaterialOption({
  material,
  isSelected,
  onSelect,
}: {
  material: MaterialDefinition;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`flex flex-col gap-1.5 p-2 rounded-lg border transition-all text-left ${
        isSelected ? "border-blue-500 bg-blue-500/10" : "border-gray-700 hover:border-gray-500"
      }`}
    >
      {material.kind === "solid" ? (
        <div className="w-full h-8 rounded" style={{ backgroundColor: material.color }} />
      ) : (
        <div className="w-full h-8 rounded overflow-hidden bg-gray-700">
          <img
            src={`${material.basePath}diff.jpg`}
            alt={material.name}
            className="w-full h-full object-cover"
            onError={(event) => { event.currentTarget.style.display = "none"; }}
          />
        </div>
      )}
      <span className="text-xs text-gray-300 leading-tight truncate w-full">{material.name}</span>
    </button>
  );
}

// ─── Fixtures: Light Catalog Item ─────────────────────────────────────────────

function LightCatalogItem() {
  function handleDragStart(event: React.DragEvent<HTMLDivElement>) {
    event.dataTransfer.setData("dlc/light-type", "moving_head");
    event.dataTransfer.effectAllowed = "copy";
  }
  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="flex flex-col gap-1.5 p-2 rounded-lg border border-gray-700 hover:border-gray-500 transition-all text-left cursor-grab active:cursor-grabbing select-none"
    >
      <div className="w-full h-40 rounded overflow-hidden bg-gray-800">
        <ModelPreview path="/models/lights/moving_head.glb" />
      </div>
      <span className="text-xs text-gray-300 leading-tight">Moving Head</span>
    </div>
  );
}

// ─── Props: SVG Placeholders ───────────────────────────────────────────────────

function DiBoxThumb() {
  return (
    <svg viewBox="0 0 40 28" fill="none" className="w-10 h-7">
      <rect x="3" y="3" width="34" height="22" rx="3" fill="#3a3a3a" stroke="#666" strokeWidth="1.3" />
      <circle cx="13" cy="12" r="3.5" fill="#222" stroke="#888" strokeWidth="1" />
      <circle cx="27" cy="12" r="3.5" fill="#222" stroke="#888" strokeWidth="1" />
      <rect x="8" y="18" width="24" height="4" rx="1" fill="#2a2a2a" stroke="#666" strokeWidth="1" />
    </svg>
  );
}
function ChairThumb() {
  return (
    <svg viewBox="0 0 38 40" fill="none" className="w-9 h-10">
      <rect x="7" y="4" width="24" height="14" rx="2" fill="#3a3a3a" stroke="#666" strokeWidth="1.3" />
      <rect x="5" y="16" width="28" height="6" rx="2" fill="#444" stroke="#666" strokeWidth="1.3" />
      <line x1="10" y1="22" x2="10" y2="38" stroke="#888" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="28" y1="22" x2="28" y2="38" stroke="#888" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
function BarStoolThumb() {
  return (
    <svg viewBox="0 0 36 46" fill="none" className="w-9 h-11">
      <ellipse cx="18" cy="7" rx="14" ry="5" fill="#444" stroke="#666" strokeWidth="1.3" />
      <line x1="18" y1="12" x2="18" y2="34" stroke="#888" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="18" y1="28" x2="6"  y2="36" stroke="#888" strokeWidth="2"   strokeLinecap="round" />
      <line x1="18" y1="28" x2="30" y2="36" stroke="#888" strokeWidth="2"   strokeLinecap="round" />
      <line x1="18" y1="34" x2="6"  y2="43" stroke="#888" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="18" y1="34" x2="30" y2="43" stroke="#888" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function MusicStandThumb() {
  return (
    <svg viewBox="0 0 36 48" fill="none" className="w-9 h-12">
      <polygon points="5,19 31,19 29,7 7,7" fill="#3a3a3a" stroke="#666" strokeWidth="1.3" strokeLinejoin="round" />
      <line x1="18" y1="19" x2="18" y2="38" stroke="#888" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="18" y1="38" x2="6"  y2="45" stroke="#888" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="18" y1="38" x2="18" y2="45" stroke="#888" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="18" y1="38" x2="30" y2="45" stroke="#888" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function PodiumThumb() {
  return (
    <svg viewBox="0 0 36 44" fill="none" className="w-9 h-11">
      <rect x="4" y="4" width="28" height="36" rx="2" fill="#3a3a3a" stroke="#666" strokeWidth="1.3" />
      <polygon points="4,4 32,4 32,14 4,14" fill="#444" stroke="#666" strokeWidth="1.3" />
      <rect x="8" y="18" width="20" height="14" rx="1.5" fill="#2a2a2a" stroke="#555" strokeWidth="1" />
    </svg>
  );
}
function CableReelThumb() {
  return (
    <svg viewBox="0 0 44 36" fill="none" className="w-11 h-9">
      <ellipse cx="22" cy="11" rx="18" ry="6" fill="#3a3a3a" stroke="#666" strokeWidth="1.3" />
      <rect x="4" y="11" width="36" height="14" fill="#3a3a3a" />
      <rect x="4" y="11" width="36" height="14" fill="none" stroke="#666" strokeWidth="1.3" />
      <ellipse cx="22" cy="25" rx="18" ry="6" fill="#444" stroke="#666" strokeWidth="1.3" />
      <ellipse cx="22" cy="18" rx="9" ry="3" fill="#2a2a2a" stroke="#888" strokeWidth="1" />
    </svg>
  );
}

// ─── Prop Catalog Item ────────────────────────────────────────────────────────

interface PropDef {
  label: string;
  modelPath?: string;
  ThumbComponent?: React.ComponentType;
  dragType?: string;
}

function PropCatalogItem({ label, modelPath, ThumbComponent, dragType }: PropDef) {
  const available = !!dragType;

  function handleDragStart(event: React.DragEvent<HTMLDivElement>) {
    if (!dragType) return;
    event.dataTransfer.setData("dlc/prop-type", dragType);
    event.dataTransfer.effectAllowed = "copy";
  }

  return (
    <div
      draggable={available}
      onDragStart={available ? handleDragStart : undefined}
      className={`flex flex-col gap-1.5 p-2 rounded-lg border text-left select-none ${
        available
          ? "border-gray-700 hover:border-gray-500 cursor-grab active:cursor-grabbing"
          : "border-gray-800 opacity-50 cursor-not-allowed"
      }`}
    >
      <div className="w-full h-20 rounded overflow-hidden bg-gray-800 flex items-center justify-center">
        {modelPath
          ? <ModelPreview path={modelPath} />
          : ThumbComponent ? <ThumbComponent /> : null}
      </div>
      <div className="flex items-center justify-between gap-1">
        <span className={`text-xs leading-tight truncate ${available ? "text-gray-300" : "text-gray-500"}`}>
          {label}
        </span>
        {!available && (
          <span className="text-[9px] text-gray-600 bg-gray-800 rounded px-1 py-0.5 flex-shrink-0">Soon</span>
        )}
      </div>
    </div>
  );
}

const AUDIO_PROPS: PropDef[] = [
  { label: "Speaker 1",  modelPath: "/models/speakers/speaker_1.glb", dragType: "speaker_1" },
  { label: "Speaker 2",  modelPath: "/models/speakers/speaker_2.glb", dragType: "speaker_2" },
  { label: "Microphone", modelPath: "/models/mic.glb",                dragType: "mic"       },
  { label: "DI Box",     ThumbComponent: DiBoxThumb },
];

const FURNITURE_PROPS: PropDef[] = [
  { label: "Chair",       ThumbComponent: ChairThumb     },
  { label: "Bar Stool",   ThumbComponent: BarStoolThumb  },
  { label: "Music Stand", ThumbComponent: MusicStandThumb},
  { label: "Podium",      ThumbComponent: PodiumThumb    },
];

const STAGING_PROPS: PropDef[] = [
  { label: "Tripod",        modelPath: "/models/stands/tripod.glb",          dragType: "tripod"          },
  { label: "Tripod w/ Bar", modelPath: "/models/stands/tripod_with_bar.glb", dragType: "tripod_with_bar" },
  { label: "Barricade",     modelPath: "/models/barricade.glb",               dragType: "barricade"       },
  { label: "Disco Ball",    modelPath: "/models/other/disco_ball.glb",        dragType: "disco_ball"      },
  { label: "Disco Ball 2",  modelPath: "/models/other/disco_ball2.glb",       dragType: "disco_ball2"     },
  { label: "Cable Reel",    ThumbComponent: CableReelThumb },
];

// ─── Stage Option ──────────────────────────────────────────────────────────────

function StageOption({ stage, isSelected, onSelect }: {
  stage: StageDefinition;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`flex flex-col gap-1.5 p-2 rounded-lg border transition-all text-left ${
        isSelected ? "border-blue-500 bg-blue-500/10" : "border-gray-700 hover:border-gray-500"
      }`}
    >
      <div className="w-full h-28 rounded overflow-hidden bg-gray-800">
        <ModelPreview path={stage.path} />
      </div>
      <span className="text-xs text-gray-300 leading-tight truncate w-full">{stage.name}</span>
    </button>
  );
}

// ─── Main Panel ────────────────────────────────────────────────────────────────

export function MaterialPanel() {
  const floorMaterialId  = useStageEditorStore((state) => state.floorMaterialId);
  const wallMaterialId   = useStageEditorStore((state) => state.wallMaterialId);
  const floorTileSize    = useStageEditorStore((state) => state.floorTileSize);
  const wallTileSize     = useStageEditorStore((state) => state.wallTileSize);
  const stageModelId     = useStageEditorStore((state) => state.stageModelId);
  const setFloorMaterial = useStageEditorStore((state) => state.setFloorMaterial);
  const setWallMaterial  = useStageEditorStore((state) => state.setWallMaterial);
  const setFloorTileSize = useStageEditorStore((state) => state.setFloorTileSize);
  const setWallTileSize  = useStageEditorStore((state) => state.setWallTileSize);
  const setStageModel    = useStageEditorStore((state) => state.setStageModel);

  const [fixturesTab, setFixturesTab] = useState<"lights" | "lasers" | "effects">("lights");
  const [propsTab,    setPropsTab]    = useState<"audio" | "furniture" | "staging">("audio");
  const [floorTab,    setFloorTab]    = useState<"solid" | "textures">("solid");
  const [wallTab,     setWallTab]     = useState<"solid" | "textures">("solid");

  const floorSolids   = floorMaterials.filter((m) => m.kind === "solid");
  const floorTextures = floorMaterials.filter((m) => m.kind === "texture");
  const wallSolids    = wallMaterials.filter((m) => m.kind === "solid");
  const wallTextures  = wallMaterials.filter((m) => m.kind === "texture");

  return (
    <aside className="w-64 flex-shrink-0 bg-gray-900 border-l border-gray-800 flex flex-col overflow-y-auto">
      <div className="px-4 py-3 border-b border-gray-800">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Scene</h2>
      </div>

      <ObjectInspector />

      {/* ── Fixtures ── */}
      <CollapsibleSection title="Fixtures">
        <SectionTabs
          tabs={[
            { id: "lights",  label: "Lights"  },
            { id: "lasers",  label: "Lasers"  },
            { id: "effects", label: "Effects" },
          ]}
          active={fixturesTab}
          onChange={setFixturesTab}
        />
        {fixturesTab === "lights" && (
          <>
            <p className="text-xs text-gray-500 mb-2">Drag onto the canvas to place</p>
            <div className="grid grid-cols-2 gap-2">
              <LightCatalogItem />
            </div>
          </>
        )}
        {(fixturesTab === "lasers" || fixturesTab === "effects") && (
          <p className="text-xs text-gray-600 text-center py-4">Coming soon</p>
        )}
      </CollapsibleSection>

      {/* ── Props ── */}
      <CollapsibleSection title="Props">
        <SectionTabs
          tabs={[
            { id: "audio",     label: "Audio"     },
            { id: "furniture", label: "Furniture" },
            { id: "staging",   label: "Staging"   },
          ]}
          active={propsTab}
          onChange={setPropsTab}
        />
        <div className="grid grid-cols-2 gap-2">
          {propsTab === "audio"     && AUDIO_PROPS.map((p)     => <PropCatalogItem key={p.label} {...p} />)}
          {propsTab === "furniture" && FURNITURE_PROPS.map((p) => <PropCatalogItem key={p.label} {...p} />)}
          {propsTab === "staging"   && STAGING_PROPS.map((p)   => <PropCatalogItem key={p.label} {...p} />)}
        </div>
      </CollapsibleSection>

      {/* ── Stage ── */}
      <CollapsibleSection title="Stage">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setStageModel(null)}
            className={`flex flex-col gap-1.5 p-2 rounded-lg border transition-all text-left ${
              stageModelId === null
                ? "border-blue-500 bg-blue-500/10"
                : "border-gray-700 hover:border-gray-500"
            }`}
          >
            <div className="w-full h-28 rounded border-2 border-dashed border-gray-600 flex items-center justify-center">
              <span className="text-xs text-gray-500">None</span>
            </div>
            <span className="text-xs text-gray-300">No Stage</span>
          </button>
          {stageDefinitions.map((stage) => (
            <StageOption
              key={stage.id}
              stage={stage}
              isSelected={stageModelId === stage.id}
              onSelect={() => setStageModel(stage.id)}
            />
          ))}
        </div>
      </CollapsibleSection>

      {/* ── Floor ── */}
      <CollapsibleSection title="Floor">
        <SectionTabs
          tabs={[{ id: "solid", label: "Solid" }, { id: "textures", label: "Textures" }]}
          active={floorTab}
          onChange={setFloorTab}
        />
        {floorTab === "solid" && (
          <div className="grid grid-cols-2 gap-2">
            {floorSolids.map((m) => (
              <MaterialOption key={m.id} material={m} isSelected={m.id === floorMaterialId} onSelect={() => setFloorMaterial(m.id)} />
            ))}
          </div>
        )}
        {floorTab === "textures" && (
          <>
            <TileSizeSlider value={floorTileSize} onChange={setFloorTileSize} />
            <div className="grid grid-cols-2 gap-2">
              {floorTextures.map((m) => (
                <MaterialOption key={m.id} material={m} isSelected={m.id === floorMaterialId} onSelect={() => setFloorMaterial(m.id)} />
              ))}
            </div>
          </>
        )}
      </CollapsibleSection>

      {/* ── Wall ── */}
      <CollapsibleSection title="Wall">
        <SectionTabs
          tabs={[{ id: "solid", label: "Solid" }, { id: "textures", label: "Textures" }]}
          active={wallTab}
          onChange={setWallTab}
        />
        {wallTab === "solid" && (
          <div className="grid grid-cols-2 gap-2">
            {wallSolids.map((m) => (
              <MaterialOption key={m.id} material={m} isSelected={m.id === wallMaterialId} onSelect={() => setWallMaterial(m.id)} />
            ))}
          </div>
        )}
        {wallTab === "textures" && (
          <>
            <TileSizeSlider value={wallTileSize} onChange={setWallTileSize} />
            <div className="grid grid-cols-2 gap-2">
              {wallTextures.map((m) => (
                <MaterialOption key={m.id} material={m} isSelected={m.id === wallMaterialId} onSelect={() => setWallMaterial(m.id)} />
              ))}
            </div>
          </>
        )}
      </CollapsibleSection>
    </aside>
  );
}
