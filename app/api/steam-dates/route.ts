import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const STEAM_PARTNER_API = 'https://partner.steam-api.com';

interface ChangedDatesResponse {
  response: {
    dates?: string[];
    result_highwatermark?: string;
  };
}

// GET - Fetch list of dates with financial data from Steam
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('client_id');
    const forceFullSync = searchParams.get('force_full_sync') === 'true';

    if (!clientId) {
      return NextResponse.json(
        { error: 'Client ID is required' },
        { status: 400 }
      );
    }

    // Get the client's Steam API keys
    const { data: keyData, error: keyError } = await supabase
      .from('steam_api_keys')
      .select('api_key, publisher_key, highwatermark')
      .eq('client_id', clientId)
      .eq('is_active', true)
      .single();

    if (keyError || !keyData) {
      return NextResponse.json(
        { error: 'No active Steam API key found for this client' },
        { status: 404 }
      );
    }

    const financialApiKey = keyData.publisher_key || keyData.api_key;
    if (!financialApiKey) {
      return NextResponse.json(
        { error: 'No Financial Web API Key configured' },
        { status: 400 }
      );
    }

    const useHighwatermark = forceFullSync ? '0' : (keyData.highwatermark || '0');

    console.log(`[Steam Dates] Fetching dates for client ${clientId}, highwatermark: ${useHighwatermark}`);

    // Call Steam API with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55000); // 55 second timeout

    const url = `${STEAM_PARTNER_API}/IPartnerFinancialsService/GetChangedDatesForPartner/v001/?key=${financialApiKey}&highwatermark=${useHighwatermark}`;

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Steam API returned status ${response.status}` },
        { status: response.status }
      );
    }

    const data: ChangedDatesResponse = await response.json();

    console.log(`[Steam Dates] Fetched ${data.response?.dates?.length || 0} dates`);

    return NextResponse.json({
      success: true,
      dates: data.response?.dates || [],
      highwatermark: data.response?.result_highwatermark,
      count: data.response?.dates?.length || 0
    });

  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Request timed out after 55 seconds' },
        { status: 504 }
      );
    }
    console.error('Error fetching Steam dates:', error);
    return NextResponse.json(
      { error: `Failed to fetch dates: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
