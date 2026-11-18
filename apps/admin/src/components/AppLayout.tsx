import { useGetIdentity, useLogout } from '@refinedev/core';
import { Layout, Menu, Button, Typography } from 'antd';
import type { AdminDTO } from '@tennis/contracts';
import { Link, Outlet, useLocation } from 'react-router';

const { Header, Sider, Content } = Layout;

/**
 * Minimal shell (TASK_74 §"Shell"): a top bar (app name, signed-in email,
 * Sign out) and a left menu with exactly one item, Courts. Deliberately not
 * `@refinedev/antd`'s full `<ThemedLayoutV2>` — this tool has one resource and
 * doesn't need a theme switcher, breadcrumbs, or a collapsible sider.
 */
export function AppLayout() {
  const { data: identity } = useGetIdentity<AdminDTO>();
  const logout = useLogout();
  const location = useLocation();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingInline: 24,
        }}
      >
        <Typography.Text strong style={{ color: '#fff', fontSize: 16 }}>
          Tennis World Admin
        </Typography.Text>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {identity?.email && <Typography.Text style={{ color: '#fff' }}>{identity.email}</Typography.Text>}
          <Button onClick={() => logout.mutate({})} loading={logout.isPending}>
            Sign out
          </Button>
        </div>
      </Header>
      <Layout>
        <Sider width={200}>
          <Menu
            mode="inline"
            style={{ height: '100%' }}
            selectedKeys={[location.pathname.startsWith('/courts') ? '/courts' : '']}
            items={[{ key: '/courts', label: <Link to="/courts">Courts</Link> }]}
          />
        </Sider>
        <Content style={{ padding: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
