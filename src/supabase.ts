import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://lyrzcuujrhnownladqrw.supabase.co';
const supabaseKey = 'sb_publishable_81VDPKogiP8lxak4c8ywLg_54DCMnwQ'; // Or whatever they gave

export const supabase = createClient(supabaseUrl, supabaseKey);
