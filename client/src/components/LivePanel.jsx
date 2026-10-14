import React, { useState } from 'react';
import { 
  User, Phone, Mail, MapPin, Wallet, Calendar, Users, Plane, 
  FileText, CheckCircle2, AlertTriangle, Info, Bot, Clock, 
  Layers, ShieldCheck, RefreshCw, Cpu, Navigation
} from 'lucide-react';

export default function LivePanel({ extractedData, tripState, user }) {
  const [activeTab, setActiveTab] = useState('intelligence'); // 'intelligence' | 'itinerary' | 'agents'
  const { customer, travel, qualification, budgetEstimate, consentGiven } = extractedData || {};
  const dailyPlans = tripState?.dailyPlans || [];
  const validationLogs = tripState?.validationLogs || [];

  const getConfidenceBadge = (confidence) => {
    switch(confidence) {
      case 'High': return <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-md text-xs font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> High</span>;
      case 'Medium': return <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-md text-xs font-medium flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Medium</span>;
      default: return <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md text-xs font-medium flex items-center gap-1"><Info className="w-3 h-3"/> Low</span>;
    }
  };

  const Field = ({ icon: Icon, label, value }) => (
    <div className="flex items-start gap-3 py-2">
      <div className="mt-0.5 text-gray-400">
        <Icon className="w-[16px] h-[16px]" />
      </div>
      <div className="flex-1">
        <p className="text-[11px] text-gray-500 font-medium mb-0.5">{label}</p>
        {value ? (
          <p className="text-[13px] text-gray-800 font-medium leading-tight">{value}</p>
        ) : (
          <p className="text-[13px] text-gray-400 italic">Not detected</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full w-full bg-gemini-bg pt-3">
      {/* Header Tabs */}
      <div className="px-4 pb-3 border-b border-gray-200/60">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[12px] font-bold text-gray-500 uppercase tracking-wider">Multi-Agent Engine</span>
          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse"></span>
            Qdrant Grounded
          </span>
        </div>
        
        <div className="flex bg-gray-200/70 p-0.5 rounded-xl text-xs font-medium text-gray-600">
          <button
            onClick={() => setActiveTab('intelligence')}
            className={`flex-1 py-1.5 rounded-lg transition-all ${activeTab === 'intelligence' ? 'bg-white text-gray-900 shadow-sm' : 'hover:text-gray-900'}`}
          >
            Lead Intel
          </button>
          <button
            onClick={() => setActiveTab('itinerary')}
            className={`flex-1 py-1.5 rounded-lg transition-all ${activeTab === 'itinerary' ? 'bg-white text-gray-900 shadow-sm' : 'hover:text-gray-900'}`}
          >
            Trip ({dailyPlans.length}d)
          </button>
          <button
            onClick={() => setActiveTab('agents')}
            className={`flex-1 py-1.5 rounded-lg transition-all ${activeTab === 'agents' ? 'bg-white text-gray-900 shadow-sm' : 'hover:text-gray-900'}`}
          >
            Agent Logs
          </button>
        </div>
      </div>

      <div className="px-3.5 space-y-3.5 overflow-y-auto flex-1 hide-scrollbar py-3">
        
        {/* TAB 1: LEAD INTELLIGENCE */}
        {activeTab === 'intelligence' && (
          <>
            {/* Section: Silent Qualification */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-1.5">
                  <Bot className="w-4 h-4 text-indigo-600" />
                  <h3 className="font-semibold text-gray-800 text-[14px]">Silent Lead Observer</h3>
                </div>
                {getConfidenceBadge(qualification?.confidence)}
              </div>
              
              <div className="mb-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-500">Intent Score</span>
                  <span className="font-bold text-gemini-blue">{qualification?.leadScore || 0}/100</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-gemini-blue h-1.5 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${qualification?.leadScore || 0}%` }}
                  ></div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 p-2.5 rounded-xl border border-gray-100 mb-2">
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase font-semibold">Budget Status</span>
                  <span className="font-semibold text-gray-700">{budgetEstimate || travel?.budget || 'Evaluating...'}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase font-semibold">Agency Consent</span>
                  <span className={`font-semibold ${consentGiven ? 'text-green-600' : 'text-amber-600'}`}>
                    {consentGiven ? 'Consented ✓' : 'Value-First (Pending)'}
                  </span>
                </div>
              </div>

              {qualification?.reason && (
                <p className="text-[12px] text-gray-600 leading-relaxed bg-[#f8f9fa] p-2.5 rounded-xl border border-gray-100">
                  {qualification.reason}
                </p>
              )}
            </div>

            {/* Section: Identity */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <h3 className="font-semibold text-gray-800 text-[14px] mb-2 border-b border-gray-100 pb-2">Customer Profile</h3>
              <div className="flex flex-col">
                <Field icon={User} label="Username" value={user?.username || customer?.name} />
                <Field icon={Mail} label="Email" value={user?.email || customer?.email} />
                <Field icon={Phone} label="Phone" value={customer?.phone} />
              </div>
            </div>

            {/* Section: Travel Parameters */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <h3 className="font-semibold text-gray-800 text-[14px] mb-2 border-b border-gray-100 pb-2">Trip Constraints</h3>
              <div className="flex flex-col">
                <Field icon={MapPin} label="Destination" value={travel?.destination || tripState?.destination} />
                <Field icon={Navigation} label="Departure Location" value={travel?.departureCity || tripState?.departureCity} />
                <Field icon={Calendar} label="Departure Date / Time" value={travel?.travelDate || tripState?.travelDate} />
                <Field icon={Clock} label="Duration" value={travel?.duration || tripState?.duration} />
                <Field icon={Wallet} label="Budget Estimate" value={travel?.budget || tripState?.budget || budgetEstimate} />
                <Field icon={Users} label="Travellers" value={travel?.travellers?.toString() || tripState?.travellers?.toString()} />
                <Field icon={Plane} label="Trip Type" value={travel?.tripType} />
                {travel?.specialRequirements && (
                  <div className="pt-2 mt-1 border-t border-gray-100">
                    <Field icon={FileText} label="Special Requests" value={travel?.specialRequirements} />
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* TAB 2: FACT-GROUNDED ITINERARY */}
        {activeTab === 'itinerary' && (
          <div className="space-y-3">
            {dailyPlans.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 text-center border border-gray-200">
                <Layers className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-500 font-medium">No daily plans generated yet.</p>
                <p className="text-[11px] text-gray-400 mt-1">Start chatting to trigger the Multi-Agent planning loop.</p>
              </div>
            ) : (
              dailyPlans.map((day) => (
                <div key={day.day_number} className="bg-white rounded-2xl border border-gray-200 p-3.5 shadow-sm">
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-100">
                    <h4 className="font-semibold text-xs text-gray-900">{day.title || `Day ${day.day_number}`}</h4>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-600" />
                      {day.validation_status === 'regenerated' ? 'Regenerated' : 'Verified'}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    {/* Morning */}
                    {day.morning_slot && (
                      <div className="bg-gray-50 p-2 rounded-xl">
                        <div className="flex justify-between items-center text-[11px] font-semibold text-indigo-700 mb-0.5">
                          <span>Morning (09:00 AM)</span>
                          {day.morning_slot.coordinates && (
                            <span className="text-[9px] text-gray-400 font-mono">
                              {day.morning_slot.coordinates.latitude?.toFixed(2)}, {day.morning_slot.coordinates.longitude?.toFixed(2)}
                            </span>
                          )}
                        </div>
                        <p className="font-medium text-gray-800">{day.morning_slot.location_name}</p>
                        <p className="text-[11px] text-gray-500 line-clamp-2 mt-0.5">{day.morning_slot.activity_description}</p>
                      </div>
                    )}

                    {/* Afternoon */}
                    {day.afternoon_slot && (
                      <div className="bg-gray-50 p-2 rounded-xl">
                        <div className="flex justify-between items-center text-[11px] font-semibold text-amber-700 mb-0.5">
                          <span>Afternoon (02:00 PM)</span>
                          {day.afternoon_slot.travel_time_from_prev_mins > 0 && (
                            <span className="text-[10px] text-amber-600 font-medium flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5" />
                              {day.afternoon_slot.travel_time_from_prev_mins}m transit
                            </span>
                          )}
                        </div>
                        <p className="font-medium text-gray-800">{day.afternoon_slot.location_name}</p>
                        <p className="text-[11px] text-gray-500 line-clamp-2 mt-0.5">{day.afternoon_slot.activity_description}</p>
                      </div>
                    )}

                    {/* Evening */}
                    {day.evening_slot && (
                      <div className="bg-gray-50 p-2 rounded-xl">
                        <div className="flex justify-between items-center text-[11px] font-semibold text-purple-700 mb-0.5">
                          <span>Evening (07:00 PM)</span>
                          {day.evening_slot.travel_time_from_prev_mins > 0 && (
                            <span className="text-[10px] text-purple-600 font-medium flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5" />
                              {day.evening_slot.travel_time_from_prev_mins}m transit
                            </span>
                          )}
                        </div>
                        <p className="font-medium text-gray-800">{day.evening_slot.location_name}</p>
                        <p className="text-[11px] text-gray-500 line-clamp-2 mt-0.5">{day.evening_slot.activity_description}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 3: AGENTS & VALIDATION AUDIT */}
        {activeTab === 'agents' && (
          <div className="space-y-3">
            {/* Active Workers Card */}
            <div className="bg-white rounded-2xl border border-gray-200 p-3.5 shadow-sm">
              <h4 className="text-xs font-semibold text-gray-800 mb-2.5 flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-blue-600" />
                Active Agent Architecture
              </h4>
              
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2 rounded-xl bg-blue-50/70 border border-blue-100">
                  <span className="font-medium text-blue-900">TripSupervisor (LangGraph)</span>
                  <span className="text-[10px] font-bold text-blue-700 uppercase">Orchestrator</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-emerald-50/70 border border-emerald-100">
                  <span className="font-medium text-emerald-900">DayPlannerAgent</span>
                  <span className="text-[10px] font-bold text-emerald-700 uppercase">Drafting</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-amber-50/70 border border-amber-100">
                  <span className="font-medium text-amber-900">LogisticsValidatorAgent</span>
                  <span className="text-[10px] font-bold text-amber-700 uppercase">Haversine</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-purple-50/70 border border-purple-100">
                  <span className="font-medium text-purple-900">CriticAgent</span>
                  <span className="text-[10px] font-bold text-purple-700 uppercase">Re-prompt</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-gray-50 border border-gray-200">
                  <span className="font-medium text-gray-900">Qdrant Vector DB</span>
                  <span className="text-[10px] font-bold text-gray-700 uppercase">Grounded</span>
                </div>
              </div>
            </div>

            {/* Validation Logs */}
            <div className="bg-white rounded-2xl border border-gray-200 p-3.5 shadow-sm">
              <h4 className="text-xs font-semibold text-gray-800 mb-2 flex items-center justify-between">
                <span>Validation Audit Trail</span>
                <span className="text-[10px] text-gray-400 font-mono">{validationLogs.length} events</span>
              </h4>

              <div className="bg-gray-900 text-gray-200 p-3 rounded-xl font-mono text-[11px] max-h-64 overflow-y-auto space-y-1 hide-scrollbar">
                {validationLogs.length === 0 ? (
                  <p className="text-gray-500 italic">No audit events logged yet.</p>
                ) : (
                  validationLogs.map((log, i) => (
                    <div key={i} className="leading-snug">
                      <span className="text-emerald-400">&gt;</span> {log}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
