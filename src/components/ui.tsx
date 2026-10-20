// Kit visual de Llave (mundo cuaderno). Componentes sin estado, usables desde Server Components.
import Link from "next/link";
import { ArrowLeft, BadgeCheck, Clock, Phone, ShieldAlert } from "lucide-react";
import { STATUS_LABEL, type Status } from "@/lib/core/booking-machine";
import { clp } from "@/lib/core/pricing";
import { EMERGENCY_NUMBERS } from "@/lib/core/safety";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

// Columna de contenido a la derecha del margen rojo. `rail` reserva el margen para el botón de ayuda.
export function Page({ title, back, children, actions }: { title: string; back?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="relative z-[1] min-h-dvh pb-28 pl-[calc(var(--margin-x)+14px)] pr-4 pt-[max(env(safe-area-inset-top),16px)]">
      <div className="mx-auto max-w-[36rem]">
        <header className="flex min-h-12 items-center gap-2 pb-4 pt-2">
          {back && (
            <Link href={back} aria-label="Volver" className="-ml-2 grid size-11 place-items-center rounded-md text-ink hover:bg-ink-tint">
              <ArrowLeft size={22} aria-hidden />
            </Link>
          )}
          <h1 className="flex-1 text-[1.55rem] font-bold leading-tight tracking-[-0.01em] text-graphite [text-wrap:balance]">{title}</h1>
          {actions}
        </header>
        <div className="space-y-8">{children}</div>
      </div>
    </div>
  );
}

export function Section({ title, children, aside }: { title?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="space-y-3">
      {title && (
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[1.15rem] font-bold text-graphite">{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

// Hoja: un trozo de papel blanco sobre la cuadrícula. No se anida.
export function Sheet({ children, className, tone = "plain" }: { children: React.ReactNode; className?: string; tone?: "plain" | "alert" | "ok" }) {
  return (
    <div
      className={cx(
        "rounded-md border bg-paper p-4 shadow-[0_1px_2px_rgba(18,29,107,0.06),0_4px_14px_-6px_rgba(18,29,107,0.12)]",
        tone === "plain" && "border-rule",
        tone === "alert" && "border-margin bg-margin-tint",
        tone === "ok" && "border-ok/40 bg-ok-tint",
        className,
      )}
    >
      {children}
    </div>
  );
}

// Una línea del cuaderno: hora a la izquierda, contenido, estado a la derecha.
export function Line({ href, when, title, detail, status }: { href?: string; when: string; title: string; detail?: string; status?: React.ReactNode }) {
  const inner = (
    <div className="grid grid-cols-[4.5rem_1fr_auto] items-start gap-3 border-b border-rule py-3">
      <span className="tabular pt-0.5 text-[0.95rem] font-bold text-ink">{when}</span>
      <span className="min-w-0">
        <span className="block truncate font-bold text-graphite">{title}</span>
        {detail && <span className="block truncate text-[0.95rem] text-graphite-2">{detail}</span>}
      </span>
      {status}
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-sm hover:bg-ink-tint/60">
      {inner}
    </Link>
  ) : (
    inner
  );
}

const statusTone: Record<Status, string> = {
  REQUESTED: "bg-warn-tint text-warn",
  ACCEPTED: "bg-ink-tint text-ink",
  EN_ROUTE: "bg-ink-tint text-ink",
  ARRIVED: "bg-ink text-paper",
  IN_PROGRESS: "bg-ink text-paper",
  COMPLETED: "bg-ok-tint text-ok",
  SETTLED: "bg-paper-2 text-graphite-2",
  DISPUTED: "bg-margin-tint text-margin-strong",
  CANCELLED: "bg-paper-2 text-graphite-2",
  EXPIRED: "bg-paper-2 text-graphite-2",
};

export function StatusTag({ status }: { status: Status }) {
  return <span className={cx("whitespace-nowrap rounded-sm px-2 py-0.5 text-[0.85rem] font-bold", statusTone[status])}>{STATUS_LABEL[status]}</span>;
}

export function Badge({ tone = "ok", children }: { tone?: "ok" | "warn" | "alert" | "ink"; children: React.ReactNode }) {
  const Icon = tone === "ok" ? BadgeCheck : tone === "alert" ? ShieldAlert : Clock;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[0.85rem] font-bold",
        tone === "ok" && "bg-ok-tint text-ok",
        tone === "warn" && "bg-warn-tint text-warn",
        tone === "alert" && "bg-margin-tint text-margin-strong",
        tone === "ink" && "bg-ink-tint text-ink",
      )}
    >
      <Icon size={15} aria-hidden />
      {children}
    </span>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "ok" | "error" | "warn"; children: React.ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "rounded-md px-3 py-2 text-[0.95rem]",
        tone === "info" && "bg-ink-tint text-ink-strong",
        tone === "ok" && "bg-ok-tint text-ok",
        tone === "error" && "bg-margin-tint text-margin-strong",
        tone === "warn" && "bg-warn-tint text-warn",
      )}
    >
      {children}
    </p>
  );
}

export const buttonClass = (variant: "primary" | "secondary" | "danger" | "ghost" = "primary", full = true) =>
  cx(
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-5 text-[1rem] font-bold transition-[background-color,box-shadow,transform] duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50",
    full && "w-full",
    variant === "primary" && "bg-ink text-paper shadow-[0_2px_0_var(--ink-strong)] hover:bg-ink-strong",
    variant === "secondary" && "border-2 border-ink bg-paper text-ink hover:bg-ink-tint",
    variant === "danger" && "bg-margin text-paper shadow-[0_2px_0_var(--margin-strong)] hover:bg-margin-strong",
    variant === "ghost" && "text-ink underline-offset-4 hover:underline",
  );

export function ButtonLink({ href, children, variant = "primary", full = true }: { href: string; children: React.ReactNode; variant?: "primary" | "secondary" | "danger" | "ghost"; full?: boolean }) {
  return (
    <Link href={href} className={buttonClass(variant, full)}>
      {children}
    </Link>
  );
}

export const inputClass =
  "block min-h-12 w-full rounded-md border-2 border-rule bg-paper px-3 text-graphite placeholder:text-graphite-2 hover:border-graphite-2/50 focus:border-ink focus:outline-none aria-[invalid=true]:border-margin";

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block font-bold text-graphite">
        {label}
      </label>
      {children}
      {hint && <p className="text-[0.9rem] text-graphite-2">{hint}</p>}
    </div>
  );
}

export function Check({ name, label, defaultChecked, hint }: { name: string; label: string; defaultChecked?: boolean; hint?: string }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-start gap-3 py-1">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-1 size-5 shrink-0 accent-[var(--ink)]" />
      <span>
        <span className="block text-graphite">{label}</span>
        {hint && <span className="block text-[0.9rem] text-graphite-2">{hint}</span>}
      </span>
    </label>
  );
}

export function Avatar({ docId, name, size = 56 }: { docId: string | null; name: string; size?: number }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return docId ? (
    // eslint-disable-next-line @next/next/no-img-element -- imagen privada servida con autorización, no optimizable
    <img src={`/api/files/${docId}`} alt={`Foto de ${name}`} width={size} height={size} className="shrink-0 rounded-md border border-rule object-cover" style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-md border border-rule bg-ink-tint font-bold text-ink" style={{ width: size, height: size }}>
      {initials}
    </span>
  );
}

export function Money({ value, className }: { value: number; className?: string }) {
  return <span className={cx("tabular", className)}>{clp(value)}</span>;
}

// PIN escrito en cuatro cuadros de la cuadrícula, como en una prueba de matemáticas.
export function PinCells({ pin }: { pin: string }) {
  return (
    <div className="flex gap-0" aria-label={`PIN ${pin.split("").join(" ")}`}>
      {pin.split("").map((d, i) => (
        <span key={i} aria-hidden className="tabular grid size-16 place-items-center border-2 border-ink bg-paper text-[2.4rem] font-bold text-ink [&+&]:border-l-0">
          {d}
        </span>
      ))}
    </div>
  );
}

const STEPS: Status[] = ["REQUESTED", "ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS", "COMPLETED", "SETTLED"];

export function StatusTrack({ status }: { status: Status }) {
  const idx = STEPS.indexOf(status);
  if (idx < 0) return <StatusTag status={status} />;
  return (
    <ol className="grid grid-cols-7 gap-0.5" aria-label={`Estado: ${STATUS_LABEL[status]}`}>
      {STEPS.map((s, i) => (
        <li key={s} className={cx("h-1.5 rounded-full", i <= idx ? "bg-ink" : "bg-rule")} title={STATUS_LABEL[s]} />
      ))}
    </ol>
  );
}

export function Stars({ value }: { value: number | null }) {
  if (value == null) return <span className="text-[0.95rem] text-graphite-2">Sin calificaciones aún</span>;
  return (
    <span className="tabular font-bold text-graphite">
      ★ {value.toFixed(1).replace(".", ",")}
    </span>
  );
}

export function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short", timeZone: "America/Santiago" });
}

export function fmtTime(d: Date | string) {
  return new Date(d).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" });
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="border-y border-dashed border-rule py-6">
      <p className="font-bold text-graphite">{title}</p>
      {children && <div className="mt-1 text-graphite-2">{children}</div>}
    </div>
  );
}

export const VERIFICATION_LABEL: Record<string, string> = {
  IDENTITY: "Identidad",
  CRIMINAL_RECORD: "Antecedentes",
  MINORS_REGISTRY: "Inhabilidades (Ley 20.594)",
  SEC_LICENSE: "Licencia SEC",
  REFERENCES: "Referencias",
};

export function TrustBadges({ badges }: { badges: { kind: string; expiresAt: Date | null; license: string | null }[] }) {
  if (!badges.length) return <Badge tone="warn">Verificación pendiente</Badge>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {badges.map((b) => (
        <li key={b.kind + (b.license ?? "")}>
          <Badge>
            {b.kind === "SEC_LICENSE" ? (b.license === "SEC_GAS" ? "SEC gas" : "SEC eléctrica") : VERIFICATION_LABEL[b.kind]}
            {b.expiresAt && <span className="font-normal"> · vence {new Date(b.expiresAt).toLocaleDateString("es-CL", { month: "short", year: "2-digit" })}</span>}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

export function EmergencyNumbers() {
  return (
    <ul className="grid grid-cols-2 gap-2">
      {EMERGENCY_NUMBERS.map((n) => (
        <li key={n.number}>
          <a href={`tel:${n.number}`} className="flex min-h-14 items-center gap-2 rounded-md border border-rule bg-paper px-3 py-1.5 hover:border-ink">
            <Phone size={16} aria-hidden className="shrink-0 text-margin" />
            <span className="leading-tight">
              <span className="tabular block font-bold text-graphite">{n.number}</span>
              <span className="block text-[0.85rem] text-graphite-2">{n.label}</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

// Recordatorio de conducta al llegar y durante el servicio (patrón HarassmentReminder de DiDi), para ambas partes.
export function ConductReminder() {
  return (
    <Notice tone="info">
      Llave no tolera acoso, insultos ni contacto no consentido, en ninguna dirección. Si algo te incomoda, usa el botón rojo del margen: la alerta es
      silenciosa.
    </Notice>
  );
}

export function NightModeNotice() {
  return <Notice tone="warn">Modo nocturno: el chequeo de bienestar llega a los 15 minutos de pasada la hora estimada, no a los 30.</Notice>;
}
