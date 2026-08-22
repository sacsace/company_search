"use client";

import type { CompanyProfile, Director } from "@/lib/types";

interface CompanyDetailProps {
  profile: CompanyProfile;
  onClose?: () => void;
}

const EMPTY = "공개 정보 없음";

function ListRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-neutral-100 py-3 last:border-0 sm:flex-row sm:gap-4">
      <dt className="w-full shrink-0 text-xs font-semibold text-neutral-500 sm:w-28 lg:w-32">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-sm text-neutral-900">{value}</dd>
    </div>
  );
}

function getRepresentative(directors: Director[]): string {
  const current = directors.filter((d) => d.status !== "Resigned");
  if (current.length === 0) return EMPTY;

  const leader = current.find((d) =>
    /managing director|chief executive|ceo|chairman|founder|proprietor/i.test(d.designation)
  );
  return leader?.name ?? current[0].name;
}

function formatDirectors(directors: Director[]): React.ReactNode {
  const current = directors.filter((d) => d.status !== "Resigned");
  if (current.length === 0) return EMPTY;

  return (
    <ul className="space-y-1.5">
      {current.map((d) => {
        const role = d.designation ? ` (${d.designation})` : "";
        const din = d.din ? ` [DIN ${d.din}]` : "";
        return (
          <li key={`${d.din || d.name}-${d.designation}`} className="leading-relaxed">
            {d.name}
            {role}
            {din}
          </li>
        );
      })}
    </ul>
  );
}

function formatMultilineText(text: string): React.ReactNode {
  if (!text || text === EMPTY) return EMPTY;
  return <p className="whitespace-pre-line leading-relaxed">{text}</p>;
}

function formatWebsite(url: string): React.ReactNode {
  if (!url || url === EMPTY) return EMPTY;
  const href = url.startsWith("http") ? url : `https://${url}`;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="break-all text-neutral-900 underline">
      {url}
    </a>
  );
}

function formatWebsiteComments(profile: CompanyProfile): React.ReactNode {
  const comments = profile.webEnrichment.websiteReviews
    .map((r) => {
      const parts = [r.rating ? `★ ${r.rating}` : null, r.author, r.text].filter(Boolean);
      return parts.join(" · ");
    })
    .filter((text) => text.length > 0);

  if (comments.length === 0) return EMPTY;

  return (
    <ul className="space-y-2">
      {comments.map((text, i) => (
        <li key={i} className="text-sm leading-relaxed text-neutral-800">
          {text}
        </li>
      ))}
    </ul>
  );
}

export function CompanyDetail({ profile, onClose }: CompanyDetailProps) {
  const web = profile.webEnrichment;

  const address = web.address || profile.registeredOffice.address || EMPTY;
  const revenue = web.revenue
    ? `${web.revenue}${web.revenueYear ? ` (${web.revenueYear})` : ""}`
    : EMPTY;
  const employees = web.employees || EMPTY;
  const website = web.website || EMPTY;
  const founded =
    web.foundedDate ||
    profile.dateOfIncorporation ||
    (profile.cinParsed.yearOfIncorporation ? String(profile.cinParsed.yearOfIncorporation) : EMPTY);

  return (
    <div className="w-full border border-neutral-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <p className="text-xs font-semibold text-neutral-500">회사 상세 정보</p>
        {onClose && (
          <button onClick={onClose} className="text-xs text-neutral-500 hover:text-neutral-900">
            닫기
          </button>
        )}
      </div>

      <dl className="px-4 py-1">
        <ListRow label="회사명" value={profile.name || profile.cin} />
        <ListRow label="CIN" value={profile.cin} />
        {profile.summary && <ListRow label="요약" value={formatMultilineText(profile.summary)} />}
        <ListRow
          label="사업 내용"
          value={formatMultilineText(web.businessDescription || profile.industry || EMPTY)}
        />
        <ListRow label="주소" value={formatMultilineText(address)} />
        <ListRow label="대표" value={getRepresentative(profile.directors)} />
        <ListRow label="등기이사" value={formatDirectors(profile.directors)} />
        <ListRow label="매출" value={revenue} />
        <ListRow label="직원수" value={employees} />
        <ListRow label="웹사이트" value={formatWebsite(website)} />
        <ListRow label="설립일" value={founded || EMPTY} />
        <ListRow label="웹사이트 댓글" value={formatWebsiteComments(profile)} />
      </dl>
    </div>
  );
}
