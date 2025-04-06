import { NextResponse } from 'next/server';
// Import the user-specific functions from the refactored library
import {
    getUserProfile,
    createUserPlaylist,
    addTracksToUserPlaylist
} from '../../../lib/spotify';
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

  try {
    // No need to call getSpotifyClient anymore, use functions directly with user token
    console.log("[API /create-playlist] Using user access token for Spotify API calls.");

    // 1. Get the current user's ID using their token
    const userProfile = await getUserProfile(userAccessToken);
    const userId = userProfile.id;
    console.log(`[API /create-playlist] Fetched user ID: ${userId}`);

    // 2. Create the playlist using their token
    const playlistDetails = {
        name: playlistName,
        description: description || `Created from Artist Graph (${new Date().toLocaleDateString()})`, // Improved default description
        public: false, // Default to private
    };
    const newPlaylist = await createUserPlaylist(userAccessToken, userId, playlistDetails);
    const playlistId = newPlaylist.id;
    const playlistUrl = newPlaylist.external_urls?.spotify;
    console.log(`[API /create-playlist] Created playlist ID: ${playlistId}, URL: ${playlistUrl}`);

    // 3. Add tracks to the playlist (chunking handled here)
    const MAX_TRACKS_PER_REQUEST = 100;
    for (let i = 0; i < trackUris.length; i += MAX_TRACKS_PER_REQUEST) {
        const chunk = trackUris.slice(i, i + MAX_TRACKS_PER_REQUEST);
        await addTracksToUserPlaylist(userAccessToken, playlistId, chunk);
        console.log(`[API /create-playlist] Added batch of ${chunk.length} tracks to playlist ${playlistId}`);
    }

    console.log(`[API /create-playlist] Successfully added ${trackUris.length} tracks to playlist ${playlistId}`);

    // 4. Return the new playlist URL
    return NextResponse.json({ playlistUrl: playlistUrl || null }); // Return URL or null if somehow missing

  } catch (error: any) {
    console.error("[API /create-playlist] Error during playlist creation:", error);
    // Attempt to extract a meaningful error message
    let errorMessage = 'Failed to create playlist';
    let status = 500;

    // Check if it's an error thrown by our user API request function
    if (error.message.startsWith('Spotify API Error:')) {
        errorMessage = error.message;
        // Extract status from the message if possible, e.g., "Spotify API Error: ... (Status: 403)"
        const statusMatch = error.message.match(/\(Status:\s*(\d+)\)$/);
        if (statusMatch && statusMatch[1]) {
            status = parseInt(statusMatch[1], 10);
        } else {
             // Default to 500 if status cannot be parsed from message
             status = (error as any).status || 500; // Or use a custom status property if added
        }
    } else if (error.message) {
        errorMessage = error.message;
    }

    // Customize messages for common auth errors
    if (status === 401) {
        errorMessage = 'Spotify authentication invalid or expired. Please log in again.';
    } else if (status === 403) {
        errorMessage = 'Permission denied by Spotify. Ensure the app has the necessary permissions (playlist-modify-private).';
    }

    return NextResponse.json({ error: errorMessage }, { status });
  }
}