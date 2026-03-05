import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://dkhvjwvffjjnrtujsrnm.supabase.co'
const supabaseKey = 'sb_publishable_6PdPKibeZxrFko5Gyi2gEQ_YGANX2K5'

const supabase = createClient(supabaseUrl, supabaseKey)

async function check() {
    const { data, error } = await supabase.from('pending_invitations').select('*').limit(5)
    if (error) {
        console.error('Error:', error.message)
    } else {
        console.log('Invitations found:', data.length)
        if (data.length > 0) {
            console.log('Sample email:', data[0].email, 'Status:', data[0].status)
        }
    }
}

check()
