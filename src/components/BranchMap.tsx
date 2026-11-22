import React, { useState } from 'react';
import {
  AdvancedMarker,
  InfoWindow,
  Map,
  Pin,
  useAdvancedMarkerRef,
  useApiIsLoaded,
} from '@vis.gl/react-google-maps';
import { ExternalLink, MapPin, Phone } from 'lucide-react';

export interface BranchInfo {
  id: 'dugbe' | 'dalute';
  name: string;
  address: string;
  phone: string;
  position: { lat: number; lng: number };
  hours: string;
}

export const OFFNOT_BRANCHES: BranchInfo[] = [
  {
    id: 'dugbe',
    name: 'OFFNOT ENERGY — Dugbe Branch',
    address: 'Opposite Sweetco, Dugbe Iyaganku Road, Ibadan, Oyo State, Nigeria',
    phone: '07064159047',
    position: { lat: 7.3878, lng: 3.8794 },
    hours: 'Mon – Sat: 8:00 AM – 6:00 PM',
  },
  {
    id: 'dalute',
    name: 'OFFNOT ENERGY — Dalute Branch',
    address: 'Inside Tipper Garage, Dalute Road, Ibadan, Oyo State, Nigeria',
    phone: '08087928125',
    position: { lat: 7.3485, lng: 3.848 },
    hours: 'Mon – Sat: 8:00 AM – 6:00 PM',
  },
];

function BranchMarker({
  branch,
  isSelected,
  onSelect,
}: {
  branch: BranchInfo;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={branch.position}
        title={branch.name}
        onClick={onSelect}
      >
        <Pin
          background={branch.id === 'dugbe' ? '#15803d' : '#ea580c'}
          borderColor="#ffffff"
          glyphColor="#ffffff"
          scale={isSelected ? 1.25 : 1.05}
        />
      </AdvancedMarker>

      {isSelected && marker && (
        <InfoWindow anchor={marker} onCloseClick={onSelect} maxWidth={280}>
          <div className="p-1 text-slate-900">
            <p className="font-bold text-sm text-emerald-800 mb-1">{branch.name}</p>
            <p className="text-xs text-slate-600 mb-1.5">{branch.address}</p>
            <p className="text-xs font-medium text-slate-800 mb-2">Tel: {branch.phone}</p>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                branch.address
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 hover:underline"
            >
              Open Directions
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

export function BranchMap() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  const isLoaded = useApiIsLoaded();
  const [selectedId, setSelectedId] = useState<'dugbe' | 'dalute' | null>('dugbe');

  const selectedBranch = OFFNOT_BRANCHES.find((b) => b.id === selectedId) || OFFNOT_BRANCHES[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
      <div className="lg:col-span-5 flex flex-col gap-4">
        {OFFNOT_BRANCHES.map((branch) => {
          const active = selectedId === branch.id;
          return (
            <button
              key={branch.id}
              type="button"
              onClick={() => setSelectedId(branch.id)}
              className={`text-left p-5 rounded-xl border transition-colors cursor-pointer ${
                active
                  ? 'border-emerald-700 bg-emerald-50/60 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-orange-600 mb-1">
                    {branch.id === 'dugbe' ? 'Dugbe Main Office' : 'Dalute Sales & Distribution'}
                  </p>
                  <h3 className="text-base font-bold text-slate-900 mb-1.5">{branch.name}</h3>
                </div>
                <MapPin
                  className={`w-5 h-5 shrink-0 ${
                    active ? 'text-emerald-700' : 'text-slate-400'
                  }`}
                />
              </div>
              <p className="text-sm text-slate-600 mb-3">{branch.address}</p>
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700 font-medium">
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-emerald-700" />
                  {branch.phone}
                </span>
                <span>{branch.hours}</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="lg:col-span-7">
        <div className="w-full h-[380px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100 relative">
          {apiKey && isLoaded ? (
            <Map
              mapId="DEMO_MAP_ID"
              defaultCenter={{ lat: 7.368, lng: 3.864 }}
              center={selectedBranch.position}
              defaultZoom={12}
              gestureHandling="greedy"
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{ width: '100%', height: '100%' }}
            >
              {OFFNOT_BRANCHES.map((branch) => (
                <BranchMarker
                  key={branch.id}
                  branch={branch}
                  isSelected={selectedId === branch.id}
                  onSelect={() => setSelectedId(selectedId === branch.id ? null : branch.id)}
                />
              ))}
            </Map>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-slate-50">
              <MapPin className="w-8 h-8 text-emerald-700 mb-2" />
              <p className="text-sm font-semibold text-slate-900 mb-1">
                {selectedBranch.name}
              </p>
              <p className="text-xs text-slate-600 max-w-md mb-4">{selectedBranch.address}</p>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  selectedBranch.address
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 transition-colors"
              >
                View Ibadan Branch on Google Maps
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
