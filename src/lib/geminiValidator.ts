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
  private requestCount: number = 0;
  private lastRequestTime: number = 0;
  private readonly MIN_REQUEST_INTERVAL = 1500; // 1.5 seconds between requests

  constructor() {
    this.openai = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: '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',
      dangerouslyAllowBrowser: true,
      defaultHeaders: {
        'HTTP-Referer': 'https://subtrack-email-detect.lovable.app',
        'X-Title': 'SubTracker - Email Subscription Detection',
      },
    });
  }

  /**
   * Enhanced rate limiting with exponential backoff
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
      const waitTime = this.MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      console.log(`⏳ Rate limiting: waiting ${waitTime}ms before next AI request`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
    this.requestCount++;
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
      await this.enforceRateLimit();
      
      const prompt = this.createEnhancedValidationPrompt(subject, body, fromEmail);
      
      console.log(`🤖 AI Request #${this.requestCount}: Validating "${subject.substring(0, 50)}..."`);
      
      const completion = await this.openai.chat.completions.create({
        model: 'google/gemini-flash-1.5',
        messages: [
          {
            role: 'system',
            content: 'You are an expert email analyst specializing in subscription receipt detection. You must respond ONLY with valid JSON in the exact format specified.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 800,
      });

      const aiResponse = completion.choices[0]?.message?.content;
      
      if (!aiResponse) {
        console.error('❌ No response from OpenRouter AI');
        return null;
      }

      console.log(`✅ AI Response #${this.requestCount} received`);
      return this.parseGeminiResponse(aiResponse);
    } catch (error) {
      console.error(`❌ Error in AI request #${this.requestCount}:`, error);
      
      // Implement exponential backoff on error
      if (error instanceof Error && error.message.includes('rate')) {
        const backoffTime = Math.min(5000, 1000 * Math.pow(2, this.requestCount % 4));
        console.log(`🔄 Rate limit hit, backing off for ${backoffTime}ms`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
      
      return null;
    }
  }

  /**
   * Enhanced prompt with better structure and examples
   */
  private createEnhancedValidationPrompt(subject: string, body: string, fromEmail: string): string {
    return `
TASK: Analyze this email to determine if it's a VALID SUBSCRIPTION RECEIPT or PAYMENT CONFIRMATION.

EMAIL DATA:
Subject: "${subject}"
From: "${fromEmail}"
Body: "${body.substring(0, 1500)}"

VALIDATION RULES:
✅ VALID if email contains:
- Clear payment confirmation language ("payment received", "receipt", "invoice", "charged")
- Specific monetary amount with currency ($4.00, €15.99, £9.99, etc.)
- Service/product name being paid for
- Evidence of recurring billing (monthly, yearly, weekly, subscription)
- From legitimate service provider domain

🎯 PRIORITY SERVICES (pay special attention):
- StackBlitz Pro/Teams (stackblitz.com, stripe.com for StackBlitz)
- GitHub Pro/Teams/Copilot (github.com)
- Stripe payments (stripe.com) - often processes for other services
- Vercel Pro (vercel.com)
- Netlify Pro (netlify.com)
- Figma Professional (figma.com)
- Adobe Creative Cloud (adobe.com)
- Microsoft 365/Azure (microsoft.com)
- Google Workspace/Cloud (google.com)
- AWS services (aws.amazon.com)
- Development tools and SaaS platforms

❌ INVALID if email is:
- Welcome/signup without payment
- Password resets or security alerts
- Marketing/promotional content
- Account notifications without billing
- Payment failures or declined cards
- Free trial starts (without actual charge)
- General newsletters or updates

RESPONSE FORMAT (JSON ONLY):
{
  "isValidSubscription": true/false,
  "serviceName": "exact service name",
  "amount": numeric_amount,
  "currency": "USD/EUR/GBP/etc",
  "billingCycle": "monthly/yearly/weekly",
  "category": "Development/Entertainment/Productivity/etc",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}

EXAMPLES:
✅ Valid: "StackBlitz Pro - Payment Receipt $10.00 monthly" → confidence: 0.95
✅ Valid: "GitHub Copilot subscription - $10.00 charged monthly" → confidence: 0.95
✅ Valid: "Netflix Payment Receipt - $15.99 monthly subscription" → confidence: 0.90
❌ Invalid: "Welcome to StackBlitz! Start your free trial" → confidence: 0.0
❌ Invalid: "Update your payment method" → confidence: 0.0

Be precise and conservative. Only mark as valid if there's clear evidence of an actual payment/charge.
`;
  }

  /**
   * Enhanced JSON parsing with better error handling
   */
  private parseGeminiResponse(response: string): GeminiValidationResult | null {
    try {
      // Clean the response - remove any markdown formatting
      let cleanResponse = response.trim();
      
      // Remove markdown code blocks if present
      cleanResponse = cleanResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      
      // Extract JSON from response
      const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('❌ No JSON found in AI response:', response.substring(0, 200));
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate required fields
      if (typeof parsed.isValidSubscription !== 'boolean') {
        console.error('❌ Invalid AI response format - missing isValidSubscription');
        return null;
      }

      // Ensure numeric values are properly parsed
      const amount = typeof parsed.amount === 'string' ? parseFloat(parsed.amount) : parsed.amount;
      const confidence = typeof parsed.confidence === 'string' ? parseFloat(parsed.confidence) : parsed.confidence;

      return {
        isValidSubscription: parsed.isValidSubscription,
        serviceName: parsed.serviceName || 'Unknown Service',
        amount: amount || 0,
        currency: parsed.currency || 'USD',
        billingCycle: parsed.billingCycle || 'monthly',
        category: parsed.category || 'Unknown',
        confidence: confidence || 0.5,
        reasoning: parsed.reasoning || 'No reasoning provided'
      };
    } catch (error) {
      console.error('❌ Error parsing AI response:', error);
      console.error('Raw response:', response.substring(0, 500));
      return null;
    }
  }

  /**
   * Batch validate with enhanced rate limiting and retry logic
   */
  async validateMultipleEmails(
    emails: Array<{subject: string, body: string, fromEmail: string}>
  ): Promise<GeminiValidationResult[]> {
    const results: GeminiValidationResult[] = [];
    const batchSize = 3; // Process in smaller batches
    
    console.log(`🤖 Starting batch validation of ${emails.length} emails in batches of ${batchSize}`);
    
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      console.log(`📦 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(emails.length/batchSize)}`);
      
      for (let j = 0; j < batch.length; j++) {
        const email = batch[j];
        const emailIndex = i + j + 1;
        
        console.log(`🔍 Validating email ${emailIndex}/${emails.length}: ${email.subject.substring(0, 40)}...`);
        
        const result = await this.validateSubscriptionEmail(
          email.subject, 
          email.body, 
          email.fromEmail
        );
        
        if (result) {
          results.push(result);
          
          if (result.isValidSubscription) {
            console.log(`✅ VALID: ${result.serviceName} - $${result.amount} (${result.confidence})`);
          }
        }
      }
      
      // Longer pause between batches
      if (i + batchSize < emails.length) {
        console.log(`⏸️ Batch complete. Pausing 3 seconds before next batch...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    console.log(`🎉 Batch validation complete: ${results.length} results from ${emails.length} emails`);
    return results;
  }

  /**
   * Get current rate limiting stats
   */
  getRateLimitStats(): { requestCount: number; lastRequestTime: number } {
    return {
      requestCount: this.requestCount,
      lastRequestTime: this.lastRequestTime
    };
  }

  /**
   * Reset rate limiting counters
   */
  resetRateLimit(): void {
    this.requestCount = 0;
    this.lastRequestTime = 0;
    console.log('🔄 Rate limit counters reset');
  }
}