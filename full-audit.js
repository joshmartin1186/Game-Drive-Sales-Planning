// Full database audit
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

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

async function comprehensiveAudit() {
  console.log('\n🔍 COMPREHENSIVE DATABASE AUDIT\n');

  const { data: clients } = await supabase.from('clients').select('*');

  console.log('👥 ALL CLIENTS:');
  clients.forEach(c => {
    console.log(`  - ${c.name} (ID: ${c.id.substring(0, 8)}...)`);
  });

  console.log('\n📊 STEAM_SALES TABLE (API Syncs):\n');
  const { data: allSales } = await supabase
    .from('steam_sales')
    .select('client_id, sale_date, net_revenue, units_sold');

  const salesByClient = {};
  allSales.forEach(row => {
    if (!salesByClient[row.client_id]) {
      salesByClient[row.client_id] = [];
    }
    salesByClient[row.client_id].push(row);
  });

  for (const clientId in salesByClient) {
    const client = clients.find(c => c.id === clientId);
    const rows = salesByClient[clientId];
    const dates = [...new Set(rows.map(r => r.sale_date))].sort();
    const totalRevenue = rows.reduce((sum, r) => sum + parseFloat(r.net_revenue), 0);
    const totalUnits = rows.reduce((sum, r) => sum + parseInt(r.units_sold), 0);

    console.log(`${client.name}:`);
    console.log(`  Total rows: ${rows.length}`);
    console.log(`  Date range: ${dates[0]} to ${dates[dates.length - 1]}`);
    console.log(`  Unique dates: ${dates.length}`);
    console.log(`  Total revenue: $${totalRevenue.toFixed(2)}`);
    console.log(`  Total units: ${totalUnits}`);
    console.log('');
  }

  console.log('\n📊 STEAM_PERFORMANCE_DATA TABLE (CSV Imports):\n');
  const { data: allPerf } = await supabase
    .from('steam_performance_data')
    .select('client_id, date, net_steam_sales_usd, net_units_sold');

  const perfByClient = {};
  allPerf.forEach(row => {
    if (!perfByClient[row.client_id]) {
      perfByClient[row.client_id] = [];
    }
    perfByClient[row.client_id].push(row);
  });

  for (const clientId in perfByClient) {
    const client = clients.find(c => c.id === clientId);
    const rows = perfByClient[clientId];
    const dates = [...new Set(rows.map(r => r.date))].sort();
    const totalRevenue = rows.reduce((sum, r) => sum + parseFloat(r.net_steam_sales_usd || 0), 0);
    const totalUnits = rows.reduce((sum, r) => sum + parseInt(r.net_units_sold || 0), 0);

    console.log(`${client.name}:`);
    console.log(`  Total rows: ${rows.length}`);
    console.log(`  Date range: ${dates[0]} to ${dates[dates.length - 1]}`);
    console.log(`  Unique dates: ${dates.length}`);
    console.log(`  Total revenue: $${totalRevenue.toFixed(2)}`);
    console.log(`  Total units: ${totalUnits}`);
    console.log('');
  }

  const grandTotalSales = Object.values(salesByClient).flat();
  const grandTotalPerf = Object.values(perfByClient).flat();
  const totalSalesRevenue = grandTotalSales.reduce((sum, r) => sum + parseFloat(r.net_revenue), 0);
  const totalPerfRevenue = grandTotalPerf.reduce((sum, r) => sum + parseFloat(r.net_steam_sales_usd || 0), 0);

  console.log('\n💰 GRAND TOTALS ACROSS ENTIRE DATABASE:');
  console.log(`  steam_sales: $${totalSalesRevenue.toFixed(2)}`);
  console.log(`  steam_performance_data: $${totalPerfRevenue.toFixed(2)}`);
  console.log(`  COMBINED: $${(totalSalesRevenue + totalPerfRevenue).toFixed(2)}`);
}

comprehensiveAudit();
