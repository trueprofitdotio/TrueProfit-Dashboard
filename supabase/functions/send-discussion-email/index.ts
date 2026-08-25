// Supabase Edge Function: send-discussion-email
// Serves email notifications when messages or @mentions are posted in Deal Discussions

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM_EMAIL = Deno.env.get("NOTIF_FROM_EMAIL") || "TrueProfit Deals <onboarding@resend.dev>";

interface NotificationPayload {
    threadId: string;
    proposalId: string;
    proposalTitle?: string;
    kolId: string;
    kolName: string;
    senderName: string;
    senderEmail: string;
    messageBody: string;
    taggedUsers?: string[];
    deepLinkUrl: string;
}

serve(async (req) => {
    // Enable CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
            }
        });
    }

    try {
        const payload: NotificationPayload = await req.json();
        const {
            proposalTitle,
            kolName,
            senderName,
            senderEmail,
            messageBody,
            taggedUsers,
            deepLinkUrl
        } = payload;

        // Determine recipient emails
        const recipients = new Set<string>();
        
        // Add default team members / tagged members
        const defaultTeam: Record<string, string> = {
            'quan tran hoang': 'partners@trueprofit.io',
            'quan': 'partners@trueprofit.io',
            'hương lê ngọc thùy': 'huong.le@firegroup.io',
            'huong': 'huong.le@firegroup.io',
            'ly': 'ly@firegroup.io'
        };

        if (taggedUsers && taggedUsers.length > 0) {
            taggedUsers.forEach(tag => {
                const cleanTag = tag.toLowerCase().trim();
                if (defaultTeam[cleanTag]) {
                    recipients.add(defaultTeam[cleanTag]);
                }
            });
        }

        // If no specific tag, notify team
        if (recipients.size === 0) {
            recipients.add('partners@trueprofit.io');
        }

        // Remove sender from receiving their own notification
        if (senderEmail) {
            recipients.delete(senderEmail.toLowerCase());
        }

        const recipientList = Array.from(recipients);
        if (recipientList.length === 0) {
            return new Response(JSON.stringify({ message: "No external recipients to notify" }), {
                headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' },
                status: 200
            });
        }

        if (!RESEND_API_KEY) {
            console.log("[send-discussion-email] RESEND_API_KEY is not set. Email payload:", {
                recipients: recipientList,
                subject: `[TrueProfit Deal] New discussion for ${kolName} (${proposalTitle || 'Proposal'})`,
                message: messageBody
            });
            return new Response(JSON.stringify({ 
                status: "mock_success", 
                message: "RESEND_API_KEY not configured. Set RESEND_API_KEY in Supabase secrets to send live emails." 
            }), {
                headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' },
                status: 200
            });
        }

        // Send via Resend API
        const emailHtml = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
                <div style="margin-bottom: 20px;">
                    <span style="font-size: 11px; font-weight: 700; color: #176b5e; text-transform: uppercase; letter-spacing: 0.5px;">TrueProfit Deal Discussion</span>
                    <h2 style="margin: 6px 0 0; color: #0f172a; font-size: 18px; font-weight: 700;">${kolName}</h2>
                    <p style="margin: 2px 0 0; color: #64748b; font-size: 13px;">Proposal: ${proposalTitle || 'Campaign Proposal'}</p>
                </div>

                <div style="padding: 16px; background-color: #f8fafc; border-left: 4px solid #176b5e; border-radius: 8px; margin-bottom: 24px;">
                    <div style="font-size: 12px; font-weight: 600; color: #176b5e; margin-bottom: 6px;">${senderName}:</div>
                    <div style="font-size: 14px; color: #334155; line-height: 1.5; white-space: pre-wrap;">${messageBody}</div>
                </div>

                <div style="text-align: center; margin-bottom: 24px;">
                    <a href="${deepLinkUrl}" style="display: inline-block; background-color: #176b5e; color: #ffffff; font-size: 13px; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                        Open Discussion in Dashboard &rarr;
                    </a>
                </div>

                <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 20px 0;" />
                <p style="margin: 0; font-size: 11px; color: #94a3b8; text-align: center;">
                    This is an automated notification from TrueProfit Dashboard.
                </p>
            </div>
        `;

        const resendRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${RESEND_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: FROM_EMAIL,
                to: recipientList,
                subject: `[TrueProfit Deal] ${senderName} commented on ${kolName}`,
                html: emailHtml
            })
        });

        const resData = await resendRes.json();
        return new Response(JSON.stringify(resData), {
            headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' },
            status: resendRes.status
        });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' },
            status: 500
        });
    }
});
