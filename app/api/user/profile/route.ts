import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getUserProfile, refreshAccessToken } from '@/lib/spotifyAuth';

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  let accessToken = cookieStore.get('spotify_access_token')?.value;
  const refreshToken = cookieStore.get('spotify_refresh_token')?.value;

  if (!accessToken) {
    console.log("[API /user/profile] No access token cookie found.");
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Get client ID for potential refresh
  const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
  if (!clientId) {
    console.error("[API /user/profile] Missing Spotify Client ID env var for potential token refresh.");
    return NextResponse.json({ error: 'Internal server configuration error.' }, { status: 500 });
  }

  try {
    console.log("[API /user/profile] Attempting to fetch user profile.");
    const userProfile = await getUserProfile(accessToken);
    // Successfully fetched profile with existing token
    console.log("[API /user/profile] Fetched profile with existing token.");
    return NextResponse.json(userProfile);
  } catch (error: any) {
    console.warn("[API /user/profile] Initial fetch failed, checking for 401:", error.message);
    // Check if the error indicates an expired token (401)
    let isAuthError = false;
    // Check for specific Spotify error format or general 401 in message
    if (error.message?.includes('(Status: 401)') || / 401 /.test(error.message)) {
        isAuthError = true;
    }

    if (isAuthError) {
        console.log("[API /user/profile] Detected 401, attempting token refresh...");
        if (!refreshToken) {
            console.log("[API /user/profile] No refresh token found.");
            // Clear invalid access token if refresh token is missing
            cookieStore.delete('spotify_access_token');
            return NextResponse.json({ error: 'Authentication required. Please log in again.' }, { status: 401 });
        }

        try {
            const refreshedTokenData = await refreshAccessToken(refreshToken, clientId);

            if (refreshedTokenData && refreshedTokenData.access_token) {
                console.log("[API /user/profile] Token refreshed. Retrying profile fetch.");
                accessToken = refreshedTokenData.access_token; // Use the new token
                const maxAge = refreshedTokenData.expires_in;
                const secure = process.env.NODE_ENV === 'production';

                // Update the access token cookie
                cookieStore.set('spotify_access_token', accessToken, {
                    httpOnly: true,
                    secure: secure,
                    maxAge: maxAge,
                    path: '/',
                    sameSite: 'lax',
                });

                // Retry fetching the profile with the new token
                const userProfile = await getUserProfile(accessToken);
                console.log("[API /user/profile] Fetched profile after token refresh.");
                return NextResponse.json(userProfile);
            } else {
                console.error("[API /user/profile] Token refresh failed.");
                // Clear tokens if refresh failed
                cookieStore.delete('spotify_access_token');
                cookieStore.delete('spotify_refresh_token');
                return NextResponse.json({ error: 'Authentication session expired. Please log in again.' }, { status: 401 });
            }
        } catch (refreshError: any) {
             console.error("[API /user/profile] Error during token refresh or retry:", refreshError);
             // Clear tokens on any error during refresh/retry
             cookieStore.delete('spotify_access_token');
             cookieStore.delete('spotify_refresh_token');
             const status = refreshError.message?.includes('401') ? 401 : 500;
             return NextResponse.json({ error: 'Failed to refresh session', details: refreshError.message }, { status });
        }
    } else {
      // If the error was not 401, handle it as a general failure
      console.error("[API /user/profile] Non-401 error during profile fetch:", error);
      return NextResponse.json({ error: 'Failed to fetch user profile', details: error.message }, { status: 500 });
    }
  }
}