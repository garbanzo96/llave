"use client";
import { useActionState, useMemo, useRef, useState } from "react";
import { MapPin, Repeat } from "lucide-react";
import { requestBookingAction, searchAction } from "@/app/actions";
import { SubmitButton } from "@/components/interactive";
import { Avatar, Badge, Check, cx, Field, inputClass, Money, Notice, Stars } from "@/components/ui";
import type { CategoryInfo } from "@/lib/core/categories";

type Result = {
  id: string;
  name: string;
  photoDocId: string | null;
  bio: string;
  rating: number;
  ratingCount: number;
  completedCount: number;
  licenses: string[];
  favorite: boolean;
  distanceKm: number;
  price: { base: number; surcharge: number; total: number; billableHours: number };
};

function localInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function RequestForm({
  category,
  info,
  addresses,
  defaultGenderPref,
}: {
  category: string;
  info: CategoryInfo;
  addresses: { id: string; label: string; line: string; comuna: string }[];
  defaultGenderPref: "ANY" | "FEMALE_ONLY";
}) {
  const [urgent, setUrgent] = useState(false);
  const tomorrow = useMemo(() => {
    const d = new Date(Date.now() + 86_400_000);
    d.setHours(10, 0, 0, 0);
    return d;
  }, []);
  const [when, setWhen] = useState(localInput(tomorrow));
  const [search, doSearch] = useActionState(searchAction, null);
  const [booking, doBook] = useActionState(requestBookingAction, null);
  // React no permite `name` en un botón con formAction: la elección viaja en un campo oculto.
  const chosen = useRef<HTMLInputElement>(null);
  const results = (search?.ok ? (search.data as Result[]) : null) ?? null;
  const durations = info.pricing === "HOURLY" ? [120, 180, 240, 300, 360, 480] : [60, 90, 120, 180];
  const scheduledIso = urgent ? "" : new Date(when).toISOString();
  const maxUrgent = results?.length ? Math.max(...results.map((r) => r.price.total)) : 0;

  return (
    <form className="space-y-6" action={doSearch}>
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="scheduledAt" value={scheduledIso} />
      <input type="hidden" name="urgent" value={urgent ? "true" : "false"} />
      <input type="hidden" name="workerId" ref={chosen} defaultValue="" />

      {info.urgentAllowed && (
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="sr-only">Cuándo</legend>
          {[
            [false, "Agendar"],
            [true, "Urgencia ahora"],
          ].map(([value, label]) => (
            <label
              key={String(value)}
              className={cx(
                "flex min-h-12 cursor-pointer items-center justify-center rounded-md border-2 font-bold",
                urgent === value ? (value ? "border-margin bg-margin-tint text-margin-strong" : "border-ink bg-ink-tint text-ink") : "border-rule bg-paper",
              )}
            >
              <input type="radio" name="mode" className="sr-only" checked={urgent === value} onChange={() => setUrgent(value as boolean)} />
              {label as string}
            </label>
          ))}
        </fieldset>
      )}

      <Field label="Dirección" htmlFor="addressId">
        <select id="addressId" name="addressId" className={inputClass}>
          {addresses.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label} · {a.line}, {a.comuna}
            </option>
          ))}
        </select>
      </Field>

      {!urgent && (
        <Field label="Día y hora" htmlFor="when" hint="Con al menos 1 hora de anticipación.">
          <input id="when" type="datetime-local" required value={when} min={localInput(new Date(Date.now() + 3_600_000))} onChange={(e) => setWhen(e.target.value)} className={inputClass} />
        </Field>
      )}

      <Field label={info.pricing === "HOURLY" ? "Duración" : "Tiempo estimado"} htmlFor="minutes" hint={info.pricing === "HOURLY" ? `Mínimo ${info.minHours} horas.` : "Se cobra la visita; los trabajos extra se presupuestan y tú los apruebas en la app."}>
        <select id="minutes" name="minutes" defaultValue={durations[1]} className={inputClass}>
          {durations.map((m) => (
            <option key={m} value={m}>
              {m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Cuéntale qué necesitas" htmlFor="description">
        <textarea id="description" name="description" rows={3} maxLength={1000} className={cx(inputClass, "py-2")} placeholder={info.pricing === "HOURLY" ? "Ej. depto de 2 dormitorios, foco en cocina y baños" : "Ej. filtración bajo el lavaplatos desde ayer"} />
      </Field>

      <fieldset className="space-y-1">
        <legend className="font-bold">¿Quiénes estarán en la casa?</legend>
        <p className="text-[0.9rem] text-graphite-2">La persona lo ve antes de aceptar. Algunas solo aceptan si hay un adulto.</p>
        <Check name="adultsHome" label="Habrá un adulto en la casa" defaultChecked />
        <Check name="minorsHome" label="Habrá niñas o niños" />
        <Check name="pets" label="Hay mascotas" />
      </fieldset>

      <fieldset className="space-y-1">
        <legend className="font-bold">Preferencia de seguridad</legend>
        <label className="flex min-h-12 items-center gap-3">
          <input type="radio" name="genderPref" value="ANY" defaultChecked={defaultGenderPref === "ANY"} className="size-5 accent-[var(--ink)]" />
          Cualquier persona verificada
        </label>
        <label className="flex min-h-12 items-center gap-3">
          <input type="radio" name="genderPref" value="FEMALE_ONLY" defaultChecked={defaultGenderPref === "FEMALE_ONLY"} className="size-5 accent-[var(--ink)]" />
          Solo trabajadoras mujeres
        </label>
      </fieldset>

      <SubmitButton variant={results ? "secondary" : "primary"}>{results ? "Buscar de nuevo" : "Ver personas disponibles"}</SubmitButton>
      {search && !search.ok && <Notice tone="error">{search.error}</Notice>}

      {results && results.length === 0 && (
        <Notice tone="warn">
          No hay personas verificadas disponibles con esos filtros. Prueba otro horario{urgent ? " o agenda para más tarde" : ""}.
        </Notice>
      )}

      {results && results.length > 0 && !urgent && (
        <section className="space-y-3" aria-live="polite">
          <h2 className="text-[1.15rem] font-bold">Elige a quién invitar</h2>
          <p className="text-[0.95rem] text-graphite-2">Ordenadas por cercanía, calificación, puntualidad y si ya trabajaron contigo. Todas tienen identidad, antecedentes e inhabilidades al día.</p>
          <ul className="border-t border-rule">
            {results.map((r) => (
              <li key={r.id} className="space-y-3 border-b border-rule py-4">
                <div className="flex gap-3">
                  <Avatar docId={r.photoDocId} name={r.name} size={64} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[1.1rem] font-bold">{r.name}</p>
                    <p className="flex flex-wrap items-center gap-x-3 text-[0.95rem]">
                      <Stars value={r.ratingCount ? r.rating : null} />
                      <span className="tabular text-graphite-2">{r.completedCount} servicios</span>
                      <span className="tabular inline-flex items-center gap-1 text-graphite-2">
                        <MapPin size={14} aria-hidden /> {r.distanceKm.toString().replace(".", ",")} km
                      </span>
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge>Verificada/o</Badge>
                      {r.licenses.map((l) => (
                        <Badge key={l}>{l === "SEC_GAS" ? "SEC gas" : "SEC eléctrica"}</Badge>
                      ))}
                      {r.favorite && (
                        <Badge tone="ink">
                          <Repeat size={13} aria-hidden /> Ya trabajó contigo
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Money value={r.price.total} className="text-[1.15rem] font-bold text-ink" />
                </div>
                {r.bio && <p className="text-graphite-2">{r.bio}</p>}
                <button
                  type="submit"
                  formAction={doBook}
                  onClick={() => {
                    if (chosen.current) chosen.current.value = r.id;
                  }} className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-ink px-5 font-bold text-paper shadow-[0_2px_0_var(--ink-strong)] hover:bg-ink-strong">
                  Invitar a {r.name.split(" ")[0]}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {results && results.length > 0 && urgent && (
        <section className="space-y-3" aria-live="polite">
          <Notice tone="info">
            Hay {results.length} {results.length === 1 ? "persona verificada disponible" : "personas verificadas disponibles"} cerca. Se lo ofreceremos a la mejor
            ubicada; si no responde en 45 segundos, a la siguiente. Autorizamos hasta <Money value={maxUrgent} /> (incluye 30% de recargo por urgencia) y cobramos el
            precio real de quien acepte.
          </Notice>
          <button
            type="submit"
            formAction={doBook}
            onClick={() => {
              if (chosen.current) chosen.current.value = "";
            }}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-margin px-5 font-bold text-paper hover:bg-margin-strong">
            Pedir urgencia ahora
          </button>
        </section>
      )}
      {booking && !booking.ok && <Notice tone="error">{booking.error}</Notice>}
    </form>
  );
}
