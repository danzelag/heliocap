import { NextRequest, NextResponse } from "next/server";
import { classifyReply } from "@/lib/pipeline/outreach";
import { updateProspect } from "@/lib/supabase";

// Webhook called by Instantly when an email reply arrives
export async function POST(req: NextRequest) {
  const body = await req.json();

  // Instantly sends: { prospect_id, from_email, body, subject }
  const { prospect_id, body: replyBody } = body;

  if (!prospect_id || !replyBody) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const classification = await classifyReply(replyBody);

  await updateProspect(prospect_id, {
    reply_classification: classification,
    stage: classification === "unsubscribe" ? "dead" : "replied",
  });

  // Auto-actions based on classification
  if (classification === "interested") {
    // TODO: trigger cal.com link send via Instantly API
    console.log(`[reply] ${prospect_id} → interested → send booking link`);
  } else if (classification === "not_now") {
    // TODO: create a 30-day snooze task in n8n
    console.log(`[reply] ${prospect_id} → not_now → snooze 30d`);
  } else if (classification === "wrong_person") {
    // TODO: trigger re-enrichment
    console.log(`[reply] ${prospect_id} → wrong_person → re-enrich`);
  }

  return NextResponse.json({ classification });
}
