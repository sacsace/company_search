"use client";

import type { CompanyProfile, Director, EmployeeReview } from "@/lib/types";
interface CompanyDetailProps {
  profile: CompanyProfile;
  onClose?: () => void;
}

const EMPTY = "공개 정보 없음";

function ListRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-neutral-100 py-2.5 last:border-0 sm:flex-row sm:gap-4">
      <dt className="w-full shrink-0 text-[11px] font-semibold text-neutral-500 sm:w-28 lg:w-32">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-xs leading-relaxed text-neutral-900">{value}</dd>
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
          <li key={`${d.din || d.name}-${d.designation}`} className="text-xs leading-relaxed">
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
  return <p className="whitespace-pre-line text-xs leading-relaxed">{text}</p>;
}

function StarRating({ rating }: { rating: number }) {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    const filled = rating >= i;
    const half = !filled && rating >= i - 0.5;
    stars.push(
      <span key={i} className={filled || half ? "text-amber-500" : "text-neutral-300"}>
        {filled ? "★" : half ? "⯨" : "☆"}
      </span>
    );
  }
  return <span className="text-sm leading-none">{stars}</span>;
}

function GoogleMapsRatingRow({ profile }: { profile: CompanyProfile }) {
  const { googleMapsRating, googleMapsReviewCount, googleMapsUrl } = profile.webEnrichment;
  if (googleMapsRating === null) return null;

  const meta = [
    `${googleMapsRating.toFixed(1)} / 5`,
    googleMapsReviewCount !== null ? `리뷰 ${googleMapsReviewCount}건` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <StarRating rating={googleMapsRating} />
      <span className="text-xs text-neutral-800">{meta}</span>
      {googleMapsUrl && (
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-neutral-500 underline"
        >
          구글맵에서 보기
        </a>
      )}
    </div>
  );
}

function formatCapitalInr(amount: number): string {
  if (!amount || amount <= 0) return EMPTY;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
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

function formatReviewCount(count: number | null): string | null {
  if (count === null) return null;
  if (count >= 100000) return `${(count / 100000).toFixed(1).replace(/\.0$/, "")}L건`;
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}K건`;
  return `${count}건`;
}

type OnlineEvalItem = {
  key: string;
  platform: string;
  rating: number | null;
  title: string | null;
  meta: string | null;
  likes: string | null;
  dislikes: string | null;
  body: string | null;
  subRatings: { name: string; rating: number }[];
  url: string | null;
};

function buildOnlineEvalItems(profile: CompanyProfile): OnlineEvalItem[] {
  const web = profile.webEnrichment;
  const items: OnlineEvalItem[] = [];
  const seen = new Set<string>();

  const pushUnique = (item: OnlineEvalItem) => {
    const fingerprint = `${item.platform}|${item.title || ""}|${(item.likes || item.dislikes || item.body || "").slice(0, 80)}`;
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);
    items.push(item);
  };

  for (const review of web.employeeReviews) {
    pushUnique({
      key: `emp-${review.platform}-${review.url}-${review.title}`,
      platform: review.platform,
      rating: review.rating,
      title: review.title,
      meta: [review.jobProfile, review.location, review.department, review.date].filter(Boolean).join(" · ") || null,
      likes: review.likes,
      dislikes: review.dislikes,
      body: review.workDetails,
      subRatings: review.subRatings,
      url: review.url || null,
    });
  }

  for (const snippet of web.glassdoorSnippets) {
    pushUnique({
      key: `gd-${snippet.slice(0, 40)}`,
      platform: "Glassdoor",
      rating: web.glassdoorRating,
      title: "Glassdoor 평가 요약",
      meta: formatReviewCount(web.glassdoorReviewCount),
      likes: null,
      dislikes: null,
      body: snippet,
      subRatings: [],
      url: web.glassdoorUrl,
    });
  }

  for (const review of web.websiteReviews) {
    pushUnique({
      key: `web-${review.url}-${review.text.slice(0, 40)}`,
      platform: review.source || "웹 리뷰",
      rating: review.rating ? parseFloat(String(review.rating).replace(/[^\d.]/g, "")) || null : null,
      title: review.author ? `${review.author} 평가` : "웹사이트·리뷰 사이트 평가",
      meta: null,
      likes: null,
      dislikes: null,
      body: review.text,
      subRatings: [],
      url: review.url || null,
    });
  }

  for (const comment of web.snsComments) {
    pushUnique({
      key: `sns-${comment.platform}-${comment.text.slice(0, 40)}`,
      platform: comment.platform,
      rating: comment.rating ? parseFloat(String(comment.rating).replace(/[^\d.]/g, "")) || null : null,
      title: comment.author ? `${comment.author} 댓글` : `${comment.platform} 댓글`,
      meta: comment.date,
      likes: null,
      dislikes: null,
      body: comment.text,
      subRatings: [],
      url: comment.url || null,
    });
  }

  return items;
}

function OnlineReviewsSection({ profile }: { profile: CompanyProfile }) {
  const web = profile.webEnrichment;
  const items = buildOnlineEvalItems(profile);

  if (items.length === 0) {
    return (
      <div className="border-t border-neutral-200 px-4 py-4">
        <p className="text-[11px] font-semibold text-neutral-500">온라인 평가</p>
        <p className="mt-2 text-xs text-neutral-500">수집된 온라인 댓글·평가가 없습니다.</p>
      </div>
    );
  }

  const summaryParts = [
    web.ambitionBoxRating !== null
      ? `AmbitionBox ${web.ambitionBoxRating.toFixed(1)} (${web.ambitionBoxReviewCount ?? items.filter((i) => i.platform === "AmbitionBox").length}건)`
      : null,
    web.glassdoorRating !== null
      ? `Glassdoor ${web.glassdoorRating.toFixed(1)}${web.glassdoorReviewCount !== null ? ` (${formatReviewCount(web.glassdoorReviewCount)})` : ""}`
      : null,
    web.googleMapsRating !== null ? `구글맵 ${web.googleMapsRating.toFixed(1)}` : null,
  ].filter(Boolean);

  return (
    <div className="border-t border-neutral-200 px-4 py-4">
      <div className="mb-3">
        <p className="text-[11px] font-semibold text-neutral-500">온라인 평가</p>
        <p className="mt-0.5 text-[11px] text-neutral-400">
          수집된 댓글·평가 {items.length}건
          {summaryParts.length > 0 ? ` · ${summaryParts.join(" · ")}` : ""}
        </p>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <OnlineEvalCard key={item.key} item={item} />
        ))}
      </div>
    </div>
  );
}

function OnlineEvalCard({ item }: { item: OnlineEvalItem }) {
  return (
    <article className="border border-neutral-200 bg-neutral-50 p-3">
      <div className="flex items-start gap-3">
        {item.rating !== null && Number.isFinite(item.rating) && (
          <div className="shrink-0 text-center">
            <p className="text-lg font-bold text-neutral-900">{item.rating.toFixed(1)}</p>
            <p className="text-[10px] text-neutral-500">/ 5</p>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">{item.platform}</p>
          {item.title && <p className="mt-0.5 text-xs font-semibold text-neutral-900">{item.title}</p>}
          {item.meta && <p className="mt-0.5 text-[11px] text-neutral-500">{item.meta}</p>}
        </div>
      </div>

      {item.subRatings.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.subRatings.map((sub) => (
            <span
              key={sub.name}
              className="rounded border border-neutral-200 bg-white px-2 py-1 text-[10px] text-neutral-600"
            >
              {sub.name}: {sub.rating}
            </span>
          ))}
        </div>
      )}

      {item.likes && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold text-neutral-700">장점</p>
          <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-neutral-800">{item.likes}</p>
        </div>
      )}

      {item.dislikes && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold text-neutral-700">단점</p>
          <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-neutral-800">{item.dislikes}</p>
        </div>
      )}

      {item.body && (
        <div className="mt-3">
          {!item.likes && !item.dislikes && (
            <p className="text-[11px] font-semibold text-neutral-700">평가 내용</p>
          )}
          {(item.likes || item.dislikes) && (
            <p className="text-[11px] font-semibold text-neutral-700">추가 정보</p>
          )}
          <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-neutral-800">{item.body}</p>
        </div>
      )}

      {item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-[11px] text-neutral-500 underline"
        >
          원문 보기
        </a>
      )}
    </article>
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
        <p className="text-[11px] font-semibold text-neutral-500">회사 상세 정보</p>
        {onClose && (
          <button onClick={onClose} className="text-[11px] text-neutral-500 hover:text-neutral-900">
            닫기
          </button>
        )}
      </div>

      <dl className="px-4 py-1">
        <ListRow label="회사명" value={profile.name || profile.cin} />
        <ListRow label="CIN" value={profile.cin} />
        <ListRow label="상태" value={profile.status && profile.status !== "Unknown" ? profile.status : EMPTY} />
        <ListRow label="회사 유형" value={profile.type || profile.listingStatus || EMPTY} />
        {profile.summary && <ListRow label="요약" value={formatMultilineText(profile.summary)} />}
        <ListRow
          label="사업 내용"
          value={formatMultilineText(web.businessDescription || profile.industry || EMPTY)}
        />
        <ListRow label="업종" value={profile.industry || profile.cinParsed.industryDescription || EMPTY} />
        <ListRow label="주소" value={formatMultilineText(address)} />
        <ListRow label="이메일" value={profile.email || web.email || EMPTY} />
        <ListRow label="전화" value={profile.phone || web.phone || EMPTY} />
        <ListRow label="대표" value={getRepresentative(profile.directors)} />
        <ListRow label="등기이사" value={formatDirectors(profile.directors)} />
        <ListRow
          label="관련 회사"
          value={
            profile.connectedCompanies.length > 0 ? (
              <ul className="space-y-1">
                {profile.connectedCompanies.map((company) => (
                  <li key={company.cin} className="text-xs leading-relaxed">
                    {company.url ? (
                      <a
                        href={company.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        {company.name}
                      </a>
                    ) : (
                      company.name
                    )}{" "}
                    <span className="text-neutral-500">({company.cin})</span>
                  </li>
                ))}
              </ul>
            ) : (
              EMPTY
            )
          }
        />
        <ListRow label="자본금" value={formatCapitalInr(profile.authorizedCapitalInr)} />
        <ListRow label="납입 자본금" value={formatCapitalInr(profile.paidUpCapitalInr)} />
        <ListRow label="최근 AGM" value={profile.lastAgmDate || EMPTY} />
        <ListRow label="담보(Charges)" value={profile.chargesSummary || EMPTY} />
        <ListRow label="매출" value={revenue} />
        <ListRow label="직원수" value={employees} />
        <ListRow label="웹사이트" value={formatWebsite(website)} />
        {web.googleMapsRating !== null && (
          <ListRow label="구글맵 평점" value={<GoogleMapsRatingRow profile={profile} />} />
        )}
        {web.glassdoorRating !== null && (
          <ListRow
            label="Glassdoor"
            value={
              <div className="flex flex-wrap items-center gap-2">
                <StarRating rating={web.glassdoorRating} />
                <span className="text-xs text-neutral-800">
                  {[
                    `${web.glassdoorRating.toFixed(1)} / 5`,
                    formatReviewCount(web.glassdoorReviewCount),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {web.glassdoorUrl && (
                  <a
                    href={web.glassdoorUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-neutral-500 underline"
                  >
                    Glassdoor 보기
                  </a>
                )}
              </div>
            }
          />
        )}
        <ListRow
          label="설립일"
          value={
            founded !== EMPTY && profile.ageYears > 0
              ? `${founded} (${profile.ageYears}년)`
              : founded || EMPTY
          }
        />
      </dl>

      <OnlineReviewsSection profile={profile} />
    </div>
  );
}