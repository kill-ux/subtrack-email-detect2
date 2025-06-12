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
  confidence: number; // Add confidence score
}

// More specific subscription keywords
const SUBSCRIPTION_KEYWORDS = [
  'subscription renewed', 'subscription receipt', 'payment confirmation',
  'invoice', 'billing statement', 'auto-renewal', 'recurring payment',
  'membership renewed', 'plan renewed', 'premium subscription',
  'monthly plan', 'yearly plan', 'annual subscription'
];

// Exclude these patterns that often cause false positives
const EXCLUDE_PATTERNS = [
  'purchase confirmation', 'order confirmation', 'shipping',
  'delivery', 'refund', 'return', 'one-time', 'single purchase',
  'gift card', 'promotional', 'marketing', 'newsletter',
  'security alert', 'password', 'verification', 'welcome',
  'thank you for signing up', 'account created', 'free trial started'
];

// Known subscription services with their patterns
const SERVICE_PATTERNS = {
  // Streaming & Entertainment
  netflix: { name: 'Netflix', category: 'Entertainment', keywords: ['netflix'] },
  spotify: { name: 'Spotify', category: 'Music', keywords: ['spotify'] },
  'disney plus': { name: 'Disney+', category: 'Entertainment', keywords: ['disney', 'disney+'] },
  hulu: { name: 'Hulu', category: 'Entertainment', keywords: ['hulu'] },
  'amazon prime': { name: 'Amazon Prime', category: 'Entertainment', keywords: ['prime video', 'prime membership'] },
  
  // Development & Productivity
  github: { name: 'GitHub Pro', category: 'Development', keywords: ['github'] },
  stackblitz: { name: 'StackBlitz', category: 'Development', keywords: ['stackblitz'] },
  'adobe creative': { name: 'Adobe Creative Cloud', category: 'Design', keywords: ['adobe', 'creative cloud'] },
  figma: { name: 'Figma', category: 'Design', keywords: ['figma'] },
  notion: { name: 'Notion', category: 'Productivity', keywords: ['notion'] },
  slack: { name: 'Slack', category: 'Productivity', keywords: ['slack'] },
  
  // Cloud & Storage
  dropbox: { name: 'Dropbox', category: 'Storage', keywords: ['dropbox'] },
  'google workspace': { name: 'Google Workspace', category: 'Productivity', keywords: ['google workspace', 'gsuite'] },
  'microsoft 365': { name: 'Microsoft 365', category: 'Productivity', keywords: ['microsoft 365', 'office 365'] },
  
  // News & Media
  'new york times': { name: 'New York Times', category: 'News', keywords: ['nytimes', 'new york times'] },
  'wall street journal': { name: 'Wall Street Journal', category: 'News', keywords: ['wsj', 'wall street journal'] }
};

// Billing cycle indicators
const BILLING_CYCLE_PATTERNS = {
  monthly: ['monthly', 'month', '/month', 'per month', 'mo.', 'monthly plan'],
  yearly: ['yearly', 'annual', 'year', '/year', 'per year', 'annually', 'yr.'],
  weekly: ['weekly', 'week', '/week', 'per week', 'wk.']
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
      console.log(`🔍 Starting improved email processing for user: ${this.userId}`);
      
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

      // Search for emails with more specific subscription-related queries
      const searchQueries = [
        'subject:(subscription renewed OR subscription receipt OR payment confirmation)',
        'subject:(invoice OR billing statement OR auto-renewal)',
        'subject:(membership renewed OR plan renewed)',
        'from:(noreply OR billing OR subscriptions OR payments)',
        'body:(subscription OR recurring payment OR auto-renewal)'
      ];

      const oneYearAgo = this.getDateOneYearAgo();
      const detectedSubscriptions: DetectedSubscription[] = [];
      
      // Process each search query
      for (const searchQuery of searchQueries) {
        const fullQuery = `${searchQuery} after:${oneYearAgo}`;
        console.log(`🔍 Searching with query: ${fullQuery}`);
        
        const response = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(fullQuery)}&maxResults=50`,
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
        
        console.log(`📧 Found ${messages.length} emails for query`);

        // Process emails (limit to avoid rate limits)
        for (const message of messages.slice(0, 25)) {
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
            const subscription = this.extractSubscriptionInfo(email);
            
            if (subscription && subscription.confidence >= 0.7) { // Only high-confidence detections
              // Check for duplicates
              const isDuplicate = detectedSubscriptions.some(existing => 
                existing.serviceName === subscription.serviceName && 
                Math.abs(existing.amount - subscription.amount) < 0.01
              );
              
              if (!isDuplicate) {
                detectedSubscriptions.push(subscription);
                console.log(`✅ High-confidence subscription detected: ${subscription.serviceName} - $${subscription.amount} (confidence: ${subscription.confidence})`);
              }
            }
          } catch (error) {
            console.error(`❌ Error processing email ${message.id}:`, error);
          }
        }
      }

      console.log(`🎯 Detected ${detectedSubscriptions.length} high-confidence subscriptions for user: ${this.userId}`);

      // Save to Firebase
      await this.saveSubscriptions(detectedSubscriptions);
      
      return detectedSubscriptions;
    } catch (error) {
      console.error(`❌ Error processing emails for user ${this.userId}:`, error);
      throw error;
    }
  }

  private extractSubscriptionInfo(email: any): DetectedSubscription | null {
    const headers = email.payload?.headers || [];
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
    const from = headers.find((h: any) => h.name === 'From')?.value || '';
    const date = headers.find((h: any) => h.name === 'Date')?.value || '';

    // Get email body
    const body = this.extractEmailBody(email.payload);
    const fullText = `${subject} ${body}`.toLowerCase();

    console.log(`🔍 Analyzing email: "${subject}" from "${from}"`);

    // Calculate confidence score
    let confidence = 0;

    // Check for exclusion patterns first
    for (const excludePattern of EXCLUDE_PATTERNS) {
      if (fullText.includes(excludePattern)) {
        console.log(`❌ Excluded due to pattern: ${excludePattern}`);
        return null;
      }
    }

    // Check for subscription keywords
    const subscriptionKeywordMatches = SUBSCRIPTION_KEYWORDS.filter(keyword => 
      fullText.includes(keyword)
    );
    
    if (subscriptionKeywordMatches.length === 0) {
      console.log(`❌ No subscription keywords found`);
      return null;
    }

    confidence += subscriptionKeywordMatches.length * 0.2;

    // Extract and validate amount
    const amount = this.extractAmount(fullText);
    if (!amount || amount < 1 || amount > 1000) {
      console.log(`❌ Invalid amount: ${amount}`);
      return null;
    }

    confidence += 0.3; // Found valid amount

    // Extract service name and check against known services
    const serviceInfo = this.extractServiceInfo(subject, from, fullText);
    if (!serviceInfo) {
      console.log(`❌ Could not identify service`);
      return null;
    }

    confidence += serviceInfo.confidence;

    // Determine billing cycle
    const billingCycle = this.determineBillingCycle(fullText);
    if (billingCycle) {
      confidence += 0.1;
    }

    // Check sender credibility
    if (this.isTrustedSender(from)) {
      confidence += 0.2;
    }

    // Must have minimum confidence to proceed
    if (confidence < 0.7) {
      console.log(`❌ Low confidence: ${confidence}`);
      return null;
    }

    // Extract next payment date
    const nextPaymentDate = this.extractNextPaymentDate(fullText, billingCycle);

    // Determine status
    const status = this.determineStatus(fullText);

    const subscription: DetectedSubscription = {
      userId: this.userId,
      serviceName: serviceInfo.name,
      amount,
      currency: 'USD',
      billingCycle,
      nextPaymentDate,
      category: serviceInfo.category,
      status,
      emailId: email.id,
      detectedAt: new Date().toISOString(),
      lastEmailDate: new Date(date).toISOString(),
      emailSubject: subject,
      confidence: Math.round(confidence * 100) / 100
    };

    console.log(`✅ Subscription extracted with confidence ${confidence}: ${serviceInfo.name} - $${amount}`);
    return subscription;
  }

  private extractAmount(text: string): number | null {
    // More precise amount extraction patterns
    const amountPatterns = [
      // Standard currency formats
      /\$(\d+(?:\.\d{2}))/g,
      /(\d+(?:\.\d{2}))\s*USD/gi,
      /(\d+(?:\.\d{2}))\s*dollars?/gi,
      
      // Context-specific patterns
      /(?:amount|total|price|cost|charge)[:\s]*\$?(\d+(?:\.\d{2}))/gi,
      /(?:billed|charged|paid)[:\s]*\$?(\d+(?:\.\d{2}))/gi,
      /(?:subscription|plan)[:\s]*\$?(\d+(?:\.\d{2}))/gi,
      
      // Invoice patterns
      /(?:invoice|bill)[:\s]*\$?(\d+(?:\.\d{2}))/gi
    ];

    const foundAmounts: number[] = [];

    for (const pattern of amountPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        for (const match of matches) {
          const numMatch = match.match(/(\d+(?:\.\d{2})?)/);
          if (numMatch) {
            const amount = parseFloat(numMatch[1]);
            if (amount >= 1 && amount <= 1000) { // Reasonable subscription range
              foundAmounts.push(amount);
            }
          }
        }
      }
    }

    if (foundAmounts.length === 0) return null;

    // Return the most common amount, or the first if all are unique
    const amountCounts = foundAmounts.reduce((acc, amount) => {
      acc[amount] = (acc[amount] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    return Object.entries(amountCounts)
      .sort(([,a], [,b]) => b - a)[0]?.[0] 
      ? parseFloat(Object.entries(amountCounts).sort(([,a], [,b]) => b - a)[0][0])
      : foundAmounts[0];
  }

  private extractServiceInfo(subject: string, from: string, fullText: string): { name: string; category: string; confidence: number } | null {
    // Check against known service patterns first
    for (const [pattern, service] of Object.entries(SERVICE_PATTERNS)) {
      for (const keyword of service.keywords) {
        if (fullText.includes(keyword) || from.toLowerCase().includes(keyword)) {
          return {
            name: service.name,
            category: service.category,
            confidence: 0.4 // High confidence for known services
          };
        }
      }
    }

    // Extract from email domain
    const emailMatch = from.match(/@([^.]+)/);
    if (emailMatch) {
      const domain = emailMatch[1].toLowerCase();
      
      // Skip generic domains
      const genericDomains = ['gmail', 'yahoo', 'outlook', 'hotmail', 'noreply', 'no-reply'];
      if (genericDomains.includes(domain)) {
        return null;
      }
      
      // Check if domain suggests a subscription service
      const subscriptionIndicators = ['billing', 'subscription', 'payments', 'noreply'];
      const hasSubscriptionIndicator = subscriptionIndicators.some(indicator => 
        from.toLowerCase().includes(indicator)
      );
      
      if (hasSubscriptionIndicator) {
        return {
          name: domain.charAt(0).toUpperCase() + domain.slice(1),
          category: 'Other',
          confidence: 0.2
        };
      }
    }

    return null;
  }

  private determineBillingCycle(text: string): 'monthly' | 'yearly' | 'weekly' {
    for (const [cycle, patterns] of Object.entries(BILLING_CYCLE_PATTERNS)) {
      if (patterns.some(pattern => text.includes(pattern))) {
        return cycle as 'monthly' | 'yearly' | 'weekly';
      }
    }
    return 'monthly'; // Default assumption
  }

  private isTrustedSender(from: string): boolean {
    const trustedPatterns = [
      'noreply', 'no-reply', 'billing', 'subscriptions', 'payments',
      'support', 'accounts', 'notifications'
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
      /renews on:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i
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
          console.log(`✅ Added new subscription: ${subscription.serviceName} (confidence: ${subscription.confidence}) for user: ${this.userId}`);
        } else {
          // Update existing subscription
          const docRef = doc(db, 'subscriptions', existingDocs.docs[0].id);
          await updateDoc(docRef, {
            ...subscription,
            updatedAt: new Date().toISOString()
          });
          console.log(`🔄 Updated subscription: ${subscription.serviceName} (confidence: ${subscription.confidence}) for user: ${this.userId}`);
        }
      } catch (error) {
        console.error(`❌ Error saving subscription ${subscription.serviceName} for user ${this.userId}:`, error);
      }
    }
  }
}