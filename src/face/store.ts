import type { Pt } from './geometry';

/** 顔データの保存先。端末内（IndexedDB）のみで、サーバーには送らない */

const DB_NAME = 'face360';
const STORE = 'faces';
const KEY = 'self';

export interface StoredFace {
  texture: Blob;
  mask: Blob;
  /** テクスチャ座標（0〜1）のランドマーク */
  landmarks: Pt[];
  blendshapes: Record<string, number>;
  createdAt: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export function saveFace(face: StoredFace): Promise<IDBValidKey> {
  return tx('readwrite', (s) => s.put(face, KEY));
}

export async function loadFace(): Promise<StoredFace | null> {
  try {
    return ((await tx('readonly', (s) => s.get(KEY))) as StoredFace | undefined) ?? null;
  } catch {
    return null;
  }
}

/** 顔データを完全に削除する（DBごと消す） */
export function deleteFace(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

export function canvasToBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));
}

export async function blobToCanvas(b: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(b);
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext('2d', { willReadFrequently: true })!.drawImage(bmp, 0, 0);
  bmp.close();
  return c;
}
