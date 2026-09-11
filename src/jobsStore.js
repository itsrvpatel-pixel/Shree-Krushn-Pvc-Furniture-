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


// Firestore rejects a batch over 500 operations.
const MAX_BATCH = 450;

// Works out the minimum set of documents to touch. Exported separately
// from the Firestore calls so it can be tested on its own - getting this
// wrong is how a save silently loses a job.
export function computeJobDiff(next, prev, idOf = (r) => r && r.id) {
  const keyed = (list) => (list || []).filter((r) => r && idOf(r));
  const prevById = new Map(keyed(prev).map((r) => [idOf(r), r]));
  const nextById = new Map(keyed(next).map((r) => [idOf(r), r]));
  const changed = keyed(next).filter(
    (r) => JSON.stringify(r) !== JSON.stringify(prevById.get(idOf(r))),
  );
  const removedIds = keyed(prev)
    .filter((r) => !nextById.has(idOf(r)))
    .map((r) => idOf(r));
  return { changed, removedIds };
}

// One document per record, in its own collection, with the pre-split
// app_data document kept as a fallback. Jobs and customers both need this
// shape - the only differences are which collection, which legacy key,
// and what a record's document id is - so it is written once here.
export function createRecordStore(db, { collectionName, legacyKey, field, idOf }) {
  const jobsCol = collection(db, collectionName);

  // Every job is stored as { job: <the job object> } rather than spreading
  // the job's own fields into the document, so a job field named like a
  // Firestore reserved key can never collide with one.
  const toDoc = (rec) => ({ [field]: rec, updatedAt: Date.now() });
  const fromDoc = (snap) => {
    const data = snap.data();
    return data && data[field] ? data[field] : null;
  };

  // Reads every job once. Used by the migration check and as a fallback;
  // normal operation goes through subscribe() instead.
  async function loadAll() {
    const snap = await getDocs(jobsCol);
    return snap.docs.map(fromDoc).filter(Boolean);
  }

  // Copies the pre-split app_data document into per-record documents.
  //
  // This is written to be safe to run on every startup, and to be honest
  // about what it did. Three things it deliberately does NOT do:
  //
  //   * It does not skip out early just because the collection has
  //     something in it. An earlier version did, which meant that if one
  //     batch committed and the next failed, the collection was no longer
  //     empty, the migration reported "already done" forever, and the
  //     remaining records never arrived. It now compares against what is
  //     actually there and writes only what is missing, so an interrupted
  //     run simply finishes next time.
  //
  //   * It does not silently drop records it cannot key. A customer with
  //     no phone number has no document id, so it cannot be migrated -
  //     that is reported back rather than quietly lost.
  //
  //   * It does not claim to have migrated records it did not write. The
  //     count returned is the number actually written.
  //
  // The legacy document is never deleted. It is read first precisely so
  // that once you do delete it by hand, this costs a single read forever
  // after.
  async function migrateLegacyIfNeeded() {
    try {
      const legacySnap = await getDoc(doc(db, 'app_data', legacyKey));
      if (!legacySnap.exists()) return { migrated: 0, skipped: 0, reason: 'nothing-to-migrate' };

      const raw = legacySnap.data().value;
      let legacyRecords = [];
      try { legacyRecords = raw ? JSON.parse(raw) : []; }
      catch (e) { return { migrated: 0, skipped: 0, reason: 'legacy-unreadable', error: String(e) }; }
      if (!Array.isArray(legacyRecords) || legacyRecords.length === 0) {
        return { migrated: 0, skipped: 0, reason: 'nothing-to-migrate' };
      }

      const existing = await getDocs(jobsCol);
      const haveIds = new Set(existing.docs.map((d) => d.id));

      const unkeyable = legacyRecords.filter((rec) => !rec || !idOf(rec));
      const missing = legacyRecords.filter(
        (rec) => rec && idOf(rec) && !haveIds.has(String(idOf(rec))),
      );
      if (missing.length === 0) {
        return {
          migrated: 0,
          skipped: unkeyable.length,
          reason: unkeyable.length ? 'complete-except-unkeyable' : 'already-split',
        };
      }

      let written = 0;
      for (let i = 0; i < missing.length; i += MAX_BATCH) {
        const slice = missing.slice(i, i + MAX_BATCH);
        const batch = writeBatch(db);
        for (const rec of slice) batch.set(doc(jobsCol, String(idOf(rec))), toDoc(rec));
        await batch.commit();
        written += slice.length;
      }
      return { migrated: written, skipped: unkeyable.length, reason: 'migrated' };
    } catch (e) {
      // Reported, not swallowed: the caller surfaces this, because the
      // symptom of a failed migration is an app that looks empty.
      console.error('recordStore.migrateLegacyIfNeeded failed:', collectionName, e);
      return { migrated: 0, skipped: 0, reason: 'error', error: String(e && e.code ? e.code : e) };
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
    const { changed, removedIds } = computeJobDiff(next, prev, idOf);
    if (changed.length === 0 && removedIds.length === 0) return { writes: 0, deletes: 0 };

    const ops = [
      ...changed.map((r) => ({ kind: 'set', id: String(idOf(r)), rec: r })),
      ...removedIds.map((id) => ({ kind: 'delete', id: String(id) })),
    ];

    // A single job edit is the overwhelmingly common case; a batch of one
    // is pointless overhead, so that path writes directly.
    if (ops.length === 1) {
      const op = ops[0];
      if (op.kind === 'set') await setDoc(doc(jobsCol, op.id), toDoc(op.rec));
      else await deleteDoc(doc(jobsCol, op.id));
    } else {
      for (let i = 0; i < ops.length; i += MAX_BATCH) {
        const batch = writeBatch(db);
        for (const op of ops.slice(i, i + MAX_BATCH)) {
          if (op.kind === 'set') batch.set(doc(jobsCol, op.id), toDoc(op.rec));
          else batch.delete(doc(jobsCol, op.id));
        }
        await batch.commit();
      }
    }
    return { writes: changed.length, deletes: removedIds.length };
  }

  // Reads a single record by document id. This is what a signed-in
  // customer uses: fetching their own document directly, rather than
  // listing the collection, is the difference between a rule that can
  // allow it and one that cannot - a collection query fails outright if
  // any document in it would be denied.
  async function getOne(id) {
    try {
      const snap = await getDoc(doc(jobsCol, String(id)));
      return snap.exists() ? fromDoc(snap) : null;
    } catch (e) {
      console.error('recordStore.getOne failed:', collectionName, id, e);
      return null;
    }
  }

  return { loadAll, getOne, migrateLegacyIfNeeded, subscribe, saveDiff };
}

export const createJobsStore = (db) => createRecordStore(db, {
  collectionName: 'jobs', legacyKey: 'jobs', field: 'job', idOf: (j) => j && j.id,
});

// Customer documents are keyed by phone number, not by the app's internal
// customer id, because phone is what the app knows before it knows who the
// customer is - at the login screen, and in a security rule, where the
// signed-in phone number is the only thing that identifies them.
export const createCustomersStore = (db) => createRecordStore(db, {
  collectionName: 'customers', legacyKey: 'customers', field: 'customer', idOf: (c) => c && c.phone,
});
