// Uploads reference photos to Supabase Storage. UNLIKE everything else in
// this codebase, this file has NOT been executed/verified here — this
// sandbox has no network path to Supabase at all (unlike Resend/Twilio,
// which were at least reachable in principle; Supabase isn't in the
// network allowlist either). It's written carefully against Supabase's
// documented SDK patterns, but treat it as unverified until a real
// smoke test is run against an actual Supabase project — upload one real
// file through /api/upload and confirm the returned URL actually loads.

import { createClient } from '@supabase/supabase-js';

let client: ReturnType<typeof createClient> | null = null;
function getClient() {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
    }
    // Service role key (server-side only, never exposed to the browser) —
    // needed to write to storage from an API route without a logged-in user.
    client = createClient(url, key);
  }
  return client;
}

const BUCKET = 'reference-photos';

export async function uploadReferencePhoto(file: File): Promise<string> {
  const supabase = getClient();
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'image/jpeg',
    upsert: false,
  });
  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
