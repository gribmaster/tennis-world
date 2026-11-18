import { useLogin } from '@refinedev/core';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { useDocumentTitle } from '../lib/use-document-title';
import type { LoginVariables } from '../lib/auth-provider';

export function LoginPage() {
  useDocumentTitle('Sign in');
  const login = useLogin<LoginVariables>();

  const errorMessage = login.data?.success === false ? login.data.error?.message : undefined;

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f5f5',
      }}
    >
      <Card style={{ width: 360 }}>
        <Typography.Title level={4} style={{ marginBottom: 24, textAlign: 'center' }}>
          Tennis World Admin
        </Typography.Title>
        {errorMessage && <Alert type="error" showIcon message={errorMessage} style={{ marginBottom: 16 }} />}
        <Form<LoginVariables> layout="vertical" onFinish={(values) => login.mutate(values)}>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input autoFocus autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" block loading={login.isPending}>
              Sign in
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
