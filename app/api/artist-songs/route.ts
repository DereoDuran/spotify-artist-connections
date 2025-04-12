import { NextResponse } from 'next/server';
// Remove getSpotifyClient import
// import { getSpotifyClient } from '../../../lib/spotify'; // Use relative path
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
// Import refresh logic and potentially user profile if needed
import { refreshAccessToken } from '../../../lib/spotifyAuth';
// Import types if needed, or define locally
// Define the structure for a simplified Spotify Track (matching frontend)
interface SpotifyTrack {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: { name: string; images?: { url: string }[] };
  uri: string;
  popularity?: number; // Keep popularity
}

// Define structure for top tracks response item
interface SpotifyTopTrackItem {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: { id: string; name: string; images?: { url: string }[] };
  uri: string;
  popularity: number;
}
// --- End Type Definitions ---

export async function GET(request: NextRequest) { // Changed Request to NextRequest
  const { searchParams } = new URL(request.url);
  const artistId = searchParams.get('artistId');
  const artistName = searchParams.get('artistName'); // Keep for logging

  if (!artistId || !artistName) {
    return NextResponse.json({ error: 'Artist ID and Artist Name are required' }, { status: 400 });
  }

  console.log(`[API /artist-songs] Request received for ${artistName} (ID: ${artistId})`);

  const cookieStore = await cookies();
  const userAccessToken = cookieStore.get('spotify_access_token')?.value;

  if (!userAccessToken) {
    console.log("[API /artist-songs] User access token not found in cookies.");
    // For fetching public artist songs, we *could* fall back to client credentials
    // but for consistency with user-centric features, let's require login for now.
    return NextResponse.json({ error: 'Spotify authentication required. Please login.' }, { status: 401 });
  }

  // Get client ID for potential refresh
  const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
  if (!clientId) {
    console.error("[API /artist-songs] Missing Spotify Client ID env var for potential token refresh.");
    return NextResponse.json({ error: 'Internal server configuration error.' }, { status: 500 });
  }

  let currentAccessToken = userAccessToken; // Use a mutable variable for token

  // --- Start: Token Refresh Wrapper ---
  // (Copied and adapted from create-playlist route)
  const callSpotifyWithRefresh = async <T>(
      apiCallFunction: (token: string) => Promise<Response> // Expect a function that returns a Fetch Response
  ): Promise<T> => {
      let response = await apiCallFunction(currentAccessToken);

      if (response.status === 401) {
          console.log("[API /artist-songs] Detected 401 error, attempting token refresh...");
          const refreshToken = cookieStore.get('spotify_refresh_token')?.value;
          if (!refreshToken) {
              console.log("[API /artist-songs] No refresh token found, cannot refresh.");
              cookieStore.delete('spotify_access_token'); // Clear invalid token
              throw new Error('Authentication required. Please log in again.'); // Rethrow specific error for client
          }

          try {
                const refreshedTokenData = await refreshAccessToken(refreshToken, clientId);

                if (refreshedTokenData && refreshedTokenData.access_token) {
                    console.log("[API /artist-songs] Token refreshed successfully. Retrying original call.");
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

                    // Retry the original Spotify call with the new token
                    response = await apiCallFunction(currentAccessToken);

                } else {
                    console.error("[API /artist-songs] Token refresh failed (no new token data).");
                    // Clear potentially invalid tokens if refresh fails
                    cookieStore.delete('spotify_access_token');
                    cookieStore.delete('spotify_refresh_token');
                    throw new Error('Authentication session expired. Please log in again.');
                }
            } catch (refreshError: any) {
                console.error("[API /artist-songs] Exception during token refresh:", refreshError);
                // Clear potentially invalid tokens on refresh error
                cookieStore.delete('spotify_access_token');
                cookieStore.delete('spotify_refresh_token');
                // Throw a generic error or rethrow the specific one
                throw new Error(`Failed to refresh session: ${refreshError.message || 'Unknown error'}`);
            }
      }

      // After potential refresh and retry, check the final response status
      if (!response.ok) {
          const errorBody = await response.text();
          console.error(`[API /artist-songs] Spotify API call failed with status ${response.status}:`, errorBody);
          let errorMessage = `Spotify API Error (Status: ${response.status})`;
          try {
              const errorJson = JSON.parse(errorBody);
              if (errorJson.error?.message) {
                  errorMessage = `Spotify API Error: ${errorJson.error.message} (Status: ${response.status})`;
              }
          } catch (e) { /* ignore parsing error */ }
          // Throw an error that includes the status code
          const error = new Error(errorMessage) as any;
          error.status = response.status; // Attach status for better handling later
          throw error;
      }

      // If response is OK, parse and return JSON
      return (await response.json()) as T;
  };
  // --- End: Token Refresh Wrapper ---

  // --- Helper Function to Fetch Paginated Spotify Data --- (Can be extracted later)
  async function fetchAllPaginatedItems<ItemType>(initialUrl: string, token: string): Promise<ItemType[]> {
      let items: ItemType[] = [];
      let nextUrl: string | null = initialUrl;

      while (nextUrl) {
          console.log(`[fetchAllPaginatedItems] Fetching: ${nextUrl}`);
          const response = await callSpotifyWithRefresh<{ items: ItemType[], next: string | null, total: number }>(
              (currentToken) => fetch(nextUrl!, {
                  headers: { 'Authorization': `Bearer ${currentToken}` },
                  cache: 'no-store',
              })
          );

          if (response.items) {
              items = items.concat(response.items);
              console.log(`[fetchAllPaginatedItems] Fetched ${response.items.length} items. Total now: ${items.length}. Total available: ${response.total}.`);
          }
          nextUrl = response.next; // Get URL for the next page

          // Optional: Add a small delay between pages if hitting rate limits
          // if (nextUrl) await new Promise(resolve => setTimeout(resolve, 50));
      }
      console.log(`[fetchAllPaginatedItems] Finished fetching. Total items: ${items.length}`);
      return items;
  }
  // --- End Helper Function ---

  // --- Define Simplified Album/Track Structures for fetching ---
  interface SpotifySimplifiedAlbum {
    id: string;
    name: string;
    album_type: string; // album, single, compilation
    artists: { id: string; name: string }[];
    // Add images if needed later
  }

  interface SpotifyAlbumTrack {
      id: string;
      name: string;
      artists: { id: string; name: string }[];
      track_number: number;
      disc_number: number;
      duration_ms: number;
      uri: string;
      // Missing album details here, we add them back later
  }
  // --- End Simplified Structures ---

  try {
    console.log(`[API /artist-songs] Fetching ALL songs for ${artistName} (ID: ${artistId}) using user token.`);

    // 1. Fetch all albums/singles/appearances/compilations for the artist
    const albumsUrl = `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album,single,appears_on,compilation&limit=50`; // Max limit 50
    const allArtistAlbums = await fetchAllPaginatedItems<SpotifySimplifiedAlbum>(albumsUrl, currentAccessToken);
    const albumIds = allArtistAlbums.map(album => album.id);
    console.log(`[API /artist-songs] Found ${albumIds.length} potential albums/singles/etc. for ${artistName}.`);

    if (albumIds.length === 0) {
        return NextResponse.json({ songs: [] }); // No albums found, return empty list
    }

    // 2. Fetch tracks for these albums (in batches of 20 album IDs for /v1/albums endpoint)
    const allTracksWithAlbumInfo: (SpotifyTrack & { albumId: string })[] = []; // Store tracks with album context temporarily
    const ALBUM_BATCH_SIZE = 20;

    for (let i = 0; i < albumIds.length; i += ALBUM_BATCH_SIZE) {
        const batchIds = albumIds.slice(i, i + ALBUM_BATCH_SIZE);
        const batchAlbumsUrl = `https://api.spotify.com/v1/albums?ids=${batchIds.join(',')}&market=from_token`;

        console.log(`[API /artist-songs] Fetching details for album batch ${i / ALBUM_BATCH_SIZE + 1}...`);
        const batchAlbumsResponse = await callSpotifyWithRefresh<{ albums: any[] }>(
            (token) => fetch(batchAlbumsUrl, {
                headers: { 'Authorization': `Bearer ${token}` },
                cache: 'no-store',
            })
        );

        for (const fullAlbum of batchAlbumsResponse.albums) {
            if (!fullAlbum || !fullAlbum.tracks?.items) continue; // Skip if album data is missing or has no tracks

            const albumInfo = {
                id: fullAlbum.id,
                name: fullAlbum.name,
                images: fullAlbum.images
            };

            let tracksForThisAlbum: SpotifyAlbumTrack[] = fullAlbum.tracks.items;
            let nextTracksUrl = fullAlbum.tracks.next;

            // Handle pagination within the album's tracks if necessary (often not needed for standard albums but good practice)
            while(nextTracksUrl) {
                 console.log(`[API /artist-songs] Fetching next page of tracks for album ${albumInfo.name}...`);
                 const paginatedTracksResponse = await callSpotifyWithRefresh<{ items: SpotifyAlbumTrack[], next: string | null }>(
                    (token) => fetch(nextTracksUrl!, {
                        headers: { 'Authorization': `Bearer ${token}` },
                        cache: 'no-store',
                    })
                 );
                 tracksForThisAlbum = tracksForThisAlbum.concat(paginatedTracksResponse.items || []);
                 nextTracksUrl = paginatedTracksResponse.next;
            }

            // Add album context to each track
            const tracksWithContext = tracksForThisAlbum.map((track) => ({
                id: track.id,
                name: track.name,
                artists: track.artists.map(a => ({ id: a.id, name: a.name })),
                album: {
                    name: albumInfo.name,
                    images: albumInfo.images
                },
                uri: track.uri,
                popularity: undefined, // Popularity isn't directly on album tracks, might need separate fetch if crucial
                albumId: albumInfo.id // Keep track of original album ID for potential debugging/filtering
            }));
            allTracksWithAlbumInfo.push(...tracksWithContext);
        }
         console.log(`[API /artist-songs] Processed batch ${i / ALBUM_BATCH_SIZE + 1}. Total tracks so far (pre-dedupe): ${allTracksWithAlbumInfo.length}`);
         // Optional delay between batches
         // if (i + ALBUM_BATCH_SIZE < albumIds.length) await new Promise(resolve => setTimeout(resolve, 100));
    }

    // 3. Deduplicate songs (using track ID is simplest, assumes Spotify IDs are stable)
    const uniqueSongsMap = new Map<string, SpotifyTrack>();
    allTracksWithAlbumInfo.forEach(track => {
        if (!uniqueSongsMap.has(track.id)) { // Use track ID as the key
             // Remove the temporary albumId before storing
            const { albumId, ...finalTrack } = track;
            uniqueSongsMap.set(track.id, finalTrack);
        }
        // Keep the first encountered version (could add logic to keep most popular if popularity was fetched)
    });

    const uniqueSongs: SpotifyTrack[] = Array.from(uniqueSongsMap.values());

    console.log(`[API /artist-songs] Found ${uniqueSongs.length} unique songs for ${artistName}.`);
    return NextResponse.json({ songs: uniqueSongs });

  } catch (error: any) {
    console.error(`[API /artist-songs] Final error handler for artist ${artistId}:`, error);
    const errorMessage = error.message || 'Failed to fetch songs from Spotify';
    // Use status from error if available (set by wrapper), otherwise default
    let status = error.status || 500;
    // If auth error resulted in token deletion, ensure 401 is sent
    if (errorMessage.includes('Authentication required') || errorMessage.includes('Authentication session expired')) {
         status = 401;
         // Tokens should have been deleted within the refresh logic already
    }

    return NextResponse.json({ error: errorMessage }, { status });
  }
}