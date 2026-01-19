import { NextResponse } from 'next/server';
import { serverSupabase as supabase } from '@/lib/supabase';

// GET - Fetch all clients
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('clients')
      .select('id, name, email, contact_person, steam_api_key, created_at')
      .order('name', { ascending: true });

    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Error fetching clients:', error);
    return NextResponse.json(
      { error: 'Failed to fetch clients' },
      { status: 500 }
    );
  }
}

// POST - Create a new client
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, contact_person } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Client name is required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('clients')
      .insert({
        name,
        email: email || null,
        contact_person: contact_person || null
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error creating client:', error);
    return NextResponse.json(
      { error: 'Failed to create client' },
      { status: 500 }
    );
  }
}
