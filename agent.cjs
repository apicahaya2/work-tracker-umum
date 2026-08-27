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

// ... Simplified parsing logic ...
async function runAgent() {
  console.log('🔍 Scanning local repositories...');
  const repos = findGitRepos(DOCUMENTS_DIR).filter(r => r.name.toLowerCase() !== 'flutter');
  console.log(`Found ${repos.length} repositories.`);

  for (const repo of repos) {
    const logRaw = await execPromise(`git log --pretty=format:"%H|%an|%ad|%s|%D" --date=iso --all --since="30 days ago"`, repo.path);
    if (!logRaw) continue;

    const lines = logRaw.split('\n');
    for (const line of lines) {
      if (!line) continue;
      const [hash, author, date, subject, refs] = line.split('|');
      if (author.includes('bot') || subject.startsWith('Merge')) continue;

      const dateObj = new Date(date);
      // Rough active duration calculation (default to 0.5h if no reflog)
      const activeDurationHours = 0.5;

      const record = {
        repo: repo.name,
        hash,
        author,
        date: dateObj.toISOString(),
        timestamp: dateObj.getTime(),
        activeDurationHours,
        subject,
        branch: refs ? refs.split(',')[0] : 'main',
        jiraKey: (subject.match(/([a-zA-Z]{2,10}-\d+)/i) || [])[1]?.toUpperCase() || ''
      };

      // Upsert into Supabase (if hash already exists, ignore or update)
      await supabase.from('git_activities').upsert(record, { onConflict: 'hash' });
    }
  }
  console.log('✅ Sync to Supabase complete!');
}

runAgent();
