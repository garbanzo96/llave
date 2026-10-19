import { requireUser } from "@/server/auth";
import { dashboard, auditTrail } from "@/server/services/central";
import { parseJson } from "@/server/db";
import { CATEGORIES, type Category } from "@/lib/core/categories";
import { ackIncidentAction, resolveDisputeAction, resolveIncidentAction, suspendAction } from "@/app/actions";
import { ActionButton, ActionForm, AutoRefresh, SubmitButton } from "@/components/interactive";
import { Avatar, Empty, Field, fmtDate, fmtTime, inputClass, Money, Section, Sheet, StatusTag, VERIFICATION_LABEL } from "@/components/ui";
import { ReviewForm } from "./_components";

const incidentLabels = { SOS: "Alerta SOS", WELLBEING_TIMEOUT: "Sin respuesta al chequeo", FELT_UNSAFE: "Se sintió inseguro/a", PIN_LOCKOUT: "PIN bloqueado", IDENTITY_MISMATCH: "Identidad no coincide", REPORT: "Reclamo o atraso", GEOFENCE: "Fuera de zona" };
const incidentStatus = { OPEN: "Abierto", ACKNOWLEDGED: "En atención", RESOLVED: "Resuelto" };
const roleLabels = { WORKER: "Trabajador/a", CLIENT: "Cliente", ADMIN: "Central" };
const genderLabels = { FEMALE: "Mujer", MALE: "Hombre", OTHER: "Otro", UNDISCLOSED: "No informado" };
const instructions: Record<string, string> = {
  IDENTITY: "Compara cédula, selfie y foto de perfil: misma persona, código visible, RUT y nombre coinciden",
  CRIMINAL_RECORD: "Valida el código del certificado en el sitio del Registro Civil y revisa que no tenga anotaciones incompatibles",
  MINORS_REGISTRY: "Consulta el RUT en el registro de inhabilidades para trabajar con menores del Registro Civil",
  SEC_LICENSE: "Verifica el número y la clase en el registro de instaladores de la SEC",
  REFERENCES: "Llama a ambas referencias",
};
const documentLabels: Record<string, string> = { ID_FRONT: "Cédula, frente", ID_BACK: "Cédula, reverso", SELFIE: "Selfie", CERTIFICATE: "Certificado", LICENSE: "Licencia", PROFILE_PHOTO: "Foto de perfil" };

function VerificationData({ raw }: { raw: string }) {
  const data = parseJson<Record<string, unknown>>(raw, {});
  const references = Array.isArray(data.refs) ? data.refs : [];
  return <div className="space-y-2">
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
      {([{ key: "folio", label: "Folio" }, { key: "license", label: "Tipo de licencia" }, { key: "number", label: "Número de licencia" }]).map(({ key, label }) => typeof data[key] === "string" ? <div key={key} className="contents"><dt>{label}</dt><dd className="tabular break-words font-bold">{String(data[key])}</dd></div> : null)}
    </dl>
    {references.map((r: unknown, i: number) => {
      if (!r || typeof r !== "object") return null;
      const ref = r as Record<string, unknown>;
      return <div key={i} className="border-b border-rule py-2"><p className="font-bold">Referencia {i + 1}: {String(ref.name ?? "Sin nombre")}</p><p>{String(ref.relation ?? "")}</p>{typeof ref.phone === "string" && <a href={`tel:${ref.phone}`} className="tabular inline-flex min-h-12 items-center text-ink underline">{ref.phone}</a>}</div>;
    })}
  </div>;
}

export default async function Central() {
  await requireUser("ADMIN");
  const [d, audit] = await Promise.all([dashboard(), auditTrail(50)]);
  const incidents = [...d.incidents].sort((a, b) => Number(b.kind === "SOS") - Number(a.kind === "SOS"));
  return <div className="relative z-[1] min-h-dvh pb-16 pl-[calc(var(--margin-x)+14px)] pr-4 pt-6 text-graphite">
    <div className="mx-auto max-w-[80rem] space-y-8">
      <header className="space-y-4"><h1 className="text-3xl font-bold">Central Llave</h1><nav aria-label="Secciones de la central" className="flex flex-wrap gap-x-5 border-y border-rule">
        {[{ id: "alertas", title: "Alertas", count: incidents.length }, { id: "verificaciones", title: "Verificaciones", count: d.queue.length }, { id: "en-curso", title: "En curso", count: d.live.length }, { id: "reclamos", title: "Reclamos", count: d.disputes.length }, { id: "auditoria", title: "Auditoría", count: audit.length }].map(item => <a key={item.id} href={`#${item.id}`} className="inline-flex min-h-12 items-center gap-2 font-bold text-ink underline-offset-4 hover:underline">{item.title} <span className="tabular">({item.count})</span></a>)}
      </nav></header>
      <div id="alertas" className="scroll-mt-4"><Section title={`Alertas (${incidents.length})`}>
        {!incidents.length && <Empty title="No hay alertas abiertas" />}
        {incidents.map(i => <Sheet key={i.id} tone={i.kind === "SOS" ? "alert" : "plain"}><article className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-xl font-bold">{incidentLabels[i.kind]}</h3><p className="tabular">{fmtDate(i.createdAt)} · {fmtTime(i.createdAt)} · {incidentStatus[i.status]}</p></div>
          <div className="grid gap-4 lg:grid-cols-2"><div className="space-y-2">
            <p className="font-bold">Quién reportó</p>{i.reporter ? <p>{i.reporter.name} · {roleLabels[i.reporter.role]} · <a href={`tel:${i.reporter.phone}`} className="tabular inline-flex min-h-12 items-center text-ink underline">{i.reporter.phone}</a></p> : <p>Reporte automático o sin persona asociada.</p>}
            {i.booking && <div className="space-y-2"><p>Servicio <span className="tabular">{i.booking.id.slice(-8)}</span> · <StatusTag status={i.booking.status} /></p><p>{i.booking.address.line} · {i.booking.address.comuna}</p></div>}
            {i.lat != null && i.lng != null && <a href={`https://maps.google.com/?q=${i.lat},${i.lng}`} target="_blank" rel="noreferrer" className="tabular inline-flex min-h-12 items-center text-ink underline">Ver ubicación: {i.lat}, {i.lng}</a>}
            <p className="whitespace-pre-wrap break-words">{i.details || "Sin detalles adicionales."}</p>
          </div><div className="space-y-4">
            {i.status === "OPEN" && <ActionButton action={ackIncidentAction.bind(null, i.id)} variant="secondary">Tomar caso</ActionButton>}
            <ActionForm action={resolveIncidentAction}><input type="hidden" name="incidentId" value={i.id} /><Field label="Resolución del caso" htmlFor={`resolution-${i.id}`}><textarea id={`resolution-${i.id}`} name="resolution" required maxLength={1000} rows={3} className={inputClass} /></Field><SubmitButton>Resolver caso</SubmitButton></ActionForm>
          </div></div>
          {i.booking && <div className="grid gap-4 border-t border-rule pt-4 lg:grid-cols-2">
            {[{ userId: i.booking.workerId, label: "trabajador/a" }, { userId: i.booking.clientId, label: "cliente" }].map(target => target.userId && <ActionForm key={target.userId} action={suspendAction}><input type="hidden" name="userId" value={target.userId} /><Field label={`Motivo para suspender al ${target.label}`} htmlFor={`suspend-${i.id}-${target.userId}`}><textarea id={`suspend-${i.id}-${target.userId}`} name="reason" required rows={2} className={inputClass} /></Field><SubmitButton variant="danger">Suspender {target.label}</SubmitButton></ActionForm>)}
          </div>}
        </article></Sheet>)}
      </Section></div>
      <div id="verificaciones" className="scroll-mt-4"><Section title={`Verificaciones (${d.queue.length})`}>
        {!d.queue.length && <Empty title="No hay documentos pendientes de revisión" />}
        {d.queue.map(v => <Sheet key={v.id}><article className="space-y-4">
          <div className="flex items-center gap-3"><Avatar docId={v.user.photoDocId} name={v.user.name} /><div><h3 className="text-xl font-bold">{v.user.name}</h3><p className="tabular">RUT: {v.user.rut ?? "No informado"}</p><p>{roleLabels[v.user.role]} · {genderLabels[v.user.gender]}</p></div></div>
          <h4 className="text-lg font-bold text-ink">{VERIFICATION_LABEL[v.kind]}</h4><VerificationData raw={v.data} />
          {v.kind === "IDENTITY" && <div className="space-y-2"><p>Código de desafío: debe aparecer escrito a mano en la selfie.</p><p className="tabular text-4xl font-bold tracking-widest text-ink">{v.challengeCode ?? "Sin código"}</p></div>}
          <p className="font-bold">{instructions[v.kind]}</p>
          <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">{v.documents.map(doc => <div key={doc.id} className="space-y-2"><p className="font-bold">{documentLabels[doc.kind] ?? "Documento del servicio"}</p>{doc.mime === "application/pdf" ? <a href={`/api/files/${doc.id}`} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center text-ink underline">Abrir PDF</a> : doc.mime.startsWith("image/") ? <a href={`/api/files/${doc.id}`} target="_blank" rel="noreferrer" className="block min-h-12">
            {/* eslint-disable-next-line @next/next/no-img-element -- documentos privados servidos con autorización */}
            <img src={`/api/files/${doc.id}`} alt={`${documentLabels[doc.kind] ?? "Documento"} de ${v.user.name}`} className="max-h-64 max-w-full rounded-md border border-rule object-contain" />
          </a> : <a href={`/api/files/${doc.id}`} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center text-ink underline">Abrir documento</a>}</div>)}</div>
          <div className="border-t border-rule pt-4"><ReviewForm verificationId={v.id} /></div>
        </article></Sheet>)}
      </Section></div>
      <div id="en-curso" className="scroll-mt-4"><Section title={`En curso (${d.live.length})`}>
        {!d.live.length ? <Empty title="No hay servicios en curso" /> : <div className="overflow-x-auto"><table className="w-full text-left"><caption className="sr-only">Servicios activos</caption><thead><tr className="border-b border-rule">{["Hora", "Categoría", "Cliente", "Trabajador/a", "Comuna", "Estado"].map(h => <th scope="col" key={h} className="px-3 py-2">{h}</th>)}</tr></thead><tbody>{d.live.map(b => <tr key={b.id} className="border-b border-rule"><td className="tabular whitespace-nowrap px-3 py-3">{fmtDate(b.scheduledAt)} · {fmtTime(b.scheduledAt)}</td><td className="px-3 py-3">{CATEGORIES[b.category as Category]?.label ?? b.category}</td><td className="px-3 py-3">{b.client.name}</td><td className="px-3 py-3">{b.worker?.name ?? "Sin asignar"}</td><td className="px-3 py-3">{b.address.comuna}</td><td className="px-3 py-3"><StatusTag status={b.status} /></td></tr>)}</tbody></table></div>}
      </Section></div>
      <div id="reclamos" className="scroll-mt-4"><Section title={`Reclamos (${d.disputes.length})`}>
        {!d.disputes.length && <Empty title="No hay reclamos de pago pendientes" />}
        {d.disputes.map(b => <Sheet key={b.id}><div className="grid gap-5 lg:grid-cols-2"><div className="space-y-3"><h3 className="font-bold">Servicio <span className="tabular">{b.id.slice(-8)}</span></h3><p>Monto cobrado: <Money value={b.payment?.capturedAmount ?? 0} /></p>{b.incidents.filter(i => i.kind === "REPORT").map(i => <p key={i.id} className="whitespace-pre-wrap break-words">{i.details}</p>)}</div>
          {b.payment ? <ActionForm action={resolveDisputeAction}><input type="hidden" name="bookingId" value={b.id} /><Field label="Devolución (CLP)" htmlFor={`refund-${b.id}`}><input id={`refund-${b.id}`} name="refund" type="number" min={0} max={b.payment.capturedAmount} step={1} defaultValue={0} required className={inputClass} /></Field><Field label="Detalle de la resolución" htmlFor={`note-${b.id}`}><textarea id={`note-${b.id}`} name="note" required rows={3} maxLength={1000} className={inputClass} /></Field><SubmitButton>Resolver reclamo</SubmitButton></ActionForm> : <p>Falta el registro del pago. Revisa el caso antes de resolverlo.</p>}
        </div></Sheet>)}
      </Section></div>
      <div id="auditoria" className="scroll-mt-4"><Section title="Auditoría (últimos 50 registros)">
        {!audit.length ? <Empty title="Todavía no hay movimientos registrados" /> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Registro de acciones de la central y la plataforma</caption><thead><tr className="border-b border-rule">{["Fecha", "Actor", "Acción", "Objetivo"].map(h => <th key={h} scope="col" className="px-3 py-2">{h}</th>)}</tr></thead><tbody>{audit.map(a => <tr key={a.id} className="border-b border-rule"><td className="tabular whitespace-nowrap px-3 py-2">{fmtDate(a.createdAt)} · {fmtTime(a.createdAt)}</td><td className="tabular px-3 py-2" title={a.actorId ?? undefined}>{a.actorId?.slice(-8) ?? "Sistema"}</td><td className="break-words px-3 py-2">{a.action}</td><td className="tabular px-3 py-2" title={a.targetId}>{a.targetType} · {a.targetId.slice(-8)}</td></tr>)}</tbody></table></div>}
      </Section></div>
      <AutoRefresh ms={5000} />
    </div>
  </div>;
}
