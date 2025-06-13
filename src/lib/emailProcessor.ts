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

// 🎯 ENHANCED: More comprehensive payment receipt keywords
const RECEIPT_KEYWORDS = [
  // Core payment receipts
  'receipt', 'payment receipt', 'billing receipt', 'subscription receipt', 'transaction receipt',
  'payment confirmation', 'billing confirmation', 'subscription confirmation',
  'payment successful', 'payment complete', 'payment processed', 'payment authorized',
  'charge confirmation', 'transaction confirmation', 'purchase confirmation',
  'thank you for your payment', 'payment received', 'subscription renewed',
  'auto-renewal successful', 'recurring payment processed', 'subscription fee charged',
  'billing statement', 'invoice paid', 'payment invoice', 'invoice',
  
  // StackBlitz/Stripe specific patterns
  'your receipt from', 'receipt from stackblitz', 'receipt from stripe',
  'invoice from stackblitz', 'payment to stackblitz', 'charge from stackblitz',
  
  // Service-specific PAYMENT patterns
  'kick payment', 'kick subscription payment', 'kick supporter payment',
  'spotify payment', 'spotify premium payment', 'spotify subscription',
  'netflix payment', 'netflix subscription payment',
  'github payment', 'github pro payment', 'github subscription',
  'stackblitz payment', 'stackblitz pro payment', 'bolt pro payment',
  'tinder payment', 'tinder plus payment', 'tinder gold payment',
  
  // Payment processor patterns
  'stripe payment receipt', 'paypal payment receipt', 'google play receipt',
  'app store receipt', 'subscription charged', 'auto-pay successful',
  
  // Multi-language payment confirmations
  'إيصال دفع', 'تأكيد الدفع', 'دفع ناجح', 'اشتراك مجدد',
  'reçu de paiement', 'confirmation de paiement', 'paiement réussi',
  'recibo de pago', 'confirmación de pago', 'pago exitoso'
];

// 💰 ENHANCED: More comprehensive financial terms
const FINANCIAL_TERMS = [
  // Actual payment processing
  'charged', 'billed', 'paid', 'payment processed', 'successfully charged',
  'amount charged', 'total charged', 'payment authorized', 'transaction approved',
  'charge processed', 'billing successful', 'payment confirmed', 'payment complete',
  'auto-pay successful', 'autopay processed', 'recurring charge', 'subscription fee',
  'monthly charge', 'annual fee', 'billing amount', 'renewal fee',
  
  // Currency and amounts
  '$', '€', '£', 'USD', 'EUR', 'GBP', 'MAD', 'DH', 'dirham',
  'amount', 'total', 'cost', 'fee', 'price', 'subscription cost',
  
  // Payment success indicators
  'payment successful', 'transaction successful', 'billing complete',
  'charge successful', 'auto-renewal processed', 'subscription active',
  'receipt', 'invoice', 'bill', 'statement', // Basic financial terms
  
  // Multi-language payment terms
  'مبلغ مدفوع', 'رسوم مدفوعة', 'اشتراك نشط',
  'montant payé', 'frais payés', 'abonnement actif',
  'cantidad pagada', 'tarifa pagada', 'suscripción activa'
];

// 🚫 STRICT EXCLUSIONS: Only block obvious non-payments
const SMART_EXCLUSIONS = [
  // Refunds and cancellations (NEVER allow these)
  {
    patterns: ['refund', 'refunded', 'money back', 'cancelled', 'canceled', 'termination', 'terminated'],
    allowIf: [] // NEVER allow refunds as subscription receipts
  },
  
  // Account management (not payments) - but allow if payment context
  {
    patterns: ['welcome', 'getting started', 'account created', 'sign up', 'registration'],
    allowIf: ['payment', 'charged', 'billed', 'subscription fee', 'receipt']
  },
  
  // Security and verification (not payments) - but allow if payment context
  {
    patterns: ['password reset', 'security alert', 'verification code', 'two-factor', 'login attempt'],
    allowIf: ['payment receipt', 'billing receipt', 'receipt']
  },
  
  // Marketing and promotions (not payments) - but allow if payment context
  {
    patterns: ['promotional', 'marketing', 'newsletter', 'offer', 'deal', 'discount', 'sale'],
    allowIf: ['payment receipt', 'subscription payment', 'billing receipt', 'receipt']
  },
  
  // Trial starts (not payments) - but allow if payment context
  {
    patterns: ['free trial started', 'trial activated', 'trial begins'],
    allowIf: ['payment', 'charged', 'converted to paid', 'trial ended', 'receipt']
  }
];

// ❌ HARD EXCLUSIONS: Absolutely never allow these
const HARD_EXCLUSIONS = [
  // Refunds and reversals
  'refund', 'refunded', 'money back', 'chargeback', 'reversal', 'credit issued',
  'cancelled subscription', 'subscription cancelled', 'account closed',
  'service terminated', 'subscription ended', 'plan cancelled',
  
  // Security and fraud
  'spam', 'phishing', 'fraud', 'suspicious activity', 'security breach',
  'unauthorized', 'disputed charge', 'payment failed', 'declined',
  
  // Multi-language exclusions
  'استرداد', 'إلغاء', 'احتيال', 'نشاط مشبوه',
  'remboursement', 'annulation', 'fraude', 'activité suspecte',
  'reembolso', 'cancelación', 'fraude', 'actividad sospechosa'
];

// 🔍 ENHANCED SERVICES: Better StackBlitz detection
const VERIFIED_SERVICES = {
  stackblitz: { 
    name: 'StackBlitz Pro', 
    category: 'Development',
    domains: ['stackblitz.com', 'stripe.com'],
    keywords: ['stackblitz', 'stackblitz pro', 'bolt pro', 'stackblitz inc'],
    patterns: [
      /stackblitz(?!.*refund)/i,
      /bolt pro(?!.*refund)/i,
      /receipt.*stackblitz/i,
      /invoice.*stackblitz/i,
      /stackblitz.*inc/i
    ]
  },
  kick: { 
    name: 'Kick.com', 
    category: 'Streaming',
    domains: ['kick.com'],
    keywords: ['kick', 'kick.com', 'kick subscription', 'kick premium', 'kick supporter'],
    patterns: [/kick(?!.*refund)/i]
  },
  spotify: { 
    name: 'Spotify', 
    category: 'Music',
    domains: ['spotify.com'],
    keywords: ['spotify', 'spotify premium', 'spotify family', 'spotify individual'],
    patterns: [/spotify(?!.*refund)/i]
  },
  tinder: { 
    name: 'Tinder', 
    category: 'Dating',
    domains: ['tinder.com', 'gotinder.com'],
    keywords: ['tinder', 'tinder plus', 'tinder gold', 'tinder platinum'],
    patterns: [/tinder(?!.*refund)/i]
  },
  netflix: { 
    name: 'Netflix', 
    category: 'Entertainment',
    domains: ['netflix.com'],
    keywords: ['netflix', 'netflix subscription', 'netflix plan'],
    patterns: [/netflix(?!.*refund)/i]
  },
  github: { 
    name: 'GitHub', 
    category: 'Development',
    domains: ['github.com'],
    keywords: ['github', 'github pro', 'github copilot', 'github team'],
    patterns: [/github(?!.*refund)/i]
  },
  adobe: {
    name: 'Adobe Creative Cloud',
    category: 'Design',
    domains: ['adobe.com'],
    keywords: ['adobe', 'creative cloud', 'photoshop', 'illustrator'],
    patterns: [/adobe(?!.*refund)/i]
  },
  microsoft: {
    name: 'Microsoft 365',
    category: 'Productivity',
    domains: ['microsoft.com', 'office.com'],
    keywords: ['microsoft', '365', 'office', 'outlook'],
    patterns: [/(?:microsoft|office|365)(?!.*refund)/i]
  }
};

// 💰 CURRENCY PATTERNS: Extract amounts with context validation
const CURRENCY_PATTERNS = [
  { pattern: /\$(\d+(?:\.\d{2})?)/g, currency: 'USD' },
  { pattern: /(\d+(?:\.\d{2})?)\s*USD/gi, currency: 'USD' },
  { pattern: /€(\d+(?:[,\.]\d{2})?)/g, currency: 'EUR' },
  { pattern: /(\d+(?:[,\.]\d{2})?)\s*EUR/gi, currency: 'EUR' },
  { pattern: /£(\d+(?:\.\d{2})?)/g, currency: 'GBP' },
  { pattern: /(\d+(?:\.\d{2})?)\s*GBP/gi, currency: 'GBP' },
  { pattern: /(\d+(?:[,\.]\d{2})?)\s*(?:MAD|DH|dirham)/gi, currency: 'MAD' },
  { pattern: /(?:MAD|DH)\s*(\d+(?:[,\.]\d{2})?)/gi, currency: 'MAD' },
  { pattern: /(\d+(?:[,\.]\d{2})?)\s*(?:SAR|ريال)/gi, currency: 'SAR' },
  { pattern: /(\d+(?:[,\.]\d{2})?)\s*(?:AED|درهم)/gi, currency: 'AED' },
  { pattern: /¥(\d+(?:[,\.]\d{2})?)/g, currency: 'JPY' },
  { pattern: /₹(\d+(?:[,\.]\d{2})?)/g, currency: 'INR' }
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
      console.log(`🗓️ Starting ENHANCED StackBlitz-FRIENDLY processing for ${year} (user: ${this.userId})`);
      
      const isAuthorized = await this.tokenManager.isGmailAuthorized();
      if (!isAuthorized) {
        throw new Error('Gmail not authorized for this user');
      }

      const accessToken = await this.tokenManager.getValidAccessToken();
      if (!accessToken) {
        throw new Error('Unable to obtain valid access token');
      }

      // 🎯 ENHANCED: Better search queries for StackBlitz and other services
      const searchQueries = [
        // Core payment receipt searches (exclude refunds)
        `subject:"receipt" -refund -cancelled after:${year}/01/01 before:${year + 1}/01/01`,
        `subject:"payment receipt" -refund -cancelled after:${year}/01/01 before:${year + 1}/01/01`,
        `subject:"payment confirmation" -refund -cancelled after:${year}/01/01 before:${year + 1}/01/01`,
        `subject:"billing receipt" -refund -cancelled after:${year}/01/01 before:${year + 1}/01/01`,
        `subject:"invoice" -refund -cancelled after:${year}/01/01 before:${year + 1}/01/01`,
        
        // StackBlitz specific searches (enhanced)
        `from:stackblitz.com -refund -cancelled after:${year}/01/01 before:${year + 1}/01/01`,
        `from:stripe.com "stackblitz" -refund -cancelled after:${year}/01/01 before:${year + 1}/01/01`,
        `"stackblitz inc" receipt -refund -cancelled after:${year}/01/01 before:${year + 1}/01/01`,
        `"bolt pro" -refund -cancelled after:${year}/01/01 before:${year + 1}/01/01`,
        
        // Other service-specific searches
        `from:kick.com payment -refund -cancelled after:${year}/01/01 before:${year + 1}/01/01`,
        `from:spotify.com payment -refund -cancelled after:${year}/01/01 before:${year + 1}/01/01`,
        `from:tinder.com payment -refund -cancelled after:${year}/01/01 before:${year + 1}/01/01`,
        `from:netflix.com payment -refund -cancelled after:${year}/01/01 before:${year + 1}/01/01`,
        `from:github.com payment -refund -cancelled after:${year}/01/01 before:${year + 1}/01/01`,
        
        // Payment processor searches (enhanced for StackBlitz)
        `from:stripe.com receipt -refund -cancelled after:${year}/01/01 before:${year + 1}/01/01`,
        `from:paypal.com receipt -refund -cancelled after:${year}/01/01 before:${year + 1}/01/01`,
        
        // Subscription-specific terms
        `"subscription renewed" -refund -cancelled after:${year}/01/01 before:${year + 1}/01/01`,
        `"auto-renewal successful" -refund -cancelled after:${year}/01/01 before:${year + 1}/01/01`,
        `"payment processed" -refund -cancelled after:${year}/01/01 before:${year + 1}/01/01`,
        
        // App store receipts
        `"google play" receipt -refund -cancelled after:${year}/01/01 before:${year + 1}/01/01`,
        `"app store" receipt -refund -cancelled after:${year}/01/01 before:${year + 1}/01/01`
      ];

      const detectedSubscriptions: DetectedSubscription[] = [];
      const processedEmailIds = new Set<string>();
      
      for (const searchQuery of searchQueries) {
        console.log(`🔍 ENHANCED search (${year}): ${searchQuery.split(' ')[0]}...`);
        
        const response = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}&maxResults=100`,
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
            const subscription = this.validatePaymentEmailEnhanced(email, year);
            
            if (subscription) {
              const isDuplicate = detectedSubscriptions.some(existing => 
                existing.serviceName === subscription.serviceName && 
                Math.abs(existing.amount - subscription.amount) < 0.01 &&
                existing.currency === subscription.currency
              );
              
              if (!isDuplicate) {
                detectedSubscriptions.push(subscription);
                console.log(`✅ VERIFIED PAYMENT (${year}): ${subscription.serviceName} - ${subscription.currency} ${subscription.amount} (confidence: ${subscription.confidence})`);
              }
            }
          } catch (error) {
            console.error(`❌ Error processing email ${message.id}:`, error);
          }
        }
      }

      console.log(`🎯 ENHANCED detection (${year}) found ${detectedSubscriptions.length} VERIFIED payments for user: ${this.userId}`);

      await this.saveSubscriptionsForYear(detectedSubscriptions, year);
      return detectedSubscriptions;
    } catch (error) {
      console.error(`❌ Error processing ${year} emails for user ${this.userId}:`, error);
      throw error;
    }
  }

  /**
   * 🛡️ ENHANCED VALIDATION - Better StackBlitz detection while blocking refunds
   */
  private validatePaymentEmailEnhanced(email: any, year: number): DetectedSubscription | null {
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

    console.log(`🛡️ ENHANCED validation (${year}): "${subject}" from "${from}"`);

    // STEP 1: IMMEDIATE HARD EXCLUSIONS (refunds, cancellations, etc.)
    for (const exclusion of HARD_EXCLUSIONS) {
      if (fullText.includes(exclusion) || subject.toLowerCase().includes(exclusion)) {
        console.log(`❌ REJECTED: Hard exclusion detected: "${exclusion}"`);
        return null;
      }
    }

    // STEP 2: Check for payment receipt keywords (ENHANCED - more flexible)
    const hasPaymentKeyword = RECEIPT_KEYWORDS.some(keyword => 
      subject.toLowerCase().includes(keyword) || 
      fullText.includes(keyword) ||
      from.toLowerCase().includes(keyword)
    );
    
    if (!hasPaymentKeyword) {
      console.log(`❌ REJECTED: No payment receipt keyword found`);
      console.log(`📋 Subject: "${subject}"`);
      console.log(`👤 From: "${from}"`);
      return null;
    }

    // STEP 3: Enhanced smart exclusions (context-aware)
    const exclusionResult = this.checkEnhancedExclusions(fullText, subject);
    if (exclusionResult) {
      console.log(`❌ REJECTED: Enhanced exclusion: ${exclusionResult}`);
      return null;
    }

    // STEP 4: Verify financial context (ENHANCED - more flexible)
    const hasPaymentContext = FINANCIAL_TERMS.some(term => 
      fullText.includes(term) || subject.toLowerCase().includes(term) || from.toLowerCase().includes(term)
    );
    
    if (!hasPaymentContext) {
      console.log(`❌ REJECTED: No payment financial context found`);
      return null;
    }

    // STEP 5: Extract and validate amount (more flexible)
    const amount = this.extractAmountEnhanced(fullText, body, subject);
    if (!amount || amount.value < 0.5 || amount.value > 2000) {
      console.log(`❌ REJECTED: Invalid payment amount: ${amount?.value} ${amount?.currency}`);
      return null;
    }

    // STEP 6: Identify service (ENHANCED for StackBlitz)
    const serviceInfo = this.identifyServiceEnhanced(subject, from, fullText);
    if (!serviceInfo) {
      console.log(`❌ REJECTED: Unknown or invalid service`);
      return null;
    }

    // STEP 7: Verify subscription context (more flexible)
    if (!this.hasValidSubscriptionContextEnhanced(fullText, subject, serviceInfo)) {
      console.log(`❌ REJECTED: No valid subscription context`);
      return null;
    }

    // 📧 LOG VERIFIED PAYMENT EMAIL
    console.log(`\n💳 ===== VERIFIED PAYMENT EMAIL =====`);
    console.log(`📋 SUBJECT: ${subject}`);
    console.log(`👤 FROM: ${from}`);
    console.log(`📄 BODY: ${body.substring(0, 500)}${body.length > 500 ? '...' : ''}`);
    console.log(`💰 AMOUNT: ${amount.currency} ${amount.value}`);
    console.log(`🏢 SERVICE: ${serviceInfo.name} (${serviceInfo.category})`);
    console.log(`💳 =====================================\n`);

    // Calculate confidence with enhanced criteria
    let confidence = 0.85; // Start with good confidence
    
    // Boost for verified services
    if (Object.values(VERIFIED_SERVICES).some(s => s.name === serviceInfo.name)) {
      confidence += 0.1;
    }
    
    // Boost for clear payment keywords in subject
    if (['receipt', 'payment', 'invoice', 'billing'].some(keyword => 
      subject.toLowerCase().includes(keyword))) {
      confidence += 0.05;
    }
    
    // Boost for payment success indicators
    if (fullText.includes('successfully charged') || fullText.includes('payment processed')) {
      confidence += 0.03;
    }

    // Special boost for StackBlitz (known service)
    if (serviceInfo.name.toLowerCase().includes('stackblitz')) {
      confidence += 0.05;
    }

    const languageInfo = this.detectLanguageAndRegion(fullText, from);
    const billingCycle = this.determineBillingCycle(fullText, languageInfo.language);
    const nextPaymentDate = this.calculateNextPaymentDate(billingCycle);
    const status = this.determineStatus(fullText, languageInfo.language);

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
      receiptType: 'payment_receipt',
      language: languageInfo.language,
      region: languageInfo.region,
      yearProcessed: year
    };

    console.log(`✅ VERIFIED PAYMENT (${year}): ${serviceInfo.name} - ${amount.currency} ${amount.value} (confidence: ${confidence.toFixed(2)})`);
    return subscription;
  }

  /**
   * Enhanced exclusions with stricter context checking
   */
  private checkEnhancedExclusions(fullText: string, subject: string): string | null {
    for (const exclusionRule of SMART_EXCLUSIONS) {
      const matchedPattern = exclusionRule.patterns.find(pattern => 
        fullText.includes(pattern) || subject.toLowerCase().includes(pattern)
      );
      
      if (matchedPattern) {
        // For refunds and cancellations, NEVER allow (empty allowIf array)
        if (exclusionRule.allowIf.length === 0) {
          return `${matchedPattern} (never allowed)`;
        }
        
        const hasAllowCondition = exclusionRule.allowIf.some(condition => 
          fullText.includes(condition) || subject.toLowerCase().includes(condition)
        );
        
        if (!hasAllowCondition) {
          return matchedPattern;
        } else {
          console.log(`🔄 EXCLUSION OVERRIDE: "${matchedPattern}" allowed due to payment context`);
        }
      }
    }
    
    return null;
  }

  /**
   * ENHANCED amount extraction - more flexible for StackBlitz receipts
   */
  private extractAmountEnhanced(text: string, body: string, subject: string): { value: number; currency: string } | null {
    console.log(`💰 ENHANCED payment amount extraction...`);
    
    for (const currencyPattern of CURRENCY_PATTERNS) {
      const matches = [...text.matchAll(currencyPattern.pattern)];
      for (const match of matches) {
        const amount = this.parseAmount(match[1]);
        
        if (this.validateAmountForCurrency(amount, currencyPattern.currency)) {
          console.log(`✅ VALID PAYMENT ${currencyPattern.currency} amount: ${amount}`);
          return { value: amount, currency: currencyPattern.currency };
        }
      }
    }
    
    // Try to find amounts in the subject line too
    for (const currencyPattern of CURRENCY_PATTERNS) {
      const matches = [...subject.matchAll(currencyPattern.pattern)];
      for (const match of matches) {
        const amount = this.parseAmount(match[1]);
        
        if (this.validateAmountForCurrency(amount, currencyPattern.currency)) {
          console.log(`✅ VALID PAYMENT ${currencyPattern.currency} amount from subject: ${amount}`);
          return { value: amount, currency: currencyPattern.currency };
        }
      }
    }
    
    console.log(`❌ NO VALID PAYMENT AMOUNT FOUND`);
    return null;
  }

  /**
   * ENHANCED service identification - better StackBlitz detection
   */
  private identifyServiceEnhanced(subject: string, from: string, fullText: string): { name: string; category: string } | null {
    console.log(`🔍 ENHANCED service identification...`);
    
    // Check verified services with enhanced patterns
    for (const [key, service] of Object.entries(VERIFIED_SERVICES)) {
      // Check domain match
      const domainMatch = service.domains.some(domain => from.toLowerCase().includes(domain));
      
      // Check keyword match (enhanced for StackBlitz)
      const keywordMatch = service.keywords.some(keyword => {
        const hasKeyword = subject.toLowerCase().includes(keyword) || 
                          fullText.includes(keyword) ||
                          from.toLowerCase().includes(keyword);
        
        // Exclude if it's clearly a refund/cancellation
        const isRefund = fullText.includes('refund') || fullText.includes('cancelled') || 
                         subject.toLowerCase().includes('refund') || subject.toLowerCase().includes('cancelled');
        
        return hasKeyword && !isRefund;
      });
      
      // Check pattern match (enhanced patterns)
      const patternMatch = service.patterns.some(pattern => 
        pattern.test(`${subject} ${from} ${fullText}`)
      );
      
      if ((domainMatch || keywordMatch || patternMatch) && 
          !fullText.includes('refund') && !fullText.includes('cancelled')) {
        console.log(`✅ VERIFIED service: ${service.name} (enhanced detection)`);
        return { name: service.name, category: service.category };
      }
    }
    
    // Enhanced extraction from payment processor emails
    if ((from.includes('stripe.com') || from.includes('paypal.com')) && 
        !fullText.includes('refund') && !fullText.includes('cancelled')) {
      const extracted = this.extractServiceFromPaymentProcessorEnhanced(subject, fullText, from);
      if (extracted) {
        console.log(`✅ EXTRACTED service: ${extracted.name} (payment processor)`);
        return extracted;
      }
    }
    
    console.log(`❌ NO VERIFIED service found`);
    return null;
  }

  /**
   * ENHANCED subscription context validation
   */
  private hasValidSubscriptionContextEnhanced(fullText: string, subject: string, serviceInfo: any): boolean {
    const subscriptionTerms = [
      'subscription', 'recurring', 'monthly', 'annual', 'yearly', 'plan', 'membership',
      'premium', 'pro', 'plus', 'gold', 'vip', 'upgrade', 'renewal', 'auto-pay',
      'service fee', 'billing cycle', 'subscription fee', 'receipt', 'invoice', 'payment'
    ];
    
    const hasSubscriptionTerms = subscriptionTerms.some(term => 
      fullText.includes(term) || subject.toLowerCase().includes(term)
    );
    
    // For known subscription services, be more lenient
    const isKnownSubscriptionService = Object.values(VERIFIED_SERVICES).some(s => s.name === serviceInfo.name);
    
    // For StackBlitz specifically, be very lenient since it's a known dev tool subscription
    const isStackBlitz = serviceInfo.name.toLowerCase().includes('stackblitz');
    
    return hasSubscriptionTerms || isKnownSubscriptionService || isStackBlitz;
  }

  /**
   * ENHANCED service extraction from payment processors
   */
  private extractServiceFromPaymentProcessorEnhanced(subject: string, fullText: string, from: string): { name: string; category: string } | null {
    // Only extract if it's clearly a payment (not refund)
    if (fullText.includes('refund') || fullText.includes('cancelled') || 
        subject.toLowerCase().includes('refund') || subject.toLowerCase().includes('cancelled')) {
      return null;
    }
    
    // Enhanced patterns for StackBlitz and other services
    const patterns = [
      /(?:receipt|payment|charge|invoice).*?(?:from|for|to)\s+([A-Z][a-zA-Z\s,\.]+?)(?:\s|$|#|\.|,)/i,
      /([A-Z][a-zA-Z\s]+?)\s+(?:subscription|payment|charge|receipt|inc\.?)/i,
      /your\s+(?:receipt|payment|charge|invoice).*?from\s+([A-Z][a-zA-Z\s]+?)(?:\s|$|#|\.|,)/i,
      /([A-Z][a-zA-Z\s]+?),?\s+Inc\.?/i, // For "StackBlitz, Inc."
      /(StackBlitz)/i // Direct StackBlitz match
    ];
    
    for (const pattern of patterns) {
      const match = subject.match(pattern) || fullText.match(pattern);
      if (match && match[1]) {
        let serviceName = match[1].trim().replace(/[,\.#].*$/, '');
        
        // Special handling for StackBlitz
        if (serviceName.toLowerCase().includes('stackblitz')) {
          return {
            name: 'StackBlitz Pro',
            category: 'Development'
          };
        }
        
        if (serviceName.length > 2 && serviceName.length < 50) {
          return {
            name: serviceName,
            category: 'Digital Service'
          };
        }
      }
    }
    
    return null;
  }

  // Helper methods (same as before but enhanced)
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
      'AED': { min: 2, max: 2000 },
      'JPY': { min: 50, max: 50000 },
      'INR': { min: 25, max: 40000 }
    };
    
    const range = ranges[currency] || { min: 0.5, max: 500 };
    return amount >= range.min && amount <= range.max;
  }

  private detectLanguageAndRegion(text: string, from: string): { language: string; region: string } {
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

  private determineBillingCycle(text: string, language: string): 'monthly' | 'yearly' | 'weekly' {
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

  private determineStatus(text: string, language: string): 'active' | 'trial' | 'cancelled' {
    if (text.includes('trial') || text.includes('free trial')) return 'trial';
    if (text.includes('cancelled') || text.includes('terminated') || text.includes('refund')) return 'cancelled';
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
          console.log(`✅ Added VERIFIED payment (${year}): ${subscription.serviceName}`);
        } else {
          const docRef = doc(db, 'subscriptions', existingDocs.docs[0].id);
          await updateDoc(docRef, {
            ...subscription,
            yearProcessed: year,
            updatedAt: new Date().toISOString()
          });
          console.log(`🔄 Updated VERIFIED payment (${year}): ${subscription.serviceName}`);
        }
      } catch (error) {
        console.error(`❌ Error saving subscription ${subscription.serviceName}:`, error);
      }
    }
  }
}