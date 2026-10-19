import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { bayesianRating, PROBATION_SERVICES, URGENT_OFFER_MS, WEIGHTS } from "@/lib/core/matching";
import { BASE_COMMISSION, RECURRENT_COMMISSION, RECURRENT_THRESHOLD } from "@/lib/core/pricing";
import { Page, Section, Stars } from "@/components/ui";

const factors = { proximity: "Cercanía", quality: "Calificaciones", reliability: "Cumplimiento (cancelaciones y atrasos)", acceptance: "Aceptación de solicitudes", relationship: "Servicios previos con el cliente", fairness: "Oportunidades para quienes están empezando" };

export default async function Transparency() {
  const user = await requireUser("WORKER");
  const p = await db.workerProfile.findUnique({ where: { userId: user.id } });
  return <Page title="Cómo llegan las solicitudes" back="/t">
    <p>Esta información explica cómo funciona la asignación de Llave y qué datos usa, en el marco de la Ley 21.431.</p>
    <Section title="Primero, los requisitos de seguridad">
      <p>Para recibir una solicitud, tu cuenta debe estar activa y debes ofrecer esa categoría. Revisamos identidad, antecedentes e inhabilidades vigentes, además de la licencia SEC correspondiente para gas o electricidad. Un buen puntaje nunca compensa un requisito pendiente.</p>
      <p>También respetamos los bloqueos entre personas, las preferencias de seguridad de ambas partes y tu decisión de exigir un adulto en la casa. Los servicios entre las 22:00 y las 07:00 requieren que hayas aceptado ese horario.</p>
      <p>Durante tus primeros {PROBATION_SERVICES} servicios solo puedes coincidir con clientes que ya hayan completado al menos uno. En ese período tampoco recibes urgencias nocturnas.</p>
      <p>No debes tener otro servicio que se cruce con el horario. El domicilio debe estar dentro de tu radio de atención: para servicios agendados usamos tu ubicación base; para urgencias, tu ubicación actual. En urgencias debes estar disponible y tu ubicación debe haberse actualizado en los últimos 5 minutos.</p>
    </Section>
    <Section title="Después, el puntaje">
      <p>Entre quienes cumplen todos los requisitos, ordenamos las solicitudes con estos pesos. Las calificaciones usan un promedio bayesiano: considera la cantidad de reseñas y una referencia inicial para que pocas notas extremas no dominen el resultado.</p>
      <div className="overflow-x-auto"><table className="w-full text-left"><caption className="sr-only">Peso de cada factor en el puntaje de asignación</caption><thead><tr className="border-b border-rule"><th scope="col" className="py-3">Factor</th><th scope="col" className="px-2">Agendado</th><th scope="col" className="px-2">Urgencia</th></tr></thead><tbody>
        {(Object.keys(factors) as (keyof typeof factors)[]).map(k => <tr key={k} className="border-b border-rule"><th scope="row" className="py-3 font-normal">{factors[k]}</th><td className="tabular px-2">{Math.round(WEIGHTS.scheduled[k] * 100)}%</td><td className="tabular px-2">{Math.round(WEIGHTS.urgent[k] * 100)}%</td></tr>)}
      </tbody></table></div>
      <p>En urgencias ofrecemos el servicio a una persona a la vez, por {URGENT_OFFER_MS / 1000} segundos. Si no acepta, pasamos a la siguiente.</p>
    </Section>
    <Section title="Tus números">
      <dl className="grid grid-cols-2 gap-3 border-y border-rule py-4"><dt>Calificación bayesiana</dt><dd><Stars value={bayesianRating(user.ratingSum, user.ratingCount)} /></dd><dt>Servicios completados</dt><dd className="tabular">{user.completedCount}</dd><dt>Tasa de aceptación</dt><dd className="tabular">{p?.offersSeen ? `${Math.round(p.offersAccepted / p.offersSeen * 100)}% (${p.offersAccepted}/${p.offersSeen})` : "Sin solicitudes aún"}</dd><dt>Cancelaciones</dt><dd className="tabular">{p?.cancelCount ?? 0}</dd><dt>Atrasos</dt><dd className="tabular">{p?.lateCount ?? 0}</dd></dl>
      <p className="text-graphite-2">El puntaje de aceptación de urgencias aplica un ajuste inicial para que las primeras solicitudes no determinen toda tu tasa.</p>
    </Section>
    <Section title="Comisiones y pago"><p>La comisión general es {BASE_COMMISSION * 100}%. Baja a {RECURRENT_COMMISSION * 100}% cuando ya has completado {RECURRENT_THRESHOLD} servicios con el mismo cliente. Tú decides tus tarifas.</p><p>El pago se libera cuando el cliente confirma el servicio o al cumplirse 48 horas desde el término. Si hay un reclamo abierto, queda retenido hasta que la central lo resuelva.</p></Section>
    <Section title="Tus derechos"><p>Puedes rechazar solicitudes: no afecta tu puntaje en servicios agendados; en urgencias solo influye a través de la tasa de aceptación. Puedes desconectarte cuando quieras.</p><p>Si suspenden tu cuenta, puedes escribir a la central para pedir una revisión humana y conocer los motivos.</p></Section>
  </Page>;
}
