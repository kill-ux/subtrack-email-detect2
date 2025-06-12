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
}

const SUBSCRIPTION_KEYWORDS = [
  'subscription', 'recurring payment', 'monthly plan', 'yearly plan', 
  'renewal', 'invoice', 'receipt', 'billing', 'payment confirmation',
  'auto-renewal', 'membership', 'premium', 'pro plan', 'stackblitz'
];

const SERVICE_PATTERNS = {
  netflix: { name: 'Netflix', category: 'Entertainment' },
  spotify: { name: 'Spotify', category: 'Music' },
  'adobe creative': { name: 'Adobe Creative Cloud', category: 'Design' },
  github: { name: 'GitHub Pro', category: 'Development' },
  dropbox: { name: 'Dropbox', category: 'Storage' },
  'microsoft 365': { name: 'Microsoft 365', category: 'Productivity' },
  slack: { name: 'Slack', category: 'Productivity' },
  zoom: { name: 'Zoom', category: 'Productivity' },
  'google workspace': { name: 'Google Workspace', category: 'Productivity' },
  'amazon prime': { name: 'Amazon Prime', category: 'Entertainment' },
  hulu: { name: 'Hulu', category: 'Entertainment' },
  'disney plus': { name: 'Disney+', category: 'Entertainment' },
  figma: { name: 'Figma', category: 'Design' },
  notion: { name: 'Notion', category: 'Productivity' },
  canva: { name: 'Canva', category: 'Design' },
  stackblitz: { name: 'StackBlitz', category: 'Development' },
  'stackblitz, inc': { name: 'StackBlitz', category: 'Development' },
  'stackblitz inc': { name: 'StackBlitz', category: 'Development' }
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
      console.log(`🔍 Starting email processing for user: ${this.userId}`);
      
      // Check if user has Gmail authorization
      const isAuthorized = await this.tokenManager.isGmailAuthorized();
      if (!isAuthorized) {
        throw new Error('Gmail not authorized for this user');
      }

      // Get valid access token (will refresh if needed)
      const accessToken = await this.tokenManager.getValidAccessToken();
      if (!accessToken) {
        throw new Error('Unable to obtain valid access token');
      }

      console.log(`✅ Valid access token obtained for user: ${this.userId}`);

      // Search for emails with subscription-related keywords
      const searchQuery = SUBSCRIPTION_KEYWORDS.map(keyword => `"${keyword}"`).join(' OR ');
      const oneYearAgo = this.getDateOneYearAgo();
      
      console.log(`🔍 Searching Gmail with query: ${searchQuery}`);
      
      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery + ' after:' + oneYearAgo)}&maxResults=100`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Gmail API Error:', response.status, errorText);
        
        // If token is expired, the tokenManager should have handled it
        // But if we still get 401, the refresh token might be invalid
        if (response.status === 401) {
          throw new Error('Gmail access token invalid and refresh failed. Please reconnect your account.');
        }
        
        throw new Error(`Gmail API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      const messages = data.messages || [];
      const detectedSubscriptions: DetectedSubscription[] = [];

      console.log(`📧 Found ${messages.length} potential subscription emails for user: ${this.userId}`);

      // Process emails (limit to 50 to avoid rate limits)
      for (const message of messages.slice(0, 50)) {
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
          if (subscription) {
            detectedSubscriptions.push(subscription);
            console.log(`✅ Detected subscription: ${subscription.serviceName} - $${subscription.amount}`);
          }
        } catch (error) {
          console.error(`❌ Error processing email ${message.id}:`, error);
        }
      }

      console.log(`🎯 Detected ${detectedSubscriptions.length} subscriptions for user: ${this.userId}`);

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

    // Extract amount - improved regex to catch more patterns
    const amountPatterns = [
      /\$(\d+(?:\.\d{2})?)/g,
      /(\d+(?:\.\d{2})?)\s*USD/gi,
      /(\d+(?:\.\d{2})?)\s*dollars?/gi,
      /amount[:\s]*\$?(\d+(?:\.\d{2})?)/gi,
      /total[:\s]*\$?(\d+(?:\.\d{2})?)/gi,
      /price[:\s]*\$?(\d+(?:\.\d{2})?)/gi
    ];

    let amount = 0;
    for (const pattern of amountPatterns) {
      const matches = fullText.match(pattern);
      if (matches) {
        for (const match of matches) {
          const numMatch = match.match(/(\d+(?:\.\d{2})?)/);
          if (numMatch) {
            const foundAmount = parseFloat(numMatch[1]);
            if (foundAmount >= 1 && foundAmount <= 1000) { // Reasonable subscription range
              amount = foundAmount;
              break;
            }
          }
        }
        if (amount > 0) break;
      }
    }

    if (amount === 0) return null;

    // Extract service name
    const serviceName = this.extractServiceName(subject, from, fullText);
    if (!serviceName) return null;

    // Determine billing cycle
    const billingCycle = this.determineBillingCycle(fullText);

    // Extract next payment date
    const nextPaymentDate = this.extractNextPaymentDate(fullText, billingCycle);

    // Determine category
    const category = this.determineCategory(serviceName, fullText);

    // Determine status
    const status = this.determineStatus(fullText);

    return {
      userId: this.userId,
      serviceName,
      amount,
      currency: 'USD',
      billingCycle,
      nextPaymentDate,
      category,
      status,
      emailId: email.id,
      detectedAt: new Date().toISOString(),
      lastEmailDate: new Date(date).toISOString(),
      emailSubject: subject
    };
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

  private extractServiceName(subject: string, from: string, fullText: string): string {
    // Check against known service patterns first
    for (const [pattern, service] of Object.entries(SERVICE_PATTERNS)) {
      if (fullText.includes(pattern) || from.toLowerCase().includes(pattern)) {
        return service.name;
      }
    }

    // Special handling for StackBlitz variations
    if (fullText.includes('stackblitz') || from.toLowerCase().includes('stackblitz')) {
      return 'StackBlitz';
    }

    // Extract from email address
    const emailMatch = from.match(/@([^.]+)/);
    if (emailMatch) {
      const domain = emailMatch[1];
      
      // Handle special cases
      if (domain.toLowerCase().includes('stackblitz')) {
        return 'StackBlitz';
      }
      
      return domain.charAt(0).toUpperCase() + domain.slice(1);
    }

    // Extract from subject
    const cleanSubject = subject
      .replace(/^(re:|fwd:)\s*/i, '')
      .replace(/\s*-\s*(receipt|invoice|payment|subscription).*$/i, '')
      .trim();

    return cleanSubject || 'Unknown Service';
  }

  private determineBillingCycle(text: string): 'monthly' | 'yearly' | 'weekly' {
    if (text.includes('annual') || text.includes('yearly') || text.includes('year')) {
      return 'yearly';
    }
    if (text.includes('weekly') || text.includes('week')) {
      return 'weekly';
    }
    return 'monthly'; // Default to monthly
  }

  private extractNextPaymentDate(text: string, billingCycle: string): string {
    // Look for explicit next payment dates
    const datePatterns = [
      /next payment:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /renewal date:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /due date:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i
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

  private determineCategory(serviceName: string, text: string): string {
    const lowerService = serviceName.toLowerCase();
    const lowerText = text.toLowerCase();

    // Check service patterns first
    for (const [pattern, service] of Object.entries(SERVICE_PATTERNS)) {
      if (lowerService.includes(pattern) || lowerText.includes(pattern)) {
        return service.category;
      }
    }

    // Special handling for StackBlitz
    if (lowerService.includes('stackblitz') || lowerText.includes('stackblitz')) {
      return 'Development';
    }

    // Category keywords
    const categoryKeywords = {
      'Entertainment': ['streaming', 'video', 'movie', 'tv', 'entertainment', 'media'],
      'Music': ['music', 'audio', 'podcast', 'sound'],
      'Productivity': ['productivity', 'office', 'workspace', 'collaboration', 'project'],
      'Development': ['development', 'developer', 'code', 'programming', 'api', 'ide', 'editor', 'stackblitz'],
      'Design': ['design', 'creative', 'graphics', 'photo', 'editing'],
      'Storage': ['storage', 'cloud', 'backup', 'drive', 'sync'],
      'News': ['news', 'magazine', 'newspaper', 'journal'],
      'Fitness': ['fitness', 'health', 'workout', 'gym', 'exercise'],
      'Education': ['education', 'learning', 'course', 'training', 'tutorial']
    };

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(keyword => lowerText.includes(keyword))) {
        return category;
      }
    }

    return 'Other';
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
          console.log(`✅ Added new subscription: ${subscription.serviceName} for user: ${this.userId}`);
        } else {
          // Update existing subscription
          const docRef = doc(db, 'subscriptions', existingDocs.docs[0].id);
          await updateDoc(docRef, {
            ...subscription,
            updatedAt: new Date().toISOString()
          });
          console.log(`🔄 Updated subscription: ${subscription.serviceName} for user: ${this.userId}`);
        }
      } catch (error) {
        console.error(`❌ Error saving subscription ${subscription.serviceName} for user ${this.userId}:`, error);
      }
    }
  }
}