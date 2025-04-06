'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 bg-gradient-to-b from-black to-gray-900 text-white">
      <h1 className="text-4xl font-bold mb-4">Something went wrong</h1>
      <p className="mb-6 text-center max-w-md">
        Sorry, an error occurred while loading this page.
      </p>
      <div className="flex gap-4">
        <button
          onClick={() => reset()}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-full transition duration-300"
        >
          Try again
        </button>
        <Link
          href="/"
          className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-full transition duration-300"
        >
          Return Home
        </Link>
      </div>
    </div>
  );
}