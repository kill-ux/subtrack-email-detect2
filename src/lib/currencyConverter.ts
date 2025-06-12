// Currency conversion service with real-time rates
export interface CurrencyRate {
  currency: string;
  rate: number; // Rate to USD
  lastUpdated: string;
}

export interface ConvertedAmount {
  originalAmount: number;
  originalCurrency: string;
  convertedAmount: number;
  convertedCurrency: string;
  exchangeRate: number;
  conversionDate: string;
}

export class CurrencyConverter {
  private static rates: Map<string, CurrencyRate> = new Map();
  private static lastFetch: Date | null = null;
  private static readonly CACHE_DURATION = 60 * 60 * 1000; // 1 hour

  // Fallback rates (updated periodically)
  private static readonly FALLBACK_RATES: Record<string, number> = {
    'USD': 1.0,
    'EUR': 0.85,
    'GBP': 0.73,
    'MAD': 10.12, // Moroccan Dirham
    'SAR': 3.75,  // Saudi Riyal
    'AED': 3.67,  // UAE Dirham
    'EGP': 30.85, // Egyptian Pound
    'JPY': 149.50, // Japanese Yen
    'INR': 83.25,  // Indian Rupee
    'CAD': 1.36,   // Canadian Dollar
    'AUD': 1.52,   // Australian Dollar
    'CHF': 0.88,   // Swiss Franc
    'ZAR': 18.75,  // South African Rand
    'CNY': 7.24,   // Chinese Yuan
    'KWD': 0.31,   // Kuwaiti Dinar
    'XOF': 605.0,  // West African CFA Franc
    'TND': 3.12,   // Tunisian Dinar
    'DZD': 134.5,  // Algerian Dinar
  };

  /**
   * Get current exchange rates (with caching)
   */
  private static async fetchRates(): Promise<void> {
    const now = new Date();
    
    // Use cache if available and fresh
    if (this.lastFetch && (now.getTime() - this.lastFetch.getTime()) < this.CACHE_DURATION) {
      return;
    }

    try {
      // Try to fetch from a free API (exchangerate-api.com)
      const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      
      if (response.ok) {
        const data = await response.json();
        
        // Convert rates to our format (all rates are to USD)
        Object.entries(data.rates).forEach(([currency, rate]) => {
          this.rates.set(currency, {
            currency,
            rate: 1 / (rate as number), // Invert to get rate TO USD
            lastUpdated: now.toISOString()
          });
        });
        
        // Add USD as base
        this.rates.set('USD', {
          currency: 'USD',
          rate: 1.0,
          lastUpdated: now.toISOString()
        });
        
        this.lastFetch = now;
        console.log('✅ Currency rates updated from API');
      } else {
        throw new Error('API request failed');
      }
    } catch (error) {
      console.warn('⚠️ Failed to fetch live rates, using fallback rates:', error);
      
      // Use fallback rates
      Object.entries(this.FALLBACK_RATES).forEach(([currency, rate]) => {
        this.rates.set(currency, {
          currency,
          rate,
          lastUpdated: now.toISOString()
        });
      });
      
      this.lastFetch = now;
    }
  }

  /**
   * Convert any currency to USD
   */
  static async convertToUSD(amount: number, fromCurrency: string): Promise<ConvertedAmount> {
    await this.fetchRates();
    
    // If already USD, return as-is
    if (fromCurrency === 'USD') {
      return {
        originalAmount: amount,
        originalCurrency: fromCurrency,
        convertedAmount: amount,
        convertedCurrency: 'USD',
        exchangeRate: 1.0,
        conversionDate: new Date().toISOString()
      };
    }

    const rate = this.rates.get(fromCurrency);
    
    if (!rate) {
      console.warn(`⚠️ No rate found for ${fromCurrency}, using 1:1 conversion`);
      return {
        originalAmount: amount,
        originalCurrency: fromCurrency,
        convertedAmount: amount,
        convertedCurrency: 'USD',
        exchangeRate: 1.0,
        conversionDate: new Date().toISOString()
      };
    }

    const convertedAmount = amount / rate.rate;
    
    return {
      originalAmount: amount,
      originalCurrency: fromCurrency,
      convertedAmount: Math.round(convertedAmount * 100) / 100, // Round to 2 decimals
      convertedCurrency: 'USD',
      exchangeRate: rate.rate,
      conversionDate: new Date().toISOString()
    };
  }

  /**
   * Convert multiple amounts to USD
   */
  static async convertMultipleToUSD(amounts: Array<{amount: number, currency: string}>): Promise<ConvertedAmount[]> {
    await this.fetchRates();
    
    return Promise.all(
      amounts.map(({amount, currency}) => this.convertToUSD(amount, currency))
    );
  }

  /**
   * Get available currencies
   */
  static getAvailableCurrencies(): string[] {
    return Array.from(this.rates.keys()).sort();
  }

  /**
   * Get exchange rate for a currency
   */
  static async getExchangeRate(currency: string): Promise<number> {
    await this.fetchRates();
    return this.rates.get(currency)?.rate || 1.0;
  }

  /**
   * Format currency display
   */
  static formatCurrency(amount: number, currency: string): string {
    const symbols: Record<string, string> = {
      'USD': '$',
      'EUR': '€',
      'GBP': '£',
      'MAD': 'MAD ',
      'SAR': 'SAR ',
      'AED': 'AED ',
      'EGP': 'EGP ',
      'JPY': '¥',
      'INR': '₹',
      'CAD': 'CAD $',
      'AUD': 'AUD $',
      'CHF': 'CHF ',
      'ZAR': 'R',
      'CNY': '¥',
    };

    const symbol = symbols[currency] || `${currency} `;
    
    if (symbol.endsWith(' ')) {
      return `${symbol}${amount.toFixed(2)}`;
    } else {
      return `${symbol}${amount.toFixed(2)}`;
    }
  }
}