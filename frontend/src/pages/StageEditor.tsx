import { useEffect, useState } from "react";
import { Sidebar } from "../components/layout/Sidebar";
import { Stage3D } from "../components/stage/Stage3D";
import { CatalogPanel } from "../components/stage/CatalogPanel";
import { AddFixturePanel } from "../components/stage/AddFixturePanel";
import { AddFixtureModal } from "../components/stage/AddFixtureModal";
import { useStageStore } from "../store/stageStore";

export function StageEditor() {
  const fetchFixtures = useStageStore((s) => s.fetchFixtures);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    void fetchFixtures();
  }, [fetchFixtures]);

  return (
    <div className="flex flex-1 h-full min-w-0">
      <Sidebar />
      <main className="flex flex-1 overflow-hidden">
        <CatalogPanel />
        <Stage3D />
        <AddFixturePanel onAddFixtureClick={() => setModalOpen(true)} />
      </main>

      {modalOpen && (
        <AddFixtureModal onClose={() => setModalOpen(false)} />
      )}
    </div>
  );
}
