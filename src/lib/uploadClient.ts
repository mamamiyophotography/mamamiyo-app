// Client-side direct upload to Supabase Storage — bypasses Vercel's 4.5MB
// request body limit entirely since the file goes directly from the browser
// to Supabase, never through Vercel's serverless functions.

import { createClient } from '@supabase/supabase-js';

const BUCKET = 'reference-photos';

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env vars not set');
  return createClient(url, key);
}

export async function uploadPhotoFromBrowser(file: File): Promise<string> {
  const supabase = getClient();
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'image/jpeg',
    upsert: false,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
