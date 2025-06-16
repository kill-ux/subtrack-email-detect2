import OpenAI from 'openai';

export interface GeminiValidationResult {
  isValidSubscription: boolean;
  serviceName: string;
  amount: number;
  currency: string;
  billingCycle: 'monthly' | 'yearly' | 'weekly';
  category: string;
  confidence: number;
  reasoning: string;
}

export class GeminiValidator {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: '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',
      defaultHeaders: {
        'HTTP-Referer': 'https://subtrack-email-detect.lovable.app',
        'X-Title': 'SubTracker - Email Subscription Detection',
      },
    });
  }

  /**
   * Use OpenRouter AI to validate if an email is a subscription receipt
   */
  async validateSubscriptionEmail(
    subject: string, 
    body: string, 
    fromEmail: string
  ): Promise<GeminiValidationResult | null> {
    try {
      const prompt = this.createValidationPrompt(subject, body, fromEmail);
      
      console.log('🤖 Calling OpenRouter AI for validation...');
      
      const completion = await this.openai.chat.completions.create({
        model: 'google/gemini-flash-1.5',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 1000,
      });

      const aiResponse = completion.choices[0]?.message?.content;
      
      if (!aiResponse) {
        console.error('❌ No response from OpenRouter AI');
        return null;
      }

      console.log('✅ OpenRouter AI response received');
      return this.parseGeminiResponse(aiResponse);
    } catch (error) {
      console.error('❌ Error calling OpenRouter AI:', error);
      return null;
    }
  }

  /**
   * Create a detailed prompt for AI with specific focus on development services
   */
  private createValidationPrompt(subject: string, body: string, fromEmail: string): string {
    return `
You are an expert email analyst specializing in subscription and payment receipt detection. You must be especially good at detecting DEVELOPMENT TOOL subscriptions like StackBlitz, GitHub, Stripe, etc.

Analyze this email and determine if it's a VALID SUBSCRIPTION RECEIPT or PAYMENT CONFIRMATION.

EMAIL DETAILS:
- Subject: "${subject}"
- From: "${fromEmail}"
- Body: "${body.substring(0, 2000)}"

VALIDATION CRITERIA:
✅ VALID SUBSCRIPTION RECEIPT if the email contains:
- Clear payment confirmation, receipt, or billing language
- Specific monetary amount with currency (even small amounts like $4, $5, $10)
- Service/product name being paid for
- Evidence of recurring billing (monthly, yearly, weekly)
- From a legitimate service provider

🎯 PAY SPECIAL ATTENTION TO THESE DEVELOPMENT SERVICES:
- StackBlitz Pro/Teams (stackblitz.com, stripe.com for StackBlitz)
- GitHub Pro/Teams (github.com)
- Stripe payments (stripe.com) - often used for other services
- Vercel Pro (vercel.com)
- Netlify Pro (netlify.com)
- Figma Professional (figma.com)
- Adobe Creative Cloud (adobe.com)
- Microsoft 365/Azure (microsoft.com)
- Google Workspace (google.com)
- AWS/Cloud services (aws.amazon.com)

🔍 LOOK FOR THESE PAYMENT INDICATORS:
- "Payment successful", "Payment receipt", "Invoice", "Billing receipt"
- "Subscription renewed", "Monthly charge", "Annual billing"
- "Thank you for your payment", "Payment confirmation"
- "Charged", "Billed", "Paid", "Transaction"
- Dollar amounts: $4.00, $5.00, $10.00, $15.99, etc.
- "Pro plan", "Premium", "Teams", "Professional"

❌ INVALID if the email is:
- Welcome/signup emails without payment
- Password resets or security alerts
- Marketing/promotional content
- Account notifications without billing
- Payment failures or declined cards
- Free trial starts (without actual payment)
- General service updates or newsletters

RESPOND ONLY IN THIS EXACT JSON FORMAT:
{
  "isValidSubscription": true/false,
  "serviceName": "exact service name (e.g., 'StackBlitz Pro', 'GitHub Pro', 'Netflix')",
  "amount": numeric_amount,
  "currency": "USD/EUR/GBP/MAD/etc",
  "billingCycle": "monthly/yearly/weekly",
  "category": "Development/Entertainment/Productivity/Music/Design/etc",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation why valid/invalid"
}

EXAMPLES OF VALID SUBSCRIPTIONS:
✅ "StackBlitz Pro - Payment Receipt $10.00 monthly"
✅ "GitHub Pro subscription - $4.00 charged monthly"
✅ "Stripe payment receipt - StackBlitz Teams $25.00"
✅ "Netflix Payment Receipt - $15.99 charged for monthly subscription"
✅ "Spotify Premium - Payment Confirmation $9.99"
✅ "Adobe Creative Cloud - Annual billing $599.88"
✅ "Microsoft 365 - Monthly subscription $12.99"

EXAMPLES OF INVALID EMAILS:
❌ "Welcome to StackBlitz! Start your free trial"
❌ "Update your payment method for GitHub"
❌ "Your StackBlitz trial expires soon"
❌ "Security alert for your account"
❌ "New features available in StackBlitz"

IMPORTANT: Even small amounts like $4-10 are valid subscriptions for development tools. Don't dismiss them as too small.

Be thorough but accurate. Mark as valid ONLY if there's clear evidence of an actual payment/charge for a service.
`;
  }

  /**
   * Parse AI response into structured data
   */
  private parseGeminiResponse(response: string): GeminiValidationResult | null {
    try {
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('❌ No JSON found in AI response');
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate required fields
      if (typeof parsed.isValidSubscription !== 'boolean') {
        console.error('❌ Invalid AI response format');
        return null;
      }

      return {
        isValidSubscription: parsed.isValidSubscription,
        serviceName: parsed.serviceName || 'Unknown Service',
        amount: parseFloat(parsed.amount) || 0,
        currency: parsed.currency || 'USD',
        billingCycle: parsed.billingCycle || 'monthly',
        category: parsed.category || 'Unknown',
        confidence: parseFloat(parsed.confidence) || 0.5,
        reasoning: parsed.reasoning || 'No reasoning provided'
      };
    } catch (error) {
      console.error('❌ Error parsing AI response:', error);
      console.error('Raw response:', response);
      return null;
    }
  }

  /**
   * Batch validate multiple emails (with rate limiting)
   */
  async validateMultipleEmails(
    emails: Array<{subject: string, body: string, fromEmail: string}>
  ): Promise<GeminiValidationResult[]> {
    const results: GeminiValidationResult[] = [];
    
    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      console.log(`🤖 OpenRouter AI analyzing email ${i + 1}/${emails.length}: ${email.subject.substring(0, 50)}...`);
      
      const result = await this.validateSubscriptionEmail(
        email.subject, 
        email.body, 
        email.fromEmail
      );
      
      if (result) {
        results.push(result);
      }
      
      // Rate limiting: wait 1 second between requests
      if (i < emails.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return results;
  }
}