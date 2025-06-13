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

// 🎯 BALANCED: Real receipt keywords that actual services use
const RECEIPT_KEYWORDS = [
  // Core receipt patterns (what real services actually send)
  'receipt', 'your receipt', 'payment receipt', 'billing receipt', 'subscription receipt',
  'invoice', 'your invoice', 'billing invoice', 'subscription invoice',
  'payment confirmation', 'billing confirmation', 'subscription confirmation',
  'payment successful', 'payment complete', 'payment processed',
  'charge confirmation', 'transaction confirmation', 'purchase confirmation',
  'thank you for your payment', 'payment received', 'subscription renewed',
  'auto-renewal', 'recurring payment', 'subscription fee',
  
  // Service-specific patterns (real examples)
  'kick receipt', 'kick payment', 'kick subscription',
  'spotify receipt', 'spotify payment', 'spotify premium',
  'netflix receipt', 'netflix payment', 'netflix subscription',
  'github receipt', 'github payment', 'github pro',
  'stackblitz receipt', 'stackblitz payment', 'stackblitz pro',
  'tinder receipt', 'tinder payment', 'tinder plus', 'tinder gold',
  
  // Payment processor patterns
  'stripe receipt', 'paypal receipt', 'google play receipt', 'app store receipt',
  
  // Multi-language
  'إيصال', 'فاتورة', 'تأكيد الدفع', 'دفع ناجح',
  'reçu', 'facture', 'confirmation de paiement', 'paiement réussi',
  'recibo', 'factura', 'confirmación de pago', 'pago exitoso'
];

// 💰 BALANCED: Financial terms that indicate real payments
const FINANCIAL_TERMS = [
  // Payment processing (what real receipts contain)
  'amount', 'total', 'charged', 'billed', 'paid', 'payment', 'cost', 'fee', 'price',
  'subscription fee', 'monthly charge', 'annual fee', 'billing amount',
  'payment processed', 'successfully charged', 'amount charged', 'total charged',
  'payment authorized', 'transaction approved', 'charge processed',
  'auto-pay', 'autopay', 'recurring charge', 'renewal fee',
  
  // Currency symbols and amounts
  '$', '€', '£', 'USD', 'EUR', 'GBP', 'MAD', 'DH', 'dirham',
  
  // Payment success indicators
  'payment successful', 'payment complete', 'successfully processed',
  'transaction successful', 'billing successful', 'payment confirmed',
  
  // Multi-language financial terms
  'مبلغ', 'دفع', 'رسوم', 'تكلفة', 'سعر',
  'montant', 'paiement', 'frais', 'coût', 'prix',
  'cantidad', 'pago', 'tarifa', 'costo', 'precio'
];

// 🚫 SMART EXCLUSIONS: Block obvious non-payment emails but allow edge cases
const SMART_EXCLUSIONS = [
  // Only exclude if these appear WITHOUT payment context
  {
    patterns: ['welcome', 'getting started', 'account created', 'sign up'],
    allowIf: ['receipt', 'payment', 'charged', 'billed', 'invoice']
  },
  {
    patterns: ['password reset', 'security alert', 'verification code', 'two-factor'],
    allowIf: ['receipt', 'payment', 'subscription']
  },
  {
    patterns: ['shipping', 'delivery', 'tracking', 'order shipped'],
    allowIf: ['subscription', 'recurring', 'monthly']
  },
  {
    patterns: ['promotional', 'marketing', 'newsletter', 'offer', 'deal'],
    allowIf: ['receipt', 'payment', 'subscription', 'renewal']
  },
  {
    patterns: ['free trial started', 'trial activated'],
    allowIf: ['payment', 'charged', 'billed', 'converted']
  },
  {
    patterns: ['support ticket', 'help request', 'customer service'],
    allowIf: ['receipt', 'payment', 'billing']
  }
];

// ❌ HARD EXCLUSIONS: Never allow these
const HARD_EXCLUSIONS = [
  'spam', 'phishing', 'fraud', 'suspicious activity', 'security breach',
  'احتيال', 'نشاط مشبوه', 'fraude', 'activité suspecte'
];

// 🔍 VERIFIED SERVICES: Known subscription services with flexible patterns
const VERIFIED_SERVICES = {
  kick: { 
    name: 'Kick.com', 
    category: 'Streaming',
    domains: ['kick.com'],
    keywords: ['kick', 'kick.com', 'kick subscription', 'kick premium', 'kick supporter'],
    patterns: [/kick/i]
  },
  spotify: { 
    name: 'Spotify', 
    category: 'Music',
    domains: ['spotify.com'],
    keywords: ['spotify', 'spotify premium', 'spotify family', 'spotify individual'],
    patterns: [/spotify/i]
  },
  tinder: { 
    name: 'Tinder', 
    category: 'Dating',
    domains: ['tinder.com', 'gotinder.com'],
    keywords: ['tinder', 'tinder plus', 'tinder gold', 'tinder platinum'],
    patterns: [/tinder/i]
  },
  netflix: { 
    name: 'Netflix', 
    category: 'Entertainment',
    domains: ['netflix.com'],
    keywords: ['netflix', 'netflix subscription', 'netflix plan'],
    patterns: [/netflix/i]
  },
  github: { 
    name: 'GitHub', 
    category: 'Development',
    domains: ['github.com'],
    keywords: ['github', 'github pro', 'github copilot', 'github team'],
    patterns: [/github/i]
  },
  stackblitz: { 
    name: 'StackBlitz', 
    category: 'Development',
    domains: ['stackblitz.com', 'stripe.com'],
    keywords: ['stackblitz', 'stackblitz pro', 'bolt pro'],
    patterns: [/stackblitz|bolt pro/i]
  },
  adobe: {
    name: 'Adobe Creative Cloud',
    category: 'Design',
    domains: ['adobe.com'],
    keywords: ['adobe', 'creative cloud', 'photoshop', 'illustrator'],
    patterns: [/adobe/i]
  },
  microsoft: {
    name: 'Microsoft 365',
    category: 'Productivity',
    domains: ['microsoft.com', 'office.com'],
    keywords: ['microsoft', '365', 'office', 'outlook'],
    patterns: [/microsoft|office|365/i]
  }
};

// 💰 FLEXIBLE CURRENCY PATTERNS: Extract amounts with reasonable context
const CURRENCY_PATTERNS = [
  // USD patterns
  { pattern: /\$(\d+(?:\.\d{2})?)/g, currency: 'USD' },
  { pattern: /(\d+(?:\.\d{2})?)\s*USD/gi, currency: 'USD' },
  
  // EUR patterns
  { pattern: /€(\d+(?:[,\.]\d{2})?)/g, currency: 'EUR' },
  { pattern: /(\d+(?:[,\.]\d{2})?)\s*EUR/gi, currency: 'EUR' },
  
  // GBP patterns
  { pattern: /£(\d+(?:\.\d{2})?)/g, currency: 'GBP' },
  { pattern: /(\d+(?:\.\d{2})?)\s*GBP/gi, currency: 'GBP' },
  
  // MAD patterns (Moroccan Dirham)
  { pattern: /(\d+(?:[,\.]\d{2})?)\s*(?:MAD|DH|dirham)/gi, currency: 'MAD' },
  { pattern: /(?:MAD|DH)\s*(\d+(?:[,\.]\d{2})?)/gi, currency: 'MAD' },
  
  // Other currencies
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
      console.log(`🗓️ Starting BALANCED email processing for ${year} (user: ${this.userId})`);
      
      const isAuthorized = await this.tokenManager.isGmailAuthorized();
      if (!isAuthorized) {
        throw new Error('Gmail not authorized for this user');
      }

      const accessToken = await this.tokenManager.getValidAccessToken();
      if (!accessToken) {
        throw new Error('Unable to obtain valid access token');
      }

      // 🎯 BALANCED: Search for real receipt patterns
      const searchQueries = [
        // Core receipt searches
        `subject:receipt after:${year}/01/01 before:${year + 1}/01/01`,
        `subject:invoice after:${year}/01/01 before:${year + 1}/01/01`,
        `subject:"payment confirmation" after:${year}/01/01 before:${year + 1}/01/01`,
        `subject:"payment successful" after:${year}/01/01 before:${year + 1}/01/01`,
        `subject:subscription after:${year}/01/01 before:${year + 1}/01/01`,
        
        // Service-specific searches
        `from:kick.com after:${year}/01/01 before:${year + 1}/01/01`,
        `from:spotify.com after:${year}/01/01 before:${year + 1}/01/01`,
        `from:tinder.com after:${year}/01/01 before:${year + 1}/01/01`,
        `from:netflix.com after:${year}/01/01 before:${year + 1}/01/01`,
        `from:github.com after:${year}/01/01 before:${year + 1}/01/01`,
        `from:stackblitz.com after:${year}/01/01 before:${year + 1}/01/01`,
        `from:adobe.com after:${year}/01/01 before:${year + 1}/01/01`,
        `from:microsoft.com after:${year}/01/01 before:${year + 1}/01/01`,
        
        // Payment processor searches
        `from:stripe.com receipt after:${year}/01/01 before:${year + 1}/01/01`,
        `from:paypal.com receipt after:${year}/01/01 before:${year + 1}/01/01`,
        
        // Subscription-specific terms
        `"subscription renewed" after:${year}/01/01 before:${year + 1}/01/01`,
        `"auto-renewal" after:${year}/01/01 before:${year + 1}/01/01`,
        `"recurring payment" after:${year}/01/01 before:${year + 1}/01/01`,
        
        // App store receipts
        `"google play" receipt after:${year}/01/01 before:${year + 1}/01/01`,
        `"app store" receipt after:${year}/01/01 before:${year + 1}/01/01`
      ];

      const detectedSubscriptions: DetectedSubscription[] = [];
      const processedEmailIds = new Set<string>();
      
      for (const searchQuery of searchQueries) {
        console.log(`🔍 BALANCED search (${year}): ${searchQuery}`);
        
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
            const subscription = this.validateReceiptEmailBalanced(email, year);
            
            if (subscription) {
              const isDuplicate = detectedSubscriptions.some(existing => 
                existing.serviceName === subscription.serviceName && 
                Math.abs(existing.amount - subscription.amount) < 0.01 &&
                existing.currency === subscription.currency
              );
              
              if (!isDuplicate) {
                detectedSubscriptions.push(subscription);
                console.log(`✅ BALANCED RECEIPT (${year}): ${subscription.serviceName} - ${subscription.currency} ${subscription.amount} (confidence: ${subscription.confidence})`);
              }
            }
          } catch (error) {
            console.error(`❌ Error processing email ${message.id}:`, error);
          }
        }
      }

      console.log(`🎯 BALANCED detection (${year}) found ${detectedSubscriptions.length} valid receipts for user: ${this.userId}`);

      await this.saveSubscriptionsForYear(detectedSubscriptions, year);
      return detectedSubscriptions;
    } catch (error) {
      console.error(`❌ Error processing ${year} emails for user ${this.userId}:`, error);
      throw error;
    }
  }

  /**
   * 🎯 BALANCED validation - catches real receipts while avoiding false positives
   */
  private validateReceiptEmailBalanced(email: any, year: number): DetectedSubscription | null {
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

    console.log(`🎯 BALANCED validation (${year}): "${subject}" from "${from}"`);

    // STEP 1: Check for receipt keywords (more flexible)
    const hasReceiptKeyword = RECEIPT_KEYWORDS.some(keyword => 
      subject.toLowerCase().includes(keyword) || 
      fullText.includes(keyword) ||
      from.toLowerCase().includes(keyword)
    );
    
    if (!hasReceiptKeyword) {
      console.log(`❌ REJECTED: No receipt keyword found`);
      return null;
    }

    // STEP 2: Smart exclusions (context-aware)
    const exclusionResult = this.checkSmartExclusions(fullText, subject);
    if (exclusionResult) {
      console.log(`❌ REJECTED: Smart exclusion: ${exclusionResult}`);
      return null;
    }

    // STEP 3: Hard exclusions (never allow)
    for (const exclusion of HARD_EXCLUSIONS) {
      if (fullText.includes(exclusion) || subject.toLowerCase().includes(exclusion)) {
        console.log(`❌ REJECTED: Hard exclusion: ${exclusion}`);
        return null;
      }
    }

    // STEP 4: Check for financial context
    const hasFinancialContext = FINANCIAL_TERMS.some(term => 
      fullText.includes(term) || subject.toLowerCase().includes(term)
    );
    
    if (!hasFinancialContext) {
      console.log(`❌ REJECTED: No financial context found`);
      return null;
    }

    // STEP 5: Extract amount
    const amount = this.extractAmountBalanced(fullText, body, subject);
    if (!amount || amount.value < 0.5 || amount.value > 2000) {
      console.log(`❌ REJECTED: Invalid amount: ${amount?.value} ${amount?.currency}`);
      return null;
    }

    // STEP 6: Identify service
    const serviceInfo = this.identifyService(subject, from, fullText);
    if (!serviceInfo) {
      console.log(`❌ REJECTED: Unknown service`);
      return null;
    }

    // STEP 7: Check for subscription context (flexible)
    if (!this.hasSubscriptionContext(fullText, subject, serviceInfo)) {
      console.log(`❌ REJECTED: No subscription context`);
      return null;
    }

    // 📧 LOG VALID SUBSCRIPTION EMAIL CONTENT
    console.log(`\n📧 ===== VALID SUBSCRIPTION EMAIL DETECTED =====`);
    console.log(`📋 SUBJECT: ${subject}`);
    console.log(`👤 FROM: ${from}`);
    console.log(`📄 BODY: ${body.substring(0, 500)}${body.length > 500 ? '...' : ''}`);
    console.log(`💰 AMOUNT: ${amount.currency} ${amount.value}`);
    console.log(`🏢 SERVICE: ${serviceInfo.name} (${serviceInfo.category})`);
    console.log(`📧 ===============================================\n`);

    // Calculate confidence
    let confidence = 0.85;
    
    // Boost for verified services
    if (Object.values(VERIFIED_SERVICES).some(s => s.name === serviceInfo.name)) {
      confidence += 0.1;
    }
    
    // Boost for clear receipt keywords in subject
    if (RECEIPT_KEYWORDS.some(keyword => subject.toLowerCase().includes(keyword))) {
      confidence += 0.05;
    }
    
    // Boost for payment success indicators
    if (fullText.includes('payment successful') || fullText.includes('payment complete')) {
      confidence += 0.03;
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

    console.log(`✅ BALANCED RECEIPT (${year}): ${serviceInfo.name} - ${amount.currency} ${amount.value} (confidence: ${confidence.toFixed(2)})`);
    return subscription;
  }

  /**
   * Smart exclusions with context awareness
   */
  private checkSmartExclusions(fullText: string, subject: string): string | null {
    for (const exclusionRule of SMART_EXCLUSIONS) {
      const matchedPattern = exclusionRule.patterns.find(pattern => 
        fullText.includes(pattern) || subject.toLowerCase().includes(pattern)
      );
      
      if (matchedPattern) {
        const hasAllowCondition = exclusionRule.allowIf.some(condition => 
          fullText.includes(condition) || subject.toLowerCase().includes(condition)
        );
        
        if (!hasAllowCondition) {
          return matchedPattern;
        } else {
          console.log(`🔄 EXCLUSION OVERRIDE: "${matchedPattern}" allowed due to context`);
        }
      }
    }
    
    return null;
  }

  /**
   * Balanced amount extraction
   */
  private extractAmountBalanced(text: string, body: string, subject: string): { value: number; currency: string } | null {
    console.log(`💰 BALANCED amount extraction...`);
    
    for (const currencyPattern of CURRENCY_PATTERNS) {
      const matches = [...text.matchAll(currencyPattern.pattern)];
      for (const match of matches) {
        const amount = this.parseAmount(match[1]);
        
        if (this.validateAmountForCurrency(amount, currencyPattern.currency)) {
          console.log(`✅ VALID ${currencyPattern.currency} amount: ${amount}`);
          return { value: amount, currency: currencyPattern.currency };
        }
      }
    }
    
    console.log(`❌ NO VALID AMOUNT FOUND`);
    return null;
  }

  /**
   * Service identification with flexible patterns
   */
  private identifyService(subject: string, from: string, fullText: string): { name: string; category: string } | null {
    console.log(`🔍 Service identification...`);
    
    // Check verified services
    for (const [key, service] of Object.entries(VERIFIED_SERVICES)) {
      // Check domain match
      const domainMatch = service.domains.some(domain => from.toLowerCase().includes(domain));
      
      // Check keyword match
      const keywordMatch = service.keywords.some(keyword => 
        subject.toLowerCase().includes(keyword) || 
        fullText.includes(keyword) ||
        from.toLowerCase().includes(keyword)
      );
      
      // Check pattern match
      const patternMatch = service.patterns.some(pattern => 
        pattern.test(`${subject} ${from} ${fullText}`)
      );
      
      if (domainMatch || keywordMatch || patternMatch) {
        console.log(`✅ IDENTIFIED service: ${service.name}`);
        return { name: service.name, category: service.category };
      }
    }
    
    // Try to extract from payment processor emails
    if (from.includes('stripe.com') || from.includes('paypal.com')) {
      const extracted = this.extractServiceFromPaymentProcessor(subject, fullText);
      if (extracted) {
        console.log(`✅ EXTRACTED service: ${extracted.name}`);
        return extracted;
      }
    }
    
    // Try to extract from subject/sender
    const extracted = this.extractServiceFromEmail(subject, from);
    if (extracted) {
      console.log(`✅ EXTRACTED service: ${extracted.name}`);
      return extracted;
    }
    
    console.log(`❌ UNKNOWN service`);
    return null;
  }

  /**
   * Check for subscription context (flexible)
   */
  private hasSubscriptionContext(fullText: string, subject: string, serviceInfo: any): boolean {
    const subscriptionTerms = [
      'subscription', 'recurring', 'monthly', 'annual', 'yearly', 'plan', 'membership',
      'premium', 'pro', 'plus', 'gold', 'vip', 'upgrade', 'renewal', 'auto-pay',
      'service', 'account', 'billing', 'charge', 'fee'
    ];
    
    const hasSubscriptionTerms = subscriptionTerms.some(term => 
      fullText.includes(term) || subject.toLowerCase().includes(term)
    );
    
    // For known subscription services, be more lenient
    const isKnownSubscriptionService = Object.values(VERIFIED_SERVICES).some(s => s.name === serviceInfo.name);
    
    return hasSubscriptionTerms || isKnownSubscriptionService;
  }

  /**
   * Extract service from payment processor emails
   */
  private extractServiceFromPaymentProcessor(subject: string, fullText: string): { name: string; category: string } | null {
    const patterns = [
      /(?:receipt|payment|charge).*?(?:from|for|to)\s+([A-Z][a-zA-Z\s,\.]+?)(?:\s|$|#|\.|,)/i,
      /([A-Z][a-zA-Z\s]+?)\s+(?:subscription|payment|charge|receipt)/i,
      /your\s+(?:receipt|payment|charge).*?from\s+([A-Z][a-zA-Z\s]+?)(?:\s|$|#|\.|,)/i
    ];
    
    for (const pattern of patterns) {
      const match = subject.match(pattern) || fullText.match(pattern);
      if (match && match[1]) {
        const serviceName = match[1].trim().replace(/[,\.#].*$/, '');
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

  /**
   * Extract service from email content
   */
  private extractServiceFromEmail(subject: string, from: string): { name: string; category: string } | null {
    // Extract from sender domain
    const domainMatch = from.match(/@([^.]+)\./);
    if (domainMatch) {
      const domain = domainMatch[1].toLowerCase();
      
      const commonProviders = ['gmail', 'yahoo', 'outlook', 'hotmail', 'stripe', 'paypal', 'noreply', 'no-reply'];
      if (!commonProviders.includes(domain) && domain.length > 2) {
        return {
          name: domain.charAt(0).toUpperCase() + domain.slice(1),
          category: 'Digital Service'
        };
      }
    }
    
    return null;
  }

  // Helper methods
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
          console.log(`✅ Added BALANCED subscription (${year}): ${subscription.serviceName}`);
        } else {
          const docRef = doc(db, 'subscriptions', existingDocs.docs[0].id);
          await updateDoc(docRef, {
            ...subscription,
            yearProcessed: year,
            updatedAt: new Date().toISOString()
          });
          console.log(`🔄 Updated BALANCED subscription (${year}): ${subscription.serviceName}`);
        }
      } catch (error) {
        console.error(`❌ Error saving subscription ${subscription.serviceName}:`, error);
      }
    }
  }
}