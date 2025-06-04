import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { google } from 'npm:googleapis';

const SUBSCRIPTION_KEYWORDS = [
  'subscription',
  'recurring payment',
  'monthly plan',
  'yearly plan',
  'renewal',
  'invoice',
  'receipt'
];

serve(async (req) => {
  try {
    const { authorization } = req.headers;
    if (!authorization) {
      throw new Error('No authorization header');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser(authorization.replace('Bearer ', ''));
    if (userError || !user) throw new Error('Invalid user');

    // Initialize Gmail API
    const oauth2Client = new google.auth.OAuth2(
      Deno.env.get('GOOGLE_CLIENT_ID'),
      Deno.env.get('GOOGLE_CLIENT_SECRET'),
      Deno.env.get('GOOGLE_REDIRECT_URI')
    );

    // Get user's Gmail tokens from database
    const { data: tokens } = await supabase
      .from('gmail_tokens')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!tokens) {
      throw new Error('No Gmail tokens found');
    }

    oauth2Client.setCredentials(tokens);

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Get recent emails
    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 100,
      q: SUBSCRIPTION_KEYWORDS.join(' OR ')
    });

    const messages = response.data.messages || [];
    const subscriptionData = [];

    for (const message of messages) {
      const email = await gmail.users.messages.get({
        userId: 'me',
        id: message.id
      });

      const headers = email.data.payload.headers;
      const subject = headers.find(h => h.name === 'Subject')?.value;
      const from = headers.find(h => h.name === 'From')?.value;
      const date = headers.find(h => h.name === 'Date')?.value;

      // Extract subscription information
      const subscriptionInfo = extractSubscriptionInfo(email.data);
      if (subscriptionInfo) {
        subscriptionData.push({
          ...subscriptionInfo,
          emailId: message.id,
          userId: user.id,
          detectedAt: new Date().toISOString()
        });
      }
    }

    // Store subscription data
    if (subscriptionData.length > 0) {
      const { error: insertError } = await supabase
        .from('subscriptions')
        .upsert(subscriptionData, {
          onConflict: 'email_id'
        });

      if (insertError) throw insertError;
    }

    return new Response(JSON.stringify({
      success: true,
      subscriptions: subscriptionData.length
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

function extractSubscriptionInfo(email: any) {
  // Implement subscription detection logic here
  // This is a simplified example
  const body = email.snippet || '';
  const headers = email.payload.headers;
  const subject = headers.find(h => h.name === 'Subject')?.value || '';

  // Look for common patterns in subscription emails
  const amountMatch = body.match(/\$(\d+(\.\d{2})?)/);
  const dateMatch = body.match(/next payment:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);

  if (amountMatch) {
    return {
      amount: parseFloat(amountMatch[1]),
      nextPaymentDate: dateMatch ? dateMatch[1] : null,
      name: extractServiceName(subject),
      status: 'active',
      currency: 'USD',
      category: determineCategory(subject)
    };
  }

  return null;
}

function extractServiceName(subject: string): string {
  // Remove common prefixes and suffixes
  return subject
    .replace(/^Re:\s*/i, '')
    .replace(/^Fwd:\s*/i, '')
    .replace(/\s*-\s*Receipt/i, '')
    .replace(/\s*-\s*Invoice/i, '')
    .split(' - ')[0]
    .trim();
}

function determineCategory(subject: string): string {
  const categories = {
    entertainment: ['netflix', 'spotify', 'hulu', 'disney'],
    productivity: ['slack', 'notion', 'asana', 'monday'],
    development: ['github', 'gitlab', 'heroku', 'digitalocean'],
    storage: ['dropbox', 'google drive', 'icloud'],
  };

  const lowerSubject = subject.toLowerCase();
  
  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(keyword => lowerSubject.includes(keyword))) {
      return category;
    }
  }

  return 'other';
}