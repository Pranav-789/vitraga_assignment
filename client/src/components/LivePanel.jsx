import React from 'react';
import { User, Phone, Mail, MapPin, Wallet, Calendar, Users, Plane, FileText, CheckCircle2, AlertTriangle, Info } from 'lucide-react';

export default function LivePanel({ extractedData }) {
  const { customer, travel, qualification } = extractedData;

  const getConfidenceBadge = (confidence) => {
    switch(confidence) {
      case 'High': return <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-md text-xs font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> High</span>;
      case 'Medium': return <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-md text-xs font-medium flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Medium</span>;
      default: return <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-md text-xs font-medium flex items-center gap-1"><Info className="w-3 h-3"/> Low</span>;
    }
  };

  const Field = ({ icon: Icon, label, value }) => (
    <div className="flex items-start gap-3 py-2.5">
      <div className="mt-0.5 text-gray-400">
        <Icon className="w-[18px] h-[18px]" />
      </div>
      <div className="flex-1">
        <p className="text-xs text-gray-500 font-medium mb-0.5">{label}</p>
        {value ? (
          <p className="text-[14px] text-gray-800 font-medium">{value}</p>
        ) : (
          <p className="text-[14px] text-gray-400 italic">Not provided</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full w-full bg-gemini-bg pt-4">
      <div className="px-6 py-2 pb-4 border-b border-gray-200/60 mb-2">
        <h2 className="text-[13px] font-semibold text-gray-500 uppercase tracking-wider">Live Extraction</h2>
      </div>

      <div className="px-4 space-y-4 overflow-y-auto flex-1 hide-scrollbar pb-6">
        
        {/* Section 1: Qualification */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-medium text-gray-800 text-[15px]">Qualification</h3>
            {getConfidenceBadge(qualification?.confidence)}
          </div>
          
          <div className="mb-4">
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-gray-500">Lead Score</span>
              <span className="font-semibold text-gemini-blue">{qualification?.leadScore || 0}/100</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div 
                className="bg-gemini-blue h-1.5 rounded-full transition-all duration-700 ease-out"
                style={{ width: `${qualification?.leadScore || 0}%` }}
              ></div>
            </div>
          </div>

          {qualification?.reason && (
            <div className="mt-3">
              <p className="text-[13px] text-gray-600 leading-relaxed bg-[#f8f9fa] p-3 rounded-xl border border-gray-100">{qualification.reason}</p>
            </div>
          )}
        </div>

        {/* Section 2: Customer Identity */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-medium text-gray-800 text-[15px] mb-2 border-b border-gray-100 pb-3">Identity Profile</h3>
          <div className="flex flex-col">
            <Field icon={User} label="Name" value={customer?.name} />
            <Field icon={Phone} label="Phone" value={customer?.phone} />
            <Field icon={Mail} label="Email" value={customer?.email} />
          </div>
        </div>

        {/* Section 3: Travel Parameters */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-medium text-gray-800 text-[15px] mb-2 border-b border-gray-100 pb-3">Trip Details</h3>
          <div className="flex flex-col">
            <Field icon={MapPin} label="Destination" value={travel?.destination} />
            <Field icon={MapPin} label="Departure" value={travel?.departureCity} />
            <Field icon={Calendar} label="Dates" value={travel?.travelDate} />
            <Field icon={Calendar} label="Duration" value={travel?.duration} />
            <Field icon={Users} label="Travellers" value={travel?.travellers?.toString()} />
            <Field icon={Wallet} label="Budget" value={travel?.budget} />
            <Field icon={Plane} label="Trip Type" value={travel?.tripType} />
            <div className="pt-2 mt-1 border-t border-gray-100">
               <Field icon={FileText} label="Special Requests" value={travel?.specialRequirements} />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
