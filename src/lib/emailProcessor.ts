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

// 🎯 STRICT: Only actual payment/receipt keywords
const PAYMENT_RECEIPT_KEYWORDS = [
  // Direct payment confirmations
  'payment receipt', 'receipt for payment', 'payment confirmation', 'payment successful',
  'payment processed', 'payment complete', 'charge confirmation', 'billing receipt',
  'subscription receipt', 'invoice receipt', 'transaction receipt',
  
  // Specific receipt phrases
  'your receipt from', 'receipt from', 'thank you for your payment',
  'payment has been processed', 'subscription renewed', 'auto-renewal successful',
  
  // StackBlitz specific (known to be valid)
  'receipt from stackblitz', 'stackblitz receipt'
];

// 🚫 STRICT EXCLUSIONS: Block non-payment emails
const STRICT_EXCLUSIONS = [
  // Refunds and cancellations
  'refund', 'refunded', 'money back', 'chargeback', 'reversal',
  'cancelled', 'canceled', 'subscription cancelled', 'account closed',
  
  // Non-payment notifications
  'welcome', 'getting started', 'account created', 'sign up', 'signup',
  'verification', 'verify', 'confirm your email', 'activate account',
  'password reset', 'security alert', 'login attempt', 'new device',
  
  // Marketing and promotions
  'newsletter', 'promotional', 'marketing', 'special offer', 'discount',
  'free trial', 'trial started', 'trial ending', 'upgrade now',
  
  // GitHub specific non-payment emails
  'security advisory', 'dependabot', 'pull request', 'issue', 'commit',
  'repository', 'workflow', 'action', 'release', 'merge', 'branch',
  'code review', 'discussion', 'notification', 'mention', 'comment',
  'starred', 'watching', 'following', 'team invitation', 'organization',
  
  // General notifications
  'reminder', 'expiring', 'expires', 'due soon', 'upcoming',
  'summary', 'digest', 'weekly report', 'monthly report'
];

// 💰 REQUIRED: Must have actual payment amount
const AMOUNT_REQUIRED_PHRASES = [
  'amount charged', 'total charged', 'payment of', 'charged to',
  'billed', 'invoice total', 'amount paid', 'total paid',
  '$', '€', '£', 'USD', 'EUR', 'GBP', 'MAD', 'DH'
];

// 🏢 VERIFIED SERVICES with strict patterns
const KNOWN_SERVICES = {
  stackblitz: {
    name: 'StackBlitz Pro',
    category: 'Development',
    patterns: ['stackblitz inc', 'stackblitz pro', 'bolt pro'],
    paymentPatterns: ['receipt from stackblitz', 'stackblitz receipt']
  },
  kick: {
    name: 'Kick.com',
    category: 'Streaming',
    patterns: ['kick.com'],
    paymentPatterns: ['kick subscription', 'kick payment']
  },
  spotify: {
    name: 'Spotify',
    category: 'Music',
    patterns: ['spotify'],
    paymentPatterns: ['spotify premium', 'spotify subscription']
  },
  netflix: {
    name: 'Netflix',
    category: 'Entertainment',
    patterns: ['netflix'],
    paymentPatterns: ['netflix subscription', 'netflix payment']
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
      console.log(`🗓️ Starting STRICT payment detection for ${year} (user: ${this.userId})`);
      
      const isAuthorized = await this.tokenManager.isGmailAuthorized();
      if (!isAuthorized) {
        throw new Error('Gmail not authorized for this user');
      }

      const accessToken = await this.tokenManager.getValidAccessToken();
      if (!accessToken) {
        throw new Error('Unable to obtain valid access token');
      }

      // 🎯 STRICT: Only search for actual payment receipts
      const searchQueries = [
        // Explicit payment receipts
        `"payment receipt" after:${year}/01/01 before:${year + 1}/01/01`,
        `"receipt for payment" after:${year}/01/01 before:${year + 1}/01/01`,
        `"payment confirmation" after:${year}/01/01 before:${year + 1}/01/01`,
        `"payment successful" after:${year}/01/01 before:${year + 1}/01/01`,
        `"billing receipt" after:${year}/01/01 before:${year + 1}/01/01`,
        `"subscription receipt" after:${year}/01/01 before:${year + 1}/01/01`,
        
        // StackBlitz specific (known valid)
        `"receipt from stackblitz" after:${year}/01/01 before:${year + 1}/01/01`,
        `from:stripe.com "stackblitz" "receipt" after:${year}/01/01 before:${year + 1}/01/01`,
        
        // Other verified services with payment context
        `from:stripe.com "receipt" after:${year}/01/01 before:${year + 1}/01/01`,
        `"subscription renewed" after:${year}/01/01 before:${year + 1}/01/01`,
        `"auto-renewal successful" after:${year}/01/01 before:${year + 1}/01/01`
      ];

      const detectedSubscriptions: DetectedSubscription[] = [];
      const processedEmailIds = new Set<string>();
      
      for (const searchQuery of searchQueries) {
        console.log(`🔍 STRICT search (${year}): ${searchQuery.split(' ')[0]}...`);
        
        const response = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}&maxResults=20`,
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
            const subscription = this.validatePaymentEmailStrict(email, year);
            
            if (subscription) {
              const isDuplicate = detectedSubscriptions.some(existing => 
                existing.serviceName === subscription.serviceName && 
                Math.abs(existing.amount - subscription.amount) < 0.01 &&
                existing.currency === subscription.currency
              );
              
              if (!isDuplicate) {
                detectedSubscriptions.push(subscription);
                console.log(`✅ VERIFIED PAYMENT (${year}): ${subscription.serviceName} - ${subscription.currency} ${subscription.amount}`);
              }
            }
          } catch (error) {
            console.error(`❌ Error processing email ${message.id}:`, error);
          }
        }
      }

      console.log(`🎯 STRICT detection (${year}) found ${detectedSubscriptions.length} verified payments for user: ${this.userId}`);

      await this.saveSubscriptionsForYear(detectedSubscriptions, year);
      return detectedSubscriptions;
    } catch (error) {
      console.error(`❌ Error processing ${year} emails for user ${this.userId}:`, error);
      throw error;
    }
  }

  /**
   * 🛡️ STRICT PAYMENT VALIDATION - Only actual payment receipts
   */
  private validatePaymentEmailStrict(email: any, year: number): DetectedSubscription | null {
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
    const fullText = `${subject} ${body}`.toLowerCase();

    console.log(`\n🛡️ STRICT validation (${year}):`);
    console.log(`📋 SUBJECT: "${subject}"`);
    console.log(`👤 FROM: "${from}"`);

    // STEP 1: STRICT EXCLUSIONS - Block non-payment emails
    for (const exclusion of STRICT_EXCLUSIONS) {
      if (fullText.includes(exclusion.toLowerCase()) || subject.toLowerCase().includes(exclusion.toLowerCase())) {
        console.log(`❌ REJECTED: Contains exclusion "${exclusion}"`);
        return null;
      }
    }

    // STEP 2: Must have EXPLICIT payment receipt keywords
    const hasPaymentKeyword = PAYMENT_RECEIPT_KEYWORDS.some(keyword => 
      subject.toLowerCase().includes(keyword.toLowerCase()) || 
      fullText.includes(keyword.toLowerCase())
    );
    
    if (!hasPaymentKeyword) {
      console.log(`❌ REJECTED: No explicit payment receipt keyword found`);
      console.log(`📝 Looking for: ${PAYMENT_RECEIPT_KEYWORDS.slice(0, 3).join(', ')}...`);
      return null;
    }

    // STEP 3: Must have ACTUAL amount with payment context
    const hasAmountWithContext = AMOUNT_REQUIRED_PHRASES.some(phrase => 
      fullText.includes(phrase.toLowerCase()) || subject.toLowerCase().includes(phrase.toLowerCase())
    );
    
    if (!hasAmountWithContext) {
      console.log(`❌ REJECTED: No amount with payment context found`);
      return null;
    }

    // STEP 4: Extract and validate amount
    const amount = this.extractAmountStrict(fullText, subject);
    if (!amount) {
      console.log(`❌ REJECTED: No valid payment amount found`);
      return null;
    }

    // STEP 5: Must be a verified service with payment patterns
    const serviceInfo = this.identifyVerifiedService(subject, from, fullText);
    if (!serviceInfo) {
      console.log(`❌ REJECTED: Not a verified payment service`);
      return null;
    }

    // 📧 LOG VERIFIED PAYMENT EMAIL
    console.log(`\n💳 ===== VERIFIED PAYMENT EMAIL =====`);
    console.log(`📋 SUBJECT: ${subject}`);
    console.log(`👤 FROM: ${from}`);
    console.log(`💰 AMOUNT: ${amount.currency} ${amount.value}`);
    console.log(`🏢 SERVICE: ${serviceInfo.name} (${serviceInfo.category})`);
    console.log(`💳 ===================================\n`);

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
      confidence: 0.95, // High confidence for strict validation
      receiptType: 'payment_receipt',
      yearProcessed: year
    };

    console.log(`✅ VERIFIED PAYMENT: ${serviceInfo.name} - ${amount.currency} ${amount.value}`);
    return subscription;
  }

  /**
   * Strict amount extraction - must be in payment context
   */
  private extractAmountStrict(text: string, subject: string): { value: number; currency: string } | null {
    for (const currencyPattern of CURRENCY_PATTERNS) {
      // Check text
      const textMatches = [...text.matchAll(currencyPattern.pattern)];
      for (const match of textMatches) {
        const amount = this.parseAmount(match[1]);
        if (amount >= 1 && amount <= 500) { // Reasonable subscription range
          return { value: amount, currency: currencyPattern.currency };
        }
      }
      
      // Check subject
      const subjectMatches = [...subject.matchAll(currencyPattern.pattern)];
      for (const match of subjectMatches) {
        const amount = this.parseAmount(match[1]);
        if (amount >= 1 && amount <= 500) {
          return { value: amount, currency: currencyPattern.currency };
        }
      }
    }
    
    return null;
  }

  /**
   * Only identify verified services with payment patterns
   */
  private identifyVerifiedService(subject: string, from: string, fullText: string): { name: string; category: string } | null {
    // Check known services with payment patterns
    for (const [key, service] of Object.entries(KNOWN_SERVICES)) {
      // Must match service pattern
      const hasServicePattern = service.patterns.some(pattern => 
        subject.toLowerCase().includes(pattern) || 
        fullText.includes(pattern) ||
        from.toLowerCase().includes(pattern)
      );
      
      // Must also match payment pattern (for extra verification)
      const hasPaymentPattern = service.paymentPatterns.some(pattern => 
        subject.toLowerCase().includes(pattern) || 
        fullText.includes(pattern)
      );
      
      if (hasServicePattern && (hasPaymentPattern || key === 'stackblitz')) {
        // Special case for StackBlitz - Stripe emails are valid
        if (key === 'stackblitz' && from.includes('stripe.com')) {
          return { name: service.name, category: service.category };
        }
        
        if (hasPaymentPattern) {
          return { name: service.name, category: service.category };
        }
      }
    }
    
    // Special handling for Stripe payment processor
    if (from.includes('stripe.com')) {
      const extracted = this.extractServiceFromStripe(subject, fullText);
      if (extracted) {
        return extracted;
      }
    }
    
    return null;
  }

  /**
   * Extract service from Stripe emails (payment processor)
   */
  private extractServiceFromStripe(subject: string, fullText: string): { name: string; category: string } | null {
    // Look for "receipt from [Service]" pattern
    const receiptPattern = /receipt\s+from\s+([A-Z][a-zA-Z\s]+?)(?:\s|$|#|,|\.)/i;
    const match = subject.match(receiptPattern);
    
    if (match && match[1]) {
      let serviceName = match[1].trim();
      
      // Known service mappings
      if (serviceName.toLowerCase().includes('stackblitz')) {
        return { name: 'StackBlitz Pro', category: 'Development' };
      }
      
      // Only accept if it's a reasonable service name
      if (serviceName.length > 2 && serviceName.length < 30) {
        return { name: serviceName, category: 'Digital Service' };
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
          console.log(`✅ Added verified payment (${year}): ${subscription.serviceName}`);
        } else {
          const docRef = doc(db, 'subscriptions', existingDocs.docs[0].id);
          await updateDoc(docRef, {
            ...subscription,
            yearProcessed: year,
            updatedAt: new Date().toISOString()
          });
          console.log(`🔄 Updated verified payment (${year}): ${subscription.serviceName}`);
        }
      } catch (error) {
        console.error(`❌ Error saving subscription ${subscription.serviceName}:`, error);
      }
    }
  }
}