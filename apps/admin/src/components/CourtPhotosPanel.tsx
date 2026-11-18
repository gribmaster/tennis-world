import { useRef, useState } from 'react';
import { Alert, Button, Card, Input, Modal, Upload, message } from 'antd';
import type { UploadProps } from 'antd';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { AdminCourtImageDTO } from '@tennis/contracts';
import {
  deleteCourtImage,
  patchCourtImage,
  preflightCourtImage,
  reorderCourtImages,
  uploadCourtImage,
} from '../lib/images-api';
import { resolveImageSrc } from '../lib/image-url';
import { ApiError } from '../lib/api-error';
import { createSerialQueue } from '../lib/serial-queue';
import { createUploadBatchTracker } from '../lib/upload-batch';

interface CourtPhotosPanelProps {
  courtId: string;
  images: AdminCourtImageDTO[];
  /** Re-fetch the parent court record after any change (new truth from the server). */
  onChanged: () => void;
}

const WEB_BASE_URL = import.meta.env.VITE_WEB_BASE_URL;

export function CourtPhotosPanel({ courtId, images, onChanged }: CourtPhotosPanelProps) {
  const [pendingUploads, setPendingUploads] = useState(0);
  const uploading = pendingUploads > 0;
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [order, setOrder] = useState<string[] | null>(null);
  const [reordering, setReordering] = useState(false);
  const uploadQueue = useRef(createSerialQueue());
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;
  const uploadBatch = useRef(
    createUploadBatchTracker({
      onPendingChange: setPendingUploads,
      onDrained: () => onChangedRef.current(),
    }),
  );

  const sorted = [...images].sort((a, b) => a.sortOrder - b.sortOrder);
  const displayOrder = order ?? sorted.map((img) => img.id);
  const byId = new Map(sorted.map((img) => [img.id, img]));

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Uploads run SEQUENTIALLY, one at a time (TASK_74 §"Photos panel") — even
  // though TASK_75 makes the API safe under concurrent uploads, the UI stays
  // simple and each file's own success/failure stays easy to attribute.
  // rc-upload invokes customRequest for every selected file immediately, so
  // a shared queue (not just the `uploading` flag) is what keeps the actual
  // upload requests serial and in selection order (TASK_77).
  //
  // The in-flight count and "any success in this batch" flag live in
  // `uploadBatch` (a ref-held tracker), never in a `setPendingUploads`
  // updater function — `onDrained` (which calls `onChanged`, re-rendering the
  // parent) must never run from inside a state updater, since React may
  // invoke updaters twice (StrictMode) and warns when one updates another
  // component while rendering (TASK_78 fix 2).
  const customRequest: UploadProps['customRequest'] = (options) => {
    const file = options.file as File;
    const preflightError = preflightCourtImage(file);
    if (preflightError) {
      setUploadErrors((prev) => [...prev, preflightError]);
      options.onError?.(new Error(preflightError));
      return;
    }

    uploadBatch.current.start();
    void uploadQueue.current.enqueue(async () => {
      let success = false;
      try {
        await uploadCourtImage(courtId, file);
        options.onSuccess?.({});
        success = true;
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : 'Upload failed.';
        setUploadErrors((prev) => [...prev, `"${file.name}": ${msg}`]);
        options.onError?.(err instanceof Error ? err : new Error(msg));
      } finally {
        uploadBatch.current.finish(success);
      }
    });
  };

  async function handleMakeHero(imageId: string): Promise<void> {
    try {
      await patchCourtImage(courtId, imageId, { isHero: true });
      onChanged();
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not set hero image.');
    }
  }

  async function handleAltBlur(imageId: string, alt: string): Promise<void> {
    const current = byId.get(imageId);
    if (!current || (current.alt ?? '') === alt) return;
    try {
      await patchCourtImage(courtId, imageId, { alt: alt.trim().length > 0 ? alt.trim() : null });
      onChanged();
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not save alt text.');
    }
  }

  function handleDelete(imageId: string): void {
    Modal.confirm({
      title: 'Delete this photo?',
      content: 'This cannot be undone.',
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteCourtImage(courtId, imageId);
          onChanged();
        } catch (err) {
          message.error(err instanceof ApiError ? err.message : 'Could not delete this photo.');
        }
      },
    });
  }

  async function commitOrder(nextOrder: string[]): Promise<void> {
    const previousOrder = displayOrder;
    setOrder(nextOrder);
    setReordering(true);
    try {
      await reorderCourtImages(courtId, nextOrder);
      onChanged();
    } catch (err) {
      setOrder(previousOrder);
      message.error(err instanceof ApiError ? err.message : 'Could not reorder photos.');
    } finally {
      setReordering(false);
    }
  }

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = displayOrder.indexOf(String(active.id));
    const newIndex = displayOrder.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    void commitOrder(arrayMove(displayOrder, oldIndex, newIndex));
  }

  function moveBy(imageId: string, delta: number): void {
    const index = displayOrder.indexOf(imageId);
    const nextIndex = index + delta;
    if (index === -1 || nextIndex < 0 || nextIndex >= displayOrder.length) return;
    void commitOrder(arrayMove(displayOrder, index, nextIndex));
  }

  return (
    <Card title="Photos" size="small">
      <Upload
        multiple
        accept="image/jpeg,image/png,image/webp"
        customRequest={customRequest}
        showUploadList={false}
        disabled={uploading}
      >
        <Button loading={uploading}>Upload photos</Button>
      </Upload>

      {uploadErrors.length > 0 && (
        <Alert
          style={{ marginTop: 12 }}
          type="error"
          showIcon
          closable
          onClose={() => setUploadErrors([])}
          message="Some photos failed to upload"
          description={
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {uploadErrors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          }
        />
      )}

      {sorted.length === 0 ? (
        <p style={{ color: '#888', marginTop: 12 }}>No photos yet.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={displayOrder} strategy={rectSortingStrategy}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: 16,
                marginTop: 16,
                opacity: reordering ? 0.6 : 1,
              }}
            >
              {displayOrder.map((id, index) => {
                const image = byId.get(id);
                if (!image) return null;
                return (
                  <SortableImageCard
                    key={id}
                    image={image}
                    disabled={reordering}
                    onMakeHero={() => handleMakeHero(id)}
                    onAltBlur={(alt) => handleAltBlur(id, alt)}
                    onDelete={() => handleDelete(id)}
                    onMoveLeft={index > 0 ? () => moveBy(id, -1) : undefined}
                    onMoveRight={index < displayOrder.length - 1 ? () => moveBy(id, 1) : undefined}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </Card>
  );
}

interface SortableImageCardProps {
  image: AdminCourtImageDTO;
  disabled: boolean;
  onMakeHero: () => void;
  onAltBlur: (alt: string) => void;
  onDelete: () => void;
  onMoveLeft: (() => void) | undefined;
  onMoveRight: (() => void) | undefined;
}

function SortableImageCard({
  image,
  disabled,
  onMakeHero,
  onAltBlur,
  onDelete,
  onMoveLeft,
  onMoveRight,
}: SortableImageCardProps) {
  const [altValue, setAltValue] = useState(image.alt ?? '');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: image.id,
    disabled,
  });
  const src = resolveImageSrc(image.url, WEB_BASE_URL);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        border: '1px solid #e5e5e5',
        borderRadius: 8,
        padding: 8,
        background: '#fff',
      }}
    >
      <div
        {...attributes}
        {...listeners}
        style={{
          position: 'relative',
          height: 110,
          borderRadius: 6,
          overflow: 'hidden',
          background: '#f0f0f0',
          cursor: disabled ? 'default' : 'grab',
        }}
      >
        {src ? (
          <img src={src} alt={image.alt ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ padding: 8, fontSize: 11, color: '#888', wordBreak: 'break-all' }}>{image.url}</div>
        )}
        {image.isHero && (
          <span
            style={{
              position: 'absolute',
              top: 6,
              left: 6,
              background: '#1677ff',
              color: '#fff',
              fontSize: 11,
              padding: '2px 6px',
              borderRadius: 4,
            }}
          >
            Hero
          </span>
        )}
      </div>

      <Input
        size="small"
        placeholder="Alt text"
        style={{ marginTop: 8 }}
        value={altValue}
        onChange={(e) => setAltValue(e.target.value)}
        onBlur={() => onAltBlur(altValue)}
      />

      <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
        {!image.isHero && (
          <Button size="small" onClick={onMakeHero}>
            Make hero
          </Button>
        )}
        <Button size="small" danger onClick={onDelete}>
          Delete
        </Button>
        <Button size="small" aria-label="Move left" disabled={!onMoveLeft} onClick={onMoveLeft}>
          ←
        </Button>
        <Button size="small" aria-label="Move right" disabled={!onMoveRight} onClick={onMoveRight}>
          →
        </Button>
      </div>
    </div>
  );
}
