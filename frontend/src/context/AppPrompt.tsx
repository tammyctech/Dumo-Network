import { AlertTriangle, MessageSquareText } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import ViewportPortal from "../components/ViewportPortal";

type PromptOptions = {
  title: string;
  message?: string;
  confirmLabel: string;
  inputLabel?: string;
  destructive?: boolean;
};

const PromptContext = createContext<((options: PromptOptions) => Promise<string | null>) | null>(null);

export function useAppPrompt() {
  const ask = useContext(PromptContext);
  if (!ask) throw new Error("useAppPrompt requires AppPromptProvider");
  return ask;
}

export function AppPromptProvider({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const resolvePrompt = useRef<((value: string | null) => void) | null>(null);
  const [options, setOptions] = useState<PromptOptions | null>(null);
  const [input, setInput] = useState("");

  function ask(next: PromptOptions): Promise<string | null> {
    if (resolvePrompt.current) return Promise.resolve(null);
    return new Promise(resolve => {
      resolvePrompt.current = resolve;
      setInput("");
      setOptions(next);
    });
  }

  useEffect(() => {
    if (options && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [options]);

  function finish(value: string | null) {
    const resolve = resolvePrompt.current;
    resolvePrompt.current = null;
    dialog.current?.close();
    setOptions(null);
    resolve?.(value);
  }

  return (
    <PromptContext.Provider value={ask}>
      {children}
      <ViewportPortal>
        <dialog ref={dialog} aria-labelledby="app-prompt-title"
          aria-describedby={options?.message ? "app-prompt-description" : undefined}
          onCancel={event => { event.preventDefault(); finish(null); }}
          className="app-prompt fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl backdrop:bg-slate-950/65">
          {options && (
            <form onSubmit={event => { event.preventDefault(); finish(input.trim()); }}>
              <div className={`mb-4 grid h-11 w-11 place-items-center rounded-xl ${options.destructive ? "bg-red-50 text-red-700" : "bg-sky-50 text-sky-700"}`}>
                {options.destructive ? <AlertTriangle size={20} aria-hidden="true" /> : <MessageSquareText size={20} aria-hidden="true" />}
              </div>
              <h2 id="app-prompt-title" className="text-xl font-bold">{options.title}</h2>
              {options.message && <p id="app-prompt-description" className="app-prompt-description mt-2 break-words text-sm leading-6">{options.message}</p>}
              {options.inputLabel && (
                <label className="mt-4 block text-sm font-semibold">
                  {options.inputLabel}
                  <textarea value={input} onChange={event => setInput(event.target.value)} rows={3}
                    className="input mt-2 resize-y" />
                </label>
              )}
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button type="button" onClick={() => finish(null)} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold">Cancel</button>
                <button type="submit" className={`min-h-11 rounded-xl px-4 text-sm font-semibold text-white ${options.destructive ? "bg-red-700 hover:bg-red-800" : "bg-sky-700 hover:bg-sky-800"}`}>
                  {options.confirmLabel}
                </button>
              </div>
            </form>
          )}
        </dialog>
      </ViewportPortal>
    </PromptContext.Provider>
  );
}
