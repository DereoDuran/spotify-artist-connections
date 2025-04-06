export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 bg-gradient-to-b from-black to-gray-900 text-white">
      <div className="w-16 h-16 border-t-4 border-green-500 border-solid rounded-full animate-spin mb-4"></div>
      <p className="text-lg">Loading...</p>
    </div>
  );
}