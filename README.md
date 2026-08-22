# India Company Search

인도 MCA 등록 기업 정보를 검색하고 2~4개 기업을 비교 분석하는 웹 애플리케이션입니다.

## 기능

- **인도 기업 검색**: 회사명 또는 CIN(21자리)으로 검색
- **상세 정보**: 매출, 웹사이트, 주주, 등기이사, 업종, 사무실 위치 등
- **비교 분석**: 2~4개 기업 동시 비교
- **정보 통합**: MCA 공식 데이터 + 공개 웹 정보 자동 수집 및 요약
- **저장 없음**: 세션 기반, 데이터 저장 기능 없음

## 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. API 키 설정

[data.gov.in](https://data.gov.in/user/register)에서 무료 API 키를 발급받으세요.

```bash
cp .env.example .env.local
```

`.env.local` 파일에 API 키를 입력:

```
DATA_GOV_API_KEY=your_api_key_here
```

### 3. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 [http://localhost:3500](http://localhost:3500) 접속

## 데이터 출처

| 출처 | 정보 |
|------|------|
| data.gov.in (MCA) | CIN, 회사명, 상태, 자본금, 주소, ROC, 업종 |
| CIN Parser | 주(State), 설립연도, 업종코드, 상장여부 |
| 웹 검색 | 매출, 웹사이트, 주주, 기업 설명 |

## 검색 예시

- `RELIANCE` - 릴라이언스 관련 기업
- `TATA CONSULTANCY` - TCS
- `L17110MH1973PLC019786` - Reliance Industries CIN

## 기술 스택

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
