import { NextResponse } from "next/server";
import { runFabricationDrill } from "@/lib/seed/fabricationDrill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * G6 §2 A.1 — the fabrication drill.
 *
 * Pure: no database, no model, no network. It runs the shipped tiering functions over a stored
 * fixture and returns what they did. Nothing here is written anywhere, which is why it cannot
 * contaminate the Health counter.
 */
export async function POST() {
  return NextResponse.json({ ok: true, result: runFabricationDrill() });
}
