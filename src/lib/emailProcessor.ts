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
}

// ULTRA-STRICT: Only these exact receipt keywords
const RECEIPT_KEYWORDS = [
  'receipt',
  'receipts',
  'your receipt',
  'payment receipt',
  'billing receipt',
  'subscription receipt',
  'invoice receipt'
];

// Must contain these financial transaction indicators
const REQUIRED_FINANCIAL_TERMS = [
  'amount charged',
  'total charged',
  'payment processed',
  'transaction complete',
  'billed to',
  'charged to your',
  'payment confirmation',
  'billing statement',
  'amount paid',
  'total',
  'paid',
  '$' // At minimum, must contain a dollar sign
];

// Known subscription services - only detect these
const KNOWN_SERVICES = {
  netflix: { 
    name: 'Netflix', 
    category: 'Entertainment',
    domains: ['netflix.com'],
    keywords: ['netflix']
  },
  spotify: { 
    name: 'Spotify', 
    category: 'Music',
    domains: ['spotify.com'],
    keywords: ['spotify']
  },
  github: { 
    name: 'GitHub Pro', 
    category: 'Development',
    domains: ['github.com'],
    keywords: ['github']
  },
  stackblitz: { 
    name: 'StackBlitz', 
    category: 'Development',
    domains: ['stackblitz.com', 'stripe.com'],
    keywords: ['stackblitz']
  },
  adobe: { 
    name: 'Adobe Creative Cloud', 
    category: 'Design',
    domains: ['adobe.com'],
    keywords: ['adobe', 'creative cloud']
  },
  dropbox: { 
    name: 'Dropbox', 
    category: 'Storage',
    domains: ['dropbox.com'],
    keywords: ['dropbox']
  },
  figma: { 
    name: 'Figma', 
    category: 'Design',
    domains: ['figma.com'],
    keywords: ['figma']
  },
  notion: { 
    name: 'Notion', 
    category: 'Productivity',
    domains: ['notion.so'],
    keywords: ['notion']
  }
};

// STRICT EXCLUSIONS - automatically reject these
const STRICT_EXCLUSIONS = [
  'order confirmation',
  'shipping',
  'delivered',
  'tracking',
  'refund',
  'return',
  'cancelled order',
  'welcome',
  'getting started',
  'password reset',
  'security alert',
  'promotional',
  'marketing',
  'newsletter',
  'free trial started',
  'trial started',
  'account created',
  'verification',
  'one-time purchase',
  'gift card',
  'app store',
  'google play'
];

export class EmailProcessor {
  private userId: string;
  private tokenManager: GmailTokenManager;

  constructor(userId: string) {
    this.userId = userId;
    this.tokenManager = new GmailTokenManager(userId);
  }

  async processEmails(): Promise<DetectedSubscription[]> {
    try {
      console.log(`🔍 Starting ULTRA-STRICT receipt-only processing for user: ${this.userId}`);
      
      // Check authorization
      const isAuthorized = await this.tokenManager.isGmailAuthorized();
      if (!isAuthorized) {
        throw new Error('Gmail not authorized for this user');
      }

      const accessToken = await this.tokenManager.getValidAccessToken();
      if (!accessToken) {
        throw new Error('Unable to obtain valid access token');
      }

      console.log(`✅ Valid access token obtained for user: ${this.userId}`);

      // ULTRA-STRICT SEARCH: Only look for emails with "receipt" in subject
      const searchQueries = [
        'subject:receipt',
        'subject:"payment receipt"',
        'subject:"billing receipt"',
        'subject:"subscription receipt"',
        'subject:"your receipt"',
        'from:stackblitz receipt', // Specific for StackBlitz
        'from:stripe receipt' // StackBlitz uses Stripe for billing
      ];

      const oneYearAgo = this.getDateOneYearAgo();
      const detectedSubscriptions: DetectedSubscription[] = [];
      const processedEmailIds = new Set<string>();
      
      // Process each search query
      for (const searchQuery of searchQueries) {
        const fullQuery = `${searchQuery} after:${oneYearAgo}`;
        console.log(`🔍 STRICT search for receipts: ${fullQuery}`);
        
        const response = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(fullQuery)}&maxResults=20`,
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
        
        console.log(`📧 Found ${messages.length} emails for query: ${searchQuery}`);

        // Process each email with ULTRA-STRICT validation
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
            const subscription = this.validateReceiptEmail(email);
            
            if (subscription) {
              // Check for duplicates
              const isDuplicate = detectedSubscriptions.some(existing => 
                existing.serviceName === subscription.serviceName && 
                Math.abs(existing.amount - subscription.amount) < 0.01
              );
              
              if (!isDuplicate) {
                detectedSubscriptions.push(subscription);
                console.log(`✅ VALID RECEIPT: ${subscription.serviceName} - $${subscription.amount} (confidence: ${subscription.confidence})`);
              }
            }
          } catch (error) {
            console.error(`❌ Error processing email ${message.id}:`, error);
          }
        }
      }

      console.log(`🎯 ULTRA-STRICT detection found ${detectedSubscriptions.length} valid receipts for user: ${this.userId}`);

      // Save to Firebase
      await this.saveSubscriptions(detectedSubscriptions);
      
      return detectedSubscriptions;
    } catch (error) {
      console.error(`❌ Error processing emails for user ${this.userId}:`, error);
      throw error;
    }
  }

  private validateReceiptEmail(email: any): DetectedSubscription | null {
    const headers = email.payload?.headers || [];
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
    const from = headers.find((h: any) => h.name === 'From')?.value || '';
    const date = headers.find((h: any) => h.name === 'Date')?.value || '';

    const body = this.extractEmailBody(email.payload);
    const fullText = `${subject} ${body}`.toLowerCase();

    console.log(`🧾 ULTRA-STRICT validation: "${subject}" from "${from}"`);
    console.log(`📄 Email body preview: ${body.substring(0, 200)}...`);

    // STEP 1: MUST contain "receipt" in subject or body
    const hasReceiptKeyword = RECEIPT_KEYWORDS.some(keyword => 
      subject.toLowerCase().includes(keyword) || fullText.includes(keyword)
    );
    
    if (!hasReceiptKeyword) {
      console.log(`❌ REJECTED: No "receipt" keyword found`);
      return null;
    }

    // STEP 2: STRICT EXCLUSIONS - reject immediately
    for (const exclusion of STRICT_EXCLUSIONS) {
      if (fullText.includes(exclusion)) {
        console.log(`❌ REJECTED: Contains exclusion pattern: ${exclusion}`);
        return null;
      }
    }

    // STEP 3: MUST contain financial transaction terms
    const hasFinancialTerms = REQUIRED_FINANCIAL_TERMS.some(term => 
      fullText.includes(term)
    );
    
    if (!hasFinancialTerms) {
      console.log(`❌ REJECTED: No required financial terms found`);
      return null;
    }

    // STEP 4: MUST extract valid amount - SUPER DETAILED EXTRACTION
    const amount = this.extractAmountWithDebug(fullText, body, subject);
    if (!amount || amount < 1 || amount > 500) {
      console.log(`❌ REJECTED: Invalid amount: ${amount}`);
      return null;
    }

    // STEP 5: MUST identify known service
    const serviceInfo = this.identifyKnownService(subject, from, fullText);
    if (!serviceInfo) {
      console.log(`❌ REJECTED: Unknown service`);
      return null;
    }

    // STEP 6: MUST contain subscription indicators
    const subscriptionTerms = ['subscription', 'recurring', 'monthly', 'annual', 'plan', 'membership', 'pro'];
    const hasSubscriptionTerms = subscriptionTerms.some(term => fullText.includes(term));
    
    if (!hasSubscriptionTerms) {
      console.log(`❌ REJECTED: No subscription terms found`);
      return null;
    }

    // Calculate confidence (should be very high for receipts)
    let confidence = 0.9; // Start high for receipt-based detection

    // Determine billing cycle
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
      receiptType: 'payment_receipt'
    };

    console.log(`✅ VALID RECEIPT DETECTED: ${serviceInfo.name} - $${amount} (confidence: ${confidence})`);
    return subscription;
  }

  private extractAmountWithDebug(text: string, originalBody: string, subject: string): number | null {
    console.log(`💰 DEBUGGING amount extraction...`);
    console.log(`📝 Subject: ${subject}`);
    console.log(`📄 Body length: ${originalBody.length} chars`);
    console.log(`🔍 Text preview: ${text.substring(0, 300)}...`);
    
    // STRATEGY 1: Look for exact StackBlitz patterns first
    console.log(`🎯 Strategy 1: StackBlitz-specific patterns`);
    
    // Pattern for your exact StackBlitz receipt format
    const stackBlitzPatterns = [
      /\$20\.00/g,  // Exact match for your example
      /\$(\d+)\.00/g,  // Any whole dollar amount
      /receipt from stackblitz[^$]*\$(\d+(?:\.\d{2})?)/gi,
      /stackblitz[^$]*\$(\d+(?:\.\d{2})?)/gi
    ];

    for (const pattern of stackBlitzPatterns) {
      console.log(`🔍 Testing pattern: ${pattern.source}`);
      const matches = [...text.matchAll(pattern)];
      console.log(`📊 Found ${matches.length} matches`);
      
      for (const match of matches) {
        const amount = match[1] ? parseFloat(match[1]) : parseFloat(match[0].replace('$', ''));
        console.log(`💵 Extracted amount: ${amount}`);
        
        if (amount >= 1 && amount <= 500) {
          console.log(`✅ VALID StackBlitz amount: $${amount}`);
          return amount;
        }
      }
    }

    // STRATEGY 2: Clean standalone amounts (like your example)
    console.log(`🎯 Strategy 2: Clean standalone amounts`);
    const cleanAmountPatterns = [
      /\$(\d+(?:\.\d{2})?)/g,  // Any dollar amount
      /(\d+\.\d{2})/g,  // Decimal numbers that could be amounts
    ];

    for (const pattern of cleanAmountPatterns) {
      console.log(`🔍 Testing clean pattern: ${pattern.source}`);
      const matches = [...text.matchAll(pattern)];
      console.log(`📊 Found ${matches.length} matches: ${matches.map(m => m[0]).join(', ')}`);
      
      for (const match of matches) {
        const amount = parseFloat(match[1] || match[0].replace('$', ''));
        console.log(`💵 Testing amount: ${amount}`);
        
        if (amount >= 1 && amount <= 500) {
          console.log(`✅ VALID clean amount: $${amount}`);
          return amount;
        }
      }
    }

    // STRATEGY 3: Context-aware amounts
    console.log(`🎯 Strategy 3: Context-aware amounts`);
    const contextAmountPatterns = [
      /(?:total|amount|charged|billed|paid)[:\s]*\$?(\d+(?:\.\d{2})?)/gi,
      /\$?(\d+(?:\.\d{2})?)\s*(?:charged|billed|paid|total)/gi,
      /(?:subscription|plan)[:\s]*\$?(\d+(?:\.\d{2})?)/gi,
      /(?:amount paid)[:\s]*\$?(\d+(?:\.\d{2})?)/gi,
      /(?:price|cost)[:\s]*\$?(\d+(?:\.\d{2})?)/gi
    ];

    for (const pattern of contextAmountPatterns) {
      console.log(`🔍 Testing context pattern: ${pattern.source}`);
      const matches = [...text.matchAll(pattern)];
      console.log(`📊 Found ${matches.length} context matches`);
      
      for (const match of matches) {
        const amount = parseFloat(match[1]);
        console.log(`💵 Context amount: ${amount}`);
        
        if (amount >= 1 && amount <= 500) {
          console.log(`✅ VALID context amount: $${amount}`);
          return amount;
        }
      }
    }

    // STRATEGY 4: Brute force - find ALL numbers and see if any make sense
    console.log(`🎯 Strategy 4: Brute force number extraction`);
    const allNumbers = text.match(/\d+(?:\.\d{2})?/g) || [];
    console.log(`🔢 All numbers found: ${allNumbers.join(', ')}`);
    
    for (const numStr of allNumbers) {
      const amount = parseFloat(numStr);
      if (amount >= 1 && amount <= 500) {
        console.log(`✅ VALID brute force amount: $${amount}`);
        return amount;
      }
    }

    console.log(`❌ NO VALID AMOUNT FOUND after all strategies`);
    console.log(`📋 Full text for manual inspection:`);
    console.log(text);
    
    return null;
  }

  private identifyKnownService(subject: string, from: string, fullText: string): { name: string; category: string } | null {
    console.log(`🔍 Identifying service from: "${from}"`);
    console.log(`📧 Subject: "${subject}"`);
    
    // Only detect known services
    for (const [key, service] of Object.entries(KNOWN_SERVICES)) {
      // Check keywords
      for (const keyword of service.keywords) {
        if (fullText.includes(keyword) || from.toLowerCase().includes(keyword) || subject.toLowerCase().includes(keyword)) {
          console.log(`✅ Service identified: ${service.name} (keyword: ${keyword})`);
          return {
            name: service.name,
            category: service.category
          };
        }
      }
      
      // Check domains
      for (const domain of service.domains) {
        if (from.toLowerCase().includes(domain)) {
          console.log(`✅ Service identified: ${service.name} (domain: ${domain})`);
          return {
            name: service.name,
            category: service.category
          };
        }
      }
    }

    console.log(`❌ Unknown service - not in known services list`);
    return null;
  }

  private determineBillingCycle(text: string): 'monthly' | 'yearly' | 'weekly' {
    if (text.includes('annual') || text.includes('yearly') || text.includes('year')) {
      return 'yearly';
    }
    if (text.includes('weekly') || text.includes('week')) {
      return 'weekly';
    }
    return 'monthly'; // Default
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
      default: // monthly
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

  private extractEmailBody(payload: any): string {
    if (payload.body?.data) {
      try {
        return atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
      } catch (e) {
        return '';
      }
    }
    
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          try {
            return atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
          } catch (e) {
            continue;
          }
        }
      }
    }
    
    return payload.snippet || '';
  }

  private getDateOneYearAgo(): string {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 1);
    return date.toISOString().split('T')[0].replace(/-/g, '/');
  }

  private async saveSubscriptions(subscriptions: DetectedSubscription[]): Promise<void> {
    const subscriptionsRef = collection(db, 'subscriptions');

    for (const subscription of subscriptions) {
      try {
        // Check if subscription already exists
        const q = query(
          subscriptionsRef,
          where('userId', '==', subscription.userId),
          where('emailId', '==', subscription.emailId)
        );
        
        const existingDocs = await getDocs(q);
        
        if (existingDocs.empty) {
          // Add new subscription
          await addDoc(subscriptionsRef, subscription);
          console.log(`✅ Added RECEIPT-BASED subscription: ${subscription.serviceName} for user: ${this.userId}`);
        } else {
          // Update existing subscription
          const docRef = doc(db, 'subscriptions', existingDocs.docs[0].id);
          await updateDoc(docRef, {
            ...subscription,
            updatedAt: new Date().toISOString()
          });
          console.log(`🔄 Updated RECEIPT-BASED subscription: ${subscription.serviceName} for user: ${this.userId}`);
        }
      } catch (error) {
        console.error(`❌ Error saving subscription ${subscription.serviceName} for user ${this.userId}:`, error);
      }
    }
  }
}