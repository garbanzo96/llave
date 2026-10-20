import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { bookingView, type BookingView } from "@/server/views";
import { answerQuoteAction, blockAction, confirmIdentityAction, confirmServiceAction, disputeAction } from "@/app/actions";
import { ActionButton, ActionForm, AutoRefresh, Countdown, SafetyRail, SubmitButton } from "@/components/interactive";
import { CancelForm, Chat, RatingForm, ShareTrip, WellbeingBanner } from "@/components/booking";
import {
  Avatar,
  ButtonLink,
  ConductReminder,
  NightModeNotice,
  cx,
  fmtDate,
  fmtTime,
  inputClass,
  Money,
  Notice,
  Page,
  PinCells,
  Section,
  Sheet,
  Stars,
  StatusTag,
  StatusTrack,
  TrustBadges,
} from "@/components/ui";
import type { Status } from "@/lib/core/booking-machine";
import { isNight } from "@/lib/core/geo";

const LIVE_NIGHT: Status[] = ["ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"];

export const metadata = { title: "Servicio" };

const LIVE: Status[] = ["REQUESTED", "ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"];

function Photos({ ids, label }: { ids: string[]; label: string }) {
  if (!ids.length) return null;
  return (
    <div className="space-y-2">
      <p className="font-bold">{label}</p>
      <ul className="grid grid-cols-3 gap-2">
        {ids.map((id) => (
          <li key={id}>
            <a href={`/api/files/${id}`} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element -- archivo privado con autorización */}
              <img src={`/api/files/${id}`} alt={label} className="aspect-square w-full rounded-md border border-rule object-cover" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Door({ v }: { v: BookingView }) {
  const other = v.other!;
  if (!v.startSelfieIds.length)
    return (
      <Sheet tone="alert" className="space-y-2">
        <p className="text-[1.15rem] font-bold text-margin-strong">{other.name} está en tu puerta</p>
        <p>Está tomándose la selfie de llegada. Espera a compararla antes de abrir.</p>
      </Sheet>
    );
  if (!v.identityConfirmed)
    return (
      <Sheet className="space-y-4">
        <p className="text-[1.15rem] font-bold">¿Es la misma persona?</p>
        <div className="grid grid-cols-2 gap-3">
          <figure className="space-y-1">
            {other.photoDocId ? (
              // eslint-disable-next-line @next/next/no-img-element -- archivo privado con autorización
              <img src={`/api/files/${other.photoDocId}`} alt={`Foto de perfil de ${other.name}`} className="aspect-[3/4] w-full rounded-md border border-rule object-cover" />
            ) : (
              <div className="grid aspect-[3/4] place-items-center rounded-md border border-rule text-graphite-2">Sin foto</div>
            )}
            <figcaption className="text-[0.9rem] text-graphite-2">Perfil verificado</figcaption>
          </figure>
          <figure className="space-y-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- archivo privado con autorización */}
            <img src={`/api/files/${v.startSelfieIds.at(-1)}`} alt={`Selfie de llegada de ${other.name}`} className="aspect-[3/4] w-full rounded-md border-2 border-ink object-cover" />
            <figcaption className="text-[0.9rem] text-graphite-2">Selfie de ahora</figcaption>
          </figure>
        </div>
        <ActionButton action={confirmIdentityAction.bind(null, v.id, true)}>Sí, es la misma persona</ActionButton>
        <ActionButton action={confirmIdentityAction.bind(null, v.id, false)} variant="danger" confirm="Avisaremos a la central de inmediato. No abras la puerta. ¿Continuar?">
          No es la persona
        </ActionButton>
      </Sheet>
    );
  return (
    <Sheet className="space-y-3">
      <p className="text-[1.15rem] font-bold">Ahora dicta tu PIN</p>
      <PinCells pin={v.pin!} />
      <p className="text-graphite-2">Con el PIN correcto empieza el servicio. Nunca lo compartas por chat.</p>
    </Sheet>
  );
}

export default async function ClientBooking({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("CLIENT");
  const { id } = await params;
  const v = await bookingView(user, id).catch(() => null);
  if (!v || v.role !== "CLIENT") notFound();
  const status = v.status as Status;
  const other = v.other;
  const live = LIVE.includes(status);
  const total = v.quotedAmount + v.extrasAmount;
  const hoursLeft = (new Date(v.scheduledAt).getTime() - Date.now()) / 3_600_000;

  return (
    <Page title={v.categoryLabel} back="/c">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="tabular font-bold text-ink">
            {v.mode === "URGENT" ? "Urgencia" : `${fmtDate(v.scheduledAt)}, ${fmtTime(v.scheduledAt)}`}
          </p>
          <StatusTag status={status} />
        </div>
        <StatusTrack status={status} />
        <p className="text-graphite-2">
          {v.address.line}, {v.address.comuna}
        </p>
      </div>

      {v.wellbeingPending && <WellbeingBanner bookingId={v.id} />}
      {["ARRIVED", "IN_PROGRESS"].includes(status) && <ConductReminder />}
      {LIVE_NIGHT.includes(status) && isNight(new Date(v.scheduledAt)) && <NightModeNotice />}

      {status === "REQUESTED" &&
        (v.mode === "URGENT" ? (
          <Notice tone="info">Buscando a la persona verificada más cercana. Esto toma uno o dos minutos.</Notice>
        ) : v.pendingOfferExpiresAt ? (
          <Notice tone="info">
            Esperando respuesta. La invitación vence en <Countdown to={v.pendingOfferExpiresAt} />.
          </Notice>
        ) : (
          <div className="space-y-3">
            <Notice tone="warn">La persona que invitaste no puede ir. No se te cobró nada.</Notice>
            <ButtonLink href={`/c/pedir?cat=${v.category}`}>Elegir a otra persona</ButtonLink>
          </div>
        ))}

      {other && (
        <Section title={status === "ARRIVED" ? undefined : "Quién va"}>
          {status === "ARRIVED" ? (
            <Door v={v} />
          ) : (
            <div className="flex gap-3">
              <Avatar docId={other.photoDocId} name={other.name} size={72} />
              <div className="min-w-0 space-y-1">
                <p className="text-[1.15rem] font-bold">{other.name}</p>
                <p className="flex gap-3 text-[0.95rem]">
                  <Stars value={other.rating} />
                  <span className="tabular text-graphite-2">{other.completedCount} servicios</span>
                </p>
                <TrustBadges badges={other.badges} />
              </div>
            </div>
          )}
        </Section>
      )}

      {(status === "ACCEPTED" || status === "EN_ROUTE") && (
        <Section title="Tu PIN de llegada">
          <PinCells pin={v.pin!} />
          <p className="text-graphite-2">
            Cuando llegue, primero compara su selfie con esta foto en la app. Recién después le dictas el PIN.
            {status === "EN_ROUTE" && " Ya va en camino."}
          </p>
        </Section>
      )}

      {status === "IN_PROGRESS" && (
        <Section title="En curso">
          {v.quotes
            .filter((q) => q.status === "PENDING")
            .map((q) => (
              <Sheet key={q.id} className="space-y-3">
                <p className="font-bold">Presupuesto adicional</p>
                <p>{q.description}</p>
                <Money value={q.amount} className="text-[1.3rem] font-bold text-ink" />
                <ActionButton action={answerQuoteAction.bind(null, q.id, v.id, true)}>Aprobar</ActionButton>
                <ActionButton action={answerQuoteAction.bind(null, q.id, v.id, false)} variant="secondary">
                  Rechazar
                </ActionButton>
              </Sheet>
            ))}
          <Photos ids={v.beforePhotoIds} label="Fotos de antes" />
        </Section>
      )}

      {(status === "COMPLETED" || status === "SETTLED" || status === "DISPUTED") && (
        <Section title="Resultado">
          <Photos ids={v.beforePhotoIds} label="Antes" />
          <Photos ids={v.afterPhotoIds} label="Después" />
          <dl className="border-t border-rule">
            {[
              ["Servicio", v.quotedAmount],
              ...(v.extrasAmount ? [["Extras aprobados", v.extrasAmount] as const] : []),
              ["Total", total],
            ].map(([k, n]) => (
              <div key={k} className="flex justify-between border-b border-rule py-2">
                <dt>{k}</dt>
                <dd className={cx(k === "Total" && "font-bold text-ink")}>
                  <Money value={n as number} />
                </dd>
              </div>
            ))}
          </dl>
          {status === "COMPLETED" && (
            <div className="space-y-3">
              <p className="text-graphite-2">
                El pago queda retenido. Se libera cuando confirmes o en <Countdown to={v.disputeUntil!} /> si no reclamas.
              </p>
              <ActionButton action={confirmServiceAction.bind(null, v.id)}>Confirmar y liberar pago</ActionButton>
              <details className="rounded-md border border-rule bg-paper p-3">
                <summary className="cursor-pointer font-bold text-margin-strong">Tengo un problema con el servicio</summary>
                <ActionForm action={disputeAction} className="mt-3">
                  <input type="hidden" name="bookingId" value={v.id} />
                  <label htmlFor="reason" className="block font-bold">
                    ¿Qué pasó?
                  </label>
                  <textarea id="reason" name="reason" rows={3} required maxLength={1000} className={cx(inputClass, "py-2")} />
                  <SubmitButton variant="danger">Enviar reclamo</SubmitButton>
                </ActionForm>
              </details>
            </div>
          )}
          {status === "DISPUTED" && <Notice tone="warn">Tu reclamo está en revisión. El pago sigue retenido.</Notice>}
          {other &&
            (v.myRating ? (
              <Notice tone="ok">
                Calificaste con {v.myRating.stars} de 5.
                {v.theirRating ? ` ${other.name} te calificó con ${v.theirRating.stars}.` : ` La nota de ${other.name} se mostrará cuando califique.`}
              </Notice>
            ) : (
              <RatingForm bookingId={v.id} otherName={other.name} />
            ))}
          {other && (
            <ActionButton action={blockAction.bind(null, other.id, "")} variant="ghost" confirm={`No volverás a coincidir con ${other.name}. ¿Continuar?`}>
              No volver a coincidir con {other.name}
            </ActionButton>
          )}
        </Section>
      )}

      {other && live && status !== "REQUESTED" && (
        <Section title="Mensajes">
          <Chat bookingId={v.id} messages={v.messages} otherName={other.name} />
        </Section>
      )}

      {live && status !== "REQUESTED" && (
        <Section title="Seguimiento">
          <ShareTrip bookingId={v.id} />
        </Section>
      )}

      {["REQUESTED", "ACCEPTED", "EN_ROUTE", "ARRIVED"].includes(status) && (
        <CancelForm
          bookingId={v.id}
          warning={status !== "REQUESTED" && hoursLeft < 2 ? "Faltan menos de 2 horas: se cobrará 20% a favor de la persona, que ya reservó su tiempo." : undefined}
        />
      )}

      {live && <AutoRefresh ms={status === "REQUESTED" ? 3000 : 5000} />}
      <SafetyRail bookingId={live || status === "COMPLETED" ? v.id : undefined} openSosId={v.openSosId} />
    </Page>
  );
}
