import Anthropic from "@anthropic-ai/sdk";
import type { Prospect, ReplyClassification } from "../types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function generateEmailCopy(prospect: Prospect): Promise<{
  subject: string;
  body: string;
}> {
  const roofAge = prospect.year_built
    ? new Date().getFullYear() - prospect.year_built
    : "unknown";
  const incentiveAmount = prospect.incentive_amount
    ? `$${Math.round(prospect.incentive_amount).toLocaleString()}`
    : "significant federal credits";

  const msg = await anthropic.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 400,
    system:
      "You write concise cold emails for a solar company. No marketing language. Direct. Factual. Short. Return JSON with 'subject' and 'body' fields only.",
    messages: [
      {
        role: "user",
        content: `Write a cold email for:
Company: ${displayName(prospect)}
Address: ${prospect.address}, ${prospect.city}
Owner: ${prospect.owner_name ?? "the owner"}
Roof age: ${roofAge} years
Building sqft: ${prospect.sqft?.toLocaleString() ?? "unknown"}
Available incentive credits: ${incentiveAmount}
Microsite URL: ${prospect.microsite_url ?? "[microsite_url]"}

Format: short subject line + 4-5 sentence email body. Reference the actual address, roof age, and savings math. End with the video link.`,
      },
    ],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  try {
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    return {
      subject: parsed.subject ?? `Solar at ${prospect.address}`,
      body: parsed.body ?? text,
    };
  } catch {
    return { subject: `Solar at ${prospect.address}`, body: text };
  }
}

export async function classifyReply(
  replyText: string
): Promise<ReplyClassification> {
  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 20,
    system:
      'Classify the email reply into exactly one of: interested, not_now, wrong_person, unsubscribe, question. Return only the label.',
    messages: [{ role: "user", content: replyText }],
  });

  const label = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
  const valid: ReplyClassification[] = [
    "interested",
    "not_now",
    "wrong_person",
    "unsubscribe",
    "question",
  ];
  return valid.includes(label as ReplyClassification)
    ? (label as ReplyClassification)
    : "question";
}

function displayName(prospect: Prospect) {
  return prospect.company_name ?? prospect.contact_name ?? prospect.owner_name ?? prospect.address;
}

export async function fetchCurrentIncentiveRate(): Promise<number> {
  // Claude researches current IESO + Canada Greener Homes rates
  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 60,
    system:
      "You are a researcher. Return only a decimal representing the current Canadian federal solar incentive rate as a fraction of system cost (e.g. 0.20 for 20%). Base on Canada Greener Homes and IESO programs. Return just the number.",
    messages: [
      {
        role: "user",
        content:
          "What is the current combined federal incentive rate for commercial solar in Ontario as a fraction of installed system cost?",
      },
    ],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "0.20";
  const rate = parseFloat(text);
  return isNaN(rate) ? 0.2 : Math.min(Math.max(rate, 0.05), 0.4);
}
