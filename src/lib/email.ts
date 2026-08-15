import { Resend } from 'resend';

let client: Resend | null = null;
function getClient(): Resend {
  if (!client) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not set — add it to .env (see .env.example).');
    }
    client = new Resend(process.env.RESEND_API_KEY);
  }
  return client;
}

export async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  // Useful for local/staging work (and for automated tests) without
  // actually sending real email or needing live Resend credentials.
  if (process.env.DRY_RUN_NOTIFICATIONS === 'true') {
    console.log(`[DRY RUN] Email to ${to}\nSubject: ${subject}\n${body}\n`);
    return;
  }
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error('RESEND_FROM_EMAIL is not set — add it to .env (see .env.example).');
  const { error } = await getClient().emails.send({
    from,
    to,
    subject,
    text: body,
  });
  if (error) {
    throw new Error(`Resend failed to send to ${to}: ${error.message}`);
  }
}
