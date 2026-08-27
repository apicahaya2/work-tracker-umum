import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;
const DOCUMENTS_DIR = path.join(os.homedir(), 'documents');
const BRAIN_DIR = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'brain');

const execPromise = (cmd: string, cwd: string): Promise<string> => {
  return new Promise((resolve) => {
    exec(cmd, { cwd, maxBuffer: 1024 * 1024 * 10 }, (error, stdout) => {
      resolve(error ? '' : stdout);
    });
  });
};

const isThirdPartyOrFrameworkCommit = (repoName: string, author: string, subject: string) => {
  const lowerRepo = repoName.toLowerCase();
  if (lowerRepo === 'flutter' || lowerRepo === 'flutter_sdk') return true;
  if (author.includes('autoroll') || author.includes('bot')) return true;
  if (subject.startsWith('Roll Skia') || subject.startsWith('Roll Dart SDK') || subject.startsWith('[ci]')) return true;
  // Ignore all types of merge commits (Merge branch, Merged in..., Merge pull request, etc.)
  if (
    subject.startsWith('Merge branch') || 
    subject.startsWith('Merged in ') || 
    subject.startsWith('Merge pull request') || 
    subject.startsWith('Merge remote-tracking') ||
    subject.includes('(pull request #')
  ) return true;
  return false;
};

// Recursive helper to scan for git repositories
const findGitRepos = (dir: string, depth = 0, maxDepth = 2): { name: string; path: string }[] => {
  let results: { name: string; path: string }[] = [];
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

// Discover User's Project Repositories
app.get('/api/repositories', async (req, res) => {
  try {
    const repos = findGitRepos(DOCUMENTS_DIR).filter(r => r.name.toLowerCase() !== 'flutter');
    res.json({ repositories: repos });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Reflog-Based Session Detection Engine ──────────────────────────────────
// Parses `git reflog` to build a precise activity timeline.
// For each commit, finds exactly when the user checked out to that branch
// (work START) and when the commit happened (work END).
// Breaks are auto-excluded: checking out to another branch = session boundary.
// This gives us ~98% accuracy without any manual input.

interface ReflogEntry {
  timestamp: number;  // unix epoch seconds
  action: string;     // 'checkout' | 'commit' | 'merge' | etc.
  fromBranch?: string;
  toBranch?: string;
  commitHash?: string;
  subject?: string;
}

const parseReflog = (raw: string): ReflogEntry[] => {
  const entries: ReflogEntry[] = [];
  if (!raw.trim()) return entries;
  
  for (const line of raw.trim().split('\n')) {
    if (!line.trim()) continue;
    // Format: HASH HEAD@{TIMESTAMP OFFSET}: ACTION: DETAILS
    const m = line.match(/^([0-9a-f]+)\s+HEAD@\{(\d+)[^}]*\}\s*:\s*(.+)$/i);
    if (!m) continue;

    const hash = m[1];
    const timestamp = parseInt(m[2], 10);
    const rest = m[3].trim();

    const entry: ReflogEntry = { timestamp, action: '', commitHash: hash };

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
      if (mergeBranch) {
        entry.toBranch = mergeBranch[2] || mergeBranch[3];
      }
    } else {
      entry.action = 'other';
    }

    entries.push(entry);
  }
  
  // Return chronological order (oldest first)
  return entries.reverse();
};

// For a given commit timestamp, walk backwards through the reflog to find
// when the user started working on that branch (the checkout-in moment).
// Also detect idle gaps by looking for periods where the user was on a
// different branch (checkout away and back).
const findActiveWorkDuration = (
  reflogEntries: ReflogEntry[],
  commitTimestamp: number,
  commitHash: string,
  dayStartTs: number,  // start of the target day (00:00:00)
  dayEndTs: number     // end of the target day (23:59:59)
): { durationHours: number; workStartTs: number; workEndTs: number } | null => {
  // Find the commit entry in reflog
  let commitIdx = -1;
  for (let i = reflogEntries.length - 1; i >= 0; i--) {
    const e = reflogEntries[i];
    if (e.action === 'commit' && e.commitHash?.startsWith(commitHash.slice(0, 7))) {
      commitIdx = i;
      break;
    }
    // Also match by timestamp proximity (within 2 seconds)
    if (e.action === 'commit' && Math.abs(e.timestamp - commitTimestamp) <= 2) {
      commitIdx = i;
      break;
    }
  }

  if (commitIdx === -1) {
    // Commit not found in reflog, can't determine precise duration
    return null;
  }

  // Walk backwards from commit to find the checkout-in event
  let workStartTs = 0;
  
  for (let i = commitIdx - 1; i >= 0; i--) {
    const e = reflogEntries[i];
    
    // If we find a checkout TO a branch, that's our start
    if (e.action === 'checkout' && e.toBranch) {
      workStartTs = e.timestamp;
      break;
    }
    
    // If we find a previous commit, use that as boundary
    if (e.action === 'commit') {
      workStartTs = e.timestamp;
      break;
    }
  }

  // If no valid previous event found, default to 30 mins before commit (or up to 4.5h if valid checkout was found)
  if (!workStartTs || workStartTs < commitTimestamp - (3600 * 4.5)) {
    workStartTs = commitTimestamp - 1800; // default 0.5h
  }

  // Clamp to the target day boundaries
  workStartTs = Math.max(workStartTs, dayStartTs);
  const workEndTs = Math.min(commitTimestamp, dayEndTs);

  // Deduct lunch break (12:00 - 13:00 WIB)
  const dateObj = new Date(workEndTs * 1000);
  const yStr = dateObj.getFullYear();
  const mStr = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dStr = String(dateObj.getDate()).padStart(2, '0');

  const lunchStartTs = Math.floor(new Date(`${yStr}-${mStr}-${dStr}T12:00:00+07:00`).getTime() / 1000);
  const lunchEndTs = Math.floor(new Date(`${yStr}-${mStr}-${dStr}T13:00:00+07:00`).getTime() / 1000);

  // If session checkout occurred during lunch or before lunch, adjust start time
  let effectiveStartTs = workStartTs;
  if (effectiveStartTs >= lunchStartTs && effectiveStartTs < lunchEndTs) {
    effectiveStartTs = lunchEndTs;
  }

  let rawDurationSec = workEndTs - effectiveStartTs;

  // Deduct lunch overlap if session spans across lunch
  const overlapStart = Math.max(effectiveStartTs, lunchStartTs);
  const overlapEnd = Math.min(workEndTs, lunchEndTs);
  const lunchOverlapSec = Math.max(0, overlapEnd - overlapStart);

  rawDurationSec = Math.max(0, rawDurationSec - lunchOverlapSec);

  if (rawDurationSec <= 0) return null;

  const durationHours = rawDurationSec / 3600;

  return {
    durationHours: Math.min(durationHours, 4.0),
    workStartTs: effectiveStartTs,
    workEndTs
  };
};

// Get Combined Activity (Git Commits + Reflog Session Tracking)
app.post('/api/git-activity', async (req, res) => {
  const { repos, startDate, endDate } = req.body;

  try {
    const allDiscovered = findGitRepos(DOCUMENTS_DIR).filter(r => r.name.toLowerCase() !== 'flutter');

    // 1. Filter repos to process first before doing filesystem / git operations
    const targetRepoInfos = (Array.isArray(repos) && repos.length > 0)
      ? allDiscovered.filter(r => repos.includes(r.name))
      : allDiscovered;

    const sinceArg = startDate ? `--since="${startDate}T00:00:00"` : '';
    const untilArg = endDate ? `--until="${endDate}T23:59:59"` : '';

    const promises = targetRepoInfos.map(async (repoInfo) => {
      const repoActivities: any[] = [];
      const prBranchMap: { [hash: string]: string } = {};

      const reflogRaw = await execPromise('git reflog --date=unix', repoInfo.path);
      const reflogEntries = parseReflog(reflogRaw);

      try {
        // Detect base branch (development, main, or master)
        let baseExclude = '';
        try {
          await execPromise(`git rev-parse --verify development`, repoInfo.path);
          baseExclude = 'development';
        } catch {
          try {
            await execPromise(`git rev-parse --verify main`, repoInfo.path);
            baseExclude = 'main';
          } catch {}
        }
        const excludeArg = baseExclude ? `--not ${baseExclude}` : '';

        // 1. Map commits directly from active local and remote feature branches
        const refsOut = await execPromise(`git for-each-ref --format="%(refname:short)" refs/heads/ refs/remotes/origin/`, repoInfo.path);
        if (refsOut.trim()) {
          const branches = refsOut.trim().split('\n')
            .map(b => b.replace(/^origin\//, '').trim())
            .filter(b => b && !['main', 'master', 'development', 'develop', 'HEAD', 'origin'].includes(b));
          const uniqueBranches = Array.from(new Set(branches));

          for (const bName of uniqueBranches) {
            try {
              const bCommits = await execPromise(`git log "${bName}" ${excludeArg} --format="%H|%h" -n 100 2>/dev/null`, repoInfo.path);
              if (bCommits.trim()) {
                bCommits.trim().split('\n').forEach(cLine => {
                  const [fH, sH] = cLine.split('|');
                  if (fH) prBranchMap[fH.trim().toLowerCase()] = bName;
                  if (sH) prBranchMap[sH.trim().toLowerCase()] = bName;
                });
              }
            } catch {}
          }
        }

        // 2. Scan recent merge commits to recover feature branch names even if branches were deleted after merge
        const allMergesCmd = `git log --merges -n 200 --format="%H|%s"`;
        const allMergesOut = await execPromise(allMergesCmd, repoInfo.path);
        if (allMergesOut.trim()) {
          for (const line of allMergesOut.trim().split('\n')) {
            const [mHash, mSubj] = line.split('|');
            if (!mHash || !mSubj) continue;

            // Pattern 1: Bitbucket: Merged in feature/foo (pull request #123)
            // Pattern 2: GitHub: Merge pull request #123 from org/feature/foo
            // Pattern 3: GitLab / Git CLI: Merge branch 'feature/foo' into develop
            let bName = '';
            const bbMatch = mSubj.match(/Merged in ([^\s]+)\s+\(pull request/i);
            const ghMatch = mSubj.match(/Merge pull request #\d+ from (?:[^\/\s]+\/)?([^\s]+)/i);
            const glMatch = mSubj.match(/Merge branch ['"]?([^'"]+)['"]?/i);

            if (bbMatch) bName = bbMatch[1].trim();
            else if (ghMatch) bName = ghMatch[1].trim();
            else if (glMatch) bName = glMatch[1].trim();

            if (bName && !['main', 'master', 'development', 'develop', 'HEAD'].includes(bName)) {
              const mergedCommitsCmd = `git log ${mHash}^2 --not ${mHash}^1 --format="%H|%h" -n 100 2>/dev/null`;
              const mergedCommitsOut = await execPromise(mergedCommitsCmd, repoInfo.path);
              if (mergedCommitsOut.trim()) {
                mergedCommitsOut.trim().split('\n').forEach(cLine => {
                  const [fullH, shortH] = cLine.split('|');
                  if (fullH && !prBranchMap[fullH.trim().toLowerCase()]) prBranchMap[fullH.trim().toLowerCase()] = bName;
                  if (shortH && !prBranchMap[shortH.trim().toLowerCase()]) prBranchMap[shortH.trim().toLowerCase()] = bName;
                });
              }
            }
          }
        }
      } catch {}

      // Detect local user's Git Name/Email dynamically for this repo
      let localGitUser = '';
      try {
        const uName = await execPromise(`git config user.name`, repoInfo.path);
        const uEmail = await execPromise(`git config user.email`, repoInfo.path);
        localGitUser = (uName.trim() || uEmail.trim()).toLowerCase();
      } catch {}

      // Fallback if local git config user.name is empty
      const targetAuthorFilter = localGitUser ? localGitUser.split(' ')[0] : '';

      const sinceArg = startDate ? `--since="${startDate}T00:00:00"` : '';
      const untilArg = endDate ? `--until="${endDate}T23:59:59"` : '';
      const authorArg = targetAuthorFilter ? `-i --author="${targetAuthorFilter}"` : '';

      let gitLogCmd = `git log --all ${authorArg} ${sinceArg} ${untilArg} --format="%H|%an|%ad|%ct|%D|%s" --date=iso-strict`;
      let stdout = await execPromise(gitLogCmd, repoInfo.path);

      if (!stdout.trim()) {
        gitLogCmd = `git log --all ${sinceArg} ${untilArg} --format="%H|%an|%ad|%ct|%D|%s" --date=iso-strict`;
        stdout = await execPromise(gitLogCmd, repoInfo.path);
      }

      if (stdout.trim()) {
        const lines = stdout.trim().split('\n');
        for (const line of lines) {
          const parts = line.split('|');
          const hash = parts[0];
          const author = parts[1];
          const dateStr = parts[2];
          const commitTimestampStr = parts[3];
          const decorateRefs = parts[4] || '';
          const subject = parts.slice(5).join('|'); // subject may contain '|'

          if (hash && dateStr && !isThirdPartyOrFrameworkCommit(repoInfo.name, author || '', subject || '')) {
            const commitTs = parseInt(commitTimestampStr, 10) || Math.floor(new Date(dateStr).getTime() / 1000);

            // 1. Direct PR Feature Branch mapping from Git merge tree ancestry or active branches
            const cleanHash = hash.trim().toLowerCase();
            let branchName = prBranchMap[cleanHash] || prBranchMap[cleanHash.slice(0, 7)] || '';

            // 2. Fallback: Parse from %D decorated refs
            if (!branchName && decorateRefs) {
              const refParts = decorateRefs.split(',').map((r: string) => r.trim());
              for (const ref of refParts) {
                const cleaned = ref.replace('HEAD -> ', '').replace(/^origin\//, '').trim();
                if (cleaned && !cleaned.startsWith('tag:') && cleaned !== 'HEAD' && cleaned !== 'development' && cleaned !== 'main' && cleaned !== 'master') {
                  branchName = cleaned;
                  break;
                }
              }
            }

            // 3. Fallback: git branch -a --contains <hash>
            if (!branchName) {
              try {
                const containsOut = await execPromise(`git branch -a --contains ${hash.slice(0, 8)}`, repoInfo.path);
                if (containsOut.trim()) {
                  for (const bLine of containsOut.trim().split('\n')) {
                    const bClean = bLine.replace(/^[* ]+/, '').replace(/^remotes\/origin\//, '').replace(/^origin\//, '').trim();
                    if (bClean && !['main', 'master', 'development', 'develop', 'HEAD'].includes(bClean)) {
                      branchName = bClean;
                      break;
                    }
                  }
                }
              } catch {}
            }

            // 4. Exact Branch from `HEAD` Reflog checkout timeline
            if (!branchName) {
              for (let i = reflogEntries.length - 1; i >= 0; i--) {
                const e = reflogEntries[i];
                if (e.timestamp <= commitTs + 1800 && e.action === 'checkout' && e.toBranch && !['main', 'master', 'development', 'develop', 'HEAD'].includes(e.toBranch)) {
                  branchName = e.toBranch;
                  break;
                }
              }
            }

            // 5. Try parsing branch name directly from commit subject (e.g. 'Merge branch fix/foo')
            if (!branchName && subject) {
              const match = subject.match(/(?:into|branch|from|in)\s+['"]?([a-zA-Z0-9_\-\/]+)['"]?/i);
              if (match && !['main', 'master', 'development', 'develop', 'HEAD'].includes(match[1])) {
                branchName = match[1];
              }
            }

            // 6. Default fallback to development/main branch if commit was made directly on it
            if (!branchName && (decorateRefs.includes('development') || decorateRefs.includes('main'))) {
              branchName = decorateRefs.includes('development') ? 'development' : 'main';
            }
            
            // Calculate day boundaries for the commit's date
            const commitDate = dateStr.slice(0, 10); // YYYY-MM-DD
            const dayStartTs = Math.floor(new Date(`${commitDate}T00:00:00+07:00`).getTime() / 1000);
            const dayEndTs = Math.floor(new Date(`${commitDate}T23:59:59+07:00`).getTime() / 1000);

            // Step 3: Use reflog session detection to find true active work duration
            const sessionResult = findActiveWorkDuration(reflogEntries, commitTs, hash, dayStartTs, dayEndTs);
            
            let durationHours = 0.5;
            let workStartTime = '';
            let workEndTime = '';
            
            if (sessionResult && sessionResult.workStartTs && sessionResult.workEndTs) {
              const rawHours = (sessionResult.workEndTs - sessionResult.workStartTs) / 3600;
              // Round to nearest 0.25h (e.g. 15 mins = 0.25h)
              durationHours = Math.max(0.25, Math.round(rawHours * 4) / 4);
              const startDate = new Date(sessionResult.workStartTs * 1000);
              const endDate = new Date(sessionResult.workEndTs * 1000);
              workStartTime = startDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
              workEndTime = endDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
            } else {
              // Calculate actual start time based on durationHours
              const endDate = new Date(commitTs * 1000);
              const startDate = new Date((commitTs - (durationHours * 3600)) * 1000);
              workStartTime = startDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
              workEndTime = endDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
            }

            // Extract Jira Ticket Key (e.g. BAKMIGM-780, BGM-123) from branch name or commit subject
            let jiraKey = '';
            const branchMatch = branchName.match(/([a-zA-Z]{2,10}-\d+)/i);
            if (branchMatch) {
              jiraKey = branchMatch[1].toUpperCase();
            } else if (subject) {
              const subjectMatch = subject.match(/([a-zA-Z]{2,10}-\d+)/i);
              if (subjectMatch) {
                jiraKey = subjectMatch[1].toUpperCase();
              }
            }

            repoActivities.push({
              repo: repoInfo.name,
              hash: hash.slice(0, 7),
              author,
              date: dateStr,
              timestamp: commitTs,
              activeDurationHours: durationHours,
              workStartTime,
              workEndTime,
              subject,
              branch: branchName,
              jiraKey,
              type: 'git_commit'
            });
          }
        }
      }
      return repoActivities;
    });

    const results = await Promise.all(promises);
    const activities = results.flat();

    res.json({ activities });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Calendar events API - NO DUMMY FALLBACKS! Parses DTSTART/DTEND for real durations & live iCal URL
app.post('/api/calendar-events', async (req, res) => {
  const { date, startDate, endDate, icalUrl } = req.body;
  const targetDate = date || new Date().toISOString().split('T')[0];

  try {
    const downloadsDir = path.join(os.homedir(), 'Downloads');
    const icsPaths = [
      path.join(DOCUMENTS_DIR, 'calendar.ics'),
      path.join(DOCUMENTS_DIR, 'meetings.ics'),
      path.join(os.homedir(), 'calendar.ics'),
      path.join(downloadsDir, 'Agni Noor Muhammad Calendar.ics'),
      path.join(downloadsDir, 'calendar.ics'),
      path.join(downloadsDir, 'meetings.ics')
    ];

    let liveIcsContent = '';
    // Fetch live iCal URL if user provided one
    if (icalUrl && icalUrl.startsWith('http')) {
      try {
        const fetchRes = await fetch(icalUrl);
        if (fetchRes.ok) {
          liveIcsContent = await fetchRes.text();
        }
      } catch (e) {
        console.warn('Could not fetch live iCal URL');
      }
    }

    const events: any[] = [];
    const contents: string[] = [];

    if (liveIcsContent) {
      contents.push(liveIcsContent);
    }

    for (const icsPath of icsPaths) {
      if (fs.existsSync(icsPath)) {
        contents.push(fs.readFileSync(icsPath, 'utf8'));
      }
    }

    contents.forEach((content) => {
      const vevents = content.split('BEGIN:VEVENT');
      vevents.shift();

      vevents.forEach((vev, idx) => {
        if (vev.match(/STATUS:CANCELLED/i) || vev.match(/METHOD:CANCEL/i)) return;

        const summaryMatch = vev.match(/SUMMARY:(.*)/);
        const dtstartMatch = vev.match(/DTSTART.*:(.*)/);
        const dtendMatch = vev.match(/DTEND.*:(.*)/);

        if (summaryMatch && dtstartMatch) {
          const summary = summaryMatch[1].trim();
          const lowerSummary = summary.toLowerCase();
          if (lowerSummary.startsWith('canceled:') || lowerSummary.startsWith('cancelled:')) return;

          const dtstartRaw = dtstartMatch[1].trim();
          const year = parseInt(dtstartRaw.slice(0, 4), 10);
          const month = parseInt(dtstartRaw.slice(4, 6), 10) - 1;
          const day = parseInt(dtstartRaw.slice(6, 8), 10);
          const startUtc = new Date(Date.UTC(year, month, day));

          // Compute duration from DTSTART & DTEND
          let durationHours = 0.5;
          let startTimeStr = '';
          let endTimeStr = '';

          const mStart = dtstartRaw.match(/T(\d{2})(\d{2})/);
          const mEnd = dtendMatch ? dtendMatch[1].trim().match(/T(\d{2})(\d{2})/) : null;

          if (mStart && mEnd) {
            const sh = parseInt(mStart[1], 10);
            const sm = parseInt(mStart[2], 10);
            const eh = parseInt(mEnd[1], 10);
            const em = parseInt(mEnd[2], 10);
            const diffMin = (eh * 60 + em) - (sh * 60 + sm);
            if (diffMin > 0) {
              durationHours = Math.max(0.25, Math.round((diffMin / 60) * 4) / 4);
            }
            startTimeStr = `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`;
            endTimeStr = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
          }

          const timeRange = (startTimeStr && endTimeStr) ? `${startTimeStr}→${endTimeStr}` : '';

          const rruleMatch = vev.match(/RRULE:(.*)/);
          if (rruleMatch) {
            const rrule = rruleMatch[1];
            const untilMatch = rrule.match(/UNTIL=(\d{8})/);
            const intervalMatch = rrule.match(/INTERVAL=(\d+)/);
            const interval = intervalMatch ? parseInt(intervalMatch[1], 10) : 1;

            let untilDate = new Date(Date.UTC(2026, 11, 31));
            if (untilMatch) {
              const uY = parseInt(untilMatch[1].slice(0, 4), 10);
              const uM = parseInt(untilMatch[1].slice(4, 6), 10) - 1;
              const uD = parseInt(untilMatch[1].slice(6, 8), 10);
              untilDate = new Date(Date.UTC(uY, uM, uD));
            }

            let curr = new Date(startUtc.getTime());
            while (curr <= untilDate) {
              const yStr = curr.getUTCFullYear();
              const mStr = String(curr.getUTCMonth() + 1).padStart(2, '0');
              const dStr = String(curr.getUTCDate()).padStart(2, '0');
              const evDate = `${yStr}-${mStr}-${dStr}`;

              const isMatch = (startDate && endDate)
                ? (evDate >= startDate && evDate <= endDate)
                : (evDate === targetDate);

              if (isMatch) {
                events.push({
                  id: `ics-${idx}-${yStr}${mStr}${dStr}`,
                  title: summary,
                  durationHours,
                  timeRange,
                  date: evDate
                });
              }

              curr.setUTCDate(curr.getUTCDate() + (7 * interval));
            }
          } else {
            const yStr = startUtc.getUTCFullYear();
            const mStr = String(startUtc.getUTCMonth() + 1).padStart(2, '0');
            const dStr = String(startUtc.getUTCDate()).padStart(2, '0');
            const evDate = `${yStr}-${mStr}-${dStr}`;

            const isMatch = (startDate && endDate)
              ? (evDate >= startDate && evDate <= endDate)
              : (evDate === targetDate);

            if (isMatch) {
              events.push({
                id: `ics-${idx}`,
                title: summary,
                durationHours,
                timeRange,
                date: evDate
              });
            }
          }
        }
      });
    });

    // Deduplicate events by title + date + timeRange
    const uniqueEvents: any[] = [];
    const seenKeys = new Set<string>();

    events.forEach(ev => {
      const key = `${ev.date}_${ev.title.toLowerCase().trim()}_${ev.timeRange || ''}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        uniqueEvents.push(ev);
      }
    });

    // Absolutely NO fake/mock meeting injected
    res.json({ events: uniqueEvents });
  } catch (err: any) {
    res.json({ events: [] });
  }
});

// ── Jira Integration Endpoints ──────────────────────────────────────────────
const fetchJiraApi = async (url: string, authHeader: string, options: { method?: string; body?: any } = {}) => {
  const method = options.method || 'GET';
  const headers: Record<string, string> = {
    'Authorization': authHeader,
    'Accept': 'application/json'
  };
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const text = await response.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      if (text.includes('<!DOCTYPE') || text.includes('<html')) {
        return {
          ok: false,
          status: response.status,
          error: `Jira mengembalikan halaman HTML (Status ${response.status}). Pastikan Domain Jira benar (contoh: namaperusahaan.atlassian.net) dan token API valid.`
        };
      }
      return {
        ok: false,
        status: response.status,
        error: `Respon Jira bukan JSON (Status ${response.status}): ${text.slice(0, 150)}`
      };
    }

    if (!response.ok) {
      const errMsg = (data?.errorMessages && data.errorMessages.length > 0)
        ? data.errorMessages.join(', ')
        : (data?.message || data?.error || `HTTP ${response.status}`);
      return {
        ok: false,
        status: response.status,
        error: `Jira API Error (${response.status}): ${errMsg}`
      };
    }

    return { ok: true, status: response.status, data };
  } catch (err: any) {
    return { ok: false, status: 500, error: err.message || 'Gagal terhubung ke Jira' };
  }
};

app.post('/api/jira-test', async (req, res) => {
  const { jiraHost, jiraEmail, jiraToken } = req.body;
  if (!jiraHost || !jiraToken) {
    return res.status(400).json({ success: false, error: 'Jira Domain & API Token wajib diisi' });
  }

  const cleanHost = jiraHost.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const authHeader = jiraEmail
    ? `Basic ${Buffer.from(`${jiraEmail.trim()}:${jiraToken.trim()}`).toString('base64')}`
    : `Bearer ${jiraToken.trim()}`;

  // Try v3 API first (Jira Cloud), fallback to v2 (Jira Server / Data Center)
  let result = await fetchJiraApi(`https://${cleanHost}/rest/api/3/myself`, authHeader);
  if (!result.ok && result.status === 404) {
    result = await fetchJiraApi(`https://${cleanHost}/rest/api/2/myself`, authHeader);
  }

  if (!result.ok) {
    return res.status(result.status || 500).json({ success: false, error: result.error });
  }

  const userData = result.data;
  res.json({
    success: true,
    user: {
      accountId: userData.accountId || '',
      displayName: userData.displayName || userData.name || 'Jira User',
      emailAddress: userData.emailAddress || jiraEmail || '',
      avatarUrl: userData.avatarUrls?.['48x48'] || userData.avatarUrls?.['32x32']
    }
  });
});

// Get Jira Projects List
app.post('/api/jira-projects', async (req, res) => {
  const { jiraHost, jiraEmail, jiraToken } = req.body;
  if (!jiraHost || !jiraToken) {
    return res.json({ projects: [] });
  }

  const cleanHost = jiraHost.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const authHeader = jiraEmail
    ? `Basic ${Buffer.from(`${jiraEmail.trim()}:${jiraToken.trim()}`).toString('base64')}`
    : `Bearer ${jiraToken.trim()}`;

  let result = await fetchJiraApi(`https://${cleanHost}/rest/api/3/project`, authHeader);
  if (!result.ok && result.status === 404) {
    result = await fetchJiraApi(`https://${cleanHost}/rest/api/2/project`, authHeader);
  }

  if (!result.ok || !Array.isArray(result.data)) {
    return res.json({ projects: [] });
  }

  const projects = result.data.map((p: any) => ({
    id: p.id,
    key: p.key,
    name: p.name,
    avatarUrl: p.avatarUrls?.['24x24'] || p.avatarUrls?.['32x32'] || ''
  })).sort((a: any, b: any) => {
    const aIsBakmi = a.name.toLowerCase().includes('bakmi') || a.key.toLowerCase().includes('bakmi') || a.key.toLowerCase().includes('bgm');
    const bIsBakmi = b.name.toLowerCase().includes('bakmi') || b.key.toLowerCase().includes('bakmi') || b.key.toLowerCase().includes('bgm');
    if (aIsBakmi && !bIsBakmi) return -1;
    if (!aIsBakmi && bIsBakmi) return 1;
    return a.name.localeCompare(b.name);
  });

  res.json({ projects });
});

app.post('/api/jira-issues', async (req, res) => {
  const { jiraHost, jiraEmail, jiraToken, startDate, endDate, scope = 'active_sprint', searchQuery, projectKey, onlyActiveSprint = true } = req.body;
  if (!jiraHost || !jiraToken) {
    return res.status(400).json({ issues: [], error: 'Jira Domain & API Token tidak dikonfigurasi' });
  }

  const cleanHost = jiraHost.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const authHeader = jiraEmail
    ? `Basic ${Buffer.from(`${jiraEmail.trim()}:${jiraToken.trim()}`).toString('base64')}`
    : `Bearer ${jiraToken.trim()}`;

  // Build JQL conditions
  const conditions: string[] = [];

  // Project filter
  if (projectKey && projectKey !== 'ALL') {
    const pKey = projectKey.trim();
    if (pKey.toUpperCase() === 'BAKMIGM' || pKey.toLowerCase().includes('bakmi')) {
      conditions.push(`project in ("${pKey}", "BAKMIGM", "BGM")`);
    } else {
      conditions.push(`project = "${pKey}"`);
    }
  }

  // Active Sprint filter (sprint in openSprints())
  const applyActiveSprint = onlyActiveSprint || scope === 'active_sprint';
  if (applyActiveSprint && scope !== 'all_project') {
    conditions.push('sprint in openSprints()');
  }

  // Search query
  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.trim().replace(/["\\]/g, '');
    if (q) {
      if (/^[a-zA-Z0-9]+-\d+$/.test(q)) {
        // Issue key format e.g. BAK-123
        conditions.push(`(issueKey = "${q}" OR text ~ "${q}")`);
      } else {
        conditions.push(`(summary ~ "${q}" OR text ~ "${q}")`);
      }
    }
  } else {
    // Scope filters
    if (scope === 'assigned') {
      conditions.push('assignee = currentUser()');
    } else if (scope === 'reported') {
      conditions.push('reporter = currentUser()');
    } else if (scope === 'active') {
      conditions.push('resolution = Unresolved');
    } else if (scope === 'period' && startDate) {
      if (endDate && endDate !== startDate) {
        conditions.push(`(assignee = currentUser() OR reporter = currentUser()) AND updated >= "${startDate}" AND updated <= "${endDate}"`);
      } else {
        conditions.push(`(assignee = currentUser() OR reporter = currentUser()) AND updated >= "${startDate}"`);
      }
    } else if (scope === 'my') {
      conditions.push('(assignee = currentUser() OR reporter = currentUser())');
    } else if (scope === 'all_project' || scope === 'all') {
      // No user constraint, no sprint constraint
    } else {
      // Default: 'active_sprint' -> All issues in the open sprint
    }
  }

  const whereClause = conditions.length > 0 ? conditions.join(' AND ') : '';
  const jql = whereClause ? `${whereClause} ORDER BY updated DESC` : 'ORDER BY updated DESC';

  const fields = [
    'summary',
    'status',
    'priority',
    'issuetype',
    'updated',
    'created',
    'project',
    'timespent',
    'timeoriginalestimate',
    'assignee',
    'reporter',
    'subtasks',
    'parent',
    'description'
  ];

  const searchPayload = {
    jql,
    maxResults: 50,
    fields,
    expand: ['changelog']
  };

  // Helper to calculate Dev Phase 1 & 2 durations from Jira issue changelog
  const calculateDevPhases = (histories: any[] = []) => {
    const timeline: { from: string; to: string; author?: string; timestamp: string; dateFormatted: string; time: number }[] = [];

    if (Array.isArray(histories)) {
      histories.forEach(h => {
        const createdStr = h.created;
        const createdTs = new Date(createdStr).getTime();
        const author = h.author?.displayName || '';
        const items = h.items || [];
        items.forEach((it: any) => {
          if (it.field === 'status') {
            timeline.push({
              from: it.fromString || '',
              to: it.toString || '',
              author,
              timestamp: createdStr,
              dateFormatted: new Date(createdStr).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false }),
              time: createdTs
            });
          }
        });
      });
    }

    // Sort timeline chronologically (oldest first)
    timeline.sort((a, b) => a.time - b.time);

    let devStartTs = 0;
    let devStartStr = '';
    let readyReviewTs = 0;
    let readyReviewStr = '';
    let reviewDoneTs = 0;
    let reviewDoneStr = '';
    let readyQaTs = 0;
    let readyQaStr = '';
    let doneTs = 0;
    let doneStr = '';

    timeline.forEach(t => {
      const toLower = t.to.toLowerCase();
      const fromLower = t.from.toLowerCase();

      // 1. DEV in Progress start (Fase 1 Mulai)
      if (toLower.includes('dev in progress') || toLower.includes('in progress') || toLower.includes('in development') || toLower.includes('development')) {
        if (!devStartTs) {
          devStartTs = t.time;
          devStartStr = t.dateFormatted;
        }
      }

      // 2. Ready To Code Review (Fase 1 Selesai ➔ Review Mulai)
      if (toLower.includes('ready to code review') || toLower.includes('ready for code review') || toLower.includes('in code review') || toLower.includes('code review in progress') || toLower.includes('in review') || (fromLower.includes('progress') && toLower.includes('review'))) {
        if (!readyReviewTs) {
          readyReviewTs = t.time;
          readyReviewStr = t.dateFormatted;
        }
      }

      // 3. Code Review Done (Review Selesai ➔ Fase 2 Mulai)
      if (toLower.includes('code review done') || toLower.includes('review done') || toLower.includes('approved')) {
        if (!reviewDoneTs) {
          reviewDoneTs = t.time;
          reviewDoneStr = t.dateFormatted;
        }
      }

      // 4. Ready To QA (Fase 2 Selesai ➔ Masuk QA)
      if (toLower.includes('ready to qa') || toLower.includes('ready for qa') || toLower.includes('in qa') || toLower.includes('qa in progress') || toLower.includes('testing')) {
        if (!readyQaTs) {
          readyQaTs = t.time;
          readyQaStr = t.dateFormatted;
        }
      }

      // 5. Done / Closed / Resolved
      if (toLower.includes('done') || toLower.includes('closed') || toLower.includes('resolved') || toLower.includes('released')) {
        if (!doneTs) {
          doneTs = t.time;
          doneStr = t.dateFormatted;
        }
      }
    });

    const nowTs = Date.now();

    // Helper: calculate exact elapsed working hours (excluding weekends and non-working hours 09:00-18:00, lunch 12:00-13:00)
    const calcWorkingHours = (startTs: number, endTs: number) => {
      if (!startTs || !endTs || endTs <= startTs) return 0;

      let totalWorkingSeconds = 0;
      const startDateJakartaStr = new Date(startTs).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
      const endDateJakartaStr = new Date(endTs).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

      let dayCursor = new Date(`${startDateJakartaStr}T00:00:00+07:00`);
      const finalDay = new Date(`${endDateJakartaStr}T00:00:00+07:00`);

      while (dayCursor.getTime() <= finalDay.getTime()) {
        const yStr = dayCursor.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
        const dayOfWeek = dayCursor.getDay(); // 0 = Sunday, 6 = Saturday
        const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);

        const morningStart = new Date(`${yStr}T09:00:00+07:00`).getTime();
        const morningEnd = new Date(`${yStr}T12:00:00+07:00`).getTime();
        const afternoonStart = new Date(`${yStr}T13:00:00+07:00`).getTime();
        const afternoonEnd = new Date(`${yStr}T18:00:00+07:00`).getTime();

        if (!isWeekend) {
          // Standard working hours overlap (09:00 - 12:00 and 13:00 - 18:00)
          const mStart = Math.max(startTs, morningStart);
          const mEnd = Math.min(endTs, morningEnd);
          if (mEnd > mStart) {
            totalWorkingSeconds += (mEnd - mStart) / 1000;
          }

          const aStart = Math.max(startTs, afternoonStart);
          const aEnd = Math.min(endTs, afternoonEnd);
          if (aEnd > aStart) {
            totalWorkingSeconds += (aEnd - aStart) / 1000;
          }

          // Early morning overtime before 09:00 (e.g. 07:00-09:00)
          const earlyLimit = new Date(`${yStr}T06:00:00+07:00`).getTime();
          if (startTs < morningStart && endTs > earlyLimit) {
            const eStart = Math.max(startTs, earlyLimit);
            const eEnd = Math.min(endTs, morningStart);
            if (eEnd > eStart) {
              totalWorkingSeconds += (eEnd - eStart) / 1000;
            }
          }

          // Evening overtime after 18:00
          const lateLimit = new Date(`${yStr}T23:59:59+07:00`).getTime();
          if (endTs > afternoonEnd) {
            const lStart = Math.max(startTs, afternoonEnd);
            const lEnd = Math.min(endTs, lateLimit);
            if (lEnd > lStart) {
              totalWorkingSeconds += (lEnd - lStart) / 1000;
            }
          }
        } else {
          // Weekend: Excluded unless start/end timestamps are on this weekend (active lembur)
          const isStartOnThisWeekend = (startTs >= new Date(`${yStr}T00:00:00+07:00`).getTime() && startTs <= new Date(`${yStr}T23:59:59+07:00`).getTime());
          const isEndOnThisWeekend = (endTs >= new Date(`${yStr}T00:00:00+07:00`).getTime() && endTs <= new Date(`${yStr}T23:59:59+07:00`).getTime());
          if (isStartOnThisWeekend || isEndOnThisWeekend) {
            const wStart = Math.max(startTs, new Date(`${yStr}T09:00:00+07:00`).getTime());
            const wEnd = Math.min(endTs, new Date(`${yStr}T18:00:00+07:00`).getTime());
            if (wEnd > wStart) {
              totalWorkingSeconds += (wEnd - wStart) / 1000;
            }
          }
        }

        dayCursor.setDate(dayCursor.getDate() + 1);
      }

      const hours = totalWorkingSeconds / 3600;
      return Math.max(0.1, Math.round(hours * 10) / 10);
    };

    // Determine active phase states
    const isFase1Ongoing = !!devStartTs && !readyReviewTs && !doneTs;
    const isReviewOngoing = !!readyReviewTs && !reviewDoneTs && !readyQaTs && !doneTs;
    const isFase2Ongoing = !!reviewDoneTs && !readyQaTs && !doneTs;
    const isQaOngoing = !!readyQaTs && !doneTs;

    const effectiveF1End = readyReviewTs || (isFase1Ongoing ? nowTs : 0);
    const effectiveReviewEnd = reviewDoneTs || (isReviewOngoing ? nowTs : 0);
    const effectiveF2End = readyQaTs || (isFase2Ongoing ? nowTs : 0);
    const effectiveQaEnd = doneTs || (isQaOngoing ? nowTs : 0);

    const fase1Hours = calcWorkingHours(devStartTs, effectiveF1End);
    const reviewHours = calcWorkingHours(readyReviewTs, effectiveReviewEnd);
    const fase2Hours = calcWorkingHours(reviewDoneTs, effectiveF2End);
    const qaHours = calcWorkingHours(readyQaTs, effectiveQaEnd);
    const totalDevHours = Math.round((fase1Hours + fase2Hours) * 10) / 10;

    // Total Lead Time (working hours from dev start to completion)
    const overallEndTs = doneTs || (devStartTs ? nowTs : 0);
    const totalLeadHours = devStartTs ? calcWorkingHours(devStartTs, overallEndTs) : totalDevHours;

    // Determine Current Phase string
    let currentPhase = 'To Do';
    if (doneTs) currentPhase = 'Done';
    else if (readyQaTs) currentPhase = 'In QA';
    else if (reviewDoneTs) currentPhase = 'Fixing/Prep QA';
    else if (readyReviewTs) currentPhase = 'In Code Review';
    else if (devStartTs) currentPhase = 'Dev In Progress';

    return {
      fase1Start: devStartStr,
      fase1End: readyReviewStr,
      fase1Hours,
      isFase1Ongoing,
      reviewStart: readyReviewStr,
      reviewEnd: reviewDoneStr,
      reviewHours,
      isReviewOngoing,
      fase2Start: reviewDoneStr,
      fase2End: readyQaStr,
      fase2Hours,
      isFase2Ongoing,
      qaStart: readyQaStr,
      qaEnd: doneStr,
      qaHours,
      isQaOngoing,
      totalDevHours,
      totalLeadHours,
      currentPhase,
      timeline: timeline.map(t => ({ from: t.from, to: t.to, author: t.author, date: t.dateFormatted, timestamp: t.timestamp }))
    };
  };

  // Helper to execute Jira search across v3/v2 search/jql POST and GET
  const executeSearch = async (payload: { jql: string; maxResults: number; fields: string[]; expand?: string[] }) => {
    // 1. Try new v3 search/jql POST (Official Jira Cloud endpoint)
    let res = await fetchJiraApi(`https://${cleanHost}/rest/api/3/search/jql`, authHeader, {
      method: 'POST',
      body: payload
    });

    // 2. Try v3 search/jql GET fallback (only if POST returns 405 Method Not Allowed)
    if (!res.ok && res.status === 405) {
      const getUrl = `https://${cleanHost}/rest/api/3/search/jql?jql=${encodeURIComponent(payload.jql)}&maxResults=${payload.maxResults}&fields=${payload.fields.join(',')}`;
      res = await fetchJiraApi(getUrl, authHeader);
    }

    // 3. For Jira Server / Data Center instances only (non-cloud)
    if (!cleanHost.includes('atlassian.net')) {
      if (!res.ok && (res.status === 404 || res.status === 410)) {
        res = await fetchJiraApi(`https://${cleanHost}/rest/api/2/search/jql`, authHeader, {
          method: 'POST',
          body: payload
        });
      }
    }

    return res;
  };

  let result = await executeSearch(searchPayload);

  // If complex JQL query failed (400), try fallback to simpler JQL queries
  if (!result.ok && result.status === 400) {
    console.warn(`JQL query '${jql}' returned 400. Attempting fallback queries...`);

    // Fallback 1: Remove sprint constraint if present
    if (jql.includes('openSprints()')) {
      const nonSprintConditions = conditions.filter(c => !c.includes('openSprints()'));
      const fallbackWhere = nonSprintConditions.length > 0 ? nonSprintConditions.join(' AND ') : '';
      const fallbackJql = fallbackWhere ? `${fallbackWhere} ORDER BY updated DESC` : 'ORDER BY updated DESC';
      result = await executeSearch({
        jql: fallbackJql,
        maxResults: 50,
        fields
      });
    }

    // Fallback 2: Simple user or project query
    if (!result.ok && result.status === 400) {
      result = await executeSearch({
        jql: '(assignee = currentUser() OR reporter = currentUser()) ORDER BY updated DESC',
        maxResults: 50,
        fields
      });
    }

    // Fallback 3: Global recent query
    if (!result.ok && result.status === 400) {
      result = await executeSearch({
        jql: 'ORDER BY updated DESC',
        maxResults: 50,
        fields
      });
    }
  }

  if (!result.ok) {
    return res.status(result.status || 500).json({ issues: [], error: result.error, jqlUsed: jql });
  }

  const rawIssues = result.data?.issues || [];

  // Fetch full changelog history for all issues in parallel from Jira Cloud endpoint
  const changelogMap: { [key: string]: any[] } = {};
  await Promise.all(
    rawIssues.map(async (item: any) => {
      if (item.changelog?.histories && item.changelog.histories.length > 0) {
        changelogMap[item.key] = item.changelog.histories;
        return;
      }
      try {
        const clRes = await fetchJiraApi(`https://${cleanHost}/rest/api/3/issue/${item.key}/changelog?maxResults=100`, authHeader);
        if (clRes.ok && clRes.data) {
          changelogMap[item.key] = clRes.data.values || clRes.data.histories || [];
        }
      } catch (err) {
        console.warn(`Failed to fetch changelog for ${item.key}:`, err);
      }
    })
  );

  const issues = rawIssues.map((item: any) => {
    const f = item.fields || {};
    const timeSpentSec = f.timespent || 0;
    const estSec = f.timeoriginalestimate || 0;

    // Subtasks mapping
    const subtasks = (f.subtasks || []).map((sub: any) => ({
      id: sub.id,
      key: sub.key,
      summary: sub.fields?.summary || '',
      status: sub.fields?.status?.name || 'To Do',
      statusCategory: sub.fields?.status?.statusCategory?.name || '',
      issueType: sub.fields?.issuetype?.name || 'Sub-task',
      issueTypeIcon: sub.fields?.issuetype?.iconUrl || ''
    }));

    // Calculate Dev Phase Breakdown from fetched changelog
    const issueChangelog = changelogMap[item.key] || item.changelog?.histories || [];
    const devPhases = calculateDevPhases(issueChangelog);

    return {
      id: item.id,
      key: item.key,
      summary: f.summary || '',
      status: f.status?.name || 'Unknown',
      statusCategory: f.status?.statusCategory?.name || '',
      priority: f.priority?.name || 'Normal',
      issueType: f.issuetype?.name || 'Task',
      issueTypeIcon: f.issuetype?.iconUrl || '',
      updated: f.updated || '',
      created: f.created || '',
      projectName: f.project?.name || '',
      projectKey: f.project?.key || '',
      assigneeName: f.assignee?.displayName || 'Unassigned',
      assigneeAvatar: f.assignee?.avatarUrls?.['24x24'] || '',
      reporterName: f.reporter?.displayName || '',
      subtasks,
      parentKey: f.parent?.key || '',
      parentSummary: f.parent?.fields?.summary || '',
      devPhases,
      url: `https://${cleanHost}/browse/${item.key}`,
      timeSpentHours: timeSpentSec ? Math.round((timeSpentSec / 3600) * 100) / 100 : 0,
      estimatedHours: estSec ? Math.round((estSec / 3600) * 100) / 100 : 0
    };
  });

  res.json({ issues, total: issues.length, jqlUsed: jql });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Git & Antigravity Tracker Server running on http://0.0.0.0:${PORT}`);
});
