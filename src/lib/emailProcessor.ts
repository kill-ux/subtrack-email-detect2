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

// ULTRA-STRICT: Only these exact receipt patterns
const STRICT_RECEIPT_KEYWORDS = [
  'payment receipt',
  'billing receipt', 
  'subscription receipt',
  'invoice receipt',
  'payment confirmation',
  'billing confirmation',
  'payment successful',
  'payment processed',
  'transaction receipt',
  'charge confirmation'
];

// MANDATORY: Must contain these payment indicators
const MANDATORY_PAYMENT_TERMS = [
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
  'annual charge'
];

// ULTRA-STRICT: Only verified subscription services
const VERIFIED_SUBSCRIPTION_SERVICES = {
  netflix: { 
    name: 'Netflix', 
    category: 'Entertainment',
    domains: ['netflix.com'],
    keywords: ['netflix'],
    minAmount: 8.99,
    maxAmount: 19.99
  },
  spotify: { 
    name: 'Spotify', 
    category: 'Music',
    domains: ['spotify.com'],
    keywords: ['spotify premium', 'spotify'],
    minAmount: 4.99,
    maxAmount: 15.99
  },
  github: { 
    name: 'GitHub Pro', 
    category: 'Development',
    domains: ['github.com'],
    keywords: ['github pro', 'github'],
    minAmount: 4.00,
    maxAmount: 21.00
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
    keywords: ['adobe creative', 'adobe'],
    minAmount: 20.99,
    maxAmount: 82.99
  },
  microsoft: { 
    name: 'Microsoft 365', 
    category: 'Productivity',
    domains: ['microsoft.com', 'office.com'],
    keywords: ['microsoft 365', 'office 365'],
    minAmount: 6.99,
    maxAmount: 22.00
  },
  google: { 
    name: 'Google Workspace', 
    category: 'Productivity',
    domains: ['google.com', 'workspace.google.com'],
    keywords: ['google workspace', 'g suite'],
    minAmount: 6.00,
    maxAmount: 18.00
  },
  dropbox: { 
    name: 'Dropbox', 
    category: 'Storage',
    domains: ['dropbox.com'],
    keywords: ['dropbox plus', 'dropbox'],
    minAmount: 9.99,
    maxAmount: 19.99
  },
  figma: { 
    name: 'Figma', 
    category: 'Design',
    domains: ['figma.com'],
    keywords: ['figma professional', 'figma'],
    minAmount: 12.00,
    maxAmount: 45.00
  },
  notion: { 
    name: 'Notion', 
    category: 'Productivity',
    domains: ['notion.so'],
    keywords: ['notion plus', 'notion'],
    minAmount: 8.00,
    maxAmount: 16.00
  }
};

// ABSOLUTE EXCLUSIONS - Reject immediately if found
const ABSOLUTE_EXCLUSIONS = [
  // Shopping/E-commerce
  'order confirmation',
  'shipping confirmation', 
  'delivery confirmation',
  'order shipped',
  'package delivered',
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
  'email verification',
  
  // Marketing/Promotional
  'promotional offer',
  'special offer',
  'discount code',
  'newsletter',
  'marketing email',
  'unsubscribe',
  
  // Trial/Free
  'free trial started',
  'trial period',
  'trial expired',
  'free account',
  'free plan',
  
  // Support/Help
  'support ticket',
  'help request',
  'customer service',
  'contact us'
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
      console.log(`🔒 Starting ULTRA-STRICT payment validation for ${year} (user: ${this.userId})`);
      
      const isAuthorized = await this.tokenManager.isGmailAuthorized();
      if (!isAuthorized) {
        throw new Error('Gmail not authorized for this user');
      }

      const accessToken = await this.tokenManager.getValidAccessToken();
      if (!accessToken) {
        throw new Error('Unable to obtain valid access token');
      }

      console.log(`✅ Starting ultra-strict receipt validation for ${year}`);

      // ULTRA-STRICT SEARCH: Only exact payment receipt patterns
      const searchQueries = [
        `"payment receipt" after:${year}/01/01 before:${year + 1}/01/01`,
        `"billing receipt" after:${year}/01/01 before:${year + 1}/01/01`,
        `"subscription receipt" after:${year}/01/01 before:${year + 1}/01/01`,
        `"payment confirmation" after:${year}/01/01 before:${year + 1}/01/01`,
        `"payment successful" after:${year}/01/01 before:${year + 1}/01/01`,
        `"payment processed" after:${year}/01/01 before:${year + 1}/01/01`,
        `"charge confirmation" after:${year}/01/01 before:${year + 1}/01/01`,
        
        // Service-specific strict searches
        `from:netflix "payment" after:${year}/01/01 before:${year + 1}/01/01`,
        `from:spotify "payment" after:${year}/01/01 before:${year + 1}/01/01`,
        `from:github "payment" after:${year}/01/01 before:${year + 1}/01/01`,
        `from:stackblitz "payment" after:${year}/01/01 before:${year + 1}/01/01`,
        `from:stripe "stackblitz" after:${year}/01/01 before:${year + 1}/01/01`
      ];

      const detectedSubscriptions: DetectedSubscription[] = [];
      const processedEmailIds = new Set<string>();
      
      for (const searchQuery of searchQueries) {
        console.log(`🔍 ULTRA-STRICT search: ${searchQuery}`);
        
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
        
        console.log(`📧 Found ${messages.length} potential receipts for: ${searchQuery.split(' ')[0]}...`);

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
            const subscription = this.validateUltraStrictPayment(email, year);
            
            if (subscription) {
              const isDuplicate = detectedSubscriptions.some(existing => 
                existing.serviceName === subscription.serviceName && 
                Math.abs(existing.amount - subscription.amount) < 0.01 &&
                existing.emailId !== subscription.emailId
              );
              
              if (!isDuplicate) {
                detectedSubscriptions.push(subscription);
                console.log(`✅ VALID PAYMENT RECEIPT: ${subscription.serviceName} - $${subscription.amount} (confidence: ${subscription.confidence})`);
              } else {
                console.log(`🔄 DUPLICATE DETECTED: ${subscription.serviceName} - $${subscription.amount}`);
              }
            }
          } catch (error) {
            console.error(`❌ Error processing email ${message.id}:`, error);
          }
        }
      }

      console.log(`🎯 ULTRA-STRICT validation found ${detectedSubscriptions.length} legitimate payments for ${year}`);
      await this.saveSubscriptionsForYear(detectedSubscriptions, year);
      
      return detectedSubscriptions;
    } catch (error) {
      console.error(`❌ Error in ultra-strict processing for ${year}:`, error);
      throw error;
    }
  }

  async processEmails(): Promise<DetectedSubscription[]> {
    const currentYear = new Date().getFullYear();
    return this.processEmailsForYear(currentYear);
  }

  private validateUltraStrictPayment(email: any, year: number): DetectedSubscription | null {
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

    const body = this.extractEmailBodyWithDebug(email.payload);
    const fullText = `${subject} ${body}`.toLowerCase();

    console.log(`🔒 ULTRA-STRICT validation: "${subject}" from "${from}"`);

    // STEP 1: ABSOLUTE EXCLUSIONS - Reject immediately
    for (const exclusion of ABSOLUTE_EXCLUSIONS) {
      if (fullText.includes(exclusion.toLowerCase())) {
        console.log(`❌ REJECTED: Absolute exclusion - ${exclusion}`);
        return null;
      }
    }

    // STEP 2: MUST have strict receipt keywords
    const hasStrictReceiptKeyword = STRICT_RECEIPT_KEYWORDS.some(keyword => 
      subject.toLowerCase().includes(keyword) || fullText.includes(keyword)
    );
    
    if (!hasStrictReceiptKeyword) {
      console.log(`❌ REJECTED: No strict receipt keyword found`);
      return null;
    }

    // STEP 3: MUST have mandatory payment terms
    const hasMandatoryPaymentTerms = MANDATORY_PAYMENT_TERMS.some(term => 
      fullText.includes(term.toLowerCase())
    );
    
    if (!hasMandatoryPaymentTerms) {
      console.log(`❌ REJECTED: No mandatory payment terms found`);
      return null;
    }

    // STEP 4: MUST be verified subscription service
    const serviceInfo = this.identifyVerifiedService(subject, from, fullText);
    if (!serviceInfo) {
      console.log(`❌ REJECTED: Not a verified subscription service`);
      return null;
    }

    // STEP 5: MUST extract valid amount within service range
    const amount = this.extractStrictAmount(fullText, serviceInfo);
    if (!amount) {
      console.log(`❌ REJECTED: Invalid amount for ${serviceInfo.name}`);
      return null;
    }

    // STEP 6: MUST contain subscription indicators
    const subscriptionTerms = ['subscription', 'recurring', 'monthly', 'annual', 'plan', 'membership'];
    const hasSubscriptionTerms = subscriptionTerms.some(term => fullText.includes(term));
    
    if (!hasSubscriptionTerms) {
      console.log(`❌ REJECTED: No subscription terms found`);
      return null;
    }

    // STEP 7: MUST NOT contain one-time purchase indicators
    const oneTimeIndicators = ['one-time', 'single purchase', 'gift', 'download', 'app store'];
    const hasOneTimeIndicators = oneTimeIndicators.some(term => fullText.includes(term));
    
    if (hasOneTimeIndicators) {
      console.log(`❌ REJECTED: Contains one-time purchase indicators`);
      return null;
    }

    // Calculate high confidence for strict validation
    let confidence = 0.95; // Start very high for ultra-strict validation

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
      confidence: confidence,
      receiptType: 'verified_payment_receipt',
      yearProcessed: year
    };

    console.log(`✅ ULTRA-STRICT VALIDATION PASSED: ${serviceInfo.name} - $${amount} (confidence: ${confidence})`);
    return subscription;
  }

  private identifyVerifiedService(subject: string, from: string, fullText: string): { name: string; category: string; minAmount: number; maxAmount: number } | null {
    console.log(`🔍 Checking against verified services only`);
    
    for (const [key, service] of Object.entries(VERIFIED_SUBSCRIPTION_SERVICES)) {
      // Check domains first (most reliable)
      for (const domain of service.domains) {
        if (from.toLowerCase().includes(domain)) {
          console.log(`✅ Verified service by domain: ${service.name} (${domain})`);
          return service;
        }
      }
      
      // Check keywords with strict matching
      for (const keyword of service.keywords) {
        if (fullText.includes(keyword.toLowerCase()) || subject.toLowerCase().includes(keyword.toLowerCase())) {
          console.log(`✅ Verified service by keyword: ${service.name} (${keyword})`);
          return service;
        }
      }
    }

    console.log(`❌ Not a verified subscription service`);
    return null;
  }

  private extractStrictAmount(text: string, serviceInfo: { minAmount: number; maxAmount: number }): number | null {
    console.log(`💰 Extracting amount for ${serviceInfo.minAmount}-${serviceInfo.maxAmount} range`);
    
    // Strict amount patterns
    const amountPatterns = [
      /\$(\d+(?:\.\d{2})?)/g,
      /amount[:\s]*\$?(\d+(?:\.\d{2})?)/gi,
      /total[:\s]*\$?(\d+(?:\.\d{2})?)/gi,
      /charged[:\s]*\$?(\d+(?:\.\d{2})?)/gi,
      /paid[:\s]*\$?(\d+(?:\.\d{2})?)/gi
    ];

    for (const pattern of amountPatterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        const amount = parseFloat(match[1] || match[0].replace('$', ''));
        
        // Must be within service's expected range
        if (amount >= serviceInfo.minAmount && amount <= serviceInfo.maxAmount) {
          console.log(`✅ Valid amount for service: $${amount}`);
          return amount;
        } else {
          console.log(`❌ Amount $${amount} outside range ${serviceInfo.minAmount}-${serviceInfo.maxAmount}`);
        }
      }
    }

    console.log(`❌ No valid amount found within service range`);
    return null;
  }

  private extractEmailBodyWithDebug(payload: any): string {
    let extractedBody = '';

    if (payload.body?.data) {
      try {
        extractedBody = this.decodeBase64Url(payload.body.data);
        if (extractedBody.length > 0) {
          return extractedBody;
        }
      } catch (e) {
        console.warn(`⚠️ Failed to decode direct body`);
      }
    }

    if (payload.parts && payload.parts.length > 0) {
      for (let i = 0; i < payload.parts.length; i++) {
        const part = payload.parts[i];
        
        if (part.body?.data) {
          try {
            const partBody = this.decodeBase64Url(part.body.data);
            if (partBody.length > extractedBody.length) {
              extractedBody = partBody;
            }
          } catch (e) {
            console.warn(`⚠️ Failed to decode part ${i}`);
          }
        }

        if (part.parts) {
          const nestedBody = this.extractEmailBodyWithDebug(part);
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
      console.error('❌ Base64 decode error:', error);
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
          console.log(`✅ Saved VERIFIED payment: ${subscription.serviceName} ($${subscription.amount}) for ${year}`);
        } else {
          const docRef = doc(db, 'subscriptions', existingDocs.docs[0].id);
          await updateDoc(docRef, {
            ...subscription,
            updatedAt: new Date().toISOString()
          });
          console.log(`🔄 Updated VERIFIED payment: ${subscription.serviceName} ($${subscription.amount}) for ${year}`);
        }
      } catch (error) {
        console.error(`❌ Error saving verified subscription:`, error);
      }
    }
  }
}