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
  private apiKey: string;
  private apiUrl: string;

  constructor() {
    this.apiKey = 'AIzaSyCHFzr17FLBF8S7oJ8naYgmf6DVjXzzLqo';
    this.apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';
  }

  /**
   * Use Gemini AI to validate if an email is a subscription receipt
   */
  async validateSubscriptionEmail(
    subject: string, 
    body: string, 
    fromEmail: string
  ): Promise<GeminiValidationResult | null> {
    try {
      const prompt = this.createValidationPrompt(subject, body, fromEmail);
      
      const response = await fetch(`${this.apiUrl}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: 0.1,
            topK: 1,
            topP: 1,
            maxOutputTokens: 1000,
          }
        })
      });

      if (!response.ok) {
        console.error('❌ Gemini API error:', response.status, response.statusText);
        return null;
      }

      const data = await response.json();
      const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!aiResponse) {
        console.error('❌ No response from Gemini AI');
        return null;
      }

      return this.parseGeminiResponse(aiResponse);
    } catch (error) {
      console.error('❌ Error calling Gemini API:', error);
      return null;
    }
  }

  /**
   * Create a detailed prompt for Gemini AI
   */
  private createValidationPrompt(subject: string, body: string, fromEmail: string): string {
    return `
You are an expert email analyst specializing in subscription and payment receipt detection. 

Analyze this email and determine if it's a VALID SUBSCRIPTION RECEIPT or PAYMENT CONFIRMATION.

EMAIL DETAILS:
- Subject: "${subject}"
- From: "${fromEmail}"
- Body: "${body.substring(0, 2000)}"

VALIDATION CRITERIA:
✅ VALID if the email contains:
- Clear payment confirmation or receipt language
- Specific monetary amount with currency
- Service/product name being paid for
- Billing cycle information (monthly, yearly, weekly)
- From a legitimate service provider
- Contains words like: receipt, payment, billing, subscription, renewal, invoice, charged, paid

❌ INVALID if the email is:
- Welcome/signup emails
- Password resets
- Marketing/promotional content
- Account notifications
- Payment failures
- Free trial starts (without payment)
- General service updates

RESPOND ONLY IN THIS EXACT JSON FORMAT:
{
  "isValidSubscription": true/false,
  "serviceName": "exact service name",
  "amount": numeric_amount,
  "currency": "USD/EUR/GBP/MAD/etc",
  "billingCycle": "monthly/yearly/weekly",
  "category": "Entertainment/Productivity/Development/Music/etc",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation why valid/invalid"
}

EXAMPLES:
✅ VALID: "Netflix Payment Receipt - $15.99 charged for monthly subscription"
❌ INVALID: "Welcome to Netflix! Start your free trial"
✅ VALID: "Spotify Premium - Payment Confirmation $9.99"
❌ INVALID: "Update your payment method for Spotify"

Be strict but fair. Only mark as valid if there's clear evidence of an actual payment/charge.
`;
  }

  /**
   * Parse Gemini AI response into structured data
   */
  private parseGeminiResponse(response: string): GeminiValidationResult | null {
    try {
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('❌ No JSON found in Gemini response');
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate required fields
      if (typeof parsed.isValidSubscription !== 'boolean') {
        console.error('❌ Invalid Gemini response format');
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
      console.error('❌ Error parsing Gemini response:', error);
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
      console.log(`🤖 Gemini AI analyzing email ${i + 1}/${emails.length}: ${email.subject.substring(0, 50)}...`);
      
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