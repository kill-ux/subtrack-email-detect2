
import { Mail, Twitter, Github, Linkedin } from 'lucide-react';

const Footer = () => {
  return (
    <footer className="bg-gray-900 text-white py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-4 gap-8">
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-2 rounded-lg">
                <Mail className="h-6 w-6 text-white" />
              </div>
              <span className="text-xl font-bold">SubTracker</span>
            </div>
            <p className="text-gray-400">
              The smartest way to track and manage your subscription expenses with AI-powered insights.
            </p>
            <div className="flex space-x-4">
              <Twitter className="h-5 w-5 text-gray-400 hover:text-white cursor-pointer transition-colors" />
              <Github className="h-5 w-5 text-gray-400 hover:text-white cursor-pointer transition-colors" />
              <Linkedin className="h-5 w-5 text-gray-400 hover:text-white cursor-pointer transition-colors" />
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">Product</h3>
            <div className="space-y-2">
              <a href="#features" className="block text-gray-400 hover:text-white transition-colors">Features</a>
              <a href="#pricing" className="block text-gray-400 hover:text-white transition-colors">Pricing</a>
              <a href="#security" className="block text-gray-400 hover:text-white transition-colors">Security</a>
              <a href="#" className="block text-gray-400 hover:text-white transition-colors">API</a>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">Company</h3>
            <div className="space-y-2">
              <a href="#" className="block text-gray-400 hover:text-white transition-colors">About</a>
              <a href="#" className="block text-gray-400 hover:text-white transition-colors">Blog</a>
              <a href="#" className="block text-gray-400 hover:text-white transition-colors">Careers</a>
              <a href="#" className="block text-gray-400 hover:text-white transition-colors">Press</a>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">Support</h3>
            <div className="space-y-2">
              <a href="#" className="block text-gray-400 hover:text-white transition-colors">Help Center</a>
              <a href="#" className="block text-gray-400 hover:text-white transition-colors">Contact Us</a>
              <a href="#" className="block text-gray-400 hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="block text-gray-400 hover:text-white transition-colors">Terms of Service</a>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-12 pt-8 text-center">
          <p className="text-gray-400">
            © 2024 SubTracker. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
