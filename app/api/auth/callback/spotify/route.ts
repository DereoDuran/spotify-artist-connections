import { type NextRequest, NextResponse } from 'next/server';
import { getToken } from '@/lib/spotifyAuth';
import { cookies } from 'next/headers';

// Ensure environment variables are defined
const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
const redirectUri = process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI;
const cookieSecret = process.env.COOKIE_SECRET; // For signing cookies (RECOMMENDED)

if (!clientId || !redirectUri) {
  throw new Error('Missing Spotify environment variables: NEXT_PUBLIC_SPOTIFY_CLIENT_ID or NEXT_PUBLIC_SPOTIFY_REDIRECT_URI');
}

export async function GET(request: NextRequest) {
  const cookieStore = cookies();
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const state = searchParams.get('state'); // Optional: Get state if you used it
  const storedVerifier = cookieStore.get('spotify_code_verifier')?.value;
  const storedState = cookieStore.get('spotify_auth_state')?.value; // Optional: Get state cookie if you used it

  // Clear the state and verifier cookies immediately after retrieving them
  cookieStore.delete('spotify_code_verifier');
  cookieStore.delete('spotify_auth_state'); // Optional: Clear state cookie

  // Optional: Validate state parameter for CSRF protection
  // if (!state || !storedState || state !== storedState) {
  //   console.error('State mismatch error', { state, storedState });
  //   return NextResponse.redirect(new URL('/login?error=state_mismatch', request.url));
  // }

  if (error) {
    console.error("Spotify Auth Callback Error:", error);
    // Redirect to login with error message
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, request.url));
  }

  if (!code) {
    console.error("Missing authorization code in Spotify callback");
    return NextResponse.redirect(new URL('/login?error=missing_code', request.url));
  }

  if (!storedVerifier) {
    console.error("Missing code verifier cookie");
    return NextResponse.redirect(new URL('/login?error=missing_verifier', request.url));
  }

  try {
    const tokenData = await getToken(code, storedVerifier, clientId!, redirectUri!);

    if (tokenData.access_token) {
      const maxAge = tokenData.expires_in; // Use expires_in directly for cookie maxAge
      const secure = process.env.NODE_ENV === 'production'; // Use secure cookies in production

      // Set tokens in secure, HttpOnly cookies
      cookieStore.set('spotify_access_token', tokenData.access_token, {
        httpOnly: true,
        secure: secure,
        maxAge: maxAge,
        path: '/',
        sameSite: 'lax', // Or 'strict' if appropriate
        // domain: 'yourdomain.com' // Optional: Set domain for production
      });

      if (tokenData.refresh_token) {
        cookieStore.set('spotify_refresh_token', tokenData.refresh_token, {
          httpOnly: true,
          secure: secure,
          path: '/',
          sameSite: 'lax',
          // domain: 'yourdomain.com' // Optional: Set domain for production
          // No maxAge here, refresh tokens are typically longer-lived or persistent
        });
      }

      // Redirect to the search page upon successful authentication
      return NextResponse.redirect(new URL('/search', request.url));
    } else {
      console.error("Failed to retrieve access token from Spotify:", tokenData);
      return NextResponse.redirect(new URL('/login?error=token_exchange_failed', request.url));
    }
  } catch (err) {
    console.error("Error during token exchange:", err);
    const errorMessage = err instanceof Error ? err.message : 'unknown_error';
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(errorMessage)}`, request.url));
  }
}