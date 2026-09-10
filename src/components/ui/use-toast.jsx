import * as React from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

const ToastContext = React.createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = React.useState([]);

  const remove = React.useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = React.useCallback(
    ({ title, description, variant = "default", duration = 4000 }) => {
      const id = crypto.randomUUID();
      setToasts((t) => [...t, { id, title, description, variant }]);
      if (duration) setTimeout(() => remove(id), duration);
      return id;
    },
    [remove]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "flex items-start gap-3 rounded-lg border bg-popover p-4 shadow-lg animate-in slide-in-from-bottom-2",
              t.variant === "destructive" && "border-destructive/40"
            )}
          >
            {t.variant === "destructive" ? (
              <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
            )}
            <div className="flex-1">
              {t.title && <p className="text-sm font-semibold">{t.title}</p>}
              {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
            </div>
            <button onClick={() => remove(t.id)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) return { toast: () => {} };
  return ctx;
}
