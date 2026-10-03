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
  if (!token || !body.trim()) return;

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

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Whapi.Cloud rejected the WhatsApp alert (${response.status}): ${detail}`);
  }
}
