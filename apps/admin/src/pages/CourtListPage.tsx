import { useEffect, useState } from 'react';
import { useList } from '@refinedev/core';
import { Link, useNavigate } from 'react-router';
import { Button, Empty, Input, Select, Table, Tag, Typography } from 'antd';
import type { AdminCourtListItemDTO, CourtStatus } from '@tennis/contracts';
import { resolveImageSrc } from '../lib/image-url';
import { ApiErrorAlert } from '../components/ApiErrorAlert';
import { useDocumentTitle } from '../lib/use-document-title';

const STATUS_OPTIONS: { value: 'all' | CourtStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
];

const WEB_BASE_URL = import.meta.env.VITE_WEB_BASE_URL;

export function CourtListPage() {
  useDocumentTitle('Courts');
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState<'all' | CourtStatus>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status]);

  const { query, result } = useList<AdminCourtListItemDTO>({
    resource: 'courts',
    pagination: { currentPage: page, pageSize, mode: 'server' },
    filters: [
      { field: 'q', operator: 'contains', value: debouncedSearch || undefined },
      { field: 'status', operator: 'eq', value: status === 'all' ? undefined : status },
    ],
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Courts
        </Typography.Title>
        <Link to="/courts/create">
          <Button type="primary">New court</Button>
        </Link>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <Input.Search
          placeholder="Search by name or slug"
          allowClear
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <Select
          value={status}
          onChange={setStatus}
          options={STATUS_OPTIONS}
          style={{ width: 160 }}
        />
      </div>

      {query.error && <ApiErrorAlert error={query.error} />}

      <Table<AdminCourtListItemDTO>
        rowKey="id"
        loading={query.isLoading}
        dataSource={result.data}
        onRow={(record) => ({
          onClick: () => navigate(`/courts/${record.id}/edit`),
          style: { cursor: 'pointer' },
        })}
        locale={{
          emptyText: (
            <Empty description="No courts yet">
              <Link to="/courts/create">
                <Button type="primary">New court</Button>
              </Link>
            </Empty>
          ),
        }}
        pagination={{
          current: page,
          pageSize,
          total: result.total,
          onChange: (nextPage, nextPageSize) => {
            setPage(nextPage);
            setPageSize(nextPageSize);
          },
          showSizeChanger: true,
        }}
        columns={[
          {
            title: '',
            key: 'hero',
            width: 64,
            render: (_, record) => {
              const src = record.heroImageUrl ? resolveImageSrc(record.heroImageUrl, WEB_BASE_URL) : null;
              return src ? (
                <img src={src} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4 }} />
              ) : (
                <div style={{ width: 48, height: 48, background: '#f0f0f0', borderRadius: 4 }} />
              );
            },
          },
          { title: 'Name', dataIndex: 'name', key: 'name' },
          {
            title: 'Country · Region',
            key: 'place',
            render: (_, record) => `${record.country.name} · ${record.region.name}`,
          },
          {
            title: 'Status',
            key: 'status',
            render: (_, record) => (
              <Tag color={record.status === 'published' ? 'green' : 'default'}>{record.status}</Tag>
            ),
          },
          {
            title: 'Flags',
            key: 'flags',
            render: (_, record) => (
              <>
                {record.isLocked && <Tag color="gold">Locked</Tag>}
                {record.isFeatured && <Tag color="blue">Featured</Tag>}
              </>
            ),
          },
          { title: 'Photos', dataIndex: 'imageCount', key: 'imageCount' },
          {
            title: 'Updated',
            key: 'updatedAt',
            render: (_, record) => new Date(record.updatedAt).toLocaleString(),
          },
        ]}
      />
    </div>
  );
}
