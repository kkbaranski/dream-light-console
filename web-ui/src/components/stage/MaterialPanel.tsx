import { useState, useMemo, type ReactNode } from "react";
import { useStageEditorStore } from "../../store/stageEditorStore";
import { ModelPreview } from "./ModelPreview";
import {
  floorMaterials,
  wallMaterials,
  type MaterialDefinition,
} from "../../materials/registry";
import { stageDefinitions, type StageDefinition } from "../../stages/registry";
import { ObjectInspector } from "./ObjectInspector";
import { DEVICE_REGISTRY } from "../../devices/registry";
import type { SceneObjectType } from "../../scene/types";
import { useFixtures, useFixtureTypes, type Fixture, type FixtureType } from "../../api/hooks";

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

// ─── Catalog Item (props only) ────────────────────────────────────────────────

function CatalogItem({ deviceType }: { deviceType: SceneObjectType }) {
  const def = DEVICE_REGISTRY[deviceType];

  function handleDragStart(event: React.DragEvent<HTMLDivElement>) {
    event.dataTransfer.setData("dlc/device-type", deviceType);
    event.dataTransfer.effectAllowed = "copy";
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="flex flex-col gap-1.5 p-2 rounded-lg border border-gray-700 hover:border-gray-500 cursor-grab active:cursor-grabbing text-left select-none"
    >
      <div className="w-full aspect-square rounded overflow-hidden bg-gray-800">
        <ModelPreview path={def.modelPath} />
      </div>
      <span className="text-xs text-gray-300 leading-tight truncate">{def.label}</span>
    </div>
  );
}

// ─── Inventory Fixture Item ───────────────────────────────────────────────────

function FixtureItem({ fixture, typeBadge }: { fixture: Fixture; typeBadge: string }) {
  const def = DEVICE_REGISTRY[fixture.fixture_type_id as SceneObjectType] as
    | (typeof DEVICE_REGISTRY)[SceneObjectType]
    | undefined;

  function handleDragStart(event: React.DragEvent<HTMLDivElement>) {
    event.dataTransfer.setData("dlc/device-type", fixture.fixture_type_id);
    event.dataTransfer.setData("dlc/fixture-id", fixture.id);
    event.dataTransfer.setData("dlc/fixture-name", fixture.label);
    event.dataTransfer.setData("dlc/fixture-mode", fixture.dmx_mode);
    event.dataTransfer.effectAllowed = "copy";
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="flex items-center gap-2 p-2 rounded-lg border border-gray-700 hover:border-gray-500 cursor-grab active:cursor-grabbing text-left select-none"
    >
      <div className="w-8 h-8 rounded overflow-hidden bg-gray-800 flex-shrink-0 flex items-center justify-center">
        {def ? (
          <ModelPreview path={def.modelPath} />
        ) : (
          <span className="text-[10px] text-gray-500">{fixture.label.charAt(0).toUpperCase()}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-300 truncate">{fixture.label}</div>
        <div className="text-[10px] text-gray-500 truncate">{typeBadge}</div>
      </div>
    </div>
  );
}

// ─── Catalog data ──────────────────────────────────────────────────────────────

const AUDIO_TYPES: SceneObjectType[] = ["speaker_1", "speaker_2", "mic"];

const STAGING_TYPES: SceneObjectType[] = ["tripod", "tripod_with_bar", "barricade", "disco_ball", "disco_ball2"];

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
      <div className="w-full aspect-square rounded overflow-hidden bg-gray-800">
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

  const [propsTab, setPropsTab] = useState<"audio" | "staging">("audio");
  const [floorTab, setFloorTab] = useState<"solid" | "textures">("solid");
  const [wallTab,  setWallTab]  = useState<"solid" | "textures">("solid");

  const objects = useStageEditorStore((state) => state.objects);
  const { data: fixtures } = useFixtures();
  const { data: fixtureTypes } = useFixtureTypes();

  const placedFixtureIds = useMemo(
    () => new Set(objects.flatMap((o) => (o.fixtureId ? [o.fixtureId] : []))),
    [objects],
  );

  const typesById = useMemo(
    () => new Map((fixtureTypes ?? []).map((t: FixtureType) => [t.id, t])),
    [fixtureTypes],
  );

  // Only show fixtures that are known device types and not yet placed
  const availableFixtures = useMemo(
    () => (fixtures ?? []).filter(
      (f: Fixture) => f.fixture_type_id in DEVICE_REGISTRY && !placedFixtureIds.has(f.id),
    ),
    [fixtures, placedFixtureIds],
  );

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

      {/* ── Fixtures (inventory-based) ── */}
      <CollapsibleSection title="Fixtures">
        {availableFixtures.length > 0 ? (
          <>
            <p className="text-xs text-gray-500 mb-2">Drag onto the stage to place</p>
            <div className="flex flex-col gap-1.5">
              {availableFixtures.map((f: Fixture) => (
                <FixtureItem
                  key={f.id}
                  fixture={f}
                  typeBadge={typesById.get(f.fixture_type_id)?.label ?? f.fixture_type_id}
                />
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-gray-600">
            {(fixtures ?? []).length === 0
              ? "No fixtures in inventory. Create fixtures in the Fixtures tab."
              : "All fixtures have been placed."}
          </p>
        )}
      </CollapsibleSection>

      {/* ── Props ── */}
      <CollapsibleSection title="Props">
        <SectionTabs
          tabs={[
            { id: "audio",   label: "Audio"   },
            { id: "staging", label: "Staging" },
          ]}
          active={propsTab}
          onChange={setPropsTab}
        />
        <div className="grid grid-cols-2 gap-2">
          {propsTab === "audio"   && AUDIO_TYPES.map((type)   => <CatalogItem key={type} deviceType={type} />)}
          {propsTab === "staging" && STAGING_TYPES.map((type) => <CatalogItem key={type} deviceType={type} />)}
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
            <div className="w-full aspect-square rounded border-2 border-dashed border-gray-600 flex items-center justify-center">
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
