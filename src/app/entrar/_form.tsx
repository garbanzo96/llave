"use client";
import { useActionState, useState } from "react";
import { requestOtpAction, verifyOtpAction } from "@/app/actions";
import { SubmitButton } from "@/components/interactive";
import { Field, inputClass, Notice } from "@/components/ui";

export function LoginForm() {
  const [phone, setPhone] = useState("");
  const [sent, requestOtp] = useActionState(requestOtpAction, null);
  const [verified, verify] = useActionState(verifyOtpAction, null);
  const step = sent?.ok ? "code" : "phone";
  const devCode = sent?.ok ? (sent.data as { devCode?: string } | undefined)?.devCode : undefined;

  if (step === "phone")
    return (
      <form action={requestOtp} className="space-y-4">
        <Field label="Tu celular" htmlFor="phone" hint="Te enviaremos un código por SMS.">
          <div className="flex items-center gap-2">
            <span className="tabular font-bold text-graphite-2">+56</span>
            <input
              id="phone"
              name="phone"
              inputMode="tel"
              autoComplete="tel-national"
              required
              placeholder="9 1234 5678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
            />
          </div>
        </Field>
        {sent && !sent.ok && <Notice tone="error">{sent.error}</Notice>}
        <SubmitButton>Enviar código</SubmitButton>
      </form>
    );

  return (
    <form action={verify} className="space-y-4">
      <input type="hidden" name="phone" value={phone} />
      <Field label="Código de 6 dígitos" htmlFor="code" hint={`Lo enviamos al +56 ${phone}. Vence en 5 minutos.`}>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          autoFocus
          className={`${inputClass} tabular text-[1.4rem] tracking-[0.3em]`}
        />
      </Field>
      {devCode && <Notice tone="warn">Modo desarrollo: tu código es {devCode}.</Notice>}
      {verified && !verified.ok && <Notice tone="error">{verified.error}</Notice>}
      <SubmitButton>Entrar</SubmitButton>
      <p className="text-[0.95rem] text-graphite-2">Nunca le des este código a nadie, ni a quien vaya a tu casa.</p>
    </form>
  );
}
