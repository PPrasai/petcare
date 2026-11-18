import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { InvalidInput } from '../../application/pet-service';
import type { StoredRecord } from '../../application/ports/record-store';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { formatDate } from '../../lib/format';
import { useSessionStore } from '../../state/session';
import {
  Button,
  Card,
  DropZone,
  EmptyState,
  Icon,
  Line,
  Pill,
  SectionHeader,
  SelectField,
  Sheet,
  SheetHead,
  TextField,
} from '../../ui';
import { FILE_ACCEPT, FilePicker, fileProblem, useMaxFileBytes } from '../files/FilePicker';
import { FileViewButton, useFileViewer } from '../files/FileViewButton';
import { EditButton, useEditTap } from '../shared/EditButton';
import { useCan, useCanDelete, useHouseholdId } from '../shared/permissions';
import { useRemoval } from '../shared/removal';
import { useSaveFailure } from '../shared/save-failure';
import { useServices } from '../shared/services-context';
import { useWideScreen } from '../shared/use-wide-screen';
import { useToastStore } from '../shared/toast';
import { useFocusInvalid } from '../shared/use-focus-invalid';

export const DOCUMENT_CATEGORIES = [
  'vetRecord',
  'certificate',
  'receipt',
  'insurance',
  'photo',
  'labResult',
  'other',
] as const;

interface Draft {
  title: string;
  category: string;
  file: File | null;
}

const EMPTY_DRAFT: Draft = { title: '', category: 'vetRecord', file: null };

/** The add-document form (S-46). A file from the drop zone arrives already chosen. */
function AddDocument({
  petId,
  draft,
  onClose,
}: {
  petId: string;
  draft: Draft;
  onClose: () => void;
}) {
  const { documents, files } = useServices();
  const householdId = useHouseholdId();
  const show = useToastStore((s) => s.show);
  const form = useRef<HTMLFormElement>(null);
  const [title, setTitle] = useState(draft.title);
  const [category, setCategory] = useState(draft.category);
  const [file, setFile] = useState<File | null>(draft.file);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useFocusInvalid(form, errors);

  const failure = useSaveFailure();
  const submit = async () => {
    if (!file) {
      setErrors({ file: t('files.required') });
      return;
    }
    failure.clear();
    try {
      const { fileId } = await files.attach(householdId, file);
      await documents.add(householdId, { petId, title, category, fileId });
      show(t('files.added'));
      onClose();
    } catch (e) {
      if (!(e instanceof InvalidInput)) {
        failure.fail(e);
        return;
      }
      setErrors({ [e.path]: t('form.invalid') });
    }
  };

  return (
    <form
      ref={form}
      aria-label={t('documents.add')}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <TextField
        label={t('documents.name')}
        value={title}
        error={errors.title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <SelectField
        label={t('documents.category')}
        value={category}
        options={DOCUMENT_CATEGORIES.map((c) => ({
          value: c,
          label: t(`documents.category.${c}` as MessageKey),
        }))}
        onChange={(e) => setCategory(e.target.value)}
      />
      {draft.file ? (
        <div className="fld">
          <span className="label">{t('files.choose')}</span>
          <b>{draft.file.name}</b>
        </div>
      ) : (
        <FilePicker
          label={t('files.choose')}
          error={errors.file}
          onPick={setFile}
          onRefused={(message) => setErrors({ file: message })}
        />
      )}
      {failure.view}
      <Button type="submit">{t('documents.add')}</Button>
    </form>
  );
}

/** The edit-document form: the name and the category; the file stays as it is. */
function EditDocument({ doc, onClose }: { doc: StoredRecord; onClose: () => void }) {
  const { documents } = useServices();
  const show = useToastStore((s) => s.show);
  const form = useRef<HTMLFormElement>(null);
  const [title, setTitle] = useState(String(doc.data.title));
  const [category, setCategory] = useState(String(doc.data.category));
  const [errors, setErrors] = useState<Record<string, string>>({});
  useFocusInvalid(form, errors);
  const failure = useSaveFailure();
  const submit = async () => {
    failure.clear();
    try {
      await documents.update(doc.id, { title, category });
      show(t('form.saved', { name: title }));
      onClose();
    } catch (e) {
      if (!(e instanceof InvalidInput)) {
        failure.fail(e);
        return;
      }
      setErrors({ [e.path]: t('form.invalid') });
    }
  };
  return (
    <form
      ref={form}
      aria-label={t('documents.edit')}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <TextField
        label={t('documents.name')}
        value={title}
        error={errors.title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <SelectField
        label={t('documents.category')}
        value={category}
        options={DOCUMENT_CATEGORIES.map((c) => ({
          value: c,
          label: t(`documents.category.${c}` as MessageKey),
        }))}
        onChange={(e) => setCategory(e.target.value)}
      />
      {failure.view}
      <Button type="submit">{t('form.saveChanges')}</Button>
    </form>
  );
}

/** One photo as a tile. The picture loads the first time the tile scrolls into view. */
function PhotoTile({ doc, onEdit }: { doc: StoredRecord; onEdit: (doc: StoredRecord) => void }) {
  const { files } = useServices();
  const canEdit = useCan('update', 'document');
  const canDelete = useCanDelete('document');
  const removeRecord = useRemoval();
  const title = String(doc.data.title);
  const fileId = String(doc.data.fileId);
  const tile = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const viewer = useFileViewer(
    fileId,
    title,
    <>
      {canEdit ? <EditButton name={title} onClick={() => onEdit(doc)} /> : null}
      {canDelete(doc.createdBy) ? (
        <Button
          variant="secondary"
          aria-label={t('form.deleteLabel', { name: title })}
          onClick={() => void removeRecord(doc, title)}
        >
          {t('form.delete')}
        </Button>
      ) : null}
    </>,
  );

  useEffect(() => {
    const el = tile.current;
    if (!el) return;
    let live = true;
    let loaded: string | null = null;
    const load = () => {
      void files
        .open(fileId)
        .then((view) => {
          if (!view) return;
          if (live) {
            loaded = view.url;
            setUrl(view.url);
          } else files.release(view.url);
        })
        .catch(() => undefined);
    };
    if (typeof IntersectionObserver === 'undefined') {
      load();
      return () => {
        live = false;
        if (loaded) files.release(loaded);
      };
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        observer.disconnect();
        load();
      }
    });
    observer.observe(el);
    return () => {
      live = false;
      observer.disconnect();
      if (loaded) files.release(loaded);
    };
  }, [files, fileId]);

  return (
    <div ref={tile}>
      <button
        type="button"
        data-testid="photo-tile"
        aria-label={t('files.viewLabel', { name: title })}
        onClick={viewer.open}
      >
        {url ? (
          <img src={url} alt="" loading="lazy" />
        ) : (
          <>
            <Icon name="camera" />
            <span>{title}</span>
          </>
        )}
      </button>
      {viewer.dialog}
    </div>
  );
}

/** The Files tab: a drop zone, the photos as a grid and the other documents as a list (S-45). */
export function DocumentsPanel({ petId, petName }: { petId: string; petName: string }) {
  const { documents } = useServices();
  const householdId = useHouseholdId();
  const prefs = useSessionStore((s) => s.preferences);
  const canCreate = useCan('create', 'document');
  const canEdit = useCan('update', 'document');
  const tap = useEditTap();
  const canDelete = useCanDelete('document');
  const removeRecord = useRemoval();
  const [editing, setEditing] = useState<StoredRecord | null>(null);
  const max = useMaxFileBytes();
  const wide = useWideScreen();
  const list = useQuery({
    queryKey: ['document', householdId, { petId }],
    queryFn: () => documents.list(householdId, petId),
    enabled: householdId !== '',
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dropError, setDropError] = useState('');

  const rows = list.data ?? [];
  const photos = rows.filter((d) => d.data.category === 'photo');
  const records = rows.filter((d) => d.data.category !== 'photo');

  const onFile = (file: File) => {
    const problem = fileProblem(file, max);
    setDropError(problem ?? '');
    if (problem) return;
    setDraft({
      title: file.name.replace(/\.[^.]+$/, ''),
      category: file.type.startsWith('image/') ? 'photo' : 'vetRecord',
      file,
    });
  };

  return (
    <div className="two" data-layout={wide && rows.length === 0 ? 'single' : 'files'}>
      <div className="stack">
        {canCreate ? (
          <>
            <DropZone
              title={t('files.drop.title')}
              hint={t('files.drop.hint')}
              buttonLabel={t('files.drop.choose')}
              accept={FILE_ACCEPT}
              area="drop"
              onFile={onFile}
            />
            {dropError ? (
              <p className="err" role="alert">
                {dropError}
              </p>
            ) : null}
          </>
        ) : null}
        {rows.length === 0 && list.isSuccess ? (
          wide ? (
            <Card data-area="empty">
              <EmptyState>{t('empty.files', { name: petName })}</EmptyState>
            </Card>
          ) : (
            <EmptyState>{t('empty.files', { name: petName })}</EmptyState>
          )
        ) : null}
        {photos.length > 0 ? (
          <Card data-area="photos">
            <SectionHeader title={t('files.photos')} />
            <div className="photos">
              {photos.map((d) => (
                <PhotoTile key={d.id} doc={d} onEdit={setEditing} />
              ))}
            </div>
          </Card>
        ) : null}
      </div>
      {rows.length > 0 ? (
        <Card data-area="records">
          <SectionHeader
            title={t('files.records')}
            {...(canCreate
              ? {
                  action: {
                    label: t('ui.add'),
                    ariaLabel: t('documents.addLabel'),
                    onClick: () => setDraft(EMPTY_DRAFT),
                  },
                }
              : {})}
          />
          {records.length > 0 ? (
            <ul aria-label={t('files.records')}>
              {records.map((d) => {
                const name = String(d.data.title);
                return (
                  <Line
                    titleProps={canEdit ? tap(name, () => setEditing(d)) : undefined}
                    key={d.id}
                    lead={<Icon name="file" />}
                    title={name}
                    sub={`${t(`documents.category.${String(d.data.category)}` as MessageKey)} · ${formatDate(d.updatedAt, prefs)}`}
                    aside={d.pending ? <Pill tone="soon">{t('files.waiting')}</Pill> : null}
                    actions={
                      <>
                        <FileViewButton fileId={String(d.data.fileId)} label={name} />
                        {canEdit ? <EditButton name={name} onClick={() => setEditing(d)} /> : null}
                        {canDelete(d.createdBy) ? (
                          <Button
                            variant="secondary"
                            aria-label={t('form.deleteLabel', { name })}
                            onClick={() => void removeRecord(d, name)}
                          >
                            {t('form.delete')}
                          </Button>
                        ) : null}
                      </>
                    }
                  />
                );
              })}
            </ul>
          ) : null}
        </Card>
      ) : null}
      <Sheet open={draft !== null} label={t('documents.add')} onClose={() => setDraft(null)}>
        <SheetHead title={t('documents.add')} onClose={() => setDraft(null)} />
        {draft ? <AddDocument petId={petId} draft={draft} onClose={() => setDraft(null)} /> : null}
      </Sheet>
      <Sheet open={editing !== null} label={t('documents.edit')} onClose={() => setEditing(null)}>
        <SheetHead title={t('documents.edit')} onClose={() => setEditing(null)} />
        {editing ? <EditDocument doc={editing} onClose={() => setEditing(null)} /> : null}
      </Sheet>
    </div>
  );
}
