import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://dkhvjwvffjjnrtujsrnm.supabase.co'
const supabaseKey = 'sb_publishable_6PdPKibeZxrFko5Gyi2gEQ_YGANX2K5' // From .env.local

const supabase = createClient(supabaseUrl, supabaseKey)

async function check() {
    const { data, error } = await supabase.from('profiles').select('*').limit(1)
    if (error) {
        console.error('Error:', error.message)
    } else if (data && data.length > 0) {
        console.log('Columns in profiles:', Object.keys(data[0]).join(', '))
    } else {
        console.log('No data found in profiles to check columns.')
    }
}

check()
