// next/navigation para la demo: rutas con # (GitHub Pages no tiene servidor que resuelva /c/servicio/...).
import { useMemo } from "react";

export class RedirectSignal extends Error {
  constructor(public to: string) {
    super(`redirect:${to}`);
  }
}
export class NotFoundSignal extends Error {}

export const toHash = (url: string) => "#" + (url.split("#")[0] || "/");

export function navigate(url: string) {
  if (location.hash !== toHash(url)) location.hash = toHash(url);
  else window.dispatchEvent(new Event("llave:refresh"));
}

// Sin lanzar: en una Server Action real redirect() corta la ejecución; aquí basta con navegar y dejar que la función termine.
export function redirect(url: string): never {
  queueMicrotask(() => navigate(url));
  return undefined as never;
}

export function notFound(): never {
  throw new NotFoundSignal("No encontrado");
}

export function useRouter() {
  return useMemo(
    () => ({
      refresh: () => window.dispatchEvent(new Event("llave:refresh")),
      push: (url: string) => navigate(url),
      replace: (url: string) => navigate(url),
      back: () => history.back(),
    }),
    [],
  );
}
