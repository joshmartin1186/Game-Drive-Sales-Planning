import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET - Fetch all Steam API keys with client info
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('steam_api_keys')
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
    console.error('Error fetching Steam API keys:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Steam API keys' },
      { status: 500 }
    );
  }
}

// POST - Create or update Steam API key for a client
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { client_id, api_key, publisher_key, app_ids } = body;

    if (!client_id || !api_key) {
      return NextResponse.json(
        { error: 'Client ID and API key are required' },
        { status: 400 }
      );
    }

    // Check if key exists for this client
    const { data: existing } = await supabase
      .from('steam_api_keys')
      .select('id')
      .eq('client_id', client_id)
      .single();

    let result;
    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from('steam_api_keys')
        .update({
          api_key,
          publisher_key: publisher_key || null,
          app_ids: app_ids || [],
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
        .from('steam_api_keys')
        .insert({
          client_id,
          api_key,
          publisher_key: publisher_key || null,
          app_ids: app_ids || [],
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error saving Steam API key:', error);
    return NextResponse.json(
      { error: 'Failed to save Steam API key' },
      { status: 500 }
    );
  }
}

// DELETE - Remove Steam API key
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Key ID is required' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('steam_api_keys')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting Steam API key:', error);
    return NextResponse.json(
      { error: 'Failed to delete Steam API key' },
      { status: 500 }
    );
  }
}
