import { redirect } from "next/navigation";
import { currentUser, homeFor } from "@/server/auth";
import { Page } from "@/components/ui";
import { LoginForm } from "./_form";

export const metadata = { title: "Entrar" };

export default async function Entrar() {
  const user = await currentUser();
  if (user) redirect(homeFor(user.role));
  return (
    <Page title="Entrar" back="/">
      <LoginForm />
    </Page>
  );
}
