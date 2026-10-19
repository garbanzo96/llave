import Link from "next/link";
import { redirect } from "next/navigation";
import { verifiedPhone } from "@/server/auth";
import { signupAction } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/interactive";
import { Field, inputClass, Page } from "@/components/ui";

export const metadata = { title: "Crear cuenta" };

export default async function Registro() {
  const phone = await verifiedPhone();
  if (!phone) redirect("/entrar");
  return (
    <Page title="Crear tu cuenta" back="/entrar">
      <ActionForm action={signupAction}>
        <Field label="Nombre y apellido" htmlFor="name" hint="Tal como aparece en tu cédula. Lo verificamos.">
          <input id="name" name="name" autoComplete="name" required maxLength={80} className={inputClass} />
        </Field>
        <fieldset className="space-y-2">
          <legend className="font-bold">¿Cómo usarás Llave?</legend>
          {[
            ["CLIENT", "Necesito servicios en mi casa"],
            ["WORKER", "Ofrezco servicios (trabajo independiente)"],
          ].map(([value, label]) => (
            <label key={value} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border-2 border-rule bg-paper px-3 has-[:checked]:border-ink has-[:checked]:bg-ink-tint">
              <input type="radio" name="role" value={value} required className="size-5 accent-[var(--ink)]" />
              {label}
            </label>
          ))}
        </fieldset>
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" name="terms" required className="mt-1 size-5 shrink-0 accent-[var(--ink)]" />
          <span>
            Acepto los <Link href="/privacidad" className="font-bold text-ink underline">términos y la política de privacidad</Link>, incluido el tratamiento de mi
            cédula, selfie y, si ofrezco servicios, mis antecedentes, para verificar mi identidad.
          </span>
        </label>
        <SubmitButton>Crear cuenta</SubmitButton>
      </ActionForm>
    </Page>
  );
}
