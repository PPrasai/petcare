import type { StoredRecord } from '../../application/ports/record-store';
import { DocumentsPanel } from '../documents/DocumentsPanel';

/** The Files tab of a pet. */
export function FilesPane({ pet }: { pet: StoredRecord }) {
  return <DocumentsPanel petId={pet.id} petName={String(pet.data.name)} />;
}
