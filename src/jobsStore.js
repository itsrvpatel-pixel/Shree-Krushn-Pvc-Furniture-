// Jobs storage: one Firestore document per job, kept live with a listener.
//
// WHY THIS EXISTS
//
// Every job used to live inside a single 'app_data/jobs' document, which
// caused two separate problems.
//
// 1. Size. Firestore caps a document at 1MiB. Measured against the real
//    record shape, that is about 280 light jobs, 150 typical ones, or 80
//    heavy ones. Past the cap every write to 'jobs' is rejected, and
//    because the app updates React state before the write lands, an edit
//    appears to save and is then wiped by the next refresh. That is the
//    exact bug that made estimate items vanish when progress photos were
//    still stored inline.
//
// 2. Privacy. Firestore rules are evaluated per document, so while every
//    job shares one document there is no way to say "this customer may
//    read their own job and no one else's" - permission to read one job
//    is permission to read the lot.
//
// Splitting per job fixes both, and it removes a third problem for free:
// two people editing different jobs no longer overwrite each other,
// because they are no longer writing the same document.
//
// WHY A LISTENER RATHER THAN THE POLL
//
// The app used to re-read the whole jobs document every 20 seconds. Doing
// that per job would mean one read per job per tick - roughly 1.35 million
// reads a day for three staff at 300 jobs, against a 50,000/day free tier.
// onSnapshot instead charges for the first load and then only for documents
// that actually change, so a normal day costs a few hundred reads rather
// than tens of thousands, and updates arrive immediately instead of up to
// 20 seconds later.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
} from 'firebase/firestore';

const JOBS_COLLECTION = 'jobs';
const LEGACY_DOC = { collection: 'app_data', id: 'jobs' };

// Firestore rejects a batch over 500 operations.
const MAX_BATCH = 450;

// Works out the minimum set of documents to touch. Exported separately
// from the Firestore calls so it can be tested on its own - getting this
// wrong is how a save silently loses a job.
export function computeJobDiff(next, prev) {
  const prevById = new Map((prev || []).filter((j) => j && j.id).map((j) => [j.id, j]));
  const nextById = new Map((next || []).filter((j) => j && j.id).map((j) => [j.id, j]));
  const changed = (next || []).filter(
    (j) => j && j.id && JSON.stringify(j) !== JSON.stringify(prevById.get(j.id)),
  );
  const removedIds = (prev || [])
    .filter((j) => j && j.id && !nextById.has(j.id))
    .map((j) => j.id);
  return { changed, removedIds };
}

export function createJobsStore(db) {
  const jobsCol = collection(db, JOBS_COLLECTION);

  // Every job is stored as { job: <the job object> } rather than spreading
  // the job's own fields into the document, so a job field named like a
  // Firestore reserved key can never collide with one.
  const toDoc = (job) => ({ job, updatedAt: Date.now() });
  const fromDoc = (snap) => {
    const data = snap.data();
    return data && data.job ? data.job : null;
  };

  // Reads every job once. Used by the migration check and as a fallback;
  // normal operation goes through subscribe() instead.
  async function loadAll() {
    const snap = await getDocs(jobsCol);
    return snap.docs.map(fromDoc).filter(Boolean);
  }

  // Copies a pre-split 'app_data/jobs' document into per-job documents,
  // once. Safe to call on every startup: it does nothing if the jobs
  // collection already has anything in it, so it can never overwrite live
  // data with a stale copy of the old document.
  //
  // The legacy document is deliberately NOT deleted. If anything about the
  // split turns out to be wrong, the original is still sitting there.
  async function migrateLegacyIfNeeded() {
    try {
      const existing = await getDocs(jobsCol);
      if (!existing.empty) return { migrated: 0, reason: 'already-split' };

      const legacySnap = await getDoc(doc(db, LEGACY_DOC.collection, LEGACY_DOC.id));
      if (!legacySnap.exists()) return { migrated: 0, reason: 'nothing-to-migrate' };

      const raw = legacySnap.data().value;
      const legacyJobs = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(legacyJobs) || legacyJobs.length === 0) {
        return { migrated: 0, reason: 'nothing-to-migrate' };
      }

      for (let i = 0; i < legacyJobs.length; i += MAX_BATCH) {
        const batch = writeBatch(db);
        for (const job of legacyJobs.slice(i, i + MAX_BATCH)) {
          if (job && job.id) batch.set(doc(jobsCol, String(job.id)), toDoc(job));
        }
        await batch.commit();
      }
      return { migrated: legacyJobs.length, reason: 'migrated' };
    } catch (e) {
      console.error('jobsStore.migrateLegacyIfNeeded failed:', e);
      return { migrated: 0, reason: 'error', error: e };
    }
  }

  // Live view of every job. onNext receives the full array on the first
  // callback and after every change; Firestore only bills for documents
  // that actually changed after the initial load.
  function subscribe(onNext, onError) {
    return onSnapshot(
      jobsCol,
      (snap) => onNext(snap.docs.map(fromDoc).filter(Boolean)),
      (err) => {
        console.error('jobsStore.subscribe failed:', err);
        if (onError) onError(err);
      },
    );
  }

  // Writes only what actually changed between prev and next, so saving one
  // job costs one write instead of rewriting every job in the business.
  //
  // Callers still pass whole arrays, matching the shape the rest of the app
  // already uses - the diffing happens here rather than at seven call sites.
  async function saveDiff(next, prev) {
    const { changed, removedIds } = computeJobDiff(next, prev);
    if (changed.length === 0 && removedIds.length === 0) return { writes: 0, deletes: 0 };

    const ops = [
      ...changed.map((j) => ({ kind: 'set', id: String(j.id), job: j })),
      ...removedIds.map((id) => ({ kind: 'delete', id: String(id) })),
    ];

    // A single job edit is the overwhelmingly common case; a batch of one
    // is pointless overhead, so that path writes directly.
    if (ops.length === 1) {
      const op = ops[0];
      if (op.kind === 'set') await setDoc(doc(jobsCol, op.id), toDoc(op.job));
      else await deleteDoc(doc(jobsCol, op.id));
    } else {
      for (let i = 0; i < ops.length; i += MAX_BATCH) {
        const batch = writeBatch(db);
        for (const op of ops.slice(i, i + MAX_BATCH)) {
          if (op.kind === 'set') batch.set(doc(jobsCol, op.id), toDoc(op.job));
          else batch.delete(doc(jobsCol, op.id));
        }
        await batch.commit();
      }
    }
    return { writes: changed.length, deletes: removedIds.length };
  }

  return { loadAll, migrateLegacyIfNeeded, subscribe, saveDiff };
}
