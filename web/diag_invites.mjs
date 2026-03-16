import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPendingInvites() {
    console.log('--- DIAGNOSTIC SCRIPT ---');
    console.log('Querying pending_invitations...');
    const { data: invites, error: inviteError } = await supabase
        .from('pending_invitations')
        .select('*');
    if (inviteError) {
        console.error('Error fetching invites:', inviteError);
    } else {
        console.log('Pending Invites:', invites);
    }

    console.log('-------------------------');
}

checkPendingInvites();
