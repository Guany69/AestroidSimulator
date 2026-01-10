import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');

  const apiKey = process.env.NEXT_PUBLIC_NASA_API_KEY || 'DEMO_KEY';

  // Default to today and 7 days from now if no dates provided
  const today = new Date().toISOString().split('T')[0];
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const start = startDate || today;
  const end = endDate || nextWeek;

  try {
    const response = await fetch(
      `https://api.nasa.gov/neo/rest/v1/feed?start_date=${start}&end_date=${end}&api_key=${apiKey}`
    );

    if (!response.ok) {
      throw new Error(`NASA API responded with status: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching asteroid data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch asteroid data' },
      { status: 500 }
    );
  }
}
