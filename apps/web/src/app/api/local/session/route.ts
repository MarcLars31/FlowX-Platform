import { NextResponse } from 'next/server';
import { localPlatformEnabled } from '@/lib/local-platform';
import { saveAuthSession, signInWithPassword } from '@/lib/supabase-auth';
import { cookies } from 'next/headers';
import { ORGANIZATION_COOKIE } from '@/lib/organization-context';

export async function POST(request: Request) {
  if (!localPlatformEnabled(process.env, request.headers.get('host'))) return new NextResponse(null, { status: 404 });
  const origin = request.headers.get('origin');
  if (origin !== `http://${request.headers.get('host')}`) return new NextResponse(null, { status: 403 });
  const view = (await request.formData()).get('view');
  if (view !== 'customer' && view !== 'admin') return new NextResponse(null, { status: 400 });
  const email = view === 'admin' ? 'admin@scipx.local' : 'utveckling@scipx.local';
  await saveAuthSession(await signInWithPassword(email, process.env.SCIPX_LOCAL_PASSWORD!));
  (await cookies()).delete(ORGANIZATION_COOKIE);
  return NextResponse.redirect(new URL(view === 'admin' ? '/admin' : '/dashboard', `http://${request.headers.get('host')}`), 303);
}
