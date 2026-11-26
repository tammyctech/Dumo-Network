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
          data-tone={options?.destructive ? "danger" : "standard"}
          className="app-prompt fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-auto rounded-2xl border p-0">
          {options && (
            <form onSubmit={event => { event.preventDefault(); finish(input.trim()); }}>
              <div className="px-5 pb-5 pt-6 sm:px-7 sm:pt-7">
              <div className="app-prompt-icon mb-4 grid h-11 w-11 place-items-center rounded-xl">
                {options.destructive ? <AlertTriangle size={20} aria-hidden="true" /> : <MessageSquareText size={20} aria-hidden="true" />}
              </div>
              <h2 id="app-prompt-title" className="text-xl font-bold tracking-tight sm:text-2xl">{options.title}</h2>
              {options.message && <p id="app-prompt-description" className="app-prompt-description mt-2 break-words text-sm leading-6">{options.message}</p>}
              {options.inputLabel && (
                <label className="mt-4 block text-sm font-semibold">
                  {options.inputLabel}
                  <textarea value={input} onChange={event => setInput(event.target.value)} rows={3}
                    className="app-prompt-input input mt-2 resize-y" />
                </label>
              )}
              </div>
              <div className="app-prompt-actions flex flex-wrap justify-end gap-3 px-5 py-4 sm:px-7">
                <button type="button" onClick={() => finish(null)} className="app-prompt-cancel min-h-11 rounded-xl border px-4 text-sm font-semibold">Cancel</button>
                <button type="submit" className="app-prompt-confirm min-h-11 rounded-xl px-4 text-sm font-semibold">
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
