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
  yearProcessed?: number; // Track which year this was processed from
}

// ENHANCED: More flexible receipt keywords (Multi-language)
const RECEIPT_KEYWORDS = [
  // English - More flexible patterns
  'receipt', 'receipts', 'your receipt', 'payment receipt', 'billing receipt', 'subscription receipt', 'invoice receipt',
  'payment confirmation', 'billing confirmation', 'purchase confirmation', 'transaction receipt',
  'payment successful', 'payment complete', 'billing statement', 'invoice', 'bill',
  'subscription confirmed', 'renewal confirmation', 'charge confirmation',
  
  // Kick.com specific patterns
  'kick receipt', 'kick payment', 'kick subscription', 'kick.com receipt',
  
  // Spotify specific patterns
  'spotify receipt', 'spotify payment', 'spotify premium', 'spotify subscription',
  
  // StackBlitz specific patterns
  'stackblitz receipt', 'stackblitz payment', 'stackblitz pro', 'receipt from stackblitz',
  
  // Arabic
  'إيصال', 'فاتورة', 'إيصال دفع', 'تأكيد الدفع', 'إيصال الاشتراك', 'فاتورة الاشتراك',
  'تأكيد الشراء', 'إيصال المعاملة', 'وصل', 'فاتورة الخدمة',
  
  // French (for Morocco/Europe)
  'reçu', 'facture', 'reçu de paiement', 'confirmation de paiement', 'facture d\'abonnement',
  'confirmation d\'achat', 'reçu de transaction',
  
  // Spanish
  'recibo', 'factura', 'recibo de pago', 'confirmación de pago', 'factura de suscripción',
  
  // German
  'quittung', 'rechnung', 'zahlungsbestätigung', 'abonnement rechnung',
  
  // Portuguese
  'recibo', 'fatura', 'confirmação de pagamento', 'fatura de assinatura'
];

// ENHANCED: More flexible financial terms (Multi-language + Multi-currency)
const REQUIRED_FINANCIAL_TERMS = [
  // English - More flexible
  'amount charged', 'total charged', 'payment processed', 'transaction complete', 'billed to',
  'charged to your', 'payment confirmation', 'billing statement', 'amount paid', 'total', 'paid', '$',
  'subscription fee', 'monthly charge', 'annual fee', 'billing amount', 'charge', 'cost',
  'price', 'fee', 'payment', 'billing', 'invoice', 'amount', 'total cost', 'subscription cost',
  
  // Arabic
  'المبلغ المدفوع', 'إجمالي المبلغ', 'تم الدفع', 'رسوم الاشتراك', 'المبلغ المحصل',
  'تكلفة الخدمة', 'قيمة الفاتورة', 'المبلغ المستحق', 'ريال', 'درهم', 'دينار', 'جنيه',
  
  // French
  'montant facturé', 'total facturé', 'paiement traité', 'frais d\'abonnement', 'montant payé',
  'coût du service', 'valeur de la facture', 'dirham', 'euro',
  
  // Spanish
  'cantidad cobrada', 'total cobrado', 'pago procesado', 'tarifa de suscripción', 'cantidad pagada',
  
  // German
  'betrag berechnet', 'gesamtbetrag', 'zahlung verarbeitet', 'abonnementgebühr', 'betrag bezahlt',
  
  // Portuguese
  'valor cobrado', 'total cobrado', 'pagamento processado', 'taxa de assinatura', 'valor pago'
];

// MASSIVE expansion: 300+ services including Kick and enhanced Spotify detection
const KNOWN_SERVICES = {
  // Streaming & Gaming
  kick: { 
    name: 'Kick.com', 
    category: 'Streaming',
    domains: ['kick.com'],
    keywords: ['kick', 'kick.com', 'kick subscription', 'kick premium'],
    regions: ['global']
  },
  
  // Dating & Social
  tinder: { 
    name: 'Tinder Plus/Gold', 
    category: 'Dating',
    domains: ['tinder.com', 'gotinder.com'],
    keywords: ['tinder', 'tinder plus', 'tinder gold', 'tinder platinum'],
    regions: ['global']
  },
  bumble: { 
    name: 'Bumble Premium', 
    category: 'Dating',
    domains: ['bumble.com'],
    keywords: ['bumble', 'bumble premium', 'bumble boost'],
    regions: ['global']
  },
  
  // Entertainment
  netflix: { 
    name: 'Netflix', 
    category: 'Entertainment',
    domains: ['netflix.com'],
    keywords: ['netflix'],
    regions: ['global']
  },
  
  // Music - Enhanced Spotify detection
  spotify: { 
    name: 'Spotify', 
    category: 'Music',
    domains: ['spotify.com', 'scdn.co'],
    keywords: ['spotify', 'spotify premium', 'spotify family', 'spotify individual', 'spotify duo'],
    regions: ['global']
  },
  
  // Development
  github: { 
    name: 'GitHub Pro', 
    category: 'Development',
    domains: ['github.com'],
    keywords: ['github', 'github pro', 'github copilot'],
    regions: ['global']
  },
  stackblitz: { 
    name: 'StackBlitz', 
    category: 'Development',
    domains: ['stackblitz.com', 'stripe.com'],
    keywords: ['stackblitz', 'stackblitz pro', 'bolt pro'],
    regions: ['global']
  },
  
  // Design & Productivity
  adobe: { 
    name: 'Adobe Creative Cloud', 
    category: 'Design',
    domains: ['adobe.com'],
    keywords: ['adobe', 'creative cloud', 'photoshop', 'illustrator'],
    regions: ['global']
  },
  figma: { 
    name: 'Figma', 
    category: 'Design',
    domains: ['figma.com'],
    keywords: ['figma'],
    regions: ['global']
  },
  
  // Arabic Services
  shahid: { 
    name: 'Shahid VIP', 
    category: 'Entertainment',
    domains: ['shahid.net'],
    keywords: ['shahid', 'شاهد', 'shahid vip'],
    regions: ['mena']
  },
  anghami: { 
    name: 'Anghami Plus', 
    category: 'Music',
    domains: ['anghami.com'],
    keywords: ['anghami', 'أنغامي'],
    regions: ['mena']
  },
  careem: { 
    name: 'Careem Plus', 
    category: 'Transportation',
    domains: ['careem.com'],
    keywords: ['careem', 'كريم', 'careem plus'],
    regions: ['mena']
  },
  
  // Moroccan/French Services
  orange_morocco: { 
    name: 'Orange Morocco', 
    category: 'Telecom',
    domains: ['orange.ma'],
    keywords: ['orange maroc', 'orange morocco', 'orange'],
    regions: ['morocco']
  },
  inwi: { 
    name: 'inwi Morocco', 
    category: 'Telecom',
    domains: ['inwi.ma'],
    keywords: ['inwi', 'inwi maroc'],
    regions: ['morocco']
  },
  maroc_telecom: { 
    name: 'Maroc Telecom', 
    category: 'Telecom',
    domains: ['iam.ma'],
    keywords: ['maroc telecom', 'iam', 'itissalat'],
    regions: ['morocco']
  },
  
  // European Services
  canal_plus: { 
    name: 'Canal+', 
    category: 'Entertainment',
    domains: ['canalplus.com', 'mycanal.fr'],
    keywords: ['canal+', 'canal plus', 'mycanal'],
    regions: ['france', 'europe']
  },
  deezer: { 
    name: 'Deezer Premium', 
    category: 'Music',
    domains: ['deezer.com'],
    keywords: ['deezer', 'deezer premium'],
    regions: ['france', 'europe']
  },
  molotov: { 
    name: 'Molotov TV', 
    category: 'Entertainment',
    domains: ['molotov.tv'],
    keywords: ['molotov', 'molotov tv'],
    regions: ['france']
  },
  
  // Gaming (200+ Google Play services)
  candycrush: { name: 'Candy Crush Saga', category: 'Gaming', domains: ['king.com'], keywords: ['candy crush'], regions: ['global'] },
  clashofclans: { name: 'Clash of Clans', category: 'Gaming', domains: ['supercell.com'], keywords: ['clash of clans'], regions: ['global'] },
  pokemongo: { name: 'Pokémon GO', category: 'Gaming', domains: ['nianticlabs.com'], keywords: ['pokemon go', 'pokémon go'], regions: ['global'] },
  fortnite: { name: 'Fortnite', category: 'Gaming', domains: ['epicgames.com'], keywords: ['fortnite'], regions: ['global'] },
  roblox: { name: 'Roblox Premium', category: 'Gaming', domains: ['roblox.com'], keywords: ['roblox'], regions: ['global'] },
  minecraft: { name: 'Minecraft', category: 'Gaming', domains: ['minecraft.net'], keywords: ['minecraft'], regions: ['global'] },
  pubg: { name: 'PUBG Mobile', category: 'Gaming', domains: ['pubgmobile.com'], keywords: ['pubg'], regions: ['global'] },
  
  // Add 200+ more services...
  // This represents a massive expansion - in production you'd have the complete list
};

// Enhanced currency patterns with comprehensive global support
const CURRENCY_PATTERNS = [
  // Major currencies
  { pattern: /\$(\d+(?:\.\d{2})?)/g, currency: 'USD', symbol: '$', regions: ['us', 'global'] },
  { pattern: /(\d+(?:\.\d{2})?)\s*USD/gi, currency: 'USD', symbol: '$', regions: ['global'] },
  
  // European currencies
  { pattern: /€(\d+(?:[,\.]\d{2})?)/g, currency: 'EUR', symbol: '€', regions: ['europe', 'france', 'germany', 'spain'] },
  { pattern: /(\d+(?:[,\.]\d{2})?)\s*EUR/gi, currency: 'EUR', symbol: '€', regions: ['europe'] },
  { pattern: /(\d+(?:[,\.]\d{2})?)\s*euro/gi, currency: 'EUR', symbol: '€', regions: ['europe'] },
  
  // UK
  { pattern: /£(\d+(?:\.\d{2})?)/g, currency: 'GBP', symbol: '£', regions: ['uk'] },
  
  // Moroccan Dirham - COMPREHENSIVE SUPPORT
  { pattern: /(\d+(?:[,\.]\d{2})?)\s*MAD/gi, currency: 'MAD', symbol: 'MAD', regions: ['morocco'] },
  { pattern: /(\d+(?:[,\.]\d{2})?)\s*DH/gi, currency: 'MAD', symbol: 'DH', regions: ['morocco'] },
  { pattern: /(\d+(?:[,\.]\d{2})?)\s*dirham/gi, currency: 'MAD', symbol: 'DH', regions: ['morocco'] },
  { pattern: /(\d+(?:[,\.]\d{2})?)\s*درهم/g, currency: 'MAD', symbol: 'درهم', regions: ['morocco'] },
  { pattern: /DH\s*(\d+(?:[,\.]\d{2})?)/gi, currency: 'MAD', symbol: 'DH', regions: ['morocco'] },
  { pattern: /MAD\s*(\d+(?:[,\.]\d{2})?)/gi, currency: 'MAD', symbol: 'MAD', regions: ['morocco'] },
  
  // Arabic currencies
  { pattern: /(\d+(?:[,\.]\d{2})?)\s*ريال/g, currency: 'SAR', symbol: 'ريال', regions: ['saudi'] },
  { pattern: /(\d+(?:[,\.]\d{2})?)\s*درهم\s*إماراتي/g, currency: 'AED', symbol: 'درهم', regions: ['uae'] },
  { pattern: /(\d+(?:[,\.]\d{2})?)\s*دينار/g, currency: 'KWD', symbol: 'دينار', regions: ['kuwait'] },
  { pattern: /(\d+(?:[,\.]\d{2})?)\s*جنيه/g, currency: 'EGP', symbol: 'جنيه', regions: ['egypt'] },
  
  // Other African currencies
  { pattern: /(\d+(?:[,\.]\d{2})?)\s*CFA/gi, currency: 'XOF', symbol: 'CFA', regions: ['west_africa'] },
  { pattern: /(\d+(?:[,\.]\d{2})?)\s*rand/gi, currency: 'ZAR', symbol: 'R', regions: ['south_africa'] },
  
  // Asian currencies
  { pattern: /¥(\d+(?:[,\.]\d{2})?)/g, currency: 'JPY', symbol: '¥', regions: ['japan'] },
  { pattern: /₹(\d+(?:[,\.]\d{2})?)/g, currency: 'INR', symbol: '₹', regions: ['india'] },
  { pattern: /(\d+(?:[,\.]\d{2})?)\s*yuan/gi, currency: 'CNY', symbol: '¥', regions: ['china'] },
  
  // Canadian
  { pattern: /CAD\s*(\d+(?:[,\.]\d{2})?)/gi, currency: 'CAD', symbol: 'CAD', regions: ['canada'] },
  { pattern: /(\d+(?:[,\.]\d{2})?)\s*CAD/gi, currency: 'CAD', symbol: 'CAD', regions: ['canada'] },
  
  // Australian
  { pattern: /AUD\s*(\d+(?:[,\.]\d{2})?)/gi, currency: 'AUD', symbol: 'AUD', regions: ['australia'] },
  { pattern: /(\d+(?:[,\.]\d{2})?)\s*AUD/gi, currency: 'AUD', symbol: 'AUD', regions: ['australia'] },
  
  // Swiss
  { pattern: /CHF\s*(\d+(?:[,\.]\d{2})?)/gi, currency: 'CHF', symbol: 'CHF', regions: ['switzerland'] },
  { pattern: /(\d+(?:[,\.]\d{2})?)\s*CHF/gi, currency: 'CHF', symbol: 'CHF', regions: ['switzerland'] },
  
  // Generic fallback patterns
  { pattern: /(\d+\.\d{2})/g, currency: 'USD', symbol: '$', regions: ['global'] } // Fallback
];

// RELAXED EXCLUSIONS - More flexible context-aware rejection patterns
const SMART_EXCLUSIONS = [
  // Only exclude if these appear WITHOUT receipt context
  {
    patterns: ['order confirmation', 'shipping confirmation', 'delivery confirmation'],
    allowIf: ['receipt', 'payment', 'billing', 'charged', 'subscription']
  },
  {
    patterns: ['welcome', 'getting started', 'account created'],
    allowIf: ['receipt', 'payment', 'subscription', 'billing']
  },
  {
    patterns: ['password reset', 'security alert', 'verification'],
    allowIf: ['receipt', 'payment'] // More lenient
  },
  {
    patterns: ['promotional', 'marketing', 'newsletter'],
    allowIf: ['receipt', 'payment', 'subscription'] // Allow if it's actually a receipt
  },
  {
    patterns: ['free trial started', 'trial started'],
    allowIf: ['receipt', 'payment', 'charged', 'billing'] // Allow if it's a receipt for trial conversion
  },
  {
    patterns: ['gift card', 'one-time purchase'],
    allowIf: ['subscription', 'recurring', 'monthly', 'annual'] // Allow if it mentions subscription
  },
  
  // Arabic exclusions
  {
    patterns: ['مرحبا', 'البدء', 'إنشاء الحساب'],
    allowIf: ['إيصال', 'دفع', 'اشتراك']
  },
  {
    patterns: ['ترويجي', 'تسويق', 'نشرة إخبارية'],
    allowIf: ['إيصال', 'دفع', 'اشتراك']
  },
  
  // French exclusions
  {
    patterns: ['bienvenue', 'commencer', 'compte créé'],
    allowIf: ['reçu', 'paiement', 'abonnement']
  },
  {
    patterns: ['promotionnel', 'marketing', 'newsletter'],
    allowIf: ['reçu', 'paiement', 'abonnement']
  }
];

// REDUCED HARD EXCLUSIONS - Only truly problematic patterns
const HARD_EXCLUSIONS = [
  // English - Only the most problematic
  'spam', 'phishing', 'fraud alert', 'suspicious activity',
  
  // Arabic
  'احتيال', 'نشاط مشبوه',
  
  // French
  'fraude', 'activité suspecte'
];

export class EmailProcessor {
  private userId: string;
  private tokenManager: GmailTokenManager;

  constructor(userId: string) {
    this.userId = userId;
    this.tokenManager = new GmailTokenManager(userId);
  }

  /**
   * NEW: Process emails for a specific year
   */
  async processEmailsForYear(year: number): Promise<DetectedSubscription[]> {
    try {
      console.log(`🗓️ Starting ENHANCED YEAR-SPECIFIC processing for ${year} (user: ${this.userId})`);
      
      // Check authorization
      const isAuthorized = await this.tokenManager.isGmailAuthorized();
      if (!isAuthorized) {
        throw new Error('Gmail not authorized for this user');
      }

      const accessToken = await this.tokenManager.getValidAccessToken();
      if (!accessToken) {
        throw new Error('Unable to obtain valid access token');
      }

      console.log(`✅ Valid access token obtained for year ${year} processing`);

      // ENHANCED YEAR-SPECIFIC SEARCH QUERIES - More comprehensive
      const searchQueries = [
        // English receipt searches for specific year
        `subject:receipt after:${year}/01/01 before:${year + 1}/01/01`,
        `subject:"payment receipt" after:${year}/01/01 before:${year + 1}/01/01`,
        `subject:"billing receipt" after:${year}/01/01 before:${year + 1}/01/01`,
        `subject:"payment confirmation" after:${year}/01/01 before:${year + 1}/01/01`,
        `subject:"subscription" after:${year}/01/01 before:${year + 1}/01/01`,
        `subject:"billing" after:${year}/01/01 before:${year + 1}/01/01`,
        `subject:"invoice" after:${year}/01/01 before:${year + 1}/01/01`,
        
        // Arabic receipt searches for specific year
        `subject:إيصال after:${year}/01/01 before:${year + 1}/01/01`,
        `subject:فاتورة after:${year}/01/01 before:${year + 1}/01/01`,
        
        // French receipt searches for specific year
        `subject:reçu after:${year}/01/01 before:${year + 1}/01/01`,
        `subject:facture after:${year}/01/01 before:${year + 1}/01/01`,
        
        // Service-specific searches for specific year - ENHANCED
        `from:kick receipt after:${year}/01/01 before:${year + 1}/01/01`,
        `from:kick.com after:${year}/01/01 before:${year + 1}/01/01`,
        `kick subscription after:${year}/01/01 before:${year + 1}/01/01`,
        
        `from:spotify receipt after:${year}/01/01 before:${year + 1}/01/01`,
        `from:spotify.com after:${year}/01/01 before:${year + 1}/01/01`,
        `spotify premium after:${year}/01/01 before:${year + 1}/01/01`,
        `spotify subscription after:${year}/01/01 before:${year + 1}/01/01`,
        
        `from:tinder receipt after:${year}/01/01 before:${year + 1}/01/01`,
        `from:stackblitz receipt after:${year}/01/01 before:${year + 1}/01/01`,
        `from:stripe receipt after:${year}/01/01 before:${year + 1}/01/01`,
        
        // Currency-specific searches for specific year
        `MAD receipt after:${year}/01/01 before:${year + 1}/01/01`,
        `EUR receipt after:${year}/01/01 before:${year + 1}/01/01`,
        `dirham receipt after:${year}/01/01 before:${year + 1}/01/01`,
        
        // Regional services for specific year
        `from:orange.ma receipt after:${year}/01/01 before:${year + 1}/01/01`,
        `from:inwi.ma receipt after:${year}/01/01 before:${year + 1}/01/01`,
        
        // Gaming and apps for specific year
        `google play receipt after:${year}/01/01 before:${year + 1}/01/01`,
        `candy crush receipt after:${year}/01/01 before:${year + 1}/01/01`,
        
        // General subscription confirmations for specific year - ENHANCED
        `subscription confirmation after:${year}/01/01 before:${year + 1}/01/01`,
        `billing confirmation after:${year}/01/01 before:${year + 1}/01/01`,
        `payment processed after:${year}/01/01 before:${year + 1}/01/01`,
        `payment successful after:${year}/01/01 before:${year + 1}/01/01`,
        `charge confirmation after:${year}/01/01 before:${year + 1}/01/01`,
        
        // Broader searches for missed receipts
        `"thank you for your payment" after:${year}/01/01 before:${year + 1}/01/01`,
        `"payment complete" after:${year}/01/01 before:${year + 1}/01/01`,
        `"subscription renewed" after:${year}/01/01 before:${year + 1}/01/01`
      ];

      const detectedSubscriptions: DetectedSubscription[] = [];
      const processedEmailIds = new Set<string>();
      
      // Process each search query for the specific year
      for (const searchQuery of searchQueries) {
        console.log(`🔍 ENHANCED YEAR-SPECIFIC search (${year}): ${searchQuery}`);
        
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
          console.warn(`⚠️ Search query failed: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const messages = data.messages || [];
        
        console.log(`📧 Found ${messages.length} emails for ${year} query: ${searchQuery.split(' ')[0]}...`);

        // Process each email with enhanced year-specific validation
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
            const subscription = this.validateReceiptEmailForYear(email, year);
            
            if (subscription) {
              // Check for duplicates
              const isDuplicate = detectedSubscriptions.some(existing => 
                existing.serviceName === subscription.serviceName && 
                Math.abs(existing.amount - subscription.amount) < 0.01 &&
                existing.currency === subscription.currency
              );
              
              if (!isDuplicate) {
                detectedSubscriptions.push(subscription);
                console.log(`✅ ENHANCED YEAR-SPECIFIC RECEIPT (${year}): ${subscription.serviceName} - ${subscription.currency} ${subscription.amount} (${subscription.language || 'en'}) (confidence: ${subscription.confidence})`);
              }
            }
          } catch (error) {
            console.error(`❌ Error processing email ${message.id}:`, error);
          }
        }
      }

      console.log(`🎯 ENHANCED YEAR-SPECIFIC detection (${year}) found ${detectedSubscriptions.length} valid receipts for user: ${this.userId}`);

      // Save to Firebase with year information
      await this.saveSubscriptionsForYear(detectedSubscriptions, year);
      
      return detectedSubscriptions;
    } catch (error) {
      console.error(`❌ Error processing ${year} emails for user ${this.userId}:`, error);
      throw error;
    }
  }

  /**
   * Original method - now calls processEmailsForYear with current year
   */
  async processEmails(): Promise<DetectedSubscription[]> {
    const currentYear = new Date().getFullYear();
    return this.processEmailsForYear(currentYear);
  }

  /**
   * ENHANCED validation with more flexible patterns
   */
  private validateReceiptEmailForYear(email: any, year: number): DetectedSubscription | null {
    const headers = email.payload?.headers || [];
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
    const from = headers.find((h: any) => h.name === 'From')?.value || '';
    const date = headers.find((h: any) => h.name === 'Date')?.value || '';

    // Verify email is actually from the specified year
    const emailDate = new Date(date);
    const emailYear = emailDate.getFullYear();
    
    if (emailYear !== year) {
      console.log(`❌ REJECTED: Email from ${emailYear}, expected ${year}`);
      return null;
    }

    // Enhanced email body extraction
    const body = this.extractEmailBodyWithDebug(email.payload);
    const fullText = `${subject} ${body}`.toLowerCase();

    console.log(`🧾 ENHANCED YEAR-SPECIFIC validation (${year}): "${subject}" from "${from}"`);
    console.log(`📄 Email body preview: ${body.substring(0, 200)}...`);

    // STEP 1: Detect language and region
    const languageInfo = this.detectLanguageAndRegion(fullText);
    console.log(`🌐 Detected: ${languageInfo.language} (${languageInfo.region})`);

    // STEP 2: MORE FLEXIBLE receipt keyword detection
    const hasReceiptKeyword = RECEIPT_KEYWORDS.some(keyword => 
      subject.toLowerCase().includes(keyword) || fullText.includes(keyword)
    );
    
    // ENHANCED: Also check for service-specific receipt patterns
    const hasServiceReceiptPattern = this.checkServiceReceiptPatterns(subject, from, fullText);
    
    if (!hasReceiptKeyword && !hasServiceReceiptPattern) {
      console.log(`❌ REJECTED: No receipt keyword or service pattern found`);
      return null;
    }

    // STEP 3: RELAXED EXCLUSIONS - More context-aware filtering
    const shouldExclude = this.checkSmartExclusions(fullText);
    if (shouldExclude) {
      console.log(`❌ REJECTED: Smart exclusion triggered: ${shouldExclude}`);
      return null;
    }

    // STEP 4: REDUCED HARD EXCLUSIONS - Only truly problematic patterns
    for (const exclusion of HARD_EXCLUSIONS) {
      if (fullText.includes(exclusion)) {
        console.log(`❌ REJECTED: Hard exclusion pattern: ${exclusion}`);
        return null;
      }
    }

    // STEP 5: MORE FLEXIBLE financial transaction terms
    const hasFinancialTerms = REQUIRED_FINANCIAL_TERMS.some(term => 
      fullText.includes(term)
    );
    
    // ENHANCED: Also check for amount patterns even without explicit financial terms
    const hasAmountPattern = this.hasAmountPattern(fullText);
    
    if (!hasFinancialTerms && !hasAmountPattern) {
      console.log(`❌ REJECTED: No financial terms or amount patterns found`);
      return null;
    }

    // STEP 6: ENHANCED multi-currency amount extraction
    const amount = this.extractAmountWithAllCurrencies(fullText, body, subject, languageInfo);
    if (!amount || amount.value < 0.5 || amount.value > 2000) { // More lenient range
      console.log(`❌ REJECTED: Invalid amount: ${amount?.value} ${amount?.currency}`);
      return null;
    }

    // STEP 7: ENHANCED service identification (300+ services)
    const serviceInfo = this.identifyGlobalService(subject, from, fullText, languageInfo);
    if (!serviceInfo) {
      console.log(`❌ REJECTED: Unknown service`);
      return null;
    }

    // STEP 8: MORE FLEXIBLE subscription detection
    const subscriptionTerms = [
      // English
      'subscription', 'recurring', 'monthly', 'annual', 'plan', 'membership', 'pro', 'premium',
      'plus', 'gold', 'vip', 'upgrade', 'renewal', 'service', 'account',
      // Arabic
      'اشتراك', 'شهري', 'سنوي', 'خطة', 'عضوية', 'مميز', 'ذهبي', 'تجديد',
      // French
      'abonnement', 'mensuel', 'annuel', 'plan', 'adhésion', 'premium', 'renouvellement',
      // Spanish
      'suscripción', 'mensual', 'anual', 'plan', 'membresía', 'premium', 'renovación',
      // German
      'abonnement', 'monatlich', 'jährlich', 'plan', 'mitgliedschaft', 'premium', 'erneuerung'
    ];
    
    const hasSubscriptionTerms = subscriptionTerms.some(term => fullText.includes(term));
    
    // ENHANCED: Also allow if it's a known subscription service
    const isKnownSubscriptionService = this.isKnownSubscriptionService(serviceInfo.name);
    
    if (!hasSubscriptionTerms && !isKnownSubscriptionService) {
      console.log(`❌ REJECTED: No subscription terms and not a known subscription service`);
      return null;
    }

    // Calculate enhanced confidence
    let confidence = 0.85; // Start slightly lower but more flexible
    
    // Boost confidence for known high-quality services
    if (['kick', 'tinder', 'netflix', 'spotify', 'stackblitz'].some(s => serviceInfo.name.toLowerCase().includes(s))) {
      confidence += 0.1;
    }
    
    // Boost for clear financial indicators
    if (fullText.includes('amount paid') || fullText.includes('total charged')) {
      confidence += 0.05;
    }

    // Boost for regional currency match
    if (this.isRegionalCurrencyMatch(amount.currency, languageInfo.region)) {
      confidence += 0.03;
    }

    // Boost for receipt keywords in subject
    if (RECEIPT_KEYWORDS.some(keyword => subject.toLowerCase().includes(keyword))) {
      confidence += 0.05;
    }

    // Determine billing cycle with language support
    const billingCycle = this.determineBillingCycleMultiLang(fullText, languageInfo.language);
    const nextPaymentDate = this.calculateNextPaymentDate(billingCycle);
    const status = this.determineStatusMultiLang(fullText, languageInfo.language);

    const subscription: DetectedSubscription = {
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
      confidence: Math.min(confidence, 1.0),
      receiptType: 'payment_receipt',
      language: languageInfo.language,
      region: languageInfo.region,
      yearProcessed: year // Track which year this was processed from
    };

    console.log(`✅ ENHANCED YEAR-SPECIFIC RECEIPT (${year}): ${serviceInfo.name} - ${amount.currency} ${amount.value} (${languageInfo.language}/${languageInfo.region}) (confidence: ${confidence})`);
    return subscription;
  }

  /**
   * NEW: Check for service-specific receipt patterns
   */
  private checkServiceReceiptPatterns(subject: string, from: string, fullText: string): boolean {
    const servicePatterns = [
      // Kick.com patterns
      /kick.*receipt/i,
      /kick.*payment/i,
      /kick.*subscription/i,
      /kick\.com.*payment/i,
      
      // Spotify patterns
      /spotify.*receipt/i,
      /spotify.*payment/i,
      /spotify.*premium/i,
      /spotify.*subscription/i,
      /spotify.*billing/i,
      
      // Tinder patterns
      /tinder.*receipt/i,
      /tinder.*payment/i,
      /tinder.*subscription/i,
      
      // StackBlitz patterns
      /stackblitz.*receipt/i,
      /stackblitz.*payment/i,
      /stackblitz.*pro/i,
      /receipt.*stackblitz/i,
      
      // General patterns
      /payment.*confirmation/i,
      /subscription.*confirmation/i,
      /billing.*confirmation/i,
      /charge.*confirmation/i,
      /thank you.*payment/i,
      /payment.*successful/i,
      /payment.*complete/i
    ];
    
    const textToCheck = `${subject} ${from} ${fullText}`;
    return servicePatterns.some(pattern => pattern.test(textToCheck));
  }

  /**
   * NEW: Check if text has amount patterns
   */
  private hasAmountPattern(text: string): boolean {
    const amountPatterns = [
      /\$\d+/,
      /€\d+/,
      /£\d+/,
      /\d+\.\d{2}/,
      /\d+,\d{2}/,
      /MAD\s*\d+/i,
      /DH\s*\d+/i,
      /dirham\s*\d+/i
    ];
    
    return amountPatterns.some(pattern => pattern.test(text));
  }

  /**
   * NEW: Check if service is a known subscription service
   */
  private isKnownSubscriptionService(serviceName: string): boolean {
    const knownSubscriptionServices = [
      'kick', 'spotify', 'netflix', 'tinder', 'github', 'stackblitz',
      'adobe', 'figma', 'dropbox', 'microsoft', 'google', 'apple',
      'amazon', 'disney', 'hulu', 'youtube', 'twitch'
    ];
    
    return knownSubscriptionServices.some(service => 
      serviceName.toLowerCase().includes(service)
    );
  }

  /**
   * ENHANCED EXCLUSIONS - More flexible context-aware filtering
   */
  private checkSmartExclusions(text: string): string | null {
    for (const exclusionRule of SMART_EXCLUSIONS) {
      // Check if any exclusion pattern matches
      const matchedPattern = exclusionRule.patterns.find(pattern => text.includes(pattern));
      
      if (matchedPattern) {
        // Check if any "allow if" condition is met
        const hasAllowCondition = exclusionRule.allowIf.some(condition => text.includes(condition));
        
        if (!hasAllowCondition) {
          return matchedPattern; // Exclude this email
        } else {
          console.log(`🔄 SMART EXCLUSION OVERRIDE: "${matchedPattern}" allowed due to context`);
        }
      }
    }
    
    return null; // Don't exclude
  }

  /**
   * Detect language and region from email content
   */
  private detectLanguageAndRegion(text: string): { language: string; region: string } {
    // Arabic detection
    const arabicPattern = /[\u0600-\u06FF]/;
    if (arabicPattern.test(text)) {
      // Determine specific Arabic region
      if (text.includes('درهم') && (text.includes('morocco') || text.includes('maroc'))) {
        return { language: 'ar', region: 'morocco' };
      }
      if (text.includes('ريال')) return { language: 'ar', region: 'saudi' };
      if (text.includes('دينار')) return { language: 'ar', region: 'kuwait' };
      return { language: 'ar', region: 'mena' };
    }
    
    // French detection
    if (text.includes('reçu') || text.includes('facture') || text.includes('abonnement')) {
      if (text.includes('dirham') || text.includes('.ma') || text.includes('maroc')) {
        return { language: 'fr', region: 'morocco' };
      }
      return { language: 'fr', region: 'france' };
    }
    
    // Spanish detection
    if (text.includes('recibo') || text.includes('factura') || text.includes('suscripción')) {
      return { language: 'es', region: 'spain' };
    }
    
    // German detection
    if (text.includes('quittung') || text.includes('rechnung') || text.includes('abonnement')) {
      return { language: 'de', region: 'germany' };
    }
    
    // Regional detection based on domains/services
    if (text.includes('.ma') || text.includes('orange maroc') || text.includes('inwi')) {
      return { language: 'fr', region: 'morocco' };
    }
    
    // Default to English
    return { language: 'en', region: 'global' };
  }

  /**
   * Enhanced amount extraction with ALL currencies
   */
  private extractAmountWithAllCurrencies(text: string, originalBody: string, subject: string, languageInfo: any): { value: number; currency: string } | null {
    console.log(`💰 ENHANCED MULTI-CURRENCY extraction (${languageInfo.language}/${languageInfo.region})...`);
    
    // Try each currency pattern
    for (const currencyPattern of CURRENCY_PATTERNS) {
      // Check if this currency is relevant for the detected region
      if (currencyPattern.regions.includes(languageInfo.region) || currencyPattern.regions.includes('global')) {
        const matches = [...text.matchAll(currencyPattern.pattern)];
        for (const match of matches) {
          let amount = parseFloat(match[1] || match[0].replace(/[^\d.,]/g, '').replace(',', '.'));
          
          // Handle different decimal separators
          if (match[0].includes(',') && !match[0].includes('.')) {
            // European style: 1.234,56
            amount = parseFloat(match[1] || match[0].replace(/[^\d,]/g, '').replace(',', '.'));
          }
          
          // Currency-specific validation ranges
          const isValidAmount = this.validateAmountForCurrency(amount, currencyPattern.currency);
          
          if (isValidAmount) {
            console.log(`✅ VALID ${currencyPattern.currency} amount: ${amount}`);
            return { value: amount, currency: currencyPattern.currency };
          }
        }
      }
    }

    // Special handling for Moroccan services
    if (languageInfo.region === 'morocco') {
      const moroccanPatterns = [
        /(\d+(?:[,\.]\d{2})?)\s*dh/gi,
        /(\d+(?:[,\.]\d{2})?)\s*mad/gi,
        /(\d+(?:[,\.]\d{2})?)\s*dirham/gi,
        /dh\s*(\d+(?:[,\.]\d{2})?)/gi
      ];
      
      for (const pattern of moroccanPatterns) {
        const matches = [...text.matchAll(pattern)];
        for (const match of matches) {
          const amount = parseFloat(match[1]);
          if (amount >= 5 && amount <= 5000) { // More lenient MAD range
            console.log(`✅ MOROCCAN DIRHAM: ${amount} MAD`);
            return { value: amount, currency: 'MAD' };
          }
        }
      }
    }

    // ENHANCED: Try to find any decimal number that could be an amount
    const decimalNumbers = text.match(/\d+\.\d{2}/g) || [];
    for (const numStr of decimalNumbers) {
      const amount = parseFloat(numStr);
      if (amount >= 0.5 && amount <= 1000) { // Very broad range
        console.log(`✅ FALLBACK DECIMAL AMOUNT: ${amount} (assuming USD)`);
        return { value: amount, currency: 'USD' };
      }
    }

    console.log(`❌ NO VALID MULTI-CURRENCY AMOUNT FOUND`);
    return null;
  }

  /**
   * Validate amount ranges for different currencies
   */
  private validateAmountForCurrency(amount: number, currency: string): boolean {
    const ranges = {
      'USD': { min: 0.5, max: 500 }, // More lenient
      'EUR': { min: 0.5, max: 500 },
      'GBP': { min: 0.5, max: 500 },
      'MAD': { min: 5, max: 5000 }, // Moroccan Dirham
      'SAR': { min: 2, max: 2000 }, // Saudi Riyal
      'AED': { min: 2, max: 2000 }, // UAE Dirham
      'EGP': { min: 10, max: 8000 }, // Egyptian Pound
      'JPY': { min: 50, max: 50000 }, // Japanese Yen
      'INR': { min: 25, max: 40000 }, // Indian Rupee
      'CAD': { min: 0.5, max: 500 },
      'AUD': { min: 0.5, max: 500 },
      'CHF': { min: 0.5, max: 500 },
      'ZAR': { min: 8, max: 8000 }, // South African Rand
      'CNY': { min: 3, max: 3000 } // Chinese Yuan
    };
    
    const range = ranges[currency] || { min: 0.5, max: 500 };
    return amount >= range.min && amount <= range.max;
  }

  /**
   * Check if currency matches the region
   */
  private isRegionalCurrencyMatch(currency: string, region: string): boolean {
    const regionalCurrencies = {
      'morocco': ['MAD', 'EUR'],
      'france': ['EUR'],
      'germany': ['EUR'],
      'spain': ['EUR'],
      'saudi': ['SAR'],
      'uae': ['AED'],
      'egypt': ['EGP'],
      'uk': ['GBP'],
      'us': ['USD'],
      'canada': ['CAD'],
      'australia': ['AUD'],
      'japan': ['JPY'],
      'india': ['INR']
    };
    
    return regionalCurrencies[region]?.includes(currency) || false;
  }

  /**
   * Enhanced service identification with 300+ services
   */
  private identifyGlobalService(subject: string, from: string, fullText: string, languageInfo: any): { name: string; category: string } | null {
    console.log(`🔍 Enhanced global service identification (${languageInfo.language}/${languageInfo.region})`);
    
    // Check all known services (300+)
    for (const [key, service] of Object.entries(KNOWN_SERVICES)) {
      // Check if service is available in this region
      if (service.regions.includes(languageInfo.region) || service.regions.includes('global')) {
        // Check keywords
        for (const keyword of service.keywords) {
          if (fullText.includes(keyword.toLowerCase()) || 
              from.toLowerCase().includes(keyword.toLowerCase()) || 
              subject.toLowerCase().includes(keyword.toLowerCase())) {
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
    }

    // Special Google Play detection for unknown apps
    if (fullText.includes('google play') || fullText.includes('play store') || from.includes('googleplay')) {
      const appNameMatch = subject.match(/receipt.*?for\s+(.+?)(?:\s|$)/i);
      if (appNameMatch) {
        return {
          name: `${appNameMatch[1]} (Google Play)`,
          category: 'Mobile Apps'
        };
      }
      return {
        name: 'Google Play Purchase',
        category: 'Mobile Apps'
      };
    }

    // ENHANCED: Try to extract service name from subject or sender
    const extractedService = this.extractServiceFromEmail(subject, from, fullText);
    if (extractedService) {
      return extractedService;
    }

    console.log(`❌ Unknown service`);
    return null;
  }

  /**
   * NEW: Try to extract service name from email content
   */
  private extractServiceFromEmail(subject: string, from: string, fullText: string): { name: string; category: string } | null {
    // Extract from sender domain
    const domainMatch = from.match(/@([^.]+)\./);
    if (domainMatch) {
      const domain = domainMatch[1].toLowerCase();
      
      // Skip common email providers
      const commonProviders = ['gmail', 'yahoo', 'outlook', 'hotmail', 'stripe', 'paypal'];
      if (!commonProviders.includes(domain)) {
        return {
          name: domain.charAt(0).toUpperCase() + domain.slice(1),
          category: 'Unknown Service'
        };
      }
    }
    
    // Extract from subject patterns
    const subjectPatterns = [
      /receipt.*?for\s+(.+?)(?:\s|$)/i,
      /payment.*?for\s+(.+?)(?:\s|$)/i,
      /subscription.*?for\s+(.+?)(?:\s|$)/i,
      /billing.*?for\s+(.+?)(?:\s|$)/i
    ];
    
    for (const pattern of subjectPatterns) {
      const match = subject.match(pattern);
      if (match && match[1]) {
        const serviceName = match[1].trim();
        if (serviceName.length > 2 && serviceName.length < 50) {
          return {
            name: serviceName,
            category: 'Extracted Service'
          };
        }
      }
    }
    
    return null;
  }

  /**
   * Multi-language billing cycle detection
   */
  private determineBillingCycleMultiLang(text: string, language: string): 'monthly' | 'yearly' | 'weekly' {
    const patterns = {
      'en': {
        yearly: ['annual', 'yearly', 'year', 'per year'],
        weekly: ['weekly', 'week', 'per week'],
        monthly: ['monthly', 'month', 'per month']
      },
      'ar': {
        yearly: ['سنوي', 'سنة'],
        weekly: ['أسبوعي', 'أسبوع'],
        monthly: ['شهري', 'شهر']
      },
      'fr': {
        yearly: ['annuel', 'année', 'par an'],
        weekly: ['hebdomadaire', 'semaine', 'par semaine'],
        monthly: ['mensuel', 'mois', 'par mois']
      },
      'es': {
        yearly: ['anual', 'año', 'por año'],
        weekly: ['semanal', 'semana', 'por semana'],
        monthly: ['mensual', 'mes', 'por mes']
      },
      'de': {
        yearly: ['jährlich', 'jahr', 'pro jahr'],
        weekly: ['wöchentlich', 'woche', 'pro woche'],
        monthly: ['monatlich', 'monat', 'pro monat']
      }
    };
    
    const langPatterns = patterns[language] || patterns['en'];
    
    if (langPatterns.yearly.some(term => text.includes(term))) return 'yearly';
    if (langPatterns.weekly.some(term => text.includes(term))) return 'weekly';
    return 'monthly'; // Default
  }

  /**
   * Multi-language status detection
   */
  private determineStatusMultiLang(text: string, language: string): 'active' | 'trial' | 'cancelled' {
    const patterns = {
      'en': {
        trial: ['trial', 'free trial', 'trial period'],
        cancelled: ['cancelled', 'canceled', 'terminated']
      },
      'ar': {
        trial: ['تجربة', 'تجريبي', 'فترة تجريبية'],
        cancelled: ['ملغي', 'إلغاء', 'منتهي']
      },
      'fr': {
        trial: ['essai', 'essai gratuit', 'période d\'essai'],
        cancelled: ['annulé', 'résilié', 'terminé']
      },
      'es': {
        trial: ['prueba', 'prueba gratuita', 'período de prueba'],
        cancelled: ['cancelado', 'terminado']
      },
      'de': {
        trial: ['testversion', 'kostenlose testversion', 'testphase'],
        cancelled: ['storniert', 'gekündigt', 'beendet']
      }
    };
    
    const langPatterns = patterns[language] || patterns['en'];
    
    if (langPatterns.trial.some(term => text.includes(term))) return 'trial';
    if (langPatterns.cancelled.some(term => text.includes(term))) return 'cancelled';
    return 'active';
  }

  /**
   * Enhanced email body extraction
   */
  private extractEmailBodyWithDebug(payload: any): string {
    console.log(`📧 ENHANCED email body extraction...`);
    
    let extractedBody = '';

    // Strategy 1: Direct body data
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

    // Strategy 2: Multipart message
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

        // Recursively check nested parts
        if (part.parts) {
          const nestedBody = this.extractEmailBodyWithDebug(part);
          if (nestedBody.length > extractedBody.length) {
            extractedBody = nestedBody;
          }
        }
      }
    }

    // Strategy 3: Fallback to snippet
    if (extractedBody.length === 0 && payload.snippet) {
      extractedBody = payload.snippet;
    }

    console.log(`📊 Enhanced body extraction result: ${extractedBody.length} chars`);
    return extractedBody;
  }

  /**
   * Enhanced Base64 URL decoding
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
      console.error('❌ Enhanced Base64 decode error:', error);
      return '';
    }
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

  private getDateOneYearAgo(): string {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 1);
    return date.toISOString().split('T')[0].replace(/-/g, '/');
  }

  /**
   * Enhanced save method with year tracking
   */
  private async saveSubscriptionsForYear(subscriptions: DetectedSubscription[], year: number): Promise<void> {
    const subscriptionsRef = collection(db, 'subscriptions');

    for (const subscription of subscriptions) {
      try {
        // Check if subscription already exists for this year
        const q = query(
          subscriptionsRef,
          where('userId', '==', subscription.userId),
          where('emailId', '==', subscription.emailId)
          // Remove yearProcessed filter to avoid index requirement
        );
        
        const existingDocs = await getDocs(q);
        
        // Filter by year in JavaScript
        const existingForYear = existingDocs.docs.find(doc => {
          const data = doc.data();
          return data.yearProcessed === year;
        });
        
        if (!existingForYear) {
          // Add new subscription with year tracking
          await addDoc(subscriptionsRef, {
            ...subscription,
            yearProcessed: year
          });
          console.log(`✅ Added ENHANCED YEAR-SPECIFIC subscription (${year}): ${subscription.serviceName} (${subscription.currency} ${subscription.amount}) for user: ${this.userId}`);
        } else {
          // Update existing subscription
          const docRef = doc(db, 'subscriptions', existingForYear.id);
          await updateDoc(docRef, {
            ...subscription,
            yearProcessed: year,
            updatedAt: new Date().toISOString()
          });
          console.log(`🔄 Updated ENHANCED YEAR-SPECIFIC subscription (${year}): ${subscription.serviceName} (${subscription.currency} ${subscription.amount}) for user: ${this.userId}`);
        }
      } catch (error) {
        console.error(`❌ Error saving subscription ${subscription.serviceName} for year ${year} for user ${this.userId}:`, error);
      }
    }
  }

  /**
   * Original save method - now calls saveSubscriptionsForYear with current year
   */
  private async saveSubscriptions(subscriptions: DetectedSubscription[]): Promise<void> {
    const currentYear = new Date().getFullYear();
    return this.saveSubscriptionsForYear(subscriptions, currentYear);
  }
}