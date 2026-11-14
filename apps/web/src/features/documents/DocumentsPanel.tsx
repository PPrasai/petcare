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
import { useCan, useCanDelete, useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';
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

  const submit = async () => {
    if (!file) {
      setErrors({ file: t('files.required') });
      return;
    }
    try {
      const { fileId } = await files.attach(householdId, file);
      await documents.add(householdId, { petId, title, category, fileId });
      show(t('files.added'));
      onClose();
    } catch (e) {
      if (!(e instanceof InvalidInput)) throw e;
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
      <Button type="submit">{t('documents.add')}</Button>
    </form>
  );
}

/** One photo as a tile. The picture loads the first time the tile scrolls into view. */
function PhotoTile({ doc }: { doc: StoredRecord }) {
  const { files, documents } = useServices();
  const canDelete = useCanDelete('document');
  const title = String(doc.data.title);
  const fileId = String(doc.data.fileId);
  const tile = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const viewer = useFileViewer(
    fileId,
    title,
    canDelete(doc.createdBy) ? (
      <Button
        variant="secondary"
        aria-label={t('form.deleteLabel', { name: title })}
        onClick={() => void documents.remove(doc.id)}
      >
        {t('form.delete')}
      </Button>
    ) : null,
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
  const canDelete = useCanDelete('document');
  const max = useMaxFileBytes();
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
    <div className="two">
      <div className="stack">
        {canCreate ? (
          <>
            <DropZone
              title={t('files.drop.title')}
              hint={t('files.drop.hint')}
              buttonLabel={t('files.drop.choose')}
              accept={FILE_ACCEPT}
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
          <EmptyState>{t('empty.files', { name: petName })}</EmptyState>
        ) : null}
        {photos.length > 0 ? (
          <Card>
            <SectionHeader title={t('files.photos')} />
            <div className="photos">
              {photos.map((d) => (
                <PhotoTile key={d.id} doc={d} />
              ))}
            </div>
          </Card>
        ) : null}
      </div>
      {rows.length > 0 ? (
        <Card>
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
                    key={d.id}
                    lead={<Icon name="file" />}
                    title={name}
                    sub={`${t(`documents.category.${String(d.data.category)}` as MessageKey)} · ${formatDate(d.updatedAt, prefs)}`}
                    aside={d.pending ? <Pill tone="soon">{t('files.waiting')}</Pill> : null}
                    actions={
                      <>
                        <FileViewButton fileId={String(d.data.fileId)} label={name} />
                        {canDelete(d.createdBy) ? (
                          <Button
                            variant="secondary"
                            aria-label={t('form.deleteLabel', { name })}
                            onClick={() => void documents.remove(d.id)}
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
    </div>
  );
}
