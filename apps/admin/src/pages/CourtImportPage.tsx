import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Alert, Button, Card, Input, Modal, Table, Tag, Typography, message } from 'antd';
import type { AdminCourtImportItemResultDTO, AdminCourtImportReportDTO } from '@tennis/contracts';
import { useDocumentTitle } from '../lib/use-document-title';
import { importCourts } from '../lib/court-import-api';
import { ApiError, NETWORK_ERROR_MESSAGE } from '../lib/api-error';
import { ApiErrorAlert } from '../components/ApiErrorAlert';
import {
  buildAgentErrorMessage,
  googleMapsPinLink,
  isCheckCurrent,
  osmLink,
  parseImportInput,
  summarizeForConfirm,
} from '../lib/court-import';

// ─────────────────────────────────────────────────────────────────────────────
// Import courts (TASK_80). Always a two-step flow — Check (dry run) then
// review then Create — over the TASK_79 endpoint `POST /v1/admin/courts/import`.
// State is in-memory only (decision 3): no persisted browser storage of any
// kind, so a page reload loses the pasted JSON.
//
// The TASK_79 report never echoes back lat/lng/surface/access/tags/country-
// region names (see `AdminCourtImportItemResultDTO` in `@tennis/contracts`) —
// this page already has the full parsed input (it built the request body), so
// every display field below except `resolved`/`errors`/`warnings`/`sources`/
// `notes`/`courtId` is read from the admin's own parsed JSON, zipped to the
// report by index. No API change was needed.
// ─────────────────────────────────────────────────────────────────────────────

const KIT_LINKS: Array<{ href: string; label: string; hint: string }> = [
  {
    href: '/court-import/AGENT_PROMPT.md',
    label: 'Agent prompt (AGENT_PROMPT.md)',
    hint: 'the instructions: how to turn the PDF into the JSON — give this to the agent',
  },
  {
    href: '/court-import/court-import.schema.json',
    label: 'Schema (court-import.schema.json)',
    hint: 'the exact file format and allowed values — give this to the agent too',
  },
  {
    href: '/court-import/example.json',
    label: 'Example (example.json)',
    hint: 'a finished example of the output (the five courts of the reference PDF)',
  },
  {
    href: '/court-import/CLIENT_GUIDE.ru.md',
    label: 'Client guide, in Russian (CLIENT_GUIDE.ru.md)',
    hint: 'step-by-step instructions for the client — for you, not for the agent',
  },
];

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}
function asNumber(v: unknown): number | null {
  return typeof v === 'number' ? v : null;
}
function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Maps a request failure to the plain message this page shows (decision 6).
 *  403 is handled separately via the shared `ApiErrorAlert`. */
function describeRequestError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.statusCode === 413) return 'File is too large.';
    if (err.statusCode === 429) {
      return err.retryAfterSeconds
        ? `Too many requests — try again in ${err.retryAfterSeconds} seconds.`
        : 'Too many requests — try again shortly.';
    }
    if (err.statusCode === 409) return 'A concurrent import changed the data — check again.';
    return err.message;
  }
  return NETWORK_ERROR_MESSAGE;
}

function isImportReportBody(body: unknown): body is AdminCourtImportReportDTO {
  return (
    body !== null &&
    typeof body === 'object' &&
    Array.isArray((body as { items?: unknown }).items) &&
    typeof (body as { ok?: unknown }).ok === 'boolean'
  );
}

export function CourtImportPage() {
  useDocumentTitle('Import courts');
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileText, setFileText] = useState('');
  const [checking, setChecking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [checkedText, setCheckedText] = useState<string | null>(null);
  const [checkedCourts, setCheckedCourts] = useState<unknown[] | null>(null);
  const [report, setReport] = useState<AdminCourtImportReportDTO | null>(null);
  const [requestError, setRequestError] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);
  const [created, setCreated] = useState<{ name: string; courtId: string }[] | null>(null);

  const parsed = useMemo(() => parseImportInput(fileText), [fileText]);
  const current = isCheckCurrent(checkedText, fileText);
  const canCreate = report !== null && report.ok && current && !creating;

  function resetResult(): void {
    setReport(null);
    setCheckedText(null);
    setCheckedCourts(null);
    setRequestError(null);
    setCopied(false);
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setFileText(typeof reader.result === 'string' ? reader.result : '');
      setCreated(null);
      resetResult();
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function handleTextChange(value: string): void {
    setFileText(value);
    setCreated(null);
    resetResult();
  }

  function handleClear(): void {
    setFileText('');
    setCreated(null);
    resetResult();
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleCheck(): Promise<void> {
    if (!parsed.ok) return;
    setChecking(true);
    setRequestError(null);
    try {
      const nextReport = await importCourts(parsed.courts, true);
      setReport(nextReport);
      setCheckedText(fileText);
      setCheckedCourts(parsed.courts);
      setCopied(false);
    } catch (err) {
      setRequestError(err);
      setReport(null);
      setCheckedText(null);
      setCheckedCourts(null);
    } finally {
      setChecking(false);
    }
  }

  function handleCreateClick(): void {
    if (!report || !checkedCourts) return;
    const summary = summarizeForConfirm(report);
    Modal.confirm({
      title: 'Create draft courts?',
      content: (
        <p>
          {summary.drafts} court{summary.drafts === 1 ? '' : 's'} will be created as <strong>drafts</strong>,{' '}
          <strong>locked (premium)</strong>; {summary.newCountries} new countr
          {summary.newCountries === 1 ? 'y' : 'ies'} and {summary.newRegions} new region
          {summary.newRegions === 1 ? '' : 's'} will be added. Photos are added afterwards on each court&rsquo;s
          page. This cannot be undone from this screen.
        </p>
      ),
      okText: `Create ${summary.drafts} draft court${summary.drafts === 1 ? '' : 's'}`,
      onOk: handleCreateConfirm,
    });
  }

  async function handleCreateConfirm(): Promise<void> {
    if (!checkedCourts) return;
    setCreating(true);
    setRequestError(null);
    try {
      const commitReport = await importCourts(checkedCourts, false);
      const createdCourts = commitReport.items
        .filter((item): item is AdminCourtImportItemResultDTO & { courtId: string } => Boolean(item.courtId))
        .map((item) => ({ name: item.name ?? `Court ${item.index + 1}`, courtId: item.courtId }));
      setCreated(createdCourts);
      setFileText('');
      resetResult();
      message.success(`${createdCourts.length} court${createdCourts.length === 1 ? '' : 's'} created as drafts.`);
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 422 && isImportReportBody(err.body)) {
        setReport(err.body);
        setCheckedText(null);
        setCheckedCourts(null);
        message.error('Something changed since you checked — re-check before creating.');
      } else {
        setRequestError(err);
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleCopyErrors(): Promise<void> {
    if (!report) return;
    const text = buildAgentErrorMessage(report);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        fallbackCopy(text);
      }
      setCopied(true);
    } catch {
      fallbackCopy(text);
      setCopied(true);
    }
  }

  const rows = useMemo(() => {
    if (!report || !checkedCourts) return [];
    return report.items.map((item) => ({
      item,
      raw: asRecord(checkedCourts[item.index]),
    }));
  }, [report, checkedCourts]);

  return (
    <div style={{ maxWidth: 1100 }}>
      <Typography.Title level={3}>Import courts</Typography.Title>

      <Card title="Before you start" size="small" style={{ marginBottom: 16 }}>
        <p>Give the agent the court PDF, the prompt and the schema; it copies the data from the PDF and returns one JSON file.</p>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {KIT_LINKS.map((link) => (
            <li key={link.href}>
              <a href={link.href} download>
                {link.label}
              </a>
              {' — '}
              <span>{link.hint}</span>
            </li>
          ))}
        </ul>
      </Card>

      {created ? (
        <Card title="Courts created" size="small" style={{ marginBottom: 16 }}>
          <div role="status">
            <Alert
              type="success"
              showIcon
              message={`${created.length} court${created.length === 1 ? '' : 's'} created as drafts`}
            />
          </div>
          <ul style={{ paddingLeft: 20 }}>
            {created.map((c) => (
              <li key={c.courtId}>
                <Link to={`/courts/${c.courtId}/edit`}>{c.name}</Link>
              </li>
            ))}
          </ul>
          <p style={{ color: '#888' }}>
            Add photos on each court, check the coordinates on the map, then publish.
          </p>
          <Button type="primary" onClick={() => navigate('/courts')}>
            Go to draft courts
          </Button>
        </Card>
      ) : (
        <>
          <Card title="Court data" size="small" style={{ marginBottom: 16 }}>
            <p style={{ color: '#888', marginTop: 0 }}>
              A page reload loses this text — nothing is saved until you create the courts.
            </p>
            <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={handleFileChange} />
            <Input.TextArea
              style={{ marginTop: 12, fontFamily: 'monospace' }}
              rows={14}
              value={fileText}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder='{ "courts": [ ... ] }'
            />
            <p style={{ color: '#888' }}>
              {fileText.length} character{fileText.length === 1 ? '' : 's'}
              {parsed.ok ? ` · ${parsed.courts.length} court${parsed.courts.length === 1 ? '' : 's'} found` : ''}
              {parsed.ok && parsed.wrapped ? ' · wrapped a plain list as { "courts": [...] }' : ''}
              {parsed.ok && parsed.fenced ? ' · Used the first JSON block; text after it was ignored.' : ''}
            </p>
            {!parsed.ok && fileText.length > 0 && <Alert type="warning" showIcon message={parsed.message} />}

            <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
              <Button type="primary" loading={checking} disabled={!parsed.ok || checking || creating} onClick={handleCheck}>
                Check
              </Button>
              <Button disabled={checking || creating} onClick={handleClear}>
                Clear
              </Button>
            </div>
          </Card>

          {requestError !== null &&
            (requestError instanceof ApiError && requestError.statusCode === 403 ? (
              <ApiErrorAlert error={requestError} />
            ) : (
              <div role="alert" style={{ marginBottom: 16 }}>
                <Alert type="error" showIcon message={describeRequestError(requestError)} />
              </div>
            ))}

          {report && (
            <Card title="Result" size="small" style={{ marginBottom: 16 }}>
              {!current && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message="The text has changed since this check — re-check before creating."
                />
              )}
              <div role={report.ok ? 'status' : 'alert'}>
                <Alert
                  type={report.ok ? 'success' : 'error'}
                  showIcon
                  message={
                    report.ok
                      ? `All ${report.summary.total} court${report.summary.total === 1 ? '' : 's'} are valid — ready to create as drafts`
                      : `${report.summary.invalid} court${report.summary.invalid === 1 ? '' : 's'} have errors — nothing will be imported until all are fixed`
                  }
                />
              </div>
              <p style={{ color: '#888' }}>
                Total {report.summary.total} · Valid {report.summary.valid} · Invalid {report.summary.invalid} · New
                countries {report.summary.newCountries} · New regions {report.summary.newRegions} · Warnings{' '}
                {report.summary.warnings}
              </p>

              {!report.ok && (
                <Button onClick={handleCopyErrors} style={{ marginBottom: 12 }}>
                  {copied ? 'Copied' : 'Copy errors for the agent'}
                </Button>
              )}

              <Table
                rowKey={(row) => row.item.index}
                dataSource={rows}
                pagination={false}
                size="small"
                expandable={{
                  defaultExpandedRowKeys: rows.filter((r) => r.item.errors.length > 0).map((r) => r.item.index),
                  rowExpandable: (row) =>
                    row.item.errors.length > 0 || row.item.warnings.length > 0 || row.item.sources.length > 0 || Boolean(row.item.notes),
                  expandedRowRender: (row) => <ItemDetail row={row} />,
                }}
                columns={[
                  {
                    title: 'Status',
                    key: 'status',
                    render: (_, row) => {
                      if (row.item.errors.length > 0) return <Tag color="error">Error</Tag>;
                      if (row.item.warnings.length > 0) return <Tag color="warning">Warning</Tag>;
                      return <Tag color="success">OK</Tag>;
                    },
                  },
                  { title: '#', key: 'index', render: (_, row) => row.item.index + 1 },
                  { title: 'Name', key: 'name', render: (_, row) => row.item.name ?? asString(row.raw.name) ?? '—' },
                  { title: 'Slug', key: 'slug', render: (_, row) => row.item.slug ?? asString(row.raw.slug) ?? '—' },
                  {
                    title: 'Country',
                    key: 'country',
                    render: (_, row) => {
                      const country = asRecord(row.raw.country);
                      return (
                        <>
                          {asString(country.name) ?? '—'}
                          {row.item.resolved.country === 'create' && <Tag style={{ marginLeft: 6 }}>new</Tag>}
                        </>
                      );
                    },
                  },
                  {
                    title: 'Region',
                    key: 'region',
                    render: (_, row) => (
                      <>
                        {asString(row.raw.region) ?? '—'}
                        {row.item.resolved.region === 'create' && <Tag style={{ marginLeft: 6 }}>new</Tag>}
                      </>
                    ),
                  },
                  {
                    title: 'Lat, Lng',
                    key: 'coords',
                    render: (_, row) => {
                      const hasLatError = row.item.errors.some((e) => e.path === 'lat');
                      const hasLngError = row.item.errors.some((e) => e.path === 'lng');
                      const lat = asNumber(row.raw.lat);
                      const lng = asNumber(row.raw.lng);
                      const osm = !hasLatError && !hasLngError ? osmLink(lat, lng) : null;
                      const googlePin = !hasLatError && !hasLngError ? googleMapsPinLink(lat, lng) : null;
                      const hasMapLinkError = row.item.errors.some((e) => e.path === 'mapLinkUrl');
                      const mapLink = !hasMapLinkError ? asString(row.raw.mapLinkUrl) : null;
                      return (
                        <>
                          {lat ?? '—'}, {lng ?? '—'}
                          {osm && (
                            <>
                              {' · '}
                              <a href={osm} target="_blank" rel="noopener noreferrer">
                                OSM
                              </a>
                            </>
                          )}
                          {mapLink && (
                            <>
                              {' · '}
                              <a href={mapLink} target="_blank" rel="noopener noreferrer">
                                Google Maps
                              </a>
                            </>
                          )}
                          {googlePin && (
                            <>
                              {' · '}
                              <a href={googlePin} target="_blank" rel="noopener noreferrer">
                                Google pin
                              </a>
                            </>
                          )}
                        </>
                      );
                    },
                  },
                  {
                    title: 'Surface / Access / I-O',
                    key: 'details',
                    render: (_, row) =>
                      [asString(row.raw.surface), asString(row.raw.access), asString(row.raw.indoorOutdoor)]
                        .filter(Boolean)
                        .join(' / ') || '—',
                  },
                  {
                    title: 'Tags',
                    key: 'tags',
                    render: (_, row) => (
                      <>
                        {asStringArray(row.raw.tags).map((t) => (
                          <Tag key={t}>{t}</Tag>
                        ))}
                        {row.item.resolved.isLocked === true && <Tag color="gold">Locked</Tag>}
                      </>
                    ),
                  },
                ]}
              />
            </Card>
          )}

          {report && (
            <Button type="primary" disabled={!canCreate} loading={creating} onClick={handleCreateClick}>
              Create {report.summary.valid} draft court{report.summary.valid === 1 ? '' : 's'}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function ItemDetail({ row }: { row: { item: AdminCourtImportItemResultDTO; raw: Record<string, unknown> } }) {
  const { item } = row;
  const sources = item.sources;
  return (
    <div>
      {item.errors.length > 0 && (
        <div>
          <strong>Errors</strong>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {item.errors.map((e, i) => (
              <li key={i}>
                <code>{e.path}</code> {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {item.warnings.length > 0 && (
        <div>
          <strong>Warnings</strong>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {item.warnings.map((w, i) => (
              <li key={i}>
                <code>{w.path}</code> {w.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {sources.length > 0 && (
        <div>
          <strong>Sources</strong>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {sources.map((s, i) => (
              <li key={i}>
                <a href={s} target="_blank" rel="noopener noreferrer">
                  {s}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {item.notes && <p>{item.notes}</p>}
    </div>
  );
}

function fallbackCopy(text: string): void {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.readOnly = true;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
}
