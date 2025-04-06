import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 bg-gradient-to-b from-black to-gray-900 text-white">
      <h1 className="text-4xl font-bold mb-4">404 - Page Not Found</h1>
      <p className="mb-8 text-center max-w-md">
        Sorry, the page you are looking for does not exist.
      </p>
      <Link
        href="/"
        className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-full transition duration-300"
      >
        Return Home
      </Link>
    </div>
  );
}