# Discussion Email Notification Edge Function

This Supabase Edge Function sends automated transactional emails whenever a message is posted or when team members are @mentioned in Deal Discussions.

## Deployment Steps

1. Get a free API key from [Resend](https://resend.com).
2. Set the secret in Supabase:
   ```bash
   supabase secrets set RESEND_API_KEY="re_123456789"
   ```
3. Deploy the function:
   ```bash
   supabase functions deploy send-discussion-email --project-ref wpzigasfuizrabqqzxln
   ```
