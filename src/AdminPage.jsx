import React, { useState, useEffect } from 'react';
import { db, auth } from './firebase';
import { collection, getDocs, doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, getAuth, signOut as fbSignOut } from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import { Search, UserPlus, RefreshCw, ShieldCheck, Shield, UserX, User, X, Eye, EyeOff, ChevronUp, ChevronDown } from 'lucide-react';

const DOMAIN = '@fairplay142.com';
const FB_CONFIG = {
  apiKey: "AIzaSyCUtXeC05HeaOHOjjj-BkPqlOQ_iXLafT4",
  authDomain: "label-6f843.firebaseapp.com",
  projectId: "label-6f843",
  storageBucket: "label-6f843.firebasestorage.app",
  messagingSenderId: "113804983646",
  appId: "1:113804983646:web:6a613d8903ac8212b423cf",
};

// 비밀번호 초기화 (Identity Toolkit REST API)
const resetPasswordREST = async (uid, newPw = '123456') => {
  const idToken = await auth.currentUser?.getIdToken(true);
  if (!idToken) throw new Error('인증 토큰 없음');
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${FB_CONFIG.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, password: newPw, returnSecureToken: false }),
    }
  );
  // 위는 본인 비밀번호 변경. 관리자용은 아래 admin REST API 필요
  // 실제로는 서버사이드(Firebase Functions)가 필요하므로 Firestore에 reset 플래그 저장
  return res.ok;
};

export default function AdminPage({ currentUser }) {
  const [users, setUsers]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [sortKey, setSortKey]       = useState('name');
  const [sortAsc, setSortAsc]       = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [actionLoading, setActionLoading] = useState({});

  // 신규 등록 폼
  const [newName, setNewName]       = useState('');
  const [newId, setNewId]           = useState('');
  const [newPw, setNewPw]           = useState('123456');
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [showPw, setShowPw]         = useState(false);
  const [addError, setAddError]     = useState('');
  const [addLoading, setAddLoading] = useState(false);

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'users'));
      setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
    } finally { setLoading(false); }
  };

  const setAction = (uid, v) => setActionLoading(p => ({ ...p, [uid]: v }));

  // 활성/비활성 토글
  const toggleActive = async (user) => {
    setAction(user.uid, 'toggle');
    try {
      await updateDoc(doc(db, 'users', user.uid), { active: !user.active });
      setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, active: !u.active } : u));
    } catch (e) { alert('변경 실패: ' + e.message); }
    setAction(user.uid, null);
  };

  // 관리자 권한 토글
  const toggleAdmin = async (user) => {
    if (user.uid === auth.currentUser?.uid) return alert('본인의 관리자 권한은 변경할 수 없습니다.');
    setAction(user.uid, 'admin');
    try {
      await updateDoc(doc(db, 'users', user.uid), { isAdmin: !user.isAdmin });
      setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, isAdmin: !u.isAdmin } : u));
    } catch (e) { alert('변경 실패: ' + e.message); }
    setAction(user.uid, null);
  };

  // 비밀번호 초기화 플래그 (로그인 시 강제 변경 요구)
  const resetPasswordFlag = async (user) => {
    if (!window.confirm(`${user.name}(${user.userId}) 계정의 비밀번호를 123456으로 초기화 하시겠습니까?\n(다음 로그인 시 적용)`)) return;
    setAction(user.uid, 'reset');
    try {
      await updateDoc(doc(db, 'users', user.uid), { passwordReset: true });
      alert(`${user.name} 계정에 비밀번호 초기화가 요청되었습니다.\nFirebase Console에서 직접 변경하거나 관리자에게 문의하세요.`);
    } catch (e) { alert('실패: ' + e.message); }
    setAction(user.uid, null);
  };

  // 신규 계정 등록
  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return setAddError('이름을 입력하세요.');
    if (!newId.trim()) return setAddError('아이디를 입력하세요.');
    if (newPw.length < 6) return setAddError('비밀번호는 6자 이상이어야 합니다.');
    if (users.find(u => u.userId === newId.trim())) return setAddError('이미 존재하는 아이디입니다.');

    setAddLoading(true); setAddError('');
    try {
      // 기존 로그인 상태 유지를 위해 Secondary App 사용
      const appName = 'secondary-' + Date.now();
      const secondaryApp = getApps().find(a => a.name === appName) || initializeApp(FB_CONFIG, appName);
      const secondaryAuth = getAuth(secondaryApp);
      const email = newId.trim() + DOMAIN;
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, newPw);
      const uid = cred.user.uid;
      await fbSignOut(secondaryAuth);

      // Firestore에 저장
      await setDoc(doc(db, 'users', uid), {
        name: newName.trim(),
        userId: newId.trim(),
        email,
        isAdmin: newIsAdmin,
        active: true,
        createdAt: new Date().toISOString(),
      });
      setUsers(prev => [...prev, { uid, name: newName.trim(), userId: newId.trim(), email, isAdmin: newIsAdmin, active: true }]);
      setShowAddModal(false);
      setNewName(''); setNewId(''); setNewPw('123456'); setNewIsAdmin(false);
      alert(`${newName.trim()} 계정이 등록되었습니다.`);
    } catch (e) {
      if (e.code === 'auth/email-already-in-use') setAddError('이미 등록된 아이디입니다.');
      else setAddError('등록 실패: ' + e.message);
    }
    setAddLoading(false);
  };

  // 정렬
  const handleSort = (key) => {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(true); }
  };

  const filtered = users
    .filter(u => {
      const q = search.toLowerCase();
      return !q || u.name?.includes(q) || u.userId?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const va = (a[sortKey] ?? '').toString().toLowerCase();
      const vb = (b[sortKey] ?? '').toString().toLowerCase();
      return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    });

  const SortIcon = ({ k }) => sortKey === k
    ? (sortAsc ? <ChevronUp size={12} className="inline ml-0.5" /> : <ChevronDown size={12} className="inline ml-0.5" />)
    : null;

  const activeCount = users.filter(u => u.active).length;
  const adminCount  = users.filter(u => u.isAdmin).length;

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-slate-800">계정 관리</h2>
          <div className="flex gap-2 text-xs">
            <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-medium">전체 {users.length}명</span>
            <span className="bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-medium">활성 {activeCount}명</span>
            <span className="bg-violet-100 text-violet-700 px-2.5 py-1 rounded-full font-medium">관리자 {adminCount}명</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadUsers} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors" title="새로고침">
            <RefreshCw size={13} /> 새로고침
          </button>
          <button onClick={() => setShowAddModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors">
            <UserPlus size={13} /> 신규 등록
          </button>
        </div>
      </div>

      {/* 검색 */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="이름, 아이디, 이메일 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
        />
        {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={14}/></button>}
      </div>

      {/* 테이블 */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 text-sm">불러오는 중...</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                  <th className="text-center px-3 py-3 font-semibold w-10">#</th>
                  <th className="text-left px-3 py-3 font-semibold cursor-pointer hover:text-slate-700" onClick={() => handleSort('name')}>이름 <SortIcon k="name"/></th>
                  <th className="text-left px-3 py-3 font-semibold cursor-pointer hover:text-slate-700" onClick={() => handleSort('userId')}>아이디 <SortIcon k="userId"/></th>
                  <th className="text-left px-3 py-3 font-semibold hidden md:table-cell">이메일</th>
                  <th className="text-center px-3 py-3 font-semibold">상태</th>
                  <th className="text-center px-3 py-3 font-semibold">관리자</th>
                  <th className="text-center px-3 py-3 font-semibold">작업</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-10 text-slate-400">검색 결과가 없습니다.</td></tr>
                )}
                {filtered.map((u, i) => {
                  const isSelf = u.uid === auth.currentUser?.uid;
                  const busy = actionLoading[u.uid];
                  return (
                    <tr key={u.uid} className={`border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors ${!u.active ? 'opacity-50' : ''}`}>
                      <td className="text-center px-3 py-3 text-slate-400 text-xs">{i + 1}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">
                            {u.name?.[0] || '?'}
                          </div>
                          <span className="font-medium text-slate-800">{u.name}</span>
                          {isSelf && <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">나</span>}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-600 font-mono text-xs">{u.userId}</td>
                      <td className="px-3 py-3 text-slate-500 text-xs hidden md:table-cell">{u.email}</td>
                      <td className="px-3 py-3 text-center">
                        <button
                          onClick={() => toggleActive(u)}
                          disabled={!!busy || isSelf}
                          title={isSelf ? '본인 계정은 변경 불가' : (u.active ? '비활성화' : '활성화')}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                            u.active
                              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          } disabled:cursor-not-allowed`}
                        >
                          {busy === 'toggle' ? <RefreshCw size={10} className="animate-spin"/> : (u.active ? <User size={10}/> : <UserX size={10}/>)}
                          {u.active ? '활성' : '비활성'}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <button
                          onClick={() => toggleAdmin(u)}
                          disabled={!!busy || isSelf}
                          title={isSelf ? '본인 관리자 권한은 변경 불가' : (u.isAdmin ? '관리자 해제' : '관리자 지정')}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                            u.isAdmin
                              ? 'bg-violet-100 text-violet-700 hover:bg-violet-200'
                              : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                          } disabled:cursor-not-allowed`}
                        >
                          {busy === 'admin' ? <RefreshCw size={10} className="animate-spin"/> : (u.isAdmin ? <ShieldCheck size={10}/> : <Shield size={10}/>)}
                          {u.isAdmin ? '관리자' : '일반'}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <button
                          onClick={() => resetPasswordFlag(u)}
                          disabled={!!busy}
                          title="비밀번호 초기화 요청"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors disabled:opacity-50"
                        >
                          {busy === 'reset' ? <RefreshCw size={10} className="animate-spin"/> : <RefreshCw size={10}/>}
                          PW초기화
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 신규 등록 모달 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-800">신규 계정 등록</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600"><X size={18}/></button>
            </div>
            <form onSubmit={handleAdd} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">이름 *</label>
                <input type="text" value={newName} onChange={e=>setNewName(e.target.value)} placeholder="홍길동"
                  className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"/>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">아이디 *</label>
                <div className="flex rounded-xl border border-slate-200 overflow-hidden focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-100">
                  <input type="text" value={newId} onChange={e=>setNewId(e.target.value.toLowerCase().replace(/\s/g,''))} placeholder="hong.gildong"
                    className="flex-1 px-4 py-2.5 text-sm outline-none"/>
                  <span className="flex items-center pr-4 text-sm text-slate-400 select-none whitespace-nowrap">{DOMAIN}</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">초기 비밀번호 *</label>
                <div className="relative">
                  <input type={showPw?'text':'password'} value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="123456"
                    className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 pr-10"/>
                  <button type="button" onClick={()=>setShowPw(v=>!v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                    {showPw?<EyeOff size={15}/>:<Eye size={15}/>}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="newAdmin" checked={newIsAdmin} onChange={e=>setNewIsAdmin(e.target.checked)} className="w-4 h-4 accent-violet-600"/>
                <label htmlFor="newAdmin" className="text-sm text-slate-700">관리자 권한 부여</label>
              </div>
              {addError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
                  <X size={14}/> {addError}
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={()=>setShowAddModal(false)} className="flex-1 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">취소</button>
                <button type="submit" disabled={addLoading} className="flex-1 py-2.5 text-sm font-bold text-white bg-slate-800 hover:bg-slate-700 disabled:bg-slate-400 rounded-xl transition-colors">
                  {addLoading ? '등록 중...' : '등록'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
