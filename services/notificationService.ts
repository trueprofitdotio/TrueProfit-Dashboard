import { supabaseClient } from './supabaseClient';

export interface EmailNotificationPayload {
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

/**
 * Dispatch discussion email notification via Supabase Edge Function or Webhook
 */
export const sendDiscussionEmailNotification = async (payload: EmailNotificationPayload) => {
    try {
        // 1. Try invoking Supabase Edge Function 'send-discussion-email'
        const { data, error } = await supabaseClient.functions.invoke('send-discussion-email', {
            body: payload
        });

        if (error) {
            console.info('[NotificationService] Edge function not yet active or returned:', error.message);
        } else {
            console.log('[NotificationService] Notification dispatched successfully:', data);
        }
    } catch (err) {
        console.info('[NotificationService] Notification invocation notice:', err);
    }
};
