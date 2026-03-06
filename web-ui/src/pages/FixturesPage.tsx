import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CenteredPage, PageLayout, EmptyState } from "../components/layout/PageLayout";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Modal } from "../components/ui/Modal";
import { FixtureAvatar } from "../components/ui/FixtureAvatar";
import { TrashButton } from "../components/ui/TrashButton";
import { ModelPreview } from "../components/stage/ModelPreview";
import {
  useFixtures,
  useFixtureTypes,
  useFixtureType,
  useCreateFixture,
  useDeleteFixture,
  useUploadAvatar,
} from "../api/hooks";
import type { Fixture, FixtureType } from "../api/hooks";
import { DEVICE_REGISTRY } from "../devices/registry";
import type { SceneObjectType } from "../devices/registry";
import * as React from "react";

function modelPathForType(fixtureTypeId: string): string | null {
  const def = DEVICE_REGISTRY[fixtureTypeId as SceneObjectType];
  return def?.modelPath ?? null;
}

function isDmxFixture(typeId: string): boolean {
  const def = DEVICE_REGISTRY[typeId as SceneObjectType];
  if (!def) return false;
  return Object.values(def.modes).some((mode) => "dmx" in mode);
}

/** Light gradient background for 3D model previews. */
const PREVIEW_BG = "bg-gradient-to-br from-gray-200 to-gray-400";

function TypeSelectionPage({
  onSelect,
}: {
  onSelect: (typeId: string, typeLabel: string) => void;
}) {
  const { data: fixtureTypes } = useFixtureTypes();
  const typeList = (fixtureTypes ?? []).filter((fixtureType: FixtureType) =>
    isDmxFixture(fixtureType.id),
  );

  return (
    <>
      <h2 className="text-white font-semibold text-base mb-5">
        Select Fixture Type
      </h2>
      <div className="grid grid-cols-3 gap-3">
        {typeList.map((fixtureType: FixtureType) => {
          const modelPath = modelPathForType(fixtureType.id);
          return (
            <button
              key={fixtureType.id}
              type="button"
              onClick={() => onSelect(fixtureType.id, fixtureType.label)}
              className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700 hover:border-gray-500 transition-colors text-left"
            >
              <div className={`aspect-square ${PREVIEW_BG}`}>
                {modelPath && <ModelPreview path={modelPath} />}
              </div>
              <div className="px-2 py-1.5">
                <p className="text-white text-xs truncate">{fixtureType.label}</p>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-gray-400 text-xs">{label}</label>
      {children}
    </div>
  );
}

function DetailsPage({
  typeId,
  typeLabel,
  onBack,
  onClose,
}: {
  typeId: string;
  typeLabel: string;
  onBack: () => void;
  onClose: () => void;
}) {
  const createFixture = useCreateFixture();
  const uploadAvatar = useUploadAvatar();
  const { data: typeDetail } = useFixtureType(typeId);

  const [label, setLabel] = useState(typeLabel);
  const [dmxMode, setDmxMode] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [universe, setUniverse] = useState("1");
  const [dmxAddress, setDmxAddress] = useState("1");
  const [photo, setPhoto] = useState<string | null>(null);

  const modes = typeDetail?.definition?.modes;
  const modeEntries = modes ? Object.entries(modes) : [];
  const modelPath = modelPathForType(typeId);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!label.trim()) return;
    createFixture.mutate(
      {
        fixture_type_id: typeId,
        label: label.trim(),
        dmx_mode: dmxMode || undefined,
        serial_number: serialNumber.trim() || undefined,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: (fixture) => {
          if (photo) {
            fetch(photo)
              .then((response) => response.blob())
              .then((blob) =>
                uploadAvatar.mutate(
                  { fixtureId: fixture.id, blob },
                  { onSettled: () => onClose() },
                ),
              )
              .catch(() => onClose());
          } else {
            onClose();
          }
        },
      },
    );
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={onBack}
          className="text-gray-400 hover:text-white transition-colors text-sm"
        >
          &larr; Back
        </button>
        <h2 className="text-white font-semibold text-base">Fixture Details</h2>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="flex gap-5 mb-5">
          <div className="flex-1 flex flex-col gap-3">
            <Field label="Name">
              <input
                autoFocus
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Name"
                className="bg-gray-800 border border-gray-600 rounded-lg px-2.5 py-1.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
              />
            </Field>
            <Field label="Fixture Type">
              <input
                value={typeLabel}
                disabled
                className="bg-gray-800/50 border border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-400 text-sm cursor-not-allowed"
              />
            </Field>
            <Field label="Serial Number">
              <input
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                placeholder="Optional"
                className="bg-gray-800 border border-gray-600 rounded-lg px-2.5 py-1.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
              />
            </Field>
          </div>

          <FixtureAvatar
            photo={photo}
            fallback={modelPath ? <ModelPreview path={modelPath} /> : undefined}
            onPhotoChange={setPhoto}
            onPhotoRemove={photo ? () => setPhoto(null) : undefined}
          />
        </div>

        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
            rows={2}
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-2.5 py-1.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm resize-none"
          />
        </Field>

        <p className="text-gray-400 text-xs uppercase tracking-wide mt-5 mb-3">
          DMX Defaults
        </p>
        <div className="flex gap-3 mb-5">
          {modeEntries.length > 1 && (
            <Field label="Mode">
              <select
                value={dmxMode}
                onChange={(e) => setDmxMode(e.target.value)}
                className="bg-gray-800 border border-gray-600 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-blue-500 text-sm"
              >
                <option value="">Default</option>
                {modeEntries.map(([key, mode]) => (
                  <option key={key} value={key}>
                    {mode.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Universe">
            <input
              type="number"
              min={1}
              max={32768}
              value={universe}
              onChange={(e) => setUniverse(e.target.value)}
              className="w-24 bg-gray-800 border border-gray-600 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-blue-500 text-sm"
            />
          </Field>
          <Field label="Address">
            <input
              type="number"
              min={1}
              max={512}
              value={dmxAddress}
              onChange={(e) => setDmxAddress(e.target.value)}
              className="w-24 bg-gray-800 border border-gray-600 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-blue-500 text-sm"
            />
          </Field>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors rounded-lg"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!label.trim() || createFixture.isPending}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            {createFixture.isPending ? "Creating..." : "Add Fixture"}
          </button>
        </div>
      </form>
    </>
  );
}

function CreateFixtureDialog({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState<{
    id: string;
    label: string;
  } | null>(null);

  return (
    <Modal onClose={onClose} width="w-[540px] max-h-[85vh] overflow-y-auto">
      {selected === null ? (
        <TypeSelectionPage
          onSelect={(id, label) => setSelected({ id, label })}
        />
      ) : (
        <DetailsPage
          typeId={selected.id}
          typeLabel={selected.label}
          onBack={() => setSelected(null)}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}

function FixtureTile({ fixture }: { fixture: Fixture }) {
  const navigate = useNavigate();
  const deleteFixture = useDeleteFixture();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const modelPath = modelPathForType(fixture.fixture_type_id);
  const deviceDef = DEVICE_REGISTRY[fixture.fixture_type_id as SceneObjectType];
  const typeLabel = deviceDef?.label ?? fixture.fixture_type_id;

  function handleDelete() {
    setDeleteError(null);
    deleteFixture.mutate(fixture.id, {
      onSuccess: () => setConfirmDelete(false),
      onError: (err) => {
        if (err.message === "Conflict") {
          setDeleteError(
            "This fixture is placed on a stage. Remove it from all stages first.",
          );
        } else {
          setDeleteError("Failed to delete fixture.");
        }
      },
    });
  }

  return (
    <>
      <div
        onClick={() => navigate(`/fixtures/${fixture.id}`)}
        className="bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl overflow-hidden relative group transition-colors cursor-pointer"
      >
        <div
          className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <TrashButton
            onClick={() => setConfirmDelete(true)}
            title="Delete fixture"
          />
        </div>
        <div className={`aspect-square ${fixture.avatar_path ? "" : PREVIEW_BG}`}>
          {fixture.avatar_path ? (
            <img
              src={`/data/avatars/${fixture.avatar_path}`}
              className="w-full h-full object-cover"
            />
          ) : (
            modelPath && <ModelPreview path={modelPath} />
          )}
        </div>
        <div className="px-3 py-2.5">
          <p className="text-white text-sm font-medium truncate">
            {fixture.label || typeLabel}
          </p>
          <p className="text-gray-500 text-xs truncate">{typeLabel}</p>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete Fixture"
          message={
            deleteError ??
            `Are you sure you want to delete "${fixture.label || typeLabel}"? This cannot be undone.`
          }
          onConfirm={handleDelete}
          onClose={() => {
            setConfirmDelete(false);
            setDeleteError(null);
          }}
          isPending={deleteFixture.isPending}
        />
      )}
    </>
  );
}

export function FixturesPage() {
  const { data: fixtures, isLoading } = useFixtures();
  const [isCreating, setIsCreating] = useState(false);

  const fixtureList = fixtures ?? [];

  if (isLoading) return <CenteredPage message="Loading fixtures..." />;

  return (
    <PageLayout>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-white font-semibold text-lg">Fixtures</h1>
        {fixtureList.length > 0 && (
          <button
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Add Fixture
          </button>
        )}
      </div>

      {fixtureList.length === 0 ? (
        <EmptyState
          message="No fixtures yet"
          buttonLabel="Add your first fixture"
          onAction={() => setIsCreating(true)}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {fixtureList.map((fixture) => (
            <FixtureTile key={fixture.id} fixture={fixture} />
          ))}
        </div>
      )}

      {isCreating && (
        <CreateFixtureDialog onClose={() => setIsCreating(false)} />
      )}
    </PageLayout>
  );
}
