// next/cache y next/headers: en la demo la página se vuelve a pintar sola tras cada cambio.
export function revalidatePath() {}
export async function headers() {
  return new Headers();
}
export async function cookies() {
  return { get: () => undefined, set: () => {}, delete: () => {} };
}
