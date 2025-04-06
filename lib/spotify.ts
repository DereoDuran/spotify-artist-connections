// lib/spotify.ts
import { Buffer } from 'buffer'; // Node.js Buffer

// Define the structure for a simplified Spotify Track
// (This can be moved to a shared types file later if needed)
interface SpotifyTrack {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: { name: string; images?: { url: string }[] };
  uri: string;
  popularity?: number; // Added popularity
}

// Types for Spotify API responses
interface SpotifyTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
}

interface SpotifyPagingObject<T> {
    href: string;
    items: T[];
    limit: number;
    next: string | null;
    offset: number;
    previous: string | null;
    total: number;
}

interface SpotifySearchResponse {
    tracks?: SpotifyPagingObject<SpotifyTrack>;
    artists?: SpotifyPagingObject<any>; // Add other types if needed
    // Add other search result types (albums, playlists, etc.) if necessary
}

interface SpotifyArtist {
  id: string;
  name: string;
  images?: { url: string }[];
  external_urls?: { spotify: string };
}

interface SpotifyUserProfile {
    id: string;
    display_name: string;
    email?: string; // Requires user-read-email scope
    external_urls: { spotify: string };
    href: string;
    uri: string;
    images?: { url: string; height: number; width: number }[];
}

interface SpotifyPlaylist {
    id: string;
    name: string;
    description: string | null;
    public: boolean;
    collaborative: boolean;
    owner: { id: string; display_name: string };
    external_urls: { spotify: string };
    href: string;
    uri: string;
    tracks: { href: string; total: number };
    // images might be included depending on fields requested
}

interface SpotifyAddTracksResponse {
    snapshot_id: string;
}

let accessToken: string | null = null;
let tokenExpiryTime: number = 0; // Store expiry time (timestamp in seconds)

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const tokenUrl = 'https://accounts.spotify.com/api/token';
export const SPOTIFY_API_BASE_URL = "https://api.spotify.com/v1/";

async function fetchNewToken(): Promise<string> {
    if (!clientId || !clientSecret) {
        throw new Error("Spotify Client ID or Secret not configured in environment variables.");
    }

    console.log("Fetching new Spotify access token...");
    const authString = `${clientId}:${clientSecret}`;
    const authBase64 = Buffer.from(authString).toString('base64');

    const headers = {
        'Authorization': `Basic ${authBase64}`,
        'Content-Type': 'application/x-www-form-urlencoded'
    };
    const body = 'grant_type=client_credentials';

    try {
        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: headers,
            body: body,
            cache: 'no-store', // Ensure fresh token fetch
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error("Spotify token request failed:", response.status, errorBody);
            throw new Error(`Spotify token request failed with status ${response.status}`);
        }

        const data = (await response.json()) as SpotifyTokenResponse;

        if (data.access_token && data.expires_in) {
            accessToken = data.access_token;
            tokenExpiryTime = Math.floor(Date.now() / 1000) + data.expires_in - 60; // 60s buffer
            console.log(`Successfully retrieved Spotify access token. Expires in approx ${data.expires_in} seconds.`);
            return accessToken;
        } else {
            console.error("Error: Could not retrieve access token from Spotify response.", data);
            throw new Error("Invalid token response received from Spotify.");
        }
    } catch (error: any) {
        console.error("Error during Spotify token request:", error);
        accessToken = null;
        tokenExpiryTime = 0;
        throw new Error(`Failed to fetch Spotify token: ${error.message}`);
    }
}

async function getValidToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (!accessToken || now >= tokenExpiryTime) {
        console.log("Spotify token expired or not available. Refreshing...");
        accessToken = await fetchNewToken();
    }
    if (!accessToken) {
        throw new Error("Failed to obtain a valid Spotify access token.");
    }
    return accessToken;
}

// Generic function to make authenticated requests to Spotify API
async function spotifyApiRequest<T>(endpoint: string, params?: Record<string, string | number>): Promise<T> {
    const token = await getValidToken();
    const url = new URL(`${SPOTIFY_API_BASE_URL}${endpoint}`);
    if (params) {
        Object.entries(params).forEach(([key, value]) => url.searchParams.append(key, String(value)));
    }

    const headers = {
        'Authorization': `Bearer ${token}`
    };

    // console.log(`Making Spotify API request: GET ${url.toString()}`); // Debug log

    try {
        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: headers,
            cache: 'no-store', // Avoid caching sensitive data or stale results
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Spotify API request failed: ${response.status} ${url.toString()}`, errorBody);
            // Attempt to parse error details from Spotify
            try {
                 const errorJson = JSON.parse(errorBody);
                 if (errorJson.error?.message) {
                     throw new Error(`Spotify API Error: ${errorJson.error.message} (Status: ${response.status})`);
                 }
            } catch (parseError) { /* Ignore if parsing fails */ }
            // Fallback error
            throw new Error(`Spotify API request failed with status ${response.status}`);
        }

        return (await response.json()) as T;
    } catch (error: any) {
        console.error(`Error during Spotify API request to ${endpoint}:`, error);
        // Re-throw the error to be handled by the caller
        throw error;
    }
}

// Spotify Search Function (handles pagination)
async function searchSpotify<T>(
    query: string,
    searchType: 'track' | 'artist' | 'album' | 'playlist', // Extend types as needed
    limit: number = 50,
    retrievalMode: 'first' | 'all' = 'first',
    additionalParams: Record<string, string | number> = {}
): Promise<T[] | SpotifyPagingObject<T> | null> {

    const searchKey = `${searchType}s`; // e.g., 'tracks', 'artists'
    let allItems: T[] = [];
    let currentOffset = 0;
    const effectiveLimit = Math.min(limit, 50); // Spotify max limit is 50

    const params: Record<string, string | number> = {
        q: query,
        type: searchType,
        limit: effectiveLimit,
        offset: currentOffset,
        ...additionalParams
    };

    console.log(`Searching Spotify for ${searchType} with query "${query}", mode: ${retrievalMode}`);

    try {
        while (true) {
            const response = await spotifyApiRequest<SpotifySearchResponse>('search', params);
            const resultsData = response[searchKey as keyof SpotifySearchResponse] as SpotifyPagingObject<T> | undefined;

            if (!resultsData) {
                console.warn(`No '${searchKey}' key found in search response for type '${searchType}'. Query: "${query}". Response keys: ${Object.keys(response)}`);
                return retrievalMode === 'all' ? allItems : null; // Return collected items if any, else null
            }

            const currentItems = resultsData.items || [];

            if (retrievalMode === 'first') {
                // Return the raw first page data (paging object)
                return resultsData;
            }

            // retrievalMode === 'all'
            allItems = allItems.concat(currentItems);
            console.log(`Fetched ${currentItems.length} items. Total fetched: ${allItems.length}. Next URL: ${resultsData.next ? 'Yes' : 'No'}`);

            if (resultsData.next) {
                // Spotify's 'next' URL can be used directly, but recalculating offset is simpler
                currentOffset += effectiveLimit;
                params.offset = currentOffset;
                // Optional small delay between pages
                // await new Promise(resolve => setTimeout(resolve, 50));
            } else {
                break; // No more pages
            }
        }
        console.log(`Finished fetching all ${searchType}. Total found: ${allItems.length}`);
        return allItems; // Return all collected items

    } catch (error: any) {
        console.error(`An error occurred during Spotify ${searchType} search (query: "${query}"):`, error);
        // Rethrow or return null based on desired error handling
        throw error; // Rethrow to be caught by the API route handler
        // return null;
    }
}


// Function to find all songs by a specific artist ID (using search and filtering)
async function findSongsByArtist(artistId: string, artistName: string): Promise<SpotifyTrack[]> {
    console.log(`Searching for all tracks credited to artist: ${artistName} (ID: ${artistId})...`);

    // Search for tracks using the artist's name. This is broad but necessary
    // as there isn't a direct "get all tracks by artist ID" endpoint that includes features/collaborations.
    // We use 'all' mode to paginate through all results.
    // Using artist name in query helps narrow down initially. `tag:artist` might also work but can be restrictive.
    // Market parameter 'from_token' can increase result relevance.
    const query = `artist:"${artistName}"`; // Search specifically for artist name
    const allPotentialTracks = await searchSpotify<SpotifyTrack>(
        query,
        'track',
        50, // Max limit per page
        'all', // Retrieve all pages
        // { market: 'from_token' } // Use user's market or remove if causing issues
    );


    if (allPotentialTracks === null || !Array.isArray(allPotentialTracks)) {
        console.log(`Could not retrieve tracks search results for ${artistName}.`);
        // Return empty array or throw depending on how you want to handle this
        return [];
    }

    console.log(`Retrieved ${allPotentialTracks.length} potential tracks for query "${query}". Filtering by artist ID ${artistId}...`);

    // Filter the results to include only tracks where the specific artistId is present
    const filteredSongs = allPotentialTracks.filter(track =>
        track.artists && track.artists.some(artist => artist.id === artistId)
    );

    console.log(`Found ${filteredSongs.length} tracks where '${artistName}' (ID: ${artistId}) is listed as an artist.`);

    // Optional: De-duplicate tracks based on ID, as search might return duplicates across pages/aliases
    const uniqueSongsMap = new Map<string, SpotifyTrack>();
    filteredSongs.forEach(song => {
        if (!uniqueSongsMap.has(song.id)) {
            uniqueSongsMap.set(song.id, song);
        }
    });
    const uniqueSongs = Array.from(uniqueSongsMap.values());

    if (uniqueSongs.length < filteredSongs.length) {
        console.log(`Removed ${filteredSongs.length - uniqueSongs.length} duplicate tracks.`);
    }


    return uniqueSongs;
}

// Updated client factory to include the new methods
export async function getSpotifyClient() {
    const token = await getValidToken(); // Ensure token is valid before returning client

    return {
        getToken: () => token, // Return the validated token
        // Expose the generic request function if needed elsewhere
        // request: spotifyApiRequest,
        // Expose search if needed directly
        // search: searchSpotify,
        findSongsByArtist: findSongsByArtist // Provide the specific function needed by the API route
    };
}

// --- User Authorization Code Flow --- (For user-specific actions)

// Generic function for USER-authenticated requests (supports different methods)
async function makeUserSpotifyApiRequest<T>(
    userAccessToken: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    body?: Record<string, any> | null,
    params?: Record<string, string | number>
): Promise<T> {

    if (!userAccessToken) {
        throw new Error("User Spotify access token is required for this operation.");
    }

    const url = new URL(`${SPOTIFY_API_BASE_URL}${endpoint}`);
    if (params) {
        Object.entries(params).forEach(([key, value]) => url.searchParams.append(key, String(value)));
    }

    const headers: HeadersInit = {
        'Authorization': `Bearer ${userAccessToken}`,
    };

    const requestOptions: RequestInit = {
        method: method,
        headers: headers,
        cache: 'no-store',
    };

    if (body && (method === 'POST' || method === 'PUT')) {
        headers['Content-Type'] = 'application/json';
        requestOptions.body = JSON.stringify(body);
    }

    // console.log(`(User Auth) Making Spotify API request: ${method} ${url.toString()}`); // Debug log

    try {
        const response = await fetch(url.toString(), requestOptions);

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`(User Auth) Spotify API request failed: ${response.status} ${method} ${url.toString()}`, errorBody);
            try {
                const errorJson = JSON.parse(errorBody);
                if (errorJson.error?.message) {
                    // Include potential reason if available (e.g., scope issues)
                    const reason = errorJson.error.reason ? ` (${errorJson.error.reason})` : '';
                    throw new Error(`Spotify API Error: ${errorJson.error.message}${reason} (Status: ${response.status})`);
                }
            } catch (parseError) { /* Ignore */ }
            // Throw a generic error if parsing fails
            throw new Error(`Spotify API request failed with status ${response.status}`);
        }

        // Handle successful responses based on status code
        if (response.status === 201) { // Created - Expects the created resource (Playlist)
            try {
                 const jsonResponse = await response.json();
                 // console.log("(User Auth) Playlist creation successful (201). Response body:", jsonResponse); // Optional: Log successful response
                 return jsonResponse as T;
             } catch (e: any) {
                 console.error("(User Auth) Failed to parse JSON response body for 201 status:", e);
                 // Throw an error because we expected a valid JSON body for 201 Created
                 throw new Error(`Spotify API returned 201 Created, but failed to parse response body: ${e.message}`);
             }
        } else if (response.status === 204) { // No Content
             // console.log("(User Auth) Request successful (204 No Content)."); // Optional: Log success
             return {} as T; // Return empty object as there's no content
        } else { // Handle other success statuses (e.g., 200 OK for GET)
             try {
                const jsonResponse = await response.json();
                // console.log("(User Auth) Request successful (200 OK). Response body:", jsonResponse); // Optional: Log successful response
                return jsonResponse as T;
             } catch (e: any) {
                 console.error("(User Auth) Failed to parse JSON response body for success status:", response.status, e);
                 throw new Error(`Spotify API request succeeded (${response.status}), but failed to parse response body: ${e.message}`);
             }
        }

    } catch (error: any) {
        console.error(`(User Auth) Error during Spotify API request: ${method} ${endpoint}:`, error);
        // Re-throw the original error which should have status/message
        throw error;
    }
}

// --- User-Specific API Functions ---

/**
 * Fetches the profile information for the user associated with the access token.
 * Requires the 'user-read-private' scope (and 'user-read-email' for email).
 */
export async function getUserProfile(userAccessToken: string): Promise<SpotifyUserProfile> {
    console.log("(User Auth) Fetching user profile...");
    return makeUserSpotifyApiRequest<SpotifyUserProfile>(userAccessToken, 'GET', 'me');
}

/**
 * Creates a new playlist for a Spotify user.
 * Requires the 'playlist-modify-public' or 'playlist-modify-private' scope.
 */
export async function createUserPlaylist(
    userAccessToken: string,
    userId: string,
    details: { name: string; description?: string; public?: boolean; collaborative?: boolean }
): Promise<SpotifyPlaylist> {
    console.log(`(User Auth) Creating playlist "${details.name}" for user ${userId}...`);
    const endpoint = `users/${userId}/playlists`;
    const body = {
        name: details.name,
        description: details.description || '',
        public: details.public !== undefined ? details.public : false, // Default to private
        collaborative: details.collaborative || false,
    };
    // Spotify API returns the created playlist object on success (201 Created)
    return makeUserSpotifyApiRequest<SpotifyPlaylist>(userAccessToken, 'POST', endpoint, body);
}

/**
 * Adds one or more tracks to a user's playlist.
 * Requires the 'playlist-modify-public' or 'playlist-modify-private' scope.
 * Note: Spotify limits adding 100 tracks per request.
 */
export async function addTracksToUserPlaylist(
    userAccessToken: string,
    playlistId: string,
    trackUris: string[] // Array of Spotify Track URIs (e.g., ["spotify:track:4iV5W9uYEdYUVa79Axb7Rh", ...])
): Promise<SpotifyAddTracksResponse> {
    if (trackUris.length === 0) {
        console.warn("(User Auth) No track URIs provided to addTracksToUserPlaylist. Skipping API call.");
        return { snapshot_id: 'skipped-no-tracks' }; // Or throw an error if preferred
    }
    if (trackUris.length > 100) {
        // This function assumes the caller handles chunking if necessary.
        // The API route *should* handle chunking.
        console.warn("(User Auth) Attempting to add more than 100 tracks in a single request. Spotify may reject this.");
    }
    console.log(`(User Auth) Adding ${trackUris.length} tracks to playlist ${playlistId}...`);
    const endpoint = `playlists/${playlistId}/tracks`;
    const body = { uris: trackUris };
    // Spotify API returns { snapshot_id: "..." } on success (201 Created)
    return makeUserSpotifyApiRequest<SpotifyAddTracksResponse>(userAccessToken, 'POST', endpoint, body);
}