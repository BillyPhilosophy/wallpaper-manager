import { useCallback, useEffect, useState } from 'react';
export function useRemote<T>(load: () => Promise<T>, dependencies: unknown[] = [], pollMs = 0) {
  const [data, setData] = useState<T | null>(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => { let alive = true; setLoading(true); const run = () => load().then((value) => { if (alive) { setData(value); setError(''); } }).catch((reason) => { if (alive) setError(reason.message || '加载失败'); }).finally(() => { if (alive) setLoading(false); }); void run(); const timer = pollMs ? window.setInterval(run, pollMs) : 0; return () => { alive = false; if (timer) clearInterval(timer); }; }, [...dependencies, revision]);
  return { data, error, loading, reload };
}
