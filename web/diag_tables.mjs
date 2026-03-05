import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function checkTables() {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .limit(1)

    console.log('Profiles check:', error ? error.message : 'OK')

    const { data: tables, error: tableError } = await supabase
        .rpc('get_tables') // I'll check if this function exists or just try to select from 'users'

    const { error: userError } = await supabase
        .from('users')
        .select('*')
        .limit(1)

    console.log('Users table check:', userError ? userError.message : 'OK')
}

checkTables()
