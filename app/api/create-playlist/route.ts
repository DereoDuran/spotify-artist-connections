import { NextResponse } from 'next/server';
// Import the user-specific functions from the refactored library
import {
    getUserProfile,
    createUserPlaylist,
    addTracksToUserPlaylist
} from '../../../lib/spotify';
// Import the refresh function
import { refreshAccessToken } from '../../../lib/spotifyAuth';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

// Define expected request body structure
interface CreatePlaylistRequestBody {
  playlistName: string;
  trackUris: string[];
  description?: string; // Optional description
}

export async function POST(request: NextRequest) {
  console.log("[API /create-playlist] Received request");

  const cookieStore = await cookies();
  const userAccessToken = cookieStore.get('spotify_access_token')?.value;

  if (!userAccessToken) {
    console.log("[API /create-playlist] User access token not found in cookies.");
    return NextResponse.json({ error: 'Spotify authentication required. Please login.' }, { status: 401 });
  }

  let requestBody: CreatePlaylistRequestBody;
  try {
    requestBody = await request.json();
  } catch (error) {
    console.error("[API /create-playlist] Error parsing request body:", error);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { playlistName, trackUris, description } = requestBody;

  if (!playlistName || !trackUris || !Array.isArray(trackUris) || trackUris.length === 0) {
    console.log("[API /create-playlist] Missing required fields:", { playlistName, trackUris });
    return NextResponse.json({ error: 'Missing playlistName or trackUris (must be a non-empty array)' }, { status: 400 });
  }

  // Validate track URIs (basic check)
  if (!trackUris.every(uri => typeof uri === 'string' && uri.startsWith('spotify:track:'))) {
      console.log("[API /create-playlist] Invalid track URIs found:", trackUris);
      return NextResponse.json({ error: 'Invalid track URIs provided. Ensure they start with "spotify:track:"' }, { status: 400 });
  }

  // Get client ID for potential refresh
  const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
  if (!clientId) {
    console.error("[API /create-playlist] Missing Spotify Client ID env var for potential token refresh.");
    // Note: This is an internal server error, shouldn't happen if configured
    return NextResponse.json({ error: 'Internal server configuration error.' }, { status: 500 });
  }

  let currentAccessToken = userAccessToken; // Use a mutable variable for token

  // Function to wrap Spotify calls and handle token refresh
  const callSpotifyWithRefresh = async <T>(spotifyCall: (token: string) => Promise<T>): Promise<T> => {
    try {
        return await spotifyCall(currentAccessToken);
    } catch (error: any) {
        console.warn("[API /create-playlist] Initial Spotify call failed, checking for 401:", error.message);
        // Check if the error indicates an expired token (typically 401)
        let isAuthError = false;
        // Check for specific Spotify error format or general 401 in message
        if (error.message?.includes('(Status: 401)') || /401/.test(error.message)) {
            isAuthError = true;
        }
        // Add more specific checks if the error structure varies

        if (isAuthError) {
            console.log("[API /create-playlist] Detected 401 error, attempting token refresh...");
            const refreshToken = cookieStore.get('spotify_refresh_token')?.value;
            if (!refreshToken) {
                console.log("[API /create-playlist] No refresh token found, cannot refresh.");
                throw new Error('Authentication required. Please log in again.'); // Rethrow specific error for client
            }

            const refreshedTokenData = await refreshAccessToken(refreshToken, clientId);

            if (refreshedTokenData && refreshedTokenData.access_token) {
                console.log("[API /create-playlist] Token refreshed successfully. Retrying original call.");
                currentAccessToken = refreshedTokenData.access_token;
                const maxAge = refreshedTokenData.expires_in;
                const secure = process.env.NODE_ENV === 'production';

                // Update the access token cookie
                cookieStore.set('spotify_access_token', currentAccessToken, {
                    httpOnly: true,
                    secure: secure,
                    maxAge: maxAge,
                    path: '/',
                    sameSite: 'lax',
                });
                // Note: We are not updating the refresh token here for simplicity,
                // assuming the original one is still valid or Spotify didn't return a new one.

                // Retry the original Spotify call with the new token
                return await spotifyCall(currentAccessToken);
            } else {
                console.error("[API /create-playlist] Token refresh failed.");
                // Clear potentially invalid tokens if refresh fails
                cookieStore.delete('spotify_access_token');
                cookieStore.delete('spotify_refresh_token');
                throw new Error('Authentication session expired. Please log in again.');
            }
        } else {
            // If it wasn't a 401 error, just rethrow the original error
            console.log("[API /create-playlist] Error was not 401, rethrowing.");
            throw error;
        }
    }
  };

  try {
    console.log("[API /create-playlist] Attempting Spotify API calls with refresh logic.");

    // 1. Get the current user's ID (wrapped)
    const userProfile = await callSpotifyWithRefresh(token => getUserProfile(token));
    const userId = userProfile.id;
    console.log(`[API /create-playlist] Fetched user ID: ${userId}`);

    // 2. Create the playlist (wrapped)
    const playlistDetails = {
        name: playlistName,
        description: description || `Created from Artist Graph (${new Date().toLocaleDateString()})`,
        public: false,
    };
    const newPlaylist = await callSpotifyWithRefresh(token => createUserPlaylist(token, userId, playlistDetails));
    const playlistId = newPlaylist.id;
    const playlistUrl = newPlaylist.external_urls?.spotify;
    console.log(`[API /create-playlist] Created playlist ID: ${playlistId}, URL: ${playlistUrl}`);

    // 3. Add tracks to the playlist (wrapped, inside loop)
    const MAX_TRACKS_PER_REQUEST = 100;
    for (let i = 0; i < trackUris.length; i += MAX_TRACKS_PER_REQUEST) {
        const chunk = trackUris.slice(i, i + MAX_TRACKS_PER_REQUEST);
        await callSpotifyWithRefresh(token => addTracksToUserPlaylist(token, playlistId, chunk));
        console.log(`[API /create-playlist] Added batch of ${chunk.length} tracks to playlist ${playlistId}`);
    }

    console.log(`[API /create-playlist] Successfully added ${trackUris.length} tracks to playlist ${playlistId}`);

    // 4. Return the new playlist URL
    return NextResponse.json({ playlistUrl: playlistUrl || null });

  } catch (error: any) {
    // Simplified error handling - the wrapper function throws more specific errors now
    console.error("[API /create-playlist] Final error catch:", error);
    let errorMessage = error.message || 'Failed to create playlist';
    let status = 500;

    // Set status based on specific error messages from the wrapper or Spotify
    if (error.message?.includes('Authentication required') || error.message?.includes('Authentication session expired')) {
        status = 401;
        // Clear cookies on final auth failure
        cookieStore.delete('spotify_access_token');
        cookieStore.delete('spotify_refresh_token');
    } else if (error.message?.includes('(Status: 403)') || error.message?.includes('Permission denied')) {
        status = 403;
        errorMessage = 'Permission denied by Spotify. Ensure the app has the necessary permissions (playlist-modify-private).';
    } else if (error.message?.includes('Failed to fetch user profile')) { // Example check
        // Handle specific non-auth errors if needed
        status = 502; // Bad Gateway? Or specific status from error
        errorMessage = 'Could not communicate with Spotify to get user profile.';
    }

    return NextResponse.json({ error: errorMessage }, { status });
  }
}