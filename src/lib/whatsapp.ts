const WHAPI_TEXT_ENDPOINT = 'https://gate.whapi.cloud/messages/text';

function whapiRecipient(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) {
    throw new Error('WhatsApp recipient must be an international phone number.');
  }
  return digits;
}

export async function sendWhatsApp(toPhoneE164: string, body: string): Promise<void> {
  const token = process.env.WHAPI_TOKEN?.trim();
  if (!body.trim()) return;
  let whapiError = '';

  if (token) {
    const response = await fetch(WHAPI_TEXT_ENDPOINT, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        to: whapiRecipient(toPhoneE164),
        body,
        no_link_preview: false,
      }),
    });
    if (response.ok) return;
    whapiError = `Whapi.Cloud rejected the WhatsApp alert (${response.status}): ${(await response.text()).slice(0, 500)}`;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const configuredFrom = process.env.TWILIO_WHATSAPP_FROM?.trim();
  if (accountSid && authToken && configuredFrom) {
    const from = configuredFrom.startsWith('whatsapp:') ? configuredFrom : `whatsapp:${configuredFrom}`;
    const to = `whatsapp:+${whapiRecipient(toPhoneE164)}`;
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({From:from,To:to,Body:body}),
    });
    if (response.ok) return;
    throw new Error(`Twilio rejected the WhatsApp alert (${response.status}): ${(await response.text()).slice(0, 500)}${whapiError ? `; ${whapiError}` : ''}`);
  }
  if (whapiError) throw new Error(whapiError);
  throw new Error('No WhatsApp notification channel is configured.');
}

export async function sendWhatsAppImage(toPhoneE164: string, imageUrl: string, caption: string): Promise<void> {
  const token = process.env.WHAPI_TOKEN?.trim();
  if (!token || !caption.trim()) return;
  const response = await fetch('https://gate.whapi.cloud/messages/image', {
    method: 'POST',
    headers: { accept: 'application/json', authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ to: whapiRecipient(toPhoneE164), media: imageUrl, caption, view_once: false }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Whapi.Cloud rejected the WhatsApp image (${response.status}): ${detail}`);
  }
}
