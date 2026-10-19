// shortcut: los SMS se escriben en la consola del servidor; conectar un proveedor (Twilio, Infobip, etc.) antes de lanzar.
export async function sendSms(phone: string, text: string): Promise<void> {
  console.log(`[SMS → ${phone.slice(0, 6)}***] ${text}`);
}
