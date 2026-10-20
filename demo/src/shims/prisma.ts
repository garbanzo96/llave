// Prisma en memoria para la demo web. Lee prisma/schema.prisma en tiempo de compilación, así que los modelos,
// valores por defecto, únicos y relaciones salen del mismo esquema que usa la app real.
// shortcut: implementa solo la parte de la API de Prisma que usa el código (ver README de demo/); sin cascadas al borrar.
import schemaText from "../../../prisma/schema.prisma?raw";

type Rel = { target: string; many: boolean; local: string; foreign: string };
type Field = {
  name: string;
  type: string;
  list: boolean;
  optional: boolean;
  unique: boolean;
  updatedAt: boolean;
  def?: () => unknown;
  rel?: Rel;
  relName?: string;
  relFields?: string[];
  relRefs?: string[];
};
type Model = { name: string; fields: Record<string, Field>; uniques: string[][] };
type Row = Record<string, unknown>;
type Args = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function cuid() {
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

function parseDefault(raw: string, type: string): () => unknown {
  if (raw === "cuid()" || raw === "uuid()") return cuid;
  if (raw === "now()") return () => new Date();
  if (raw === "true" || raw === "false") return () => raw === "true";
  if (/^-?\d+(\.\d+)?$/.test(raw)) return () => Number(raw);
  if (raw.startsWith('"')) return () => JSON.parse(raw);
  return () => (type === "String" ? raw : raw); // valor de enum
}

export function parseSchema(text: string): Record<string, Model> {
  const models: Record<string, Model> = {};
  for (const block of text.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const model: Model = { name: block[1], fields: {}, uniques: [] };
    for (const raw of block[2].split("\n")) {
      const line = raw.replace(/\/\/.*$/, "").trim();
      if (!line) continue;
      const compound = line.match(/^@@(id|unique)\(\[([^\]]+)\]/);
      if (compound) {
        model.uniques.push(compound[2].split(",").map((s) => s.trim()));
        continue;
      }
      if (line.startsWith("@@")) continue;
      const m = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/);
      if (!m) continue;
      const [, name, type, list, optional, attrs] = m;
      const f: Field = { name, type, list: !!list, optional: !!optional, unique: /@id\b|@unique\b/.test(attrs), updatedAt: /@updatedAt/.test(attrs) };
      const d = attrs.match(/@default\(((?:[^()]|\([^()]*\))*)\)/);
      if (d) f.def = parseDefault(d[1].trim(), type);
      const r = attrs.match(/@relation\(([^)]*)\)/);
      if (r) {
        f.relName = r[1].match(/"([^"]+)"/)?.[1];
        f.relFields = r[1].match(/fields:\s*\[([^\]]+)\]/)?.[1].split(",").map((s) => s.trim());
        f.relRefs = r[1].match(/references:\s*\[([^\]]+)\]/)?.[1].split(",").map((s) => s.trim());
      }
      model.fields[name] = f;
    }
    models[model.name] = model;
  }
  // Resolver relaciones: el lado con `fields` tiene la llave foránea; el otro lado la busca en el modelo destino.
  for (const model of Object.values(models)) {
    for (const f of Object.values(model.fields)) {
      if (!models[f.type]) continue;
      if (f.relFields && f.relRefs) {
        f.rel = { target: f.type, many: false, local: f.relFields[0], foreign: f.relRefs[0] };
        continue;
      }
      const back = Object.values(models[f.type].fields).find((g) => g.type === model.name && g.relFields && g.relName === f.relName);
      if (!back) throw new Error(`Relación sin contraparte: ${model.name}.${f.name}`);
      f.rel = { target: f.type, many: f.list, local: back.relRefs![0], foreign: back.relFields![0] };
    }
  }
  return models;
}

const MODELS = parseSchema(schemaText);
const KEY = "llave-demo:db";

let tables: Record<string, Row[]> = load();
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function load(): Record<string, Row[]> {
  const empty = Object.fromEntries(Object.keys(MODELS).map((m) => [m, [] as Row[]]));
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Record<string, Row[]>;
    for (const [name, rows] of Object.entries(parsed)) {
      const model = MODELS[name];
      if (!model) continue;
      for (const row of rows)
        for (const f of Object.values(model.fields)) if (f.type === "DateTime" && row[f.name]) row[f.name] = new Date(row[f.name] as string);
      empty[name] = rows;
    }
    return empty;
  } catch {
    return empty;
  }
}

function changed() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(tables));
    } catch (e) {
      console.warn("No se pudo guardar la demo en este navegador", e);
    }
    listeners.forEach((fn) => fn());
  }, 0);
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isEmpty() {
  return Object.values(tables).every((rows) => rows.length === 0);
}

export function resetDemo() {
  localStorage.removeItem(KEY);
  tables = Object.fromEntries(Object.keys(MODELS).map((m) => [m, [] as Row[]]));
}

class PrismaError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

const isObj = (v: unknown): v is Args => !!v && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v);
const val = (v: unknown) => (v instanceof Date ? v.getTime() : v);
const eq = (a: unknown, b: unknown) => val(a ?? null) === val(b ?? null);

function scalarMatch(v: unknown, cond: unknown): boolean {
  if (!isObj(cond)) return eq(v, cond);
  for (const [op, arg] of Object.entries(cond)) {
    if (arg === undefined || op === "mode") continue;
    const a = val(v) as number;
    const b = val(arg) as number;
    const ok =
      op === "equals" ? eq(v, arg)
      : op === "in" ? (arg as unknown[]).some((x) => eq(v, x))
      : op === "notIn" ? !(arg as unknown[]).some((x) => eq(v, x))
      : op === "not" ? !scalarMatch(v, arg)
      : op === "lt" ? v != null && a < b
      : op === "lte" ? v != null && a <= b
      : op === "gt" ? v != null && a > b
      : op === "gte" ? v != null && a >= b
      : op === "contains" ? typeof v === "string" && v.includes(arg as string)
      : op === "startsWith" ? typeof v === "string" && v.startsWith(arg as string)
      : op === "endsWith" ? typeof v === "string" && v.endsWith(arg as string)
      : (() => { throw new Error(`Operador no soportado en la demo: ${op}`); })();
    if (!ok) return false;
  }
  return true;
}

function related(model: Model, row: Row, field: string): Row[] {
  const rel = model.fields[field].rel!;
  return tables[rel.target].filter((r) => r[rel.foreign] != null && eq(r[rel.foreign], row[rel.local]));
}

function expandWhere(model: Model, where: Args = {}): Args {
  const out: Args = {};
  for (const [k, v] of Object.entries(where)) {
    const compound = !model.fields[k] && model.uniques.find((u) => u.join("_") === k);
    if (compound && isObj(v)) Object.assign(out, v);
    else out[k] = v;
  }
  return out;
}

function matches(model: Model, row: Row, rawWhere: Args = {}): boolean {
  const where = expandWhere(model, rawWhere);
  for (const [k, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    if (k === "AND") {
      if (!(Array.isArray(cond) ? cond : [cond]).every((w) => matches(model, row, w))) return false;
      continue;
    }
    if (k === "OR") {
      if (!(cond as Args[]).some((w) => matches(model, row, w))) return false;
      continue;
    }
    if (k === "NOT") {
      if ((Array.isArray(cond) ? cond : [cond]).some((w) => matches(model, row, w))) return false;
      continue;
    }
    const f = model.fields[k];
    if (!f) throw new Error(`Campo desconocido en la demo: ${model.name}.${k}`);
    if (f.rel) {
      const target = MODELS[f.rel.target];
      const rows = related(model, row, k);
      if (f.rel.many) {
        if (cond.some && !rows.some((r) => matches(target, r, cond.some))) return false;
        if (cond.every && !rows.every((r) => matches(target, r, cond.every))) return false;
        if (cond.none && rows.some((r) => matches(target, r, cond.none))) return false;
        continue;
      }
      const one = rows[0];
      if (cond === null) {
        if (one) return false;
      } else if ("isNot" in cond) {
        if (cond.isNot === null ? !one : one && matches(target, one, cond.isNot)) return false;
      } else if ("is" in cond) {
        if (cond.is === null ? !!one : !one || !matches(target, one, cond.is)) return false;
      } else if (!one || !matches(target, one, cond)) return false;
      continue;
    }
    if (!scalarMatch(row[k], cond)) return false;
  }
  return true;
}

function sortRows(rows: Row[], orderBy?: Args | Args[]) {
  if (!orderBy) return rows;
  const keys = (Array.isArray(orderBy) ? orderBy : [orderBy]).flatMap((o) => Object.entries(o));
  return [...rows].sort((a, b) => {
    for (const [k, dir] of keys) {
      const x = val(a[k]) as number;
      const y = val(b[k]) as number;
      if (x === y) continue;
      const c = x == null ? -1 : y == null ? 1 : x < y ? -1 : 1;
      return dir === "desc" ? -c : c;
    }
    return 0;
  });
}

function project(model: Model, row: Row, args: Args = {}): Row {
  const out: Row = {};
  const relValue = (k: string, a: Args | true) => {
    const f = model.fields[k];
    const sub = a === true ? {} : a;
    const target = MODELS[f.rel!.target];
    let rows = related(model, row, k).filter((r) => matches(target, r, sub.where));
    if (!f.rel!.many) return rows[0] ? project(target, rows[0], sub) : null;
    rows = sortRows(rows, sub.orderBy);
    if (sub.skip) rows = rows.slice(sub.skip);
    if (sub.take != null) rows = rows.slice(0, sub.take);
    return rows.map((r) => project(target, r, sub));
  };
  if (args.select) {
    for (const [k, a] of Object.entries(args.select as Args)) {
      if (!a) continue;
      out[k] = model.fields[k]?.rel ? relValue(k, a) : row[k];
    }
    return out;
  }
  for (const f of Object.values(model.fields)) if (!f.rel) out[f.name] = row[f.name];
  for (const [k, a] of Object.entries((args.include ?? {}) as Args)) if (a) out[k] = relValue(k, a);
  return out;
}

function checkUnique(model: Model, row: Row) {
  const sets = [...Object.values(model.fields).filter((f) => f.unique).map((f) => [f.name]), ...model.uniques];
  for (const set of sets) {
    if (set.some((k) => row[k] == null)) continue;
    if (tables[model.name].some((r) => r !== row && set.every((k) => eq(r[k], row[k]))))
      throw new PrismaError(`Unique constraint failed on ${model.name}(${set.join(", ")})`, "P2002");
  }
}

function applyData(model: Model, row: Row, data: Args) {
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    const f = model.fields[k];
    if (!f) throw new Error(`Campo desconocido en la demo: ${model.name}.${k}`);
    if (f.rel) throw new Error(`Escritura anidada en update no soportada en la demo: ${model.name}.${k}`);
    if (isObj(v)) {
      const cur = (row[k] as number) ?? 0;
      row[k] = "increment" in v ? cur + v.increment : "decrement" in v ? cur - v.decrement : "multiply" in v ? cur * v.multiply : v.set;
    } else row[k] = v;
  }
  for (const f of Object.values(model.fields)) if (f.updatedAt) row[f.name] = new Date();
}

function insert(model: Model, data: Args): Row {
  const row: Row = {};
  const nested: [Field, Args][] = [];
  for (const f of Object.values(model.fields)) {
    if (f.rel) {
      if (data[f.name] !== undefined) nested.push([f, data[f.name]]);
      continue;
    }
    if (data[f.name] !== undefined) row[f.name] = data[f.name];
    else if (f.def) row[f.name] = f.def();
    else if (f.updatedAt) row[f.name] = new Date();
    else if (f.list) row[f.name] = [];
    else row[f.name] = null;
  }
  // Primero los "padres" (llave foránea en esta fila), luego insertar, luego los "hijos".
  for (const [f, w] of nested) {
    if (!f.relFields) continue;
    const target = MODELS[f.rel!.target];
    const parent = w.create ? insert(target, w.create) : w.connect ? tables[target.name].find((r) => matches(target, r, w.connect)) : null;
    if (!parent) throw new PrismaError(`Registro relacionado no encontrado: ${f.name}`, "P2025");
    row[f.rel!.local] = parent[f.rel!.foreign];
  }
  checkUnique(model, row);
  tables[model.name].push(row);
  for (const [f, w] of nested) {
    if (f.relFields) continue;
    const target = MODELS[f.rel!.target];
    const items = w.create ? (Array.isArray(w.create) ? w.create : [w.create]) : w.createMany ? w.createMany.data : [];
    for (const item of items) insert(target, { ...item, [f.rel!.foreign]: row[f.rel!.local] });
  }
  return row;
}

function delegate(model: Model) {
  const all = () => tables[model.name];
  const findAll = (args: Args = {}) => {
    let rows = sortRows(all().filter((r) => matches(model, r, args.where)), args.orderBy);
    if (args.distinct) {
      const seen = new Set<string>();
      rows = rows.filter((r) => {
        const key = JSON.stringify((args.distinct as string[]).map((k) => val(r[k])));
        return seen.has(key) ? false : (seen.add(key), true);
      });
    }
    if (args.skip) rows = rows.slice(args.skip);
    if (args.take != null) rows = rows.slice(0, args.take);
    return rows;
  };
  const one = (args: Args) => all().find((r) => matches(model, r, args.where)) ?? null;
  const orThrow = (row: Row | null) => {
    if (!row) throw new PrismaError(`No ${model.name} found`, "P2025");
    return row;
  };
  const write = <T>(fn: () => T): T => {
    const out = fn();
    changed();
    return out;
  };
  return {
    findMany: async (a: Args = {}) => findAll(a).map((r) => project(model, r, a)),
    findFirst: async (a: Args = {}) => {
      const r = findAll({ ...a, take: 1 })[0];
      return r ? project(model, r, a) : null;
    },
    findFirstOrThrow: async (a: Args = {}) => project(model, orThrow(findAll({ ...a, take: 1 })[0] ?? null), a),
    findUnique: async (a: Args) => {
      const r = one(a);
      return r ? project(model, r, a) : null;
    },
    findUniqueOrThrow: async (a: Args) => project(model, orThrow(one(a)), a),
    count: async (a: Args = {}) => findAll(a).length,
    groupBy: async (a: Args) => {
      const groups = new Map<string, Row[]>();
      for (const r of findAll(a)) {
        const key = JSON.stringify((a.by as string[]).map((k) => val(r[k])));
        groups.set(key, [...(groups.get(key) ?? []), r]);
      }
      return [...groups.values()].map((rows) => ({
        ...Object.fromEntries((a.by as string[]).map((k) => [k, rows[0][k]])),
        ...(a._count ? { _count: rows.length } : {}),
      }));
    },
    create: async (a: Args) => write(() => project(model, insert(model, a.data), a)),
    createMany: async (a: Args) => write(() => ({ count: (a.data as Args[]).map((d) => insert(model, d)).length })),
    update: async (a: Args) =>
      write(() => {
        const row = orThrow(one(a));
        applyData(model, row, a.data);
        checkUnique(model, row);
        return project(model, row, a);
      }),
    updateMany: async (a: Args) =>
      write(() => {
        const rows = all().filter((r) => matches(model, r, a.where));
        rows.forEach((r) => applyData(model, r, a.data));
        return { count: rows.length };
      }),
    upsert: async (a: Args) =>
      write(() => {
        const row = one(a);
        if (!row) return project(model, insert(model, a.create), a);
        applyData(model, row, a.update);
        return project(model, row, a);
      }),
    delete: async (a: Args) =>
      write(() => {
        const row = orThrow(one(a));
        tables[model.name] = all().filter((r) => r !== row);
        return project(model, row);
      }),
    deleteMany: async (a: Args = {}) =>
      write(() => {
        const before = all().length;
        tables[model.name] = all().filter((r) => !matches(model, r, a.where));
        return { count: before - tables[model.name].length };
      }),
  };
}

export class PrismaClient {
  [model: string]: unknown;
  constructor() {
    for (const model of Object.values(MODELS)) this[model.name[0].toLowerCase() + model.name.slice(1)] = delegate(model);
  }
  async $transaction(arg: unknown) {
    if (Array.isArray(arg)) return Promise.all(arg);
    // Atomicidad: si la función lanza, se restaura el estado previo.
    const snapshot = structuredClone(tables);
    try {
      return await (arg as (tx: this) => Promise<unknown>)(this);
    } catch (e) {
      tables = snapshot;
      throw e;
    }
  }
  async $disconnect() {}
}

export const Prisma = {};
