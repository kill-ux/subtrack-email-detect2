import { addDoc, collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from './firebase';
import { GmailTokenManager } from './gmailTokenManager';

export interface DetectedSubscription {
  id?: string;
  userId: string;
  serviceName: string;
  amount: number;
  currency: string;
  billingCycle: 'monthly' | 'yearly' | 'weekly';
  nextPaymentDate: string;
  category: string;
  status: 'active' | 'trial' | 'cancelled';
  emailId: string;
  detectedAt: string;
  lastEmailDate: string;
  emailSubject: string;
  confidence: number;
  receiptType: string;
  language?: string;
  region?: string;
  yearProcessed?: number;
}

// ULTRA-STRICT: Only the most reliable receipt keywords
const STRICT_RECEIPT_KEYWORDS = [
  // Core payment confirmations
  'payment receipt', 'billing receipt', 'subscription receipt', 'invoice receipt',
  'payment confirmation', 'billing confirmation', 'transaction receipt',
  'payment successful', 'payment complete', 'payment processed',
  'charge confirmation', 'auto-renewal confirmation', 'subscription confirmed',
  'thank you for your payment', 'payment received', 'transaction complete',
  
  // Service-specific receipt patterns (most reliable)
  'kick receipt', 'kick payment confirmation', 'kick subscription receipt',
  'spotify receipt', 'spotify payment confirmation', 'spotify premium receipt',
  'netflix receipt', 'netflix payment confirmation', 'netflix subscription receipt',
  'github receipt', 'github payment confirmation', 'github subscription receipt',
  'stackblitz receipt', 'stackblitz payment confirmation',
  'tinder receipt', 'tinder payment confirmation', 'tinder subscription receipt',
  
  // Payment processor confirmations
  'stripe receipt', 'stripe payment confirmation',
  'paypal receipt', 'paypal payment confirmation',
  'google play receipt', 'app store receipt',
  
  // Multi-language (only most reliable)
  'إيصال دفع', 'تأكيد الدفع', 'إيصال الاشتراك', 'دفع ناجح',
  'reçu de paiement', 'confirmation de paiement', 'paiement réussi',
  'recibo de pago', 'confirmación de pago', 'pago exitoso'
];

// ULTRA-STRICT: Must have clear financial transaction language
const MANDATORY_FINANCIAL_TERMS = [
  // Payment processing terms
  'amount charged', 'total charged', 'payment processed', 'successfully charged',
  'charged to your', 'billed to your', 'payment authorized', 'transaction approved',
  'subscription fee', 'monthly charge', 'annual fee', 'billing amount',
  'auto-pay', 'autopay', 'recurring charge', 'renewal fee',
  
  // Clear payment success indicators
  'payment successful', 'payment complete', 'successfully processed',
  'transaction successful', 'charge processed', 'billing successful',
  'payment confirmed', 'payment received', 'transaction approved',
  
  // Subscription-specific financial terms
  'subscription renewed', 'auto-renewal processed', 'recurring payment processed',
  'membership fee charged', 'plan cost', 'subscription cost',
  
  // Multi-language financial terms
  'تم الدفع', 'المبلغ المدفوع', 'رسوم الاشتراك', 'تم تحصيل المبلغ',
  'montant facturé', 'paiement traité', 'frais facturés',
  'cantidad cobrada', 'pago procesado', 'tarifa cobrada'
];

// ULTRA-STRICT: Aggressive exclusions for non-payment emails
const STRICT_EXCLUSIONS = [
  // Marketing and promotional
  'promotional', 'marketing', 'newsletter', 'offer', 'deal', 'discount',
  'sale', 'special offer', 'limited time', 'exclusive offer', 'promo code',
  'coupon', 'voucher', 'free trial offer', 'upgrade offer',
  
  // Account management (non-payment)
  'welcome', 'getting started', 'account created', 'sign up complete',
  'registration complete', 'account setup', 'profile created',
  'verify email', 'confirm email', 'email verification', 'account verification',
  'password reset', 'security alert', 'login alert', 'suspicious activity',
  
  // Shipping and delivery
  'order confirmation', 'shipping confirmation', 'delivery confirmation',
  'package shipped', 'order shipped', 'tracking information', 'delivery update',
  'order status', 'shipment notification',
  
  // Free trials and cancellations (without payment)
  'free trial started', 'trial activated', 'trial period', 'trial access',
  'subscription cancelled', 'cancellation confirmed', 'service terminated',
  'account closed', 'subscription ended',
  
  // Gift cards and one-time purchases
  'gift card', 'gift certificate', 'one-time purchase', 'single purchase',
  'download complete', 'software download', 'license key',
  
  // Support and notifications
  'support ticket', 'help request', 'customer service', 'technical support',
  'system notification', 'service update', 'maintenance notification',
  'feature update', 'new feature', 'product update',
  
  // Multi-language exclusions
  'ترويجي', 'تسويق', 'عرض خاص', 'مرحبا', 'إنشاء الحساب',
  'promotionnel', 'marketing', 'offre spéciale', 'bienvenue', 'compte créé',
  'promocional', 'mercadeo', 'oferta especial', 'bienvenido', 'cuenta creada'
];

// ULTRA-STRICT: Services that must have subscription context
const VERIFIED_SUBSCRIPTION_SERVICES = {
  kick: { 
    name: 'Kick.com', 
    category: 'Streaming',
    requiredTerms: ['subscription', 'premium', 'creator', 'monthly', 'payment'],
    domains: ['kick.com'],
    patterns: [/kick\.com.*(?:subscription|payment|receipt)/i]
  },
  spotify: { 
    name: 'Spotify', 
    category: 'Music',
    requiredTerms: ['premium', 'subscription', 'monthly', 'family', 'individual'],
    domains: ['spotify.com'],
    patterns: [/spotify.*(?:premium|subscription|payment|receipt)/i]
  },
  tinder: { 
    name: 'Tinder', 
    category: 'Dating',
    requiredTerms: ['plus', 'gold', 'platinum', 'subscription', 'premium'],
    domains: ['tinder.com', 'gotinder.com'],
    patterns: [/tinder.*(?:plus|gold|platinum|subscription|payment)/i]
  },
  netflix: { 
    name: 'Netflix', 
    category: 'Entertainment',
    requiredTerms: ['subscription', 'monthly', 'plan', 'membership'],
    domains: ['netflix.com'],
    patterns: [/netflix.*(?:subscription|payment|receipt|plan)/i]
  },
  github: { 
    name: 'GitHub', 
    category: 'Development',
    requiredTerms: ['pro', 'copilot', 'subscription', 'team', 'organization'],
    domains: ['github.com'],
    patterns: [/github.*(?:pro|copilot|subscription|payment)/i]
  },
  stackblitz: { 
    name: 'StackBlitz', 
    category: 'Development',
    requiredTerms: ['pro', 'subscription', 'premium', 'team'],
    domains: ['stackblitz.com'],
    patterns: [/stackblitz.*(?:pro|subscription|payment|premium)/i]
  }
};

// ULTRA-STRICT: Currency patterns with context validation
const STRICT_CURRENCY_PATTERNS = [
  // USD with context
  { pattern: /(?:charged|billed|paid|total|amount|cost|fee|price).*?\$(\d+(?:\.\d{2})?)/gi, currency: 'USD' },
  { pattern: /\$(\d+(?:\.\d{2})?).*?(?:charged|billed|paid|total|amount|cost|fee|price)/gi, currency: 'USD' },
  
  // EUR with context
  { pattern: /(?:charged|billed|paid|total|amount|cost|fee|price).*?€(\d+(?:[,\.]\d{2})?)/gi, currency: 'EUR' },
  { pattern: /€(\d+(?:[,\.]\d{2})?).*?(?:charged|billed|paid|total|amount|cost|fee|price)/gi, currency: 'EUR' },
  
  // MAD with context
  { pattern: /(?:charged|billed|paid|total|amount|cost|fee|price).*?(\d+(?:[,\.]\d{2})?)\s*(?:MAD|DH|dirham)/gi, currency: 'MAD' },
  { pattern: /(\d+(?:[,\.]\d{2})?)\s*(?:MAD|DH|dirham).*?(?:charged|billed|paid|total|amount|cost|fee|price)/gi, currency: 'MAD' },
  
  // GBP with context
  { pattern: /(?:charged|billed|paid|total|amount|cost|fee|price).*?£(\d+(?:\.\d{2})?)/gi, currency: 'GBP' },
  { pattern: /£(\d+(?:\.\d{2})?).*?(?:charged|billed|paid|total|amount|cost|fee|price)/gi, currency: 'GBP' }
];

export class EmailProcessor {
  private userId: string;
  private tokenManager: GmailTokenManager;

  constructor(userId: string) {
    this.userId = userId;
    this.tokenManager = new GmailTokenManager(userId);
  }

  async processEmailsForYear(year: number): Promise<DetectedSubscription[]> {
    try {
      console.log(`🗓️ Starting ULTRA-STRICT email processing for ${year} (user: ${this.userId})`);
      
      const isAuthorized = await this.tokenManager.isGmailAuthorized();
      if (!isAuthorized) {
        throw new Error('Gmail not authorized for this user');
      }

      const accessToken = await this.tokenManager.getValidAccessToken();
      if (!accessToken) {
        throw new Error('Unable to obtain valid access token');
      }

      // ULTRA-STRICT: Only search for confirmed payment receipts
      const searchQueries = [
        // Only confirmed payment receipts
        `"payment receipt" after:${year}/01/01 before:${year + 1}/01/01`,
        `"payment confirmation" after:${year}/01/01 before:${year + 1}/01/01`,
        `"payment successful" after:${year}/01/01 before:${year + 1}/01/01`,
        `"payment complete" after:${year}/01/01 before:${year + 1}/01/01`,
        `"billing receipt" after:${year}/01/01 before:${year + 1}/01/01`,
        `"subscription receipt" after:${year}/01/01 before:${year + 1}/01/01`,
        `"charge confirmation" after:${year}/01/01 before:${year + 1}/01/01`,
        `"transaction receipt" after:${year}/01/01 before:${year + 1}/01/01`,
        `"thank you for your payment" after:${year}/01/01 before:${year + 1}/01/01`,
        
        // Service-specific confirmed payments only
        `from:kick.com "payment" after:${year}/01/01 before:${year + 1}/01/01`,
        `from:spotify.com "payment" after:${year}/01/01 before:${year + 1}/01/01`,
        `from:tinder.com "payment" after:${year}/01/01 before:${year + 1}/01/01`,
        `from:netflix.com "payment" after:${year}/01/01 before:${year + 1}/01/01`,
        `from:github.com "payment" after:${year}/01/01 before:${year + 1}/01/01`,
        `from:stackblitz.com "payment" after:${year}/01/01 before:${year + 1}/01/01`,
        
        // Payment processor receipts
        `from:stripe.com "receipt" after:${year}/01/01 before:${year + 1}/01/01`,
        `from:paypal.com "receipt" after:${year}/01/01 before:${year + 1}/01/01`,
        `"google play receipt" after:${year}/01/01 before:${year + 1}/01/01`,
        
        // Auto-renewal confirmations
        `"auto-renewal" "successful" after:${year}/01/01 before:${year + 1}/01/01`,
        `"subscription renewed" after:${year}/01/01 before:${year + 1}/01/01`,
        `"recurring payment" "processed" after:${year}/01/01 before:${year + 1}/01/01`
      ];

      const detectedSubscriptions: DetectedSubscription[] = [];
      const processedEmailIds = new Set<string>();
      
      for (const searchQuery of searchQueries) {
        console.log(`🔍 ULTRA-STRICT search (${year}): ${searchQuery}`);
        
        const response = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}&maxResults=50`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!response.ok) {
          console.warn(`⚠️ Search query failed: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const messages = data.messages || [];
        
        console.log(`📧 Found ${messages.length} emails for ${year} query`);

        for (const message of messages) {
          if (processedEmailIds.has(message.id)) {
            continue;
          }
          processedEmailIds.add(message.id);

          try {
            const emailResponse = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=full`,
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
              }
            );

            if (!emailResponse.ok) {
              console.warn(`⚠️ Failed to fetch email ${message.id}: ${emailResponse.status}`);
              continue;
            }

            const email = await emailResponse.json();
            const subscription = this.validateReceiptEmailUltraStrict(email, year);
            
            if (subscription) {
              const isDuplicate = detectedSubscriptions.some(existing => 
                existing.serviceName === subscription.serviceName && 
                Math.abs(existing.amount - subscription.amount) < 0.01 &&
                existing.currency === subscription.currency
              );
              
              if (!isDuplicate) {
                detectedSubscriptions.push(subscription);
                console.log(`✅ ULTRA-STRICT RECEIPT (${year}): ${subscription.serviceName} - ${subscription.currency} ${subscription.amount} (confidence: ${subscription.confidence})`);
              }
            }
          } catch (error) {
            console.error(`❌ Error processing email ${message.id}:`, error);
          }
        }
      }

      console.log(`🎯 ULTRA-STRICT detection (${year}) found ${detectedSubscriptions.length} VERIFIED receipts for user: ${this.userId}`);

      await this.saveSubscriptionsForYear(detectedSubscriptions, year);
      return detectedSubscriptions;
    } catch (error) {
      console.error(`❌ Error processing ${year} emails for user ${this.userId}:`, error);
      throw error;
    }
  }

  /**
   * ULTRA-STRICT validation - only real payment receipts pass
   */
  private validateReceiptEmailUltraStrict(email: any, year: number): DetectedSubscription | null {
    const headers = email.payload?.headers || [];
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
    const from = headers.find((h: any) => h.name === 'From')?.value || '';
    const date = headers.find((h: any) => h.name === 'Date')?.value || '';

    // Verify email year
    const emailDate = new Date(date);
    const emailYear = emailDate.getFullYear();
    if (emailYear !== year) {
      return null;
    }

    const body = this.extractEmailBodyEnhanced(email.payload);
    const fullText = `${subject} ${body} ${from}`.toLowerCase();

    console.log(`🔒 ULTRA-STRICT validation (${year}): "${subject}" from "${from}"`);

    // 📧 LOG VALID SUBSCRIPTION EMAIL CONTENT
    console.log(`\n📧 ===== VALID SUBSCRIPTION EMAIL DETECTED =====`);
    console.log(`📋 SUBJECT: ${subject}`);
    console.log(`📄 BODY: ${body.substring(0, 500)}${body.length > 500 ? '...' : ''}`);
    console.log(`📧 ===============================================\n`);

    // STEP 1: MANDATORY receipt keyword check
    const hasStrictReceiptKeyword = STRICT_RECEIPT_KEYWORDS.some(keyword => 
      subject.toLowerCase().includes(keyword) || fullText.includes(keyword)
    );
    
    if (!hasStrictReceiptKeyword) {
      console.log(`❌ REJECTED: No strict receipt keyword found`);
      return null;
    }

    // STEP 2: AGGRESSIVE exclusion check
    for (const exclusion of STRICT_EXCLUSIONS) {
      if (fullText.includes(exclusion) || subject.toLowerCase().includes(exclusion)) {
        console.log(`❌ REJECTED: Strict exclusion triggered: ${exclusion}`);
        return null;
      }
    }

    // STEP 3: MANDATORY financial terms check
    const hasMandatoryFinancialTerms = MANDATORY_FINANCIAL_TERMS.some(term => 
      fullText.includes(term)
    );
    
    if (!hasMandatoryFinancialTerms) {
      console.log(`❌ REJECTED: No mandatory financial terms found`);
      return null;
    }

    // STEP 4: STRICT amount extraction with context
    const amount = this.extractAmountUltraStrict(fullText, body, subject);
    if (!amount || amount.value < 0.5 || amount.value > 2000) {
      console.log(`❌ REJECTED: Invalid or missing amount: ${amount?.value} ${amount?.currency}`);
      return null;
    }

    // STEP 5: VERIFIED service identification
    const serviceInfo = this.identifyVerifiedService(subject, from, fullText);
    if (!serviceInfo) {
      console.log(`❌ REJECTED: Unverified service`);
      return null;
    }

    // STEP 6: MANDATORY subscription context check
    if (!this.hasSubscriptionContext(fullText, serviceInfo)) {
      console.log(`❌ REJECTED: No subscription context for ${serviceInfo.name}`);
      return null;
    }

    // STEP 7: PAYMENT SUCCESS validation
    if (!this.hasPaymentSuccessIndicators(fullText, subject)) {
      console.log(`❌ REJECTED: No payment success indicators`);
      return null;
    }

    // Calculate ultra-strict confidence
    let confidence = 0.9; // Start high for strict validation
    
    // Boost for verified services
    if (['kick', 'spotify', 'tinder', 'netflix', 'stackblitz', 'github'].some(s => 
        serviceInfo.name.toLowerCase().includes(s))) {
      confidence += 0.05;
    }
    
    // Boost for clear payment success
    if (fullText.includes('payment successful') || fullText.includes('payment complete')) {
      confidence += 0.05;
    }

    const languageInfo = this.detectLanguageAndRegionEnhanced(fullText, from);
    const billingCycle = this.determineBillingCycleEnhanced(fullText, languageInfo.language);
    const nextPaymentDate = this.calculateNextPaymentDate(billingCycle);
    const status = this.determineStatusEnhanced(fullText, languageInfo.language);

    const subscription: DetectedSubscription = {
      userId: this.userId,
      serviceName: serviceInfo.name,
      amount: amount.value,
      currency: amount.currency,
      billingCycle,
      nextPaymentDate,
      category: serviceInfo.category,
      status,
      emailId: email.id,
      detectedAt: new Date().toISOString(),
      lastEmailDate: new Date(date).toISOString(),
      emailSubject: subject,
      confidence: Math.min(confidence, 1.0),
      receiptType: 'verified_payment_receipt',
      language: languageInfo.language,
      region: languageInfo.region,
      yearProcessed: year
    };

    console.log(`✅ ULTRA-STRICT VERIFIED RECEIPT (${year}): ${serviceInfo.name} - ${amount.currency} ${amount.value} (confidence: ${confidence.toFixed(2)})`);
    return subscription;
  }

  /**
   * ULTRA-STRICT amount extraction - must have payment context
   */
  private extractAmountUltraStrict(text: string, body: string, subject: string): { value: number; currency: string } | null {
    console.log(`💰 ULTRA-STRICT amount extraction with payment context...`);
    
    // Only extract amounts that appear with payment context
    for (const currencyPattern of STRICT_CURRENCY_PATTERNS) {
      const matches = [...text.matchAll(currencyPattern.pattern)];
      for (const match of matches) {
        const amount = this.parseAmount(match[1]);
        
        if (this.validateAmountForCurrency(amount, currencyPattern.currency)) {
          console.log(`✅ VERIFIED ${currencyPattern.currency} amount with context: ${amount}`);
          return { value: amount, currency: currencyPattern.currency };
        }
      }
    }
    
    console.log(`❌ NO VALID AMOUNT WITH PAYMENT CONTEXT FOUND`);
    return null;
  }

  /**
   * VERIFIED service identification - only known subscription services
   */
  private identifyVerifiedService(subject: string, from: string, fullText: string): { name: string; category: string } | null {
    console.log(`🔍 VERIFIED service identification...`);
    
    // Check only verified subscription services
    for (const [key, service] of Object.entries(VERIFIED_SUBSCRIPTION_SERVICES)) {
      // Check domain match
      const domainMatch = service.domains.some(domain => from.toLowerCase().includes(domain));
      
      // Check pattern match
      const patternMatch = service.patterns.some(pattern => 
        pattern.test(`${subject} ${from} ${fullText}`)
      );
      
      if (domainMatch || patternMatch) {
        console.log(`✅ VERIFIED service: ${service.name}`);
        return { name: service.name, category: service.category };
      }
    }
    
    // Check for payment processor services (Stripe, PayPal, etc.)
    if (from.includes('stripe.com') || from.includes('paypal.com')) {
      const serviceMatch = this.extractServiceFromPaymentProcessor(subject, fullText);
      if (serviceMatch) {
        return serviceMatch;
      }
    }
    
    console.log(`❌ UNVERIFIED service`);
    return null;
  }

  /**
   * Check if email has subscription context for the service
   */
  private hasSubscriptionContext(fullText: string, serviceInfo: any): boolean {
    const service = Object.values(VERIFIED_SUBSCRIPTION_SERVICES).find(s => s.name === serviceInfo.name);
    
    if (!service) {
      // For non-verified services, require general subscription terms
      const generalSubscriptionTerms = [
        'subscription', 'recurring', 'monthly', 'annual', 'premium', 'pro', 'plus'
      ];
      return generalSubscriptionTerms.some(term => fullText.includes(term));
    }
    
    // For verified services, check required terms
    return service.requiredTerms.some(term => fullText.includes(term));
  }

  /**
   * Check for payment success indicators
   */
  private hasPaymentSuccessIndicators(fullText: string, subject: string): boolean {
    const successIndicators = [
      'payment successful', 'payment complete', 'payment processed',
      'successfully charged', 'transaction successful', 'payment confirmed',
      'charge processed', 'billing successful', 'payment received',
      'transaction complete', 'payment authorized', 'charge confirmed'
    ];
    
    return successIndicators.some(indicator => 
      fullText.includes(indicator) || subject.toLowerCase().includes(indicator)
    );
  }

  /**
   * Extract service from payment processor emails
   */
  private extractServiceFromPaymentProcessor(subject: string, fullText: string): { name: string; category: string } | null {
    // Look for service names in Stripe/PayPal receipts
    const servicePatterns = [
      /(?:payment|receipt|charge).*?(?:for|to)\s+([A-Z][a-zA-Z\s]+?)(?:\s|$|\.)/i,
      /([A-Z][a-zA-Z\s]+?)\s+(?:subscription|payment|charge)/i
    ];
    
    for (const pattern of servicePatterns) {
      const match = subject.match(pattern) || fullText.match(pattern);
      if (match && match[1]) {
        const serviceName = match[1].trim();
        if (serviceName.length > 2 && serviceName.length < 30) {
          return {
            name: serviceName,
            category: 'Digital Service'
          };
        }
      }
    }
    
    return null;
  }

  // Helper methods (reused from previous implementation)
  private parseAmount(amountStr: string): number {
    const cleaned = amountStr.replace(/[^\d.,]/g, '');
    
    if (cleaned.includes(',') && cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
    }
    
    return parseFloat(cleaned.replace(/,/g, ''));
  }

  private validateAmountForCurrency(amount: number, currency: string): boolean {
    const ranges = {
      'USD': { min: 0.5, max: 500 },
      'EUR': { min: 0.5, max: 500 },
      'GBP': { min: 0.5, max: 500 },
      'MAD': { min: 5, max: 5000 },
      'SAR': { min: 2, max: 2000 },
      'AED': { min: 2, max: 2000 }
    };
    
    const range = ranges[currency] || { min: 0.5, max: 500 };
    return amount >= range.min && amount <= range.max;
  }

  private detectLanguageAndRegionEnhanced(text: string, from: string): { language: string; region: string } {
    if (/[\u0600-\u06FF]/.test(text)) {
      if (text.includes('درهم') || from.includes('.ma')) {
        return { language: 'ar', region: 'morocco' };
      }
      return { language: 'ar', region: 'mena' };
    }
    
    if (text.includes('reçu') || text.includes('facture')) {
      if (from.includes('.ma')) {
        return { language: 'fr', region: 'morocco' };
      }
      return { language: 'fr', region: 'france' };
    }
    
    return { language: 'en', region: 'global' };
  }

  private determineBillingCycleEnhanced(text: string, language: string): 'monthly' | 'yearly' | 'weekly' {
    const patterns = {
      'en': {
        yearly: ['annual', 'yearly', 'year', 'per year', '/year'],
        weekly: ['weekly', 'week', 'per week', '/week'],
        monthly: ['monthly', 'month', 'per month', '/month']
      }
    };
    
    const langPatterns = patterns[language] || patterns['en'];
    
    if (langPatterns.yearly.some(term => text.includes(term))) return 'yearly';
    if (langPatterns.weekly.some(term => text.includes(term))) return 'weekly';
    return 'monthly';
  }

  private determineStatusEnhanced(text: string, language: string): 'active' | 'trial' | 'cancelled' {
    if (text.includes('trial') || text.includes('free trial')) return 'trial';
    if (text.includes('cancelled') || text.includes('terminated')) return 'cancelled';
    return 'active';
  }

  private extractEmailBodyEnhanced(payload: any): string {
    let extractedBody = '';

    const extractFromPart = (part: any): string => {
      let content = '';
      
      if (part.body?.data) {
        try {
          const decoded = this.decodeBase64Url(part.body.data);
          if (decoded.length > content.length) {
            content = decoded;
          }
        } catch (e) {
          // Continue
        }
      }
      
      if (part.parts) {
        for (const subPart of part.parts) {
          const subContent = extractFromPart(subPart);
          if (subContent.length > content.length) {
            content = subContent;
          }
        }
      }
      
      return content;
    };

    extractedBody = extractFromPart(payload);
    
    if (extractedBody.length === 0 && payload.snippet) {
      extractedBody = payload.snippet;
    }

    return extractedBody;
  }

  private decodeBase64Url(data: string): string {
    try {
      let base64 = data.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) {
        base64 += '=';
      }
      
      const decoded = atob(base64);
      
      try {
        return decodeURIComponent(escape(decoded));
      } catch (e) {
        return decoded;
      }
    } catch (error) {
      return '';
    }
  }

  private calculateNextPaymentDate(billingCycle: string): string {
    const now = new Date();
    switch (billingCycle) {
      case 'weekly':
        now.setDate(now.getDate() + 7);
        break;
      case 'yearly':
        now.setFullYear(now.getFullYear() + 1);
        break;
      default:
        now.setMonth(now.getMonth() + 1);
        break;
    }
    return now.toISOString();
  }

  async processEmails(): Promise<DetectedSubscription[]> {
    const currentYear = new Date().getFullYear();
    return this.processEmailsForYear(currentYear);
  }

  private async saveSubscriptionsForYear(subscriptions: DetectedSubscription[], year: number): Promise<void> {
    const subscriptionsRef = collection(db, 'subscriptions');

    for (const subscription of subscriptions) {
      try {
        const q = query(
          subscriptionsRef,
          where('userId', '==', subscription.userId),
          where('emailId', '==', subscription.emailId),
          where('yearProcessed', '==', year)
        );
        
        const existingDocs = await getDocs(q);
        
        if (existingDocs.empty) {
          await addDoc(subscriptionsRef, {
            ...subscription,
            yearProcessed: year
          });
          console.log(`✅ Added ULTRA-STRICT subscription (${year}): ${subscription.serviceName}`);
        } else {
          const docRef = doc(db, 'subscriptions', existingDocs.docs[0].id);
          await updateDoc(docRef, {
            ...subscription,
            yearProcessed: year,
            updatedAt: new Date().toISOString()
          });
          console.log(`🔄 Updated ULTRA-STRICT subscription (${year}): ${subscription.serviceName}`);
        }
      } catch (error) {
        console.error(`❌ Error saving subscription ${subscription.serviceName}:`, error);
      }
    }
  }
}