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

// 🎯 TRADITIONAL VALIDATION PATTERNS - For initial filtering
const RECEIPT_KEYWORDS = {
  en: [
    'receipt', 'payment receipt', 'billing receipt', 'subscription receipt',
    'payment confirmation', 'billing confirmation', 'charge confirmation',
    'payment successful', 'payment processed', 'transaction receipt', 'purchase receipt',
    'subscription confirmed', 'renewal confirmation', 'billing statement',
    'thank you for your payment', 'payment complete', 'subscription renewed',
    'receipt for', 'payment for', 'billing for', 'charged for', 'invoice'
  ],
  
  ar: [
    'إيصال', 'فاتورة', 'إيصال الدفع', 'تأكيد الدفع', 'إيصال الاشتراك',
    'فاتورة الخدمة', 'إيصال المعاملة', 'تأكيد الشراء', 'وصل'
  ],
  
  fr: [
    'reçu', 'facture', 'reçu de paiement', 'confirmation de paiement',
    'reçu d\'abonnement', 'facture payée', 'reçu de transaction'
  ],
  
  es: [
    'recibo', 'factura', 'recibo de pago', 'confirmación de pago',
    'recibo de suscripción', 'factura pagada'
  ]
};

const FINANCIAL_INDICATORS = [
  'amount', 'total', 'charged', 'paid', 'billed', 'payment', 'cost', 'price',
  'fee', 'subscription fee', 'monthly charge', 'annual fee', '$', 'USD', 'EUR', 'MAD'
];

const SUBSCRIPTION_TERMS = [
  'subscription', 'recurring', 'monthly', 'annual', 'plan', 'membership',
  'premium', 'pro', 'plus', 'renewal', 'اشتراك', 'abonnement', 'suscripción'
];

const EXCLUSIONS = [
  'welcome to', 'getting started', 'account created', 'verify your email',
  'password reset', 'security alert', 'unsubscribe', 'account suspended',
  'payment failed', 'card declined', 'update payment method', 'free trial',
  'مرحبا بك', 'إنشاء الحساب', 'تأكيد البريد', 'bienvenue', 'compte créé'
];

const CURRENCY_PATTERNS = [
  { pattern: /\$(\d+(?:\.\d{2})?)/g, currency: 'USD' },
  { pattern: /(\d+(?:\.\d{2})?)\s*USD/gi, currency: 'USD' },
  { pattern: /€(\d+(?:[,\.]\d{2})?)/g, currency: 'EUR' },
  { pattern: /(\d+(?:[,\.]\d{2})?)\s*EUR/gi, currency: 'EUR' },
  { pattern: /£(\d+(?:\.\d{2})?)/g, currency: 'GBP' },
  { pattern: /(\d+(?:[,\.]\d{2})?)\s*(?:MAD|DH|dirham)/gi, currency: 'MAD' },
  { pattern: /(\d+\.\d{2})/g, currency: 'USD' }
];

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
   * 🎯 TWO-STAGE VALIDATION: Traditional filtering + AI validation
   */
  async processEmailsForYear(year: number): Promise<DetectedSubscription[]> {
    try {
      console.log(`🎯 Starting TWO-STAGE validation for ${year} (user: ${this.userId})`);
      
      const isAuthorized = await this.tokenManager.isGmailAuthorized();
      if (!isAuthorized) {
        throw new Error('Gmail not authorized for this user');
      }

      const accessToken = await this.tokenManager.getValidAccessToken();
      if (!accessToken) {
        throw new Error('Unable to obtain valid access token');
      }

      // 📧 STAGE 1: Traditional validation to gather candidates
      console.log(`📧 STAGE 1: Traditional validation to gather candidates...`);
      const candidateEmails = await this.gatherCandidateEmails(accessToken, year);
      
      console.log(`📊 Stage 1 Results: ${candidateEmails.length} candidate emails passed traditional validation`);

      if (candidateEmails.length === 0) {
        console.log(`❌ No candidate emails found for ${year}`);
        return [];
      }

      // 🤖 STAGE 2: AI validation of candidates
      console.log(`🤖 STAGE 2: AI validation of ${candidateEmails.length} candidates...`);
      const detectedSubscriptions = await this.validateCandidatesWithAI(candidateEmails, year);

      console.log(`\n📊 FINAL TWO-STAGE SUMMARY FOR ${year}:`);
      console.log(`📧 Stage 1 (Traditional): ${candidateEmails.length} candidates`);
      console.log(`🤖 Stage 2 (AI Validated): ${detectedSubscriptions.length} subscriptions`);
      console.log(`🎯 Success Rate: ${candidateEmails.length > 0 ? ((detectedSubscriptions.length / candidateEmails.length) * 100).toFixed(1) : 0}%`);
      
      if (detectedSubscriptions.length > 0) {
        console.log(`\n📋 ALL AI-VALIDATED SUBSCRIPTIONS:`);
        detectedSubscriptions.forEach((sub, index) => {
          console.log(`${index + 1}. ${sub.serviceName}: ${sub.currency} ${sub.amount} (${sub.billingCycle}) - AI Confidence: ${(sub.confidence * 100).toFixed(1)}%`);
        });
      }

      await this.saveSubscriptionsForYear(detectedSubscriptions, year);
      return detectedSubscriptions;
    } catch (error) {
      console.error(`❌ Error in two-stage processing for ${year}:`, error);
      throw error;
    }
  }

  /**
   * 📧 STAGE 1: Gather candidate emails using traditional validation
   */
  private async gatherCandidateEmails(accessToken: string, year: number): Promise<Array<{
    id: string;
    subject: string;
    body: string;
    fromEmail: string;
    date: string;
    fullEmail: any;
  }>> {
    const searchQueries = [
      `receipt after:${year}/01/01 before:${year + 1}/01/01`,
      `payment after:${year}/01/01 before:${year + 1}/01/01`,
      `invoice after:${year}/01/01 before:${year + 1}/01/01`,
      `billing after:${year}/01/01 before:${year + 1}/01/01`,
      `subscription after:${year}/01/01 before:${year + 1}/01/01`,
      `charged after:${year}/01/01 before:${year + 1}/01/01`,
      `from:stripe.com after:${year}/01/01 before:${year + 1}/01/01`,
      `from:netflix.com after:${year}/01/01 before:${year + 1}/01/01`,
      `from:spotify.com after:${year}/01/01 before:${year + 1}/01/01`,
      `from:github.com after:${year}/01/01 before:${year + 1}/01/01`,
      `from:stackblitz.com after:${year}/01/01 before:${year + 1}/01/01`,
      `from:tinder.com after:${year}/01/01 before:${year + 1}/01/01`,
      `$ after:${year}/01/01 before:${year + 1}/01/01`,
      `EUR after:${year}/01/01 before:${year + 1}/01/01`,
      `MAD after:${year}/01/01 before:${year + 1}/01/01`,
      `إيصال after:${year}/01/01 before:${year + 1}/01/01`,
      `فاتورة after:${year}/01/01 before:${year + 1}/01/01`,
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
    let totalEmailsScanned = 0;
    
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
      totalEmailsScanned += messages.length;

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
          
          // 🎯 TRADITIONAL VALIDATION
          if (this.passesTraditionalValidation(subject, body, from)) {
            candidateEmails.push({
              id: message.id,
              subject,
              body,
              fromEmail: from,
              date,
              fullEmail: email
            });
            
            console.log(`✅ Traditional validation passed: ${subject.substring(0, 60)}...`);
          }
        } catch (error) {
          continue;
        }
      }
    }

    console.log(`📊 Traditional validation: ${candidateEmails.length} candidates from ${totalEmailsScanned} emails scanned`);
    return candidateEmails;
  }

  /**
   * 🎯 Traditional validation logic
   */
  private passesTraditionalValidation(subject: string, body: string, fromEmail: string): boolean {
    const fullText = `${subject} ${body}`.toLowerCase();

    // Check exclusions first
    const hasExclusion = EXCLUSIONS.some(exclusion => 
      fullText.includes(exclusion.toLowerCase())
    );
    if (hasExclusion) return false;

    // Must have receipt keywords
    const allReceiptKeywords = [
      ...RECEIPT_KEYWORDS.en,
      ...RECEIPT_KEYWORDS.ar,
      ...RECEIPT_KEYWORDS.fr,
      ...RECEIPT_KEYWORDS.es
    ];
    
    const hasReceiptKeyword = allReceiptKeywords.some(keyword => 
      fullText.includes(keyword.toLowerCase())
    );
    if (!hasReceiptKeyword) return false;

    // Must have financial indicators
    const hasFinancialIndicator = FINANCIAL_INDICATORS.some(indicator => 
      fullText.includes(indicator.toLowerCase())
    );
    if (!hasFinancialIndicator) return false;

    // Must have subscription terms
    const hasSubscriptionTerm = SUBSCRIPTION_TERMS.some(term => 
      fullText.includes(term.toLowerCase())
    );
    if (!hasSubscriptionTerm) return false;

    // Must have amount
    const hasAmount = this.extractAmount(fullText);
    if (!hasAmount || hasAmount.value < 0.5 || hasAmount.value > 1000) return false;

    return true;
  }

  /**
   * 🤖 STAGE 2: Validate candidates with AI
   */
  private async validateCandidatesWithAI(
    candidateEmails: Array<{
      id: string;
      subject: string;
      body: string;
      fromEmail: string;
      date: string;
      fullEmail: any;
    }>,
    year: number
  ): Promise<DetectedSubscription[]> {
    const detectedSubscriptions: DetectedSubscription[] = [];
    
    // Process in smaller batches to avoid rate limiting
    const batchSize = 5;
    for (let i = 0; i < candidateEmails.length; i += batchSize) {
      const batch = candidateEmails.slice(i, i + batchSize);
      console.log(`🤖 AI validating batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(candidateEmails.length/batchSize)} (${batch.length} emails)`);
      
      for (const email of batch) {
        console.log(`🔍 AI analyzing: ${email.subject.substring(0, 50)}...`);
        
        const aiResult = await this.geminiValidator.validateSubscriptionEmail(
          email.subject,
          email.body,
          email.fromEmail
        );

        if (aiResult && aiResult.isValidSubscription && aiResult.confidence > 0.7) {
          const subscription = this.createSubscriptionFromAI(email, aiResult, year);
          detectedSubscriptions.push(subscription);
          
          // 🎉 ONLY PRINT AI-VALIDATED SUBSCRIPTIONS
          console.log(`\n✅ AI VALIDATED SUBSCRIPTION:`);
          console.log(`🏢 SERVICE: ${aiResult.serviceName}`);
          console.log(`💰 AMOUNT: ${aiResult.currency} ${aiResult.amount} (${aiResult.billingCycle})`);
          console.log(`📧 SUBJECT: ${email.subject}`);
          console.log(`🤖 AI CONFIDENCE: ${(aiResult.confidence * 100).toFixed(1)}%`);
          console.log(`💭 AI REASONING: ${aiResult.reasoning}`);
          console.log(`=======================================`);
        } else if (aiResult) {
          console.log(`❌ AI rejected: ${email.subject.substring(0, 50)}... (Confidence: ${(aiResult.confidence * 100).toFixed(1)}%)`);
        }
        
        // Rate limiting between AI calls
        await new Promise(resolve => setTimeout(resolve, 1200));
      }
    }

    return detectedSubscriptions;
  }

  /**
   * Extract amount from text
   */
  private extractAmount(text: string): { value: number; currency: string } | null {
    for (const pattern of CURRENCY_PATTERNS) {
      const matches = [...text.matchAll(pattern.pattern)];
      for (const match of matches) {
        let amount = parseFloat(match[1]);
        
        if (match[0].includes(',') && !match[0].includes('.')) {
          amount = parseFloat(match[1].replace(',', '.'));
        }
        
        if (amount > 0 && amount < 1000) {
          return { value: amount, currency: pattern.currency };
        }
      }
    }
    return null;
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
      receiptType: 'two_stage_validated',
      yearProcessed: year,
      aiValidation: {
        reasoning: aiResult.reasoning,
        confidence: aiResult.confidence
      }
    };
  }

  private determineStatusFromAI(body: string): 'active' | 'trial' | 'cancelled' {
    const lowerBody = body.toLowerCase();
    if (lowerBody.includes('trial') || lowerBody.includes('free trial')) return 'trial';
    if (lowerBody.includes('cancelled') || lowerBody.includes('canceled')) return 'cancelled';
    return 'active';
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