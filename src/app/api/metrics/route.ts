import { NextResponse } from 'next/server';
import { metrics } from '../../../lib/metrics';

export async function GET() {
  const text = metrics.prometheus();
  return NextResponse.text(text, { status: 200 });
}
