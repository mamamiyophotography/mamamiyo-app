// Deliberately NOT wired to Twilio yet — this app is launching email-only
// while the WhatsApp Business Platform application is pending Meta approval
// (see mamamiyo-backend-technical-scope.md). This stub keeps the same
// function signature the real implementation will use, so every caller
// (notify.ts) already works correctly today and needs zero changes once
// WhatsApp is ready — only this one file gets filled in.
//
// TO ACTIVATE LATER: once TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN /
// TWILIO_WHATSAPP_FROM are set (see .env.example), replace the body below
// with a real Twilio client call, e.g.:
//
//   import twilio from 'twilio';
//   const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
//   await client.messages.create({
//     from: process.env.TWILIO_WHATSAPP_FROM,
//     to: `whatsapp:${toPhoneE164}`,
//     body,
//   });

export async function sendWhatsApp(toPhoneE164: string, body: string): Promise<void> {
  if (!process.env.TWILIO_ACCOUNT_SID) {
    // Expected while WhatsApp isn't wired up yet — not an error.
    console.log(`[WhatsApp not yet active] Would have sent to ${toPhoneE164}:\n${body}\n`);
    return;
  }
  throw new Error(
    'Twilio credentials are set but sendWhatsApp() is still a stub — implement the real Twilio call here (see the comment at the top of this file).'
  );
}
