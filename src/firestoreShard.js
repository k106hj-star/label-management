// ── Firestore 분할 저장 헬퍼 ──────────────────────────────────────────────
// Firestore는 문서 1개당 최대 1,048,576바이트(1MB) 제한이 있다.
// 재고로그처럼 계속 쌓이는 큰 리스트는 이 한계를 넘으면 저장이 실패하고,
// 실패한 쓰기가 Firestore 쓰기 통로를 막아 다른 데이터(상품 등) 저장까지 차단된다.
// 이를 막기 위해 큰 리스트를 여러 청크 문서로 나눠 저장한다.
//
//  settings/{name}          → { chunked: true, chunkCount: N, updatedAt }  (메타데이터)
//  settings/{name}__c0..cN  → { list: [...] }                              (청크 데이터)
//
// 기존의 단일 문서 형식({ list: [...] })도 loadSharded가 그대로 읽어들여
// 별도 마이그레이션 없이 첫 저장 시 자동으로 분할 형식으로 전환된다.

import { db } from './firebase';
import { doc, getDoc, writeBatch } from 'firebase/firestore';

// 청크 1개당 최대 UTF-8 바이트. Firestore 1MB(1,048,576) 한계와 내부 크기 계산
// 오버헤드를 고려해 넉넉히 낮게 잡아 안전 여유를 둔다.
// (주의: 한글은 UTF-8에서 1글자=3바이트이므로 반드시 바이트로 측정해야 한다.)
const CHUNK_MAX = 500000;
// chunkCount가 줄었을 때 남는 이전 청크 문서를 정리하기 위해 추가로 지우는 개수.
const EXTRA_DELETE = 10;

const _encoder = new TextEncoder();
// 문자열의 실제 UTF-8 바이트 길이. ('.length'는 문자 수라 한글에서 과소평가됨)
function byteLen(str) {
  return _encoder.encode(str).length;
}

// 리스트를 각 청크가 CHUNK_MAX(바이트) 이내가 되도록 분할한다. (항상 최소 1개 청크 반환)
function chunkList(list) {
  const chunks = [];
  let cur = [];
  let size = 2; // "[]"
  for (const item of list) {
    const s = byteLen(JSON.stringify(item)) + 1; // 항목 + 콤마
    if (cur.length > 0 && size + s > CHUNK_MAX) {
      chunks.push(cur);
      cur = [];
      size = 2;
    }
    cur.push(item);
    size += s;
  }
  chunks.push(cur); // 마지막(또는 빈 리스트면 빈 청크 1개)
  return chunks;
}

// 리스트를 분할 저장한다. 자기 쓰기 감지에 쓰도록 기록한 updatedAt을 반환한다.
export async function saveSharded(name, list) {
  const clean = JSON.parse(JSON.stringify(list));
  const chunks = chunkList(clean);
  const updatedAt = Date.now();
  const batch = writeBatch(db);
  batch.set(doc(db, 'settings', name), { chunked: true, chunkCount: chunks.length, updatedAt });
  chunks.forEach((c, i) => batch.set(doc(db, 'settings', `${name}__c${i}`), { list: c }));
  // chunkCount가 줄어든 경우 남은 이전 청크 문서 정리(존재하지 않으면 무시됨)
  for (let i = chunks.length; i < chunks.length + EXTRA_DELETE; i++) {
    batch.delete(doc(db, 'settings', `${name}__c${i}`));
  }
  await batch.commit();
  return updatedAt;
}

// ── 트랜잭션 내부용 분할 읽기/쓰기 ──────────────────────────────────────
// Firestore 트랜잭션은 "모든 읽기가 모든 쓰기보다 먼저" 와야 한다.
// readShardedTx로 먼저 전부 읽고, 계산 후 writeShardedTx로 쓴다.

// 트랜잭션 안에서 분할(또는 기존 단일) 리스트를 읽는다. { list, chunkCount } 반환.
// chunkCount는 writeShardedTx에 넘겨 줄어든 청크 정리에 쓴다.
export async function readShardedTx(tx, name) {
  const metaSnap = await tx.get(doc(db, 'settings', name));
  if (!metaSnap.exists()) return { list: [], chunkCount: 0 };
  const meta = metaSnap.data();
  if (meta.chunked && typeof meta.chunkCount === 'number') {
    const parts = [];
    for (let i = 0; i < meta.chunkCount; i++) {
      const cs = await tx.get(doc(db, 'settings', `${name}__c${i}`));
      if (cs.exists() && Array.isArray(cs.data().list)) parts.push(...cs.data().list);
    }
    return { list: parts, chunkCount: meta.chunkCount };
  }
  if (Array.isArray(meta.list)) return { list: meta.list, chunkCount: 0 }; // 기존 단일 문서
  return { list: [], chunkCount: 0 };
}

// 트랜잭션 안에서 분할 저장한다. (readShardedTx의 chunkCount를 prevChunkCount로 넘길 것)
export function writeShardedTx(tx, name, list, prevChunkCount = 0) {
  const clean = JSON.parse(JSON.stringify(list));
  const chunks = chunkList(clean);
  const updatedAt = Date.now();
  tx.set(doc(db, 'settings', name), { chunked: true, chunkCount: chunks.length, updatedAt });
  chunks.forEach((c, i) => tx.set(doc(db, 'settings', `${name}__c${i}`), { list: c }));
  const deleteUpto = Math.max(prevChunkCount, chunks.length + EXTRA_DELETE);
  for (let i = chunks.length; i < deleteUpto; i++) {
    tx.delete(doc(db, 'settings', `${name}__c${i}`));
  }
  return updatedAt;
}

// 분할 저장(또는 기존 단일 문서)된 리스트를 읽어 { list, updatedAt }로 반환한다.
// 문서가 없으면 { list: null, updatedAt: null }.
export async function loadSharded(name) {
  const metaSnap = await getDoc(doc(db, 'settings', name));
  if (!metaSnap.exists()) return { list: null, updatedAt: null };
  const meta = metaSnap.data();
  if (meta.chunked && typeof meta.chunkCount === 'number') {
    const parts = [];
    for (let i = 0; i < meta.chunkCount; i++) {
      const cs = await getDoc(doc(db, 'settings', `${name}__c${i}`));
      if (cs.exists() && Array.isArray(cs.data().list)) parts.push(...cs.data().list);
    }
    return { list: parts, updatedAt: meta.updatedAt || null };
  }
  // 기존 단일 문서 형식(하위 호환)
  if (Array.isArray(meta.list)) return { list: meta.list, updatedAt: meta.updatedAt || null };
  return { list: null, updatedAt: null };
}
