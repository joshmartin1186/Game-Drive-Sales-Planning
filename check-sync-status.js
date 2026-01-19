// Quick script to check sync job status
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Read .env.local manually
const envContent = fs.readFileSync('.env.local', 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.+)$/);
  if (match) {
    envVars[match[1]] = match[2];
  }
});

const supabase = createClient(
  envVars.NEXT_PUBLIC_SUPABASE_URL,
  envVars.SUPABASE_SERVICE_ROLE_KEY
);

async function checkStatus() {
  // Get the most recent sync job
  const { data: jobs, error } = await supabase
    .from('sync_jobs')
    .select('*, clients(name)')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('\n🔄 Recent Sync Jobs:\n');
  jobs.forEach(job => {
    console.log(`📋 Job ID: ${job.id.substring(0, 8)}...`);
    console.log(`   Client: ${job.clients?.name || 'Unknown'}`);
    console.log(`   Status: ${job.status}`);
    console.log(`   Created: ${new Date(job.created_at).toLocaleString()}`);
    console.log(`   Progress: ${job.dates_processed || 0}/${job.total_dates || 0} dates`);
    console.log(`   Rows imported: ${job.rows_imported || 0}`);
    if (job.error_message) {
      console.log(`   Error: ${job.error_message}`);
    }
    console.log('');
  });
}

checkStatus();
