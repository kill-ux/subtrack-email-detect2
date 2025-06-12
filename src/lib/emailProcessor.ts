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

// BALANCED: Receipt and payment keywords
const RECEIPT_KEYWORDS = [
  'receipt',
  'payment receipt',
  'billing receipt', 
  'subscription receipt',
  'invoice',
  'payment confirmation',
  'billing confirmation',
  'payment successful',
  'payment processed',
  'transaction receipt',
  'charge confirmation',
  'your payment',
  'payment complete'
];

// BALANCED: Payment indicators (at least one must be present)
const PAYMENT_INDICATORS = [
  'amount charged',
  'total charged', 
  'payment processed',
  'amount paid',
  'total paid',
  'charged to your',
  'billed to your',
  'payment of',
  'charge of',
  'subscription fee',
  'monthly charge',
  'annual charge',
  'billing amount',
  'total amount',
  'amount due',
  'payment amount'
];

// VERIFIED: Known subscription services with realistic price ranges
const SUBSCRIPTION_SERVICES = {
  netflix: { 
    name: 'Netflix', 
    category: 'Entertainment',
    domains: ['netflix.com'],
    keywords: ['netflix'],
    minAmount: 6.99,
    maxAmount: 22.99
  },
  spotify: { 
    name: 'Spotify', 
    category: 'Music',
    domains: ['spotify.com'],
    keywords: ['spotify'],
    minAmount: 4.99,
    maxAmount: 19.99
  },
  github: { 
    name: 'GitHub Pro', 
    category: 'Development',
    domains: ['github.com'],
    keywords: ['github'],
    minAmount: 4.00,
    maxAmount: 25.00
  },
  stackblitz: { 
    name: 'StackBlitz', 
    category: 'Development',
    domains: ['stackblitz.com', 'stripe.com'],
    keywords: ['stackblitz'],
    minAmount: 8.00,
    maxAmount: 50.00
  },
  adobe: { 
    name: 'Adobe Creative Cloud', 
    category: 'Design',
    domains: ['adobe.com'],
    keywords: ['adobe'],
    minAmount: 20.99,
    maxAmount: 89.99
  },
  microsoft: { 
    name: 'Microsoft 365', 
    category: 'Productivity',
    domains: ['microsoft.com', 'office.com'],
    keywords: ['microsoft', 'office 365'],
    minAmount: 6.99,
    maxAmount: 25.00
  },
  google: { 
    name: 'Google Workspace', 
    category: 'Productivity',
    domains: ['google.com', 'workspace.google.com'],
    keywords: ['google workspace', 'g suite'],
    minAmount: 6.00,
    maxAmount: 20.00
  },
  dropbox: { 
    name: 'Dropbox', 
    category: 'Storage',
    domains: ['dropbox.com'],
    keywords: ['dropbox'],
    minAmount: 9.99,
    maxAmount: 24.99
  },
  figma: { 
    name: 'Figma', 
    category: 'Design',
    domains: ['figma.com'],
    keywords: ['figma'],
    minAmount: 12.00,
    maxAmount: 50.00
  },
  notion: { 
    name: 'Notion', 
    category: 'Productivity',
    domains: ['notion.so'],
    keywords: ['notion'],
    minAmount: 8.00,
    maxAmount: 20.00
  },
  slack: { 
    name: 'Slack', 
    category: 'Communication',
    domains: ['slack.com'],
    keywords: ['slack'],
    minAmount: 6.67,
    maxAmount: 15.00
  },
  zoom: { 
    name: 'Zoom', 
    category: 'Communication',
    domains: ['zoom.us'],
    keywords: ['zoom'],
    minAmount: 14.99,
    maxAmount: 19.99
  }
};

// STRICT EXCLUSIONS - Reject these immediately
const STRICT_EXCLUSIONS = [
  // Shopping/E-commerce
  'order confirmation',
  'shipping confirmation', 
  'delivery confirmation',
  'tracking number',
  'return policy',
  'refund processed',
  'refund confirmation',
  
  // One-time purchases
  'one-time purchase',
  'single purchase',
  'gift card',
  'digital download',
  'app purchase',
  'in-app purchase',
  
  // Account/Security
  'welcome email',
  'account created',
  'password reset',
  'security alert',
  'login attempt',
  'verification code',
  
  // Marketing/Promotional
  'promotional offer',
  'special offer',
  'discount code',
  'newsletter',
  'marketing email',
  'unsubscribe',
  
  // Support/Help
  'support ticket',
  'help request',
  'customer service'
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
      console.log(`🔍 Starting BALANCED payment detection for ${year} (user: ${this.userId})`);
      
      const isAuthorized = await this.tokenManager.isGmailAuthorized();
      if (!isAuthorized) {
        throw new Error('Gmail not authorized for this user');
      }

      const accessToken = await this.tokenManager.getValidAccessToken();
      if (!accessToken) {
        throw new Error('Unable to obtain valid access token');
      }

      console.log(`✅ Starting balanced receipt detection for ${year}`);

      // BALANCED SEARCH: Multiple strategies to find subscription payments
      const searchQueries = [
        // Receipt-based searches
        `"receipt" after:${year}/01/01 before:${year + 1}/01/01`,
        `"payment" after:${year}/01/01 before:${year + 1}/01/01`,
        `"invoice" after:${year}/01/01 before:${year + 1}/01/01`,
        `"billing" after:${year}/01/01 before:${year + 1}/01/01`,
        
        // Service-specific searches
        `from:netflix after:${year}/01/01 before:${year + 1}/01/01`,
        `from:spotify after:${year}/01/01 before:${year + 1}/01/01`,
        `from:github after:${year}/01/01 before:${year + 1}/01/01`,
        `from:stackblitz after:${year}/01/01 before:${year + 1}/01/01`,
        `from:stripe "stackblitz" after:${year}/01/01 before:${year + 1}/01/01`,
        `from:adobe after:${year}/01/01 before:${year + 1}/01/01`,
        `from:microsoft after:${year}/01/01 before:${year + 1}/01/01`,
        `from:google after:${year}/01/01 before:${year + 1}/01/01`,
        `from:dropbox after:${year}/01/01 before:${year + 1}/01/01`,
        `from:figma after:${year}/01/01 before:${year + 1}/01/01`,
        `from:notion after:${year}/01/01 before:${year + 1}/01/01`,
        
        // Amount-based searches
        `"$" "subscription" after:${year}/01/01 before:${year + 1}/01/01`,
        `"$" "monthly" after:${year}/01/01 before:${year + 1}/01/01`,
        `"$" "annual" after:${year}/01/01 before:${year + 1}/01/01`
      ];

      const detectedSubscriptions: DetectedSubscription[] = [];
      const processedEmailIds = new Set<string>();
      
      for (const searchQuery of searchQueries) {
        console.log(`🔍 BALANCED search: ${searchQuery.split(' ')[0]}...`);
        
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
          console.warn(`⚠️ Search failed: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const messages = data.messages || [];
        
        console.log(`📧 Found ${messages.length} potential emails for: ${searchQuery.split(' ')[0]}...`);

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
              console.warn(`⚠️ Failed to fetch email ${message.id}`);
              continue;
            }

            const email = await emailResponse.json();
            const subscription = this.validateBalancedPayment(email, year);
            
            if (subscription) {
              const isDuplicate = detectedSubscriptions.some(existing => 
                existing.serviceName === subscription.serviceName && 
                Math.abs(existing.amount - subscription.amount) < 0.01 &&
                existing.emailId !== subscription.emailId
              );
              
              if (!isDuplicate) {
                detectedSubscriptions.push(subscription);
                console.log(`✅ VALID PAYMENT: ${subscription.serviceName} - $${subscription.amount} (confidence: ${subscription.confidence})`);
              }
            }
          } catch (error) {
            console.error(`❌ Error processing email ${message.id}:`, error);
          }
        }
      }

      console.log(`🎯 BALANCED detection found ${detectedSubscriptions.length} valid payments for ${year}`);
      await this.saveSubscriptionsForYear(detectedSubscriptions, year);
      
      return detectedSubscriptions;
    } catch (error) {
      console.error(`❌ Error in balanced processing for ${year}:`, error);
      throw error;
    }
  }

  async processEmails(): Promise<DetectedSubscription[]> {
    const currentYear = new Date().getFullYear();
    return this.processEmailsForYear(currentYear);
  }

  private validateBalancedPayment(email: any, year: number): DetectedSubscription | null {
    const headers = email.payload?.headers || [];
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
    const from = headers.find((h: any) => h.name === 'From')?.value || '';
    const date = headers.find((h: any) => h.name === 'Date')?.value || '';

    // Verify email year
    const emailDate = new Date(date);
    const emailYear = emailDate.getFullYear();
    
    if (emailYear !== year) {
      console.log(`❌ REJECTED: Wrong year ${emailYear}, expected ${year}`);
      return null;
    }

    const body = this.extractEmailBody(email.payload);
    const fullText = `${subject} ${body}`.toLowerCase();

    console.log(`🔍 BALANCED validation: "${subject}" from "${from}"`);

    // STEP 1: STRICT EXCLUSIONS - Reject immediately
    for (const exclusion of STRICT_EXCLUSIONS) {
      if (fullText.includes(exclusion.toLowerCase())) {
        console.log(`❌ REJECTED: Strict exclusion - ${exclusion}`);
        return null;
      }
    }

    // STEP 2: Must have receipt OR payment indicators (more flexible)
    const hasReceiptKeyword = RECEIPT_KEYWORDS.some(keyword => 
      subject.toLowerCase().includes(keyword.toLowerCase()) || fullText.includes(keyword.toLowerCase())
    );
    
    const hasPaymentIndicator = PAYMENT_INDICATORS.some(term => 
      fullText.includes(term.toLowerCase())
    );
    
    if (!hasReceiptKeyword && !hasPaymentIndicator) {
      console.log(`❌ REJECTED: No receipt keywords or payment indicators`);
      return null;
    }

    // STEP 3: Must identify a known service
    const serviceInfo = this.identifyService(subject, from, fullText);
    if (!serviceInfo) {
      console.log(`❌ REJECTED: Unknown service`);
      return null;
    }

    // STEP 4: Must extract valid amount
    const amount = this.extractAmount(fullText, serviceInfo);
    if (!amount) {
      console.log(`❌ REJECTED: Invalid amount for ${serviceInfo.name}`);
      return null;
    }

    // STEP 5: Check for subscription context (flexible)
    const subscriptionTerms = ['subscription', 'recurring', 'monthly', 'annual', 'plan', 'membership', 'service'];
    const hasSubscriptionContext = subscriptionTerms.some(term => fullText.includes(term)) ||
                                  serviceInfo.name.toLowerCase().includes('pro') ||
                                  serviceInfo.name.toLowerCase().includes('premium') ||
                                  serviceInfo.name.toLowerCase().includes('plus');

    // Calculate confidence based on validation strength
    let confidence = 0.7; // Base confidence
    
    if (hasReceiptKeyword) confidence += 0.1;
    if (hasPaymentIndicator) confidence += 0.1;
    if (hasSubscriptionContext) confidence += 0.1;
    if (from.toLowerCase().includes(serviceInfo.domains[0])) confidence += 0.1;

    // Only reject if confidence is very low AND no subscription context
    if (confidence < 0.6 && !hasSubscriptionContext) {
      console.log(`❌ REJECTED: Low confidence (${confidence}) and no subscription context`);
      return null;
    }

    const billingCycle = this.determineBillingCycle(fullText);
    const nextPaymentDate = this.calculateNextPaymentDate(billingCycle);
    const status = this.determineStatus(fullText);

    const subscription: DetectedSubscription = {
      userId: this.userId,
      serviceName: serviceInfo.name,
      amount: amount,
      currency: 'USD',
      billingCycle,
      nextPaymentDate,
      category: serviceInfo.category,
      status,
      emailId: email.id,
      detectedAt: new Date().toISOString(),
      lastEmailDate: new Date(date).toISOString(),
      emailSubject: subject,
      confidence: Math.round(confidence * 100) / 100,
      receiptType: hasReceiptKeyword ? 'receipt' : 'payment_notification',
      yearProcessed: year
    };

    console.log(`✅ BALANCED VALIDATION PASSED: ${serviceInfo.name} - $${amount} (confidence: ${confidence})`);
    return subscription;
  }

  private identifyService(subject: string, from: string, fullText: string): { name: string; category: string; domains: string[]; minAmount: number; maxAmount: number } | null {
    console.log(`🔍 Identifying service from: "${from}"`);
    
    for (const [key, service] of Object.entries(SUBSCRIPTION_SERVICES)) {
      // Check domains first (most reliable)
      for (const domain of service.domains) {
        if (from.toLowerCase().includes(domain)) {
          console.log(`✅ Service identified by domain: ${service.name} (${domain})`);
          return service;
        }
      }
      
      // Check keywords in subject and content
      for (const keyword of service.keywords) {
        if (fullText.includes(keyword.toLowerCase()) || subject.toLowerCase().includes(keyword.toLowerCase())) {
          console.log(`✅ Service identified by keyword: ${service.name} (${keyword})`);
          return service;
        }
      }
    }

    console.log(`❌ Service not identified`);
    return null;
  }

  private extractAmount(text: string, serviceInfo: { minAmount: number; maxAmount: number }): number | null {
    console.log(`💰 Extracting amount for ${serviceInfo.minAmount}-${serviceInfo.maxAmount} range`);
    
    // Multiple amount extraction patterns
    const amountPatterns = [
      /\$(\d+(?:\.\d{2})?)/g,
      /(\d+\.\d{2})/g,
      /amount[:\s]*\$?(\d+(?:\.\d{2})?)/gi,
      /total[:\s]*\$?(\d+(?:\.\d{2})?)/gi,
      /charged[:\s]*\$?(\d+(?:\.\d{2})?)/gi,
      /paid[:\s]*\$?(\d+(?:\.\d{2})?)/gi,
      /price[:\s]*\$?(\d+(?:\.\d{2})?)/gi,
      /cost[:\s]*\$?(\d+(?:\.\d{2})?)/gi
    ];

    const foundAmounts: number[] = [];

    for (const pattern of amountPatterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        const amount = parseFloat(match[1] || match[0].replace('$', ''));
        
        // Must be within service's expected range
        if (amount >= serviceInfo.minAmount && amount <= serviceInfo.maxAmount) {
          foundAmounts.push(amount);
          console.log(`✅ Valid amount found: $${amount}`);
        }
      }
    }

    // Return the most common amount or the first valid one
    if (foundAmounts.length > 0) {
      const amount = foundAmounts[0]; // Take first valid amount
      console.log(`✅ Selected amount: $${amount}`);
      return amount;
    }

    console.log(`❌ No valid amount found within range ${serviceInfo.minAmount}-${serviceInfo.maxAmount}`);
    return null;
  }

  private extractEmailBody(payload: any): string {
    let extractedBody = '';

    if (payload.body?.data) {
      try {
        extractedBody = this.decodeBase64Url(payload.body.data);
        if (extractedBody.length > 0) {
          return extractedBody;
        }
      } catch (e) {
        // Continue to next strategy
      }
    }

    if (payload.parts && payload.parts.length > 0) {
      for (const part of payload.parts) {
        if (part.body?.data) {
          try {
            const partBody = this.decodeBase64Url(part.body.data);
            if (partBody.length > extractedBody.length) {
              extractedBody = partBody;
            }
          } catch (e) {
            // Continue to next part
          }
        }

        if (part.parts) {
          const nestedBody = this.extractEmailBody(part);
          if (nestedBody.length > extractedBody.length) {
            extractedBody = nestedBody;
          }
        }
      }
    }

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

  private determineBillingCycle(text: string): 'monthly' | 'yearly' | 'weekly' {
    if (text.includes('annual') || text.includes('yearly') || text.includes('year')) {
      return 'yearly';
    }
    if (text.includes('weekly') || text.includes('week')) {
      return 'weekly';
    }
    return 'monthly';
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

  private determineStatus(text: string): 'active' | 'trial' | 'cancelled' {
    if (text.includes('trial') || text.includes('free trial')) {
      return 'trial';
    }
    if (text.includes('cancelled') || text.includes('canceled')) {
      return 'cancelled';
    }
    return 'active';
  }

  private async saveSubscriptionsForYear(subscriptions: DetectedSubscription[], year: number): Promise<void> {
    const subscriptionsRef = collection(db, 'subscriptions');

    for (const subscription of subscriptions) {
      try {
        const q = query(
          subscriptionsRef,
          where('userId', '==', subscription.userId),
          where('emailId', '==', subscription.emailId)
        );
        
        const existingDocs = await getDocs(q);
        
        if (existingDocs.empty) {
          await addDoc(subscriptionsRef, subscription);
          console.log(`✅ Saved payment: ${subscription.serviceName} ($${subscription.amount}) for ${year}`);
        } else {
          const docRef = doc(db, 'subscriptions', existingDocs.docs[0].id);
          await updateDoc(docRef, {
            ...subscription,
            updatedAt: new Date().toISOString()
          });
          console.log(`🔄 Updated payment: ${subscription.serviceName} ($${subscription.amount}) for ${year}`);
        }
      } catch (error) {
        console.error(`❌ Error saving subscription:`, error);
      }
    }
  }
}