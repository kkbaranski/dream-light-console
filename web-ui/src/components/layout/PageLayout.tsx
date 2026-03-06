import { Sidebar } from "./Sidebar";

export function CenteredPage({ message }: { message: string }) {
  return (
    <div className="flex flex-1 h-full">
      <Sidebar />
      <main className="flex-1 flex items-center justify-center">
        <p className="text-gray-500 text-sm">{message}</p>
      </main>
    </div>
  );
}

export function PageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 h-full">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-8 py-8">{children}</div>
      </main>
    </div>
  );
}

export function EmptyState({
  message,
  buttonLabel,
  onAction,
  icon,
}: {
  message: string;
  buttonLabel: string;
  onAction: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-4">
      {icon}
      <p className="text-gray-500 text-sm">{message}</p>
      <button
        onClick={onAction}
        className="mt-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
      >
        {buttonLabel}
      </button>
    </div>
  );
}
