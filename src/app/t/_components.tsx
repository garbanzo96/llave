"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LocateFixed } from "lucide-react";
import { setOnlineAction } from "@/app/actions";
import { getPosition } from "@/components/interactive";
import { buttonClass, Notice } from "@/components/ui";

export function Availability({ online, active }: { online: boolean; active: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!online || !active) return;
    let stopped = false;
    let busy = false;
    const refresh = async () => {
      if (busy) return;
      busy = true;
      try {
        const p = await getPosition();
        if (stopped) return;
        if (!p) {
          setError("No pudimos actualizar tu ubicación. Revisa los permisos para seguir recibiendo urgencias.");
          return;
        }
        const r = await setOnlineAction(true, p.coords.latitude, p.coords.longitude);
        if (!stopped) setError(r.ok ? null : r.error);
      } catch {
        if (!stopped) setError("No pudimos actualizar tu disponibilidad. Revisa tu conexión.");
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(() => void refresh(), 60_000);
    return () => { stopped = true; clearInterval(timer); };
  }, [online, active]);

  return <div className="space-y-2">
    <button type="button" role="switch" aria-checked={online} disabled={pending || (!active && !online)} aria-busy={pending}
      className={buttonClass(online ? "primary" : "secondary")}
      onClick={() => start(async () => {
        setError(null);
        try {
          const p = online ? null : await getPosition();
          if (!online && !p) { setError("Activa el permiso de ubicación para recibir urgencias."); return; }
          const r = await setOnlineAction(!online, p?.coords.latitude, p?.coords.longitude);
          if (!r.ok) setError(r.error);
          else router.refresh();
        } catch { setError("No pudimos cambiar tu disponibilidad. Intenta de nuevo."); }
      })}>
      <LocateFixed size={20} aria-hidden /> Disponible para urgencias: {online ? "sí" : "no"}
    </button>
    <p className="text-graphite-2">Mientras estés disponible actualizamos tu ubicación cada minuto. Puedes desconectarte cuando quieras.</p>
    {error && <Notice tone="error">{error}</Notice>}
  </div>;
}
