// The nightly copy of the business.
//
// Asked, plainly: "ye app par business chalega na, aage jaake koi
// problem nahi hoga na". The honest answer had one weak point in it -
// the backup was a button somebody had to remember, and nobody had.
// Everything else in this project can be rebuilt from the repository;
// the customers, estimates and payments cannot be rebuilt from
// anything.
//
// Two things get tested hard here. Pruning, because deleting the wrong
// file is the only operation in api/backup.js with no undo. And the
// age shown on screen, because the failure that actually matters is
// not a backup that breaks loudly - it is one that stops and goes on
// looking fine.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  backupAge, readableSize, needsOffsiteCopy,
  BACKUP_WARN_HOURS, BACKUP_BAD_HOURS, OFFSITE_REMIND_DAYS,
} from '../src/jobCore.js';
import {
  prunable, backupName, dateFromName, statusFrom,
  BACKED_UP, KEEP_DAILY_DAYS, KEEP_MONTHLY_COUNT,
} from '../api/backup.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const api = readFileSync(new URL('../api/backup.js', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../src/AdminApp.jsx', import.meta.url), 'utf8');
const NOW = Date.parse('2026-10-10T12:00:00Z');
const daysAgo = (d) => NOW - d * 86400000;

console.log('backup');

t('a name carries its date, and reads back', () => {
  assert.equal(backupName(new Date(Date.UTC(2026, 9, 10))), 'backups/backup-2026-10-10.json');
  assert.equal(dateFromName('backups/backup-2026-10-10.json'), '2026-10-10');
  // Single-digit months and days are padded, so names sort by date.
  assert.equal(backupName(new Date(Date.UTC(2027, 0, 5))), 'backups/backup-2027-01-05.json');
  for (const junk of ['', null, 'backups/notes.txt', 'backups/backup-2026-13.json', 'other/backup-2026-10-10.json']) {
    assert.equal(dateFromName(junk), junk === 'other/backup-2026-10-10.json' ? '2026-10-10' : null, String(junk));
  }
});

t('recent copies are never pruned', () => {
  const names = [0, 1, 5, 20, 29].map((d) => backupName(new Date(daysAgo(d))));
  assert.deepEqual(prunable(names, NOW), []);
});

t('old dailies go, but one a month stays', () => {
  // Two copies in the same old month: the earlier one is the monthly
  // keeper, the later one is prunable.
  const keep = 'backups/backup-2026-03-02.json';
  const drop = 'backups/backup-2026-03-17.json';
  const out = prunable([keep, drop], NOW);
  assert.deepEqual(out, [drop], 'the wrong copy of that month was chosen');
});

t('a copy is kept for each of the last twelve months', () => {
  const names = [];
  for (let m = 0; m < 20; m += 1) {
    const d = new Date(Date.UTC(2026, 9 - m, 3));
    names.push(backupName(d));
  }
  const dropped = prunable(names, NOW);
  const kept = names.filter((x) => !dropped.includes(x));
  assert.equal(kept.length, KEEP_MONTHLY_COUNT, 'kept ' + kept.length + ' months, expected ' + KEEP_MONTHLY_COUNT);
  // And the ones kept are the most recent months, not an arbitrary set.
  assert.ok(kept.includes(backupName(new Date(Date.UTC(2026, 9, 3)))), 'this month was dropped');
  // The oldest in the set - twenty months back - must be gone.
  assert.ok(dropped.includes(backupName(new Date(Date.UTC(2026, 9 - 19, 3)))), 'the oldest month was kept');
});

t('a name it cannot read is left alone, never deleted', () => {
  // The one rule that matters most: when in doubt, do not delete.
  const odd = ['backups/README.txt', 'backups/', 'backups/backup-old.json', 'backups/backup-2026-99-99.json'];
  assert.deepEqual(prunable(odd, NOW), []);
  // And it does not throw on rubbish input.
  assert.deepEqual(prunable([], NOW), []);
});

t('pruning never empties the store', () => {
  // Whatever it is given, at least one copy survives - there is no
  // input for which the right answer is "delete everything".
  const sets = [
    ['backups/backup-2020-01-01.json'],
    [0, 400, 800].map((d) => backupName(new Date(daysAgo(d)))),
    Array.from({ length: 60 }, (_, i) => backupName(new Date(daysAgo(i * 13)))),
  ];
  for (const names of sets) {
    const dropped = prunable(names, NOW);
    assert.ok(dropped.length < names.length, 'everything was pruned from a set of ' + names.length);
  }
});

t('the retention settings are the ones the comments promise', () => {
  assert.equal(KEEP_DAILY_DAYS, 30);
  assert.equal(KEEP_MONTHLY_COUNT, 12);
});

t('PINs are never written into a backup', () => {
  // A backup file gets downloaded onto a phone and forwarded over
  // WhatsApp. The secrets collection holds PINs; a forgotten PIN can
  // be reset, a leaked one cannot be un-leaked.
  assert.ok(!BACKED_UP.includes('secrets'), 'the secrets collection is being backed up');
  assert.ok(!BACKED_UP.includes('login_attempts'), 'login attempts are being backed up');
  for (const needed of ['app_data', 'customers', 'jobs']) {
    assert.ok(BACKED_UP.includes(needed), needed + ' is NOT backed up - it is business data');
  }
});

t('the age is what the screen leads with, and it goes red on its own', () => {
  const at = (h) => ({ at: new Date(NOW - h * 3600000).toISOString(), ok: true });
  assert.equal(backupAge(at(1), NOW).level, 'ok');
  assert.equal(backupAge(at(BACKUP_WARN_HOURS - 1), NOW).level, 'ok');
  assert.equal(backupAge(at(BACKUP_WARN_HOURS), NOW).level, 'warn');
  assert.equal(backupAge(at(BACKUP_BAD_HOURS), NOW).level, 'bad');
  // A cron that silently stopped writes nothing at all, so the status
  // simply stays where it was and the age climbs. That is the point.
  assert.equal(backupAge(at(240), NOW).level, 'bad');
});

t('a run that reported failure is not called fresh', () => {
  const failed = { at: new Date(NOW - 3600000).toISOString(), ok: false, error: 'boom' };
  const res = backupAge(failed, NOW);
  assert.notEqual(res.level, 'ok', 'a failed backup an hour ago reads as healthy');
  assert.match(res.label, /failed/i);
});

t('never backed up reads as never, not as fine', () => {
  for (const nothing of [null, undefined, {}, { at: '' }, { at: 'rubbish' }]) {
    const res = backupAge(nothing, NOW);
    assert.equal(res.level, 'bad', JSON.stringify(nothing));
    assert.match(res.label, /No backup/i);
  }
});

t('a clock set into the future does not read as fresh forever', () => {
  const future = { at: new Date(NOW + 5 * 86400000).toISOString(), ok: true };
  const res = backupAge(future, NOW);
  assert.equal(res.hours, 0, 'a future stamp produced a negative age');
  assert.equal(res.level, 'ok');
});

t('sizes read as sizes', () => {
  assert.equal(readableSize(0), '-');
  assert.equal(readableSize(-5), '-');
  assert.equal(readableSize(null), '-');
  assert.equal(readableSize(900), '900 B');
  assert.equal(readableSize(2048), '2 KB');
  assert.equal(readableSize(5 * 1024 * 1024), '5.0 MB');
});

t('the off-site nudge is occasional, not constant', () => {
  // A warning shown every time stops being read.
  assert.equal(needsOffsiteCopy(null, NOW), true, 'never downloaded should prompt');
  assert.equal(needsOffsiteCopy(new Date(daysAgo(1)).toISOString(), NOW), false);
  assert.equal(needsOffsiteCopy(new Date(daysAgo(OFFSITE_REMIND_DAYS - 1)).toISOString(), NOW), false);
  assert.equal(needsOffsiteCopy(new Date(daysAgo(OFFSITE_REMIND_DAYS)).toISOString(), NOW), true);
  assert.equal(needsOffsiteCopy('rubbish', NOW), true, 'an unreadable stamp should prompt rather than hide');
});

t('every run records what happened, pass or fail', () => {
  const okRun = statusFrom({ ok: true, name: 'backups/backup-2026-10-10.json', sizeBytes: 100, counts: { jobs: 3 } }, 'T');
  assert.deepEqual(okRun, { at: 'T', ok: true, error: null, name: 'backups/backup-2026-10-10.json', sizeBytes: 100, counts: { jobs: 3 } });
  const bad = statusFrom({ ok: false, error: new Error('nope') }, 'T');
  assert.equal(bad.ok, false);
  assert.match(bad.error, /nope/);
  assert.equal(bad.sizeBytes, 0);
});

t('the nightly run cannot be triggered by guessing the URL', () => {
  assert.ok(/req\.method === 'GET'/.test(api), 'the cron path is gone');
  assert.ok(/Bearer ' \+ process\.env\.CRON_SECRET/.test(api), 'the cron secret is no longer checked');
  assert.ok(/!process\.env\.CRON_SECRET \|\|/.test(api),
    'an unset CRON_SECRET would let anyone trigger a backup');
});

t('only an admin session can list or download a copy', () => {
  assert.ok(/verifyIdToken\(idToken\)/.test(api), 'the caller is no longer verified');
  assert.ok(/claims\.role !== 'admin'/.test(api), 'any signed-in user can download the whole business');
  // And a crafted name cannot sign a link to something else in the bucket.
  assert.ok(/!name\.startsWith\(PREFIX\) \|\| !dateFromName\(name\) \|\| name\.includes\('\.\.'\)/.test(api),
    'the download name is not constrained to this endpoint own files');
  assert.ok(/expires: Date\.now\(\) \+ 10 \* 60 \* 1000/.test(api), 'the download link does not expire');
});

t('the new copy is written before any old one is removed', () => {
  // The other order would, on a bad day, leave fewer copies than we
  // started with.
  const saveAt = api.indexOf('.save(Buffer.from(body');
  const deleteAt = api.indexOf('.delete({ ignoreNotFound: true })');
  assert.ok(saveAt > 0 && deleteAt > saveAt, 'pruning happens before the new copy is safe');
  assert.ok(/prune failed \(ignored\)/.test(api),
    'a failed prune can now fail the whole backup, which is backwards');
});

t('clients are locked out of the backup files', () => {
  const rules = readFileSync(new URL('../storage.rules', import.meta.url), 'utf8');
  const block = rules.slice(rules.indexOf('match /backups/'), rules.indexOf('// The app writes nowhere else.'));
  assert.ok(/allow read, write: if false;/.test(block), 'the backups path is readable by clients');
});

t('it runs on a schedule, not on somebody remembering', () => {
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const cron = (vercel.crons || []).find((c) => c.path === '/api/backup');
  assert.ok(cron, 'there is no cron entry - the backup only runs when pressed');
  assert.ok(/^\d+ \d+ \* \* \*$/.test(cron.schedule), 'the schedule is not daily: ' + cron.schedule);
});

t('the screen shows the age, and says what it does not cover', () => {
  const panel = admin.slice(admin.indexOf('function BackupPanel('), admin.indexOf('function AdminSettings('));
  assert.ok(/backupAge\(status, now\)/.test(panel), 'the card no longer shows an age');
  assert.ok(/setInterval\(\(\) => setNow\(Date\.now\(\)\), 60000\)/.test(panel),
    'the age freezes while the screen is open');
  assert.ok(/same Google account as the data/.test(panel),
    'the card no longer admits what the nightly copy does not protect against');
  assert.ok(/window\.backups\.runNow\(\)/.test(panel), 'there is no way to take one by hand');
  assert.ok(/window\.backups\.linkFor\(name\)/.test(panel), 'there is no way to get a copy off the account');
  assert.ok(/<BackupPanel showToast=\{showToast\} \/>/.test(admin), 'the card is not on the Settings screen');
});

console.log(n + ' assertions passed\n');
