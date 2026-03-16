'use client';

import React from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-black text-white p-4">
      <h2 className="text-2xl font-bold mb-4">An error occurred</h2>
      <p className="text-gray-400 mb-6">{error.message || 'Something went wrong'}</p>
      <button
        onClick={() => reset()}
        className="px-6 py-2 bg-red-800 hover:bg-red-700 text-white rounded transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
