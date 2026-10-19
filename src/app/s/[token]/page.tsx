import { notFound } from "next/navigation";
import { sharedView } from "@/server/services/safety";
import { Page, Section, fmtDate, fmtTime } from "@/components/ui";
import { EMERGENCY_NUMBERS } from "@/lib/core/safety";
import { CATEGORIES, type Category } from "@/lib/core/categories";

export const metadata = { title: "Seguimiento compartido", robots: { index: false, follow: false } };

export default async function Shared({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const v = await sharedView(token);
  if (!v) notFound();
  return (
    <Page title="Seguimiento de un servicio">
      <p className="text-[1.2rem]">
        <span className="font-bold">{v.client}</span> compartió contigo un servicio de {CATEGORIES[v.category as Category].label.toLowerCase()}
        {v.worker && (
          <>
            {" "}con <span className="font-bold">{v.worker}</span>
          </>
        )}
        .
      </p>
      <dl className="border-t border-rule">
        {[
          ["Estado", v.status],
          ["Cuándo", `${fmtDate(v.scheduledAt)}, ${fmtTime(v.scheduledAt)}`],
          ...(v.address ? [["Dirección", v.address]] : []),
          ...(v.lastPing ? [["Última ubicación", `${fmtTime(v.lastPing.createdAt)}`]] : []),
        ].map(([k, val]) => (
          <div key={k} className="grid grid-cols-[8rem_1fr] gap-3 border-b border-rule py-3">
            <dt className="font-bold text-ink">{k}</dt>
            <dd>{val}</dd>
          </div>
        ))}
      </dl>
      {v.lastPing && (
        <a className="font-bold text-ink underline" href={`https://maps.google.com/?q=${v.lastPing.lat},${v.lastPing.lng}`} target="_blank" rel="noreferrer">
          Ver última ubicación en el mapa
        </a>
      )}
      {v.closed && <p className="text-graphite-2">Este servicio ya terminó. La ubicación ya no se comparte.</p>}
      <Section title="Si crees que hay una emergencia">
        <p>Llama a {EMERGENCY_NUMBERS[0].label} ({EMERGENCY_NUMBERS[0].number}) y menciona que el servicio se coordinó por Llave. La central de Llave ya recibe las alertas del servicio.</p>
      </Section>
    </Page>
  );
}
