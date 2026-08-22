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

function EmployeeReviewsSection({ profile }: { profile: CompanyProfile }) {
  const web = profile.webEnrichment;
  const reviews = web.employeeReviews;

  if (reviews.length === 0) return null;

  const metaParts = [
    web.ambitionBoxRating !== null ? `평균 ${web.ambitionBoxRating.toFixed(1)}점` : null,
    web.ambitionBoxReviewCount !== null ? `${web.ambitionBoxReviewCount}건` : null,
  ].filter(Boolean);

  return (
    <div className="border-t border-neutral-200 px-4 py-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold text-neutral-500">직원 리뷰</p>
          {metaParts.length > 0 && (
            <p className="mt-0.5 text-[11px] text-neutral-400">{metaParts.join(" · ")} · AmbitionBox</p>
          )}
        </div>
        {web.ambitionBoxUrl && (
          <a
            href={web.ambitionBoxUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-neutral-500 underline"
          >
            원문 보기
          </a>
        )}
      </div>

      <div className="space-y-4">
        {reviews.map((review, index) => (
          <EmployeeReviewCard key={`${review.url}-${index}`} review={review} />
        ))}
      </div>
    </div>
  );
}

function EmployeeReviewCard({ review }: { review: EmployeeReview }) {
  const meta = [
    review.jobProfile,
    review.location,
    review.department,
    review.date,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="border border-neutral-200 bg-neutral-50 p-3">
      <div className="flex items-start gap-3">
        {review.rating !== null && (
          <div className="shrink-0 text-center">
            <p className="text-lg font-bold text-neutral-900">{review.rating.toFixed(1)}</p>
            <p className="text-[10px] text-neutral-500">/ 5</p>
          </div>
        )}
        <div className="min-w-0 flex-1">
          {review.title && <p className="text-xs font-semibold text-neutral-900">{review.title}</p>}
          {meta && <p className="mt-0.5 text-[11px] text-neutral-500">{meta}</p>}
        </div>
      </div>

      {review.subRatings.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {review.subRatings.map((item) => (
            <span
              key={item.name}
              className="rounded border border-neutral-200 bg-white px-2 py-1 text-[10px] text-neutral-600"
            >
              {item.name}: {item.rating}
            </span>
          ))}
        </div>
      )}

      {review.likes && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold text-neutral-700">장점</p>
          <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-neutral-800">{review.likes}</p>
        </div>
      )}

      {review.dislikes && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold text-neutral-700">단점</p>
          <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-neutral-800">{review.dislikes}</p>
        </div>
      )}

      {review.workDetails && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold text-neutral-700">근무 정보</p>
          <p className="mt-1 text-xs leading-relaxed text-neutral-800">{review.workDetails}</p>
        </div>
      )}

      {review.url && (
        <a
          href={review.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-[11px] text-neutral-500 underline"
        >
          AmbitionBox에서 보기
        </a>
      )}
    </article>
  );
}

function formatWebsiteComments(profile: CompanyProfile): React.ReactNode {  const comments = profile.webEnrichment.websiteReviews
    .map((r) => {
      const parts = [r.rating ? `★ ${r.rating}` : null, r.author, r.text].filter(Boolean);
      return parts.join(" · ");
    })
    .filter((text) => text.length > 0);

  if (comments.length === 0) return EMPTY;

  return (
    <ul className="space-y-2">
      {comments.map((text, i) => (
        <li key={i} className="text-xs leading-relaxed text-neutral-800">
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
        {profile.summary && <ListRow label="요약" value={formatMultilineText(profile.summary)} />}
        <ListRow
          label="사업 내용"
          value={formatMultilineText(web.businessDescription || profile.industry || EMPTY)}
        />
        <ListRow label="주소" value={formatMultilineText(address)} />
        <ListRow label="대표" value={getRepresentative(profile.directors)} />
        <ListRow label="등기이사" value={formatDirectors(profile.directors)} />
        <ListRow label="자본금" value={formatCapitalInr(profile.authorizedCapitalInr)} />
        <ListRow label="납입 자본금" value={formatCapitalInr(profile.paidUpCapitalInr)} />
        <ListRow label="매출" value={revenue} />
        <ListRow label="직원수" value={employees} />
        <ListRow label="웹사이트" value={formatWebsite(website)} />
        {web.googleMapsRating !== null && (
          <ListRow label="구글맵 평점" value={<GoogleMapsRatingRow profile={profile} />} />
        )}
        <ListRow label="설립일" value={founded || EMPTY} />
        <ListRow label="웹사이트 댓글" value={formatWebsiteComments(profile)} />
      </dl>

      <EmployeeReviewsSection profile={profile} />
    </div>
  );
}