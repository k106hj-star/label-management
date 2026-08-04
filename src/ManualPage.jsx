import React from 'react';
import {
  BookOpen, Info, AlertTriangle, Lightbulb, AlertCircle, LogIn,
  LayoutDashboard, Package, Layers, Calculator, ClipboardList,
  FolderOpen, History, Trash2, Users, Building2,
} from 'lucide-react';

/* ── 재사용 컴포넌트 ─────────────────────────── */
const Callout = ({ tone = 'info', title, children }) => {
  const tones = {
    info:   { wrap: 'bg-blue-50 border-blue-200',     bar: 'border-l-blue-400',   title: 'text-blue-800',   Icon: Info },
    warn:   { wrap: 'bg-amber-50 border-amber-200',   bar: 'border-l-amber-400',  title: 'text-amber-800',  Icon: AlertTriangle },
    danger: { wrap: 'bg-red-50 border-red-200',       bar: 'border-l-red-400',    title: 'text-red-800',    Icon: AlertCircle },
    tip:    { wrap: 'bg-emerald-50 border-emerald-200',bar: 'border-l-emerald-400',title: 'text-emerald-800',Icon: Lightbulb },
  }[tone];
  const { Icon } = tones;
  return (
    <div className={`border ${tones.wrap} border-l-[3px] ${tones.bar} rounded-lg px-4 py-3 my-4`}>
      <div className={`flex items-center gap-2 font-semibold text-sm ${tones.title}`}>
        <Icon size={15} /> {title}
      </div>
      <div className="text-sm text-slate-700 leading-relaxed mt-1">{children}</div>
    </div>
  );
};

const Glance = ({ children }) => (
  <div className="bg-slate-50 border border-slate-200 border-l-[3px] border-l-slate-400 rounded-lg px-4 py-3 text-sm text-slate-600 my-3">
    {children}
  </div>
);

const Feat = ({ title, children }) => (
  <div className="border border-slate-200 rounded-lg px-4 py-3 bg-white">
    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-1">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-none" /> {title}
    </div>
    <p className="text-[13px] text-slate-500 leading-relaxed m-0">{children}</p>
  </div>
);
const FeatGrid = ({ children }) => (
  <div className="grid gap-3 my-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>{children}</div>
);

const Steps = ({ items }) => (
  <ol className="my-4 space-y-0">
    {items.map((it, i) => (
      <li key={i} className="relative pl-11 pb-4 last:pb-0">
        <span className="absolute left-0 top-0 w-7 h-7 rounded-full bg-slate-800 text-white text-[13px] font-semibold grid place-items-center tabular-nums">{i + 1}</span>
        {i !== items.length - 1 && <span className="absolute left-[13px] top-8 bottom-1 w-px bg-slate-200" />}
        <div className="text-sm text-slate-700">{it.t}</div>
        {it.d && <div className="text-[13px] text-slate-400 mt-0.5">{it.d}</div>}
      </li>
    ))}
  </ol>
);

const Pill = ({ tone = 'slate', children }) => {
  const tones = {
    slate:   'bg-slate-100 text-slate-600 border-slate-200',
    hq:      'bg-blue-50 text-blue-700 border-blue-100',
    factory: 'bg-amber-50 text-amber-700 border-amber-100',
    admin:   'bg-violet-50 text-violet-700 border-violet-100',
  }[tone];
  return <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border ${tones} whitespace-nowrap`}>{children}</span>;
};

const Section = ({ id, idx, icon: Icon, title, sub, children }) => (
  <section id={id} className="scroll-mt-4 pt-2">
    <div className="flex items-center gap-2.5 mb-1">
      {idx && <span className="text-[12px] font-bold text-slate-500 bg-slate-100 rounded px-2 py-1 tabular-nums flex-none">{idx}</span>}
      {Icon && <Icon size={20} className="text-slate-700" />}
      <h2 className="text-xl font-bold text-slate-800 tracking-tight">{title}</h2>
    </div>
    {sub && <p className="text-sm text-slate-500 mb-3 ml-0.5">{sub}</p>}
    {children}
  </section>
);
const H3 = ({ children }) => <h3 className="text-[15px] font-semibold text-slate-800 mt-6 mb-2">{children}</h3>;
const UL = ({ children }) => <ul className="my-3 pl-5 space-y-1.5 text-sm text-slate-700 list-disc marker:text-slate-400">{children}</ul>;
const Divider = () => <hr className="my-10 border-slate-100" />;

const Table = ({ head, rows }) => (
  <div className="overflow-x-auto my-4 border border-slate-200 rounded-lg">
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="bg-slate-50">
          {head.map((h, i) => <th key={i} className="text-left font-semibold text-[12.5px] text-slate-600 px-3.5 py-2.5 whitespace-nowrap border-b border-slate-200">{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri} className="hover:bg-slate-50/60">
            {r.map((c, ci) => <td key={ci} className="px-3.5 py-2.5 align-top border-b border-slate-100 last:border-b text-slate-700">{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/* ── 목차 ─────────────────────────────────────── */
const NAV = [
  { g: '시작', items: [
    { id: 'concepts', n: '·', label: '꼭 알아둘 개념' },
    { id: 'login', n: '·', label: '로그인' },
  ]},
  { g: '화면별 사용법', items: [
    { id: 'dashboard', n: '1', label: '현황' },
    { id: 'inventory', n: '2', label: '재고리스트' },
    { id: 'bom', n: '3', label: '상품 세팅' },
    { id: 'calc', n: '4', label: '발주 계산기' },
    { id: 'orders', n: '5', label: '저장리스트' },
    { id: 'docs', n: '6', label: '자료실' },
    { id: 'logs', n: '7', label: '재고로그' },
    { id: 'trash', n: '8', label: '휴지통' },
    { id: 'admin', n: '9', label: '계정 관리' },
  ]},
  { g: '참고', items: [
    { id: 'workflow', n: '·', label: '신제품 발주 흐름' },
    { id: 'faq', n: '·', label: '자주 묻는 질문' },
  ]},
];

export default function ManualPage() {
  const jump = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100">
      {/* 헤더 */}
      <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-slate-800 text-white grid place-items-center flex-none">
          <BookOpen size={18} />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-800 leading-tight">사용설명서</h1>
          <p className="text-xs text-slate-400 mt-0.5">라벨 재고 및 발주 시스템 · 화면별 사용법</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[200px_1fr] gap-0">
        {/* 목차 */}
        <aside className="hidden lg:block border-r border-slate-100 py-5 px-3 sticky top-4 self-start">
          {NAV.map((grp) => (
            <div key={grp.g} className="mb-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 mb-1.5">{grp.g}</div>
              {grp.items.map((it) => (
                <button key={it.id} onClick={() => jump(it.id)}
                  className="w-full flex items-center gap-2 text-left text-[13px] text-slate-600 hover:bg-slate-100 hover:text-slate-900 rounded-md px-2 py-1.5 transition-colors">
                  <span className="w-3.5 text-right text-[11px] text-slate-400 tabular-nums flex-none">{it.n}</span>
                  {it.label}
                </button>
              ))}
            </div>
          ))}
        </aside>

        {/* 본문 */}
        <div className="px-6 py-6 min-w-0 max-w-3xl">
          {/* 인트로 */}
          <div className="pb-6 border-b border-slate-100 mb-2">
            <p className="text-[15px] text-slate-600 leading-relaxed">
              라벨 재고 현황 파악부터 상품별 소요 라벨(BOM) 세팅, 생산량 기반 발주 계산, 발주 확정에 따른 재고 차감까지 —
              현장에서 반복하는 발주 업무의 전 과정을 담은 시스템입니다. 아래 목차에서 원하는 화면으로 바로 이동할 수 있습니다.
            </p>
            <div className="flex flex-wrap gap-2 mt-4 lg:hidden">
              {NAV.flatMap(g => g.items).map(it => (
                <button key={it.id} onClick={() => jump(it.id)} className="text-[12px] px-2.5 py-1 rounded-full border border-slate-200 text-slate-600 hover:border-slate-400">
                  {it.n !== '·' ? `${it.n}. ` : ''}{it.label}
                </button>
              ))}
            </div>
          </div>

          {/* 개념 */}
          <Section id="concepts" icon={Info} title="먼저 알아둘 5가지 개념" sub="화면을 다루기 전에 이 개념들을 잡아두면 이후가 훨씬 수월합니다.">
            <FeatGrid>
              <Feat title="실시간 동기화">모든 데이터는 서버에 저장되어 여러 사용자가 동시에 작업할 수 있습니다. 누군가 수정·삭제하면 다른 사람 화면에도 즉시 반영됩니다.</Feat>
              <Feat title="입고처: 본사 vs 공장">라벨마다 <Pill tone="hq">본사납품</Pill> 또는 <Pill tone="factory">공장납품</Pill>을 지정합니다. 발주 확정 시 <b>본사납품 라벨만 본사재고에서 차감</b>됩니다.</Feat>
              <Feat title="안전재고 ≠ 발주수량"><b>안전재고</b>는 미달 경고 기준입니다. <b>발주수량</b>은 참고용 표시값으로, 발주 계산에는 반영되지 않습니다.</Feat>
              <Feat title="특수 라벨: 대봉 · 케어라벨"><b>대봉</b>은 종류별 비율로 필요 장수를 계산하고, <b>케어라벨</b>은 품번·소재·제조년월·RN넘버를 따로 입력합니다.</Feat>
              <Feat title="권한: 일반 vs 관리자">대부분 기능은 모두 사용할 수 있고, <b>관리자</b>만 계정 관리와 휴지통 완전 삭제를 사용할 수 있습니다.</Feat>
              <Feat title="삭제하면 휴지통으로">라벨·상품·발주를 삭제하면 바로 사라지지 않고 휴지통에 보관됩니다. 언제든 복구할 수 있습니다.</Feat>
            </FeatGrid>
            <Callout tone="warn" title="가장 헷갈리는 부분">
              <b>발주내용 저장</b>과 <b>발주 확정</b>은 다릅니다. 저장은 발주서를 목록에 담아둘 뿐 재고를 건드리지 않습니다.
              <b> 재고 차감은 저장리스트에서 [발주 확정]을 눌러야</b> 일어납니다.
            </Callout>
          </Section>

          <Divider />

          {/* 로그인 */}
          <Section id="login" icon={LogIn} title="로그인" sub="계정은 관리자가 발급합니다. 별도 회원가입은 없습니다.">
            <Steps items={[
              { t: <><b>아이디</b>를 입력합니다.</>, d: <>뒤의 @fairplay142.com은 자동으로 붙으므로 아이디만 입력하면 됩니다.</> },
              { t: <><b>비밀번호</b>를 입력하고 <b>[로그인]</b>을 누릅니다.</> },
              { t: <>처음 로그인이라면 관리자가 계정을 활성화해 두었는지 확인합니다.</> },
            ]} />
            <Callout tone="info" title="로그인이 안 될 때">
              <b>"등록되지 않은 계정입니다"</b> → 아직 계정이 없습니다. 관리자에게 발급을 요청하세요.<br />
              <b>"비활성화된 계정입니다"</b> → 계정이 잠긴 상태입니다. 관리자에게 활성화를 요청하세요.<br />
              <b>"로그인 시도가 너무 많습니다"</b> → 잠시 후 다시 시도하세요.
            </Callout>
          </Section>

          <Divider />

          {/* 1 현황 */}
          <Section id="dashboard" idx="화면 1" icon={LayoutDashboard} title="현황" sub="재고와 발주 상태를 한눈에 보는 대시보드입니다.">
            <Glance><b>여기서 하는 일:</b> 전체 현황 파악 · 미달/미확정 건수 확인 · 입력 누락 라벨 점검. 각 카드를 클릭하면 관련 화면으로 이동합니다.</Glance>
            <H3>상단 요약 카드</H3>
            <Table head={['카드', '보여주는 값', '클릭하면']} rows={[
              [<b>전체 라벨</b>, '등록된 총 라벨 종수, 본사·공장 입고 수', '재고리스트로 이동'],
              [<b>본사재고 평가액</b>, <>본사납품 라벨의 재고×단가 합계 <Pill>공장 입고 제외</Pill></>, '—'],
              [<b>미확정 발주</b>, '아직 확정하지 않은 발주 건수', '저장리스트로 이동'],
              [<b>안전재고 미달</b>, '안전재고보다 적은 라벨 수, 재고 0 건수', '재고리스트로 이동'],
            ]} />
            <H3>그 아래에서 볼 수 있는 것</H3>
            <UL>
              <li><b>브랜드별 라벨 분포</b> — 브랜드마다 종수·재고수량·평가액을 막대로 표시</li>
              <li><b>생산 상품 / 발주 처리</b> — 등록 상품 수와 BOM 설정 현황, 확정·미확정 발주 건수</li>
              <li><b>발주수량 Top 10</b> — 기간(1주 / 1개월 / 3개월)별로 발주가 많았던 라벨 순위</li>
              <li><b>최근 확정 발주</b> — 최근 확정된 발주 5건</li>
              <li><b>입력 누락 라벨 점검</b> — 단가·공급처·종류·사이즈·이미지·안전재고가 비어 있는 라벨을 집계</li>
            </UL>
          </Section>

          <Divider />

          {/* 2 재고리스트 */}
          <Section id="inventory" idx="화면 2" icon={Package} title="재고리스트" sub="모든 라벨을 등록·수정·검색하고 재고를 관리하는 핵심 화면입니다.">
            <Glance><b>여기서 하는 일:</b> 라벨 추가·수정·삭제 · 재고/안전재고/발주수량 관리 · CSV 대량 등록 · 라벨 이미지 등록 · 검색과 필터.</Glance>
            <H3>라벨 한 개 추가하기</H3>
            <Steps items={[
              { t: <><b>[신규 라벨 추가]</b>를 누릅니다.</> },
              { t: <>브랜드·종류·라벨명·품번·사이즈·현재 재고·발주수량·단가·공급처를 입력합니다.</>, d: '라벨명과 품번은 필수입니다. 품번은 라벨을 구분하는 고유 코드입니다.' },
              { t: <><b>입고처</b>를 <Pill tone="hq">본사납품</Pill> / <Pill tone="factory">공장납품</Pill> 중에서 고릅니다.</>, d: '본사납품만 발주 확정 시 재고가 차감됩니다.' },
              { t: <>필요하면 이미지를 올리고 저장합니다.</> },
            ]} />
            <H3>표에서 바로 할 수 있는 것</H3>
            <FeatGrid>
              <Feat title="재고 색상 확인">본사재고 칸은 읽기 전용이며, 안전재고 미달이면 색으로 경고합니다.</Feat>
              <Feat title="안전재고·발주수량 즉시 수정">표의 숫자 칸을 바로 고칠 수 있습니다. 안전재고 변경은 자동으로 로그에 남습니다.</Feat>
              <Feat title="이미지 등록">이미지 칸을 클릭해 파일을 올리면 즉시 교체되고 자료실 라벨이미지 폴더에도 자동 보관됩니다.</Feat>
              <Feat title="발주 로그 보기">관리 메뉴에서 해당 라벨의 차감·복원 이력을 확인할 수 있습니다.</Feat>
            </FeatGrid>
            <H3>검색 · 필터 · 일괄 작업</H3>
            <UL>
              <li><b>검색</b> — 라벨명·품번으로 찾고, [초기화]로 조건을 지웁니다.</li>
              <li><b>필터</b> — 브랜드 · 종류 · 공급처로 좁혀 봅니다.</li>
              <li><b>일괄 수정</b> — 체크박스로 여러 라벨을 골라 브랜드·종류·공급처·입고처를 한 번에 변경 (비운 항목은 유지).</li>
              <li><b>일괄 삭제</b> — 선택한 라벨을 모두 휴지통으로 이동.</li>
              <li><b>삭제</b> — 라벨을 지우면 그 라벨을 쓰던 상품 BOM과 저장 발주에서도 함께 빠집니다.</li>
            </UL>
            <H3>CSV로 한꺼번에 등록·갱신</H3>
            <Steps items={[
              { t: <><b>[양식 다운로드]</b>로 현재 목록을 CSV로 내려받아 서식을 확인합니다.</> },
              { t: <>엑셀에서 값을 채운 뒤 <b>[CSV 대량 등록]</b>으로 파일을 올립니다.</> },
              { t: <>확인 화면에서 <b>신규 / 빈 항목 채우기 / 변경 없음</b> 건수를 확인하고 적용합니다.</> },
            ]} />
            <Callout tone="warn" title="CSV 적용 규칙">
              <b>현재고(재고수량)는 파일 값으로 항상 덮어씁니다.</b> 반면 브랜드·종류·사이즈·단가·공급처·입고처는 <b>기존 값이 비어 있을 때만</b> 채워집니다. 라벨명과 품번이 같으면 기존 라벨로 인식해 갱신합니다.
            </Callout>
          </Section>

          <Divider />

          {/* 3 상품 세팅 */}
          <Section id="bom" idx="화면 3" icon={Layers} title="상품 세팅 (BOM)" sub={'"이 옷 한 벌을 만들 때 어떤 라벨이 몇 장 들어가는지"를 정의합니다. 발주 계산의 기준이 됩니다.'}>
            <Glance><b>여기서 하는 일:</b> 상품 등록 · 상품마다 들어가는 라벨(BOM) 연결 · 1벌당 소요량 지정 · 케어라벨 정보 입력.</Glance>
            <H3>순서</H3>
            <Steps items={[
              { t: <><b>새 상품 등록</b> — 브랜드를 고르고 상품명을 입력한 뒤 <b>[+]</b>를 누릅니다.</> },
              { t: <><b>상품 선택</b> — 목록(브랜드 폴더)에서 세팅할 상품을 클릭합니다.</> },
              { t: <><b>라벨 연결</b> — 오른쪽에서 라벨을 검색·선택하고 <b>1벌당 수량</b>을 정한 뒤 <b>[추가]</b>. 여러 개 동시 선택 가능.</> },
              { t: <><b>순서 정리</b> — BOM 표에서 손잡이를 드래그해 라벨 순서를 바꿉니다.</> },
              { t: <><b>케어라벨</b>이 있으면 품번·소재를 입력합니다.</>, d: '제조년월·RN넘버는 발주할 때(발주 계산기) 매번 입력합니다.' },
            ]} />
            <Callout tone="info" title="저장은 자동입니다">
              BOM은 바꾸는 즉시 저장됩니다. <b>[라벨 세팅 완료]</b> 버튼은 "저장했다"는 시각적 확인일 뿐 별도 저장 동작이 아닙니다.
            </Callout>
            <Callout tone="tip" title="대봉은 여기서 수량을 넣지 않습니다">
              대봉 라벨의 필요 수량은 BOM의 1벌당 수량이 아니라, <b>발주 계산기</b>에서 종류(반팔/후드/아우터/바지)를 고르면 자동 계산됩니다.
            </Callout>
          </Section>

          <Divider />

          {/* 4 발주 계산기 */}
          <Section id="calc" idx="화면 4" icon={Calculator} title="발주 계산기" sub="생산 수량을 넣으면 라벨별 필요수량·부족분·예상 비용을 자동으로 계산합니다.">
            <Glance><b>여기서 하는 일:</b> 상품·공장·발주자 선택 → 색상/사이즈별 생산량 입력 → 재고 대비 부족분 계산 → 발주서 저장 / PDF.</Glance>
            <H3>순서</H3>
            <Steps items={[
              { t: <><b>상품 선택</b> — <b>BOM이 등록된 상품만</b> 목록에 나옵니다.</> },
              { t: <><b>공장명 · 발주자 · 특이사항</b>을 입력합니다.</>, d: '발주자는 목록에서 선택하거나 직접 입력할 수 있습니다.' },
              { t: <>케어라벨이 있는 상품이면 <b>제조년월·RN넘버</b>를 입력합니다.</> },
              { t: <><b>색상과 사이즈</b>를 쉼표로 구분해 입력하면 수량 입력 그리드가 생깁니다. 칸마다 생산 수량을 넣습니다.</> },
              { t: <>대봉이 있으면 <b>종류</b>를 고릅니다.</>, d: '필요 장수가 "= n장"으로 즉시 표시됩니다.' },
              { t: <><b>[재고 확인 및 발주량 계산]</b>을 누릅니다.</> },
            ]} />
            <H3>결과 용어</H3>
            <Table head={['용어', '뜻']} rows={[
              [<b>필요수량</b>, '생산에 필요한 총 라벨 수 (사이즈 전용 라벨은 해당 사이즈 합계, 그 외는 총생산량 × 1벌당 수량)'],
              [<b>가용재고</b>, '현재 쓸 수 있는 본사재고 (발주수량 필드는 제외)'],
              [<b>부족분</b>, '필요수량 − 가용재고 (실제 발주가 필요한 양)'],
              [<b>예상 비용</b>, '부족분 × 단가'],
            ]} />
            <H3>대봉 계산 비율</H3>
            <Table head={['종류', '1장당 생산량', '계산 방식']} rows={[
              ['반팔', '50', '필요 장수 = 총생산량 ÷ 비율 (올림)'],
              ['후드', '20', '동일'],
              ['아우터', '15', '동일'],
              ['바지', '50', '동일'],
            ]} />
            <H3>계산 후 할 수 있는 것</H3>
            <UL>
              <li><b>발주내용 저장</b> — 발주서를 저장리스트에 담습니다. <b>이 단계에서는 재고가 차감되지 않습니다.</b></li>
              <li><b>스마트 발주서 PDF</b> — 공급처가 "스마트"인 라벨을 A4 발주서 PDF로 만들어 미리보기·다운로드합니다.</li>
              <li><b>취소</b> — 입력한 내용을 모두 지웁니다.</li>
            </UL>
          </Section>

          <Divider />

          {/* 5 저장리스트 */}
          <Section id="orders" idx="화면 5" icon={ClipboardList} title="저장리스트" sub="저장한 발주서를 관리하고, 발주 확정으로 실제 재고를 차감하는 화면입니다.">
            <Glance><b>여기서 하는 일:</b> 저장된 발주 확인·수정 · <b>발주 확정(재고 차감)</b> · 확정 취소(재고 원복) · 삭제.</Glance>
            <Callout tone="danger" title="발주 확정 = 재고 차감">
              <b>[발주 확정]</b>을 누르면 <b>필요수량 전량</b>이 본사재고에서 차감됩니다(부족분이 아니라 필요수량 기준). <Pill tone="factory">공장납품</Pill> 라벨은 차감되지 않습니다. 확정 전 확인창에서 차감 목록을 볼 수 있습니다.
            </Callout>
            <H3>발주 열의 상태</H3>
            <UL>
              <li><b>[발주 확정]</b> — 아직 확정 전. 누르면 재고가 차감됩니다.</li>
              <li><b>✓ 완료 / [↩ 취소]</b> — 이미 확정됨. 취소하면 차감했던 재고가 원래대로 복구됩니다.</li>
            </UL>
            <H3>그 밖의 기능</H3>
            <UL>
              <li><b>상세 보기</b> — 공급처별 라벨 목록과 총 비용을 펼쳐 봅니다.</li>
              <li><b>수정</b> — 발주자·공장·특이사항, 케어라벨 정보, 각 라벨의 발주필요 수량을 고치면 총비용이 다시 계산됩니다.</li>
              <li><b>삭제</b> — 발주를 휴지통으로 보냅니다. (확정된 발주라면 먼저 <b>취소</b>해야 재고가 원복됩니다.)</li>
              <li><b>전체 삭제</b> — 저장리스트를 비웁니다. 재고 원복은 되지 않습니다.</li>
            </UL>
            <Callout tone="tip" title="동시 작업 안전장치">
              여러 사람이 같은 발주를 동시에 확정하거나 확정과 삭제가 겹치면 시스템이 충돌을 감지해 한 번만 처리되도록 막습니다. "이미 다른 사용자가 처리했습니다" 안내가 나오면 새로고침해 최신 상태를 확인하세요.
            </Callout>
          </Section>

          <Divider />

          {/* 6 자료실 */}
          <Section id="docs" idx="화면 6" icon={FolderOpen} title="자료실" sub="라벨 이미지와 재고리스트 파일을 폴더로 보관합니다.">
            <Glance><b>여기서 하는 일:</b> 파일 업로드·다운로드·삭제 · 라벨 이미지 자동 매핑.</Glance>
            <H3>폴더 구성</H3>
            <UL>
              <li><b>전체 자료</b> — 모든 파일을 한 목록에서 검색·다운로드</li>
              <li><b>라벨이미지</b> — 라벨 사진 보관. 재고리스트에서 이미지를 올리면 여기에 자동 보관됩니다.</li>
              <li><b>재고리스트</b> — CSV로 가져온 재고 파일이 자동 기록됩니다.</li>
              <li><b>재고로그</b> — 재고 변동 이력을 카테고리별로 볼 수 있습니다.</li>
            </UL>
            <H3>라벨 이미지 자동 매핑</H3>
            <p className="text-sm text-slate-700 my-3">
              <b>라벨이미지</b> 폴더의 <b>[재고리스트에 이미지 매핑]</b>을 누르면, 파일명(라벨명·품번)을 기준으로 여러 이미지를 한꺼번에 해당 라벨에 연결합니다. 이미지를 대량으로 올릴 때 유용합니다.
            </p>
            <Callout tone="info" title="파일명 팁">파일 이름을 "라벨명 품번" 형태로 맞춰 두면 매핑 정확도가 높아집니다.</Callout>
          </Section>

          <Divider />

          {/* 7 재고로그 */}
          <Section id="logs" idx="화면 7" icon={History} title="재고로그" sub="누가·언제·무엇을 바꿨는지 모든 변경 이력을 남깁니다.">
            <Glance><b>여기서 하는 일:</b> 재고·라벨·상품·발주·이미지 변경 이력 확인 · 검색 · (필요 시) 전체 삭제.</Glance>
            <Table head={['카테고리', '포함되는 기록']} rows={[
              [<b>재고 변동</b>, '발주 확정(차감) · 확정 취소(원복) · 안전재고 변경'],
              [<b>라벨 관리</b>, '라벨 등록·수정·삭제 · 일괄 수정·삭제 · CSV 가져오기'],
              [<b>상품 관리</b>, '상품 등록·수정·삭제 · BOM 라벨 추가·제거'],
              [<b>발주 관리</b>, '발주 저장·수정·삭제·전체 삭제'],
              [<b>이미지 관리</b>, '이미지 업데이트 · 이미지 자동 매핑'],
            ]} />
            <p className="text-sm text-slate-700 my-3">
              각 기록에는 <b>일시와 사용자</b>가 자동으로 남습니다. 발주 차감/원복 기록에는 라벨별 변동 전·후 수량과 공장·상품명까지 포함됩니다.
            </p>
            <Callout tone="warn" title="전체 삭제는 신중히">
              <b>[전체 삭제]</b>는 모든 로그를 지웁니다. 감사·추적 자료이므로 꼭 필요할 때만 사용하세요.
            </Callout>
          </Section>

          <Divider />

          {/* 8 휴지통 */}
          <Section id="trash" idx="화면 8" icon={Trash2} title="휴지통" sub="삭제한 라벨·상품·발주가 보관되는 곳입니다. 실수로 지워도 되돌릴 수 있습니다.">
            <Glance><b>여기서 하는 일:</b> 삭제 항목 복구 · 검색 · (관리자) 완전 삭제.</Glance>
            <UL>
              <li><b>복구</b> — 항목을 원래 위치로 되돌립니다. <b>누구나</b> 할 수 있습니다.</li>
              <li><b>완전 삭제</b> — 되돌릴 수 없이 영구 삭제합니다. <Pill tone="admin">관리자 전용</Pill></li>
              <li><b>검색</b> — 품명·브랜드·삭제자로 찾습니다.</li>
              <li>삭제 후 <b>30일이 지난 항목</b>에는 "n일 경과" 배지가 표시됩니다.</li>
            </UL>
          </Section>

          <Divider />

          {/* 9 계정 관리 */}
          <Section id="admin" idx="화면 9" icon={Users} title="계정 관리" sub="사용자 계정을 만들고 권한·상태를 관리합니다. 관리자에게만 보입니다.">
            <div className="mb-3"><Pill tone="admin">관리자 전용</Pill></div>
            <Glance><b>여기서 하는 일:</b> 신규 계정 발급 · 활성/비활성 전환 · 관리자 권한 부여 · 비밀번호 초기화 요청.</Glance>
            <H3>새 계정 만들기</H3>
            <Steps items={[
              { t: <><b>[신규 등록]</b>을 누릅니다.</> },
              { t: <><b>이름 · 아이디 · 초기 비밀번호</b>를 입력합니다.</>, d: '아이디는 자동으로 소문자·공백 제거되며 @fairplay142.com이 붙습니다. 초기 비밀번호 기본값은 123456(6자 이상)입니다.' },
              { t: <>필요하면 <b>관리자 권한 부여</b>를 체크하고 등록합니다.</> },
            ]} />
            <H3>계정 관리</H3>
            <UL>
              <li><b>활성 / 비활성</b> — 비활성 계정은 로그인할 수 없습니다. (본인 계정은 변경 불가)</li>
              <li><b>관리자 / 일반</b> — 권한을 토글합니다. (본인 계정은 변경 불가)</li>
              <li><b>PW 초기화</b> — 초기화 요청 플래그를 남깁니다.</li>
            </UL>
            <Callout tone="info" title="비밀번호 초기화 참고">
              PW 초기화 버튼은 "초기화가 필요하다"는 표시만 저장합니다. 실제 비밀번호 변경은 Firebase 콘솔에서 별도로 진행해야 합니다.
            </Callout>
          </Section>

          <Divider />

          {/* 워크플로 */}
          <Section id="workflow" icon={Building2} title="신제품 발주, 처음부터 끝까지" sub="새 상품 하나를 발주하는 전체 흐름을 순서대로 정리했습니다.">
            <Steps items={[
              { t: <><b>라벨 준비</b></>, d: '재고리스트에서 필요한 라벨이 모두 등록돼 있는지 확인하고, 입고처(본사/공장)를 정확히 지정합니다.' },
              { t: <><b>상품 세팅</b></>, d: '상품을 만들고 한 벌에 들어가는 라벨을 연결하며 1벌당 수량을 정합니다. 케어라벨 품번·소재도 입력합니다.' },
              { t: <><b>발주 계산</b></>, d: '상품·공장·발주자를 고르고 색상/사이즈별 생산량을 입력한 뒤 계산합니다. 대봉·케어라벨 정보도 채웁니다.' },
              { t: <><b>발주서 저장</b></>, d: '결과를 확인하고 [발주내용 저장]으로 저장리스트에 담습니다. 필요하면 PDF를 만듭니다.' },
              { t: <><b>발주 확정</b></>, d: '실제 발주가 확정되면 저장리스트에서 [발주 확정]을 눌러 본사재고를 차감합니다.' },
              { t: <><b>추적</b></>, d: '재고로그와 현황에서 차감 내역을 확인합니다. 잘못됐다면 [↩ 취소]로 되돌립니다.' },
            ]} />
          </Section>

          <Divider />

          {/* FAQ */}
          <Section id="faq" icon={Lightbulb} title="자주 묻는 질문" sub="헷갈리기 쉬운 지점만 모았습니다.">
            <FeatGrid>
              <Feat title="발주서를 저장했는데 재고가 그대로예요">정상입니다. 저장은 재고를 바꾸지 않습니다. 저장리스트에서 [발주 확정]을 눌러야 차감됩니다.</Feat>
              <Feat title="발주수량을 넣었는데 계산에 안 잡혀요">발주수량은 참고용 표시값이라 계산에서 제외됩니다. 계산 기준은 재고와 안전재고입니다.</Feat>
              <Feat title="공장납품 라벨은 왜 차감이 안 되나요">공장에서 직접 사용하는 라벨이라 본사재고 차감 대상이 아닙니다.</Feat>
              <Feat title="계산기에 상품이 안 보여요">발주 계산기에는 BOM이 등록된 상품만 나옵니다. 먼저 상품 세팅에서 라벨을 연결하세요.</Feat>
              <Feat title="실수로 라벨을 지웠어요">휴지통에서 [복구]하면 됩니다. 복구는 누구나 할 수 있습니다.</Feat>
              <Feat title="다른 사람이 올린 파일이 안 보여요">대부분 실시간 반영되지만 드물게 지연될 수 있습니다. 화면을 새로고침하세요.</Feat>
            </FeatGrid>
            <Callout tone="tip" title="막히면">
              계정·권한 문제(로그인 불가, 완전 삭제 필요 등)는 <b>관리자</b>에게 문의하세요. 데이터가 이상해 보이면 먼저 <b>재고로그</b>에서 최근 변경 이력을 확인하는 것이 빠릅니다.
            </Callout>
          </Section>
        </div>
      </div>
    </div>
  );
}
