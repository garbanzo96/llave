// Contenedor de la demo: rutas con #, ejecuta las páginas reales de src/app (Server Components async) en el navegador,
// y agrega una barra para cambiar de rol, ver los SMS simulados y reiniciar.
import { useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "../../src/app/globals.css";
import { db } from "@/server/db";
import { homeFor } from "@/server/auth";
import { saveUpload } from "@/server/storage";
import { isEmpty, resetDemo, subscribe } from "./shims/prisma";
import { smsLog, type Sms } from "./shims/notify";
import { NotFoundSignal, RedirectSignal, navigate } from "./shims/navigation";

// GPS simulado en la dirección de demostración (Providencia), para que la búsqueda y la llegada funcionen desde cualquier lugar.
const HOME = { latitude: -33.4263, longitude: -70.611, accuracy: 12, altitude: null, altitudeAccuracy: null, heading: null, speed: null };
const position = () => ({ coords: { ...HOME, toJSON: () => HOME }, timestamp: Date.now(), toJSON: () => ({}) }) as GeolocationPosition;
Object.defineProperty(navigator, "geolocation", {
  configurable: true,
  value: {
    getCurrentPosition: (ok: PositionCallback) => setTimeout(() => ok(position()), 150),
    watchPosition: (ok: PositionCallback) => {
      ok(position());
      return window.setInterval(() => ok(position()), 10_000);
    },
    clearWatch: (id: number) => clearInterval(id),
  },
});

type Loader = () => Promise<{ default: (props: unknown) => Promise<ReactNode> | ReactNode }>;
const pages = import.meta.glob("../../src/app/**/page.tsx") as Record<string, Loader>;
const routes = Object.keys(pages).map((file) => {
  const pattern = file.replace("../../src/app", "").replace(/\/page\.tsx$/, "") || "/";
  const names: string[] = [];
  const re = new RegExp(
    "^" +
      pattern.replace(/\[(\w+)\]/g, (_, n: string) => {
        names.push(n);
        return "([^/]+)";
      }) +
      "/?$",
  );
  return { file, re, names };
});

function useHash() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => {
      setHash(location.hash);
      window.scrollTo(0, 0);
    };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return hash;
}

let seq = 0;
function Screen() {
  const hash = useHash();
  const [tick, setTick] = useState(0);
  const [view, setView] = useState<ReactNode>(null);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    addEventListener("llave:refresh", bump);
    const off = subscribe(bump);
    return () => {
      removeEventListener("llave:refresh", bump);
      off();
    };
  }, []);

  useEffect(() => {
    const mine = ++seq;
    const [path, query = ""] = (hash.slice(1) || "/").split("?");
    const route = routes.find((r) => r.re.test(path));
    (async () => {
      try {
        if (!route) throw new NotFoundSignal("No encontrado");
        const m = path.match(route.re)!;
        const params = Object.fromEntries(route.names.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
        const Page = (await pages[route.file]()).default;
        const out = await Page({ params: Promise.resolve(params), searchParams: Promise.resolve(Object.fromEntries(new URLSearchParams(query))) });
        if (mine === seq) setView(out);
      } catch (e) {
        if (mine !== seq) return;
        if (e instanceof RedirectSignal) navigate(e.to);
        else if (e instanceof NotFoundSignal) setView(<Message title="No encontrado" text="Esta página no existe o ya no tienes acceso." />);
        else {
          console.error(e);
          setView(<Message title="Algo falló en la demo" text={e instanceof Error ? e.message : String(e)} />);
        }
      }
    })();
  }, [hash, tick]);

  return view;
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <div className="relative z-[1] pl-[calc(var(--margin-x)+14px)] pr-4 pt-6">
      <h1 className="text-[1.4rem] font-bold">{title}</h1>
      <p className="mt-2 text-graphite-2">{text}</p>
      <a className="mt-4 inline-block font-bold text-ink underline" href="#/">
        Volver al inicio
      </a>
    </div>
  );
}

const ROLE_LABEL = { CLIENT: "cliente", WORKER: "trabaja", ADMIN: "central" } as const;

function DemoBar() {
  const [users, setUsers] = useState<{ id: string; name: string; role: keyof typeof ROLE_LABEL; status: string }[]>([]);
  const [current, setCurrent] = useState(localStorage.getItem("llave-demo:session") ?? "");
  useEffect(() => {
    const load = () => {
      void db.user.findMany({ where: { status: { not: "DELETED" } }, orderBy: { phone: "asc" } }).then(setUsers);
      setCurrent(localStorage.getItem("llave-demo:session") ?? "");
    };
    load();
    const off = subscribe(load);
    addEventListener("hashchange", load);
    return () => {
      off();
      removeEventListener("hashchange", load);
    };
  }, []);

  return (
    <div className="relative z-10 border-b border-rule bg-ink-tint/90 py-2 pl-[calc(var(--margin-x)+14px)] pr-4 text-[0.9rem] text-ink-strong">
      <div className="mx-auto flex max-w-[36rem] flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-bold">Demo</span>
        <label className="flex items-center gap-2">
          <span className="sr-only">Ver la app como</span>
          <select
            value={current}
            onChange={(e) => {
              const u = users.find((x) => x.id === e.target.value);
              if (!u) {
                localStorage.removeItem("llave-demo:session");
                navigate("/");
              } else {
                localStorage.setItem("llave-demo:session", u.id);
                navigate(homeFor(u.role));
              }
              setCurrent(e.target.value);
            }}
            className="min-h-10 max-w-[15rem] rounded-md border-2 border-ink/30 bg-paper px-2 text-graphite"
          >
            <option value="">Sin sesión</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name.split(" ").slice(0, 2).join(" ")} · {ROLE_LABEL[u.role]}
                {u.status !== "ACTIVE" ? " (sin verificar)" : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="min-h-10 rounded-md px-2 font-bold underline"
          onClick={() => {
            if (!confirm("¿Borrar todo lo que hiciste en la demo y volver a los datos iniciales?")) return;
            resetDemo();
            localStorage.removeItem("llave-demo:session");
            location.hash = "#/";
            location.reload();
          }}
        >
          Reiniciar
        </button>
        <span className="w-full text-[0.8rem] text-graphite-2">Corre en tu navegador: GPS simulado en Providencia, SMS en pantalla, sin pagos reales.</span>
      </div>
    </div>
  );
}

function SmsToasts() {
  const [items, setItems] = useState<Sms[]>([]);
  useEffect(() => {
    const on = () => setItems(smsLog.slice(0, 3));
    addEventListener("llave:sms", on);
    return () => removeEventListener("llave:sms", on);
  }, []);
  useEffect(() => {
    if (!items.length) return;
    const t = setTimeout(() => setItems([]), 12_000);
    return () => clearTimeout(t);
  }, [items]);
  if (!items.length) return null;
  return (
    <div aria-live="polite" className="fixed right-3 top-3 z-30 w-[min(22rem,calc(100vw-80px))] space-y-2">
      {items.map((s) => (
        <button key={s.id} type="button" onClick={() => setItems([])} className="block w-full rounded-md border border-rule bg-paper p-3 text-left text-[0.9rem] shadow-[0_6px_20px_-6px_rgba(18,29,107,0.35)]">
          <span className="block text-[0.8rem] font-bold text-ink">SMS simulado a {s.phone}</span>
          {s.text}
        </button>
      ))}
    </div>
  );
}

// Fotos de perfil de demostración (iniciales sobre color), para que la comparación en la puerta tenga con qué comparar.
async function seedAvatars() {
  const colors = ["#1d2c94", "#17663f", "#8a5300", "#9e0b23", "#4f5661"];
  const users = await db.user.findMany({ where: { photoDocId: null, role: { not: "ADMIN" } } });
  for (const [i, u] of users.entries()) {
    const c = document.createElement("canvas");
    c.width = c.height = 240;
    const g = c.getContext("2d")!;
    g.fillStyle = colors[i % colors.length];
    g.fillRect(0, 0, 240, 240);
    g.fillStyle = "#ffffff";
    g.font = "bold 96px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(u.name.split(" ").slice(0, 2).map((w: string) => w[0]).join(""), 120, 128);
    const blob = await new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), "image/png"));
    const doc = await saveUpload(new File([blob], "avatar.png", { type: "image/png" }), { ownerId: u.id, kind: "PROFILE_PHOTO" });
    await db.user.update({ where: { id: u.id }, data: { photoDocId: doc.id } });
  }
}

async function start() {
  if ("serviceWorker" in navigator) {
    await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => null);
    if (!navigator.serviceWorker.controller)
      await new Promise((ok) => {
        navigator.serviceWorker.addEventListener("controllerchange", ok, { once: true });
        setTimeout(ok, 2000);
      });
  }
  if (isEmpty()) {
    // `seeded` lo agrega demo/vite.config.ts al compilar prisma/seed.ts para el navegador.
    await ((await import("../../prisma/seed")) as unknown as { seeded: Promise<void> }).seeded;
    await seedAvatars();
  }
  createRoot(document.getElementById("root")!).render(
    <>
      <DemoBar />
      <Screen />
      <SmsToasts />
    </>,
  );
}

void start();
