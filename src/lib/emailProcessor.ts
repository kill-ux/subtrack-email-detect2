import { google } from 'googleapis';
import { addDoc, collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from './firebase';

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
  'auto-renewal', 'membership', 'premium', 'pro plan'
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
  canva: { name: 'Canva', category: 'Design' }
};

export class EmailProcessor {
  private oauth2Client: any;
  private gmail: any;

  constructor(tokens: any) {
    this.oauth2Client = new google.auth.OAuth2(
      '616003184852-2sjlhqid5sfme4lg3q3n1c6bc14sc7tv.apps.googleusercontent.com',
      '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',
      `${window.location.origin}/auth/callback`
    );
    
    this.oauth2Client.setCredentials(tokens);
    this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
  }

  async processEmails(userId: string): Promise<DetectedSubscription[]> {
    try {
      // Search for emails with subscription-related keywords
      const searchQuery = SUBSCRIPTION_KEYWORDS.map(keyword => `"${keyword}"`).join(' OR ');
      
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        maxResults: 100,
        q: `${searchQuery} after:${this.getDateOneYearAgo()}`
      });

      const messages = response.data.messages || [];
      const detectedSubscriptions: DetectedSubscription[] = [];

      for (const message of messages) {
        try {
          const email = await this.gmail.users.messages.get({
            userId: 'me',
            id: message.id,
            format: 'full'
          });

          const subscription = this.extractSubscriptionInfo(email.data, userId);
          if (subscription) {
            detectedSubscriptions.push(subscription);
          }
        } catch (error) {
          console.error('Error processing email:', error);
        }
      }

      // Save to Firebase
      await this.saveSubscriptions(detectedSubscriptions);
      
      return detectedSubscriptions;
    } catch (error) {
      console.error('Error processing emails:', error);
      throw error;
    }
  }

  private extractSubscriptionInfo(email: any, userId: string): DetectedSubscription | null {
    const headers = email.payload?.headers || [];
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
    const from = headers.find((h: any) => h.name === 'From')?.value || '';
    const date = headers.find((h: any) => h.name === 'Date')?.value || '';

    // Get email body
    const body = this.extractEmailBody(email.payload);
    const fullText = `${subject} ${body}`.toLowerCase();

    // Extract amount
    const amountMatch = fullText.match(/\$(\d+(?:\.\d{2})?)/);
    if (!amountMatch) return null;

    const amount = parseFloat(amountMatch[1]);
    if (amount < 1) return null; // Filter out very small amounts

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
      userId,
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
      return Buffer.from(payload.body.data, 'base64').toString();
    }
    
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          return Buffer.from(part.body.data, 'base64').toString();
        }
      }
    }
    
    return payload.snippet || '';
  }

  private extractServiceName(subject: string, from: string, fullText: string): string {
    // Check against known service patterns
    for (const [pattern, service] of Object.entries(SERVICE_PATTERNS)) {
      if (fullText.includes(pattern) || from.toLowerCase().includes(pattern)) {
        return service.name;
      }
    }

    // Extract from email address
    const emailMatch = from.match(/@([^.]+)/);
    if (emailMatch) {
      const domain = emailMatch[1];
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

    // Category keywords
    const categoryKeywords = {
      'Entertainment': ['streaming', 'video', 'movie', 'tv', 'entertainment', 'media'],
      'Music': ['music', 'audio', 'podcast', 'sound'],
      'Productivity': ['productivity', 'office', 'workspace', 'collaboration', 'project'],
      'Development': ['development', 'developer', 'code', 'programming', 'api'],
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
        } else {
          // Update existing subscription
          const docRef = doc(db, 'subscriptions', existingDocs.docs[0].id);
          await updateDoc(docRef, {
            ...subscription,
            updatedAt: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error('Error saving subscription:', error);
      }
    }
  }
}