import { Buffer } from 'buffer'; // Import Buffer for Node.js environment if needed, or rely on browser Buffer

// Function to generate a random string for the code verifier
export const generateRandomString = (length: number): string => {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

// Function to compute SHA256 hash
export const sha256 = async (plain: string): Promise<ArrayBuffer> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  // Check if running in a browser environment that supports SubtleCrypto
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    return window.crypto.subtle.digest('SHA-256', data);
  }
  // If not in a browser or SubtleCrypto is not supported, throw an error
  // because this function is crucial for the client-side PKCE flow.
  throw new Error('Crypto module not available in this environment. This function requires a browser environment with Web Crypto API support.');
};

// Function to base64 encode the hash in a URL-safe way
export const base64encode = (input: ArrayBuffer): string => {
  // Use Buffer for Node.js environment if needed
  if (typeof window === 'undefined') {
    return Buffer.from(input)
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  } else {
    // Browser environment
    // Convert ArrayBuffer to string using Uint8Array
    const bytes = new Uint8Array(input);
    let binary = '';
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary)
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
  }
};

// Function to request the access token
export const getToken = async (code: string, codeVerifier: string, clientId: string, redirectUri: string): Promise<any> => {
  const url = "https://accounts.spotify.com/api/token";

  const payload = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  };

  try {
    const body = await fetch(url, payload);
    if (!body.ok) {
      console.error("Error fetching token:", body.status, await body.text());
      throw new Error(`Failed to fetch token: ${body.status}`);
    }
    const response = await body.json();
    return response;
  } catch (error) {
    console.error("Error in getToken:", error);
    throw error; // Re-throw the error to be handled by the caller
  }
};

// Function to fetch user profile data
export const getUserProfile = async (accessToken: string): Promise<any> => {
  const url = "https://api.spotify.com/v1/me";

  const payload = {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  };

  try {
    const response = await fetch(url, payload);
    if (!response.ok) {
      // If token is invalid (401) or other error, log and throw
      console.error("Error fetching user profile:", response.status, await response.text());
      throw new Error(`Failed to fetch user profile: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error in getUserProfile:", error);
    throw error; // Re-throw the error
  }
};