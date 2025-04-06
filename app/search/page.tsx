"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link'; // Import Link from next/link

// Define the structure of a Spotify Artist based on what we need
interface SpotifyArtist {
  id: string;
  name: string;
  images?: { url: string }[]; // Optional images array
  popularity?: number;
}

// Define the structure for a simplified Spotify Track (matches API response)
interface SpotifyTrack {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: { name: string; images?: { url: string }[] };
  uri: string;
  popularity?: number;
}

// Define the structure for Spotify User Profile (add this)
interface SpotifyUserProfile {
  display_name: string;
  id: string;
  // Add other fields if needed, e.g., email, images
}

interface CreatePlaylistRequestBody {
  playlistName: string;
  trackUris: string[]; // <-- Expected name
  description?: string;
}

export default function SearchPage() {
  const [artistQuery, setArtistQuery] = useState(''); // Input field value
  const [searchResults, setSearchResults] = useState<SpotifyArtist[]>([]);
  const [selectedArtist, setSelectedArtist] = useState<SpotifyArtist | null>(null);
  const [isLoading, setIsLoading] = useState(false); // Loading for artist search
  const [showDropdown, setShowDropdown] = useState(false);
  const [isFetchingSongs, setIsFetchingSongs] = useState(false); // Loading for song fetch
  const [artistSongs, setArtistSongs] = useState<SpotifyTrack[]>([]); // State for fetched songs
  const [songFetchError, setSongFetchError] = useState<string | null>(null); // State for song fetch errors
  const [collaborationCount, setCollaborationCount] = useState(0); // State for collaboration count
  const [suggestedArtists, setSuggestedArtists] = useState<SpotifyArtist[]>([]);
  // Stores counts for *all* collaborators found, mapping artist ID to name and count
  const [collaboratorCounts, setCollaboratorCounts] = useState<{ [artistId: string]: { name: string; count: number; images?: { url: string }[] } }>({});
  const [graphedArtists, setGraphedArtists] = useState<SpotifyArtist[]>([]); // Keep track of artists in the graph
  const [showOnlyCollaborations, setShowOnlyCollaborations] = useState(false); // State for filtering
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [playlistCreationStatus, setPlaylistCreationStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [userProfile, setUserProfile] = useState<SpotifyUserProfile | null>(null); // State for user profile
  const [createdPlaylistUrl, setCreatedPlaylistUrl] = useState<string | null>(null); // State for the created playlist URL

  // Ref to track if the input blur was caused by clicking a dropdown item
  const selectingFromDropdown = useRef(false);

  // Debounce timer ref
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Debounced search function for artists
  const triggerSearch = useCallback((query: string) => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    if (query.trim().length < 2) { // Don't search for less than 2 chars
      setSearchResults([]);
      setShowDropdown(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setShowDropdown(true); // Show dropdown (with loading state) immediately

    debounceTimer.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search-artists?q=${encodeURIComponent(query)}`);
        if (!response.ok) {
           const errorData = await response.json().catch(() => ({ error: 'Network response was not ok' }));
           throw new Error(errorData.error || 'Failed to fetch artists');
        }
        const data = await response.json();
        setSearchResults(data.artists || []);
      } catch (error: any) {
        console.error("Failed to fetch artists:", error);
        setSearchResults([]); // Clear results on error
        // TODO: Display error message to user?
      } finally {
        setIsLoading(false);
      }
    }, 500); // 500ms debounce delay
  }, []); // Empty dependency array, relies on refs

  // Effect to trigger search when artistQuery changes
  useEffect(() => {
    // Only search if an artist hasn't been selected yet
    if (!selectedArtist) {
        triggerSearch(artistQuery);
    } else {
        // Clear previous search results if an artist is selected and user isn't typing
         setSearchResults([]);
         setShowDropdown(false);
    }
    // Cleanup timer on component unmount or if query/selectedArtist changes
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [artistQuery, selectedArtist, triggerSearch]);

  // Fetch user profile on component mount
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const response = await fetch('/api/user/profile');
        if (response.ok) {
          const profileData = await response.json();
          setUserProfile(profileData);
        } else if (response.status !== 401) {
           // Only log error if it's not a 401 (Not Authenticated)
           console.error("Failed to fetch user profile:", response.status);
        }
        // No need to handle 401 specifically, userProfile will remain null
      } catch (error) {
        console.error("Error fetching user profile:", error);
      }
    };

    fetchUserProfile();
  }, []); // Empty dependency array ensures this runs only once on mount

  // --- Recalculation Function ---
  const recalculateGraphState = useCallback((currentGraphArtists: SpotifyArtist[], currentSongs: SpotifyTrack[]) => {
      console.log("Recalculating graph state with", currentGraphArtists.length, "artists and", currentSongs.length, "songs.");
      // Reset suggestions and counts before recalculating
      setSuggestedArtists([]);
      setCollaboratorCounts({});
      setCollaborationCount(0);

      if (currentGraphArtists.length === 0) {
          console.log("Graph is empty, resetting related state.");
          setArtistSongs([]); // Clear songs
          setArtistQuery(''); // Clear search input
          setSelectedArtist(null); // Clear the 'seed' artist display
          // Suggestions/counts already cleared above
          return; // Stop calculation if graph is empty
      }

      const graphArtistIds = new Set(currentGraphArtists.map(a => a.id));
      const counts: { [artistId: string]: { name: string; count: number; images?: { url: string }[] } } = {};

      currentSongs.forEach(song => {
          // Find collaborators on this song who are NOT already in the graph
          const collaboratorsOnSong = song.artists.filter(a => !graphArtistIds.has(a.id));

          // Only count collaborations if at least one graph artist is also on the song
          // AND there are collaborators not already in the graph.
          const isRelevantCollaboration = song.artists.some(a => graphArtistIds.has(a.id)) && collaboratorsOnSong.length > 0;

          if (isRelevantCollaboration) {
              collaboratorsOnSong.forEach(collabArtist => {
                   if (!counts[collabArtist.id]) {
                      const potentialImage = song.album.images && song.album.images.length > 0
                                              ? song.album.images[song.album.images.length - 1] // Smallest image for potential collaborator
                                              : undefined;
                      counts[collabArtist.id] = {
                          name: collabArtist.name,
                          count: 0,
                          images: potentialImage ? [potentialImage] : []
                      };
                  }
                  counts[collabArtist.id].count++;
              });
          }
      });

      // Find the top collaborators *not* already in the graph
      const potentialCollaborators = Object.entries(counts)
          .map(([id, data]) => ({ id, ...data })) // Convert to array
          // No need to filter here, already done by checking graphArtistIds when creating counts
          .sort((a, b) => b.count - a.count); // Sort by count descending

      // Get the top 10 suggestions
      const topSuggestions = potentialCollaborators.slice(0, 10).map(collab => ({
          id: collab.id,
          name: collab.name,
          images: collab.images?.length ? collab.images : undefined
      }));

      const uniquePotentialCollaborators = potentialCollaborators.length;

      // Update states
      setCollaboratorCounts(counts); // Store counts of ALL potential collaborators (those not in graph)
      setSuggestedArtists(topSuggestions); // Store the top 10 suggestions
      setCollaborationCount(uniquePotentialCollaborators); // This count now reflects potential additions

      console.log(`Recalculation done. Found ${uniquePotentialCollaborators} potential collaborators. Top suggestions:`, topSuggestions);

  }, []); // Empty dependency array as setters are stable
  // --- End Recalculation Function ---

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setArtistQuery(newQuery);
    // If user types again, clear selection and previous results/errors
    if (selectedArtist) {
        setSelectedArtist(null);
        setArtistSongs([]);
        setSongFetchError(null);
        setIsFetchingSongs(false);
        setCollaborationCount(0); // Reset collab count
    }
    setShowDropdown(true); // Ensure dropdown is visible when typing
  };

  // Reusable function to fetch songs and calculate collaborators/suggestion
  const fetchAndProcessSongs = useCallback(async (
    artistToFetch: SpotifyArtist,
    currentSongs: SpotifyTrack[],
    allGraphArtists: SpotifyArtist[] // All artists currently considered "in the graph"
  ) => {
    console.log(`Fetching songs for ${artistToFetch.name}...`);
    setIsFetchingSongs(true);
    setSongFetchError(null);
    // Clear previous suggestions when fetching for a new (or added) artist
    setSuggestedArtists([]);
    // Keep existing collaborator counts for now, or reset? Resetting seems simpler for now.
    // We might need a more sophisticated merging strategy later.
    // Let's recalculate from the full list each time for simplicity.
    // setCollaboratorCounts({}); // Recalculate based on combined songs later

    try {
      const response = await fetch(`/api/artist-songs?artistId=${artistToFetch.id}&artistName=${encodeURIComponent(artistToFetch.name)}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP error! Status: ${response.status}` }));
        throw new Error(errorData.error || `Failed to fetch songs. Status: ${response.status}`);
      }
      const data = await response.json();
      const newSongs: SpotifyTrack[] = data.songs || [];
      console.log(`Fetched ${newSongs.length} new songs for ${artistToFetch.name}.`);

      // Combine new songs with existing ones
      // --- Deduplicate Combined Songs ---
      // Combine old and new songs first
      const allSongs = [...currentSongs, ...newSongs];

      // Use a Map to track unique songs based on name and sorted artist names
      const uniqueSongsMap = new Map<string, SpotifyTrack>();
      allSongs.forEach(song => {
          // Create a consistent key: song name + sorted artist names
          const artistNames = song.artists.map(a => a.name).sort().join(',');
          const uniqueKey = `${song.name}|${artistNames}`;
          if (!uniqueSongsMap.has(uniqueKey)) {
              uniqueSongsMap.set(uniqueKey, song);
          }
          // Keep the first encountered instance (which might not be the most popular without that data)
      });

      const deduplicatedSongs = Array.from(uniqueSongsMap.values());
      console.log(`Combined and deduplicated songs. Total unique songs: ${deduplicatedSongs.length}`);
      // --- End Deduplication ---

      setArtistSongs(deduplicatedSongs); // Update state with the deduplicated list

      // --- Recalculate Collaborations and Suggestion based on COMBINED songs and ALL graph artists ---
      recalculateGraphState(allGraphArtists, deduplicatedSongs);
      // --- End Recalculation ---

    } catch (error: any) {
      console.error("Failed to fetch or process songs:", error);
      setSongFetchError(error.message || "An unknown error occurred.");
      // Don't clear songs on error when adding, keep the previously fetched ones
      // setArtistSongs([]); // Decide if we should revert or keep partial data
      setCollaborationCount(0); // Reset suggestions on error
      setSuggestedArtists([]); // Clear suggestions on error
      setCollaboratorCounts({});
    } finally {
      setIsFetchingSongs(false);
    }
  }, [recalculateGraphState]); // Add recalculateGraphState dependency

  const handleArtistSelect = useCallback(async (artist: SpotifyArtist) => {
    selectingFromDropdown.current = true;
    setSelectedArtist(artist);
    setArtistQuery(artist.name);
    setSearchResults([]);
    setShowDropdown(false);
    setArtistSongs([]); // Clear previous songs for a new seed artist
    setSongFetchError(null);
    setCollaborationCount(0);
    setCollaboratorCounts({});
    setSuggestedArtists([]); // Clear previous suggestions
    setGraphedArtists([artist]); // Start the graph with this artist

    console.log('Selected seed artist:', artist);

    // Fetch songs for the newly selected seed artist
    await fetchAndProcessSongs(artist, [], [artist]); // Pass empty initial songs, and the single artist

    setTimeout(() => {
        selectingFromDropdown.current = false;
    }, 100);
  }, [fetchAndProcessSongs]); // Add recalculateGraphState dependency

  const handleInputBlur = () => {
    // Hide dropdown on blur only if not clicking an item
    if (!selectingFromDropdown.current) {
        // Delay hiding to allow click event on dropdown items to register
        setTimeout(() => {
            if (!document.activeElement?.closest('.absolute.z-10')) { // Check if focus moved to dropdown
                 setShowDropdown(false);
            }
        }, 150);
    }
  };

   const handleInputFocus = () => {
    // Show dropdown again on focus if there's a query and no selection, and results exist
    if (artistQuery.trim().length > 1 && !selectedArtist && searchResults.length > 0) {
        setShowDropdown(true);
    }
   };

  const handleAddSuggestedArtist = useCallback(async (artistToAdd: SpotifyArtist) => {
    console.log("Adding suggested artist to graph:", artistToAdd);

    // Prevent adding if already fetching or if the artist is somehow already in the list
    if (isFetchingSongs || graphedArtists.some(a => a.id === artistToAdd.id)) {
        console.log("Already fetching or artist already in graph. Skipping add.");
        return;
    }

    // Add the new artist to the list of graphed artists
    const updatedGraphedArtists = [...graphedArtists, artistToAdd];
    setGraphedArtists(updatedGraphedArtists);

    // Clear the current suggestions immediately
    setSuggestedArtists([]);

    // Fetch songs for the newly added artist and recalculate suggestions
    // Pass the current songs and the updated list of all artists in the graph
    await fetchAndProcessSongs(artistToAdd, artistSongs, updatedGraphedArtists);

  }, [graphedArtists, artistSongs, isFetchingSongs, fetchAndProcessSongs, recalculateGraphState]); // Add recalculateGraphState dependency

  // --- Handle Removing an Artist ---
  const handleRemoveArtist = useCallback((artistIdToRemove: string) => {
    console.log("Removing artist:", artistIdToRemove);

    // Filter out the artist to remove
    const updatedGraphedArtists = graphedArtists.filter(artist => artist.id !== artistIdToRemove);
    const remainingArtistIds = new Set(updatedGraphedArtists.map(a => a.id));

    // Filter songs: Keep a song only if it includes AT LEAST ONE of the REMAINING artists
    const updatedSongs = artistSongs.filter(song => {
      return song.artists.some(artist => remainingArtistIds.has(artist.id));
    });

    console.log(`Removed artist ${artistIdToRemove}. Remaining artists: ${updatedGraphedArtists.length}. Remaining songs: ${updatedSongs.length}.`);

    // Update state
    setGraphedArtists(updatedGraphedArtists);
    setArtistSongs(updatedSongs);

    // Recalculate suggestions based on the new state
    recalculateGraphState(updatedGraphedArtists, updatedSongs);

  }, [graphedArtists, artistSongs, recalculateGraphState]);
  // --- End Handle Removing an Artist ---

  // --- Calculate filtered songs ---
  const filteredSongs = artistSongs.filter(song => {
    if (!showOnlyCollaborations) {
        return true; // Show all if filter is off
    }
    // Show only if it's a collaboration (more than 1 artist)
    return song.artists.length > 1;
  });
  // --- End Calculate filtered songs ---

  // --- Handle Create Playlist ---
  const handleCreatePlaylist = useCallback(async (songsToPlaylist: SpotifyTrack[]) => {
    if (songsToPlaylist.length === 0) {
        console.log("No songs to create playlist.");
        setPlaylistCreationStatus({ success: false, message: "No songs in the list to create a playlist." });
        return;
    }
    if (!selectedArtist) {
        console.log("Cannot create playlist without a seed artist context.");
        setPlaylistCreationStatus({ success: false, message: "Please select a seed artist first." });
        return;
    }

    setIsCreatingPlaylist(true);
    setPlaylistCreationStatus(null); // Clear previous status messages
    setCreatedPlaylistUrl(null); // Reset playlist URL on new attempt

    console.log(`Attempting to create playlist for ${selectedArtist.name} with ${songsToPlaylist.length} songs.`);

    try {
        // Prepare song URIs for the API
        const songUris = songsToPlaylist.map(song => song.uri).filter(uri => uri); // Ensure URIs exist
        if (songUris.length !== songsToPlaylist.length) {
             console.warn("Some songs were missing URIs and were excluded.");
             // Optionally inform the user
        }

        if (songUris.length === 0) {
            throw new Error("No valid song URIs found to add to the playlist.");
        }

        const response = await fetch('/api/create-playlist', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                playlistName: `Artist Graph: ${selectedArtist.name} & Connections`,
                description: `Songs featuring ${selectedArtist.name} and their collaborators discovered via Artist Graph.`,
                trackUris: songUris, // Corrected field name
            }),
        });

        const result = await response.json();

        if (!response.ok) {
            // Handle specific error statuses directly
            let message = `Failed to create playlist (status: ${response.status})`;
            if (response.status === 401) {
                console.error("Playlist creation failed: Authentication required (401).");
                message = "Authentication error. Please log in to Spotify again.";
            } else if (response.status === 403) {
                 console.error(`Playlist creation failed: Permission denied (403). Result:`, result);
                 message = result.error || "Permission denied by Spotify. Ensure the app has playlist creation permissions.";
            } else {
                console.error(`Playlist creation failed: Status ${response.status}. Result:`, result);
                message = result.error || message;
            }
            setPlaylistCreationStatus({ success: false, message }); // Set error message state
            setIsCreatingPlaylist(false);
            return;
        }

        console.log("Playlist creation successful:", result);
        // Store the URL instead of setting a message
        if (result.playlistUrl) {
            setCreatedPlaylistUrl(result.playlistUrl);
            setPlaylistCreationStatus({ success: true, message: '' }); // Indicate success but no message needed
        } else {
            console.error("Playlist created but URL missing in response:", result);
            setPlaylistCreationStatus({ success: false, message: "Playlist created, but couldn't get the URL." });
        }

    } catch (error: any) {
        console.error("Failed to create playlist (network or other error):", error);
        setPlaylistCreationStatus({ success: false, message: "An unexpected network or client error occurred. Please try again." });
    } finally {
        setIsCreatingPlaylist(false);
    }
  }, [selectedArtist]); // Removed artistSongs dependency as filteredSongs are passed directly
  // --- End Handle Create Playlist ---

  const artistImageUrl = selectedArtist?.images?.[0]?.url || '/default-artist.png'; // Fallback image

  return (
    <div className="flex flex-col md:flex-row h-screen bg-black text-gray-200 p-4 gap-4"> {/* Added p-4 and gap-4 */}
      {/* Left Panel: Search, Graph Info, Suggestions */}
      <div className="w-full md:w-1/3 flex flex-col space-y-4 overflow-y-auto p-2"> {/* Added p-2 for internal padding */}
        {/* Header */}
        <div className="w-full text-center mb-4"> {/* Centering wrapper */}
          <h1 className="text-2xl font-bold text-white">Artist Collaboration Graph</h1>
        </div>

        {/* User Info - Display only if userProfile exists */}
        {userProfile && (
          <div className="text-right text-sm text-gray-400">
            Logged in as: {userProfile.display_name}
          </div>
        )}

        {/* Login Button - Show only if userProfile is null */}
        {!userProfile && (
          <div className="text-right"> {/* Align button to the right */}
            <Link href="/login">
              <button className="px-4 py-2 rounded bg-green-600 text-white font-semibold hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition duration-150 ease-in-out shadow-sm hover:shadow">
                Login with Spotify
              </button>
            </Link>
          </div>
        )}

        {/* Search Input and Dropdown */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search for an artist..."
            value={artistQuery}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            onFocus={handleInputFocus} // Added onFocus
            className="w-full p-2 rounded border border-gray-600 bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500" // Adjusted styles
          />
          {/* Loading indicator inside input */}
          {isLoading && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-3">
              <svg className="animate-spin h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          )}
          {/* Search results dropdown */}
          {showDropdown && searchResults.length > 0 && !selectedArtist && (
            <div
              id="artist-results-dropdown"
              role="listbox"
              className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-60 overflow-y-auto"
            >
              {isLoading && <div className="p-2 text-gray-500">Loading artists...</div>}
              {!isLoading && searchResults.length === 0 && artistQuery.length > 1 && !selectedArtist && (
                <div className="p-2 text-gray-700">No artists found matching "{artistQuery}".</div>
              )}
              {!isLoading && searchResults.map((artist) => (
                <div
                  key={artist.id}
                  role="option"
                  aria-selected="false" // Can be managed if needed
                  className="p-2 hover:bg-gray-200 cursor-pointer flex items-center gap-2 text-gray-900"
                  // Use onMouseDown to register click before onBlur hides dropdown
                  onMouseDown={() => handleArtistSelect(artist)}
                >
                  {/* Artist Image or Placeholder */}
                  {artist.images && artist.images.length > 0 ? (
                    <img
                      src={artist.images[artist.images.length - 1].url} // Smallest image
                      alt="" // Decorative image
                      className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-500 flex items-center justify-center text-gray-100 text-xs flex-shrink-0">
                      ?
                    </div>
                  )}
                  <span className="truncate">{artist.name}</span> {/* Add truncate for long names */}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Selected Artist Display */}
        {selectedArtist && (
          <div className="mt-4 p-4 rounded bg-[#191414] text-white flex items-center gap-4 shadow">
            {/* Artist Image or Placeholder */}
            {selectedArtist.images && selectedArtist.images.length > 0 ? (
              <img
                src={selectedArtist.images[0].url} // Use the first image
                alt={`Image of ${selectedArtist.name}`}
                className="w-20 h-20 rounded object-cover border-2 border-gray-700 flex-shrink-0" // Added image display
              />
            ) : (
              <div className="w-20 h-20 rounded bg-gray-800 flex items-center justify-center text-gray-500 border-2 border-gray-700 flex-shrink-0">
                {/* Placeholder Icon */}
                <span className="text-3xl">?</span>
              </div>
            )}
            {/* Artist Info */}
            <div>
              <p className="text-xl font-bold">{selectedArtist.name}</p>
              <p className="text-sm text-gray-400">Spotify ID: {selectedArtist.id}</p>
              {/* Display Song Fetch Status */}
              {isFetchingSongs && !songFetchError && graphedArtists.length === 1 &&( // Only show this initial fetch message
                <p className="text-sm text-yellow-400 mt-2 animate-pulse">Fetching songs...</p>
              )}
              {songFetchError && (
                <p className="text-sm text-red-400 mt-2">Error: {songFetchError}</p>
              )}
              {!isFetchingSongs && !songFetchError && artistSongs.length > 0 && (
                <>
                  <p className="text-sm text-green-400 mt-2">Found {artistSongs.length} songs.</p>
                   {/* Display collaboration count based on *potential* additions */}
                   {collaborationCount > 0 && (
                        <p className="text-sm text-purple-400 mt-1">{collaborationCount} potential collaboration(s) identified.</p>
                   )}
                   {collaborationCount === 0 && graphedArtists.length > 0 && (
                       <p className="text-sm text-gray-400 mt-1">No further collaborations found yet.</p>
                   )}
                </>
              )}
              {!isFetchingSongs && !songFetchError && artistSongs.length === 0 && graphedArtists.length > 0 && (
                // Indicates fetch completed but no songs found for this artist set
                 <p className="text-sm text-gray-400 mt-2">No songs found for the current graph artists.</p>
              )}
            </div>
          </div>
        )}

        {/* Graphed Artists List - Displaying artists currently in the graph */}
        {graphedArtists.length > 0 && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-3 text-gray-300">Current Graph Artists:</h3> {/* Adjusted text color */}
            <div className="flex flex-wrap gap-3"> {/* Use flex-wrap for responsiveness */}
              {graphedArtists.map((artist) => (
                <div
                  key={artist.id}
                  className="p-2 rounded-lg bg-gray-700 border border-gray-600 flex items-center gap-2 shadow-sm relative group" // Adjusted colors
                >
                  {/* Artist Image or Placeholder */}
                  {artist.images && artist.images.length > 0 ? (
                    <img
                      src={artist.images[artist.images.length - 1].url} // Smallest image
                      alt="" // Decorative
                      className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-500 flex items-center justify-center text-gray-100 text-xs flex-shrink-0">
                      ?
                    </div>
                  )}
                  <span className="text-sm font-medium text-gray-100 truncate">{artist.name}</span> {/* Adjusted text color */}
                  {/* Remove Button - Only show if more than one artist exists */}
                   {graphedArtists.length > 1 && (
                       <button
                           onClick={() => handleRemoveArtist(artist.id)}
                           disabled={isFetchingSongs} // Disable if currently fetching other data
                           className={`ml-1 p-1 rounded-full text-red-400 hover:bg-red-800 hover:text-white focus:outline-none focus:ring-1 focus:ring-red-500 transition duration-150 ease-in-out opacity-60 group-hover:opacity-100 ${isFetchingSongs ? 'cursor-not-allowed' : ''}`} // Adjusted colors
                           aria-label={`Remove ${artist.name} from graph`}
                           title={`Remove ${artist.name}`}
                       >
                           {/* Simple X Icon */}
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                               <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                           </svg>
                       </button>
                   )}
                </div>
              ))}
            </div>
          </div>
        )}
        {/* End Graphed Artists List */}

        {/* Suggested Artist Section */}
        {suggestedArtists.length > 0 && !isFetchingSongs && ( // Show suggestions even if song list is temporarily empty during recalc
          <div className="mt-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-400">Top Collaboration Suggestions:</h3> {/* Adjusted text color */}
            {suggestedArtists.map(suggestedArtist => (
              <div
                key={suggestedArtist.id} // Use artist ID as key
                className="p-3 rounded bg-gray-700 border border-dashed border-gray-600 flex items-center gap-3 shadow-sm hover:shadow-md hover:border-gray-500 transition duration-200 ease-in-out group opacity-90 hover:opacity-100" // Adjusted colors
              >
                {/* Suggested Artist Image or Placeholder */}
                {suggestedArtist.images && suggestedArtist.images.length > 0 ? (
                  <img
                    src={suggestedArtist.images[0].url} // Use map variable
                    alt={`Suggested: ${suggestedArtist.name}`} // Use map variable
                    className="w-10 h-10 rounded-full object-cover flex-shrink-0 border border-gray-500" // Adjusted border
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-500 flex items-center justify-center text-gray-100 text-sm flex-shrink-0 border border-gray-600"> {/* Adjusted border/bg */}
                    ?
                  </div>
                )}
                {/* Suggested Artist Info */}
                <div className="flex-grow">
                  <p className="font-semibold text-gray-100 group-hover:text-green-400">{suggestedArtist.name}</p> {/* Adjusted text colors */}
                  {/* Display collaboration count for this specific suggested artist */}
                  {collaboratorCounts[suggestedArtist.id] && ( // Use map variable's ID
                    <p className="text-xs text-purple-400 group-hover:text-purple-300"> {/* Adjusted text colors */}
                      {collaboratorCounts[suggestedArtist.id].count} collaboration song(s) found {/* Use map variable's ID */}
                    </p>
                  )}
                </div>
                {/* Add Button */}
                <button
                  onClick={() => handleAddSuggestedArtist(suggestedArtist)} // Pass the specific artist from map
                  disabled={isFetchingSongs} // Disable only if fetching
                  className={`p-2 rounded-full bg-green-600 text-white hover:bg-green-500 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-1 transition duration-150 ease-in-out flex-shrink-0 ${isFetchingSongs ? 'opacity-50 cursor-not-allowed' : ''}`} // Adjusted colors
                  aria-label={`Add ${suggestedArtist.name} to graph`} // Use map variable
                  title={`Add ${suggestedArtist.name} to explore further`} // Use map variable
                >
                  {/* Plus Icon */}
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
        {/* Show message if graph exists but no suggestions found */}
         {!isFetchingSongs && suggestedArtists.length === 0 && graphedArtists.length > 0 && collaborationCount === 0 && (
             <p className="text-sm text-gray-500 mt-4">No further collaborations found based on the current graph.</p>
         )}
      </div>

      {/* Right Panel: Selected Artist Details & Playlist */}
      <div className="w-full md:w-2/3 flex flex-col bg-gray-800 rounded-lg overflow-y-auto"> {/* Adjusted background */}
        {/* Conditional Rendering based on selection/fetching */}
        {isFetchingSongs && graphedArtists.length > 0 && ( // Show loading only when adding/initially fetching
          <div className="flex justify-center items-center h-full p-4">
            <div className="text-center">
              <svg className="animate-spin h-8 w-8 text-green-400 mx-auto mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="text-lg font-semibold text-gray-300">Loading songs for {graphedArtists[graphedArtists.length -1]?.name || 'artist'}...</p>
            </div>
          </div>
        )}

        {/* Show Song Fetch Error (only if not loading) */}
        {!isFetchingSongs && songFetchError && (
          <div className="flex justify-center items-center h-full p-4">
            <p className="text-red-400 text-center">Error fetching songs: {songFetchError}</p> {/* Adjusted text color */}
          </div>
        )}

        {/* Show Playlist Section (only if not loading, no error, and graph has artists) */}
        {!isFetchingSongs && !songFetchError && graphedArtists.length > 0 && (
           <div className="p-4 flex-grow flex flex-col"> {/* Adjusted: Removed rounded-lg/bg-gray-800 (now on parent), Added flex-grow/flex-col */}
            {/* Playlist Header */}
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-700"> {/* Added border */}
              <h2 className="text-xl font-semibold text-white">
                Potential Playlist
                <span className="text-sm text-gray-400 ml-2">
                  ({filteredSongs.length} Songs) {/* Simplified title */}
                </span>
              </h2>
              <label className="flex items-center text-sm text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  id="collabFilter"
                  checked={showOnlyCollaborations}
                  onChange={(e) => setShowOnlyCollaborations(e.target.checked)}
                   className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-green-500 focus:ring-green-600 cursor-pointer mr-2" /* Adjusted colors */
                />
                <span className="select-none"> {/* Removed redundant classes */}
                  Show Only Collaborations
                </span>
              </label>
            </div>
            {/* Song List */}
            <ul className="flex-grow overflow-y-auto space-y-1 pr-2 -mr-2"> {/* Added negative margin to offset padding for scrollbar */}
              {filteredSongs
                .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0)) // Sort by popularity descending
                .map((song) => ( // Map over sorted songs
                  <li
                    key={`${song.id}-${song.artists.map(a=>a.id).join('-')}`} // More robust key for potential duplicates across fetches
                    className="py-2 px-3 border-b border-gray-700 last:border-b-0 hover:bg-gray-700 rounded transition-colors duration-150 ease-in-out" /* Adjusted: padding, border color, hover bg */
                  >
                    <span className="font-medium text-gray-100">{song.name}</span> {/* Adjusted: text color */}
                    <span className="text-gray-400 text-xs block sm:inline sm:ml-2">by {song.artists.map(a => a.name).join(', ')}</span> {/* Adjusted: text color, size, layout */}
                  </li>
                ))}
              {/* Show message if filter hides all songs */}
              {filteredSongs.length === 0 && showOnlyCollaborations && artistSongs.length > 0 && ( // Only show if songs exist but are filtered out
                <li className="text-gray-500 italic py-2 px-3">No collaborations found in the current list.</li>
              )}
              {/* Show message if no songs at all were found for the graph */}
              {artistSongs.length === 0 && (
                <li className="text-gray-500 italic py-2 px-3">No songs found for the current graph artists.</li>
              )}
            </ul>
            {/* Footer: Add Create Playlist Button & Status */}
            <div className="mt-4 pt-3 border-t border-gray-700 flex flex-col items-stretch gap-2"> {/* Adjusted: border color, items-stretch */}
                {/* Playlist Creation Status */}
                 {playlistCreationStatus && (
                     <p className={`text-sm ${playlistCreationStatus.success ? 'text-green-400' : 'text-red-400'}`}>
                         {playlistCreationStatus.message}
                     </p>
                 )}
                 {createdPlaylistUrl && playlistCreationStatus?.success && (
                      <a
                         href={createdPlaylistUrl}
                         target="_blank"
                         rel="noopener noreferrer"
                         className={`mt-1 w-full block text-center px-5 py-2 rounded-md bg-blue-600 text-white font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-150 ease-in-out shadow-sm hover:shadow`}
                         title="Open the created playlist on Spotify"
                      >
                          View Created Playlist
                      </a>
                 )}

                 {/* Create Playlist Button (only if no URL exists or creation failed) */}
                 {(!createdPlaylistUrl || !playlistCreationStatus?.success) && (
                      <button
                         onClick={() => handleCreatePlaylist(filteredSongs)} // Pass filtered songs
                         disabled={isCreatingPlaylist || filteredSongs.length === 0}
                         className={`w-full px-5 py-2 rounded-md bg-green-600 text-white font-semibold hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow ${isCreatingPlaylist ? 'animate-pulse' : ''}`}
                         title={filteredSongs.length > 0 ? "Create a Spotify playlist from the visible songs" : "No songs to create playlist"}
                      >
                         {isCreatingPlaylist ? 'Creating...' : 'Create Playlist on Spotify'}
                      </button>
                 )}
            </div>
          </div>
        )}

        {/* Placeholder when no artist is selected or graph is empty */}
        {!isFetchingSongs && !songFetchError && graphedArtists.length === 0 && (
          <div className="flex justify-center items-center h-full p-4">
            <p className="text-gray-500 text-lg">Search for an artist to start building your graph.</p>
          </div>
        )}
      </div>
    </div>
  );
}
