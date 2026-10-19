"use client";
// Piezas compartidas entre la vista del cliente y la del trabajador para un servicio.
import { useState, useTransition } from "react";
import { Copy, LoaderCircle, Share2 } from "lucide-react";
import { cancelAction, rateAction, sendMessageAction, shareAction, wellbeingAckAction } from "@/app/actions";
import { ActionButton, ActionForm, SubmitButton } from "./interactive";
import { buttonClass, cx, fmtTime, inputClass, Notice, Sheet } from "./ui";

type Msg = { id: string; mine: boolean; body: string; redacted: boolean; at: Date };

export function Chat({ bookingId, messages, otherName }: { bookingId: string; messages: Msg[]; otherName: string }) {
  const [key, setKey] = useState(0);
  return (
    <div className="space-y-3">
      <ol className="max-h-80 space-y-2 overflow-y-auto overscroll-contain" aria-live="polite">
        {messages.length === 0 && <li className="text-graphite-2">Aún no hay mensajes con {otherName}.</li>}
        {messages.map((m) => (
          <li key={m.id} className={cx("flex", m.mine ? "justify-end" : "justify-start")}>
            <p className={cx("max-w-[85%] rounded-md px-3 py-2", m.mine ? "bg-ink-tint text-ink-strong" : "border border-rule bg-paper")}>
              <span className="whitespace-pre-wrap break-words">{m.body}</span>
              <span className="tabular mt-0.5 block text-right text-[0.8rem] text-graphite-2">{fmtTime(m.at)}</span>
            </p>
          </li>
        ))}
      </ol>
      <ActionForm key={key} action={sendMessageAction} onDone={() => setKey((k) => k + 1)} className="space-y-2">
        <input type="hidden" name="bookingId" value={bookingId} />
        <label htmlFor={`msg-${bookingId}`} className="sr-only">
          Mensaje
        </label>
        <textarea id={`msg-${bookingId}`} name="body" rows={2} maxLength={1000} required className={cx(inputClass, "py-2")} placeholder="Escribe un mensaje" />
        <p className="text-[0.85rem] text-graphite-2">Por seguridad ocultamos teléfonos, correos y enlaces. Todo queda dentro de Llave.</p>
        <SubmitButton variant="secondary">Enviar</SubmitButton>
      </ActionForm>
    </div>
  );
}

export function ShareTrip({ bookingId }: { bookingId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        className={buttonClass("secondary")}
        onClick={() =>
          start(async () => {
            const r = await shareAction(bookingId, true);
            if (r.ok) setUrl(String(r.data));
            else setErr(r.error);
          })
        }
      >
        {pending ? <LoaderCircle size={18} className="animate-spin" aria-hidden /> : <Share2 size={18} aria-hidden />}
        Compartir con mis contactos de confianza
      </button>
      {url && (
        <div className="space-y-2">
          <Notice tone="ok">Enviamos el enlace a tus contactos. Vence en 12 horas.</Notice>
          <button
            type="button"
            className={buttonClass("ghost", false)}
            onClick={async () => {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            }}
          >
            <Copy size={16} aria-hidden /> {copied ? "Copiado" : "Copiar enlace"}
          </button>
        </div>
      )}
      {err && <Notice tone="error">{err}</Notice>}
    </div>
  );
}

export function WellbeingBanner({ bookingId }: { bookingId: string }) {
  return (
    <Sheet tone="alert" className="space-y-3">
      <p className="text-[1.1rem] font-bold text-margin-strong">¿Todo bien?</p>
      <p>El servicio superó el tiempo estimado. Si nadie responde en 10 minutos, la central se comunicará.</p>
      <ActionButton action={wellbeingAckAction.bind(null, bookingId)}>Sí, todo bien</ActionButton>
    </Sheet>
  );
}

export function RatingForm({ bookingId, otherName, asWorker }: { bookingId: string; otherName: string; asWorker?: boolean }) {
  return (
    <ActionForm action={rateAction}>
      <input type="hidden" name="bookingId" value={bookingId} />
      <fieldset className="space-y-2">
        <legend className="font-bold">¿Cómo fue el servicio con {otherName}?</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer">
              <input type="radio" name="stars" value={n} required className="peer sr-only" />
              <span className="tabular grid size-12 place-items-center border-2 border-rule text-[1.2rem] font-bold text-graphite-2 peer-checked:border-ink peer-checked:bg-ink peer-checked:text-paper peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-ink">
                {n}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="font-bold">¿Te sentiste {asWorker ? "segura o seguro" : "seguro o segura"}?</legend>
        <div className="flex gap-4">
          <label className="flex min-h-12 items-center gap-2">
            <input type="radio" name="feltSafe" value="si" defaultChecked className="size-5 accent-[var(--ink)]" /> Sí
          </label>
          <label className="flex min-h-12 items-center gap-2">
            <input type="radio" name="feltSafe" value="no" className="size-5 accent-[var(--margin)]" /> No
          </label>
        </div>
        <p className="text-[0.9rem] text-graphite-2">Esta respuesta es privada: no afecta la nota pública y solo la revisa la central.</p>
      </fieldset>
      <label htmlFor={`c-${bookingId}`} className="block font-bold">
        Comentario (opcional)
      </label>
      <textarea id={`c-${bookingId}`} name="comment" rows={3} maxLength={500} className={cx(inputClass, "py-2")} />
      <SubmitButton>Enviar calificación</SubmitButton>
    </ActionForm>
  );
}

export function CancelForm({ bookingId, warning }: { bookingId: string; warning?: string }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("ghost")}>
        Cancelar servicio
      </button>
    );
  return (
    <ActionForm action={cancelAction}>
      <input type="hidden" name="bookingId" value={bookingId} />
      {warning && <Notice tone="warn">{warning}</Notice>}
      <label htmlFor={`r-${bookingId}`} className="block font-bold">
        Motivo
      </label>
      <textarea id={`r-${bookingId}`} name="reason" rows={2} maxLength={300} required className={cx(inputClass, "py-2")} />
      <SubmitButton variant="danger">Confirmar cancelación</SubmitButton>
    </ActionForm>
  );
}
