import { requireUser, homeFor } from "@/server/auth";
import { deleteAccountAction, logoutAction } from "@/app/actions";
import { buttonClass, Page, Section } from "@/components/ui";
import { DeleteAccount } from "./_delete";

export const metadata = { title: "Cuenta" };

export default async function Cuenta() {
  const user = await requireUser("CLIENT", "WORKER");
  return (
    <Page title="Tu cuenta" back={homeFor(user.role)}>
      <dl className="border-t border-rule">
        {[
          ["Nombre", user.name],
          ["Celular", user.phone],
          ["RUT", user.rut ?? "Sin verificar"],
        ].map(([k, v]) => (
          <div key={k} className="grid grid-cols-[6rem_1fr] gap-3 border-b border-rule py-3">
            <dt className="font-bold text-ink">{k}</dt>
            <dd className="tabular">{v}</dd>
          </div>
        ))}
      </dl>
      <Section title="Tus datos">
        <a href="/api/cuenta/exportar" className={buttonClass("secondary")} download>
          Descargar mis datos (JSON)
        </a>
      </Section>
      <form action={logoutAction}>
        <button className={buttonClass("secondary")}>Cerrar sesión</button>
      </form>
      <Section title="Eliminar cuenta">
        <DeleteAccount action={deleteAccountAction} />
      </Section>
    </Page>
  );
}
