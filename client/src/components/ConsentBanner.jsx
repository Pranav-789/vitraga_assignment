import React, { useState } from 'react';
import { CheckCircle2, Shield, X, Sparkles, Building2, UserCheck } from 'lucide-react';

export default function ConsentBanner({ user, onSubmitConsent, isSubmitted, onDismiss }) {
  const [phone, setPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    // User personal details (name, email) are automatically provided from authenticated account
    await onSubmitConsent(true, phone ? { phone } : {});
    setIsSubmitting(false);
  };

  const handleDecline = async () => {
    setIsSubmitting(true);
    await onSubmitConsent(false);
    setIsSubmitting(false);
  };

  if (isSubmitted) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 sm:p-5 shadow-sm my-4 transition-all animate-in fade-in">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-emerald-100 rounded-xl text-emerald-700">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-emerald-900 text-sm sm:text-base">Itinerary Shared with Partner Agencies</h4>
            <p className="text-emerald-700 text-xs sm:text-sm mt-0.5">
              Verified travel partners have received your trip details for <strong>{user?.email}</strong> and will contact you shortly with custom quotes!
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-blue-50/90 via-indigo-50/50 to-white border border-blue-200/80 rounded-2xl p-4 sm:p-5 shadow-md my-4 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-blue-400/10 rounded-full blur-2xl pointer-events-none" />
      
      <div className="flex justify-between items-start gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="p-1.5 bg-blue-600 text-white rounded-lg">
            <Sparkles className="w-4 h-4" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-blue-700">Value-First Booking Offer</span>
        </div>
        {onDismiss && (
          <button 
            onClick={onDismiss} 
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <h3 className="font-semibold text-gray-900 text-sm sm:text-base mb-1">
        Want exclusive partner booking quotes for this trip?
      </h3>
      <p className="text-gray-600 text-xs sm:text-sm mb-3 leading-relaxed">
        Your itinerary is verified. With one click, share this plan with our certified agency network to receive discounted quotes.
      </p>

      {/* Authenticated account preview - No manual name/email entry needed! */}
      <div className="bg-white/80 border border-blue-100 rounded-xl p-3 mb-3 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-gray-700">
          <UserCheck className="w-4 h-4 text-emerald-600" />
          <span>Sharing as: <strong>{user?.username || 'You'}</strong> ({user?.email})</span>
        </div>
        <span className="text-[11px] text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md">Verified Account</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2 items-center">
          <input
            type="tel"
            placeholder="Phone number for WhatsApp/SMS quotes (optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full sm:flex-1 bg-white border border-gray-200 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handleDecline}
              disabled={isSubmitting}
              className="px-3.5 py-2 text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-xl font-medium transition-colors"
            >
              Keep private
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-medium shadow-sm transition-all"
            >
              <Building2 className="w-4 h-4" />
              <span>{isSubmitting ? "Connecting..." : "Request Quotes"}</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
          <Shield className="w-3.5 h-3.5 text-blue-600" />
          <span>No forms to fill. Zero obligation. Privacy protected.</span>
        </div>
      </form>
    </div>
  );
}
