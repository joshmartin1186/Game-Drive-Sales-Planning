import { NextResponse } from 'next/server';
import { serverSupabase as supabase } from '@/lib/supabase';

// PlayStation Partners Analytics API Authentication endpoint
const PSN_AUTH_URL = 'https://analytics.playstation.net/api/oauth/token';

// GET - Fetch all PlayStation API credentials with client info
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('playstation_api_keys')
      .select(`
        *,
        clients (
          id,
          name
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Error fetching PlayStation API keys:', error);
    return NextResponse.json(
      { error: 'Failed to fetch PlayStation API credentials' },
      { status: 500 }
    );
  }
}

// POST - Create or update PlayStation API credentials for a client
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { client_id, ps_client_id, client_secret, scope } = body;

    if (!client_id || !ps_client_id || !client_secret) {
      return NextResponse.json(
        { error: 'Client ID, PlayStation Client ID, and Client Secret are required' },
        { status: 400 }
      );
    }

    // Validate credentials by attempting to get an access token
    const validationResult = await validatePlayStationCredentials(ps_client_id, client_secret, scope);

    if (!validationResult.valid) {
      return NextResponse.json(
        {
          error: `Invalid credentials: ${validationResult.message}`,
          debug: validationResult.debug
        },
        { status: 400 }
      );
    }

    // Check if credentials exist for this client
    const { data: existing } = await supabase
      .from('playstation_api_keys')
      .select('id')
      .eq('client_id', client_id)
      .single();

    let result;
    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from('playstation_api_keys')
        .update({
          ps_client_id,
          client_secret,
          scope: scope || 'data',
          updated_at: new Date().toISOString()
        })
        .eq('client_id', client_id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Create new
      const { data, error } = await supabase
        .from('playstation_api_keys')
        .insert({
          client_id,
          ps_client_id,
          client_secret,
          scope: scope || 'data',
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    return NextResponse.json({
      ...result,
      validation: validationResult
    });
  } catch (error) {
    console.error('Error saving PlayStation API credentials:', error);
    return NextResponse.json(
      { error: 'Failed to save PlayStation API credentials' },
      { status: 500 }
    );
  }
}

// DELETE - Remove PlayStation API credentials
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Credentials ID is required' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('playstation_api_keys')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting PlayStation API credentials:', error);
    return NextResponse.json(
      { error: 'Failed to delete PlayStation API credentials' },
      { status: 500 }
    );
  }
}

// Validate PlayStation credentials by attempting to get an access token
async function validatePlayStationCredentials(
  clientId: string,
  clientSecret: string,
  scope?: string
): Promise<{ valid: boolean; message: string; datasets?: string[]; debug?: unknown }> {
  try {
    // Create Basic auth header from client_id:client_secret
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    // Default to 'data' scope - use space-separated values for multiple scopes (e.g., "data dashboard")
    const effectiveScope = scope || 'data';

    console.log('[PlayStation API] Attempting auth to:', PSN_AUTH_URL);
    console.log('[PlayStation API] Using scope:', effectiveScope);
    console.log('[PlayStation API] Client ID length:', clientId.length);

    const requestBody = new URLSearchParams({
      grant_type: 'client_credentials',
      scope: effectiveScope
    });

    const response = await fetch(PSN_AUTH_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: requestBody
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[PlayStation API] Auth failed:', response.status, errorText);
      console.error('[PlayStation API] Response headers:', Object.fromEntries(response.headers.entries()));

      if (response.status === 401) {
        return {
          valid: false,
          message: 'Invalid Client ID or Client Secret. Check your credentials in PlayStation Partners.',
          debug: { status: 401, error: errorText, url: PSN_AUTH_URL, scope: effectiveScope }
        };
      }

      if (response.status === 403) {
        return {
          valid: false,
          message: `Access forbidden (403). This usually means: 1) Your credentials haven't been provisioned for API access yet, 2) The scope "${effectiveScope}" is not authorized, or 3) Your IP may need to be whitelisted. Contact PlayStation Partners support.`,
          debug: { status: 403, error: errorText, url: PSN_AUTH_URL, scope: effectiveScope }
        };
      }

      return {
        valid: false,
        message: `Authentication failed with status ${response.status}: ${errorText}`,
        debug: { status: response.status, error: errorText, url: PSN_AUTH_URL, scope: effectiveScope }
      };
    }

    const tokenData = await response.json();

    if (!tokenData.access_token) {
      return {
        valid: false,
        message: 'No access token received'
      };
    }

    // Try to list available datasets to confirm API access
    const datasetsResult = await listDatasets(tokenData.access_token);

    return {
      valid: true,
      message: `Successfully authenticated! ${datasetsResult.datasets?.length || 0} dataset(s) available.`,
      datasets: datasetsResult.datasets
    };
  } catch (error) {
    console.error('[PlayStation API] Validation error:', error);
    return {
      valid: false,
      message: `Connection failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

// List available datasets using the access token
async function listDatasets(accessToken: string): Promise<{ datasets?: string[]; error?: string }> {
  try {
    const response = await fetch('https://analytics.playstation.net/api/datasets', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      return { error: `Failed to list datasets: ${response.status}` };
    }

    const data = await response.json();

    // Extract dataset IDs from response
    const datasets: string[] = Array.isArray(data)
      ? data.map((d: { id?: string; name?: string }) => d.id || d.name).filter((x): x is string => Boolean(x))
      : [];

    return { datasets };
  } catch (error) {
    return { error: String(error) };
  }
}
