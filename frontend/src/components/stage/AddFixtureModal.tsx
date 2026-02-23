import { useState } from "react";
import { useStageStore } from "../../store/stageStore";
import { Button } from "../ui/Button";
import type { FixtureCreate } from "../../types";
import { getFixtureDef, getAllFixtureDefs } from "../../fixtures/registry";

interface FormState {
  name: string;
  universe: string;
  start_channel: string;
  channel_count: string;
  fixture_type: string;
}

const DEFAULT_FORM: FormState = {
  name: "",
  universe: "1",
  start_channel: "1",
  channel_count: String(getFixtureDef("generic").channelCount),
  fixture_type: "generic",
};

interface AddFixtureModalProps {
  /** Position on the stage canvas (0–100%) where the fixture will be placed */
  initialX?: number;
  initialY?: number;
  onClose: () => void;
}

export function AddFixtureModal({
  initialX,
  initialY,
  onClose,
}: AddFixtureModalProps) {
  const createFixture = useStageStore((s) => s.createFixture);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) {
    const { name, value } = e.target;
    setForm((prev) => {
      const next: FormState = { ...prev, [name]: value };
      if (name === "fixture_type") {
        next.channel_count = String(getFixtureDef(value).channelCount);
      }
      return next;
    });
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const universe = parseInt(form.universe, 10);
    const start_channel = parseInt(form.start_channel, 10);
    const channel_count = parseInt(form.channel_count, 10);

    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    if (isNaN(universe) || universe < 1) {
      setError("Universe must be ≥ 1.");
      return;
    }
    if (isNaN(start_channel) || start_channel < 1 || start_channel > 512) {
      setError("Start channel must be 1–512.");
      return;
    }
    if (isNaN(channel_count) || channel_count < 1 || channel_count > 512) {
      setError("Channel count must be 1–512.");
      return;
    }
    if (start_channel + channel_count - 1 > 512) {
      setError("Channel range exceeds 512.");
      return;
    }

    const body: FixtureCreate = {
      name: form.name.trim(),
      universe,
      start_channel,
      channel_count,
      fixture_type: form.fixture_type,
      x: initialX ?? 50,
      y: initialY ?? 50,
    };

    setBusy(true);
    try {
      await createFixture(body);
      onClose();
    } catch {
      setError("Failed to create fixture.");
    } finally {
      setBusy(false);
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={handleBackdropClick}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-80 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-sm">Add Fixture</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="flex flex-col gap-2.5"
        >
          <label className="flex flex-col gap-1">
            <span className="text-gray-400 text-xs">Name</span>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="e.g. PAR 1"
              autoFocus
              className="bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-gray-400 text-xs">Type</span>
            <select
              name="fixture_type"
              value={form.fixture_type}
              onChange={handleChange}
              className="bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              {getAllFixtureDefs().map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-gray-400 text-xs">Universe</span>
            <input
              name="universe"
              value={form.universe}
              onChange={handleChange}
              type="number"
              min={1}
              className="bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </label>

          <div className="flex gap-2">
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-gray-400 text-xs">Start ch.</span>
              <input
                name="start_channel"
                value={form.start_channel}
                onChange={handleChange}
                type="number"
                min={1}
                max={512}
                className="bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </label>
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-gray-400 text-xs">Count</span>
              <input
                name="channel_count"
                value={form.channel_count}
                onChange={handleChange}
                type="number"
                min={1}
                max={512}
                className="bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </label>
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <Button type="submit" disabled={busy} className="mt-0.5 text-sm py-1.5">
            {busy ? "Adding…" : "Add to Stage"}
          </Button>
        </form>
      </div>
    </div>
  );
}
