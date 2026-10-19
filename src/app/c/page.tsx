import Link from "next/link";
import { ChevronRight, Siren } from "lucide-react";
import { requireUser } from "@/server/auth";
import { myBookings } from "@/server/views";
import { AutoRefresh, SafetyRail } from "@/components/interactive";
import { ButtonLink, Empty, fmtDate, fmtTime, Line, Page, Section, Sheet, StatusTag } from "@/components/ui";
import { CATEGORIES, CATEGORY_KEYS } from "@/lib/core/categories";
import { ACTIVE_STATUSES, type Status } from "@/lib/core/booking-machine";

export const metadata = { title: "Inicio" };

export default async function ClientHome() {
  const user = await requireUser("CLIENT");
  const bookings = await myBookings(user);
  const live = bookings.filter((b) => [...ACTIVE_STATUSES, "REQUESTED", "COMPLETED", "DISPUTED"].includes(b.status as Status));
  const past = bookings.filter((b) => !live.includes(b));
  const first = user.name.split(" ")[0];

  return (
    <Page title={`Hola, ${first}`} actions={<Link href="/c/perfil" className="font-bold text-ink underline">Perfil</Link>}>
      {user.status !== "ACTIVE" && (
        <Sheet tone="alert" className="space-y-3">
          <p className="font-bold text-margin-strong">Verifica tu identidad para pedir servicios</p>
          <p>Toma 3 minutos: cédula, una selfie y una foto de perfil. Quien va a tu casa también necesita saber a quién visita.</p>
          <ButtonLink href="/verificacion">Verificarme</ButtonLink>
        </Sheet>
      )}

      {live.length > 0 && (
        <Section title="En curso">
          <div className="border-t border-rule">
            {live.map((b) => (
              <Line
                key={b.id}
                href={`/c/servicio/${b.id}`}
                when={fmtTime(b.scheduledAt)}
                title={b.categoryLabel}
                detail={`${fmtDate(b.scheduledAt)}${b.otherName ? ` · ${b.otherName}` : ""}`}
                status={<StatusTag status={b.status as Status} />}
              />
            ))}
          </div>
          <AutoRefresh ms={8000} />
        </Section>
      )}

      <Section title="¿Qué necesitas?">
        <ul className="border-t border-rule">
          {CATEGORY_KEYS.map((k) => (
            <li key={k}>
              <Link href={`/c/pedir?cat=${k}`} className="flex min-h-14 items-center gap-3 border-b border-rule px-1 hover:bg-ink-tint/60">
                <span className="flex-1 text-[1.1rem] font-bold">{CATEGORIES[k].label}</span>
                {CATEGORIES[k].urgentAllowed && (
                  <span className="inline-flex items-center gap-1 text-[0.85rem] text-margin-strong">
                    <Siren size={15} aria-hidden /> también urgencias
                  </span>
                )}
                <ChevronRight size={20} aria-hidden className="text-ink" />
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Historial">
        {past.length ? (
          <div className="border-t border-rule">
            {past.map((b) => (
              <Line
                key={b.id}
                href={`/c/servicio/${b.id}`}
                when={new Date(b.scheduledAt).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" })}
                title={b.categoryLabel}
                detail={b.otherName ?? b.comuna}
                status={<StatusTag status={b.status as Status} />}
              />
            ))}
          </div>
        ) : (
          <Empty title="Todavía no tienes servicios">Cuando pidas uno, quedará anotado aquí con quién fue, cuánto costó y su calificación.</Empty>
        )}
      </Section>
      <nav className="flex flex-wrap gap-x-5 gap-y-2 font-bold text-ink">
        <Link href="/seguridad" className="underline">Seguridad y contactos</Link>
        <Link href="/verificacion" className="underline">Verificación</Link>
        <Link href="/cuenta" className="underline">Cuenta</Link>
      </nav>
      <SafetyRail />
    </Page>
  );
}
