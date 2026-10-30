// Sends email through Resend's REST API. Without RESEND_API_KEY (local dev) it logs the
// message instead, so sign-in links can be copied from the server log.
const FROM = process.env.MAIL_FROM ?? "Baby weight <signin@salundo.com>";

export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[mail] to=${to} subject=${subject}\n${text}`);
    return true;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject, text }),
  });
  if (!res.ok) console.error(`[mail] Resend ${res.status}: ${await res.text()}`);
  return res.ok;
}
