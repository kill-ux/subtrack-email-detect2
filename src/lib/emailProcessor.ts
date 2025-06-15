import { addDoc, collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from './firebase';
import { GmailTokenManager } from './gmailTokenManager';
import { GeminiValidator, GeminiValidationResult } from './geminiValidator';

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
  aiValidation?: {
    reasoning: string;
    confidence: number;
  };
}

export class EmailProcessor {
  private userId: string;
  private tokenManager: GmailTokenManager;
  private geminiValidator: GeminiValidator;

  constructor(userId: string) {
    this.userId = userId;
    this.tokenManager = new GmailTokenManager(userId);
    this.geminiValidator = new GeminiValidator();
  }

  /**
   * Process emails for a specific year with Gemini AI validation
   */
  async processEmailsForYear(year: number): Promise<DetectedSubscription[]> {
    try {
      console.log(`🤖 Starting AI-powered processing for ${year} (user: ${this.userId})`);
      
      const isAuthorized = await this.tokenManager.isGmailAuthorized();
      if (!isAuthorized) {
        throw new Error('Gmail not authorized for this user');
      }

      const accessToken = await this.tokenManager.getValidAccessToken();
      if (!accessToken) {
        throw new Error('Unable to obtain valid access token');
      }

      // 🔍 COMPREHENSIVE SEARCH QUERIES - Cast a wider net for AI analysis
      const searchQueries = [
        // Basic receipt searches
        `receipt after:${year}/01/01 before:${year + 1}/01/01`,
        `payment after:${year}/01/01 before:${year + 1}/01/01`,
        `invoice after:${year}/01/01 before:${year + 1}/01/01`,
        `billing after:${year}/01/01 before:${year + 1}/01/01`,
        `subscription after:${year}/01/01 before:${year + 1}/01/01`,
        `charged after:${year}/01/01 before:${year + 1}/01/01`,
        
        // Service-specific searches
        `from:stripe.com after:${year}/01/01 before:${year + 1}/01/01`,
        `from:netflix.com after:${year}/01/01 before:${year + 1}/01/01`,
        `from:spotify.com after:${year}/01/01 before:${year + 1}/01/01`,
        `from:github.com after:${year}/01/01 before:${year + 1}/01/01`,
        `from:stackblitz.com after:${year}/01/01 before:${year + 1}/01/01`,
        `from:tinder.com after:${year}/01/01 before:${year + 1}/01/01`,
        `from:gotinder.com after:${year}/01/01 before:${year + 1}/01/01`,
        
        // Currency-based searches
        `$ after:${year}/01/01 before:${year + 1}/01/01`,
        `EUR after:${year}/01/01 before:${year + 1}/01/01`,
        `MAD after:${year}/01/01 before:${year + 1}/01/01`,
        
        // Arabic searches
        `إيصال after:${year}/01/01 before:${year + 1}/01/01`,
        `فاتورة after:${year}/01/01 before:${year + 1}/01/01`,
        
        // French searches
        `reçu after:${year}/01/01 before:${year + 1}/01/01`,
        `facture after:${year}/01/01 before:${year + 1}/01/01`
      ];

      const candidateEmails: Array<{
        id: string;
        subject: string;
        body: string;
        fromEmail: string;
        date: string;
        fullEmail: any;
      }> = [];
      
      const processedEmailIds = new Set<string>();
      let totalEmailsFound = 0;
      
      // 📧 STEP 1: Collect candidate emails
      console.log(`📧 Step 1: Collecting candidate emails for ${year}...`);
      
      for (const searchQuery of searchQueries) {
        const response = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}&maxResults=50`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!response.ok) continue;

        const data = await response.json();
        const messages = data.messages || [];
        totalEmailsFound += messages.length;

        for (const message of messages) {
          if (processedEmailIds.has(message.id)) continue;
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

            if (!emailResponse.ok) continue;

            const email = await emailResponse.json();
            const headers = email.payload?.headers || [];
            const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
            const from = headers.find((h: any) => h.name === 'From')?.value || '';
            const date = headers.find((h: any) => h.name === 'Date')?.value || '';

            // Verify email is from the specified year
            const emailDate = new Date(date);
            const emailYear = emailDate.getFullYear();
            
            if (emailYear !== year) continue;

            const body = this.extractEmailBody(email.payload);
            
            candidateEmails.push({
              id: message.id,
              subject,
              body,
              fromEmail: from,
              date,
              fullEmail: email
            });
          } catch (error) {
            // Silent error handling
            continue;
          }
        }
      }

      console.log(`📊 Collected ${candidateEmails.length} candidate emails from ${totalEmailsFound} total emails`);

      // 🤖 STEP 2: AI Validation with Gemini
      console.log(`🤖 Step 2: AI validation with Gemini for ${candidateEmails.length} emails...`);
      
      const detectedSubscriptions: DetectedSubscription[] = [];
      
      // Process emails in batches to avoid overwhelming the API
      const batchSize = 10;
      for (let i = 0; i < candidateEmails.length; i += batchSize) {
        const batch = candidateEmails.slice(i, i + batchSize);
        console.log(`🔍 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(candidateEmails.length/batchSize)} (${batch.length} emails)`);
        
        for (const email of batch) {
          const aiResult = await this.geminiValidator.validateSubscriptionEmail(
            email.subject,
            email.body,
            email.fromEmail
          );

          if (aiResult && aiResult.isValidSubscription && aiResult.confidence > 0.7) {
            // 🎉 VALID SUBSCRIPTION FOUND!
            const subscription = this.createSubscriptionFromAI(email, aiResult, year);
            detectedSubscriptions.push(subscription);
            
            // 🎉 ONLY PRINT VALID SUBSCRIPTIONS
            console.log(`\n✅ GEMINI AI VALIDATED SUBSCRIPTION:`);
            console.log(`🏢 SERVICE: ${aiResult.serviceName}`);
            console.log(`💰 AMOUNT: ${aiResult.currency} ${aiResult.amount} (${aiResult.billingCycle})`);
            console.log(`📧 SUBJECT: ${email.subject}`);
            console.log(`🤖 AI CONFIDENCE: ${(aiResult.confidence * 100).toFixed(1)}%`);
            console.log(`💭 AI REASONING: ${aiResult.reasoning}`);
            console.log(`📄 BODY PREVIEW: ${email.body.substring(0, 200)}...`);
            console.log(`=======================================`);
          }
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      console.log(`\n📊 FINAL AI SUMMARY FOR ${year}:`);
      console.log(`📧 Total emails scanned: ${totalEmailsFound}`);
      console.log(`🔍 Candidate emails analyzed: ${candidateEmails.length}`);
      console.log(`🤖 AI-validated subscriptions: ${detectedSubscriptions.length}`);
      
      if (detectedSubscriptions.length > 0) {
        console.log(`\n📋 ALL AI-VALIDATED SUBSCRIPTIONS:`);
        detectedSubscriptions.forEach((sub, index) => {
          console.log(`${index + 1}. ${sub.serviceName}: ${sub.currency} ${sub.amount} (${sub.billingCycle}) - Confidence: ${(sub.confidence * 100).toFixed(1)}%`);
        });
      } else {
        console.log(`\n❌ No valid subscriptions found by AI for ${year}`);
        console.log(`💡 This could mean:`);
        console.log(`   - No subscription receipts in ${year}`);
        console.log(`   - Receipts don't meet AI validation criteria`);
        console.log(`   - Different email format than expected`);
      }

      await this.saveSubscriptionsForYear(detectedSubscriptions, year);
      return detectedSubscriptions;
    } catch (error) {
      console.error(`❌ Error processing ${year} emails:`, error);
      throw error;
    }
  }

  /**
   * Create subscription object from AI validation result
   */
  private createSubscriptionFromAI(
    email: any, 
    aiResult: GeminiValidationResult, 
    year: number
  ): DetectedSubscription {
    const nextPaymentDate = this.calculateNextPaymentDate(aiResult.billingCycle);
    const status = this.determineStatusFromAI(email.body);

    return {
      userId: this.userId,
      serviceName: aiResult.serviceName,
      amount: aiResult.amount,
      currency: aiResult.currency,
      billingCycle: aiResult.billingCycle,
      nextPaymentDate,
      category: aiResult.category,
      status,
      emailId: email.id,
      detectedAt: new Date().toISOString(),
      lastEmailDate: new Date(email.date).toISOString(),
      emailSubject: email.subject,
      confidence: aiResult.confidence,
      receiptType: 'ai_validated_receipt',
      yearProcessed: year,
      aiValidation: {
        reasoning: aiResult.reasoning,
        confidence: aiResult.confidence
      }
    };
  }

  /**
   * Determine subscription status from email content
   */
  private determineStatusFromAI(body: string): 'active' | 'trial' | 'cancelled' {
    const lowerBody = body.toLowerCase();
    if (lowerBody.includes('trial') || lowerBody.includes('free trial')) return 'trial';
    if (lowerBody.includes('cancelled') || lowerBody.includes('canceled')) return 'cancelled';
    return 'active';
  }

  /**
   * Calculate next payment date
   */
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

  /**
   * Enhanced email body extraction
   */
  private extractEmailBody(payload: any): string {
    let extractedBody = '';

    if (payload.body?.data) {
      try {
        extractedBody = this.decodeBase64Url(payload.body.data);
        if (extractedBody.length > 0) {
          return extractedBody;
        }
      } catch (e) {
        // Silent error handling
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
            // Silent error handling
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

  /**
   * Base64 URL decoding
   */
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

  /**
   * Original method - calls processEmailsForYear with current year
   */
  async processEmails(): Promise<DetectedSubscription[]> {
    const currentYear = new Date().getFullYear();
    return this.processEmailsForYear(currentYear);
  }

  /**
   * Save subscriptions for specific year
   */
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
        const existingForYear = existingDocs.docs.find(doc => {
          const data = doc.data();
          return data.yearProcessed === year;
        });
        
        if (!existingForYear) {
          await addDoc(subscriptionsRef, {
            ...subscription,
            yearProcessed: year
          });
        } else {
          const docRef = doc(db, 'subscriptions', existingForYear.id);
          await updateDoc(docRef, {
            ...subscription,
            yearProcessed: year,
            updatedAt: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error(`❌ Error saving subscription ${subscription.serviceName}:`, error);
      }
    }
  }
}