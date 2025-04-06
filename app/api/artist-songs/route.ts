import { NextResponse } from 'next/server';
import { getSpotifyClient } from '../../../lib/spotify'; // Use relative path

// Define the structure for a simplified Spotify Track
interface SpotifyTrack {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: { name: string; images?: { url: string }[] };
  uri: string;
  // Add other relevant fields if needed
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const artistId = searchParams.get('artistId');
  const artistName = searchParams.get('artistName'); // Pass name for filtering/logging

  if (!artistId || !artistName) {
    return NextResponse.json({ error: 'Artist ID and Artist Name are required' }, { status: 400 });
  }

  console.log(`[API /artist-songs] Fetching songs for ${artistName} (ID: ${artistId})`);

  try {
    const spotifyClient = await getSpotifyClient(); // Get authenticated client

    // Placeholder for fetching logic using artistId and artistName
    // This needs to replicate the pagination and filtering logic from find_all_songs_by_artist
    // For now, let's just return a placeholder response
    // console.log("[API /artist-songs] TODO: Implement actual song fetching logic");
    // const songs: SpotifyTrack[] = []; // Replace with actual fetch results

    // --- Start of placeholder logic (to be replaced) ---
    // Simulating a delay and empty result for now
    // await new Promise(resolve => setTimeout(resolve, 1000));
    // --- End of placeholder logic ---

    // Call the function from the Spotify client library
    const songs = await spotifyClient.findSongsByArtist(artistId, artistName);

    console.log(`[API /artist-songs] Found ${songs.length} songs for ${artistName}.`);
    return NextResponse.json({ songs });

  } catch (error: any) {
    console.error(`[API /artist-songs] Error fetching songs for artist ${artistId}:`, error);
    // Provide a more specific error message if possible
    const errorMessage = error.message || 'Failed to fetch songs from Spotify';
    let status = 500;
    if (error.response?.status) { // Check if it's an Axios/fetch error with status
        status = error.response.status;
    }
    return NextResponse.json({ error: errorMessage }, { status });
  }
}