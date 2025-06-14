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

// 🎯 ULTRA-STRICT RECEIPT VALIDATION ALGORITHM
// Only the most reliable receipt indicators across multiple languages

const STRICT_RECEIPT_KEYWORDS = {
  // English - ONLY clear receipt indicators
  en: [
    'receipt for your payment', 'payment receipt', 'billing receipt', 'subscription receipt',
    'invoice for', 'payment confirmation', 'billing confirmation', 'charge confirmation',
    'payment successful', 'payment processed', 'transaction receipt', 'purchase receipt',
    'subscription confirmed', 'renewal confirmation', 'billing statement',
    'thank you for your payment', 'payment complete', 'subscription renewed'
  ],
  
  // Arabic - ONLY clear receipt indicators
  ar: [
    'إيصال الدفع', 'إيصال الفاتورة', 'إيصال الاشتراك', 'تأكيد الدفع',
    'فاتورة الخدمة', 'إيصال المعاملة', 'تأكيد الشراء', 'تم الدفع بنجاح',
    'إيصال رسمي', 'وصل دفع', 'فاتورة مدفوعة'
  ],
  
  // French - ONLY clear receipt indicators
  fr: [
    'reçu de paiement', 'reçu de facturation', 'reçu d\'abonnement', 'confirmation de paiement',
    'facture payée', 'reçu de transaction', 'confirmation d\'achat', 'paiement confirmé',
    'reçu officiel', 'facture réglée'
  ],
  
  // Spanish - ONLY clear receipt indicators
  es: [
    'recibo de pago', 'recibo de facturación', 'recibo de suscripción', 'confirmación de pago',
    'factura pagada', 'recibo de transacción', 'confirmación de compra', 'pago confirmado'
  ],
  
  // German - ONLY clear receipt indicators
  de: [
    'zahlungsbeleg', 'rechnungsbeleg', 'abonnement beleg', 'zahlungsbestätigung',
    'bezahlte rechnung', 'transaktionsbeleg', 'kaufbestätigung', 'zahlung bestätigt'
  ]
};

// 🎯 FINANCIAL TRANSACTION PROOF - Must have clear money indicators
const STRICT_FINANCIAL_INDICATORS = {
  en: [
    'amount charged', 'total charged', 'payment of', 'charged to your card',
    'billed amount', 'transaction amount', 'payment amount', 'invoice amount',
    'subscription fee', 'monthly charge', 'annual fee', 'billing total',
    'amount paid', 'total paid', 'payment processed for'
  ],
  ar: [
    'المبلغ المدفوع', 'إجمالي المبلغ', 'قيمة الدفع', 'المبلغ المحصل',
    'رسوم الاشتراك', 'قيمة الفاتورة', 'المبلغ المستحق'
  ],
  fr: [
    'montant facturé', 'total facturé', 'paiement de', 'montant débité',
    'frais d\'abonnement', 'montant payé', 'total payé'
  ],
  es: [
    'cantidad cobrada', 'total cobrado', 'pago de', 'cantidad debitada',
    'tarifa de suscripción', 'cantidad pagada', 'total pagado'
  ],
  de: [
    'betrag berechnet', 'gesamtbetrag', 'zahlung von', 'betrag belastet',
    'abonnementgebühr', 'betrag bezahlt', 'gesamtbetrag bezahlt'
  ]
};

// 🎯 SUBSCRIPTION SERVICE DOMAINS - Known legitimate subscription services
const TRUSTED_SUBSCRIPTION_DOMAINS = [
  // Streaming & Entertainment
  'netflix.com', 'spotify.com', 'disney.com', 'hulu.com', 'amazon.com',
  'youtube.com', 'twitch.tv', 'paramount.com', 'hbo.com', 'peacocktv.com',
  
  // Development & Professional
  'github.com', 'stackblitz.com', 'stripe.com', 'adobe.com', 'microsoft.com',
  'google.com', 'dropbox.com', 'figma.com', 'notion.so', 'slack.com',
  'zoom.us', 'atlassian.com', 'jetbrains.com', 'vercel.com',
  
  // Dating & Social
  'tinder.com', 'gotinder.com', 'bumble.com', 'match.com', 'eharmony.com',
  
  // Regional Services
  'orange.ma', 'inwi.ma', 'iam.ma', 'shahid.net', 'anghami.com',
  'careem.com', 'canalplus.com', 'deezer.com', 'molotov.tv',
  
  // Gaming & Apps
  'king.com', 'supercell.com', 'roblox.com', 'epicgames.com',
  'play.google.com', 'apps.apple.com'
];

// 🎯 HARD EXCLUSIONS - Never allow these patterns
const ABSOLUTE_EXCLUSIONS = [
  // English
  'welcome to', 'getting started', 'account created', 'verify your email',
  'password reset', 'security alert', 'promotional', 'marketing email',
  'newsletter', 'unsubscribe', 'free trial started', 'trial activated',
  'account suspended', 'payment failed', 'card declined', 'update payment',
  
  // Arabic
  'مرحبا بك', 'البدء', 'إنشاء الحساب', 'تأكيد البريد الإلكتروني',
  'إعادة تعيين كلمة المرور', 'تنبيه أمني', 'ترويجي', 'بريد تسويقي',
  
  // French
  'bienvenue', 'commencer', 'compte créé', 'vérifiez votre email',
  'réinitialisation du mot de passe', 'alerte de sécurité', 'promotionnel',
  
  // Spanish
  'bienvenido', 'empezar', 'cuenta creada', 'verificar email',
  'restablecer contraseña', 'alerta de seguridad', 'promocional',
  
  // German
  'willkommen', 'erste schritte', 'konto erstellt', 'email bestätigen',
  'passwort zurücksetzen', 'sicherheitswarnung', 'werbung'
];

// 🎯 ENHANCED CURRENCY PATTERNS - More precise detection
const PRECISE_CURRENCY_PATTERNS = [
  // USD - Must be clear dollar amounts
  { pattern: /(?:amount|total|charged|paid|billed).*?\$(\d+(?:\.\d{2})?)/gi, currency: 'USD' },
  { pattern: /\$(\d+(?:\.\d{2})?)\s*(?:charged|paid|billed|total)/gi, currency: 'USD' },
  { pattern: /payment\s*of\s*\$(\d+(?:\.\d{2})?)/gi, currency: 'USD' },
  
  // EUR - Must be clear euro amounts
  { pattern: /(?:amount|total|charged|paid|billed).*?€(\d+(?:[,\.]\d{2})?)/gi, currency: 'EUR' },
  { pattern: /€(\d+(?:[,\.]\d{2})?)\s*(?:charged|paid|billed|total)/gi, currency: 'EUR' },
  { pattern: /payment\s*of\s*€(\d+(?:[,\.]\d{2})?)/gi, currency: 'EUR' },
  
  // MAD - Moroccan Dirham with context
  { pattern: /(?:amount|total|charged|paid|billed).*?(\d+(?:[,\.]\d{2})?)\s*(?:MAD|DH|dirham)/gi, currency: 'MAD' },
  { pattern: /(?:MAD|DH|dirham)\s*(\d+(?:[,\.]\d{2})?)\s*(?:charged|paid|billed)/gi, currency: 'MAD' },
  { pattern: /payment\s*of\s*(\d+(?:[,\.]\d{2})?)\s*(?:MAD|DH|dirham)/gi, currency: 'MAD' },
  
  // GBP - British Pound
  { pattern: /(?:amount|total|charged|paid|billed).*?£(\d+(?:\.\d{2})?)/gi, currency: 'GBP' },
  { pattern: /£(\d+(?:\.\d{2})?)\s*(?:charged|paid|billed|total)/gi, currency: 'GBP' },
  
  // Arabic currencies with context
  { pattern: /(?:المبلغ|المجموع|المدفوع).*?(\d+(?:[,\.]\d{2})?)\s*(?:ريال|درهم|دينار)/g, currency: 'SAR' },
  { pattern: /(?:ريال|درهم|دينار)\s*(\d+(?:[,\.]\d{2})?)\s*(?:مدفوع|محصل)/g, currency: 'SAR' }
];

export class EmailProcessor {
  private userId: string;
  private tokenManager: GmailTokenManager;

  constructor(userId: string) {
    this.userId = userId;
    this.tokenManager = new GmailTokenManager(userId);
  }

  /**
   * Process emails for a specific year with ULTRA-STRICT validation
   */
  async processEmailsForYear(year: number): Promise<DetectedSubscription[]> {
    try {
      console.log(`🎯 Starting ULTRA-STRICT processing for ${year} (user: ${this.userId})`);
      
      const isAuthorized = await this.tokenManager.isGmailAuthorized();
      if (!isAuthorized) {
        throw new Error('Gmail not authorized for this user');
      }

      const accessToken = await this.tokenManager.getValidAccessToken();
      if (!accessToken) {
        throw new Error('Unable to obtain valid access token');
      }

      // 🎯 ULTRA-FOCUSED SEARCH QUERIES - Only the most reliable patterns
      const searchQueries = [
        // English - ONLY clear receipt patterns
        `"payment receipt" after:${year}/01/01 before:${year + 1}/01/01`,
        `"billing receipt" after:${year}/01/01 before:${year + 1}/01/01`,
        `"subscription receipt" after:${year}/01/01 before:${year + 1}/01/01`,
        `"payment confirmation" after:${year}/01/01 before:${year + 1}/01/01`,
        `"thank you for your payment" after:${year}/01/01 before:${year + 1}/01/01`,
        `"payment successful" after:${year}/01/01 before:${year + 1}/01/01`,
        
        // Arabic - ONLY clear receipt patterns
        `"إيصال الدفع" after:${year}/01/01 before:${year + 1}/01/01`,
        `"تأكيد الدفع" after:${year}/01/01 before:${year + 1}/01/01`,
        `"فاتورة مدفوعة" after:${year}/01/01 before:${year + 1}/01/01`,
        
        // French - ONLY clear receipt patterns
        `"reçu de paiement" after:${year}/01/01 before:${year + 1}/01/01`,
        `"confirmation de paiement" after:${year}/01/01 before:${year + 1}/01/01`,
        
        // Trusted domain searches with payment context
        `from:stripe.com "payment" after:${year}/01/01 before:${year + 1}/01/01`,
        `from:netflix.com "payment" after:${year}/01/01 before:${year + 1}/01/01`,
        `from:spotify.com "payment" after:${year}/01/01 before:${year + 1}/01/01`,
        `from:github.com "payment" after:${year}/01/01 before:${year + 1}/01/01`,
        `from:stackblitz.com "payment" after:${year}/01/01 before:${year + 1}/01/01`
      ];

      const detectedSubscriptions: DetectedSubscription[] = [];
      const processedEmailIds = new Set<string>();
      
      for (const searchQuery of searchQueries) {
        console.log(`🔍 ULTRA-STRICT search (${year}): ${searchQuery}`);
        
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
          console.warn(`⚠️ Search query failed: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const messages = data.messages || [];
        
        console.log(`📧 Found ${messages.length} potential emails for ${year} query`);

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
            const subscription = this.validateReceiptWithUltraStrictAlgorithm(email, year);
            
            if (subscription) {
              // Check for duplicates
              const isDuplicate = detectedSubscriptions.some(existing => 
                existing.serviceName === subscription.serviceName && 
                Math.abs(existing.amount - subscription.amount) < 0.01 &&
                existing.currency === subscription.currency
              );
              
              if (!isDuplicate) {
                detectedSubscriptions.push(subscription);
                console.log(`✅ ULTRA-STRICT VALID RECEIPT (${year}): ${subscription.serviceName} - ${subscription.currency} ${subscription.amount}`);
              }
            }
          } catch (error) {
            console.error(`❌ Error processing email ${message.id}:`, error);
          }
        }
      }

      console.log(`🎯 ULTRA-STRICT detection (${year}) found ${detectedSubscriptions.length} VERIFIED receipts`);
      await this.saveSubscriptionsForYear(detectedSubscriptions, year);
      return detectedSubscriptions;
    } catch (error) {
      console.error(`❌ Error processing ${year} emails:`, error);
      throw error;
    }
  }

  /**
   * 🎯 ULTRA-STRICT VALIDATION ALGORITHM
   * Multiple validation layers to ensure ONLY real receipts
   */
  private validateReceiptWithUltraStrictAlgorithm(email: any, year: number): DetectedSubscription | null {
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

    console.log(`\n🔍 ULTRA-STRICT VALIDATION: "${subject}" from "${from}"`);

    // 🎯 LAYER 1: ABSOLUTE EXCLUSIONS - Immediate rejection
    for (const exclusion of ABSOLUTE_EXCLUSIONS) {
      if (fullText.includes(exclusion.toLowerCase())) {
        console.log(`❌ REJECTED: Absolute exclusion: ${exclusion}`);
        return null;
      }
    }

    // 🎯 LAYER 2: LANGUAGE DETECTION
    const language = this.detectLanguage(fullText);
    console.log(`🌐 Detected language: ${language}`);

    // 🎯 LAYER 3: STRICT RECEIPT KEYWORD VALIDATION
    const receiptKeywords = STRICT_RECEIPT_KEYWORDS[language] || STRICT_RECEIPT_KEYWORDS.en;
    const hasStrictReceiptKeyword = receiptKeywords.some(keyword => 
      fullText.includes(keyword.toLowerCase())
    );

    if (!hasStrictReceiptKeyword) {
      console.log(`❌ REJECTED: No strict receipt keyword found`);
      return null;
    }

    // 🎯 LAYER 4: FINANCIAL TRANSACTION PROOF
    const financialIndicators = STRICT_FINANCIAL_INDICATORS[language] || STRICT_FINANCIAL_INDICATORS.en;
    const hasFinancialProof = financialIndicators.some(indicator => 
      fullText.includes(indicator.toLowerCase())
    );

    if (!hasFinancialProof) {
      console.log(`❌ REJECTED: No financial transaction proof`);
      return null;
    }

    // 🎯 LAYER 5: TRUSTED DOMAIN VALIDATION
    const senderDomain = this.extractDomain(from);
    const isTrustedDomain = TRUSTED_SUBSCRIPTION_DOMAINS.some(domain => 
      senderDomain.includes(domain)
    );

    if (!isTrustedDomain) {
      console.log(`❌ REJECTED: Not from trusted subscription domain: ${senderDomain}`);
      return null;
    }

    // 🎯 LAYER 6: PRECISE AMOUNT EXTRACTION
    const amount = this.extractPreciseAmount(fullText, body, subject);
    if (!amount || amount.value < 1 || amount.value > 500) {
      console.log(`❌ REJECTED: Invalid or missing amount: ${amount?.value} ${amount?.currency}`);
      return null;
    }

    // 🎯 LAYER 7: SERVICE IDENTIFICATION
    const serviceInfo = this.identifyTrustedService(subject, from, fullText, senderDomain);
    if (!serviceInfo) {
      console.log(`❌ REJECTED: Could not identify trusted service`);
      return null;
    }

    // 🎯 LAYER 8: SUBSCRIPTION CONTEXT VALIDATION
    const subscriptionTerms = [
      'subscription', 'recurring', 'monthly', 'annual', 'plan', 'membership',
      'premium', 'pro', 'plus', 'renewal', 'اشتراك', 'abonnement', 'suscripción'
    ];
    
    const hasSubscriptionContext = subscriptionTerms.some(term => 
      fullText.includes(term.toLowerCase())
    );

    if (!hasSubscriptionContext) {
      console.log(`❌ REJECTED: No subscription context found`);
      return null;
    }

    // 🎯 ALL LAYERS PASSED - LOG VALID SUBSCRIPTION
    console.log(`\n🎉 ===== ULTRA-STRICT VALID SUBSCRIPTION =====`);
    console.log(`📧 SUBJECT: ${subject}`);
    console.log(`📄 BODY: ${body.substring(0, 500)}...`);
    console.log(`🏢 SERVICE: ${serviceInfo.name}`);
    console.log(`💰 AMOUNT: ${amount.currency} ${amount.value}`);
    console.log(`🌐 LANGUAGE: ${language}`);
    console.log(`🔗 DOMAIN: ${senderDomain}`);
    console.log(`=======================================\n`);

    // Calculate high confidence for ultra-strict validation
    let confidence = 0.95; // Very high confidence due to strict validation

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
      confidence,
      receiptType: 'verified_payment_receipt',
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
   * Extract precise amount with context validation
   */
  private extractPreciseAmount(text: string, body: string, subject: string): { value: number; currency: string } | null {
    for (const pattern of PRECISE_CURRENCY_PATTERNS) {
      const matches = [...text.matchAll(pattern.pattern)];
      for (const match of matches) {
        const amount = parseFloat(match[1]);
        if (this.isValidAmountForCurrency(amount, pattern.currency)) {
          return { value: amount, currency: pattern.currency };
        }
      }
    }
    return null;
  }

  /**
   * Validate amount ranges for different currencies
   */
  private isValidAmountForCurrency(amount: number, currency: string): boolean {
    const ranges = {
      'USD': { min: 1, max: 500 },
      'EUR': { min: 1, max: 500 },
      'GBP': { min: 1, max: 500 },
      'MAD': { min: 10, max: 5000 },
      'SAR': { min: 5, max: 2000 },
      'AED': { min: 5, max: 2000 }
    };
    
    const range = ranges[currency] || { min: 1, max: 500 };
    return amount >= range.min && amount <= range.max;
  }

  /**
   * Identify service from trusted domains
   */
  private identifyTrustedService(subject: string, from: string, fullText: string, domain: string): { name: string; category: string } | null {
    const serviceMap = {
      'netflix.com': { name: 'Netflix', category: 'Entertainment' },
      'spotify.com': { name: 'Spotify', category: 'Music' },
      'github.com': { name: 'GitHub', category: 'Development' },
      'stackblitz.com': { name: 'StackBlitz', category: 'Development' },
      'stripe.com': { name: 'StackBlitz Pro', category: 'Development' }, // Stripe often processes StackBlitz
      'adobe.com': { name: 'Adobe Creative Cloud', category: 'Design' },
      'microsoft.com': { name: 'Microsoft 365', category: 'Productivity' },
      'google.com': { name: 'Google Workspace', category: 'Productivity' },
      'dropbox.com': { name: 'Dropbox', category: 'Storage' },
      'figma.com': { name: 'Figma', category: 'Design' },
      'tinder.com': { name: 'Tinder', category: 'Dating' },
      'gotinder.com': { name: 'Tinder', category: 'Dating' },
      'bumble.com': { name: 'Bumble', category: 'Dating' }
    };

    for (const [serviceDomain, serviceInfo] of Object.entries(serviceMap)) {
      if (domain.includes(serviceDomain)) {
        return serviceInfo;
      }
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
        console.warn(`⚠️ Failed to decode direct body:`, e);
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
            console.warn(`⚠️ Failed to decode part ${i}:`, e);
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
      console.error('❌ Base64 decode error:', error);
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
          console.log(`✅ Added ULTRA-STRICT subscription (${year}): ${subscription.serviceName}`);
        } else {
          const docRef = doc(db, 'subscriptions', existingForYear.id);
          await updateDoc(docRef, {
            ...subscription,
            yearProcessed: year,
            updatedAt: new Date().toISOString()
          });
          console.log(`🔄 Updated ULTRA-STRICT subscription (${year}): ${subscription.serviceName}`);
        }
      } catch (error) {
        console.error(`❌ Error saving subscription ${subscription.serviceName}:`, error);
      }
    }
  }
}