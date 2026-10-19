"use client";

import { useState } from "react";
import { reviewAction } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/interactive";
import { Field, inputClass } from "@/components/ui";

export function ReviewForm({ verificationId }: { verificationId: string }) {
  const [decision, setDecision] = useState("");
  return <ActionForm action={reviewAction}>
    <input type="hidden" name="verificationId" value={verificationId} />
    <fieldset><legend className="font-bold">Decisión</legend><div className="flex flex-wrap gap-4">
      {[{ value: "approve", label: "Aprobar" }, { value: "reject", label: "Rechazar" }].map(o => <label key={o.value} className="flex min-h-12 items-center gap-3"><input type="radio" name="decision" value={o.value} required checked={decision === o.value} onChange={() => setDecision(o.value)} className="size-5 accent-[var(--ink)]" />{o.label}</label>)}
    </div></fieldset>
    <Field label="Motivo" htmlFor={`reason-${verificationId}`} hint="Obligatorio si rechazas. La persona verá este motivo."><textarea id={`reason-${verificationId}`} name="reason" required={decision === "reject"} maxLength={1000} rows={3} className={inputClass} /></Field>
    <Field label="Fecha de vencimiento (opcional)" htmlFor={`expiry-${verificationId}`}><input id={`expiry-${verificationId}`} name="expiresAt" type="date" className={inputClass} /></Field>
    <SubmitButton>Guardar revisión</SubmitButton>
  </ActionForm>;
}
