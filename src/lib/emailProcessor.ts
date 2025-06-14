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

// 🎯 BALANCED RECEIPT VALIDATION - Not too strict, not too loose
const RECEIPT_KEYWORDS = {
  en: [
    // Clear receipt indicators
    'receipt', 'payment receipt', 'billing receipt', 'subscription receipt',
    'payment confirmation', 'billing confirmation', 'charge confirmation',
    'payment successful', 'payment processed', 'transaction receipt', 'purchase receipt',
    'subscription confirmed', 'renewal confirmation', 'billing statement',
    'thank you for your payment', 'payment complete', 'subscription renewed',
    // More flexible patterns
    'receipt for', 'payment for', 'billing for', 'charged for'
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
  ],
  
  de: [
    'quittung', 'rechnung', 'zahlungsbeleg', 'zahlungsbestätigung',
    'abonnement beleg', 'bezahlte rechnung'
  ]
};

// 🎯 FINANCIAL INDICATORS - More flexible
const FINANCIAL_INDICATORS = {
  en: [
    'amount', 'total', 'charged', 'paid', 'billed', 'payment', 'cost', 'price',
    'fee', 'subscription fee', 'monthly charge', 'annual fee', '$', 'USD'
  ],
  ar: [
    'المبلغ', 'المجموع', 'مدفوع', 'محصل', 'رسوم', 'قيمة', 'تكلفة'
  ],
  fr: [
    'montant', 'total', 'facturé', 'payé', 'frais', 'coût', 'prix'
  ],
  es: [
    'cantidad', 'total', 'cobrado', 'pagado', 'tarifa', 'costo', 'precio'
  ],
  de: [
    'betrag', 'gesamt', 'berechnet', 'bezahlt', 'gebühr', 'kosten', 'preis'
  ]
};

// 🎯 KNOWN SUBSCRIPTION SERVICES - Expanded list
const KNOWN_SERVICES = {
  // Streaming & Entertainment
  'netflix.com': { name: 'Netflix', category: 'Entertainment' },
  'spotify.com': { name: 'Spotify', category: 'Music' },
  'disney.com': { name: 'Disney+', category: 'Entertainment' },
  'hulu.com': { name: 'Hulu', category: 'Entertainment' },
  'amazon.com': { name: 'Amazon Prime', category: 'Entertainment' },
  'youtube.com': { name: 'YouTube Premium', category: 'Entertainment' },
  
  // Development & Professional
  'github.com': { name: 'GitHub', category: 'Development' },
  'stackblitz.com': { name: 'StackBlitz', category: 'Development' },
  'stripe.com': { name: 'StackBlitz Pro', category: 'Development' },
  'adobe.com': { name: 'Adobe Creative Cloud', category: 'Design' },
  'microsoft.com': { name: 'Microsoft 365', category: 'Productivity' },
  'google.com': { name: 'Google Workspace', category: 'Productivity' },
  'dropbox.com': { name: 'Dropbox', category: 'Storage' },
  'figma.com': { name: 'Figma', category: 'Design' },
  'notion.so': { name: 'Notion', category: 'Productivity' },
  'slack.com': { name: 'Slack', category: 'Communication' },
  'zoom.us': { name: 'Zoom', category: 'Communication' },
  
  // Dating & Social
  'tinder.com': { name: 'Tinder', category: 'Dating' },
  'gotinder.com': { name: 'Tinder', category: 'Dating' },
  'bumble.com': { name: 'Bumble', category: 'Dating' },
  'match.com': { name: 'Match.com', category: 'Dating' },
  
  // Regional Services
  'orange.ma': { name: 'Orange Morocco', category: 'Telecom' },
  'inwi.ma': { name: 'Inwi Morocco', category: 'Telecom' },
  'iam.ma': { name: 'Maroc Telecom', category: 'Telecom' },
  'shahid.net': { name: 'Shahid VIP', category: 'Entertainment' },
  'anghami.com': { name: 'Anghami Plus', category: 'Music' },
  'careem.com': { name: 'Careem Plus', category: 'Transportation' },
  
  // Gaming & Apps
  'king.com': { name: 'King Games', category: 'Gaming' },
  'supercell.com': { name: 'Supercell Games', category: 'Gaming' },
  'roblox.com': { name: 'Roblox Premium', category: 'Gaming' },
  'epicgames.com': { name: 'Epic Games', category: 'Gaming' },
  'play.google.com': { name: 'Google Play', category: 'Mobile Apps' },
  'apps.apple.com': { name: 'App Store', category: 'Mobile Apps' }
};

// 🎯 EXCLUSIONS - Only truly problematic patterns
const EXCLUSIONS = [
  'welcome to', 'getting started', 'account created', 'verify your email',
  'password reset', 'security alert', 'unsubscribe', 'account suspended',
  'payment failed', 'card declined', 'update payment method',
  'مرحبا بك', 'إنشاء الحساب', 'تأكيد البريد', 'إعادة تعيين',
  'bienvenue', 'compte créé', 'vérifiez votre email', 'réinitialisation'
];

// 🎯 FLEXIBLE CURRENCY PATTERNS
const CURRENCY_PATTERNS = [
  // USD
  { pattern: /\$(\d+(?:\.\d{2})?)/g, currency: 'USD' },
  { pattern: /(\d+(?:\.\d{2})?)\s*USD/gi, currency: 'USD' },
  
  // EUR
  { pattern: /€(\d+(?:[,\.]\d{2})?)/g, currency: 'EUR' },
  { pattern: /(\d+(?:[,\.]\d{2})?)\s*EUR/gi, currency: 'EUR' },
  
  // GBP
  { pattern: /£(\d+(?:\.\d{2})?)/g, currency: 'GBP' },
  
  // MAD - Moroccan Dirham
  { pattern: /(\d+(?:[,\.]\d{2})?)\s*(?:MAD|DH|dirham)/gi, currency: 'MAD' },
  { pattern: /(?:MAD|DH|dirham)\s*(\d+(?:[,\.]\d{2})?)/gi, currency: 'MAD' },
  
  // Arabic currencies
  { pattern: /(\d+(?:[,\.]\d{2})?)\s*(?:ريال|درهم|دينار)/g, currency: 'SAR' },
  
  // Fallback for any decimal number
  { pattern: /(\d+\.\d{2})/g, currency: 'USD' }
];

export class EmailProcessor {
  private userId: string;
  private tokenManager: GmailTokenManager;

  constructor(userId: string) {
    this.userId = userId;
    this.tokenManager = new GmailTokenManager(userId);
  }

  /**
   * Process emails for a specific year with CLEAN OUTPUT
   */
  async processEmailsForYear(year: number): Promise<DetectedSubscription[]> {
    try {
      console.log(`🔍 Starting processing for ${year} (user: ${this.userId})`);
      
      const isAuthorized = await this.tokenManager.isGmailAuthorized();
      if (!isAuthorized) {
        throw new Error('Gmail not authorized for this user');
      }

      const accessToken = await this.tokenManager.getValidAccessToken();
      if (!accessToken) {
        throw new Error('Unable to obtain valid access token');
      }

      // 🔍 COMPREHENSIVE SEARCH QUERIES - Cast a wider net
      const searchQueries = [
        // Basic receipt searches
        `receipt after:${year}/01/01 before:${year + 1}/01/01`,
        `payment after:${year}/01/01 before:${year + 1}/01/01`,
        `invoice after:${year}/01/01 before:${year + 1}/01/01`,
        `billing after:${year}/01/01 before:${year + 1}/01/01`,
        `subscription after:${year}/01/01 before:${year + 1}/01/01`,
        
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

      const detectedSubscriptions: DetectedSubscription[] = [];
      const processedEmailIds = new Set<string>();
      let totalEmailsProcessed = 0;
      let totalEmailsFound = 0;
      
      for (const searchQuery of searchQueries) {
        const response = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}&maxResults=100`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!response.ok) {
          continue;
        }

        const data = await response.json();
        const messages = data.messages || [];
        totalEmailsFound += messages.length;

        for (const message of messages) {
          if (processedEmailIds.has(message.id)) {
            continue;
          }
          processedEmailIds.add(message.id);
          totalEmailsProcessed++;

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
              continue;
            }

            const email = await emailResponse.json();
            const subscription = this.validateReceiptEmail(email, year);
            
            if (subscription) {
              // Check for duplicates
              const isDuplicate = detectedSubscriptions.some(existing => 
                existing.serviceName === subscription.serviceName && 
                Math.abs(existing.amount - subscription.amount) < 0.01 &&
                existing.currency === subscription.currency
              );
              
              if (!isDuplicate) {
                detectedSubscriptions.push(subscription);
                
                // 🎉 ONLY PRINT VALID SUBSCRIPTIONS
                const headers = email.payload?.headers || [];
                const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
                const body = this.extractEmailBodyWithDebug(email.payload);
                
                console.log(`\n✅ VALID SUBSCRIPTION FOUND:`);
                console.log(`🏢 SERVICE: ${subscription.serviceName}`);
                console.log(`💰 AMOUNT: ${subscription.currency} ${subscription.amount} (${subscription.billingCycle})`);
                console.log(`📧 SUBJECT: ${subject}`);
                console.log(`📄 BODY PREVIEW: ${body.substring(0, 200)}...`);
                console.log(`=======================================`);
              }
            }
          } catch (error) {
            // Silent error handling - don't clutter console
            continue;
          }
        }
      }

      console.log(`\n📊 FINAL SUMMARY FOR ${year}:`);
      console.log(`📧 Total emails scanned: ${totalEmailsFound}`);
      console.log(`🔍 Unique emails processed: ${totalEmailsProcessed}`);
      console.log(`✅ Valid subscriptions detected: ${detectedSubscriptions.length}`);
      
      if (detectedSubscriptions.length > 0) {
        console.log(`\n📋 ALL DETECTED SUBSCRIPTIONS:`);
        detectedSubscriptions.forEach((sub, index) => {
          console.log(`${index + 1}. ${sub.serviceName}: ${sub.currency} ${sub.amount} (${sub.billingCycle})`);
        });
      } else {
        console.log(`\n❌ No valid subscriptions found for ${year}`);
        console.log(`💡 This could mean:`);
        console.log(`   - No subscription receipts in ${year}`);
        console.log(`   - Receipts don't match our validation criteria`);
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
   * 🔍 BALANCED VALIDATION - No verbose logging
   */
  private validateReceiptEmail(email: any, year: number): DetectedSubscription | null {
    const headers = email.payload?.headers || [];
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
    const from = headers.find((h: any) => h.name === 'From')?.value || '';
    const date = headers.find((h: any) => h.name === 'Date')?.value || '';

    // Verify email is from the specified year
    const emailDate = new Date(date);
    const emailYear = emailDate.getFullYear();
    
    if (emailYear !== year) {
      return null;
    }

    const body = this.extractEmailBodyWithDebug(email.payload);
    const fullText = `${subject} ${body}`.toLowerCase();

    // STEP 1: Check exclusions
    const exclusionFound = EXCLUSIONS.find(exclusion => 
      fullText.includes(exclusion.toLowerCase())
    );
    
    if (exclusionFound) {
      return null;
    }

    // STEP 2: Language detection
    const language = this.detectLanguage(fullText);

    // STEP 3: Receipt keyword check
    const receiptKeywords = RECEIPT_KEYWORDS[language] || RECEIPT_KEYWORDS.en;
    const foundReceiptKeyword = receiptKeywords.find(keyword => 
      fullText.includes(keyword.toLowerCase())
    );

    if (!foundReceiptKeyword) {
      return null;
    }

    // STEP 4: Financial indicator check
    const financialIndicators = FINANCIAL_INDICATORS[language] || FINANCIAL_INDICATORS.en;
    const foundFinancialIndicator = financialIndicators.find(indicator => 
      fullText.includes(indicator.toLowerCase())
    );

    if (!foundFinancialIndicator) {
      return null;
    }

    // STEP 5: Amount extraction
    const amount = this.extractAmount(fullText, body, subject);
    if (!amount || amount.value < 0.5 || amount.value > 1000) {
      return null;
    }

    // STEP 6: Service identification
    const serviceInfo = this.identifyService(subject, from, fullText);
    if (!serviceInfo) {
      return null;
    }

    // STEP 7: Subscription context
    const subscriptionTerms = [
      'subscription', 'recurring', 'monthly', 'annual', 'plan', 'membership',
      'premium', 'pro', 'plus', 'renewal', 'اشتراك', 'abonnement', 'suscripción'
    ];
    
    const foundSubscriptionTerm = subscriptionTerms.find(term => 
      fullText.includes(term.toLowerCase())
    );

    if (!foundSubscriptionTerm) {
      return null;
    }

    // 🎉 ALL CHECKS PASSED!
    const billingCycle = this.determineBillingCycle(fullText);
    const nextPaymentDate = this.calculateNextPaymentDate(billingCycle);
    const status = this.determineStatus(fullText);

    return {
      userId: this.userId,
      serviceName: serviceInfo.name,
      amount: amount.value,
      currency: amount.currency,
      billingCycle,
      nextPaymentDate,
      category: serviceInfo.category,
      status,
      emailId: email.id,
      detectedAt: new Date().toISOString(),
      lastEmailDate: new Date(date).toISOString(),
      emailSubject: subject,
      confidence: 0.85,
      receiptType: 'payment_receipt',
      language,
      yearProcessed: year
    };
  }

  /**
   * Detect language from text content
   */
  private detectLanguage(text: string): string {
    const arabicPattern = /[\u0600-\u06FF]/;
    if (arabicPattern.test(text)) return 'ar';
    
    if (text.includes('reçu') || text.includes('facture') || text.includes('paiement')) return 'fr';
    if (text.includes('recibo') || text.includes('factura') || text.includes('pago')) return 'es';
    if (text.includes('quittung') || text.includes('rechnung') || text.includes('zahlung')) return 'de';
    
    return 'en';
  }

  /**
   * Extract domain from email address
   */
  private extractDomain(email: string): string {
    const match = email.match(/@([^>]+)/);
    return match ? match[1].toLowerCase() : '';
  }

  /**
   * Extract amount from text
   */
  private extractAmount(text: string, body: string, subject: string): { value: number; currency: string } | null {
    for (const pattern of CURRENCY_PATTERNS) {
      const matches = [...text.matchAll(pattern.pattern)];
      for (const match of matches) {
        let amount = parseFloat(match[1]);
        
        // Handle European decimal format
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
   * Identify service from email
   */
  private identifyService(subject: string, from: string, fullText: string): { name: string; category: string } | null {
    const domain = this.extractDomain(from);
    
    // Check known services
    for (const [serviceDomain, serviceInfo] of Object.entries(KNOWN_SERVICES)) {
      if (domain.includes(serviceDomain)) {
        return serviceInfo;
      }
    }

    // Try to extract service name from subject
    const subjectPatterns = [
      /receipt.*?for\s+(.+?)(?:\s|$)/i,
      /payment.*?for\s+(.+?)(?:\s|$)/i,
      /(.+?)\s+receipt/i,
      /(.+?)\s+payment/i
    ];
    
    for (const pattern of subjectPatterns) {
      const match = subject.match(pattern);
      if (match && match[1]) {
        const serviceName = match[1].trim();
        if (serviceName.length > 2 && serviceName.length < 50) {
          return {
            name: serviceName,
            category: 'Unknown Service'
          };
        }
      }
    }

    // Fallback: use domain name
    if (domain && !['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'].includes(domain)) {
      const serviceName = domain.split('.')[0];
      return {
        name: serviceName.charAt(0).toUpperCase() + serviceName.slice(1),
        category: 'Unknown Service'
      };
    }

    return null;
  }

  /**
   * Determine billing cycle
   */
  private determineBillingCycle(text: string): 'monthly' | 'yearly' | 'weekly' {
    if (text.includes('annual') || text.includes('yearly') || text.includes('year')) return 'yearly';
    if (text.includes('weekly') || text.includes('week')) return 'weekly';
    return 'monthly';
  }

  /**
   * Determine subscription status
   */
  private determineStatus(text: string): 'active' | 'trial' | 'cancelled' {
    if (text.includes('trial') || text.includes('free trial')) return 'trial';
    if (text.includes('cancelled') || text.includes('canceled')) return 'cancelled';
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
  private extractEmailBodyWithDebug(payload: any): string {
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