const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://lyrzcuujrhnownladqrw.supabase.co';
const supabaseKey = 'sb_publishable_81VDPKogiP8lxak4c8ywLg_54DCMnwQ';
const supabase = createClient(supabaseUrl, supabaseKey);

const DOCUMENTS_DIR = path.join(os.homedir(), 'documents');

const execPromise = (cmd, cwd) => {
  return new Promise((resolve) => {
    exec(cmd, { cwd, maxBuffer: 1024 * 1024 * 10 }, (error, stdout) => {
      resolve(error ? '' : stdout);
    });
  });
};

const isThirdPartyOrFrameworkCommit = (repoName, author, subject) => {
  const lowerRepo = repoName.toLowerCase();
  if (lowerRepo === 'flutter' || lowerRepo === 'flutter_sdk') return true;
  if (author.includes('autoroll') || author.includes('bot')) return true;
  if (subject.startsWith('Roll Skia') || subject.startsWith('Roll Dart SDK') || subject.startsWith('[ci]')) return true;
  if (
    subject.startsWith('Merge branch') || 
    subject.startsWith('Merged in ') || 
    subject.startsWith('Merge pull request') || 
    subject.startsWith('Merge remote-tracking') ||
    subject.includes('(pull request #')
  ) return true;
  return false;
};

const findGitRepos = (dir, depth = 0, maxDepth = 2) => {
  let results = [];
  if (depth > maxDepth) return results;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
        const fullPath = path.join(dir, entry.name);
        if (fs.existsSync(path.join(fullPath, '.git'))) {
          results.push({ name: entry.name, path: fullPath });
        } else {
          results = results.concat(findGitRepos(fullPath, depth + 1, maxDepth));
        }
      }
    }
  } catch (e) {}
  return results;
};

const parseReflog = (raw) => {
  const entries = [];
  if (!raw.trim()) return entries;
  for (const line of raw.trim().split('\n')) {
    if (!line.trim()) continue;
    const m = line.match(/^([0-9a-f]+)\s+HEAD@\{(\d+)[^}]*\}\s*:\s*(.+)$/i);
    if (!m) continue;
    const hash = m[1];
    const timestamp = parseInt(m[2], 10);
    const rest = m[3].trim();
    const entry = { timestamp, action: '', commitHash: hash };
    if (rest.startsWith('checkout:')) {
      entry.action = 'checkout';
      const moveMatch = rest.match(/moving from (.+) to (.+)/);
      if (moveMatch) {
        entry.fromBranch = moveMatch[1].trim();
        entry.toBranch = moveMatch[2].trim();
      }
    } else if (rest.startsWith('commit')) {
      entry.action = 'commit';
      entry.subject = rest.replace(/^commit(\s*\([^)]*\))?:\s*/, '');
    } else if (rest.startsWith('merge')) {
      entry.action = 'merge';
      const mergeBranch = rest.match(/merge\s+(['"]?([a-zA-Z0-9_\-\/]+)['"]?|branch\s+['"]?([a-zA-Z0-9_\-\/]+)['"]?)/i);
      if (mergeBranch) entry.toBranch = mergeBranch[2] || mergeBranch[3];
    } else {
      entry.action = 'other';
    }
    entries.push(entry);
  }
  return entries.reverse();
};

const findActiveWorkDuration = (reflogEntries, commitTimestamp, commitHash, dayStartTs, dayEndTs) => {
  let commitIdx = -1;
  for (let i = reflogEntries.length - 1; i >= 0; i--) {
    const e = reflogEntries[i];
    if (e.action === 'commit' && e.commitHash?.startsWith(commitHash.slice(0, 7))) {
      commitIdx = i; break;
    }
  }
  if (commitIdx === -1) {
    for (let i = reflogEntries.length - 1; i >= 0; i--) {
      const e = reflogEntries[i];
      if (e.action === 'commit' && Math.abs(e.timestamp - commitTimestamp) <= 2) {
        commitIdx = i; break;
      }
    }
  }
  if (commitIdx === -1) return null;

  let workStartTs = 0;
  for (let i = commitIdx - 1; i >= 0; i--) {
    const e = reflogEntries[i];
    if (e.action === 'checkout' && e.toBranch) { workStartTs = e.timestamp; break; }
    if (e.action === 'commit') { workStartTs = e.timestamp; break; }
  }

  if (!workStartTs || workStartTs < commitTimestamp - (3600 * 4.5)) {
    workStartTs = commitTimestamp - 1800; // default 0.5h
  }

  workStartTs = Math.max(workStartTs, dayStartTs);
  const workEndTs = Math.min(commitTimestamp, dayEndTs);
  
  const dateObj = new Date(workEndTs * 1000);
  const yStr = dateObj.getFullYear();
  const mStr = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dStr = String(dateObj.getDate()).padStart(2, '0');
  const lunchStartTs = Math.floor(new Date(`${yStr}-${mStr}-${dStr}T12:00:00+07:00`).getTime() / 1000);
  const lunchEndTs = Math.floor(new Date(`${yStr}-${mStr}-${dStr}T13:00:00+07:00`).getTime() / 1000);

  let effectiveStartTs = workStartTs;
  if (effectiveStartTs >= lunchStartTs && effectiveStartTs < lunchEndTs) effectiveStartTs = lunchEndTs;
  
  let rawDurationSec = workEndTs - effectiveStartTs;
  const overlapStart = Math.max(effectiveStartTs, lunchStartTs);
  const overlapEnd = Math.min(workEndTs, lunchEndTs);
  const lunchOverlapSec = Math.max(0, overlapEnd - overlapStart);
  rawDurationSec = Math.max(0, rawDurationSec - lunchOverlapSec);

  if (rawDurationSec <= 0) return null;
  return { durationHours: Math.min(rawDurationSec / 3600, 4.0), workStartTs: effectiveStartTs, workEndTs };
};

async function runAgent() {
  console.log('🔍 Scanning local repositories...');
  const repos = findGitRepos(DOCUMENTS_DIR).filter(r => r.name.toLowerCase() !== 'flutter');
  console.log(`Found ${repos.length} repositories.`);

  for (const repoInfo of repos) {
    const reflogRaw = await execPromise('git reflog --date=unix', repoInfo.path);
    const reflogEntries = parseReflog(reflogRaw);
    
    // We fetch last 30 days
    const cmd = `git log --pretty=format:"%H|%an|%ad|%s|%D" --date=iso --all --since="30 days ago"`;
    const logRaw = await execPromise(cmd, repoInfo.path);
    if (!logRaw) continue;

    const lines = logRaw.split('\n');
    for (const line of lines) {
      if (!line) continue;
      const [hash, author, date, subject, refs] = line.split('|');
      
      if (isThirdPartyOrFrameworkCommit(repoInfo.name, author, subject)) continue;

      const dateObj = new Date(date);
      const commitTimestamp = Math.floor(dateObj.getTime() / 1000);
      
      const dayStartTs = Math.floor(new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), 0, 0, 0).getTime() / 1000);
      const dayEndTs = Math.floor(new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), 23, 59, 59).getTime() / 1000);

      const tracking = findActiveWorkDuration(reflogEntries, commitTimestamp, hash, dayStartTs, dayEndTs);
      
      let activeDurationHours = 0.5;
      let workStartTime = dateObj.toISOString();
      let workEndTime = dateObj.toISOString();
      if (tracking) {
        activeDurationHours = tracking.durationHours;
        workStartTime = new Date(tracking.workStartTs * 1000).toISOString();
        workEndTime = new Date(tracking.workEndTs * 1000).toISOString();
      }

      const record = {
        repo: repoInfo.name,
        hash,
        author,
        date: dateObj.toISOString(),
        timestamp: dateObj.getTime(),
        activeDurationHours,
        workStartTime,
        workEndTime,
        subject,
        branch: refs ? refs.split(',')[0] : 'main',
        jiraKey: (subject.match(/([a-zA-Z]{2,10}-\d+)/i) || [])[1]?.toUpperCase() || ''
      };

      await supabase.from('git_activities').upsert(record, { onConflict: 'hash' });
    }
  }
  console.log('✅ Sync to Supabase complete!');
}

runAgent();
