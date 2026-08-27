const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://lyrzcuujrhnownladqrw.supabase.co', 'sb_publishable_81VDPKogiP8lxak4c8ywLg_54DCMnwQ');
async function test() {
  const record = {
    repo: 'test-repo', hash: 'test-hash', author: 'Test', date: new Date().toISOString(), timestamp: Date.now(), activeDurationHours: 1.5, workStartTime: new Date().toISOString(), workEndTime: new Date().toISOString(), subject: 'test', branch: 'main', jiraKey: ''
  };
  const { data, error } = await supabase.from('git_activities').upsert(record, { onConflict: 'hash' });
  console.log('Error:', error);
}
test();
