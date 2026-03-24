import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET() {
  const headerList = await headers();
  
  // These headers are automatically added by Vercel
  const city = headerList.get('x-vercel-ip-city') || 'Unknown City';
  const region = headerList.get('x-vercel-ip-country-region') || 'Unknown Region';
  const country = headerList.get('x-vercel-ip-country') || 'Unknown Country';

  // This log is PRIVATE. Only you see it in the Vercel "Logs" tab.
  console.log(`[Vercel Analytics Bypass] Visit from: ${city}, ${region}, ${country}`);

  return NextResponse.json({ success: true });
}