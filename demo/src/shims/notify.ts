// SMS simulados: en vez de enviarse, aparecen como avisos en la pantalla de la demo.
export type Sms = { id: number; phone: string; text: string; at: Date };
export const smsLog: Sms[] = [];
let next = 1;

export async function sendSms(phone: string, text: string): Promise<void> {
  smsLog.unshift({ id: next++, phone, text, at: new Date() });
  window.dispatchEvent(new Event("llave:sms"));
}
