"use client";
// Piezas interactivas del kit. Las acciones llegan como Server Actions (ya ligadas con .bind cuando llevan argumentos).
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Camera, LoaderCircle, LocateFixed, Phone, ShieldAlert } from "lucide-react";
import type { ActionResult } from "@/server/action";
import { buttonClass, cx, Notice } from "./ui";
import { markSafeAction, sosAction } from "@/app/actions";
import { EMERGENCY_NUMBERS } from "@/lib/core/safety";

type FormAction = (state: ActionResult<unknown> | null, f: FormData) => Promise<ActionResult<unknown> | null>;

export function ActionForm({
  action,
  children,
  className,
  onDone,
}: {
  action: FormAction;
  children: React.ReactNode;
  className?: string;
  onDone?: (r: ActionResult<unknown>) => void;
}) {
  const [state, formAction] = useActionState(action, null);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (state?.ok) done.current?.(state);
  }, [state]);
  return (
    <form action={formAction} className={cx("space-y-4", className)}>
      {children}
      {state && !state.ok && <Notice tone="error">{state.error}</Notice>}
      {state?.ok && state.message && <Notice tone="ok">{state.message}</Notice>}
    </form>
  );
}

export function SubmitButton({ children, variant = "primary", full = true }: { children: React.ReactNode; variant?: "primary" | "secondary" | "danger" | "ghost"; full?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={buttonClass(variant, full)}>
      {pending && <LoaderCircle size={18} className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function ActionButton({
  action,
  children,
  variant = "primary",
  full = true,
  confirm,
}: {
  action: () => Promise<ActionResult<unknown>>;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  full?: boolean;
  confirm?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className={cx("space-y-2", full && "w-full")}>
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        className={buttonClass(variant, full)}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          setError(null);
          start(async () => {
            const r = await action();
            if (!r.ok) setError(r.error);
            else router.refresh();
          });
        }}
      >
        {pending && <LoaderCircle size={18} className="animate-spin" aria-hidden />}
        {children}
      </button>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

// Actualización periódica de la página (el servidor vuelve a leer el estado).
export function AutoRefresh({ ms = 5000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, ms);
    return () => clearInterval(t);
  }, [ms, router]);
  return null;
}

export function getPosition(timeout = 8000): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, timeout, maximumAge: 15_000 });
  });
}

// Campos ocultos lat/lng llenados desde el GPS del teléfono.
export function LocationFields({ latName = "lat", lngName = "lng", label = "Usar mi ubicación actual", initial }: { latName?: string; lngName?: string; label?: string; initial?: { lat: number; lng: number } | null }) {
  const [pos, setPos] = useState<{ lat: number; lng: number; acc?: number } | null>(initial ?? null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  return (
    <div className="space-y-2">
      <input type="hidden" name={latName} value={pos?.lat ?? ""} />
      <input type="hidden" name={lngName} value={pos?.lng ?? ""} />
      <button
        type="button"
        className={buttonClass("secondary")}
        onClick={async () => {
          setState("loading");
          const p = await getPosition();
          if (!p) return setState("error");
          setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy });
          setState("idle");
        }}
      >
        {state === "loading" ? <LoaderCircle size={18} className="animate-spin" aria-hidden /> : <LocateFixed size={18} aria-hidden />}
        {label}
      </button>
      {pos && (
        <p className="tabular text-[0.9rem] text-ok">
          Ubicación lista{pos.acc ? ` (precisión ±${Math.round(pos.acc)} m)` : ""}.
        </p>
      )}
      {state === "error" && <Notice tone="error">No pudimos leer tu ubicación. Revisa los permisos del navegador.</Notice>}
    </div>
  );
}

export function CameraField({ name, label, facing = "environment", required }: { name: string; label: string; facing?: "user" | "environment"; required?: boolean }) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  return (
    <label className="block cursor-pointer space-y-2">
      <span className="block font-bold text-graphite">{label}</span>
      <span className="flex min-h-28 items-center justify-center gap-2 overflow-hidden rounded-md border-2 border-dashed border-ink/40 bg-paper text-ink hover:border-ink">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
          <img src={preview} alt="" className="max-h-56 w-full object-contain" />
        ) : (
          <>
            <Camera size={20} aria-hidden /> Tomar o subir foto
          </>
        )}
      </span>
      <input
        type="file"
        name={name}
        accept="image/jpeg,image/png,image/webp"
        capture={facing}
        required={required}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          setPreview(f ? URL.createObjectURL(f) : null);
        }}
      />
    </label>
  );
}

export function Countdown({ to, onEnd }: { to: Date | string; onEnd?: () => void }) {
  const end = new Date(to).getTime();
  const [left, setLeft] = useState(() => Math.max(0, end - Date.now()));
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      const l = Math.max(0, end - Date.now());
      setLeft(l);
      if (l === 0) {
        clearInterval(t);
        onEnd ? onEnd() : router.refresh();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [end, onEnd, router]);
  const s = Math.ceil(left / 1000);
  const text = s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min` : s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s} s`;
  return <span className="tabular">{text}</span>;
}

// Envía la ubicación cada 20 s mientras el trabajador va en camino o está en el domicilio.
export function LivePing({ bookingId, ping }: { bookingId: string; ping: (lat: number, lng: number, bookingId?: string) => Promise<unknown> }) {
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    let last = 0;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        if (Date.now() - last < 20_000) return;
        last = Date.now();
        void ping(p.coords.latitude, p.coords.longitude, bookingId);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [bookingId, ping]);
  return null;
}

// Ayuda en el margen rojo. Un toque abre el panel; enviar la alerta es un segundo toque (evita alertas desde el bolsillo).
// La alerta es silenciosa: no suena ni cambia la pantalla de forma visible para quien esté cerca.
export function SafetyRail({ bookingId, openSosId }: { bookingId?: string; openSosId?: string | null }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [sent, setSent] = useState<string | null>(openSosId ?? null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        aria-label={sent ? "Alerta activa: abrir ayuda" : "Ayuda y emergencia"}
        className={cx(
          "fixed bottom-[max(env(safe-area-inset-bottom),20px)] z-20 grid size-12 place-items-center rounded-full border-2 border-paper bg-margin text-paper shadow-[0_3px_10px_-2px_rgba(158,11,35,0.55)] hover:bg-margin-strong",
          sent && "outline outline-3 outline-offset-2 outline-margin",
        )}
        style={{ left: "calc(var(--margin-x) - 25px)" }}
      >
        <ShieldAlert size={22} aria-hidden />
      </button>
      <dialog
        ref={dialog}
        className="m-auto w-[min(30rem,calc(100vw-24px))] rounded-md border-2 border-margin bg-paper p-0 text-graphite backdrop:bg-graphite/50"
        aria-labelledby="sos-title"
      >
        <div className="space-y-4 p-5">
          <h2 id="sos-title" className="text-[1.3rem] font-bold text-margin-strong">
            {sent ? "La central está avisada" : "¿Necesitas ayuda?"}
          </h2>
          {!sent ? (
            <>
              <p className="text-graphite-2">
                La alerta llega a la central de Llave con tu ubicación y los datos del servicio, y avisa a tus contactos de confianza. No hace ruido.
              </p>
              <button
                type="button"
                disabled={pending}
                className={buttonClass("danger")}
                onClick={() =>
                  start(async () => {
                    const p = await getPosition(4000);
                    const r = await sosAction({ bookingId, lat: p?.coords.latitude, lng: p?.coords.longitude, silent: true });
                    if (r.ok) setSent(String(r.data));
                    else setMsg(r.error);
                  })
                }
              >
                {pending && <LoaderCircle size={18} className="animate-spin" aria-hidden />}
                Enviar alerta silenciosa
              </button>
            </>
          ) : (
            <>
              <p className="text-graphite-2">Te llamaremos para confirmar. Si puedes, llama también a emergencias.</p>
              <button
                type="button"
                disabled={pending}
                className={buttonClass("secondary")}
                onClick={() =>
                  start(async () => {
                    const r = await markSafeAction(sent);
                    setMsg(r.ok ? "Registramos que estás a salvo. La central igual te llamará para cerrar el caso." : r.error);
                  })
                }
              >
                Estoy a salvo
              </button>
            </>
          )}
          {msg && <Notice tone="info">{msg}</Notice>}
          <ul className="grid grid-cols-2 gap-2">
            {EMERGENCY_NUMBERS.map((n) => (
              <li key={n.number}>
                <a href={`tel:${n.number}`} className="flex min-h-12 items-center gap-2 rounded-md border border-rule px-3 font-bold text-graphite hover:border-ink">
                  <Phone size={16} aria-hidden className="text-margin" />
                  <span className="tabular">{n.number}</span>
                  <span className="truncate text-[0.85rem] font-normal text-graphite-2">{n.label}</span>
                </a>
              </li>
            ))}
          </ul>
          <form method="dialog">
            <button className={buttonClass("ghost")}>Cerrar</button>
          </form>
        </div>
      </dialog>
    </>
  );
}
