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
  receiptType: string; // Type of receipt detected
}

// Receipt-specific keywords that indicate actual billing/payment
const RECEIPT_KEYWORDS = [
  // Payment confirmations
  'payment received', 'payment confirmation', 'payment processed',
  'transaction complete', 'charge successful', 'payment successful',
  
  // Receipt indicators
  'receipt', 'invoice', 'billing statement', 'statement',
  'your bill', 'amount charged', 'amount billed',
  
  // Subscription billing
  'subscription renewed', 'subscription payment', 'auto-renewal',
  'recurring payment', 'membership renewed', 'plan renewed',
  
  // Financial transaction terms
  'charged to', 'billed to', 'debited from', 'paid via',
  'credit card ending', 'payment method', 'billing cycle'
];

// Financial/transaction indicators
const FINANCIAL_INDICATORS = [
  // Payment methods
  'credit card', 'debit card', 'visa', 'mastercard', 'amex', 'american express',
  'paypal', 'bank account', 'payment method', 'billing method',
  
  // Transaction details
  'transaction id', 'reference number', 'confirmation number',
  'order number', 'invoice number', 'receipt number',
  
  // Billing terms
  'billing period', 'billing cycle', 'next billing date',
  'subscription period', 'service period', 'coverage period'
];

// Amount context patterns - these should appear near dollar amounts
const AMOUNT_CONTEXT_PATTERNS = [
  'total', 'amount', 'charged', 'billed', 'paid', 'cost', 'price',
  'subscription', 'plan', 'membership', 'service fee', 'monthly fee',
  'annual fee', 'recurring charge', 'auto-payment'
];

// Exclude these patterns that often cause false positives
const EXCLUDE_PATTERNS = [
  // Shopping/e-commerce
  'order shipped', 'order delivered', 'tracking number', 'delivery confirmation',
  'item shipped', 'package delivered', 'shipping notification',
  
  // One-time purchases
  'purchase confirmation', 'order confirmation', 'thank you for your order',
  'one-time purchase', 'single payment', 'gift purchase',
  
  // Promotional/marketing
  'promotional', 'marketing', 'newsletter', 'unsubscribe',
  'special offer', 'discount', 'sale', 'free trial started',
  
  // Account management
  'password reset', 'security alert', 'account verification',
  'welcome', 'getting started', 'account created',
  
  // Refunds/returns
  'refund', 'return', 'cancelled order', 'order cancelled'
];

// Known subscription services with enhanced patterns
const SERVICE_PATTERNS = {
  // Streaming & Entertainment
  netflix: { 
    name: 'Netflix', 
    category: 'Entertainment', 
    keywords: ['netflix'],
    domains: ['netflix.com'],
    receiptPatterns: ['netflix subscription', 'streaming service']
  },
  spotify: { 
    name: 'Spotify', 
    category: 'Music', 
    keywords: ['spotify'],
    domains: ['spotify.com'],
    receiptPatterns: ['spotify premium', 'music streaming']
  },
  
  // Development & Productivity
  github: { 
    name: 'GitHub Pro', 
    category: 'Development', 
    keywords: ['github'],
    domains: ['github.com'],
    receiptPatterns: ['github pro', 'github subscription', 'developer plan']
  },
  stackblitz: { 
    name: 'StackBlitz', 
    category: 'Development', 
    keywords: ['stackblitz'],
    domains: ['stackblitz.com'],
    receiptPatterns: ['stackblitz pro', 'online ide', 'development environment']
  },
  
  // Design & Creative
  'adobe creative': { 
    name: 'Adobe Creative Cloud', 
    category: 'Design', 
    keywords: ['adobe', 'creative cloud'],
    domains: ['adobe.com'],
    receiptPatterns: ['creative cloud', 'adobe subscription']
  },
  figma: { 
    name: 'Figma', 
    category: 'Design', 
    keywords: ['figma'],
    domains: ['figma.com'],
    receiptPatterns: ['figma professional', 'design tool']
  },
  
  // Cloud & Storage
  dropbox: { 
    name: 'Dropbox', 
    category: 'Storage', 
    keywords: ['dropbox'],
    domains: ['dropbox.com'],
    receiptPatterns: ['dropbox plus', 'cloud storage']
  },
  
  // Productivity
  notion: { 
    name: 'Notion', 
    category: 'Productivity', 
    keywords: ['notion'],
    domains: ['notion.so'],
    receiptPatterns: ['notion pro', 'workspace']
  },
  slack: { 
    name: 'Slack', 
    category: 'Productivity', 
    keywords: ['slack'],
    domains: ['slack.com'],
    receiptPatterns: ['slack pro', 'team communication']
  }
};

export class EmailProcessor {
  private userId: string;
  private tokenManager: GmailTokenManager;

  constructor(userId: string) {
    this.userId = userId;
    this.tokenManager = new GmailTokenManager(userId);
  }

  async processEmails(): Promise<DetectedSubscription[]> {
    try {
      console.log(`🔍 Starting receipt-based email processing for user: ${this.userId}`);
      
      // Check if user has Gmail authorization
      const isAuthorized = await this.tokenManager.isGmailAuthorized();
      if (!isAuthorized) {
        throw new Error('Gmail not authorized for this user');
      }

      // Get valid access token
      const accessToken = await this.tokenManager.getValidAccessToken();
      if (!accessToken) {
        throw new Error('Unable to obtain valid access token');
      }

      console.log(`✅ Valid access token obtained for user: ${this.userId}`);

      // Search for emails with receipt-specific queries
      const searchQueries = [
        // Receipt and invoice specific
        'subject:(receipt OR invoice OR "billing statement")',
        'subject:("payment confirmation" OR "payment received" OR "transaction complete")',
        'subject:("subscription renewed" OR "auto-renewal" OR "recurring payment")',
        
        // Financial transaction indicators
        'body:("amount charged" OR "amount billed" OR "total amount")',
        'body:("credit card" OR "payment method" OR "billing cycle")',
        
        // Known subscription services with billing terms
        'from:(billing OR noreply OR subscriptions) subject:(netflix OR spotify OR github OR adobe OR dropbox)',
        'body:("subscription" AND ("$" OR "charged" OR "billed"))'
      ];

      const oneYearAgo = this.getDateOneYearAgo();
      const detectedSubscriptions: DetectedSubscription[] = [];
      const processedEmailIds = new Set<string>();
      
      // Process each search query
      for (const searchQuery of searchQueries) {
        const fullQuery = `${searchQuery} after:${oneYearAgo}`;
        console.log(`🔍 Searching for receipts with query: ${fullQuery}`);
        
        const response = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(fullQuery)}&maxResults=30`,
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
        
        console.log(`📧 Found ${messages.length} potential receipt emails`);

        // Process emails (limit to avoid rate limits)
        for (const message of messages.slice(0, 20)) {
          // Skip if already processed
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
            const subscription = this.extractSubscriptionFromReceipt(email);
            
            if (subscription && subscription.confidence >= 0.8) { // Higher threshold for receipts
              // Check for duplicates
              const isDuplicate = detectedSubscriptions.some(existing => 
                existing.serviceName === subscription.serviceName && 
                Math.abs(existing.amount - subscription.amount) < 0.01
              );
              
              if (!isDuplicate) {
                detectedSubscriptions.push(subscription);
                console.log(`✅ Receipt-based subscription detected: ${subscription.serviceName} - $${subscription.amount} (confidence: ${subscription.confidence}, type: ${subscription.receiptType})`);
              }
            }
          } catch (error) {
            console.error(`❌ Error processing email ${message.id}:`, error);
          }
        }
      }

      console.log(`🎯 Detected ${detectedSubscriptions.length} receipt-based subscriptions for user: ${this.userId}`);

      // Save to Firebase
      await this.saveSubscriptions(detectedSubscriptions);
      
      return detectedSubscriptions;
    } catch (error) {
      console.error(`❌ Error processing emails for user ${this.userId}:`, error);
      throw error;
    }
  }

  private extractSubscriptionFromReceipt(email: any): DetectedSubscription | null {
    const headers = email.payload?.headers || [];
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
    const from = headers.find((h: any) => h.name === 'From')?.value || '';
    const date = headers.find((h: any) => h.name === 'Date')?.value || '';

    // Get email body
    const body = this.extractEmailBody(email.payload);
    const fullText = `${subject} ${body}`.toLowerCase();

    console.log(`🧾 Analyzing potential receipt: "${subject}" from "${from}"`);

    // Calculate confidence score
    let confidence = 0;
    let receiptType = 'unknown';

    // STEP 1: Check for exclusion patterns first
    for (const excludePattern of EXCLUDE_PATTERNS) {
      if (fullText.includes(excludePattern)) {
        console.log(`❌ Excluded due to pattern: ${excludePattern}`);
        return null;
      }
    }

    // STEP 2: Must contain receipt/financial indicators
    const receiptIndicators = RECEIPT_KEYWORDS.filter(keyword => 
      fullText.includes(keyword)
    );
    
    if (receiptIndicators.length === 0) {
      console.log(`❌ No receipt indicators found`);
      return null;
    }

    confidence += receiptIndicators.length * 0.15;
    receiptType = receiptIndicators[0];

    // STEP 3: Must contain financial transaction indicators
    const financialIndicators = FINANCIAL_INDICATORS.filter(indicator => 
      fullText.includes(indicator)
    );
    
    if (financialIndicators.length === 0) {
      console.log(`❌ No financial transaction indicators found`);
      return null;
    }

    confidence += financialIndicators.length * 0.1;

    // STEP 4: Extract and validate amount with context
    const amountInfo = this.extractAmountWithContext(fullText);
    if (!amountInfo || amountInfo.amount < 1 || amountInfo.amount > 1000) {
      console.log(`❌ Invalid or missing amount with context: ${amountInfo?.amount}`);
      return null;
    }

    confidence += 0.3; // Found valid amount with context
    if (amountInfo.hasContext) {
      confidence += 0.1; // Bonus for amount appearing in proper context
    }

    // STEP 5: Extract service name and check against known services
    const serviceInfo = this.extractServiceFromReceipt(subject, from, fullText);
    if (!serviceInfo) {
      console.log(`❌ Could not identify service from receipt`);
      return null;
    }

    confidence += serviceInfo.confidence;

    // STEP 6: Check for subscription-specific patterns
    const subscriptionPatterns = [
      'subscription', 'recurring', 'auto-renewal', 'membership',
      'monthly plan', 'annual plan', 'billing cycle'
    ];
    
    const subscriptionMatches = subscriptionPatterns.filter(pattern => 
      fullText.includes(pattern)
    );
    
    if (subscriptionMatches.length === 0) {
      console.log(`❌ No subscription patterns found in receipt`);
      return null;
    }

    confidence += subscriptionMatches.length * 0.05;

    // STEP 7: Determine billing cycle
    const billingCycle = this.determineBillingCycle(fullText);
    if (billingCycle) {
      confidence += 0.05;
    }

    // STEP 8: Check sender credibility
    if (this.isTrustedBillingSender(from)) {
      confidence += 0.15;
    }

    // Must have high confidence for receipt-based detection
    if (confidence < 0.8) {
      console.log(`❌ Low confidence for receipt: ${confidence}`);
      return null;
    }

    // Extract next payment date
    const nextPaymentDate = this.extractNextPaymentDate(fullText, billingCycle);

    // Determine status
    const status = this.determineStatus(fullText);

    const subscription: DetectedSubscription = {
      userId: this.userId,
      serviceName: serviceInfo.name,
      amount: amountInfo.amount,
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
      receiptType
    };

    console.log(`✅ Receipt-based subscription extracted with confidence ${confidence}: ${serviceInfo.name} - $${amountInfo.amount} (${receiptType})`);
    return subscription;
  }

  private extractAmountWithContext(text: string): { amount: number; hasContext: boolean } | null {
    // Look for amounts that appear in proper billing context
    const contextualAmountPatterns = [
      // Direct billing context
      /(?:total|amount|charged|billed|paid|cost|price)[:\s]*\$(\d+(?:\.\d{2})?)/gi,
      /(?:subscription|plan|membership)[:\s]*\$(\d+(?:\.\d{2})?)/gi,
      /(?:monthly|annual|yearly)[:\s]*(?:fee|charge|payment)[:\s]*\$(\d+(?:\.\d{2})?)/gi,
      
      // Receipt-style formatting
      /(?:subtotal|total due|amount due)[:\s]*\$(\d+(?:\.\d{2})?)/gi,
      /\$(\d+(?:\.\d{2})?)\s*(?:was charged|has been charged|charged to)/gi,
      /(?:you paid|payment of|charged amount)[:\s]*\$(\d+(?:\.\d{2})?)/gi
    ];

    // Also look for standalone amounts but with lower confidence
    const standaloneAmountPatterns = [
      /\$(\d+(?:\.\d{2})?)/g
    ];

    const foundAmounts: { amount: number; hasContext: boolean }[] = [];

    // First, look for contextual amounts (higher priority)
    for (const pattern of contextualAmountPatterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        const amount = parseFloat(match[1]);
        if (amount >= 1 && amount <= 1000) {
          foundAmounts.push({ amount, hasContext: true });
        }
      }
    }

    // If no contextual amounts found, look for standalone amounts
    if (foundAmounts.length === 0) {
      for (const pattern of standaloneAmountPatterns) {
        const matches = [...text.matchAll(pattern)];
        for (const match of matches) {
          const amount = parseFloat(match[1]);
          if (amount >= 1 && amount <= 1000) {
            // Check if this amount appears near subscription-related terms
            const matchIndex = match.index || 0;
            const contextWindow = text.substring(
              Math.max(0, matchIndex - 50), 
              Math.min(text.length, matchIndex + 50)
            );
            
            const hasNearbyContext = AMOUNT_CONTEXT_PATTERNS.some(pattern => 
              contextWindow.includes(pattern)
            );
            
            if (hasNearbyContext) {
              foundAmounts.push({ amount, hasContext: false });
            }
          }
        }
      }
    }

    if (foundAmounts.length === 0) return null;

    // Prefer contextual amounts, then most common amount
    const contextualAmounts = foundAmounts.filter(a => a.hasContext);
    if (contextualAmounts.length > 0) {
      return contextualAmounts[0];
    }

    return foundAmounts[0];
  }

  private extractServiceFromReceipt(subject: string, from: string, fullText: string): { name: string; category: string; confidence: number } | null {
    // Check against known service patterns with receipt validation
    for (const [pattern, service] of Object.entries(SERVICE_PATTERNS)) {
      for (const keyword of service.keywords) {
        if (fullText.includes(keyword) || from.toLowerCase().includes(keyword)) {
          // Additional validation for known services
          const hasReceiptPattern = service.receiptPatterns?.some(receiptPattern => 
            fullText.includes(receiptPattern)
          );
          
          const isDomainMatch = service.domains?.some(domain => 
            from.toLowerCase().includes(domain)
          );
          
          let confidence = 0.3; // Base confidence for keyword match
          if (hasReceiptPattern) confidence += 0.2;
          if (isDomainMatch) confidence += 0.2;
          
          return {
            name: service.name,
            category: service.category,
            confidence
          };
        }
      }
    }

    // Extract from email domain with receipt validation
    const emailMatch = from.match(/@([^.]+\.[^.]+)/);
    if (emailMatch) {
      const domain = emailMatch[1].toLowerCase();
      
      // Skip generic domains
      const genericDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'];
      if (genericDomains.some(generic => domain.includes(generic))) {
        return null;
      }
      
      // Check if sender suggests a billing/subscription service
      const billingIndicators = ['billing', 'noreply', 'no-reply', 'subscriptions', 'payments', 'accounts'];
      const hasBillingIndicator = billingIndicators.some(indicator => 
        from.toLowerCase().includes(indicator)
      );
      
      if (hasBillingIndicator) {
        const serviceName = domain.split('.')[0];
        return {
          name: serviceName.charAt(0).toUpperCase() + serviceName.slice(1),
          category: 'Other',
          confidence: 0.2
        };
      }
    }

    return null;
  }

  private determineBillingCycle(text: string): 'monthly' | 'yearly' | 'weekly' {
    const billingPatterns = {
      yearly: ['annual', 'yearly', 'year', '/year', 'per year', 'annually', '12 months'],
      monthly: ['monthly', 'month', '/month', 'per month', '30 days'],
      weekly: ['weekly', 'week', '/week', 'per week', '7 days']
    };

    for (const [cycle, patterns] of Object.entries(billingPatterns)) {
      if (patterns.some(pattern => text.includes(pattern))) {
        return cycle as 'monthly' | 'yearly' | 'weekly';
      }
    }
    
    return 'monthly'; // Default assumption
  }

  private isTrustedBillingSender(from: string): boolean {
    const trustedPatterns = [
      'noreply', 'no-reply', 'billing', 'subscriptions', 'payments',
      'support', 'accounts', 'notifications', 'receipts', 'invoices'
    ];
    
    return trustedPatterns.some(pattern => 
      from.toLowerCase().includes(pattern)
    );
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

  private extractNextPaymentDate(text: string, billingCycle: string): string {
    // Look for explicit next payment dates
    const datePatterns = [
      /next payment:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /renewal date:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /due date:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /renews on:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /billing date:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i
    ];

    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        return new Date(match[1]).toISOString();
      }
    }

    // Calculate based on billing cycle
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
    if (text.includes('cancelled') || text.includes('canceled') || text.includes('terminated')) {
      return 'cancelled';
    }
    return 'active';
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
          console.log(`✅ Added receipt-based subscription: ${subscription.serviceName} (confidence: ${subscription.confidence}, type: ${subscription.receiptType}) for user: ${this.userId}`);
        } else {
          // Update existing subscription
          const docRef = doc(db, 'subscriptions', existingDocs.docs[0].id);
          await updateDoc(docRef, {
            ...subscription,
            updatedAt: new Date().toISOString()
          });
          console.log(`🔄 Updated receipt-based subscription: ${subscription.serviceName} (confidence: ${subscription.confidence}, type: ${subscription.receiptType}) for user: ${this.userId}`);
        }
      } catch (error) {
        console.error(`❌ Error saving subscription ${subscription.serviceName} for user ${this.userId}:`, error);
      }
    }
  }
}