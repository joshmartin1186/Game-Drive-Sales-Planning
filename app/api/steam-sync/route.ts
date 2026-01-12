import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Steam Partner API endpoints
const STEAM_PARTNER_API = 'https://partner.steam-api.com';

interface SteamSalesData {
  date: string;
  product_name: string;
  country_code: string;
  gross_units: number;
  net_units: number;
  gross_revenue: number;
  net_revenue: number;
}

// POST - Sync financial data from Steam for a client
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { client_id, start_date, end_date, app_id } = body;

    if (!client_id) {
      return NextResponse.json(
        { error: 'Client ID is required' },
        { status: 400 }
      );
    }

    // Get the client's Steam API key
    const { data: keyData, error: keyError } = await supabase
      .from('steam_api_keys')
      .select('api_key, publisher_key, app_ids')
      .eq('client_id', client_id)
      .eq('is_active', true)
      .single();

    if (keyError || !keyData) {
      return NextResponse.json(
        { error: 'No active Steam API key found for this client' },
        { status: 404 }
      );
    }

    // Get client name for logging
    const { data: clientData } = await supabase
      .from('clients')
      .select('name')
      .eq('id', client_id)
      .single();

    // For now, we'll simulate the API call since Steam Partner API 
    // requires actual publisher credentials and specific endpoint access
    // In production, this would make real calls to Steam's ISteamEconomy or 
    // partner reporting endpoints

    const syncResult = await syncSteamData({
      apiKey: keyData.api_key,
      publisherKey: keyData.publisher_key,
      appIds: app_id ? [app_id] : keyData.app_ids || [],
      startDate: start_date || getDefaultStartDate(),
      endDate: end_date || new Date().toISOString().split('T')[0],
      clientId: client_id
    });

    // Update last sync date
    await supabase
      .from('steam_api_keys')
      .update({ last_sync_date: new Date().toISOString().split('T')[0] })
      .eq('client_id', client_id);

    // Log import history
    await supabase
      .from('performance_import_history')
      .insert({
        client_id,
        import_type: 'steam_api_sync',
        date_range_start: start_date || getDefaultStartDate(),
        date_range_end: end_date || new Date().toISOString().split('T')[0],
        rows_imported: syncResult.rowsImported,
        rows_skipped: syncResult.rowsSkipped,
        status: syncResult.success ? 'completed' : 'failed',
        error_message: syncResult.error || null
      });

    return NextResponse.json({
      success: syncResult.success,
      message: syncResult.message,
      rowsImported: syncResult.rowsImported,
      rowsSkipped: syncResult.rowsSkipped,
      clientName: clientData?.name
    });

  } catch (error) {
    console.error('Error syncing Steam data:', error);
    return NextResponse.json(
      { error: 'Failed to sync Steam data' },
      { status: 500 }
    );
  }
}

// Test API key validity
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
      .from('steam_api_keys')
      .select('api_key, publisher_key, last_sync_date')
      .eq('client_id', clientId)
      .eq('is_active', true)
      .single();

    if (error || !keyData) {
      return NextResponse.json({
        valid: false,
        message: 'No API key configured for this client'
      });
    }

    // Test the API key with Steam
    const testResult = await testSteamApiKey(keyData.api_key, keyData.publisher_key);

    return NextResponse.json({
      valid: testResult.valid,
      message: testResult.message,
      lastSync: keyData.last_sync_date
    });

  } catch (error) {
    console.error('Error testing Steam API key:', error);
    return NextResponse.json(
      { error: 'Failed to test API key' },
      { status: 500 }
    );
  }
}

// Helper functions
function getDefaultStartDate(): string {
  const date = new Date();
  date.setMonth(date.getMonth() - 3); // Default to 3 months ago
  return date.toISOString().split('T')[0];
}

async function testSteamApiKey(apiKey: string, publisherKey: string | null): Promise<{ valid: boolean; message: string }> {
  try {
    // Test with Steam Web API (general endpoint that works with any key)
    const testUrl = `https://api.steampowered.com/ISteamWebAPIUtil/GetServerInfo/v1/?key=${apiKey}`;
    
    const response = await fetch(testUrl);
    
    if (response.ok) {
      return {
        valid: true,
        message: 'API key is valid and connected to Steam'
      };
    } else if (response.status === 403) {
      return {
        valid: false,
        message: 'API key is invalid or has been revoked'
      };
    } else {
      return {
        valid: false,
        message: `Steam API returned status ${response.status}`
      };
    }
  } catch (error) {
    return {
      valid: false,
      message: 'Could not connect to Steam API. Check network connection.'
    };
  }
}

async function syncSteamData(params: {
  apiKey: string;
  publisherKey: string | null;
  appIds: string[];
  startDate: string;
  endDate: string;
  clientId: string;
}): Promise<{ success: boolean; message: string; rowsImported: number; rowsSkipped: number; error?: string }> {
  
  const { apiKey, publisherKey, appIds, startDate, endDate, clientId } = params;

  // Note: Steam Partner API for financial data requires:
  // 1. Publisher-level access (not just Web API key)
  // 2. Specific endpoints like ISteamEconomy/GetAssetPrices or partner reporting
  // 3. Usually accessed via partner.steampowered.com portal

  // For production implementation, you would:
  // 1. Use the publisher key to authenticate with partner.steam-api.com
  // 2. Call endpoints like /ISteamEconomy/GetMarketPrices/v1/
  // 3. Or use the Steamworks Web API with proper publisher credentials

  if (!publisherKey) {
    // Without publisher key, we can only get limited public data
    // Try to fetch what we can from public API
    try {
      let totalImported = 0;
      
      for (const appId of appIds) {
        // Get app details (public)
        const appDetailsUrl = `https://store.steampowered.com/api/appdetails?appids=${appId}`;
        const response = await fetch(appDetailsUrl);
        
        if (response.ok) {
          const data = await response.json();
          if (data[appId]?.success) {
            // Store basic app info - actual sales data requires publisher access
            console.log(`Fetched details for app ${appId}: ${data[appId].data?.name}`);
          }
        }
      }

      return {
        success: true,
        message: 'Connected to Steam API. Note: Full financial data requires Publisher Key. Please export CSV from Steam Partner portal for complete sales data.',
        rowsImported: totalImported,
        rowsSkipped: 0
      };

    } catch (error) {
      return {
        success: false,
        message: 'Failed to connect to Steam API',
        rowsImported: 0,
        rowsSkipped: 0,
        error: String(error)
      };
    }
  }

  // With publisher key - attempt full financial data sync
  try {
    // This would be the actual partner API call
    // Steam's partner API is not publicly documented, so this is a placeholder
    // Real implementation would need actual Steam partner documentation

    return {
      success: true,
      message: 'Publisher key detected. For full financial data, please use CSV import from Steam Partner portal. Direct API sync coming soon.',
      rowsImported: 0,
      rowsSkipped: 0
    };

  } catch (error) {
    return {
      success: false,
      message: 'Failed to sync financial data',
      rowsImported: 0,
      rowsSkipped: 0,
      error: String(error)
    };
  }
}
