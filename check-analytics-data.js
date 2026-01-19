const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Read env file manually
const envPath = '/Users/joshuamartin/Projects/GameDrive/.env.local';
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      process.env[match[1]] = match[2];
    }
  });
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkData() {
  console.log('Checking steam_performance_data_view...\n');

  // Try fetching all data in batches since there seems to be a 1000 row limit
  let allData = [];
  let hasMore = true;
  let offset = 0;
  const batchSize = 1000;

  while (hasMore) {
    const { data, error, count } = await supabase
      .from('steam_performance_data_view')
      .select('*', { count: 'exact' })
      .order('date', { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.error('Error:', error);
      return;
    }

    allData = allData.concat(data);
    console.log(`Fetched batch ${offset}-${offset + batchSize - 1}: ${data.length} rows`);

    hasMore = data.length === batchSize;
    offset += batchSize;
  }

  const data = allData;
  const count = allData.length;

  console.log(`\nTotal rows returned: ${data.length}`);
  console.log(`\nDate range:`);
  console.log(`  First: ${data[0]?.date}`);
  console.log(`  Last: ${data[data.length - 1]?.date}`);

  console.log(`\nUnique clients: ${[...new Set(data.map(r => r.client_id))].length}`);
  console.log(`Unique dates: ${[...new Set(data.map(r => r.date))].length}`);

  const regions = [...new Set(data.map(r => r.region).filter(Boolean))];
  console.log(`\nUnique regions: ${regions.length}`);
  console.log(`Regions: ${regions.join(', ')}`);

  console.log(`\nSample of first 5 rows:`);
  data.slice(0, 5).forEach(row => {
    console.log(`  Date: ${row.date}, Region: ${row.region || 'NULL'}, Country: ${row.country || 'NULL'}, Revenue: $${row.net_steam_sales_usd}`);
  });

  const totalRevenue = data.reduce((sum, row) => {
    const val = parseFloat(row.net_steam_sales_usd) || 0;
    return sum + val;
  }, 0);
  console.log(`\nTotal revenue: $${totalRevenue.toFixed(2)}`);

  // Group by date to see daily totals
  const byDate = new Map();
  data.forEach(row => {
    const existing = byDate.get(row.date) || 0;
    byDate.set(row.date, existing + (parseFloat(row.net_steam_sales_usd) || 0));
  });

  console.log(`\nFirst 10 days:`);
  Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, 10)
    .forEach(([date, revenue]) => {
      console.log(`  ${date}: $${revenue.toFixed(2)}`);
    });

  console.log(`\nLast 10 days:`);
  Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-10)
    .forEach(([date, revenue]) => {
      console.log(`  ${date}: $${revenue.toFixed(2)}`);
    });
}

checkData().catch(console.error);
