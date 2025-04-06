import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getUserProfile } from '@/lib/spotifyAuth';

export async function GET(request: NextRequest) {
  const cookieStore = cookies();
  const accessToken = cookieStore.get('spotify_access_token')?.value;

  if (!accessToken) {
    // No access token found, user is likely not logged in or token expired
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const userProfile = await getUserProfile(accessToken);
    // Successfully fetched profile
    return NextResponse.json(userProfile);
  } catch (error: any) {
    console.error("API Error fetching user profile:", error);
    // Handle potential errors from getUserProfile, e.g., expired token (401)
    const status = error.message?.includes('401') ? 401 : 500;
    return NextResponse.json({ error: 'Failed to fetch user profile', details: error.message }, { status });
  }
}