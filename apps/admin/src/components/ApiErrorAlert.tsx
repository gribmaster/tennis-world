import { Alert } from 'antd';
import { ApiError } from '../lib/api-error';

const MISSING_FIELD_LABELS: Record<string, string> = {
  image: 'At least one photo',
  exactlyOneHeroImage: 'Exactly one photo marked as hero',
  blurb: 'A blurb',
  lat: 'A valid latitude',
  lng: 'A valid longitude',
};

/**
 * Renders any API-thrown error honestly (TASK_74 decision 7): the server's
 * `message` verbatim, the 422 publish-gate `missing` list as a checklist (not
 * a toast), and a 403 as "no access to this tool" rather than a crash.
 */
export function ApiErrorAlert({ error }: { error: unknown }) {
  if (!error) return null;

  if (error instanceof ApiError && error.statusCode === 403) {
    return <Alert type="warning" showIcon message="Your account has no access to this tool" />;
  }

  if (error instanceof ApiError && error.statusCode === 422 && error.missing && error.missing.length > 0) {
    return (
      <Alert
        type="warning"
        showIcon
        message="Cannot publish: missing required fields"
        description={
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {error.missing.map((field) => (
              <li key={field}>{MISSING_FIELD_LABELS[field] ?? field}</li>
            ))}
          </ul>
        }
      />
    );
  }

  const message = error instanceof Error ? error.message : 'Something went wrong.';
  return <Alert type="error" showIcon message={message} />;
}
