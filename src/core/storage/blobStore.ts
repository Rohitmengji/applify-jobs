import Dexie, { type Table } from 'dexie';

// IMPLEMENTATION.md §9 — binary blobs (résumé / cover letter) in IndexedDB via Dexie.
// Runs in the side panel / options context (a normal DOM context). The content
// script gets bytes over messaging and reconstructs the File (§10, §12).

export interface StoredBlob {
  id: string; // uuid
  filename: string;
  mime: string;
  bytes: ArrayBuffer; // store bytes, not a File (File isn't structured-clone-stable everywhere)
  createdAt: number;
}

class OcaDB extends Dexie {
  blobs!: Table<StoredBlob, string>;
  constructor() {
    super('oneclick-apply');
    this.version(1).stores({ blobs: 'id, filename, createdAt' });
  }
}
export const db = new OcaDB();

export async function putBlob(file: File): Promise<string> {
  const id = crypto.randomUUID();
  await db.blobs.put({
    id,
    filename: file.name,
    mime: file.type || 'application/octet-stream',
    bytes: await file.arrayBuffer(),
    createdAt: Date.now(),
  });
  return id;
}

export async function getFile(id: string): Promise<File | null> {
  const b = await db.blobs.get(id);
  if (!b) return null;
  return new File([b.bytes], b.filename, { type: b.mime });
}

export async function deleteBlob(id: string): Promise<void> {
  await db.blobs.delete(id);
}
