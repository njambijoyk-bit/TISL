import { useEffect, useRef, useState } from 'react';

export default function useAuctionSSE(auctionId, isPaused = false) {
  const [data, setData] = useState(null);
  const esRef = useRef(null);

  useEffect(() => {
    if (!auctionId || isPaused) return;

    // Base URL from env or default (adjust if your API URL differs)
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    const url = `${baseUrl}/api/auctions/${auctionId}/stream`;

    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        // SSE format sends data as string
        const parsed = JSON.parse(event.data);
        setData(parsed);
      } catch (err) {
        console.error('SSE Parse Error:', err);
      }
    };

    es.onerror = () => {
      console.warn('SSE Connection lost, reconnecting...');
      es.close();
      // Browser auto-reconnects, but you can add custom backoff here if needed
    };

    return () => es.close();
  }, [auctionId, isPaused]);

  return data;
}