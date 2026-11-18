import { Button, Result } from 'antd';
import { Link } from 'react-router';
import { useDocumentTitle } from '../lib/use-document-title';

export function NotFoundPage() {
  useDocumentTitle('Not found');
  return (
    <Result
      status="404"
      title="Page not found"
      extra={
        <Link to="/courts">
          <Button type="primary">Back to Courts</Button>
        </Link>
      }
    />
  );
}
