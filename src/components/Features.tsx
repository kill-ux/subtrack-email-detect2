
import { Mail, Zap, Bell, BarChart3, Shield, Calendar } from 'lucide-react';

const Features = () => {
  const features = [
    {
      icon: Mail,
      title: "Email Integration",
      description: "Securely connect your Gmail with read-only access. Our AI scans receipts and confirmation emails to detect subscriptions automatically."
    },
    {
      icon: Zap,
      title: "AI-Powered Detection",
      description: "Advanced machine learning algorithms identify subscription patterns, pricing changes, and billing cycles with 99% accuracy."
    },
    {
      icon: Bell,
      title: "Smart Alerts",
      description: "Get notified before renewals, price increases, and when we detect unused subscriptions draining your budget."
    },
    {
      icon: BarChart3,
      title: "Spending Analytics",
      description: "Visualize your subscription spending patterns, track trends, and discover opportunities to save money."
    },
    {
      icon: Shield,
      title: "Bank-Level Security",
      description: "Your data is encrypted and protected with enterprise-grade security. We never store your passwords or personal emails."
    },
    {
      icon: Calendar,
      title: "Renewal Calendar",
      description: "See all your upcoming renewals in one place and plan your budget accordingly with our interactive calendar view."
    }
  ];

  return (
    <section id="features" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
            Everything you need to 
            <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              {" "}master your subscriptions
            </span>
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Our comprehensive platform gives you complete visibility and control over your recurring expenses.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div key={index} className="group p-6 rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center space-x-4 mb-4">
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-3 rounded-lg group-hover:scale-110 transition-transform duration-300">
                  <feature.icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900">{feature.title}</h3>
              </div>
              <p className="text-gray-600 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
