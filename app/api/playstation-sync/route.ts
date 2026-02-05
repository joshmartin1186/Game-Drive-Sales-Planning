import { NextResponse } from 'next/server';
import { serverSupabase as supabase } from '@/lib/supabase';

// PlayStation Partners Analytics API endpoints
const PSN_AUTH_URL = 'https://analytics.playstation.net/api/oauth/token';
const PSN_DATASETS_URL = 'https://analytics.playstation.net/api/datasets';
const PSN_EXPORT_URL = 'https://analytics.playstation.net/api/datasets/{datasetId}/export';
const PSN_QUERY_URL = 'https://analytics.playstation.net/api/datasets/{datasetId}/query';

interface PSNSalesRecord {
  date: string;
  product_name?: string;
  title_name?: string;
  sku?: string;
  region?: string;
  country?: string;
  units_sold?: number;
  gross_revenue?: number;
  net_revenue?: number;
  currency?: string;
  discount_percentage?: number;
  platform?: string;
  [key: string]: unknown; // Allow other fields
}

// POST - Sync sales data from PlayStation Analytics API
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { client_id, start_date, end_date, dataset_id, force_full_sync } = body;

    if (!client_id) {
      return NextResponse.json(
        { error: 'Client ID is required' },
        { status: 400 }
      );
    }

    // Get the client's PlayStation API credentials
    const { data: keyData, error: keyError } = await supabase
      .from('playstation_api_keys')
      .select('ps_client_id, client_secret, scope, last_sync_date')
      .eq('client_id', client_id)
      .eq('is_active', true)
      .single();

    if (keyError || !keyData) {
      return NextResponse.json(
        { error: 'No active PlayStation API credentials found for this client' },
        { status: 404 }
      );
    }

    // Get client name for logging
    const { data: clientData } = await supabase
      .from('clients')
      .select('name')
      .eq('id', client_id)
      .single();

    console.log(`[PlayStation Sync] Starting sync for ${clientData?.name}`);

    // Step 1: Authenticate and get access token
    const authResult = await getAccessToken(
      keyData.ps_client_id,
      keyData.client_secret,
      keyData.scope
    );

    if (!authResult.success || !authResult.token) {
      return NextResponse.json({
        success: false,
        message: authResult.error || 'Failed to authenticate with PlayStation API',
        clientName: clientData?.name
      });
    }

    console.log(`[PlayStation Sync] Authenticated successfully`);

    // Step 2: List available datasets if no specific one requested
    let targetDatasetId = dataset_id;

    if (!targetDatasetId) {
      const datasetsResult = await listDatasets(authResult.token);

      if (!datasetsResult.success || !datasetsResult.datasets?.length) {
        return NextResponse.json({
          success: false,
          message: 'No datasets available. Please ensure your PlayStation account has analytics access.',
          clientName: clientData?.name
        });
      }

      // Find a sales-related dataset (common names: sales, transactions, revenue)
      const salesDataset = datasetsResult.datasets.find(d =>
        d.name?.toLowerCase().includes('sales') ||
        d.name?.toLowerCase().includes('transaction') ||
        d.name?.toLowerCase().includes('revenue')
      );

      targetDatasetId = salesDataset?.id || datasetsResult.datasets[0].id;
      console.log(`[PlayStation Sync] Using dataset: ${targetDatasetId}`);
    }

    // Step 3: Query or export sales data
    let salesData: PSNSalesRecord[] = [];

    if (start_date || end_date) {
      // Use SQL query for filtered data
      const query = buildSalesQuery(targetDatasetId, start_date, end_date);
      const queryResult = await querySalesData(authResult.token, targetDatasetId, query);

      if (!queryResult.success) {
        // Fallback to full export if query fails
        console.log(`[PlayStation Sync] Query failed, falling back to export: ${queryResult.error}`);
        const exportResult = await exportDataset(authResult.token, targetDatasetId);

        if (!exportResult.success) {
          return NextResponse.json({
            success: false,
            message: `Failed to retrieve data: ${exportResult.error}`,
            clientName: clientData?.name
          });
        }

        salesData = filterSalesByDate(exportResult.data || [], start_date, end_date);
      } else {
        salesData = queryResult.data || [];
      }
    } else {
      // Full export for initial sync
      const exportResult = await exportDataset(authResult.token, targetDatasetId);

      if (!exportResult.success) {
        return NextResponse.json({
          success: false,
          message: `Failed to export dataset: ${exportResult.error}`,
          clientName: clientData?.name
        });
      }

      salesData = exportResult.data || [];
    }

    console.log(`[PlayStation Sync] Retrieved ${salesData.length} records`);

    // Step 4: Store the sales data
    const storeResult = await storeSalesData(client_id, salesData);

    // Update last sync date
    await supabase
      .from('playstation_api_keys')
      .update({
        last_sync_date: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString()
      })
      .eq('client_id', client_id);

    // Log import history
    await supabase
      .from('performance_import_history')
      .insert({
        client_id,
        import_type: 'playstation_api_sync',
        date_range_start: start_date || null,
        date_range_end: end_date || null,
        rows_imported: storeResult.imported,
        rows_skipped: storeResult.skipped,
        status: 'completed'
      });

    return NextResponse.json({
      success: true,
      message: `Synced ${salesData.length} records from PlayStation Analytics API.`,
      rowsImported: storeResult.imported,
      rowsSkipped: storeResult.skipped,
      datasetUsed: targetDatasetId,
      clientName: clientData?.name
    });

  } catch (error) {
    console.error('Error syncing PlayStation data:', error);
    return NextResponse.json(
      { error: `Failed to sync PlayStation data: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

// GET - Test API credentials and list available datasets
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('client_id');

    if (!clientId) {
      return NextResponse.json(
        { error: 'Client ID is required' },
        { status: 400 }
      );
    }

    const { data: keyData, error } = await supabase
      .from('playstation_api_keys')
      .select('ps_client_id, client_secret, scope, last_sync_date')
      .eq('client_id', clientId)
      .eq('is_active', true)
      .single();

    if (error || !keyData) {
      return NextResponse.json({
        valid: false,
        message: 'No API credentials configured for this client'
      });
    }

    // Test authentication
    const authResult = await getAccessToken(
      keyData.ps_client_id,
      keyData.client_secret,
      keyData.scope
    );

    if (!authResult.success || !authResult.token) {
      return NextResponse.json({
        valid: false,
        message: authResult.error || 'Authentication failed'
      });
    }

    // List available datasets
    const datasetsResult = await listDatasets(authResult.token);

    return NextResponse.json({
      valid: true,
      message: `PlayStation Analytics API connected! ${datasetsResult.datasets?.length || 0} dataset(s) available.`,
      lastSync: keyData.last_sync_date,
      datasets: datasetsResult.datasets
    });

  } catch (error) {
    console.error('Error testing PlayStation API:', error);
    return NextResponse.json(
      { error: 'Failed to test API credentials' },
      { status: 500 }
    );
  }
}

// Get OAuth access token
async function getAccessToken(
  clientId: string,
  clientSecret: string,
  scope?: string
): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch(PSN_AUTH_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: scope || 'data'  // Use provisioned scope
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[PlayStation API] Auth failed:', response.status, errorText);
      return {
        success: false,
        error: `Authentication failed: ${response.status}`
      };
    }

    const data = await response.json();

    if (!data.access_token) {
      return {
        success: false,
        error: 'No access token received'
      };
    }

    return {
      success: true,
      token: data.access_token
    };
  } catch (error) {
    return {
      success: false,
      error: `Connection error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

// List available datasets
async function listDatasets(accessToken: string): Promise<{
  success: boolean;
  datasets?: Array<{ id: string; name: string; description?: string }>;
  error?: string
}> {
  try {
    const response = await fetch(PSN_DATASETS_URL, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to list datasets: ${response.status}`
      };
    }

    const data = await response.json();

    // Normalize dataset format
    const datasets = Array.isArray(data)
      ? data.map(d => ({
        id: d.id || d.datasetId,
        name: d.name || d.displayName || d.id,
        description: d.description
      }))
      : [];

    return { success: true, datasets };
  } catch (error) {
    return {
      success: false,
      error: `Failed to fetch datasets: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

// Export entire dataset as CSV
async function exportDataset(
  accessToken: string,
  datasetId: string
): Promise<{ success: boolean; data?: PSNSalesRecord[]; error?: string }> {
  try {
    const url = PSN_EXPORT_URL.replace('{datasetId}', datasetId);

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'text/csv'
      }
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Export failed: ${response.status}`
      };
    }

    const csvText = await response.text();
    const data = parseCSVToRecords(csvText);

    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: `Export error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

// Query dataset with SQL
async function querySalesData(
  accessToken: string,
  datasetId: string,
  sqlQuery: string
): Promise<{ success: boolean; data?: PSNSalesRecord[]; error?: string }> {
  try {
    const url = PSN_QUERY_URL.replace('{datasetId}', datasetId);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ query: sqlQuery })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Query failed: ${response.status} - ${errorText}`
      };
    }

    const data = await response.json();

    // Normalize response format (may be array or object with results)
    const records = Array.isArray(data) ? data : (data.results || data.rows || []);

    return { success: true, data: records };
  } catch (error) {
    return {
      success: false,
      error: `Query error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

// Build SQL query for sales data with date filters
function buildSalesQuery(datasetId: string, startDate?: string, endDate?: string): string {
  let query = `SELECT * FROM ${datasetId}`;

  const conditions: string[] = [];

  if (startDate) {
    conditions.push(`date >= '${startDate}'`);
  }

  if (endDate) {
    conditions.push(`date <= '${endDate}'`);
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  query += ' ORDER BY date DESC LIMIT 10000';

  return query;
}

// Parse CSV text to records
function parseCSVToRecords(csvText: string): PSNSalesRecord[] {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim());

  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const records: PSNSalesRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const record: PSNSalesRecord = { date: '' };

    headers.forEach((header, idx) => {
      const normalizedKey = header.toLowerCase().replace(/\s+/g, '_');
      record[normalizedKey] = values[idx] || '';
    });

    // Ensure date field exists
    if (!record.date) {
      record.date = (record.transaction_date || record.sale_date || '') as string;
    }

    records.push(record);
  }

  return records;
}

// Parse a single CSV line handling quoted values
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

// Filter records by date range
function filterSalesByDate(
  records: PSNSalesRecord[],
  startDate?: string,
  endDate?: string
): PSNSalesRecord[] {
  return records.filter(record => {
    const date = record.date;
    if (!date) return false;

    if (startDate && date < startDate) return false;
    if (endDate && date > endDate) return false;

    return true;
  });
}

// Store sales data in database
async function storeSalesData(
  clientId: string,
  records: PSNSalesRecord[]
): Promise<{ imported: number; skipped: number }> {
  let imported = 0;
  let skipped = 0;

  for (const record of records) {
    try {
      // Normalize field names from various PSN export formats
      const productName = record.product_name || record.title_name || record.title || record.sku || 'Unknown';
      const date = record.date || record.transaction_date || record.sale_date;

      if (!date) {
        skipped++;
        continue;
      }

      const { error } = await supabase
        .from('performance_metrics')
        .upsert({
          client_id: clientId,
          date: date.toString().split('T')[0], // Normalize date format
          product_name: productName as string,
          platform: 'PlayStation',
          country_code: (record.country || record.region || 'Unknown') as string,
          region: (record.region || 'Unknown') as string,
          gross_units_sold: Number(record.units_sold || record.quantity || 0),
          net_units_sold: Number(record.units_sold || record.quantity || 0),
          gross_revenue_usd: Number(record.gross_revenue || record.revenue || 0),
          net_revenue_usd: Number(record.net_revenue || record.revenue || 0),
          currency: (record.currency || 'USD') as string,
          discount_percentage: record.discount_percentage ? Number(record.discount_percentage) : null,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'client_id,date,product_name,platform,country_code'
        });

      if (error) {
        console.error('Error storing PlayStation data:', error);
        skipped++;
      } else {
        imported++;
      }
    } catch (error) {
      console.error('Error processing PlayStation record:', error);
      skipped++;
    }
  }

  return { imported, skipped };
}
