import { Phone, Trash2 } from "lucide-react";
import { requireUser, homeFor } from "@/server/auth";
import { db } from "@/server/db";
import { addContactAction, removeContactAction } from "@/app/actions";
import { ActionButton, ActionForm, SafetyRail, SubmitButton } from "@/components/interactive";
import { Field, inputClass, Page, Section } from "@/components/ui";
import { EMERGENCY_NUMBERS, MAX_TRUSTED_CONTACTS } from "@/lib/core/safety";

export const metadata = { title: "Seguridad" };

const HOW = [
  ["Verificación", "Identidad con cédula y selfie para todos. A quienes ofrecen servicios, además antecedentes, inhabilidades para trabajar con menores y licencia SEC cuando corresponde. Todo con fecha de vencimiento."],
  ["Llegada", "La persona se toma una selfie al llegar. El cliente la compara con su foto de perfil y recién entonces dicta su PIN. Cinco intentos fallidos bloquean el PIN y avisan a la central."],
  ["Margen rojo", "El botón del margen envía una alerta silenciosa a la central con tu ubicación y avisa a tus contactos de confianza."],
  ["Bienestar", "Si un servicio supera su duración estimada, preguntamos a ambos si todo está bien. Sin respuesta en 10 minutos, la central interviene."],
  ["Chat", "Los teléfonos, correos y enlaces se ocultan. Todo queda registrado por si hace falta respaldar una denuncia."],
  ["Desvincular", "Puedes no volver a coincidir nunca con alguien, sin dar explicaciones."],
];

export default async function Seguridad() {
  const user = await requireUser("CLIENT", "WORKER");
  const contacts = await db.trustedContact.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } });
  return (
    <Page title="Seguridad" back={homeFor(user.role)}>
      <Section title="Contactos de confianza" aside={<span className="tabular text-graphite-2">{contacts.length}/{MAX_TRUSTED_CONTACTS}</span>}>
        <p className="text-graphite-2">Reciben el seguimiento cuando lo compartes y un aviso si envías una alerta.</p>
        <ul className="border-t border-rule">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-center gap-3 border-b border-rule py-2">
              <span className="flex-1">
                <span className="block font-bold">{c.name}</span>
                <span className="tabular text-graphite-2">{c.phone}</span>
              </span>
              <div className="w-auto">
                <ActionButton action={removeContactAction.bind(null, c.id)} variant="ghost" full={false} confirm={`¿Quitar a ${c.name}?`}>
                  <Trash2 size={18} aria-hidden />
                  <span className="sr-only">Quitar a {c.name}</span>
                </ActionButton>
              </div>
            </li>
          ))}
        </ul>
        {contacts.length < MAX_TRUSTED_CONTACTS && (
          <ActionForm action={addContactAction}>
            <Field label="Nombre" htmlFor="cname">
              <input id="cname" name="name" required maxLength={60} className={inputClass} />
            </Field>
            <Field label="Celular" htmlFor="cphone">
              <input id="cphone" name="phone" required inputMode="tel" placeholder="9 1234 5678" className={inputClass} />
            </Field>
            <SubmitButton variant="secondary">Agregar contacto</SubmitButton>
          </ActionForm>
        )}
      </Section>

      <Section title="Emergencias">
        <ul className="grid grid-cols-2 gap-2">
          {EMERGENCY_NUMBERS.map((n) => (
            <li key={n.number}>
              <a href={`tel:${n.number}`} className="flex min-h-12 items-center gap-2 rounded-md border border-rule bg-paper px-3 hover:border-ink">
                <Phone size={16} aria-hidden className="text-margin" />
                <span className="tabular font-bold">{n.number}</span>
                <span className="truncate text-[0.9rem] text-graphite-2">{n.label}</span>
              </a>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Cómo te cuidamos">
        <dl className="border-t border-rule">
          {HOW.map(([t, d]) => (
            <div key={t} className="grid gap-1 border-b border-rule py-3 sm:grid-cols-[8rem_1fr] sm:gap-3">
              <dt className="font-bold text-ink">{t}</dt>
              <dd>{d}</dd>
            </div>
          ))}
        </dl>
      </Section>
      <SafetyRail />
    </Page>
  );
}
