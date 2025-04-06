import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Cache for the Spotify token
let tokenCache = {
  accessToken: null as string | null,
  expiresAt: 0,
};

// Function to get Spotify token (with caching)
async function getSpotifyToken(): Promise<string | null> {
  const now = Date.now();
  // Check cache, refresh if expired or nearing expiry (e.g., 60 seconds buffer)
  if (tokenCache.accessToken && now < tokenCache.expiresAt - 60000) {
    return tokenCache.accessToken;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Spotify client ID or secret not set in environment variables');
    return null;
  }

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        // btoa is available in Node.js >= 16 and Edge Runtime
        'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
      },
      body: 'grant_type=client_credentials',
      cache: 'no-store', // Ensure fresh token request
    });

    if (!response.ok) {
      console.error('Failed to fetch Spotify token:', await response.text());
      tokenCache = { accessToken: null, expiresAt: 0 }; // Clear cache on failure
      return null;
    }

    const data = await response.json();
    const expiresIn = data.expires_in; // Typically 3600 seconds (1 hour)
    tokenCache = {
      accessToken: data.access_token,
      expiresAt: now + expiresIn * 1000,
    };
    console.log(`Fetched new Spotify token, expires in ${expiresIn} seconds.`);
    return tokenCache.accessToken;
  } catch (error) {
      console.error('Error fetching Spotify token:', error);
      tokenCache = { accessToken: null, expiresAt: 0 }; // Clear cache on error
      return null;
  }
}

interface SpotifyArtist {
    id: string;
    name: string;
    images: { url: string; height: number; width: number }[];
    external_urls: { spotify: string };
    genres: string[];
    popularity: number;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query || query.trim().length < 2) { // Avoid searching for very short strings
    return NextResponse.json({ artists: [] }); // Return empty list, not an error
  }

  const token = await getSpotifyToken();

  if (!token) {
    return NextResponse.json({ error: 'Failed to authenticate with Spotify' }, { status: 500 });
  }

  try {
    // Limit results for dropdown efficiency
    const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=artist&limit=5`;
    const spotifyResponse = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      cache: 'no-store', // Don't cache search results on the edge/server
    });

    if (!spotifyResponse.ok) {
       const errorData = await spotifyResponse.text();
       console.error('Spotify API search error:', errorData);
       // Try to parse error details from Spotify if possible
       let details = errorData;
       try {
         details = JSON.parse(errorData);
       } catch(e) { /* Ignore parsing error */ }
       return NextResponse.json({ error: 'Failed to search Spotify artists', details }, { status: spotifyResponse.status });
    }

    const searchData = await spotifyResponse.json();
    // Map to a slightly cleaner structure if desired, or return as is
    const artists: SpotifyArtist[] = searchData.artists?.items || [];

    return NextResponse.json({ artists });

  } catch (error) {
    console.error('Error searching Spotify in API route:', error);
    return NextResponse.json({ error: 'Internal server error during Spotify search' }, { status: 500 });
  }
}