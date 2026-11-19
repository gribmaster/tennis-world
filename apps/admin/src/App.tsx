import { Authenticated, Refine } from '@refinedev/core';
import routerProvider, { UnsavedChangesNotifier } from '@refinedev/react-router';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { ConfigProvider } from 'antd';
import { authProvider } from './lib/auth-provider';
import { dataProvider } from './lib/data-provider';
import { AppLayout } from './components/AppLayout';
import { RootErrorBoundary } from './components/RootErrorBoundary';
import { SessionBoundary } from './components/SessionBoundary';
import { LoginPage } from './pages/LoginPage';
import { CourtListPage } from './pages/CourtListPage';
import { CourtFormPage } from './pages/CourtFormPage';
import { CourtImportPage } from './pages/CourtImportPage';
import { NotFoundPage } from './pages/NotFoundPage';

export function App() {
  return (
    <RootErrorBoundary>
      <ConfigProvider>
        <BrowserRouter>
          <SessionBoundary />
          <Refine
            authProvider={authProvider}
            dataProvider={dataProvider}
            routerProvider={routerProvider}
            options={{
              disableTelemetry: true,
              warnWhenUnsavedChanges: true,
              syncWithLocation: false,
            }}
          >
            <UnsavedChangesNotifier />
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/"
                element={
                  <Authenticated key="authenticated" redirectOnFail="/login">
                    <AppLayout />
                  </Authenticated>
                }
              >
                <Route index element={<Navigate to="/courts" replace />} />
                <Route path="courts" element={<CourtListPage />} />
                <Route path="courts/create" element={<CourtFormPage />} />
                <Route path="courts/import" element={<CourtImportPage />} />
                <Route path="courts/:id/edit" element={<CourtFormPage />} />
              </Route>
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Refine>
        </BrowserRouter>
      </ConfigProvider>
    </RootErrorBoundary>
  );
}
