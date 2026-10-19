import { Page, Section } from "@/components/ui";

export const metadata = { title: "Términos y privacidad" };

const DATA = [
  ["Cédula, selfie con código y foto de perfil", "Verificar identidad", "Imágenes: 90 días tras la revisión. Foto de perfil: mientras exista la cuenta."],
  ["Certificado de antecedentes y licencia SEC", "Verificar idoneidad para entrar a hogares", "Archivo: 90 días. Resultado y vencimiento: mientras exista la cuenta."],
  ["Consulta del registro de inhabilidades (Ley 20.594)", "Proteger a niñas y niños en los hogares", "Resultado y fecha; no se guarda copia del registro."],
  ["Dirección y ubicación durante el servicio", "Llegar, verificar la llegada y atender emergencias", "Pings de ubicación: 30 días."],
  ["Selfie de llegada y fotos del trabajo", "Probar quién llegó y qué se hizo", "Selfie: 30 días. Fotos: 90 días."],
  ["Mensajes, calificaciones y alertas", "Seguridad, reclamos y respaldo de denuncias", "Mientras exista la cuenta; las alertas abiertas impiden borrar la cuenta."],
];

export default function Privacidad() {
  return (
    <Page title="Términos y privacidad" back="/">
      <p className="text-graphite-2">Versión 2026-10. Borrador para revisión legal antes del lanzamiento.</p>
      <Section title="Qué datos tratamos y por cuánto tiempo">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-left text-[0.95rem]">
            <thead>
              <tr className="border-b-2 border-ink">
                <th className="py-2 pr-3">Dato</th>
                <th className="py-2 pr-3">Para qué</th>
                <th className="py-2">Plazo</th>
              </tr>
            </thead>
            <tbody>
              {DATA.map(([d, p, t]) => (
                <tr key={d} className="border-b border-rule align-top">
                  <td className="py-2 pr-3 font-bold">{d}</td>
                  <td className="py-2 pr-3">{p}</td>
                  <td className="py-2">{t}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="Tus derechos">
        <p>
          Puedes acceder a tus datos y descargarlos desde Cuenta, corregirlos escribiendo a la central, y eliminar tu cuenta. La eliminación borra tus documentos y anonimiza tu
          nombre y teléfono; se conservan los registros de servicios e incidentes que involucran a otras personas. Para proteger reclamos pendientes, deben pasar 15 días desde tu
          último servicio y no puede haber casos de seguridad abiertos (Ley 21.719 sobre protección de datos personales).
        </p>
        <p>Los documentos se guardan cifrados. Solo la central puede verlos y cada acceso queda registrado con nombre, fecha y motivo.</p>
      </Section>
      <Section title="Quienes ofrecen servicios">
        <p>
          Llave coordina el contacto entre clientes y trabajadoras y trabajadores independientes (Ley 21.431). Tú fijas tus tarifas, eliges qué solicitudes aceptar, cuándo
          conectarte y no tienes metas. La comisión es de 15%, o 10% con clientes con quienes ya completaste dos servicios. Puedes conocer cómo funciona la asignación en la
          sección Transparencia y pedir revisión humana de cualquier suspensión.
        </p>
      </Section>
      <Section title="Pagos">
        <p>
          Al reservar se autoriza el monto; se cobra al terminar y se libera a quien trabajó cuando el cliente confirma o pasan 48 horas sin reclamo. Cancelar con menos de 2
          horas de aviso cobra 20% a favor de quien ya reservó su tiempo.
        </p>
      </Section>
    </Page>
  );
}
