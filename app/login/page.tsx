'use client';

import { useEffect } from 'react';
import { generateRandomString, sha256, base64encode } from '@/lib/spotifyAuth';

const LoginPage = () => {
  const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
  const redirectUri = process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI; // e.g., http://localhost:3000/callback

  const handleLogin = async () => {
    if (!clientId || !redirectUri) {
      console.error("Missing Spotify Client ID or Redirect URI in environment variables.");
      alert("Configuration error. Please check environment variables.");
      return;
    }

    const codeVerifier = generateRandomString(64);
    const hashed = await sha256(codeVerifier);
    const codeChallenge = base64encode(hashed);

    // Store the code verifier in a cookie accessible by the API route
    // Set a short expiry, e.g., 5 minutes, as it's only needed during the callback
    const expiryDate = new Date();
    expiryDate.setTime(expiryDate.getTime() + (5 * 60 * 1000)); // 5 minutes
    document.cookie = `spotify_code_verifier=${codeVerifier}; path=/; max-age=${5 * 60}; SameSite=Lax; expires=${expiryDate.toUTCString()}`;
    // Optional: Implement state for CSRF protection
    // const state = generateRandomString(16);
    // document.cookie = `spotify_auth_state=${state}; path=/; max-age=${5 * 60}; SameSite=Lax; expires=${expiryDate.toUTCString()}`;

    const scope = 'user-read-private user-read-email playlist-modify-private'; // Add necessary scopes
    const authUrl = new URL("https://accounts.spotify.com/authorize");

    const params: Record<string, string> = {
      response_type: 'code',
      client_id: clientId,
      scope,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      redirect_uri: redirectUri,
      // state: state // Optional: Add state to params if using it
    };

    authUrl.search = new URLSearchParams(params).toString();
    window.location.href = authUrl.toString();
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-black text-white">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-8">Login with Spotify</h1>
        <button
          onClick={handleLogin}
          className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-full transition duration-300 ease-in-out transform hover:scale-105"
        >
          Connect Spotify
        </button>
      </div>
    </div>
  );
};

export default LoginPage;