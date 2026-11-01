import { Download, X } from "lucide-react";

type ScreenshotPreviewProps = {
  imageUrl: string;
  filename: string;
  onClose: () => void;
};

export default function ScreenshotPreview({
  imageUrl,
  filename,
  onClose,
}: ScreenshotPreviewProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="screenshot-preview-title"
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="screenshot-preview-title" className="font-bold text-slate-900">
              Screenshot preview
            </h2>
            <p className="mt-1 text-xs text-slate-500">{filename}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={imageUrl}
              download={filename}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              <Download size={16} />
              Download PNG
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close screenshot preview"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              <X size={18} />
            </button>
          </div>
        </header>
        <div className="overflow-auto bg-slate-100 p-4">
          <img
            src={imageUrl}
            alt="Screenshot of the current application page"
            className="mx-auto h-auto max-h-[72vh] w-auto max-w-full rounded-lg border border-slate-200 bg-white object-contain shadow-sm"
          />
        </div>
      </section>
    </div>
  );
}
