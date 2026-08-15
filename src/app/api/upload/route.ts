import { NextRequest, NextResponse } from 'next/server';
import { uploadReferencePhoto } from '@/lib/storage';

const MAX_FILES = 5;
const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8MB per file

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const files = formData.getAll('files').filter((f): f is File => f instanceof File);

  if (!files.length) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Up to ${MAX_FILES} photos only` }, { status: 400 });
  }
  for (const f of files) {
    if (!f.type.startsWith('image/')) {
      return NextResponse.json({ error: `${f.name} is not an image` }, { status: 400 });
    }
    if (f.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: `${f.name} is larger than 8MB` }, { status: 400 });
    }
  }

  try {
    const urls = await Promise.all(files.map((f) => uploadReferencePhoto(f)));
    return NextResponse.json({ urls });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
