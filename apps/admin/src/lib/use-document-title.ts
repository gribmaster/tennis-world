import { useEffect } from 'react';

/** Sets `document.title` for the current page (TASK_74 §"Shell"). */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · Tennis World Admin`;
  }, [title]);
}
