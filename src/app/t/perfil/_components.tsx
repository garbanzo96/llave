"use client";

import { ActionForm, SubmitButton } from "@/components/interactive";
import { workerProfileAction } from "@/app/actions";

export function ProfileForm({ children }: { children: React.ReactNode }) {
  return <ActionForm action={workerProfileAction}>{children}<SubmitButton>Guardar perfil</SubmitButton></ActionForm>;
}
