import { useState, useRef } from "react";
import { isHeic, heicTo } from "heic-to";
import { Modal } from "./Modal";
import * as React from "react";

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const CROP_SIZE = 320;
const EXPORT_SIZE = 512;

function tryLoadImage(url: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Cannot decode image"));
    img.src = url;
  });
}

/**
 * Load an image file and return an object URL the browser can display.
 * Converts HEIC/HEIF via heic-to (libheif 1.21) when native decoding fails.
 * Caller must revoke the returned URL when done.
 */
async function loadImageFile(file: File): Promise<string> {
  const heic = await isHeic(file);

  if (!heic) {
    const url = URL.createObjectURL(file);
    try {
      await tryLoadImage(url);
      return url;
    } catch {
      URL.revokeObjectURL(url);
      throw new Error("Cannot decode image");
    }
  }

  const jpeg = await heicTo({ blob: file, type: "image/jpeg", quality: 0.92 });
  return URL.createObjectURL(jpeg);
}

function ImageCropDialog({
  imageSrc,
  onConfirm,
  onClose,
}: {
  imageSrc: string;
  onConfirm: (croppedDataUrl: string) => void;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [imgSize, setImgSize] = useState({ width: 0, height: 0 });
  const dragRef = useRef<{
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  function handleImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    setImgSize({ width: img.naturalWidth, height: img.naturalHeight });
    imgRef.current = img;
  }

  const coverScale =
    imgSize.width > 0
      ? Math.max(CROP_SIZE / imgSize.width, CROP_SIZE / imgSize.height)
      : 1;
  const coverW = imgSize.width * coverScale;
  const coverH = imgSize.height * coverScale;

  function clampAt(offsetX: number, offsetY: number, zoomLevel: number) {
    const maxX = Math.max(0, (coverW * zoomLevel - CROP_SIZE) / 2);
    const maxY = Math.max(0, (coverH * zoomLevel - CROP_SIZE) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, offsetX)),
      y: Math.max(-maxY, Math.min(maxY, offsetY)),
    };
  }

  function applyZoom(newZoom: number) {
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
    if (clamped === zoom) return;
    const ratio = clamped / zoom;
    setOffset((prev) => clampAt(prev.x * ratio, prev.y * ratio, clamped));
    setZoom(clamped);
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    applyZoom(zoom - e.deltaY * 0.002);
  }

  function handlePointerDown(e: React.PointerEvent) {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    };
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clampAt(dragRef.current.offsetX + dx, dragRef.current.offsetY + dy, zoom));
  }

  function handlePointerUp() {
    dragRef.current = null;
  }

  function handleConfirm() {
    if (!imgRef.current || imgSize.width === 0) return;

    const canvas = document.createElement("canvas");
    canvas.width = EXPORT_SIZE;
    canvas.height = EXPORT_SIZE;
    const ctx = canvas.getContext("2d")!;

    const totalScale = coverScale * zoom;
    const srcCropW = CROP_SIZE / totalScale;
    const srcCropH = CROP_SIZE / totalScale;
    const srcCenterX = imgSize.width / 2 - offset.x / totalScale;
    const srcCenterY = imgSize.height / 2 - offset.y / totalScale;

    ctx.drawImage(
      imgRef.current,
      srcCenterX - srcCropW / 2,
      srcCenterY - srcCropH / 2,
      srcCropW,
      srcCropH,
      0,
      0,
      EXPORT_SIZE,
      EXPORT_SIZE,
    );

    onConfirm(canvas.toDataURL("image/jpeg", 0.92));
  }

  return (
    <Modal onClose={onClose} width="w-auto">
      <div className="flex flex-col items-center gap-4">
        <h3 className="text-white font-semibold text-sm">Crop Photo</h3>

        <div
          className="relative overflow-hidden rounded-lg bg-black cursor-grab active:cursor-grabbing"
          style={{ width: CROP_SIZE, height: CROP_SIZE }}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <img
            src={imageSrc}
            onLoad={handleImageLoad}
            draggable={false}
            className="absolute select-none pointer-events-none max-w-none"
            style={{
              width: coverW,
              height: coverH,
              left: "50%",
              top: "50%",
              transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            }}
          />
        </div>

        <div className="flex items-center gap-3 w-full px-2">
          <span className="text-gray-500 text-xs">-</span>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => applyZoom(parseFloat(e.target.value))}
            className="flex-1 accent-blue-500"
          />
          <span className="text-gray-500 text-xs">+</span>
        </div>

        <div className="flex gap-2 self-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors rounded-lg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function FixtureAvatar({
  photo,
  fallback,
  onPhotoChange,
  onPhotoRemove,
  className,
}: {
  /** Current photo URL (data URL or server URL). */
  photo: string | null;
  /** Fallback content when no photo is set (e.g. ModelPreview). */
  fallback?: React.ReactNode;
  /** Called with the cropped JPEG data URL after the user picks + crops. */
  onPhotoChange: (dataUrl: string) => void;
  /** Called when the user removes the photo. Omit to hide the remove button. */
  onPhotoRemove?: () => void;
  className?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setLoadError(null);
    try {
      const url = await loadImageFile(file);
      setCropSrc(url);
    } catch {
      setLoadError("Could not open this image. Try JPG or PNG instead.");
    }
  }

  function closeCropDialog() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }

  return (
    <>
      <div
        className={`rounded-lg bg-gradient-to-br from-gray-200 to-gray-400 overflow-hidden flex-shrink-0 relative group ${className ?? "w-48 h-48"}`}
      >
        {photo ? (
          <img src={photo} className="w-full h-full object-cover" />
        ) : (
          fallback
        )}

        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 group-hover:bg-black/50 transition-colors">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-full bg-black/40 hover:bg-black/60 text-white text-lg leading-none"
            title={photo ? "Change photo" : "Add photo"}
          >
            &#128247;
          </button>

          {photo && onPhotoRemove && (
            <button
              type="button"
              onClick={onPhotoRemove}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-full bg-black/40 hover:bg-red-600/80 text-white text-lg leading-none"
              title="Remove photo"
            >
              &#128465;
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {loadError && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70">
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-5 text-center max-w-xs">
            <p className="text-gray-300 text-sm mb-4">{loadError}</p>
            <button
              type="button"
              onClick={() => setLoadError(null)}
              className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              OK
            </button>
          </div>
        </div>
      )}
      {cropSrc && (
        <ImageCropDialog
          imageSrc={cropSrc}
          onConfirm={(dataUrl) => {
            onPhotoChange(dataUrl);
            closeCropDialog();
          }}
          onClose={closeCropDialog}
        />
      )}
    </>
  );
}
