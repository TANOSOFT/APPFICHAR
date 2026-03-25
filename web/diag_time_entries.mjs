import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data, error } = await supabase
        .from('time_entries')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
        
    if (error) {
        console.error('Error fetching time entries:', error);
    } else {
        console.log('Recent time entries:', JSON.stringify(data, null, 2));
    }
}

run();
