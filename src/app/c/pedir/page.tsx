import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { ButtonLink, Notice, Page } from "@/components/ui";
import { CATEGORIES, isCategory } from "@/lib/core/categories";
import { HIDDEN_ADDRESS } from "@/server/services/account";
import { RequestForm } from "./_form";

export const metadata = { title: "Pedir servicio" };

export default async function Pedir({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  const user = await requireUser("CLIENT");
  const { cat } = await searchParams;
  const category = isCategory(cat) ? cat : "LIMPIEZA";
  const [addresses, prefs] = await Promise.all([
    db.address.findMany({ where: { userId: user.id, label: { not: HIDDEN_ADDRESS } }, select: { id: true, label: true, line: true, comuna: true } }),
    db.clientProfile.findUnique({ where: { userId: user.id } }),
  ]);
  return (
    <Page title={CATEGORIES[category].label} back="/c">
      {user.status !== "ACTIVE" && <Notice tone="warn">Puedes ver quién está disponible, pero para reservar debes verificar tu identidad.</Notice>}
      {addresses.length === 0 ? (
        <div className="space-y-3">
          <p>Primero agrega la dirección donde será el servicio. La usamos para encontrar personas cerca; nadie la ve antes de aceptar.</p>
          <ButtonLink href="/c/perfil#direcciones">Agregar dirección</ButtonLink>
        </div>
      ) : (
        <RequestForm category={category} info={CATEGORIES[category]} addresses={addresses} defaultGenderPref={prefs?.workerGenderPref ?? "ANY"} />
      )}
    </Page>
  );
}
