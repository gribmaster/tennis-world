import { useState } from 'react';
import { Form, Input, InputNumber, Modal, Select, message } from 'antd';
import type { FormInstance } from 'antd';
import type { AdminCountryDTO, Continent } from '@tennis/contracts';
import { createCountry, createRegion } from '../lib/geo-api';
import { ApiError } from '../lib/api-error';

const CONTINENTS: Continent[] = ['Europe', 'Asia', 'Americas', 'Africa', 'Oceania'];

interface CountryRegionFieldsProps {
  form: FormInstance;
  countries: AdminCountryDTO[];
  onCountriesChanged: (countries: AdminCountryDTO[], selectCountryId?: string, selectRegionId?: string) => void;
}

const ADD_COUNTRY_VALUE = '__add_country__';
const ADD_REGION_VALUE = '__add_region__';

/**
 * Place section (TASK_74 §"Place"): country/region `Select`s with an
 * "Add country…" / "Add region…" entry that opens a small modal, creates the
 * row via the plain `geo-api.ts` helper calls, and selects it. Changing the
 * country clears the region (they don't belong together any more).
 */
export function CountryRegionFields({ form, countries, onCountriesChanged }: CountryRegionFieldsProps) {
  const [addCountryOpen, setAddCountryOpen] = useState(false);
  const [addRegionOpen, setAddRegionOpen] = useState(false);
  const countryId = Form.useWatch('countryId', form);

  const selectedCountry = countries.find((c) => c.id === countryId);

  return (
    <>
      <Form.Item
        name="countryId"
        label="Country"
        rules={[{ required: true, message: 'Select a country.' }]}
      >
        <Select
          showSearch
          placeholder="Select a country"
          optionFilterProp="label"
          onChange={(value) => {
            if (value === ADD_COUNTRY_VALUE) {
              setAddCountryOpen(true);
              return;
            }
            form.setFieldsValue({ countryId: value, regionId: undefined });
          }}
          options={[
            ...countries.map((c) => ({ value: c.id, label: c.name })),
            { value: ADD_COUNTRY_VALUE, label: '+ Add country…' },
          ]}
        />
      </Form.Item>

      <Form.Item name="regionId" label="Region" rules={[{ required: true, message: 'Select a region.' }]}>
        <Select
          showSearch
          placeholder={selectedCountry ? 'Select a region' : 'Select a country first'}
          disabled={!selectedCountry}
          optionFilterProp="label"
          onChange={(value) => {
            if (value === ADD_REGION_VALUE) {
              setAddRegionOpen(true);
              return;
            }
            form.setFieldsValue({ regionId: value });
          }}
          options={[
            ...(selectedCountry?.regions.map((r) => ({ value: r.id, label: r.name })) ?? []),
            { value: ADD_REGION_VALUE, label: '+ Add region…' },
          ]}
        />
      </Form.Item>

      <AddCountryModal
        open={addCountryOpen}
        onClose={() => setAddCountryOpen(false)}
        onCreated={(country) => {
          const updated = [...countries, { ...country, regions: [] }];
          onCountriesChanged(updated, country.id);
          setAddCountryOpen(false);
        }}
      />

      {selectedCountry && (
        <AddRegionModal
          open={addRegionOpen}
          countryId={selectedCountry.id}
          onClose={() => setAddRegionOpen(false)}
          onCreated={(region) => {
            const updated = countries.map((c) =>
              c.id === selectedCountry.id ? { ...c, regions: [...c.regions, { id: region.id, name: region.name }] } : c,
            );
            onCountriesChanged(updated, selectedCountry.id, region.id);
            setAddRegionOpen(false);
          }}
        />
      )}
    </>
  );
}

function AddCountryModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (country: { id: string; name: string; isoCode: string; continent: Continent }) => void;
}) {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  return (
    <Modal
      title="Add country"
      open={open}
      onCancel={onClose}
      okText="Add"
      okButtonProps={{ loading: submitting }}
      onOk={() => form.submit()}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={async (values: { name: string; isoCode: string; continent: Continent }) => {
          setSubmitting(true);
          try {
            const created = await createCountry(values);
            onCreated(created);
            form.resetFields();
          } catch (err) {
            message.error(err instanceof ApiError ? err.message : 'Could not create country.');
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <Form.Item name="name" label="Name" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item
          name="isoCode"
          label="ISO code"
          rules={[{ required: true, pattern: /^[A-Za-z]{2}$/, message: 'Exactly 2 letters.' }]}
        >
          <Input maxLength={2} style={{ textTransform: 'uppercase' }} />
        </Form.Item>
        <Form.Item name="continent" label="Continent" rules={[{ required: true }]}>
          <Select options={CONTINENTS.map((c) => ({ value: c, label: c }))} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function AddRegionModal({
  open,
  countryId,
  onClose,
  onCreated,
}: {
  open: boolean;
  countryId: string;
  onClose: () => void;
  onCreated: (region: { id: string; name: string }) => void;
}) {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  return (
    <Modal
      title="Add region"
      open={open}
      onCancel={onClose}
      okText="Add"
      okButtonProps={{ loading: submitting }}
      onOk={() => form.submit()}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={async (values: { name: string; lat: number; lng: number }) => {
          setSubmitting(true);
          try {
            const created = await createRegion({ ...values, countryId });
            onCreated(created);
            form.resetFields();
          } catch (err) {
            message.error(err instanceof ApiError ? err.message : 'Could not create region.');
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <Form.Item name="name" label="Name" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="lat" label="Latitude" rules={[{ required: true }]}>
          <InputNumber style={{ width: '100%' }} min={-90} max={90} />
        </Form.Item>
        <Form.Item name="lng" label="Longitude" rules={[{ required: true }]}>
          <InputNumber style={{ width: '100%' }} min={-180} max={180} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
