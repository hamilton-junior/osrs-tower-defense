'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-black text-white">
      <h2 className="text-2xl font-bold mb-4">Something went wrong!</h2>
      <button
        onClick={() => reset()}
        className="osrs-button px-4 py-2"
      >
        Try again
      </button>
    </div>
  );
}
