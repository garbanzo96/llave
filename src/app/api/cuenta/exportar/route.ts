import { NextResponse } from "next/server";
import { currentUser } from "@/server/auth";
import { exportData } from "@/server/services/account";

export async function GET() {
  const user = await currentUser();
  if (!user || user.role === "ADMIN") return new NextResponse("No autorizado", { status: 401 });
  return new NextResponse(JSON.stringify(await exportData(user), null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="mis-datos-llave.json"',
      "Cache-Control": "private, no-store",
    },
  });
}
