"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import { arriveAction } from "@/app/actions";
import { getPosition } from "@/components/interactive";
import { buttonClass, Notice } from "@/components/ui";

export function ArriveButton({ bookingId }: { bookingId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return <div className="space-y-2"><button type="button" className={buttonClass()} disabled={pending} aria-busy={pending} onClick={() => start(async () => {
    setError(null);
    try {
      const p = await getPosition();
      if (!p) { setError("Activa el permiso de ubicación para confirmar tu llegada."); return; }
      const r = await arriveAction(bookingId, p.coords.latitude, p.coords.longitude);
      if (!r.ok) setError(r.error);
      else router.refresh();
    } catch { setError("No pudimos confirmar tu llegada. Revisa tu conexión e intenta de nuevo."); }
  })}><MapPin size={20} aria-hidden />{pending ? "Confirmando llegada…" : "Llegué"}</button>
    <p className="text-graphite-2">Debes estar a menos de 200 m del domicilio para confirmar tu llegada.</p>
    {error && <Notice tone="error">{error}</Notice>}
  </div>;
}
