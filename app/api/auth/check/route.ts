import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('spotify_access_token')?.value;

  if (!accessToken) {
    return NextResponse.json({ authenticated: false });
  }

  // Optional: You could also validate the token by making a request to Spotify
  // This simple check just verifies the token exists
  return NextResponse.json({ authenticated: true });
}