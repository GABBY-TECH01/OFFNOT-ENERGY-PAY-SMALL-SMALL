import React, { useState } from 'react';
import { CheckCircle2, ExternalLink, Mail, MessageCircle, Phone, Send } from 'lucide-react';
import { BranchMap } from '../components/BranchMap';
import { useStore } from '../context/StoreContext';
import { buildWhatsAppLink } from '../utils/instalments';

export function ContactPage() {
  const { submitInquiry } = useStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [branch, setBranch] = useState('Dugbe Branch');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSent(false);
    if (!name.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (phone.trim().length < 5) {
      setError('Please enter a valid phone number (at least 5 digits).');
      return;
    }
    if (message.trim().length < 5) {
      setError('Please write a message of at least 5 characters.');
      return;
    }
    setSubmitting(true);
    try {
      await submitInquiry({
        name,
        email,
        phone,
        branch,
        serviceType: 'General Contact Inquiry',
        message,
      });
      setSent(true);
      setName('');
      setEmail('');
      setPhone('');
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send message.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-12">
      <div>
        <p className="text-xs font-bold tracking-wider text-emerald-700 uppercase mb-2">
          Contact OFFNOT ENERGY
        </p>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-3">
          Speak With Customer Service or Visit Our Ibadan Branches
        </h1>
        <p className="text-base text-slate-600 max-w-2xl">
          Reach our support desk for solar package quotes, instalment application inquiries, payment
          verification, or technical installation support.
        </p>
      </div>

      {/* Official Contact Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <Phone className="w-5 h-5 text-emerald-700 mb-3" />
          <h2 className="text-base font-bold text-slate-900 mb-2">Official Phone Lines</h2>
          <ul className="text-sm text-slate-700 space-y-1.5">
            <li>
              <strong>Customer Service:</strong> 07047053453
            </li>
            <li>
              <strong>Head Office (Dugbe):</strong> 07064159047
            </li>
            <li>
              <strong>Branch Office (Dalute):</strong> 08087928125
            </li>
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <Mail className="w-5 h-5 text-orange-600 mb-3" />
          <h2 className="text-base font-bold text-slate-900 mb-2">Official Email</h2>
          <a
            href="mailto:offnotenergy@gmail.com"
            className="text-sm font-semibold text-emerald-700 hover:underline break-all"
          >
            offnotenergy@gmail.com
          </a>
          <p className="text-xs text-slate-500 mt-2">
            For order documentation, quotes, wholesale partnerships, and after-sales support.
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 flex flex-col justify-between">
          <div>
            <MessageCircle className="w-5 h-5 text-emerald-700 mb-3" />
            <h2 className="text-base font-bold text-slate-900 mb-1">WhatsApp Support Desk</h2>
            <p className="text-sm text-slate-700 mb-4">
              Chat directly with our Ibadan sales &amp; technical desk on WhatsApp.
            </p>
          </div>
          <a
            href={buildWhatsAppLink('Hello OFFNOT ENERGY, I need assistance with solar solutions.')}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800"
          >
            <MessageCircle className="w-4 h-4" />
            Open WhatsApp (07047053453)
          </a>
        </div>
      </div>

      {/* Official Social Media */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-bold text-slate-900 mb-1">Follow OFFNOT ENERGY Online</h2>
        <p className="text-xs text-slate-600 mb-4">
          Connect with our official pages for solar package updates, installations, and seasonal promotions.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href="https://www.facebook.com/offnotenergy"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 hover:border-emerald-700 hover:text-emerald-800"
          >
            Facebook: Offnot Energy
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <a
            href="https://www.instagram.com/offnot.energy?gwpx=MWVpd2JoYzNkb3hpZA=="
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 hover:border-emerald-700 hover:text-emerald-800"
          >
            Instagram: offnot.energy
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <a
            href="https://www.tiktok.com/@offnot_energy?_r=1&_t=ZS-9Bixi05FnGO"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 hover:border-emerald-700 hover:text-emerald-800"
          >
            TikTok: offnot Energy
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Interactive Branch Map */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-4">Ibadan Branch Locations</h2>
        <BranchMap />
      </div>

      {/* Contact Form */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:p-8 max-w-3xl">
        <h2 className="text-xl font-bold text-slate-900 mb-2">Send Us a Message</h2>
        <p className="text-sm text-slate-600 mb-6">
          Your message goes directly to our staff portal for fast response.
        </p>

        {sent && (
          <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-2.5 text-sm text-emerald-900">
            <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
            <span>Message sent successfully. Our team will reach out to you shortly.</span>
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full Name"
              className="px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-sm"
            />
            <input
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone Number (e.g. 0803...)"
              className="px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-sm"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email Address"
              className="px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-sm"
            />
            <select
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-sm"
            >
              <option value="Dugbe Branch">Head Office — Dugbe Iyaganku Road</option>
              <option value="Dalute Branch">Branch Office — Inside Tipper Garage, Dalute Road</option>
              <option value="Customer Service">General Customer Service</option>
            </select>
          </div>
          <textarea
            required
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="How can OFFNOT ENERGY assist you?"
            className="w-full px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-sm"
          />
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 disabled:opacity-60 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            {submitting ? 'Sending...' : 'Send Message'}
          </button>
        </form>
      </div>
    </div>
  );
}
