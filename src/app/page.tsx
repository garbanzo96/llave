import { redirect } from "next/navigation";
import { currentUser, homeFor } from "@/server/auth";
import { ButtonLink, Notice, Page } from "@/components/ui";

const LINES = [
  ["Antes", "Cada persona pasa por cédula, selfie, certificado de antecedentes y el registro de inhabilidades. Gasfíter de gas y electricistas, además, licencia SEC."],
  ["En la puerta", "Ves su selfie de llegada junto a su foto de perfil. Si es la misma persona, le dictas tu PIN. Sin PIN, el servicio no empieza."],
  ["Durante", "Ayuda en el margen rojo, silenciosa, para ambos lados. Si el servicio se alarga, preguntamos si todo está bien."],
  ["Después", "El pago queda retenido 48 horas. Califican ambos a ciegas y puedes no volver a coincidir con alguien."],
];

export default async function Home({ searchParams }: { searchParams: Promise<{ eliminada?: string }> }) {
  const user = await currentUser();
  if (user) redirect(homeFor(user.role));
  const { eliminada } = await searchParams;
  return (
    <Page title="Llave">
      {eliminada && <Notice tone="ok">Tu cuenta fue eliminada.</Notice>}
      <p className="text-[1.35rem] font-bold leading-snug text-ink [text-wrap:balance]">
        Limpieza, jardinería, gasfitería, gas y electricidad con personas verificadas. Tú decides quién entra a tu casa.
      </p>
      <ol className="border-t border-rule">
        {LINES.map(([when, text]) => (
          <li key={when} className="grid grid-cols-[6.5rem_1fr] gap-3 border-b border-rule py-3">
            <span className="font-bold text-ink">{when}</span>
            <span>{text}</span>
          </li>
        ))}
      </ol>
      <div className="space-y-3">
        <ButtonLink href="/entrar">Entrar con mi celular</ButtonLink>
        <p className="text-[0.95rem] text-graphite-2">
          ¿Ofreces servicios? Entra igual y elige “Ofrezco servicios”. Tú fijas tus tarifas y eliges qué aceptar.
        </p>
      </div>
    </Page>
  );
}
