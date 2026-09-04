// =============================================================================
// src/hooks/useDashboardStats.js
// Fetches dashboard statistics with polling every 30 seconds
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { getDashboardStats } from '../services/api';

const POLL_INTERVAL_MS = 30_000;

export function useDashboardStats() {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const timerRef  = useRef(null);
  const isMounted = useRef(true);

  const fetch = useCallback(async () => {
    try {
      const data = await getDashboardStats();
      if (isMounted.current) {
        setStats(data);
        setError(null);
      }
    } catch (err) {
      if (isMounted.current) setError(err.message);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    fetch();

    timerRef.current = setInterval(fetch, POLL_INTERVAL_MS);

    return () => {
      isMounted.current = false;
      clearInterval(timerRef.current);
    };
  }, [fetch]);

  return { stats, loading, error, refresh: fetch };
}
