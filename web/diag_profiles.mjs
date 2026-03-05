
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dkhvjwvffjjnrtujsrnm.supabase.co';
const supabaseKey = 'sb_publishable_6PdPKibeZxrFko5Gyi2gEQ_YGANX2K5'; // ANON KEY
const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnose() {
    console.log('--- DIAGNOSIS: Profiles with NULL tenant_id ---');
    const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role, tenant_id')
        .is('tenant_id', null);

    if (error) {
        console.error('Error fetching profiles:', error);
        return;
    }

    console.log(`Found ${data.length} profiles with null tenant_id:`);
    data.forEach(p => {
        console.log(`- [${p.id}] Name: ${p.full_name}, Role: ${p.role}`);
    });

    console.log('\n--- DIAGNOSIS: Search for "Pepe" or "cayetano" ---');
    const { data: search, error: searchError } = await supabase
        .from('profiles')
        .select('id, full_name, role, tenant_id')
        .or('full_name.ilike.%Pepe%,full_name.ilike.%cayetano%');

    if (searchError) {
        console.error('Error searching profiles:', searchError);
        return;
    }

    search.forEach(p => {
        console.log(`- [${p.id}] Name: ${p.full_name}, Role: ${p.role}, Tenant: ${p.tenant_id}`);
    });
}

diagnose();
