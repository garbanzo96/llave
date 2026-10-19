import { requireUser, homeFor } from "@/server/auth";
import { identityChallenge, verificationStatus, verificationData } from "@/server/services/verification";
import {
  consentMinorsAction,
  submitCriminalRecordAction,
  submitIdentityAction,
  submitLicenseAction,
  submitReferencesAction,
} from "@/app/actions";
import { ActionButton, ActionForm, CameraField, SubmitButton } from "@/components/interactive";
import { Badge, ButtonLink, Field, inputClass, Notice, Page, Section, Sheet } from "@/components/ui";
import type { Verification } from "@prisma/client";

export const metadata = { title: "Verificación" };

function StatusBadge({ v, submitted = true }: { v?: Verification; submitted?: boolean }) {
  if (!v || !submitted) return <Badge tone="ink">Por enviar</Badge>;
  if (v.status === "APPROVED")
    return <Badge tone="ok">Aprobada{v.expiresAt ? ` · vence ${v.expiresAt.toLocaleDateString("es-CL")}` : ""}</Badge>;
  if (v.status === "PENDING") return <Badge tone="warn">En revisión</Badge>;
  if (v.status === "EXPIRED") return <Badge tone="alert">Vencida</Badge>;
  return <Badge tone="alert">Rechazada</Badge>;
}

const fileInput = "block w-full text-[0.95rem] file:mr-3 file:min-h-12 file:rounded-md file:border-2 file:border-ink file:bg-paper file:px-4 file:font-bold file:text-ink";

export default async function Verificacion() {
  const user = await requireUser("CLIENT", "WORKER");
  const s = await verificationStatus(user);
  const identity = s.get("IDENTITY");
  const identitySubmitted = !!identity && (identity.status !== "PENDING" || !!verificationData(identity.data).submittedAt);
  const needIdentityForm = !identity || identity.status === "REJECTED" || identity.status === "EXPIRED" || !identitySubmitted;
  const code = needIdentityForm ? await identityChallenge(user) : null;
  const worker = user.role === "WORKER";

  return (
    <Page title="Verificación" back={homeFor(user.role)}>
      {user.status === "ACTIVE" ? (
        <Notice tone="ok">Tu cuenta está verificada. Mantén tus documentos al día para seguir {worker ? "recibiendo solicitudes" : "pidiendo servicios"}.</Notice>
      ) : (
        <p className="text-graphite-2">
          {worker
            ? "Para recibir solicitudes necesitas identidad, antecedentes e inhabilidades aprobados. Las licencias SEC habilitan gas y electricidad."
            : "Verificamos a todos los clientes: quien va a tu casa también necesita saber a quién visita."}
        </p>
      )}

      <Section title="Identidad" aside={<StatusBadge v={identity} submitted={identitySubmitted} />}>
        {identity?.status === "REJECTED" && <Notice tone="error">Motivo: {identity.rejectReason}</Notice>}
        {needIdentityForm ? (
          <ActionForm action={submitIdentityAction}>
            <Sheet className="space-y-2 text-center">
              <p>Escribe este código en un papel y sostenlo junto a tu cara en la selfie:</p>
              <p className="tabular text-[2.6rem] font-bold tracking-[0.25em] text-ink">{code}</p>
              <p className="text-[0.9rem] text-graphite-2">Así sabemos que la foto es de hoy y no una imagen reutilizada.</p>
            </Sheet>
            <Field label="RUT" htmlFor="rut">
              <input id="rut" name="rut" required placeholder="12.345.678-5" autoComplete="off" className={inputClass} />
            </Field>
            <Field label="Género" htmlFor="gender" hint="Se usa solo para la preferencia de seguridad opcional (por ejemplo, pedir una trabajadora mujer).">
              <select id="gender" name="gender" required defaultValue="" className={inputClass}>
                <option value="" disabled>
                  Elige una opción
                </option>
                <option value="FEMALE">Mujer</option>
                <option value="MALE">Hombre</option>
                <option value="OTHER">Otro</option>
                <option value="UNDISCLOSED">Prefiero no decir</option>
              </select>
            </Field>
            <CameraField name="idFront" label="Cédula, lado frontal" required />
            <CameraField name="idBack" label="Cédula, reverso" required />
            <CameraField name="selfie" label="Selfie sosteniendo el código" facing="user" required />
            <CameraField name="photo" label="Foto de perfil (cara despejada, sin lentes oscuros)" facing="user" required />
            <p className="text-[0.9rem] text-graphite-2">
              Las imágenes viajan cifradas, se guardan cifradas y se borran 90 días después de la revisión. Solo la central puede verlas, y cada acceso queda registrado.
            </p>
            <SubmitButton>Enviar para revisión</SubmitButton>
          </ActionForm>
        ) : (
          identity?.status === "PENDING" && <p className="text-graphite-2">La central revisa tus documentos. Te avisaremos por SMS.</p>
        )}
      </Section>

      {worker && (
        <>
          <Section title="Certificado de antecedentes" aside={<StatusBadge v={s.get("CRIMINAL_RECORD")} />}>
            {s.get("CRIMINAL_RECORD")?.status === "REJECTED" && <Notice tone="error">Motivo: {s.get("CRIMINAL_RECORD")?.rejectReason}</Notice>}
            {s.get("CRIMINAL_RECORD")?.status !== "APPROVED" && s.get("CRIMINAL_RECORD")?.status !== "PENDING" && (
              <ActionForm action={submitCriminalRecordAction}>
                <p className="text-graphite-2">Descárgalo gratis en el sitio del Registro Civil (para fines particulares). Debe tener menos de 30 días. Lo renovamos cada 6 meses.</p>
                <Field label="Código de verificación del certificado" htmlFor="folio">
                  <input id="folio" name="folio" required className={inputClass} />
                </Field>
                <Field label="Certificado (PDF o foto)" htmlFor="certificate">
                  <input id="certificate" name="certificate" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required className={fileInput} />
                </Field>
                <SubmitButton>Enviar certificado</SubmitButton>
              </ActionForm>
            )}
          </Section>

          <Section title="Registro de inhabilidades (Ley 20.594)" aside={<StatusBadge v={s.get("MINORS_REGISTRY")} />}>
            {!["APPROVED", "PENDING"].includes(s.get("MINORS_REGISTRY")?.status ?? "") && (
              <>
                <p className="text-graphite-2">
                  En muchas casas hay niñas y niños. Con tu autorización, la central consulta tu RUT en el registro de inhabilidades para trabajar con menores del Registro Civil.
                </p>
                <ActionButton action={consentMinorsAction}>Autorizo la consulta</ActionButton>
              </>
            )}
          </Section>

          <Section title="Licencia SEC (gas o electricidad)" aside={<StatusBadge v={s.get("SEC_LICENSE")} />}>
            <ActionForm action={submitLicenseAction}>
              <p className="text-graphite-2">Opcional. Sin licencia aprobada no recibes solicitudes de gas ni de electricidad.</p>
              <Field label="Tipo" htmlFor="license">
                <select id="license" name="license" className={inputClass}>
                  <option value="SEC_ELECTRICA">Instalador eléctrico</option>
                  <option value="SEC_GAS">Instalador de gas</option>
                </select>
              </Field>
              <Field label="Número de licencia" htmlFor="number">
                <input id="number" name="number" required className={inputClass} />
              </Field>
              <Field label="Credencial (PDF o foto)" htmlFor="licenseFile">
                <input id="licenseFile" name="licenseFile" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required className={fileInput} />
              </Field>
              <SubmitButton variant="secondary">Enviar licencia</SubmitButton>
            </ActionForm>
          </Section>

          <Section title="Referencias laborales" aside={<StatusBadge v={s.get("REFERENCES")} />}>
            {s.get("REFERENCES")?.status !== "APPROVED" && (
              <ActionForm action={submitReferencesAction}>
                <p className="text-graphite-2">Opcional pero recomendado: los clientes ven la insignia. La central llama a ambas personas.</p>
                {[0, 1].map((i) => (
                  <fieldset key={i} className="space-y-2">
                    <legend className="font-bold">Referencia {i + 1}</legend>
                    <input name={`name${i}`} aria-label={`Nombre referencia ${i + 1}`} placeholder="Nombre" className={inputClass} />
                    <input name={`phone${i}`} aria-label={`Celular referencia ${i + 1}`} placeholder="Celular" inputMode="tel" className={inputClass} />
                    <input name={`relation${i}`} aria-label={`Relación referencia ${i + 1}`} placeholder="Relación (ej. empleadora 2019-2024)" className={inputClass} />
                  </fieldset>
                ))}
                <SubmitButton variant="secondary">Enviar referencias</SubmitButton>
              </ActionForm>
            )}
          </Section>
        </>
      )}
      <ButtonLink href={homeFor(user.role)} variant="secondary">
        Volver al inicio
      </ButtonLink>
    </Page>
  );
}
