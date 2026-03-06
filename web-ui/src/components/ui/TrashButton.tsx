export function TrashButton({ onClick, title = "Delete" }: { onClick: () => void; title?: string }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="p-1.5 text-gray-600 hover:text-red-400 transition-colors text-sm leading-none"
      title={title}
    >
      &#128465;
    </button>
  );
}
