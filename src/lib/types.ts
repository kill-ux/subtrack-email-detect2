export interface Subscription {
  id: string;
  name: string;
  amount: number;
  currency: string;
  billingCycle: 'monthly' | 'yearly' | 'weekly';
  nextPaymentDate: string;
  category: string;
  status: 'active' | 'cancelled' | 'trial';
  provider: string;
  lastDetectedEmail?: {
    id: string;
    date: string;
    subject: string;
  };
}

export interface EmailData {
  id: string;
  subject: string;
  from: string;
  date: string;
  body: string;
}