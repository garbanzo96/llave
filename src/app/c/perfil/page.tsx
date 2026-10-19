import Link from "next/link";
import { Trash2 } from "lucide-react";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { HIDDEN_ADDRESS } from "@/server/services/account";
import { addAddressAction, clientPrefsAction, logoutAction, removeAddressAction } from "@/app/actions";
import { ActionButton, ActionForm, LocationFields, SubmitButton } from "@/components/interactive";
import { buttonClass, Field, inputClass, Page, Section } from "@/components/ui";

export const metadata = { title: "Perfil" };

export default async function ClientProfile() {
  const user = await requireUser("CLIENT");
  const [addresses, prefs] = await Promise.all([
    db.address.findMany({ where: { userId: user.id, label: { not: HIDDEN_ADDRESS } } }),
    db.clientProfile.findUnique({ where: { userId: user.id } }),
  ]);
  return (
    <Page title="Perfil" back="/c">
      <Section title="Direcciones">
        <ul id="direcciones" className="border-t border-rule">
          {addresses.map((a) => (
            <li key={a.id} className="flex items-center gap-3 border-b border-rule py-2">
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{a.label}</span>
                <span className="block truncate text-graphite-2">
                  {a.line}, {a.comuna}
                </span>
              </span>
              <div>
                <ActionButton action={removeAddressAction.bind(null, a.id)} variant="ghost" full={false} confirm={`¿Quitar ${a.label}?`}>
                  <Trash2 size={18} aria-hidden />
                  <span className="sr-only">Quitar {a.label}</span>
                </ActionButton>
              </div>
            </li>
          ))}
        </ul>
        <details className="rounded-md border border-rule bg-paper p-3" open={addresses.length === 0}>
          <summary className="cursor-pointer font-bold text-ink">Agregar dirección</summary>
          <ActionForm action={addAddressAction} className="mt-3">
            <Field label="Nombre" htmlFor="label">
              <input id="label" name="label" required maxLength={40} placeholder="Casa, Depto mamá…" className={inputClass} />
            </Field>
            <Field label="Calle, número y depto" htmlFor="line">
              <input id="line" name="line" required maxLength={120} autoComplete="street-address" className={inputClass} />
            </Field>
            <Field label="Comuna" htmlFor="comuna">
              <input id="comuna" name="comuna" required maxLength={60} className={inputClass} />
            </Field>
            <Field label="Indicaciones para llegar" htmlFor="notes" hint="Se muestran solo a quien acepte el servicio.">
              <input id="notes" name="notes" maxLength={200} placeholder="Ej. citófono 501, avisar en conserjería" className={inputClass} />
            </Field>
            <p className="text-[0.95rem] text-graphite-2">Haz esto desde la dirección: usamos la ubicación del teléfono para verificar la llegada de la persona.</p>
            <LocationFields />
            <SubmitButton>Guardar dirección</SubmitButton>
          </ActionForm>
        </details>
      </Section>

      <Section title="Preferencia de seguridad">
        <ActionForm action={clientPrefsAction}>
          <label className="flex min-h-12 items-center gap-3">
            <input type="radio" name="workerGenderPref" value="ANY" defaultChecked={prefs?.workerGenderPref !== "FEMALE_ONLY"} className="size-5 accent-[var(--ink)]" />
            Cualquier persona verificada
          </label>
          <label className="flex min-h-12 items-center gap-3">
            <input type="radio" name="workerGenderPref" value="FEMALE_ONLY" defaultChecked={prefs?.workerGenderPref === "FEMALE_ONLY"} className="size-5 accent-[var(--ink)]" />
            Prefiero solo trabajadoras mujeres
          </label>
          <p className="text-[0.9rem] text-graphite-2">Es la única preferencia personal disponible y existe por seguridad. Puedes cambiarla en cada pedido.</p>
          <SubmitButton variant="secondary">Guardar</SubmitButton>
        </ActionForm>
      </Section>

      <nav className="flex flex-wrap gap-x-5 gap-y-2 font-bold text-ink">
        <Link href="/seguridad" className="underline">Contactos de confianza</Link>
        <Link href="/verificacion" className="underline">Verificación</Link>
        <Link href="/cuenta" className="underline">Cuenta y datos</Link>
        <Link href="/privacidad" className="underline">Privacidad</Link>
      </nav>
      <form action={logoutAction}>
        <button className={buttonClass("secondary")}>Cerrar sesión</button>
      </form>
    </Page>
  );
}
