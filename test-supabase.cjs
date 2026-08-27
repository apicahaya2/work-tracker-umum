const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://lyrzcuujrhnownladqrw.supabase.co';
const supabaseKey = 'sb_publishable_81VDPKogiP8lxak4c8ywLg_54DCMnwQ';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.from('git_activities').select('*').limit(5);
  console.log('Error:', error);
  console.log('Data count:', data ? data.length : 0);
  if (data && data.length > 0) {
    console.log('Sample date:', data[0].date);
  }
}
test();
