import { useState } from "react";
import { useStageEditorStore } from "../../store/stageEditorStore";
import { ModelPreview } from "./ModelPreview";
import {
  floorMaterials,
  wallMaterials,
  type MaterialDefinition,
} from "../../materials/registry";
import { stageDefinitions, type StageDefinition } from "../../stages/registry";

function TileSizeSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 px-1 mb-3">
      <span className="text-xs text-gray-500 flex-shrink-0">Tile size</span>
      <input
        type="range"
        min={0.1}
        max={15}
        step={0.1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-blue-500"
      />
      <span className="text-xs text-gray-400 w-8 text-right">{value.toFixed(1)}×</span>
    </div>
  );
}

function CollapsibleSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
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

      {isOpen && (
        <div className="px-3 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}

function MaterialThumbnail({ material }: { material: MaterialDefinition }) {
  if (material.kind === "solid") {
    return (
      <div
        className="w-full h-8 rounded"
        style={{ backgroundColor: material.color }}
      />
    );
  }

  return (
    <div className="w-full h-8 rounded overflow-hidden bg-gray-700">
      <img
        src={`${material.basePath}diff.jpg`}
        alt={material.name}
        className="w-full h-full object-cover"
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />
    </div>
  );
}

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
        isSelected
          ? "border-blue-500 bg-blue-500/10"
          : "border-gray-700 hover:border-gray-500"
      }`}
    >
      <MaterialThumbnail material={material} />
      <span className="text-xs text-gray-300 leading-tight truncate w-full">
        {material.name}
      </span>
    </button>
  );
}

function LightCatalogItem() {
  function handleDragStart(event: React.DragEvent<HTMLButtonElement>) {
    event.dataTransfer.setData("dlc/light-type", "moving_head");
    event.dataTransfer.effectAllowed = "copy";
  }

  return (
    <button
      draggable
      onDragStart={handleDragStart}
      className="flex flex-col gap-1.5 p-2 rounded-lg border border-gray-700 hover:border-gray-500 transition-all text-left cursor-grab active:cursor-grabbing"
    >
      <div className="w-full h-16 rounded overflow-hidden bg-gray-800">
        <ModelPreview path="/models/lights/moving_head.glb" />
      </div>
      <span className="text-xs text-gray-300 leading-tight">Moving Head</span>
    </button>
  );
}

function StageThumbnail({ index }: { stage: StageDefinition; index: number }) {
  return (
    <div className="w-full h-10 rounded bg-gray-800 flex items-end justify-center pb-1.5">
      {/* Simplified stage silhouette: two truss legs + platform */}
      <div className="flex items-end gap-0.5">
        <div className="w-2 h-5 bg-gray-500 rounded-t-sm" />
        <div className="w-10 h-1.5 bg-gray-500 rounded-t-sm" />
        <div className="w-2 h-5 bg-gray-500 rounded-t-sm" />
      </div>
      <span className="absolute text-gray-400 text-xs font-bold leading-none mb-3">
        {index + 1}
      </span>
    </div>
  );
}

function StageOption({
  stage,
  index,
  isSelected,
  onSelect,
}: {
  stage: StageDefinition;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`flex flex-col gap-1.5 p-2 rounded-lg border transition-all text-left ${
        isSelected
          ? "border-blue-500 bg-blue-500/10"
          : "border-gray-700 hover:border-gray-500"
      }`}
    >
      <StageThumbnail stage={stage} index={index} />
      <span className="text-xs text-gray-300 leading-tight truncate w-full">
        {stage.name}
      </span>
    </button>
  );
}

function DMXSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-xs text-gray-500">{label}</span>
        <span className="text-xs text-gray-400 font-mono w-7 text-right">{value}</span>
      </div>
      <input
        type="range"
        min={0}
        max={255}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-blue-500"
      />
    </div>
  );
}

function LightInspectorSection() {
  const selectedLightId = useStageEditorStore((state) => state.selectedLightId);
  const placedLights = useStageEditorStore((state) => state.placedLights);
  const updateLight = useStageEditorStore((state) => state.updateLight);

  const light = placedLights.find((l) => l.id === selectedLightId);
  if (!light) return null;

  return (
    <CollapsibleSection title="Selected Light">
      <div className="flex flex-col gap-3 px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-14 flex-shrink-0">Name</span>
          <input
            type="text"
            value={light.name}
            onChange={(event) => updateLight(light.id, { name: event.target.value })}
            className="flex-1 bg-gray-800 text-xs text-gray-200 rounded px-2 py-1 border border-gray-700 focus:border-blue-500 outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-14 flex-shrink-0">Universe</span>
          <input
            type="number"
            min={1}
            max={16}
            value={light.universe}
            onChange={(event) =>
              updateLight(light.id, { universe: Math.max(1, Number(event.target.value)) })
            }
            className="w-16 bg-gray-800 text-xs text-gray-200 rounded px-2 py-1 border border-gray-700 focus:border-blue-500 outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-14 flex-shrink-0">Channel</span>
          <input
            type="number"
            min={1}
            max={512}
            value={light.startChannel}
            onChange={(event) =>
              updateLight(light.id, { startChannel: Math.max(1, Number(event.target.value)) })
            }
            className="w-16 bg-gray-800 text-xs text-gray-200 rounded px-2 py-1 border border-gray-700 focus:border-blue-500 outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-14 flex-shrink-0">Color</span>
          <input
            type="color"
            value={light.color}
            onChange={(event) => updateLight(light.id, { color: event.target.value })}
            className="w-8 h-6 rounded cursor-pointer border-0 bg-transparent p-0"
          />
          <span className="text-xs text-gray-400 font-mono">{light.color}</span>
        </div>

        <DMXSlider
          label="Dimmer"
          value={light.dimmer}
          onChange={(value) => updateLight(light.id, { dimmer: value })}
        />
        <DMXSlider
          label="Pan"
          value={light.pan}
          onChange={(value) => updateLight(light.id, { pan: value })}
        />
        <DMXSlider
          label="Tilt"
          value={light.tilt}
          onChange={(value) => updateLight(light.id, { tilt: value })}
        />

        <div className="flex flex-col gap-0.5">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-xs text-gray-500">Beam angle</span>
            <span className="text-xs text-gray-400 font-mono w-10 text-right">{light.coneAngle}°</span>
          </div>
          <input
            type="range"
            min={1}
            max={60}
            step={1}
            value={light.coneAngle}
            onChange={(event) => updateLight(light.id, { coneAngle: Number(event.target.value) })}
            className="w-full accent-blue-500"
          />
        </div>
      </div>
    </CollapsibleSection>
  );
}

export function MaterialPanel() {
  const floorMaterialId = useStageEditorStore((state) => state.floorMaterialId);
  const wallMaterialId = useStageEditorStore((state) => state.wallMaterialId);
  const floorTileSize = useStageEditorStore((state) => state.floorTileSize);
  const wallTileSize = useStageEditorStore((state) => state.wallTileSize);
  const stageModelId = useStageEditorStore((state) => state.stageModelId);
  const setFloorMaterial = useStageEditorStore((state) => state.setFloorMaterial);
  const setWallMaterial = useStageEditorStore((state) => state.setWallMaterial);
  const setFloorTileSize = useStageEditorStore((state) => state.setFloorTileSize);
  const setWallTileSize = useStageEditorStore((state) => state.setWallTileSize);
  const setStageModel = useStageEditorStore((state) => state.setStageModel);

  return (
    <aside className="w-64 flex-shrink-0 bg-gray-900 border-l border-gray-800 flex flex-col overflow-y-auto">
      <div className="px-4 py-3 border-b border-gray-800">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Scene
        </h2>
      </div>

      <LightInspectorSection />

      <CollapsibleSection title="Lights">
        <p className="text-xs text-gray-500 mb-2">Drag onto the canvas to place</p>
        <div className="grid grid-cols-2 gap-2">
          <LightCatalogItem />
        </div>
      </CollapsibleSection>

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
            <div className="w-full h-10 rounded border-2 border-dashed border-gray-600 flex items-center justify-center">
              <span className="text-xs text-gray-500">None</span>
            </div>
            <span className="text-xs text-gray-300">No Stage</span>
          </button>

          {stageDefinitions.map((stage, index) => (
            <StageOption
              key={stage.id}
              stage={stage}
              index={index}
              isSelected={stageModelId === stage.id}
              onSelect={() => setStageModel(stage.id)}
            />
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Floor">
        <TileSizeSlider value={floorTileSize} onChange={setFloorTileSize} />
        <div className="grid grid-cols-2 gap-2">
          {floorMaterials.map((material) => (
            <MaterialOption
              key={material.id}
              material={material}
              isSelected={material.id === floorMaterialId}
              onSelect={() => setFloorMaterial(material.id)}
            />
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Wall">
        <TileSizeSlider value={wallTileSize} onChange={setWallTileSize} />
        <div className="grid grid-cols-2 gap-2">
          {wallMaterials.map((material) => (
            <MaterialOption
              key={material.id}
              material={material}
              isSelected={material.id === wallMaterialId}
              onSelect={() => setWallMaterial(material.id)}
            />
          ))}
        </div>
      </CollapsibleSection>
    </aside>
  );
}
