import { requireUser } from "@/server/auth";
import { db, parseJson } from "@/server/db";
import { CATEGORY_KEYS, CATEGORIES } from "@/lib/core/categories";
import { logoutAction } from "@/app/actions";
import { LocationFields } from "@/components/interactive";
import { ButtonLink, buttonClass, Check, Field, inputClass, Page, Section } from "@/components/ui";
import { ProfileForm } from "./_components";

export default async function WorkerProfile() {
  const user = await requireUser("WORKER");
  const p = await db.workerProfile.findUnique({ where: { userId: user.id } });
  const categories = parseJson<string[]>(p?.categories ?? "[]", []);
  return <Page title="Mi perfil y tarifas" back="/t">
    <ProfileForm>
      <fieldset><legend className="font-bold">Servicios que ofreces</legend>
        {CATEGORY_KEYS.map(k => <label key={k} className="flex min-h-12 items-center gap-3"><input type="checkbox" name="categories" value={k} defaultChecked={categories.includes(k)} className="size-5 accent-[var(--ink)]" />{CATEGORIES[k].label}</label>)}
        <p className="text-graphite-2">Gas y Electricidad exigen una licencia SEC aprobada para recibir solicitudes.</p>
      </fieldset>
      <Field label="Sobre tu trabajo" htmlFor="bio"><textarea id="bio" name="bio" maxLength={500} rows={4} defaultValue={p?.bio ?? ""} className={inputClass} /></Field>
      <p>Tú fijas tus tarifas. Llave cobra 15% (10% con clientes recurrentes).</p>
      <Field label="Tarifa por hora (CLP)" htmlFor="hourlyRate" hint="Para limpieza y jardinería. Entre $3.000 y $60.000."><input id="hourlyRate" name="hourlyRate" type="number" min={3000} max={60000} step={1} required defaultValue={p?.hourlyRate || 6000} className={inputClass} /></Field>
      <Field label="Visita de diagnóstico (CLP)" htmlFor="visitFee" hint="Para gasfitería, gas y electricidad. Entre $5.000 y $200.000."><input id="visitFee" name="visitFee" type="number" min={5000} max={200000} step={1} required defaultValue={p?.visitFee || 18000} className={inputClass} /></Field>
      <Field label="Radio de atención (km)" htmlFor="radiusKm"><input id="radiusKm" name="radiusKm" type="number" min={1} max={30} step="any" required defaultValue={p?.radiusKm ?? 8} className={inputClass} /></Field>
      <Section title="Ubicación base"><p className="text-graphite-2">Desde aquí calculamos la distancia de los servicios agendados.</p><LocationFields latName="baseLat" lngName="baseLng" label="Usar mi ubicación como base" initial={p?.baseLat != null && p.baseLng != null ? { lat: p.baseLat, lng: p.baseLng } : null} /></Section>
      <Check name="nightOk" label="Acepto servicios entre 22:00 y 07:00" defaultChecked={p?.nightOk} />
      <Field label="Preferencia de clientes" htmlFor="clientGenderPref" hint="Es una preferencia de seguridad que se respeta antes de asignar solicitudes."><select id="clientGenderPref" name="clientGenderPref" defaultValue={p?.clientGenderPref ?? "ANY"} className={inputClass}><option value="ANY">Cualquier cliente</option><option value="FEMALE_ONLY">Solo clientas mujeres</option></select></Field>
      <Check name="requireAdultHome" label="Solo acepto si hay un adulto en la casa" defaultChecked={p?.requireAdultHome} />
    </ProfileForm>
    <ButtonLink href="/cuenta" variant="secondary">Mi cuenta</ButtonLink>
    <form action={logoutAction}><button type="submit" className={buttonClass("ghost")}>Cerrar sesión</button></form>
  </Page>;
}
