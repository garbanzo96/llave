import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { requireUser } from "@/server/auth";
import { bookingView } from "@/server/views";
import { blockAction, completeAction, pingAction, proposeQuoteAction, startRouteAction, startSelfieAction, startWithPinAction, workPhotoAction } from "@/app/actions";
import { ActionButton, ActionForm, AutoRefresh, CameraField, LivePing, SafetyRail, SubmitButton } from "@/components/interactive";
import { CancelForm, Chat, RatingForm, ShareTrip, WellbeingBanner } from "@/components/booking";
import { Avatar, buttonClass, ConductReminder, NightModeNotice, cx, Field, fmtDate, fmtTime, inputClass, Money, Notice, Page, Section, Stars, StatusTag, StatusTrack } from "@/components/ui";
import { CATEGORIES } from "@/lib/core/categories";
import { MAX_PIN_ATTEMPTS } from "@/lib/core/safety";
import type { Status } from "@/lib/core/booking-machine";
import { isNight } from "@/lib/core/geo";

const LIVE_NIGHT: Status[] = ["ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"];
import { ArriveButton } from "./_components";

export const metadata = { title: "Servicio" };

const QUOTE_LABEL = { PENDING: "Esperando aprobación", APPROVED: "Aprobado", REJECTED: "Rechazado" };
const PAYMENT_LABEL = { AUTHORIZED: "Autorizado", CAPTURED: "Retenido 48 h", RELEASED: "Liberado", REFUNDED: "Devuelto", VOIDED: "Anulado" };
const ACTIVE: Status[] = ["ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"];

function PhotoGroup({ bookingId, when, label, ids }: { bookingId: string; when: "BEFORE" | "AFTER"; label: string; ids: string[] }) {
  return (
    <div className="space-y-3 border-b border-rule pb-4">
      <h3 className="font-bold">
        Fotos {label} <span className="tabular text-graphite-2">({ids.length})</span>
      </h3>
      {ids.length > 0 && (
        <ul className="grid grid-cols-4 gap-2">
          {ids.map((docId) => (
            <li key={docId}>
              {/* eslint-disable-next-line @next/next/no-img-element -- archivo privado autorizado por la API */}
              <img src={`/api/files/${docId}`} alt={`Foto ${label}`} className="aspect-square w-full rounded-md border border-rule object-cover" />
            </li>
          ))}
        </ul>
      )}
      <ActionForm action={workPhotoAction}>
        <input type="hidden" name="bookingId" value={bookingId} />
        <input type="hidden" name="when" value={when} />
        <CameraField name="photo" label={`Agregar foto ${label}`} required />
        <SubmitButton variant="secondary">Guardar foto {label}</SubmitButton>
      </ActionForm>
    </div>
  );
}

export default async function WorkerService({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("WORKER");
  const { id } = await params;
  const v = await bookingView(user, id).catch(() => null);
  if (!v || v.role !== "WORKER") notFound();
  const status = v.status as Status;
  const active = ACTIVE.includes(status);
  const finished = ["COMPLETED", "SETTLED", "DISPUTED"].includes(status);
  const clientName = v.other?.name ?? "Cliente";

  return (
    <Page title={v.categoryLabel} back="/t">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="tabular font-bold text-ink">
            {v.mode === "URGENT" ? "Urgencia" : `${fmtDate(v.scheduledAt)}, ${fmtTime(v.scheduledAt)}`} · {v.estimatedMinutes} min
          </p>
          <StatusTag status={status} />
        </div>
        <StatusTrack status={status} />
        {v.description && <p className="whitespace-pre-wrap break-words">{v.description}</p>}
        <p className="text-[0.95rem] text-graphite-2">
          {[v.household.adultsHome ? "Habrá un adulto" : "Sin adultos en casa", v.household.minorsHome && "hay menores", v.household.pets && "hay mascotas"].filter(Boolean).join(" · ")}
        </p>
      </div>

      {v.wellbeingPending && <WellbeingBanner bookingId={id} />}
      {["ARRIVED", "IN_PROGRESS"].includes(status) && <ConductReminder />}
      {LIVE_NIGHT.includes(status) && isNight(new Date(v.scheduledAt)) && <NightModeNotice />}

      {v.other && (
        <Section title="Tu cliente">
          <div className="flex items-center gap-3">
            <Avatar docId={v.other.photoDocId} name={v.other.name} />
            <div>
              <p className="font-bold">{v.other.name}</p>
              <p className="flex gap-3 text-[0.95rem]">
                <Stars value={v.other.rating} />
                <span className="tabular text-graphite-2">{v.other.completedCount} servicios</span>
              </p>
            </div>
          </div>
        </Section>
      )}

      {active && (
        <Section title="Dirección">
          <p className="font-bold">
            {v.address.line}, {v.address.comuna}
          </p>
          {v.address.notes && <p className="whitespace-pre-wrap">{v.address.notes}</p>}
          {v.address.lat != null && (
            <a className={buttonClass("secondary")} href={`https://www.google.com/maps/dir/?api=1&destination=${v.address.lat},${v.address.lng}`} target="_blank" rel="noreferrer">
              <MapPin size={20} aria-hidden /> Cómo llegar
            </a>
          )}
        </Section>
      )}

      {status === "ACCEPTED" && <ActionButton action={startRouteAction.bind(null, id)}>Voy en camino</ActionButton>}
      {["EN_ROUTE", "ARRIVED", "IN_PROGRESS"].includes(status) && <LivePing bookingId={id} ping={pingAction} />}
      {status === "EN_ROUTE" && <ArriveButton bookingId={id} />}

      {status === "ARRIVED" && (
        <Section title="En la puerta">
          {v.startSelfieIds.length === 0 ? (
            <ActionForm action={startSelfieAction}>
              <input type="hidden" name="bookingId" value={id} />
              <p>El cliente compara esta selfie con tu foto de perfil antes de abrir.</p>
              <CameraField name="selfie" facing="user" label="Selfie de llegada" required />
              <SubmitButton>Enviar selfie</SubmitButton>
            </ActionForm>
          ) : !v.identityConfirmed ? (
            <Notice>Esperando que {clientName} confirme tu identidad.</Notice>
          ) : v.pinAttempts >= MAX_PIN_ATTEMPTS ? (
            <Notice tone="error">Se agotaron los intentos del PIN. La central se comunicará contigo.</Notice>
          ) : (
            <ActionForm action={startWithPinAction}>
              <input type="hidden" name="bookingId" value={id} />
              <Field label="PIN de 4 dígitos" htmlFor="pin" hint={`Pídeselo a ${clientName}. Te quedan ${MAX_PIN_ATTEMPTS - v.pinAttempts} intentos.`}>
                <input
                  id="pin"
                  name="pin"
                  inputMode="numeric"
                  pattern="\d{4}"
                  minLength={4}
                  maxLength={4}
                  autoComplete="one-time-code"
                  required
                  className={cx(inputClass, "tabular w-40 text-[1.6rem] tracking-[0.4em]")}
                />
              </Field>
              <SubmitButton>Iniciar servicio</SubmitButton>
            </ActionForm>
          )}
        </Section>
      )}

      {status === "IN_PROGRESS" && (
        <>
          <Section title="Fotos del trabajo">
            <PhotoGroup bookingId={id} when="BEFORE" label="de antes" ids={v.beforePhotoIds} />
            <PhotoGroup bookingId={id} when="AFTER" label="de después" ids={v.afterPhotoIds} />
          </Section>
          {CATEGORIES[v.category].pricing === "VISIT" && (
            <Section title="Presupuesto adicional">
              <p className="text-graphite-2">Si el trabajo requiere más que la visita, envía un presupuesto. No lo hagas hasta que el cliente lo apruebe.</p>
              {v.quotes.map((q) => (
                <div key={q.id} className="flex items-baseline justify-between gap-3 border-b border-rule py-2">
                  <span className="min-w-0 break-words">{q.description}</span>
                  <span className="shrink-0 text-right">
                    <Money value={q.amount} className="block font-bold" />
                    <span className="text-[0.85rem] text-graphite-2">{QUOTE_LABEL[q.status]}</span>
                  </span>
                </div>
              ))}
              <ActionForm action={proposeQuoteAction}>
                <input type="hidden" name="bookingId" value={id} />
                <Field label="Monto (CLP)" htmlFor="amount">
                  <input id="amount" name="amount" type="number" inputMode="numeric" min={1000} max={2000000} step={1} required className={inputClass} />
                </Field>
                <Field label="Qué incluye" htmlFor="qdesc">
                  <textarea id="qdesc" name="description" rows={2} maxLength={500} required className={cx(inputClass, "py-2")} />
                </Field>
                <SubmitButton variant="secondary">Enviar presupuesto</SubmitButton>
              </ActionForm>
            </Section>
          )}
          <ActionButton action={completeAction.bind(null, id)} confirm="¿Terminaste el trabajo y subiste al menos una foto de después?">
            Terminar servicio
          </ActionButton>
        </>
      )}

      {finished && (
        <Section title="Tu pago">
          {v.payment && (
            <dl className="border-t border-rule">
              {[
                ["Recibes", <Money key="p" value={v.payment.workerPayout ?? 0} className="text-[1.2rem] font-bold text-ink" />],
                ["Total cobrado", <Money key="c" value={v.payment.captured} />],
                ["Estado", PAYMENT_LABEL[v.payment.status]],
              ].map(([k, val]) => (
                <div key={String(k)} className="flex items-baseline justify-between border-b border-rule py-2">
                  <dt>{k}</dt>
                  <dd>{val}</dd>
                </div>
              ))}
            </dl>
          )}
          {v.myRating ? (
            <Notice tone="ok">
              Calificaste con {v.myRating.stars} de 5. {v.theirRating ? `${clientName} te dio ${v.theirRating.stars}.` : "Su nota se mostrará cuando califique."}
            </Notice>
          ) : (
            <RatingForm bookingId={id} otherName={clientName} asWorker />
          )}
          {v.other && (
            <ActionButton action={blockAction.bind(null, v.other.id, "")} variant="ghost" confirm={`No volverás a recibir solicitudes de ${clientName}. ¿Continuar?`}>
              No volver a coincidir con {clientName}
            </ActionButton>
          )}
        </Section>
      )}

      {active && (
        <>
          <Section title="Mensajes">
            <Chat bookingId={id} messages={v.messages} otherName={clientName} />
          </Section>
          <Section title="Seguimiento">
            <ShareTrip bookingId={id} />
          </Section>
          {status !== "IN_PROGRESS" && <CancelForm bookingId={id} warning="Cancelar afecta tu confiabilidad en el match." />}
        </>
      )}

      <SafetyRail bookingId={id} openSosId={v.openSosId} />
      {!["SETTLED", "CANCELLED", "EXPIRED"].includes(status) && <AutoRefresh />}
    </Page>
  );
}
