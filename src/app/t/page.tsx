import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { myBookings, workerOffers } from "@/server/views";
import { respondOfferAction } from "@/app/actions";
import { ActionButton, AutoRefresh, Countdown, SafetyRail } from "@/components/interactive";
import { Badge, ButtonLink, Empty, fmtDate, fmtTime, Line, Money, Page, Section, Sheet, Stars, StatusTag } from "@/components/ui";
import { Availability } from "./_components";

export default async function WorkerHome() {
  const user = await requireUser("WORKER");
  const [profile, offers, bookings] = await Promise.all([
    db.workerProfile.findUnique({ where: { userId: user.id } }), workerOffers(user), myBookings(user),
  ]);
  return <Page title={`Hola, ${user.name.split(" ")[0]}`}>
    {user.status !== "ACTIVE" && <Sheet tone="alert"><div className="space-y-3">
      <p className="font-bold">Completa tus verificaciones para recibir solicitudes</p>
      <p>Revisa los requisitos y el estado de tus documentos. Si tu cuenta está suspendida, pide una revisión a la central.</p>
      <ButtonLink href="/verificacion" variant="secondary">Ver mis verificaciones</ButtonLink>
    </div></Sheet>}
    <Availability online={profile?.online ?? false} active={user.status === "ACTIVE"} />
    <Section title="Solicitudes" aside={<span className="tabular text-graphite-2">{offers.length}</span>}>
      {offers.length === 0 && <Empty title="No tienes solicitudes pendientes">Mantén tu perfil al día. Para recibir urgencias, activa tu disponibilidad.</Empty>}
      {offers.map(o => <Sheet key={o.offerId}><article className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-bold">{o.categoryLabel}</h3>{o.mode === "URGENT" && <Badge tone="alert">Urgencia</Badge>}</div>
        <p className="tabular font-bold text-ink">{fmtDate(o.scheduledAt)} · {fmtTime(o.scheduledAt)}</p>
        <p>{o.comuna} · {o.estimatedMinutes} min estimados</p>
        <p className="whitespace-pre-wrap break-words">{o.description}</p>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-graphite-2">
          <dt>Adultos presentes</dt><dd>{o.household.adultsHome ? "Sí" : "No"}</dd>
          <dt>Menores</dt><dd>{o.household.minorsHome ? "Sí" : "No"}</dd>
          <dt>Mascotas</dt><dd>{o.household.pets ? "Sí" : "No"}</dd>
        </dl>
        <div className="border-y border-rule py-3"><p className="font-bold">{o.client.name}</p><Stars value={o.client.rating} /><p className="tabular text-graphite-2">{o.client.completedCount} servicios completados</p></div>
        <p>Total del servicio: <Money value={o.price.total} /></p>
        <p className="text-xl font-bold text-ink">Recibes <Money value={o.payout} /></p>
        <p>La solicitud vence en <Countdown to={o.expiresAt} /></p>
        <div className="grid gap-2 sm:grid-cols-2"><ActionButton action={respondOfferAction.bind(null, o.offerId, true)}>Aceptar</ActionButton><ActionButton action={respondOfferAction.bind(null, o.offerId, false)} variant="secondary">Rechazar</ActionButton></div>
      </article></Sheet>)}
    </Section>
    <Section title="Tu agenda">
      {bookings.length ? bookings.map(b => <Line key={b.id} href={`/t/servicio/${b.id}`} when={fmtTime(b.scheduledAt)} title={b.categoryLabel} detail={`${fmtDate(b.scheduledAt)} · ${b.comuna} · ${b.otherName ?? "Cliente"}`} status={<StatusTag status={b.status} />} />) : <Empty title="Tu agenda está libre">Cuando aceptes una solicitud, podrás seguir el servicio desde aquí.</Empty>}
    </Section>
    <nav aria-label="Tu cuenta" className="grid gap-2 sm:grid-cols-2">
      <ButtonLink href="/t/perfil" variant="secondary">Mi perfil y tarifas</ButtonLink><ButtonLink href="/seguridad" variant="secondary">Seguridad</ButtonLink><ButtonLink href="/t/transparencia" variant="ghost">Cómo llegan las solicitudes</ButtonLink><ButtonLink href="/verificacion" variant="ghost">Mis verificaciones</ButtonLink>
    </nav>
    <AutoRefresh ms={5000} /><SafetyRail />
  </Page>;
}
