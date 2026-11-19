import { useEffect, useState } from 'react';
import { useCreate, useOne, useUpdate, useWarnAboutChange } from '@refinedev/core';
import { useNavigate, useParams } from 'react-router';
import {
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Space,
  Switch,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  COURT_TAGS,
  type AccessType,
  type AdminCourtDetailDTO,
  type CourtStatus,
  type CourtTag,
  type IndoorOutdoor,
  type Surface,
} from '@tennis/contracts';
import { ApiErrorAlert } from '../components/ApiErrorAlert';
import { CountryRegionFields } from '../components/CountryRegionFields';
import { CourtPhotosPanel } from '../components/CourtPhotosPanel';
import { useDocumentTitle } from '../lib/use-document-title';
import { listCountries } from '../lib/geo-api';
import { buildCourtPatch, courtDetailToFormValues, type CourtFormValues } from '../lib/court-patch';
import { slugify, URL_SAFE_SLUG_PATTERN } from '../lib/slugify';
import { MAPS_LINK_UNREADABLE_MESSAGE, parseCoordinatesFromMapLink } from '../lib/maps-link-parser';
import { googleMapsPinLink, osmLink } from '../lib/court-import';
import type { AdminCountryDTO } from '@tennis/contracts';

const SURFACES: Surface[] = ['Clay', 'Hard', 'Grass'];
const ACCESS_TYPES: AccessType[] = ['Resort', 'Club', 'Academy', 'Private'];
const INDOOR_OUTDOOR: IndoorOutdoor[] = ['Indoor', 'Outdoor'];

const DEFAULT_VALUES: CourtFormValues = {
  name: '',
  slug: '',
  countryId: '',
  regionId: '',
  lat: 0,
  lng: 0,
  mapLinkUrl: '',
  surface: 'Hard',
  setting: '',
  access: 'Club',
  indoorOutdoor: 'Outdoor',
  isScenic: false,
  isFeatured: false,
  isLocked: false,
  status: 'draft',
  blurb: '',
  tags: [],
};

const WEB_BASE_URL = import.meta.env.VITE_WEB_BASE_URL;

export function CourtFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [form] = Form.useForm<CourtFormValues>();
  const { setWarnWhen } = useWarnAboutChange();
  const watchedLat = Form.useWatch('lat', form);
  const watchedLng = Form.useWatch('lng', form);

  useDocumentTitle(isEdit ? 'Edit court' : 'New court');

  const { query, result: court } = useOne<AdminCourtDetailDTO>({
    resource: 'courts',
    id: id!,
    queryOptions: { enabled: isEdit },
  });

  const create = useCreate<AdminCourtDetailDTO>();
  const update = useUpdate<AdminCourtDetailDTO>();

  const [countries, setCountries] = useState<AdminCountryDTO[]>([]);
  const [slugTouched, setSlugTouched] = useState(isEdit);

  useEffect(() => {
    listCountries()
      .then(setCountries)
      .catch(() => message.error('Could not load countries.'));
  }, []);

  useEffect(() => {
    if (court) {
      form.setFieldsValue(courtDetailToFormValues(court));
      setSlugTouched(true);
    }
  }, [court, form]);

  const mutationError = isEdit ? update.mutation.error : create.mutation.error;
  const saving = isEdit ? update.mutation.isPending : create.mutation.isPending;

  function handleCountriesChanged(updated: AdminCountryDTO[], selectCountryId?: string, selectRegionId?: string): void {
    setCountries(updated);
    if (selectCountryId) {
      form.setFieldsValue({ countryId: selectCountryId, regionId: selectRegionId });
    }
  }

  function handleNameChange(name: string): void {
    if (!slugTouched) {
      form.setFieldsValue({ slug: slugify(name) });
    }
  }

  function handleFillFromLink(): void {
    const link = form.getFieldValue('mapLinkUrl') as string | undefined;
    const coords = link ? parseCoordinatesFromMapLink(link) : null;
    if (!coords) {
      message.warning(MAPS_LINK_UNREADABLE_MESSAGE);
      return;
    }
    form.setFieldsValue({ lat: coords.lat, lng: coords.lng });
  }

  async function handleSaveDraft(values: CourtFormValues): Promise<void> {
    const mapLinkUrl = values.mapLinkUrl.trim().length > 0 ? values.mapLinkUrl.trim() : null;
    create.mutate(
      { resource: 'courts', values: { ...values, mapLinkUrl, status: 'draft' } },
      {
        onSuccess: ({ data }) => {
          setWarnWhen(false);
          message.success('Court saved as draft.');
          navigate(`/courts/${data.id}/edit`, { replace: true });
        },
      },
    );
  }

  async function handleSaveEdit(values: CourtFormValues, forcedStatus?: CourtStatus): Promise<void> {
    if (!court) return;
    const nextValues = forcedStatus ? { ...values, status: forcedStatus } : values;
    const patch = buildCourtPatch(court, nextValues);
    if (Object.keys(patch).length === 0) {
      message.info('Nothing changed.');
      return;
    }
    update.mutate(
      { resource: 'courts', id: court.id, values: patch },
      {
        onSuccess: () => {
          setWarnWhen(false);
          message.success(forcedStatus === 'published' ? 'Court published.' : 'Court saved.');
          void query.refetch();
        },
      },
    );
  }

  function handleUnpublish(): void {
    Modal.confirm({
      title: 'Unpublish this court?',
      content: 'The court disappears from the public site and from users’ saved lists.',
      okText: 'Unpublish',
      onOk: async () => {
        const values = form.getFieldsValue();
        await handleSaveEdit(values, 'draft');
      },
    });
  }

  if (isEdit && query.isLoading) {
    return <p>Loading…</p>;
  }
  if (isEdit && query.error) {
    return <ApiErrorAlert error={query.error} />;
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <Typography.Title level={3}>{isEdit ? 'Edit court' : 'New court'}</Typography.Title>

      {mutationError && <ApiErrorAlert error={mutationError} />}

      <Form<CourtFormValues>
        form={form}
        layout="vertical"
        initialValues={DEFAULT_VALUES}
        onValuesChange={() => setWarnWhen(true)}
        onFinish={(values) => (isEdit ? handleSaveEdit(values) : handleSaveDraft(values))}
      >
        <Card title="Basics" size="small" style={{ marginBottom: 16 }}>
          <Form.Item name="name" label="Name" rules={[{ required: true, min: 2, max: 120 }]}>
            <Input onChange={(e) => handleNameChange(e.target.value)} />
          </Form.Item>

          <Form.Item
            name="slug"
            label="Slug"
            tooltip={
              court?.status === 'published'
                ? 'The slug cannot change once a court has been published.'
                : undefined
            }
            rules={[{ required: true, pattern: URL_SAFE_SLUG_PATTERN, message: 'Lower-case letters, digits, and hyphens only.' }]}
          >
            <Input
              disabled={court?.status === 'published'}
              onChange={() => setSlugTouched(true)}
            />
          </Form.Item>

          <Form.Item
            name="status"
            label="Status"
            tooltip={!isEdit ? 'New courts are always created as drafts — publish once photos are added.' : undefined}
          >
            <Radio.Group disabled={!isEdit}>
              <Radio value="draft">Draft</Radio>
              <Radio value="published">Published</Radio>
            </Radio.Group>
          </Form.Item>

          {isEdit && court && (
            <p style={{ color: '#888', fontSize: 13 }}>
              {court.status === 'published' ? (
                WEB_BASE_URL ? (
                  <a href={`${WEB_BASE_URL}/courts/${court.slug}`} target="_blank" rel="noopener noreferrer">
                    View on site
                  </a>
                ) : null
              ) : (
                'Drafts are not visible on the public site.'
              )}
            </p>
          )}
        </Card>

        <Card title="Place" size="small" style={{ marginBottom: 16 }}>
          <CountryRegionFields form={form} countries={countries} onCountriesChanged={handleCountriesChanged} />
        </Card>

        <Card title="Exact location" size="small" style={{ marginBottom: 16 }}>
          <Form.Item name="lat" label="Latitude" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={-90} max={90} />
          </Form.Item>
          <Form.Item name="lng" label="Longitude" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={-180} max={180} />
          </Form.Item>
          {(() => {
            const osm = osmLink(watchedLat, watchedLng);
            const googlePin = googleMapsPinLink(watchedLat, watchedLng);
            if (!osm || !googlePin) return null;
            return (
              <p style={{ fontSize: 13, marginTop: -8 }}>
                <a href={osm} target="_blank" rel="noopener noreferrer">
                  Check on map (OpenStreetMap)
                </a>
                {' · '}
                <a href={googlePin} target="_blank" rel="noopener noreferrer">
                  Open in Google Maps
                </a>
              </p>
            );
          })()}
          <Form.Item label="Google Maps link">
            <Space.Compact style={{ width: '100%' }}>
              <Form.Item name="mapLinkUrl" noStyle>
                <Input />
              </Form.Item>
              <Button onClick={handleFillFromLink}>Fill coordinates from link</Button>
            </Space.Compact>
          </Form.Item>
          {isEdit && court && (
            <p style={{ color: '#888', fontSize: 13 }}>
              Approximate point shown publicly: {court.approxLat}, {court.approxLng}
            </p>
          )}
          <p style={{ color: '#888', fontSize: 13 }}>
            Visitors without premium only ever see an approximate area; this exact point is shown to members only.
          </p>
        </Card>

        <Card title="Details" size="small" style={{ marginBottom: 16 }}>
          <Form.Item name="surface" label="Surface" rules={[{ required: true }]}>
            <Select options={SURFACES.map((s) => ({ value: s, label: s }))} />
          </Form.Item>
          <Form.Item name="access" label="Access" rules={[{ required: true }]}>
            <Select options={ACCESS_TYPES.map((a) => ({ value: a, label: a }))} />
          </Form.Item>
          <Form.Item name="indoorOutdoor" label="Indoor / Outdoor" rules={[{ required: true }]}>
            <Select options={INDOOR_OUTDOOR.map((v) => ({ value: v, label: v }))} />
          </Form.Item>
          <Form.Item name="setting" label="Setting" rules={[{ required: true, max: 120 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="isScenic" label="Scenic" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="isFeatured" label="Featured" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item
            name="isLocked"
            label="Locked"
            valuePropName="checked"
            extra="Premium court: name and exact location are hidden from non-members."
          >
            <Switch />
          </Form.Item>
          <Form.Item name="tags" label="Experience tags">
            <Checkbox.Group options={(COURT_TAGS as readonly CourtTag[]).map((t) => ({ value: t, label: t }))} />
          </Form.Item>
          <Form.Item
            name="blurb"
            label="Blurb"
            rules={[{ required: true, max: 4000 }]}
          >
            <Input.TextArea rows={4} maxLength={4000} showCount />
          </Form.Item>
        </Card>

        {isEdit && court ? (
          <CourtPhotosPanel courtId={court.id} images={court.images} onChanged={() => void query.refetch()} />
        ) : (
          <Card size="small" style={{ background: '#fafafa', marginBottom: 16 }}>
            <p style={{ color: '#888', margin: 0 }}>Save the court as a draft first, then add photos.</p>
          </Card>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          {!isEdit && (
            <Button type="primary" htmlType="submit" loading={saving}>
              Save draft
            </Button>
          )}
          {isEdit && (
            <>
              <Button htmlType="submit" loading={saving}>
                Save
              </Button>
              {court?.status !== 'published' ? (
                <Tooltip title="Requires at least one photo with exactly one hero, a blurb, and valid coordinates.">
                  <Button
                    type="primary"
                    loading={saving}
                    onClick={() => handleSaveEdit(form.getFieldsValue(), 'published')}
                  >
                    Publish
                  </Button>
                </Tooltip>
              ) : (
                <Button danger loading={saving} onClick={handleUnpublish}>
                  Unpublish
                </Button>
              )}
            </>
          )}
        </div>
      </Form>
    </div>
  );
}
