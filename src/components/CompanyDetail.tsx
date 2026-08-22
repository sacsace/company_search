"use client";

import {
  Building2,
  MapPin,
  Users,
  Globe,
  IndianRupee,
  Briefcase,
  Mail,
  FileText,
  X,
} from "lucide-react";
import type { CompanyProfile } from "@/lib/types";
import { formatInr } from "@/lib/cin-parser";

interface CompanyDetailProps {
  profile: CompanyProfile;
  onClose?: () => void;
}

export function CompanyDetail({ profile, onClose }: CompanyDetailProps) {
  const currentDirectors = profile.directors.filter((d) => d.status === "Current");

  return (
    <div className="animate-fade-in rounded-2xl border border-slate-200 bg-white shadow-lg">
      <div className="flex items-start justify-between border-b border-slate-100 p-6">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-brand-600" />
            <h2 className="text-xl font-bold text-slate-900">{profile.name}</h2>
          </div>
          <p className="mt-1 font-mono text-sm text-slate-500">{profile.cin}</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="p-6">
        <div className="mb-6 rounded-xl bg-brand-50 p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-brand-800">
            <FileText className="h-4 w-4" />
            AI 요약
          </h3>
          <p className="text-sm leading-relaxed text-brand-900">{profile.summary}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfoCard icon={Briefcase} label="상태" value={profile.status} />
          <InfoCard icon={Briefcase} label="유형" value={profile.type || profile.cinParsed.companyType} />
          <InfoCard icon={Briefcase} label="상장" value={profile.listingStatus} />
          <InfoCard icon={Briefcase} label="업종" value={profile.industry || profile.cinParsed.industryDescription} />
          <InfoCard icon={MapPin} label="등록 주" value={profile.cinParsed.stateName} />
          <InfoCard icon={MapPin} label="ROC" value={profile.roc || "—"} />
          <InfoCard
            icon={IndianRupee}
            label="인가자본"
            value={formatInr(profile.authorizedCapitalInr)}
          />
          <InfoCard
            icon={IndianRupee}
            label="납입자본"
            value={formatInr(profile.paidUpCapitalInr)}
          />
          <InfoCard
            icon={IndianRupee}
            label="매출 (공개)"
            value={profile.webEnrichment.revenue || "공개 정보 없음"}
          />
          <InfoCard
            icon={Globe}
            label="웹사이트"
            value={profile.webEnrichment.website || "—"}
            isLink={!!profile.webEnrichment.website}
          />
          <InfoCard icon={Mail} label="이메일" value={profile.email || "—"} />
          <InfoCard icon={Briefcase} label="설립일" value={profile.dateOfIncorporation || String(profile.cinParsed.yearOfIncorporation)} />
        </div>

        {profile.registeredOffice.address && (
          <div className="mt-4 rounded-xl border border-slate-100 p-4">
            <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <MapPin className="h-4 w-4" />
              등록 사무실
            </h4>
            <p className="text-sm text-slate-600">{profile.registeredOffice.address}</p>
          </div>
        )}

        {currentDirectors.length > 0 && (
          <div className="mt-4 rounded-xl border border-slate-100 p-4">
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Users className="h-4 w-4" />
              등기이사 ({currentDirectors.length}명)
            </h4>
            <div className="space-y-2">
              {currentDirectors.map((d) => (
                <div key={d.din || d.name} className="flex justify-between text-sm">
                  <span className="font-medium text-slate-800">{d.name}</span>
                  <span className="text-slate-500">
                    {d.designation} {d.din && `(DIN: ${d.din})`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {profile.shareholders.length > 0 && (
          <div className="mt-4 rounded-xl border border-slate-100 p-4">
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Users className="h-4 w-4" />
              주주 (공개 정보)
            </h4>
            <div className="space-y-2">
              {profile.shareholders.map((s, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-slate-800">{s.name}</span>
                  <span className="text-slate-500">{s.holdingPercent || "—"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 text-xs text-slate-400">
          데이터 출처: {profile.dataSources.join(" · ")}
        </div>
      </div>
    </div>
  );
}

function InfoCard({
  icon: Icon,
  label,
  value,
  isLink,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  isLink?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-100 p-3">
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      {isLink ? (
        <a
          href={value.startsWith("http") ? value : `https://${value}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 block truncate text-sm font-medium text-brand-600 hover:underline"
        >
          {value}
        </a>
      ) : (
        <p className="mt-1 text-sm font-medium text-slate-800">{value}</p>
      )}
    </div>
  );
}
