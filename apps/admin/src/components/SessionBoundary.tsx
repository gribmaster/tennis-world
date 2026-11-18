import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { setUnauthorizedHandler } from '../lib/api-client';

/**
 * Wires `apiFetch`'s central 401 handler (TASK_74 decision 3) to an actual
 * navigation. Must be mounted once, inside the router, before anything else
 * that might call `apiFetch` — so it sits at the very top of `<App>`'s route
 * tree, alongside (not inside) the authenticated routes.
 */
export function SessionBoundary(): null {
  const navigate = useNavigate();

  useEffect(() => {
    setUnauthorizedHandler(() => navigate('/login', { replace: true }));
    return () => setUnauthorizedHandler(null);
  }, [navigate]);

  return null;
}
