import { redirect } from "next/navigation";
import { currentUser, homeFor } from "@/server/auth";

export default async function Inicio() {
  const user = await currentUser();
  redirect(user ? homeFor(user.role) : "/entrar");
}
