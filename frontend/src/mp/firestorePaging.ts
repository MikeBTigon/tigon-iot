// Firestore returns at most 10,000 documents per request, so large lists are read in pages.
import { getDocs, limit, query, startAfter } from 'firebase/firestore';
import type { DocumentData, Query, QueryDocumentSnapshot } from 'firebase/firestore';

const PAGE = 5000;

/** Reads every document of a query (which must have a stable order, e.g. orderBy(documentId())) page by page. */
export async function readAll(q: Query<DocumentData>, maxDocs = 100000): Promise<QueryDocumentSnapshot<DocumentData>[]> {
  const out: QueryDocumentSnapshot<DocumentData>[] = [];
  let last: QueryDocumentSnapshot<DocumentData> | undefined;
  while (out.length < maxDocs) {
    const snap = await getDocs(last ? query(q, startAfter(last), limit(PAGE)) : query(q, limit(PAGE)));
    out.push(...snap.docs);
    if (snap.size < PAGE) break;
    last = snap.docs[snap.docs.length - 1];
  }
  return out;
}
