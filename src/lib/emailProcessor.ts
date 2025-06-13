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

// 🎯 SIMPLIFIED: Core payment receipt keywords (more flexible)
const RECEIPT_KEYWORDS = [
  // Core receipt terms
  'receipt', 'payment', 'invoice', 'billing', 'charge', 'transaction',
  'confirmation', 'successful', 'processed', 'complete', 'renewed',
  
  // StackBlitz specific
  'your receipt from', 'receipt from stackblitz', 'stackblitz inc',
  
  // Payment processors
  'stripe', 'paypal', 'payment processor'
];

// 💰 SIMPLIFIED: Basic financial indicators
const FINANCIAL_INDICATORS = [
  '$', '€', '£', 'USD', 'EUR', 'GBP', 'MAD', 'DH',
  'amount', 'total', 'charged', 'billed', 'paid', 'fee', 'cost', 'price'
];

// 🚫 ONLY block obvious refunds and spam
const HARD_EXCLUSIONS = [
  'refund', 'refunded', 'money back', 'chargeback', 'reversal',
  'cancelled subscription', 'subscription cancelled', 'account closed',
  'spam', 'phishing', 'fraud', 'suspicious'
];

// 🏢 VERIFIED SERVICES (simplified)
const KNOWN_SERVICES = {
  stackblitz: {
    name: 'StackBlitz Pro',
    category: 'Development',
    patterns: ['stackblitz', 'bolt pro', 'stackblitz inc']
  },
  kick: {
    name: 'Kick.com',
    category: 'Streaming',
    patterns: ['kick.com', 'kick subscription']
  },
  spotify: {
    name: 'Spotify',
    category: 'Music',
    patterns: ['spotify', 'spotify premium']
  },
  netflix: {
    name: 'Netflix',
    category: 'Entertainment',
    patterns: ['netflix']
  },
  github: {
    name: 'GitHub',
    category: 'Development',
    patterns: ['github', 'github pro']
  }
};

// 💰 CURRENCY PATTERNS
const CURRENCY_PATTERNS = [
  { pattern: /\$(\d+(?:\.\d{2})?)/g, currency: 'USD' },
  { pattern: /(\d+(?:\.\d{2})?)\s*USD/gi, currency: 'USD' },
  { pattern: /€(\d+(?:[,\.]\d{2})?)/g, currency: 'EUR' },
  { pattern: /£(\d+(?:\.\d{2})?)/g, currency: 'GBP' },
  { pattern: /(\d+(?:[,\.]\d{2})?)\s*(?:MAD|DH)/gi, currency: 'MAD' }
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
      console.log(`🗓️ Starting SIMPLIFIED processing for ${year} (user: ${this.userId})`);
      
      const isAuthorized = await this.tokenManager.isGmailAuthorized();
      if (!isAuthorized) {
        throw new Error('Gmail not authorized for this user');
      }

      const accessToken = await this.tokenManager.getValidAccessToken();
      if (!accessToken) {
        throw new Error('Unable to obtain valid access token');
      }

      // 🎯 SIMPLIFIED: Broader search queries
      const searchQueries = [
        // Basic receipt searches
        `receipt after:${year}/01/01 before:${year + 1}/01/01`,
        `payment after:${year}/01/01 before:${year + 1}/01/01`,
        `invoice after:${year}/01/01 before:${year + 1}/01/01`,
        `billing after:${year}/01/01 before:${year + 1}/01/01`,
        
        // StackBlitz specific
        `stackblitz after:${year}/01/01 before:${year + 1}/01/01`,
        `"stackblitz inc" after:${year}/01/01 before:${year + 1}/01/01`,
        `from:stripe.com stackblitz after:${year}/01/01 before:${year + 1}/01/01`,
        
        // Other services
        `kick.com after:${year}/01/01 before:${year + 1}/01/01`,
        `spotify after:${year}/01/01 before:${year + 1}/01/01`,
        `netflix after:${year}/01/01 before:${year + 1}/01/01`,
        `github after:${year}/01/01 before:${year + 1}/01/01`,
        
        // Payment processors
        `from:stripe.com after:${year}/01/01 before:${year + 1}/01/01`,
        `from:paypal.com after:${year}/01/01 before:${year + 1}/01/01`
      ];

      const detectedSubscriptions: DetectedSubscription[] = [];
      const processedEmailIds = new Set<string>();
      
      for (const searchQuery of searchQueries) {
        console.log(`🔍 SIMPLIFIED search (${year}): ${searchQuery.split(' ')[0]}...`);
        
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
            const subscription = this.validateEmailSimplified(email, year);
            
            if (subscription) {
              const isDuplicate = detectedSubscriptions.some(existing => 
                existing.serviceName === subscription.serviceName && 
                Math.abs(existing.amount - subscription.amount) < 0.01 &&
                existing.currency === subscription.currency
              );
              
              if (!isDuplicate) {
                detectedSubscriptions.push(subscription);
                console.log(`✅ VALID PAYMENT (${year}): ${subscription.serviceName} - ${subscription.currency} ${subscription.amount}`);
              }
            }
          } catch (error) {
            console.error(`❌ Error processing email ${message.id}:`, error);
          }
        }
      }

      console.log(`🎯 SIMPLIFIED detection (${year}) found ${detectedSubscriptions.length} payments for user: ${this.userId}`);

      await this.saveSubscriptionsForYear(detectedSubscriptions, year);
      return detectedSubscriptions;
    } catch (error) {
      console.error(`❌ Error processing ${year} emails for user ${this.userId}:`, error);
      throw error;
    }
  }

  /**
   * 🛡️ SIMPLIFIED VALIDATION - Much more flexible
   */
  private validateEmailSimplified(email: any, year: number): DetectedSubscription | null {
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

    const body = this.extractEmailBody(email.payload);
    const fullText = `${subject} ${body} ${from}`.toLowerCase();

    console.log(`\n🛡️ SIMPLIFIED validation (${year}):`);
    console.log(`📋 SUBJECT: "${subject}"`);
    console.log(`👤 FROM: "${from}"`);
    console.log(`📄 BODY PREVIEW: ${body.substring(0, 200)}...`);

    // STEP 1: Block obvious refunds and spam
    for (const exclusion of HARD_EXCLUSIONS) {
      if (fullText.includes(exclusion)) {
        console.log(`❌ REJECTED: Contains "${exclusion}"`);
        return null;
      }
    }

    // STEP 2: Must have SOME payment indicator (very flexible)
    const hasPaymentIndicator = RECEIPT_KEYWORDS.some(keyword => 
      subject.toLowerCase().includes(keyword) || 
      fullText.includes(keyword) ||
      from.toLowerCase().includes(keyword)
    );
    
    if (!hasPaymentIndicator) {
      console.log(`❌ REJECTED: No payment indicator found`);
      return null;
    }

    // STEP 3: Must have SOME financial context
    const hasFinancialContext = FINANCIAL_INDICATORS.some(indicator => 
      fullText.includes(indicator) || subject.toLowerCase().includes(indicator)
    );
    
    if (!hasFinancialContext) {
      console.log(`❌ REJECTED: No financial context found`);
      return null;
    }

    // STEP 4: Try to extract amount
    const amount = this.extractAmount(fullText, subject);
    if (!amount) {
      console.log(`❌ REJECTED: No valid amount found`);
      return null;
    }

    // STEP 5: Try to identify service
    const serviceInfo = this.identifyService(subject, from, fullText);
    if (!serviceInfo) {
      console.log(`❌ REJECTED: Unknown service`);
      return null;
    }

    // 📧 LOG VALID PAYMENT EMAIL
    console.log(`\n💳 ===== VALID PAYMENT EMAIL =====`);
    console.log(`📋 SUBJECT: ${subject}`);
    console.log(`👤 FROM: ${from}`);
    console.log(`📄 BODY: ${body}`);
    console.log(`💰 AMOUNT: ${amount.currency} ${amount.value}`);
    console.log(`🏢 SERVICE: ${serviceInfo.name} (${serviceInfo.category})`);
    console.log(`💳 ================================\n`);

    const subscription: DetectedSubscription = {
      userId: this.userId,
      serviceName: serviceInfo.name,
      amount: amount.value,
      currency: amount.currency,
      billingCycle: this.determineBillingCycle(fullText),
      nextPaymentDate: this.calculateNextPaymentDate('monthly'),
      category: serviceInfo.category,
      status: 'active',
      emailId: email.id,
      detectedAt: new Date().toISOString(),
      lastEmailDate: new Date(date).toISOString(),
      emailSubject: subject,
      confidence: 0.85,
      receiptType: 'payment_receipt',
      yearProcessed: year
    };

    console.log(`✅ VALID PAYMENT: ${serviceInfo.name} - ${amount.currency} ${amount.value}`);
    return subscription;
  }

  /**
   * Simple amount extraction
   */
  private extractAmount(text: string, subject: string): { value: number; currency: string } | null {
    for (const currencyPattern of CURRENCY_PATTERNS) {
      // Try text first
      const textMatches = [...text.matchAll(currencyPattern.pattern)];
      for (const match of textMatches) {
        const amount = this.parseAmount(match[1]);
        if (amount >= 1 && amount <= 1000) {
          return { value: amount, currency: currencyPattern.currency };
        }
      }
      
      // Try subject
      const subjectMatches = [...subject.matchAll(currencyPattern.pattern)];
      for (const match of subjectMatches) {
        const amount = this.parseAmount(match[1]);
        if (amount >= 1 && amount <= 1000) {
          return { value: amount, currency: currencyPattern.currency };
        }
      }
    }
    
    return null;
  }

  /**
   * Simple service identification
   */
  private identifyService(subject: string, from: string, fullText: string): { name: string; category: string } | null {
    // Check known services
    for (const [key, service] of Object.entries(KNOWN_SERVICES)) {
      const hasMatch = service.patterns.some(pattern => 
        subject.toLowerCase().includes(pattern) || 
        fullText.includes(pattern) ||
        from.toLowerCase().includes(pattern)
      );
      
      if (hasMatch) {
        return { name: service.name, category: service.category };
      }
    }
    
    // Extract from payment processor emails
    if (from.includes('stripe.com') || from.includes('paypal.com')) {
      const extracted = this.extractServiceFromProcessor(subject, fullText);
      if (extracted) {
        return extracted;
      }
    }
    
    return null;
  }

  /**
   * Extract service from payment processor
   */
  private extractServiceFromProcessor(subject: string, fullText: string): { name: string; category: string } | null {
    const patterns = [
      /(?:receipt|payment|invoice).*?(?:from|for)\s+([A-Z][a-zA-Z\s]+?)(?:\s|$|#|,)/i,
      /([A-Z][a-zA-Z\s]+?)\s+Inc\.?/i,
      /(StackBlitz)/i
    ];
    
    for (const pattern of patterns) {
      const match = subject.match(pattern) || fullText.match(pattern);
      if (match && match[1]) {
        let serviceName = match[1].trim();
        
        if (serviceName.toLowerCase().includes('stackblitz')) {
          return { name: 'StackBlitz Pro', category: 'Development' };
        }
        
        if (serviceName.length > 2 && serviceName.length < 50) {
          return { name: serviceName, category: 'Digital Service' };
        }
      }
    }
    
    return null;
  }

  // Helper methods
  private parseAmount(amountStr: string): number {
    const cleaned = amountStr.replace(/[^\d.,]/g, '');
    return parseFloat(cleaned.replace(/,/g, ''));
  }

  private determineBillingCycle(text: string): 'monthly' | 'yearly' | 'weekly' {
    if (text.includes('annual') || text.includes('yearly') || text.includes('year')) return 'yearly';
    if (text.includes('weekly') || text.includes('week')) return 'weekly';
    return 'monthly';
  }

  private extractEmailBody(payload: any): string {
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
          console.log(`✅ Added payment (${year}): ${subscription.serviceName}`);
        } else {
          const docRef = doc(db, 'subscriptions', existingDocs.docs[0].id);
          await updateDoc(docRef, {
            ...subscription,
            yearProcessed: year,
            updatedAt: new Date().toISOString()
          });
          console.log(`🔄 Updated payment (${year}): ${subscription.serviceName}`);
        }
      } catch (error) {
        console.error(`❌ Error saving subscription ${subscription.serviceName}:`, error);
      }
    }
  }
}