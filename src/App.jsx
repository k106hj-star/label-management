import React, { useState, useEffect } from 'react';
import { Package, Calculator, Layers, Plus, Trash2, Image as ImageIcon, AlertCircle } from 'lucide-react';

// 초기 샘플 데이터 (실장님 CSV 파일 기반)
const initialLabels = [
  { id: 1, brand: 'WV', type: '행택', name: 'WV 메인택', size: 'one size', code: 'WVHT001', stock: 150, price: 125, vendor: '스마트', img: '' },
  { id: 2, brand: 'WV', type: '포인트라벨', name: 'WV 메인라벨', size: 'one size', code: 'WVPL001', stock: 1705, price: 35, vendor: 'SB라벨', img: '' },
  { id: 3, brand: 'WV', type: '폴리백', name: 'WV 폴리백(대)', size: '대', code: 'WVPB002', stock: 300, price: 61, vendor: '스마트', img: '' },
  { id: 4, brand: 'FP', type: '사이즈라벨', name: 'FP 뉴웨이브 라벨', size: 'M', code: 'FPSL008', stock: 518, price: 90, vendor: 'SB라벨', img: '' },
];

const initialProducts = [
  {
    id: 1,
    name: 'WV 24SS 오버핏 후드티',
    bom: [
      { labelId: 1, qtyPerUnit: 1 },
      { labelId: 2, qtyPerUnit: 1 },
      { labelId: 3, qtyPerUnit: 1 }
    ]
  }
];

export default function App() {
  const [activeTab, setActiveTab] = useState('inventory');

  const [labels, setLabels] = useState(() => {
    const saved = localStorage.getItem('label_inventory');
    return saved ? JSON.parse(saved) : initialLabels;
  });

  const [products, setProducts] = useState(() => {
    const saved = localStorage.getItem('label_products');
    return saved ? JSON.parse(saved) : initialProducts;
  });

  useEffect(() => {
    localStorage.setItem('label_inventory', JSON.stringify(labels));
  }, [labels]);

  useEffect(() => {
    localStorage.setItem('label_products', JSON.stringify(products));
  }, [products]);

  // --- [1] 라벨 마스터 관련 함수 ---
  const [newLabel, setNewLabel] = useState({ brand: 'WV', type: '행택', name: '', size: '', code: '', stock: 0, price: 0, vendor: '', img: '' });

  // BUG FIX 1: FileReader 비동기 처리 시 stale closure 방지 → 함수형 업데이트 사용
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewLabel(prev => ({ ...prev, img: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const addLabel = () => {
    if (!newLabel.name || !newLabel.code) return alert('라벨명과 품번은 필수입니다.');
    setLabels([...labels, { ...newLabel, id: Date.now() }]);
    setNewLabel({ brand: 'WV', type: '행택', name: '', size: '', code: '', stock: 0, price: 0, vendor: '', img: '' });
  };

  // BUG FIX 2: 라벨 삭제 시 selectedProduct도 함께 동기화
  const deleteLabel = (id) => {
    if (window.confirm('정말 삭제하시겠습니까?')) {
      setLabels(labels.filter(l => l.id !== id));
      setProducts(products.map(p => ({
        ...p,
        bom: p.bom.filter(b => b.labelId !== id)
      })));
      setSelectedProduct(prev => prev ? { ...prev, bom: prev.bom.filter(b => b.labelId !== id) } : null);
    }
  };

  // --- [2] 상품 BOM 관리 함수 ---
  const [newProductName, setNewProductName] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [bomSelection, setBomSelection] = useState({ labelId: '', qty: 1 });

  const addProduct = () => {
    if (!newProductName) return;
    const newProd = { id: Date.now(), name: newProductName, bom: [] };
    setProducts([...products, newProd]);
    setNewProductName('');
    setSelectedProduct(newProd);
  };

  // BUG FIX 3: 상품 삭제 기능 추가
  const deleteProduct = (id) => {
    if (window.confirm('상품을 삭제하시겠습니까?')) {
      setProducts(products.filter(p => p.id !== id));
      if (selectedProduct?.id === id) {
        setSelectedProduct(null);
      }
    }
  };

  const addLabelToBom = () => {
    if (!selectedProduct || !bomSelection.labelId) return;
    const updatedProducts = products.map(p => {
      if (p.id === selectedProduct.id) {
        const exists = p.bom.find(b => b.labelId === parseInt(bomSelection.labelId));
        if (exists) return p;
        return { ...p, bom: [...p.bom, { labelId: parseInt(bomSelection.labelId), qtyPerUnit: parseInt(bomSelection.qty) }] };
      }
      return p;
    });
    setProducts(updatedProducts);
    setSelectedProduct(updatedProducts.find(p => p.id === selectedProduct.id));
  };

  const removeLabelFromBom = (prodId, labelId) => {
    const updatedProducts = products.map(p => {
      if (p.id === prodId) {
        return { ...p, bom: p.bom.filter(b => b.labelId !== labelId) };
      }
      return p;
    });
    setProducts(updatedProducts);
    if (selectedProduct && selectedProduct.id === prodId) {
      setSelectedProduct(updatedProducts.find(p => p.id === prodId));
    }
  };

  // --- [3] 발주 계산기 함수 ---
  const [calcTarget, setCalcTarget] = useState('');
  const [calcQty, setCalcQty] = useState('');
  const [calcResult, setCalcResult] = useState(null);

  const calculateOrder = () => {
    if (!calcTarget || !calcQty) return alert('상품과 생산 수량을 선택해주세요.');
    const product = products.find(p => p.id === parseInt(calcTarget));
    if (!product) return;
    let totalCost = 0;
    const details = product.bom.map(item => {
      const label = labels.find(l => l.id === item.labelId);
      if (!label) return null;
      const totalNeed = item.qtyPerUnit * parseInt(calcQty);
      const shortage = Math.max(0, totalNeed - label.stock);
      const cost = shortage * label.price;
      totalCost += cost;
      return { ...label, needQty: totalNeed, shortage, cost };
    }).filter(Boolean);
    setCalcResult({ details, totalCost });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* 헤더 */}
        <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-slate-100">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">라벨 재고 및 지능형 발주 시스템</h1>
            <p className="text-sm text-slate-500 mt-1">2026-02-24 최신 업데이트 (버그 수정 버전)</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setActiveTab('inventory')} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === 'inventory' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              <Package size={18} /> 라벨 마스터
            </button>
            <button onClick={() => setActiveTab('bom')} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === 'bom' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              <Layers size={18} /> 상품 BOM 세팅
            </button>
            <button onClick={() => setActiveTab('calc')} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === 'calc' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              <Calculator size={18} /> 발주 계산기
            </button>
          </div>
        </div>

        {/* [1] 라벨 마스터 탭 */}
        {activeTab === 'inventory' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2"><Package className="text-blue-600" /> 라벨 재고 리스트</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-sm text-slate-600">
                    <th className="p-3 font-medium">이미지</th>
                    <th className="p-3 font-medium">브랜드</th>
                    <th className="p-3 font-medium">종류</th>
                    <th className="p-3 font-medium">라벨명(품번)</th>
                    <th className="p-3 font-medium">사이즈</th>
                    <th className="p-3 font-medium text-right">현재고</th>
                    <th className="p-3 font-medium text-right">단가</th>
                    <th className="p-3 font-medium">공급처</th>
                    <th className="p-3 font-medium text-center">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {labels.map(l => (
                    <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3">
                        {l.img
                          ? <img src={l.img} alt="label" className="w-12 h-12 rounded object-cover border border-slate-200" />
                          : <div className="w-12 h-12 rounded bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200"><ImageIcon size={20} /></div>}
                      </td>
                      <td className="p-3 font-medium">{l.brand}</td>
                      <td className="p-3 text-sm">{l.type}</td>
                      <td className="p-3">
                        <div className="font-medium text-slate-800">{l.name}</div>
                        <div className="text-xs text-slate-500">{l.code}</div>
                      </td>
                      <td className="p-3 text-sm">{l.size}</td>
                      <td className="p-3 text-right font-bold text-blue-600">{l.stock.toLocaleString()}</td>
                      <td className="p-3 text-right">{l.price.toLocaleString()}원</td>
                      <td className="p-3 text-sm">{l.vendor}</td>
                      <td className="p-3 text-center">
                        <button onClick={() => deleteLabel(l.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mt-6">
              <h3 className="text-sm font-bold text-slate-700 mb-3">신규 라벨 등록</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="col-span-2 md:col-span-4 flex gap-4">
                  <div className="flex-1">
                    <label className="block text-xs text-slate-500 mb-1">라벨 이미지 (선택)</label>
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="w-full text-sm p-2 border border-slate-300 rounded bg-white" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">브랜드</label>
                  <select value={newLabel.brand} onChange={e => setNewLabel({ ...newLabel, brand: e.target.value })} className="w-full p-2 border border-slate-300 rounded text-sm bg-white">
                    <option value="WV">WV</option>
                    <option value="FP">FP</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">종류</label>
                  <input type="text" value={newLabel.type} onChange={e => setNewLabel({ ...newLabel, type: e.target.value })} placeholder="예: 행택, 폴리백" className="w-full p-2 border border-slate-300 rounded text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">라벨명</label>
                  <input type="text" value={newLabel.name} onChange={e => setNewLabel({ ...newLabel, name: e.target.value })} placeholder="예: WV 메인택" className="w-full p-2 border border-slate-300 rounded text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">품번 (고유코드)</label>
                  <input type="text" value={newLabel.code} onChange={e => setNewLabel({ ...newLabel, code: e.target.value })} placeholder="예: WVHT001" className="w-full p-2 border border-slate-300 rounded text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">사이즈</label>
                  <input type="text" value={newLabel.size} onChange={e => setNewLabel({ ...newLabel, size: e.target.value })} placeholder="예: one size, S, M" className="w-full p-2 border border-slate-300 rounded text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">현재 재고(수량)</label>
                  <input type="number" value={newLabel.stock} onChange={e => setNewLabel({ ...newLabel, stock: parseInt(e.target.value) || 0 })} className="w-full p-2 border border-slate-300 rounded text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">단가(원)</label>
                  <input type="number" value={newLabel.price} onChange={e => setNewLabel({ ...newLabel, price: parseInt(e.target.value) || 0 })} className="w-full p-2 border border-slate-300 rounded text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">공급처</label>
                  <input type="text" value={newLabel.vendor} onChange={e => setNewLabel({ ...newLabel, vendor: e.target.value })} placeholder="예: 스마트, SB라벨" className="w-full p-2 border border-slate-300 rounded text-sm" />
                </div>
              </div>
              <button onClick={addLabel} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
                <Plus size={16} /> 신규 라벨 추가
              </button>
            </div>
          </div>
        )}

        {/* [2] 상품 BOM 세팅 탭 */}
        {activeTab === 'bom' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 md:col-span-1 h-fit">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Layers className="text-indigo-600" /> 생산 상품 목록</h2>
              <div className="space-y-2 mb-6">
                {products.map(p => (
                  <div key={p.id} className={`flex items-center gap-2 p-3 rounded-lg border transition-all ${selectedProduct?.id === p.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'}`}>
                    <button onClick={() => setSelectedProduct(p)} className={`flex-1 text-left text-sm ${selectedProduct?.id === p.id ? 'text-indigo-700 font-medium' : 'text-slate-600'}`}>
                      {p.name}
                    </button>
                    <button onClick={() => deleteProduct(p.id)} className="text-red-400 hover:text-red-600 shrink-0">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="pt-4 border-t border-slate-100">
                <label className="block text-xs text-slate-500 mb-1">새 상품 등록</label>
                <div className="flex gap-2">
                  <input type="text" value={newProductName} onChange={e => setNewProductName(e.target.value)} placeholder="예: 24FW 와이드 팬츠" className="flex-1 p-2 border border-slate-300 rounded text-sm" />
                  <button onClick={addProduct} className="bg-slate-800 text-white px-3 py-2 rounded hover:bg-slate-700"><Plus size={18} /></button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 md:col-span-2">
              {selectedProduct ? (
                <>
                  <h2 className="text-lg font-bold mb-1 flex items-center gap-2 text-indigo-800">
                    {selectedProduct.name} <span className="text-sm font-normal text-slate-500 ml-2">소요 라벨 세팅</span>
                  </h2>
                  <p className="text-sm text-slate-500 mb-6">이 옷을 1벌 만들 때 들어가는 라벨과 수량을 등록해두세요.</p>

                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex gap-4 items-end mb-6">
                    <div className="flex-1">
                      <label className="block text-xs text-slate-500 mb-1">라벨 선택</label>
                      <select value={bomSelection.labelId} onChange={e => setBomSelection({ ...bomSelection, labelId: e.target.value })} className="w-full p-2 border border-slate-300 rounded text-sm bg-white">
                        <option value="">-- 라벨을 선택하세요 --</option>
                        {labels.map(l => (
                          <option key={l.id} value={l.id}>[{l.brand}] {l.name} ({l.code})</option>
                        ))}
                      </select>
                    </div>
                    <div className="w-24">
                      <label className="block text-xs text-slate-500 mb-1">1벌당 수량</label>
                      <input type="number" min="1" value={bomSelection.qty} onChange={e => setBomSelection({ ...bomSelection, qty: e.target.value })} className="w-full p-2 border border-slate-300 rounded text-sm bg-white" />
                    </div>
                    <button onClick={addLabelToBom} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded text-sm font-medium">
                      추가
                    </button>
                  </div>

                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-sm text-slate-600">
                        <th className="p-3 font-medium">이미지</th>
                        <th className="p-3 font-medium">라벨명 (품번)</th>
                        <th className="p-3 font-medium text-center">1벌당 소요량</th>
                        <th className="p-3 font-medium text-center">삭제</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedProduct.bom.length === 0 && (
                        <tr><td colSpan="4" className="p-4 text-center text-slate-400 text-sm">등록된 라벨이 없습니다.</td></tr>
                      )}
                      {selectedProduct.bom.map(item => {
                        const label = labels.find(l => l.id === item.labelId);
                        if (!label) return null;
                        return (
                          <tr key={item.labelId}>
                            <td className="p-3">
                              {label.img
                                ? <img src={label.img} alt="label" className="w-10 h-10 rounded object-cover border border-slate-200" />
                                : <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200"><ImageIcon size={16} /></div>}
                            </td>
                            <td className="p-3 font-medium">{label.name} <span className="text-xs text-slate-400 ml-1">{label.code}</span></td>
                            <td className="p-3 text-center font-bold text-indigo-600">{item.qtyPerUnit}개</td>
                            <td className="p-3 text-center">
                              <button onClick={() => removeLabelFromBom(selectedProduct.id, label.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={16} /></button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12">
                  <Layers size={48} className="mb-4 opacity-50" />
                  <p>좌측에서 상품을 선택하거나 새로 등록해주세요.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* [3] 발주 계산기 탭 */}
        {activeTab === 'calc' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-6">
            <h2 className="text-lg font-bold flex items-center gap-2"><Calculator className="text-emerald-600" /> 생산량 기반 자동 발주 계산</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-emerald-50 p-6 rounded-xl border border-emerald-100">
              <div className="md:col-span-1">
                <label className="block text-sm font-bold text-emerald-900 mb-2">어떤 상품을 생산하시나요?</label>
                <select value={calcTarget} onChange={e => { setCalcTarget(e.target.value); setCalcResult(null); }} className="w-full p-3 border border-emerald-200 rounded-lg bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="">-- 등록된 상품 선택 --</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-1">
                <label className="block text-sm font-bold text-emerald-900 mb-2">몇 벌을 생산하시나요?</label>
                <input type="number" min="1" value={calcQty} onChange={e => { setCalcQty(e.target.value); setCalcResult(null); }} placeholder="생산 수량 입력 (예: 2000)" className="w-full p-3 border border-emerald-200 rounded-lg bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div className="md:col-span-1 flex items-end">
                <button onClick={calculateOrder} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white p-3 rounded-lg font-bold shadow-md transition-transform active:scale-95">
                  재고 확인 및 발주량 계산
                </button>
              </div>
            </div>

            {calcResult && (
              <div className="mt-8">
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <AlertCircle className="text-amber-500" /> 예상 발주 리스트
                </h3>
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-sm text-slate-600">
                        <th className="p-3 font-medium">라벨명 (공급처)</th>
                        <th className="p-3 font-medium text-right bg-slate-100">생산 필요량</th>
                        <th className="p-3 font-medium text-right bg-blue-50">현재고</th>
                        <th className="p-3 font-medium text-right bg-red-50 text-red-600">발주 필요 수량</th>
                        <th className="p-3 font-medium text-right">예상 발주 금액</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {calcResult.details.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-3">
                            <div className="font-medium text-slate-800 flex items-center gap-2">
                              {item.img && <img src={item.img} alt="img" className="w-8 h-8 rounded object-cover" />}
                              {item.name}
                            </div>
                            <div className="text-xs text-slate-500">{item.code} / {item.vendor}</div>
                          </td>
                          <td className="p-3 text-right bg-slate-50/50">{item.needQty.toLocaleString()}개</td>
                          <td className="p-3 text-right bg-blue-50/50 text-blue-700">{item.stock.toLocaleString()}개</td>
                          <td className="p-3 text-right bg-red-50/50 font-bold text-red-600">
                            {item.shortage > 0 ? `${item.shortage.toLocaleString()}개 부족` : '재고 충분'}
                          </td>
                          <td className="p-3 text-right font-medium">
                            {item.shortage > 0 ? `${item.cost.toLocaleString()}원` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-800 text-white">
                        <td colSpan="4" className="p-4 text-right font-medium">총 예상 발주 비용 합계</td>
                        <td className="p-4 text-right font-bold text-lg text-emerald-400">{calcResult.totalCost.toLocaleString()} 원</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
