
import { Shield, Lock, Eye, Server } from 'lucide-react';

const Security = () => {
  const securityFeatures = [
    {
      icon: Shield,
      title: "Enterprise-Grade Encryption",
      description: "All data is encrypted in transit and at rest using AES-256 encryption, the same standard used by banks and government agencies."
    },
    {
      icon: Lock,
      title: "OAuth 2.0 Authentication",
      description: "We use secure OAuth 2.0 to connect to your email. We never see or store your email passwords."
    },
    {
      icon: Eye,
      title: "Read-Only Access",
      description: "We only request read-only permissions to scan your emails. We cannot send emails or access your personal messages."
    },
    {
      icon: Server,
      title: "SOC 2 Compliant",
      description: "Our infrastructure meets the highest security standards with regular audits and compliance certifications."
    }
  ];

  return (
    <section id="security" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
            Your privacy and security are 
            <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              {" "}our top priority
            </span>
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            We understand the importance of your financial data. That's why we've built SubTracker with security at its core.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-12 items-center mb-16">
          <div className="space-y-8">
            {securityFeatures.map((feature, index) => (
              <div key={index} className="flex items-start space-x-4">
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-3 rounded-lg flex-shrink-0">
                  <feature.icon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">{feature.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-2xl p-8">
            <div className="text-center space-y-6">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full">
                <Shield className="h-10 w-10 text-white" />
              </div>
              <div className="space-y-4">
                <h3 className="text-2xl font-bold text-gray-900">Zero Knowledge Architecture</h3>
                <p className="text-gray-600">
                  We process your emails using advanced AI, but we never store the content. 
                  Only subscription metadata is retained to provide you with insights.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="bg-white rounded-lg p-4">
                  <div className="text-2xl font-bold text-green-600">99.9%</div>
                  <div className="text-sm text-gray-600">Uptime SLA</div>
                </div>
                <div className="bg-white rounded-lg p-4">
                  <div className="text-2xl font-bold text-blue-600">24/7</div>
                  <div className="text-sm text-gray-600">Security Monitoring</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Security;
