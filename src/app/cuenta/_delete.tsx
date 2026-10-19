"use client";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/server/action";
import { buttonClass, Notice } from "@/components/ui";

type Result = ActionResult<{ ok: boolean; blockers: string[] }>;

export function DeleteAccount({ action }: { action: () => Promise<Result> }) {
  const [pending, start] = useTransition();
  const [r, setR] = useState<Result | null>(null);
  return (
    <div className="space-y-3">
      <p className="text-graphite-2">Se borran tus documentos y se anonimizan tu nombre y celular. No se puede deshacer.</p>
      <button
        type="button"
        disabled={pending}
        className={buttonClass("danger")}
        onClick={() => {
          if (!window.confirm("¿Eliminar tu cuenta de forma permanente?")) return;
          start(async () => setR(await action()));
        }}
      >
        Eliminar mi cuenta
      </button>
      {r && !r.ok && <Notice tone="error">{r.error}</Notice>}
      {r?.ok && r.data && !r.data.ok && (
        <Notice tone="warn">
          Todavía no se puede eliminar:
          <ul className="mt-1 list-disc pl-5">
            {r.data.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </Notice>
      )}
    </div>
  );
}
