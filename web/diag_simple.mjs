import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://pivnxaxfexnzkqezkrvb.supabase.co'
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function check() {
    // Try to check if 'users' table exists in public by just trying to select from it
    const { error } = await supabase.from('users').select('*').limit(1)
    if (error) {
        console.log('Error querying public.users:', error.message)
    } else {
        console.log('public.users table EXISTS and is accessible (or at least error-free for simple select)')
    }

    // Check pending_invitations
    const { error: inviteError } = await supabase.from('pending_invitations').select('*').limit(1)
    if (inviteError) {
        console.log('Error querying pending_invitations:', inviteError.message)
    } else {
        console.log('pending_invitations is accessible')
    }
}

check()
