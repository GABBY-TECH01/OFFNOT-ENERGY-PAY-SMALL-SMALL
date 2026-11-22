import React, { useState } from 'react';
import { CheckCircle2, Send, Wrench } from 'lucide-react';
import { useStore } from '../context/StoreContext';

const SERVICES = [
  {
    title: 'Solar System Sales and Installation',
    desc: 'Turnkey residential and commercial solar installations engineered for reliable 24/7 clean energy performance.',
  },
  {
    title: 'Inverter and Battery Sales',
    desc: 'Pure sine wave hybrid inverters, LiFePO4 lithium batteries, and tall tubular deep-cycle batteries.',
  },
  {
    title: 'Solar Panel Supply',
    desc: 'High-efficiency monocrystalline solar PV modules supplied in single units or bulk pallets.',
  },
  {
    title: 'Solar Accessories and Electrical Protection Devices',
    desc: 'DC/AC surge arresters, circuit breakers, combiner boxes, PV solar cables, and changeover switches.',
  },
  {
    title: 'Residential and Commercial Solar Solutions',
    desc: 'Tailored energy sizing for homes, estates, clinics, retail stores, offices, and industrial hubs.',
  },
  {
    title: 'Solar System Maintenance and Upgrades',
    desc: 'System diagnostics, battery bank expansion, inverter upgrades, and preventive PV array cleaning.',
  },
  {
    title: 'Wholesale and Retail Distribution',
    desc: 'Direct supply for installers, resellers, contractors, and end-users from our Ibadan branches.',
  },
  {
    title: 'Nationwide Delivery and Installation Support',
    desc: 'Coordinated logistics and certified installation support across Oyo State and Nigeria.',
  },
  {
    title: 'Technical Consultation and Customer Support',
    desc: 'Honest load audits, energy calculations, and responsive post-installation support.',
  },
];

export function ServicesPage() {
  const { submitInquiry } = useStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [branch, setBranch] = useState('Dugbe Branch');
  const [serviceType, setServiceType] = useState('Solar System Sales and Installation');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await submitInquiry({ name, email, phone, branch, serviceType, message });
      setSubmitted(true);
      setName('');
      setEmail('');
      setPhone('');
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit inquiry.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-14">
      <div className="max-w-3xl">
        <p className="text-xs font-bold tracking-wider text-emerald-700 uppercase mb-2">
          Our Services · Ibadan &amp; Nationwide
        </p>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-4">
          Professional Solar Engineering &amp; Distribution Services
        </h1>
        <p className="text-base text-slate-600 leading-relaxed">
          From single-component retail sales to full commercial solar microgrids, OFFNOT ENERGY
          delivers genuine hardware backed by experienced Nigerian solar technicians.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {SERVICES.map((srv, idx) => (
          <div key={srv.title} className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-orange-600 font-mono-num">
                {String(idx + 1).padStart(2, '0')}
              </span>
              <Wrench className="w-4 h-4 text-emerald-700" />
            </div>
            <h2 className="text-base font-bold text-slate-900 mb-2">{srv.title}</h2>
            <p className="text-sm text-slate-600 leading-relaxed">{srv.desc}</p>
          </div>
        ))}
      </div>

      {/* Technical Consultation Form */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-4">
          <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
            Technical Consultation
          </p>
          <h2 className="text-2xl font-bold text-slate-900">
            Request a Solar Load Assessment or Wholesale Quote
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Tell our engineering team about the appliances you want to power, or inquire about
            wholesale pricing, maintenance, and upgrades.
          </p>
          <div className="text-sm text-slate-700 space-y-1.5 pt-2">
            <p>
              <strong>Customer Service:</strong> 07047053453
            </p>
            <p>
              <strong>Dugbe Branch:</strong> 07064159047
            </p>
            <p>
              <strong>Dalute Branch:</strong> 08087928125
            </p>
            <p>
              <strong>Email:</strong> offnotenergy@gmail.com
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          {submitted && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-2.5 text-sm text-emerald-900">
              <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
              <span>Your consultation request has been received. Our technical team will contact you shortly.</span>
            </div>
          )}
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm"
                placeholder="Your full name"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
              <input
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm"
                placeholder="e.g. 0803..."
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Preferred Branch</label>
              <select
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm bg-white"
              >
                <option value="Dugbe Branch">Dugbe Branch (Iyaganku Road)</option>
                <option value="Dalute Branch">Dalute Branch (Tipper Garage)</option>
                <option value="Nationwide Support">Nationwide Delivery / Remote</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Service Needed</label>
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm bg-white"
            >
              {SERVICES.map((s) => (
                <option key={s.title} value={s.title}>
                  {s.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Project Details / Appliances to Power
            </label>
            <textarea
              required
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm"
              placeholder="Describe your location, home or business load, or product inquiry..."
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 disabled:opacity-60 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            {submitting ? 'Submitting...' : 'Submit Consultation Request'}
          </button>
        </form>
      </div>
    </div>
  );
}
