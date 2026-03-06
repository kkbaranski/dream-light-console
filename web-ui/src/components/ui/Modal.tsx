import * as React from "react";

interface ModalProps {
  children: React.ReactNode;
  onClose: () => void;
  width?: string;
}

export function Modal({ children, onClose, width = "w-96" }: ModalProps) {
  function handleBackdropClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={handleBackdropClick}
    >
      <div
        className={`bg-gray-900 border border-gray-700 rounded-xl shadow-2xl ${width} p-6`}
      >
        {children}
      </div>
    </div>
  );
}
