import React, { useState, useEffect, useRef } from 'react';
import { Package, Calculator, Layers, Plus, Trash2, Image as ImageIcon, AlertCircle, ZoomIn, X, Upload, MoreVertical, Pencil, Search, GripVertical, ClipboardList, Save, History, FolderOpen, FileText, Download, File, FilePlus, ChevronLeft, ChevronRight, FileDown, Users } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { db, storage, auth } from './firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, runTransaction } from 'firebase/firestore';
import AdminPage from './AdminPage';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

// 이미지 압축 함수 (썸네일 사이즈에 맞게 자동 리사이즈)
function compressImage(file, maxSize = 96) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
        else { w = Math.round(w * maxSize / h); h = maxSize; }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// GitHub 이미지 업로드 (백업 저장소)
async function uploadToGitHub(compressedBase64, fileName) {
  const token = import.meta.env.VITE_GITHUB_TOKEN;
  if (!token) return null;
  try {
    const owner = import.meta.env.VITE_GITHUB_OWNER || 'k106hj-star';
    const repo = import.meta.env.VITE_GITHUB_REPO || 'label-management';
    const base64Data = compressedBase64.split(',')[1];
    const resp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/public/label-images/${fileName}`,
      {
        method: 'PUT',
        headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `img: ${fileName}`, content: base64Data }),
      }
    );
    if (!resp.ok) return null;
    return `https://raw.githubusercontent.com/${owner}/${repo}/main/public/label-images/${fileName}`;
  } catch { return null; }
}

// Firebase Storage 업로드 (GitHub 백업 + base64 폴백)
async function uploadToStorage(file) {
  const compressed = await compressImage(file, 200);
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  try {
    const response = await fetch(compressed);
    const blob = await response.blob();
    const storageRef = ref(storage, `label-images/${fileName}`);
    await uploadBytes(storageRef, blob);
    const firebaseUrl = await getDownloadURL(storageRef);
    // GitHub 백업은 백그라운드 실행 (대기 안 함)
    uploadToGitHub(compressed, fileName).catch(() => {});
    return firebaseUrl;
  } catch (e) {
    // Firebase 실패 시 GitHub 시도
    const githubUrl = await uploadToGitHub(compressed, fileName);
    if (githubUrl) return githubUrl;
    // 최후 폴백: base64
    return compressed;
  }
}

// CSV 파서 함수 (따옴표 안의 쉼표 처리)
function parseCSVLine(line) {
  const fields = [];
  let current = '', inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { fields.push(current); current = ''; }
    else { current += ch; }
  }
  fields.push(current);
  return fields.map(f => f.trim());
}

function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  // 헤더명으로 컬럼 인덱스 매핑 (구버전/신버전 모두 지원)
  const col = (names) => {
    for (const n of names) {
      const idx = headers.findIndex(h => h === n);
      if (idx !== -1) return idx;
    }
    return -1;
  };
  const iName   = col(['라벨명', '라벨 명']);
  const iBrand  = col(['브랜드']);
  const iType   = col(['종류']);
  const iCode   = col(['품번']);
  const iSize   = col(['사이즈']);
  const iStock  = col(['재고수량', '현재고']);
  const iSafety   = col(['안전재고']);
  const iReserve  = col(['최소보유수량']);
  const iPrice    = col(['단가']);
  const iVendor   = col(['공급처']);

  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const f = parseCSVLine(line);
    if (f.length < 5) continue;
    const get = (idx) => (idx >= 0 && idx < f.length) ? f[idx] : '';
    const stockRaw   = get(iStock).replace(/,/g, '');
    const priceRaw   = get(iPrice).replace(/,/g, '');
    const safetyRaw  = get(iSafety).replace(/,/g, '');
    const reserveRaw = get(iReserve).replace(/,/g, '');
    results.push({
      id: i,
      brand: get(iBrand),
      type: get(iType),
      name: get(iName),
      code: get(iCode),
      size: get(iSize),
      stock: (!stockRaw || stockRaw === '-') ? 0 : (parseInt(stockRaw) || 0),
      safetyStock: (!safetyRaw || safetyRaw === '-') ? 0 : (parseInt(safetyRaw) || 0),
      reserveStock: (!reserveRaw || reserveRaw === '-') ? 0 : (parseInt(reserveRaw) || 0),
      price: (!priceRaw || priceRaw === '-') ? 0 : (parseInt(priceRaw) || 0),
      vendor: get(iVendor),
      img: ''
    });
  }
  return results;
}

// 전체 라벨 CSV 데이터 (178개 항목)
const csvRawData = `브랜드,종류,라벨 명,사이즈,품번,재고수량,단가,공급처
WV,행택,WV 메인택,one size,WVHT001,,125,스마트
WV,행택,WV 오로사각행택,one size,WVHT002,,140,스마트
WV,행택,WV 바지포켓택,one size,WVHT003,,32,스마트
WV,행택,WV 오비행택,one size,WVHT004,,53,스마트
WV,행택,WV 원형 블랙 행택,one size,WVHT005,,125,스마트
WV,폴리백,WV 폴리백,소,WVPB001,,48,스마트
WV,폴리백,WV 폴리백,대,WVPB002,,61,스마트
WV,폴리백,WV 폴리백,아우터,WVPB003,,155,스마트
WV,포인트라벨,WV 메인라벨,one size,WVPL001,"1,705",35,SB라벨
WV,사이즈라벨,WV 사이즈라벨,S,WVSL001,"7,818",47,SB라벨
WV,사이즈라벨,WV 사이즈라벨,M,WVSL001,"6,516",47,SB라벨
WV,사이즈라벨,WV 사이즈라벨,L,WVSL001,"7,169",47,SB라벨
WV,사이즈라벨,WV 사이즈라벨,XL,WVSL001,"6,037",47,SB라벨
WV,사이즈라벨,WV 사이즈라벨,2XL,WVSL001,"3,153",47,SB라벨
WV,사이즈라벨,WV 사이즈라벨,3XL,WVSL001,"6,105",47,SB라벨
WV,와끼라벨,WV WVP 와끼라벨,one size,WVSPL001,"1,178",15,SB라벨
WV,와끼라벨,WV 레드 와끼라벨,one size,WVSPL002,"8,805",18,SB라벨
WV,와끼라벨,WV 아이보리 와끼라벨,one size,WVSPL003,"7,912",18,SB라벨
WV,와끼라벨,WV 가죽 와끼 라벨,one size,WVSPL004,"3,892",180,SB라벨
WV,와끼라벨,WV 미니 와끼라벨,one size,WVSPL005,"12,621",15,SB라벨
WV,와끼라벨,WV 다이노 와끼라벨,one size,WVSPL006,"4,786",,SB라벨
WV,포인트라벨,WV 앨리스 토끼 라벨,one size,WVPL002,922,,SB라벨
WV,포인트라벨,WV 앨리스 Hatter 라벨,one size,WVPL003,"2,338",,SB라벨
WV,포인트라벨,WV 앨리스 Queen 라벨,one size,WVPL004,"1,947",,SB라벨
WV,포인트라벨,WV 스포츠패치라벨,one size,WVPL005,"11,723",,SB라벨
WV,포인트라벨,WV 스포츠패치라벨2,one size,WVPL006,"12,766",,SB라벨
WV,포인트라벨,WV 패치블랙라벨,one size,WVPL007,"5,061",26,SB라벨
WV,포인트라벨,WV 패치아이보리라벨,one size,WVPL008,"3,068",26,SB라벨
WV,포인트라벨,WV 두들 라벨,one size,WVPL009,"2,604",,SB라벨
WV,포인트라벨,WV SINCE 가죽라벨,one size,WVPL010,918,180,스마트
WV,포인트라벨,WV 워커홀릭라벨,one size,WVPL011,,35,SB라벨
WV,포인트라벨,WV 왓에버 라벨,one size,WVPL012,,39,SB라벨
WV,포인트라벨,WV 브라운 이면봉제 라벨,one size,WVPL013,"2,770",35,SB라벨
WV,포인트라벨,WV 아우터 직조라벨,one size,WVPL014,"2,433",88,SB라벨
WV,정품인증,정품인증라벨,one size,WVAL001,,106,
WV,포인트라벨,WV 스텝바이스텝포이트 라벨,one size,WVPL015,"6,364",,SB라벨
JM,행택,제멋 행택,one size,JMHT001,,205,스마트
JM,행택,제멋 바지 오비텍,one size,JMHT002,,37,스마트
JM,폴리백,제멋 폴리백,소,JMPB001,,48,스마트
JM,폴리백,제멋 폴리백,대,JMPB002,,61,스마트
JM,사이즈라벨,제멋 사이즈라벨 1,S,JMSL001,"6,728",18,스마트
JM,사이즈라벨,제멋 사이즈라벨 1,M,JMSL001,"9,060",18,스마트
JM,사이즈라벨,제멋 사이즈라벨 1,L,JMSL001,"11,478",18,스마트
JM,사이즈라벨,제멋 사이즈라벨 1,XL,JMSL001,"8,668",18,스마트
JM,사이즈라벨,제멋 사이즈라벨 1,2XL,JMSL001,"9,682",18,스마트
JM,사이즈라벨,제멋 사이즈라벨 1,3XL,JMSL001,"3,374",17,스마트
JM,사이즈라벨,제멋 사이즈라벨 2,M,JMSL002,298,17,스마트
JM,사이즈라벨,제멋 사이즈라벨 2,L,JMSL002,8,17,스마트
JM,사이즈라벨,제멋 사이즈라벨 2,XL,JMSL002,365,17,스마트
JM,사이즈라벨,제멋 사이즈라벨 2,2XL,JMSL002,95,17,스마트
JM,사이즈라벨,제멋 스포츠라인라벨,M,JMSL003,-,,스마트
JM,사이즈라벨,제멋 스포츠라인라벨,L,JMSL003,-,,스마트
JM,사이즈라벨,제멋 스포츠라인라벨,XL,JMSL003,-,,스마트
JM,사이즈라벨,제멋 스포츠라인라벨,2XL,JMSL003,-,,스마트
JM,사이즈라벨,제멋 이면봉제 사이즈라벨,S,JMSL004,-,18,스마트
JM,사이즈라벨,제멋 이면봉제 사이즈라벨,M,JMSL004,-,18,스마트
JM,사이즈라벨,제멋 이면봉제 사이즈라벨,L,JMSL004,-,18,스마트
JM,사이즈라벨,제멋 이면봉제 사이즈라벨,XL,JMSL004,-,18,스마트
JM,사이즈라벨,제멋 이면봉제 사이즈라벨,2XL,JMSL004,-,18,스마트
JM,사이즈라벨,제멋 피그먼트 이면봉제 사이즈라벨,M,JMSL005,-,,스마트
JM,사이즈라벨,제멋 피그먼트 이면봉제 사이즈라벨,L,JMSL005,-,,스마트
JM,사이즈라벨,제멋 피그먼트 이면봉제 사이즈라벨,XL,JMSL005,-,,스마트
JM,사이즈라벨,제멋 직조사이즈라벨,S,JMSL006,"5,719",42,SB라벨
JM,사이즈라벨,제멋 직조사이즈라벨,M,JMSL006,"3,063",42,SB라벨
JM,사이즈라벨,제멋 직조사이즈라벨,L,JMSL006,"1,789",42,SB라벨
JM,사이즈라벨,제멋 직조사이즈라벨,XL,JMSL006,"4,321",42,SB라벨
JM,사이즈라벨,제멋 직조사이즈라벨,2XL,JMSL006,"3,705",42,SB라벨
JM,사이즈라벨,제멋 직조사이즈라벨,3XL,JMSL006,"2,428",42,SB라벨
JM,사이즈라벨,제멋 바지 직조 바지 사이즈라벨,28,JMSL007,"3,620",43,SB라벨
JM,사이즈라벨,제멋 바지 직조 바지 사이즈라벨,30,JMSL007,"2,573",43,SB라벨
JM,사이즈라벨,제멋 바지 직조 바지 사이즈라벨,32,JMSL007,"3,494",43,SB라벨
JM,사이즈라벨,제멋 바지 직조 바지 사이즈라벨,34,JMSL007,"3,234",43,SB라벨
JM,사이즈라벨,제멋 바지 직조 바지 사이즈라벨,36,JMSL007,"4,489",43,SB라벨
JM,사이즈라벨,제멋 바지 직조 바지 사이즈라벨,38,JMSL007,"4,809",43,SB라벨
JM,와끼라벨,제멋 와끼 라벨,one size,JMSPL001,"1,562",21,SB라벨
JM,와끼라벨,제멋 7 와끼 라벨(블랙),one size,JMSPL002,"3,871",18,SB라벨
JM,와끼라벨,제멋 7 와끼 라벨(화이트),one size,JMSPL003,"17,179",18,SB라벨
JM,와끼라벨,제멋 레드 와끼 라벨,one size,JMSPL004,"3,584",18,SB라벨
JM,포인트라벨,제멋 포인트 라벨,one size,JMPL001,"6,670",23,SB라벨
JM,포인트라벨,제멋 오비 이면 봉제 라벨,one size,JMPL002,-,,SB라벨
JM,포인트라벨,제멋 아우터 메인 라벨,one size,JMPL003,"4,680",60,SB라벨
EZ,행택,EZ 카드 행택,one size,EZHT001,,205,스마트
EZ,사이즈라벨,EZ 회색 반접이 사이즈라벨,M,EZSL001,"4,486",35,SB라벨
EZ,사이즈라벨,EZ 회색 반접이 사이즈라벨,L,EZSL001,"4,341",35,SB라벨
EZ,사이즈라벨,EZ 회색 반접이 사이즈라벨,XL,EZSL001,"12,335",35,SB라벨
EZ,사이즈라벨,EZ 회색 반접이 사이즈라벨,2XL,EZSL001,"13,320",35,SB라벨
EZ,사이즈라벨,EZ 회색 양접이 사이즈라벨,M,EZSL002,"7,831",28,SB라벨
EZ,사이즈라벨,EZ 회색 양접이 사이즈라벨,L,EZSL002,"6,522",28,SB라벨
EZ,사이즈라벨,EZ 회색 양접이 사이즈라벨,XL,EZSL002,"2,325",28,SB라벨
EZ,사이즈라벨,EZ 회색 양접이 사이즈라벨,2XL,EZSL002,"7,425",28,SB라벨
EZ,사이즈라벨,EZ 블랙 영문 사이즈라벨,M,EZSL003,"4,904",42,SB라벨
EZ,사이즈라벨,EZ 블랙 영문 사이즈라벨,L,EZSL003,"2,756",42,SB라벨
EZ,사이즈라벨,EZ 블랙 영문 사이즈라벨,XL,EZSL003,"2,293",42,SB라벨
EZ,사이즈라벨,EZ 블랙 영문 사이즈라벨,2XL,EZSL003,"4,661",42,SB라벨
EZ,사이즈라벨,EZ 블랙 영문 사이즈라벨,3XL,EZSL003,"3,827",42,SB라벨
EZ,사이즈라벨,EZ 블랙 아우터 사이즈라벨,M,EZSL004,"3,482",49,SB라벨
EZ,사이즈라벨,EZ 블랙 아우터 사이즈라벨,L,EZSL004,"1,581",49,SB라벨
EZ,사이즈라벨,EZ 블랙 아우터 사이즈라벨,XL,EZSL004,"2,818",49,SB라벨
EZ,사이즈라벨,EZ 블랙 아우터 사이즈라벨,2XL,EZSL004,"1,771",49,SB라벨
EZ,사이즈라벨,EZ 블랙 숫자 사이즈라벨,28,EZSL005,"5,530",42,SB라벨
EZ,사이즈라벨,EZ 블랙 숫자 사이즈라벨,30,EZSL005,"3,885",42,SB라벨
EZ,사이즈라벨,EZ 블랙 숫자 사이즈라벨,32,EZSL005,"4,992",42,SB라벨
EZ,사이즈라벨,EZ 블랙 숫자 사이즈라벨,34,EZSL005,"4,215",42,SB라벨
EZ,사이즈라벨,EZ 블랙 숫자 사이즈라벨,36,EZSL005,"4,756",42,SB라벨
EZ,사이즈라벨,EZ 블랙 숫자 사이즈라벨,38,EZSL005,"4,303",42,SB라벨
EZ,사이즈라벨,EZ 블랙 숫자 사이즈라벨,40,EZSL005,"5,135",42,SB라벨
EZ,와끼라벨,EZ 네이비 꼬마라벨,one size,EZSPL01,-,,SB라벨
EZ,와끼라벨,EZ 회색 반접이 라벨,one size,EZSPL02,"4,934",26,SB라벨
EZ,포인트라벨,EZ 크림 양접이 라벨,one size,EZPL001,-,27,SB라벨
EZ,포인트라벨,EZ 블랙 양접이 라벨,one size,EZPL002,"1,924",20,SB라벨
FP,행택,FP 메인 행택,one size,FPHT001,,105,스마트
FP,행택,FP 더블코튼행택,one size,FPHT002,,85,스마트
FP,행택,FP 실켓 솔리드 행택,one size,FPHT003,,280,스마트
FP,행택,FP 헤비 행택,one size,FPHT004,,180,스마트
FP,행택,FP 노블 행택,one size,FPHT005,,180,스마트
FP,행택,FP 디버스 행택,one size,FPHT006,,75,스마트
FP,행택,FP 러기드 배럴 워싱 행택,one size,FPHT007,,80,스마트
FP,스티커,16수 싱글 스티커,one size,FPST001,,28,스마트
FP,사이즈라벨,FP 오리지널 사이즈라벨,S,FPSL001,"5,553",32,SB라벨
FP,사이즈라벨,FP 오리지널 사이즈라벨,M,FPSL001,"1,199",32,SB라벨
FP,사이즈라벨,FP 오리지널 사이즈라벨,L,FPSL001,"1,925",32,SB라벨
FP,사이즈라벨,FP 오리지널 사이즈라벨,XL,FPSL001,"8,614",32,SB라벨
FP,사이즈라벨,FP 오리지널 사이즈라벨,2XL,FPSL001,"5,040",32,SB라벨
FP,사이즈라벨,FP 오리지널 사이즈라벨,3XL,FPSL001,"8,536",32,SB라벨
FP,사이즈라벨,FP 오리지널 사이즈라벨,4XL,FPSL001,"8,829",32,SB라벨
FP,사이즈라벨,FP 오리지널 루즈핏 사이즈라벨,M,FPSL002,"1,195",32,SB라벨
FP,사이즈라벨,FP 오리지널 루즈핏 사이즈라벨,L,FPSL002,"5,464",32,SB라벨
FP,사이즈라벨,FP 오리지널 루즈핏 사이즈라벨,XL,FPSL002,"5,726",32,SB라벨
FP,사이즈라벨,FP 오리지널 루즈핏 사이즈라벨,2XL,FPSL002,"3,565",32,SB라벨
FP,사이즈라벨,FP 오리지널 루즈핏 사이즈라벨,3XL,FPSL002,"2,690",32,SB라벨
FP,사이즈라벨,FP 베이지 영문 사이즈 라벨,S,FPSL003,"14,160",52,SB라벨
FP,사이즈라벨,FP 베이지 영문 사이즈 라벨,M,FPSL003,"10,824",52,SB라벨
FP,사이즈라벨,FP 베이지 영문 사이즈 라벨,L,FPSL003,"8,638",52,SB라벨
FP,사이즈라벨,FP 베이지 영문 사이즈 라벨,XL,FPSL003,"9,814",52,SB라벨
FP,사이즈라벨,FP 베이지 영문 사이즈 라벨,2XL,FPSL003,"13,561",52,SB라벨
FP,사이즈라벨,FP 베이지 영문 사이즈 라벨,3XL,FPSL003,"3,174",52,SB라벨
FP,사이즈라벨,FP 컷앤소 이면봉제 사이즈 라벨,M,FPSL004,"5,009",38,SB라벨
FP,사이즈라벨,FP 컷앤소 이면봉제 사이즈 라벨,L,FPSL004,822,38,SB라벨
FP,사이즈라벨,FP 컷앤소 이면봉제 사이즈 라벨,XL,FPSL004,"3,449",38,SB라벨
FP,사이즈라벨,FP 컷앤소 이면봉제 사이즈 라벨,2XL,FPSL004,"1,462",38,SB라벨
FP,사이즈라벨,FP 컷앤소 이면봉제 사이즈 라벨,3XL,FPSL004,"2,920",38,SB라벨
FP,사이즈라벨,FP 베이지 아우터 사이즈 라벨,M,FPSL005,"3,002",,SB라벨
FP,사이즈라벨,FP 베이지 아우터 사이즈 라벨,L,FPSL005,"3,068",,SB라벨
FP,사이즈라벨,FP 베이지 아우터 사이즈 라벨,XL,FPSL005,"3,652",,SB라벨
FP,사이즈라벨,FP 베이지 아우터 사이즈 라벨,2XL,FPSL005,"2,972",,SB라벨
FP,사이즈라벨,FP 베이지 아우터 사이즈 라벨,3XL,FPSL005,979,,SB라벨
FP,사이즈라벨,FP MTOR헤비 사이즈 라벨,M,FPSL006,"1,240",88,SB라벨
FP,사이즈라벨,FP MTOR헤비 사이즈 라벨,L,FPSL006,"1,967",88,SB라벨
FP,사이즈라벨,FP MTOR헤비 사이즈 라벨,XL,FPSL006,"3,195",88,SB라벨
FP,사이즈라벨,FP MTOR헤비 사이즈 라벨,2XL,FPSL006,"1,137",88,SB라벨
FP,사이즈라벨,FP MTOR헤비 사이즈 라벨,3XL,FPSL006,"2,460",88,SB라벨
FP,사이즈라벨,FP ORBT노블 사이즈 라벨,M,FPSL007,"1,345",88,SB라벨
FP,사이즈라벨,FP ORBT노블 사이즈 라벨,L,FPSL007,"3,074",88,SB라벨
FP,사이즈라벨,FP ORBT노블 사이즈 라벨,XL,FPSL007,"2,890",88,SB라벨
FP,사이즈라벨,FP ORBT노블 사이즈 라벨,2XL,FPSL007,"1,118",88,SB라벨
FP,사이즈라벨,FP ORBT노블 사이즈 라벨,3XL,FPSL007,"3,107",88,SB라벨
FP,사이즈라벨,FP 뉴웨이브 사이즈 라벨,M,FPSL008,518,90,SB라벨
FP,사이즈라벨,FP 뉴웨이브 사이즈 라벨,L,FPSL008,686,90,SB라벨
FP,사이즈라벨,FP 뉴웨이브 사이즈 라벨,XL,FPSL008,"1,446",90,SB라벨
FP,사이즈라벨,FP 뉴웨이브 사이즈 라벨,2XL,FPSL008,"1,045",90,SB라벨
FP,사이즈라벨,FP 뉴웨이브 사이즈 라벨,3XL,FPSL008,"2,528",90,SB라벨
FP,포인트라벨,FP 974꼬마 포인트 라벨,one size,FPPL001,,32,SB라벨
FP,포인트라벨,FP 포인트 라벨(블랙/아이보리),one size,FPPL002,"10,068",,SB라벨
FP,포인트라벨,FP 포인트 라벨(블랙/옐로우),one size,FPPL003,"11,048",,SB라벨
FP,포인트라벨,FP 미니가죽 라벨,one size,FPPL004,"1,512",,스마트
FP,포인트라벨,FP 아우터 포인트 라벨,one size,FPPL005,"3,806",,SB라벨
공용,사이즈라벨,숫자 사이즈 라벨 / made in korea,28,ALLSL001,"3,462",,SB라벨
공용,사이즈라벨,숫자 사이즈 라벨 / made in korea,30,ALLSL001,"4,193",,SB라벨
공용,사이즈라벨,숫자 사이즈 라벨 / made in korea,32,ALLSL001,"2,219",,SB라벨
공용,사이즈라벨,숫자 사이즈 라벨 / made in korea,34,ALLSL001,"5,889",,SB라벨
공용,사이즈라벨,숫자 사이즈 라벨 / made in korea,36,ALLSL001,"3,847",,SB라벨
공용,사이즈라벨,숫자 사이즈 라벨 / made in korea,38,ALLSL001,"3,051",,SB라벨
공용,사이즈라벨,숫자 사이즈 라벨 / made in korea,40,ALLSL001,"1,365",,SB라벨
공용,행택,가먼트행택,one size,ALLHT001,,43,스마트
공용,행택,ykk 행택,one size,ALLHT002,,20,YKK
공용,폴리백,공용 폴리백,아우터,ALLPB001,,155,스마트
공용,케어라벨,공용 케어라벨,one size,ALLKL001,,29,스마트`;

const initialLabels = parseCSV(csvRawData);

const initialProducts = [
  {
    id: 1,
    brand: 'WV',
    name: '24SS 오버핏 후드티',
    bom: [
      { labelId: 1, qtyPerUnit: 1 },
      { labelId: 9, qtyPerUnit: 1 },
      { labelId: 7, qtyPerUnit: 1 }
    ]
  }
];

// 데이터 버전 (CSV 데이터 업데이트 시 증가)
const DATA_VERSION = 2;

export default function App({ user }) {
  const [activeTab, setActiveTab] = useState('inventory');
  const [lowStockExpanded, setLowStockExpanded] = useState(false);
  const [navExpanded, setNavExpanded] = useState(true);
  const [labelPage, setLabelPage] = useState(1);
  const [labelPageSize, setLabelPageSize] = useState(30);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserName, setCurrentUserName] = useState('');

  // Firestore에서 관리자 여부 + 사용자 이름 확인
  useEffect(() => {
    if (!user?.uid) return;
    getDoc(doc(db, 'users', user.uid)).then(snap => {
      if (snap.exists()) {
        setIsAdmin(!!snap.data().isAdmin);
        setCurrentUserName(snap.data().name || snap.data().displayName || user.displayName || '');
      }
    }).catch(() => {});
  }, [user?.uid]);

  const [labels, setLabels] = useState(() => {
    const savedVersion = localStorage.getItem('label_data_version');
    if (savedVersion === String(DATA_VERSION)) {
      const saved = localStorage.getItem('label_inventory');
      return saved ? JSON.parse(saved) : initialLabels;
    }
    localStorage.setItem('label_data_version', String(DATA_VERSION));
    return initialLabels;
  });

  const [products, setProducts] = useState(() => {
    const savedVersion = localStorage.getItem('label_data_version');
    let result;
    if (savedVersion === String(DATA_VERSION)) {
      const saved = localStorage.getItem('label_products');
      result = saved ? JSON.parse(saved) : initialProducts;
    } else {
      result = initialProducts;
    }
    // 마이그레이션: Firestore 덮어쓰기로 유실된 상품 BOM 복구 (1회만 실행)
    if (!localStorage.getItem('product_migration_v1')) {
      localStorage.setItem('product_migration_v1', '1');
      const recovered = [
        { id: 2000000001, brand: 'JM', name: '[JM] JM 로그 오버핏 기모 후드 YHHD2302',
          bom: [
            { labelId: 37, qtyPerUnit: 1 },
            { labelId: 40, qtyPerUnit: 1 },
            { labelId: 42, qtyPerUnit: 1 },
            { labelId: 43, qtyPerUnit: 1 },
            { labelId: 44, qtyPerUnit: 1 },
            { labelId: 45, qtyPerUnit: 1 },
            { labelId: 75, qtyPerUnit: 1 },
            { labelId: 177, qtyPerUnit: 1 },
          ]
        },
      ];
      recovered.forEach(rp => {
        if (!result.find(p => p.name === rp.name)) result = [...result, rp];
      });
      localStorage.setItem('label_products', JSON.stringify(result));
    }
    return result;
  });

  // localStorage 보유 여부 — 마운트 시 동기적으로 캡처 (effects보다 먼저 실행)
  const labelsWasInLS = useRef(!!localStorage.getItem('label_inventory'));
  const productsWasInLS = useRef(!!localStorage.getItem('label_products'));
  const ordersWasInLS = useRef(!!localStorage.getItem('label_saved_orders'));
  const logsWasInLS = useRef(!!localStorage.getItem('label_stock_logs'));

  // --- Labels 실시간 동기화 (onSnapshot) ---
  const labelsCanSave = useRef(false);
  const labelsLastWriteJson = useRef('');
  useEffect(() => {
    // 초기 로컬 데이터가 없으면 Firestore에서 먼저 로드
    if (!labelsWasInLS.current) {
      getDoc(doc(db, 'settings', 'labels')).then(snap => {
        if (snap.exists() && Array.isArray(snap.data().list) && snap.data().list.length > 0) {
          setLabels(snap.data().list);
          localStorage.setItem('label_inventory', JSON.stringify(snap.data().list));
        }
      }).catch(() => {}).finally(() => { labelsCanSave.current = true; });
    } else {
      // 로컬 데이터가 있으면 즉시 저장 가능
      labelsCanSave.current = true;
      // 최초 로컬 → Firestore 업로드
      const localRaw = localStorage.getItem('label_inventory');
      if (localRaw) {
        try { setDoc(doc(db, 'settings', 'labels'), { list: JSON.parse(localRaw) }).catch(() => {}); } catch(e) {}
      }
    }
    // 실시간 리스너: 다른 사용자의 변경만 반영 (내 쓰기는 hasPendingWrites로 스킵)
    const unsub = onSnapshot(doc(db, 'settings', 'labels'), { includeMetadataChanges: true }, (snap) => {
      if (!snap.exists() || snap.metadata.hasPendingWrites) return;
      const fsData = snap.data().list;
      if (!Array.isArray(fsData) || fsData.length === 0) return;
      const fsJson = JSON.stringify(fsData);
      if (fsJson === labelsLastWriteJson.current) return; // 내 쓰기 확정 스킵
      setLabels(fsData);
      localStorage.setItem('label_inventory', JSON.stringify(fsData));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    localStorage.setItem('label_inventory', JSON.stringify(labels));
    localStorage.setItem('label_data_version', String(DATA_VERSION));
    if (!labelsCanSave.current) return;
    try {
      const clean = JSON.parse(JSON.stringify(labels));
      labelsLastWriteJson.current = JSON.stringify(clean);
      setDoc(doc(db, 'settings', 'labels'), { list: clean }).catch(() => {});
    } catch(e) {}
  }, [labels]);

  // ── Products 저장 헬퍼: localStorage + Firestore + Firebase Storage 동시 저장 ──
  const saveProductsEverywhere = (data) => {
    try { localStorage.setItem('label_products', JSON.stringify(data)); } catch(e) {}
    try {
      const clean = JSON.parse(JSON.stringify(data));
      // Firestore 저장
      setDoc(doc(db, 'settings', 'products'), { list: clean, updatedAt: Date.now() }).catch(() => {});
      // Firebase Storage 백업 (products-backup.json)
      const jsonBlob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
      const backupRef = ref(storage, 'backups/products-backup.json');
      uploadBytes(backupRef, jsonBlob).catch(() => {});
    } catch(e) {}
  };

  // Products Firestore 동기화: 로컬과 Firestore를 BOM 단위로 안전하게 병합
  const firestoreLoaded = useRef(false);
  const productsCanSave = useRef(false);
  useEffect(() => {
    if (firestoreLoaded.current) return;
    firestoreLoaded.current = true;
    getDoc(doc(db, 'settings', 'products')).then(snap => {
      const localRaw = localStorage.getItem('label_products');
      const localData = localRaw ? JSON.parse(localRaw) : [];
      const fsData = (snap.exists() && Array.isArray(snap.data()?.list)) ? snap.data().list : [];

      // 로컬 데이터를 기준으로 Firestore 데이터와 BOM 병합
      // - 같은 id의 상품이 있으면: BOM 항목을 합집합으로 병합 (로컬 우선)
      // - 로컬에 없는 상품만 Firestore에서 추가
      const merged = localData.map(lp => {
        const fp = fsData.find(f => f.id === lp.id);
        if (!fp) return lp;
        // BOM 병합: 로컬 BOM + Firestore에만 있는 항목 추가
        const localBom = lp.bom || [];
        const fsBom = fp.bom || [];
        const mergedBom = [...localBom];
        fsBom.forEach(fb => {
          if (!mergedBom.find(lb => lb.labelId === fb.labelId)) mergedBom.push(fb);
        });
        // BOM 개수가 많은 쪽을 우선 사용하되 병합 결과 적용
        return { ...lp, bom: mergedBom };
      });
      // Firestore에만 있는 상품 추가
      fsData.forEach(fp => {
        if (!merged.find(m => m.id === fp.id)) merged.push(fp);
      });

      setProducts(merged);
      localStorage.setItem('label_products', JSON.stringify(merged));
      // 병합 결과를 Firestore + Storage에 저장
      try {
        const clean = JSON.parse(JSON.stringify(merged));
        setDoc(doc(db, 'settings', 'products'), { list: clean, updatedAt: Date.now() }).catch(() => {});
        const jsonBlob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
        uploadBytes(ref(storage, 'backups/products-backup.json'), jsonBlob).catch(() => {});
      } catch(e) {}
    }).catch(() => {}).finally(() => { productsCanSave.current = true; });
  }, []);

  // products 변경 시 localStorage + Firestore + Storage에 즉시 저장
  useEffect(() => {
    if (!productsCanSave.current) {
      // Firestore 로드 전이라도 localStorage에는 저장
      try { localStorage.setItem('label_products', JSON.stringify(products)); } catch(e) {}
      return;
    }
    saveProductsEverywhere(products);
  }, [products]);

  // 이미지 미리보기 모달 상태
  const [previewImg, setPreviewImg] = useState(null);

  // 드롭다운 메뉴 & 수정 모달 상태
  const [openMenuId, setOpenMenuId] = useState(null);
  const [editLabel, setEditLabel] = useState(null);
  const [labelLogModal, setLabelLogModal] = useState(null); // 라벨 로그 모달 (label 객체)
  const [selectedLabelIds, setSelectedLabelIds] = useState(new Set());
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [bulkEditFields, setBulkEditFields] = useState({ vendor: '', type: '', brand: '' });
  const [csvImportPending, setCsvImportPending] = useState(null);

  const startEdit = (label) => {
    setEditLabel({ ...label });
    setOpenMenuId(null);
  };

  const saveEdit = () => {
    if (!editLabel.name || !editLabel.code) return alert('라벨명과 품번은 필수입니다.');
    const original = labels.find(l => l.id === editLabel.id);
    const fieldLabels = { brand: '브랜드', type: '종류', name: '라벨명', code: '품번', size: '사이즈', stock: '현재고', safetyStock: '안전재고', reserveStock: '최소보유수량', price: '단가', vendor: '공급처' };
    const changes = Object.keys(fieldLabels).filter(k => original && String(original[k] ?? '') !== String(editLabel[k] ?? '')).map(k => ({ field: fieldLabels[k], before: original[k], after: editLabel[k] }));
    setLabels(prev => prev.map(l => l.id === editLabel.id ? { ...editLabel } : l));
    if (changes.length > 0) addLog({ type: 'edit', labelId: editLabel.id, labelName: editLabel.name, labelCode: editLabel.code, changes, summary: `라벨 수정: ${editLabel.name} (${editLabel.code})` });
    setEditLabel(null);
  };

  const addToLabelImageFolder = (labelName, url, file, labelCode) => {
    const ext = (file?.name || 'jpg').split('.').pop();
    const baseName = labelCode ? `${labelName} ${labelCode}` : (labelName || '라벨이미지');
    const docEntry = {
      id: Date.now() + Math.random(),
      name: `${baseName}.${ext}`,
      storageName: '',
      url,
      size: file?.size || 0,
      ext,
      category: '라벨이미지',
      uploadedAt: new Date().toISOString(),
      memo: '',
    };
    setDocuments(prev => [docEntry, ...prev.filter(d => !(d.category === '라벨이미지' && d.name === docEntry.name && d.id !== docEntry.id))]);
  };

  const handleEditImageUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const url = await uploadToStorage(file);
      setEditLabel(prev => {
        addToLabelImageFolder(prev.name, url, file, prev.code);
        return { ...prev, img: url };
      });
    }
  };

  // 브랜드 필터 & 검색 상태
  const [brandFilter, setBrandFilter] = useState('전체');
  const [vendorFilter, setVendorFilter] = useState('전체');
  const [typeFilter, setTypeFilter] = useState('전체');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const fixedBrands = ['공용', 'WV', 'JM', 'EZ', 'FP'];
  const dynamicBrands = [...new Set(labels.map(l => l.brand).filter(Boolean))].filter(b => !fixedBrands.includes(b)).sort();
  const brandList = ['전체', ...fixedBrands, ...dynamicBrands];
  const vendorList = ['전체', ...[...new Set(labels.map(l => l.vendor).filter(Boolean))].sort()];

  const executeSearch = () => { setSearchQuery(searchInput); setLabelPage(1); };

  const typeList = ['전체', ...[...new Set(labels.map(l => l.type).filter(Boolean))].sort()];
  const filteredLabels = labels.filter(l => {
    const brandMatch = brandFilter === '전체' || l.brand === brandFilter;
    const vendorMatch = vendorFilter === '전체' || l.vendor === vendorFilter;
    const typeMatch = typeFilter === '전체' || l.type === typeFilter;
    if (!searchQuery.trim()) return brandMatch && vendorMatch && typeMatch;
    const q = searchQuery.trim().toLowerCase();
    return brandMatch && vendorMatch && typeMatch && (
      l.name.toLowerCase().includes(q) ||
      l.code.toLowerCase().includes(q) ||
      l.type.toLowerCase().includes(q) ||
      l.vendor.toLowerCase().includes(q) ||
      l.size.toLowerCase().includes(q)
    );
  });

  const labelTotalPages = Math.ceil(filteredLabels.length / labelPageSize);
  const pagedLabels = filteredLabels.slice((labelPage - 1) * labelPageSize, labelPage * labelPageSize);

  // --- [1] 라벨 마스터 관련 함수 ---
  const [newLabel, setNewLabel] = useState({ brand: 'WV', type: '행택', name: '', size: '', code: '', stock: 0, safetyStock: 0, reserveStock: 0, price: 0, vendor: '', img: '' });
  const [showAddLabelModal, setShowAddLabelModal] = useState(false);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const url = await uploadToStorage(file);
      setNewLabel(prev => ({ ...prev, img: url, _imgFile: file }));
    }
  };

  // CSV 대량 업로드 핸들러
  const syncLabelImages = () => {
    const imagesDocs = documents.filter(d => d.category === '라벨이미지' && d.url);

    // 인덱스 미리 구성
    const docByExact = {};
    const docByCode = {};
    const docByBaseCode = {};

    imagesDocs.forEach(d => {
      const noExt = d.name.replace(/\.[^.]+$/, '').trim().toLowerCase();
      docByExact[noExt] = d;
      const tokens = noExt.split(/[\s_]+/).filter(Boolean);
      tokens.forEach(token => {
        if (!docByCode[token]) docByCode[token] = [];
        docByCode[token].push(d);
        const base = token.replace(/-?\d+$/, '');
        if (base && base !== token) {
          if (!docByBaseCode[base]) docByBaseCode[base] = [];
          docByBaseCode[base].push(d);
        }
      });
    });

    // labels 직접 map → setLabels에 결과 배열 전달 (카운터 정확히 집계)
    const codeUsed = {};
    let matched = 0;
    const updatedLabels = labels.map(label => {
      const key = `${label.name} ${label.code}`.toLowerCase();
      const code = label.code.toLowerCase();
      const baseCode = code.replace(/-?\d+$/, '');

      if (docByExact[key] && !codeUsed[docByExact[key].id]) {
        codeUsed[docByExact[key].id] = true; matched++;
        return { ...label, img: docByExact[key].url };
      }
      const exactDocs = (docByCode[code] || []).filter(d => !codeUsed[d.id]);
      if (exactDocs.length > 0) {
        codeUsed[exactDocs[0].id] = true; matched++;
        return { ...label, img: exactDocs[0].url };
      }
      const baseDocs = (docByBaseCode[baseCode] || []).filter(d => !codeUsed[d.id]);
      if (baseDocs.length > 0) {
        codeUsed[baseDocs[0].id] = true; matched++;
        return { ...label, img: baseDocs[0].url };
      }
      return label;
    });

    setLabels(updatedLabels);
    if (matched > 0) addLog({ type: 'image_sync', count: matched, summary: `이미지 자동 매핑: ${matched}개 라벨에 이미지 연결` });
    alert(`라벨이미지 폴더에서 ${matched}개 라벨에 이미지가 매핑되었습니다.`);
  };

  const downloadCSVTemplate = () => {
    const escape = (v) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = '브랜드,종류,라벨명,품번,사이즈,현재고,안전재고,최소보유수량,단가,공급처';
    const rows = labels.map(l => [
      l.brand, l.type, l.name, l.code, l.size,
      l.stock ?? 0, l.safetyStock ?? 0, l.reserveStock ?? 0, l.price ?? 0, l.vendor ?? ''
    ].map(escape).join(','));
    const bom = '\uFEFF';
    const blob = new Blob([bom + header + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `라벨_재고리스트_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 현재고는 항상 덮어쓰기, 나머지는 비어있을 때만 채우기
  const CSV_ALWAYS_UPDATE = ['stock'];
  const CSV_FILL_EMPTY = ['brand', 'type', 'size', 'price', 'vendor'];
  const CSV_FIELD_LABEL = { brand: '브랜드', type: '종류', size: '사이즈', stock: '현재고', safetyStock: '안전재고', reserveStock: '최소보유수량', price: '단가', vendor: '공급처' };

  const handleCSVUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        alert('유효한 데이터가 없습니다. CSV 형식을 확인해주세요.\n\n필수 컬럼: 브랜드, 종류, 라벨명, 품번, 사이즈, 재고수량, 안전재고, 단가, 공급처');
        return;
      }

      const isEmpty = (v) => v === undefined || v === null || v === '' || v === 0;
      const newLabels = [];
      const duplicateUpdates = [];

      parsed.forEach((p, idx) => {
        const existing = labels.find(l => l.name === p.name && l.code === p.code);
        if (!existing) {
          newLabels.push({ ...p, id: Date.now() + idx });
        } else {
          const fieldsToFill = {};
          // 현재고: CSV 값이 현재와 다르면 항상 업데이트
          CSV_ALWAYS_UPDATE.forEach(field => {
            if (p[field] !== undefined && p[field] !== existing[field]) {
              fieldsToFill[field] = p[field];
            }
          });
          // 나머지: 기존이 비어있을 때만 채우기
          CSV_FILL_EMPTY.forEach(field => {
            if (isEmpty(existing[field]) && !isEmpty(p[field])) {
              fieldsToFill[field] = p[field];
            }
          });
          if (Object.keys(fieldsToFill).length > 0) {
            duplicateUpdates.push({ existing, fieldsToFill });
          }
        }
      });

      const duplicateCount = parsed.length - newLabels.length;
      if (newLabels.length === 0 && duplicateUpdates.length === 0) {
        alert(`${parsed.length}개 데이터 확인 완료.\n모든 데이터가 이미 등록되어 있으며 업데이트할 항목이 없습니다.`);
        return;
      }

      setCsvImportPending({ file, newLabels, duplicateUpdates, total: parsed.length, duplicateCount });
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const applyCSVImport = () => {
    if (!csvImportPending) return;
    const { file, newLabels, duplicateUpdates, total } = csvImportPending;
    setLabels(prev => {
      const updated = prev.map(l => {
        const upd = duplicateUpdates.find(u => u.existing.id === l.id);
        return upd ? { ...l, ...upd.fieldsToFill } : l;
      });
      return [...updated, ...newLabels];
    });
    addLog({
      type: 'csv_import',
      count: newLabels.length,
      fileName: file.name,
      summary: `CSV 가져오기: ${file.name} (신규 ${newLabels.length}개, 업데이트 ${duplicateUpdates.length}개)`,
      newItems: newLabels.map(l => ({ name: l.name, code: l.code, brand: l.brand, type: l.type, size: l.size })),
      updatedItems: duplicateUpdates.map(u => ({
        name: u.existing.name,
        code: u.existing.code,
        changes: Object.entries(u.fieldsToFill).map(([f, v]) => ({ field: CSV_FIELD_LABEL[f] || f, after: v, before: u.existing[f] })),
      })),
    });
    const csvDoc = {
      id: Date.now() + Math.random(),
      name: file.name, storageName: '', url: '', size: file.size,
      ext: 'csv', category: '재고리스트', uploadedAt: new Date().toISOString(), memo: '',
    };
    setDocuments(prev => [csvDoc, ...prev.filter(d => !(d.category === '재고리스트' && d.name === file.name))]);
    setCsvImportPending(null);
    alert(`완료: 신규 ${newLabels.length}개 등록, 기존 ${duplicateUpdates.length}개 업데이트 (총 ${total}개 처리)`);
  };

  const addLabel = () => {
    if (!newLabel.name || !newLabel.code) return alert('라벨명과 품번은 필수입니다.');
    if (newLabel.img && newLabel._imgFile) addToLabelImageFolder(newLabel.name, newLabel.img, newLabel._imgFile, newLabel.code);
    const { _imgFile, ...labelData } = newLabel;
    setLabels([{ ...labelData, id: Date.now() }, ...labels]);
    addLog({ type: 'add', labelName: newLabel.name, labelCode: newLabel.code, labelBrand: newLabel.brand, summary: `라벨 신규 등록: ${newLabel.name} (${newLabel.code})` });
    setNewLabel({ brand: 'WV', type: '행택', name: '', size: '', code: '', stock: 0, safetyStock: 0, reserveStock: 0, price: 0, vendor: '', img: '' });
    setShowAddLabelModal(false);
  };

  const deleteLabel = (id) => {
    if (window.confirm('정말 삭제하시겠습니까?')) {
      const label = labels.find(l => l.id === id);
      setLabels(prev => prev.filter(l => l.id !== id));
      if (label) addLog({ type: 'delete', labelId: id, labelName: label.name, labelCode: label.code, labelBrand: label.brand, summary: `라벨 삭제: ${label.name} (${label.code})` });
      setProducts(prev => prev.map(p => ({
        ...p,
        bom: p.bom.filter(b => b.labelId !== id)
      })));
      setSelectedProduct(prev => prev ? { ...prev, bom: prev.bom.filter(b => b.labelId !== id) } : null);
    }
  };

  // --- [2] 상품 BOM 관리 함수 ---
  const [newProductBrand, setNewProductBrand] = useState('WV');
  const [newProductName, setNewProductName] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [bomSelection, setBomSelection] = useState({ labelIds: [], qty: 1 });
  const [openProductMenuId, setOpenProductMenuId] = useState(null);
  const [editProduct, setEditProduct] = useState(null);
  const [bomSaved, setBomSaved] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [bomBrandFilter, setBomBrandFilter] = useState('auto');
  const [bomTypeFilter, setBomTypeFilter] = useState('전체');
  const [bomSearchInput, setBomSearchInput] = useState('');
  const [bomSearchQuery, setBomSearchQuery] = useState('');
  const [productSearch, setProductSearch] = useState('');

  const startEditProduct = (product) => {
    setEditProduct({ ...product });
    setOpenProductMenuId(null);
  };

  const saveEditProduct = () => {
    if (!editProduct.name) return alert('상품명은 필수입니다.');
    const original = products.find(p => p.id === editProduct.id);
    const productFieldLabels = { brand: '브랜드', name: '상품명' };
    const changes = Object.keys(productFieldLabels).filter(k => original && String(original[k] ?? '') !== String(editProduct[k] ?? '')).map(k => ({ field: productFieldLabels[k], before: original[k], after: editProduct[k] }));
    setProducts(prev => prev.map(p => p.id === editProduct.id ? { ...editProduct } : p));
    if (selectedProduct?.id === editProduct.id) {
      setSelectedProduct(editProduct);
    }
    if (changes.length > 0) addLog({ type: 'product_edit', productName: editProduct.name, productBrand: editProduct.brand, changes, summary: `상품 수정: ${editProduct.name}` });
    setEditProduct(null);
  };

  const addProduct = () => {
    if (!newProductName) return;
    const newProd = { id: Date.now(), brand: newProductBrand, name: newProductName, bom: [] };
    setProducts([...products, newProd]);
    addLog({ type: 'product_add', productName: newProductName, productBrand: newProductBrand, bomCount: 0, summary: `상품 등록: ${newProductName} (${newProductBrand})` });
    setNewProductBrand('WV');
    setNewProductName('');
    setSelectedProduct(newProd);
  };

  const deleteProduct = (id) => {
    if (window.confirm('상품을 삭제하시겠습니까?')) {
      const prod = products.find(p => p.id === id);
      setProducts(products.filter(p => p.id !== id));
      if (prod) addLog({ type: 'product_delete', productName: prod.name, productBrand: prod.brand, bomCount: prod.bom?.length || 0, summary: `상품 삭제: ${prod.name} (${prod.brand})` });
      if (selectedProduct?.id === id) {
        setSelectedProduct(null);
      }
    }
  };

  const addLabelToBom = () => {
    if (!selectedProduct || bomSelection.labelIds.length === 0) return;
    const addedLabelIds = bomSelection.labelIds.map(lid => parseInt(lid)).filter(id => !selectedProduct.bom.find(b => b.labelId === id));
    const updatedProducts = products.map(p => {
      if (p.id === selectedProduct.id) {
        let newBom = [...p.bom];
        bomSelection.labelIds.forEach(lid => {
          const id = parseInt(lid);
          if (!newBom.find(b => b.labelId === id)) {
            newBom.push({ labelId: id, qtyPerUnit: parseInt(bomSelection.qty) });
          }
        });
        return { ...p, bom: newBom };
      }
      return p;
    });
    setProducts(updatedProducts);
    setSelectedProduct(updatedProducts.find(p => p.id === selectedProduct.id));
    // 즉시 저장 (타이밍 문제 방지)
    saveProductsEverywhere(updatedProducts);
    if (addedLabelIds.length > 0) {
      const addedLabelNames = addedLabelIds.map(id => { const l = labels.find(lb => lb.id === id); return l ? `${l.name} (${l.size || '-'})` : String(id); });
      addLog({ type: 'bom_add', productName: selectedProduct.name, labelNames: addedLabelNames, qty: parseInt(bomSelection.qty), summary: `BOM 라벨 추가: ${selectedProduct.name} +${addedLabelIds.length}종` });
    }
    setBomSelection({ ...bomSelection, labelIds: [] });
  };

  const removeLabelFromBom = (prodId, labelId) => {
    const prod = products.find(p => p.id === prodId);
    const removedLabel = labels.find(l => l.id === labelId);
    const updatedProducts = products.map(p => {
      if (p.id === prodId) {
        return { ...p, bom: p.bom.filter(b => b.labelId !== labelId) };
      }
      return p;
    });
    setProducts(updatedProducts);
    saveProductsEverywhere(updatedProducts);
    if (prod && removedLabel) {
      addLog({ type: 'bom_remove', productName: prod.name, labelNames: [`${removedLabel.name} (${removedLabel.size || '-'})`], summary: `BOM 라벨 제거: ${prod.name} - ${removedLabel.name}` });
    }
    if (selectedProduct && selectedProduct.id === prodId) {
      setSelectedProduct(updatedProducts.find(p => p.id === prodId));
    }
  };

  const dropBomItem = (prodId, fromIdx, toIdx) => {
    if (fromIdx === toIdx) return;
    const updatedProducts = products.map(p => {
      if (p.id === prodId) {
        const newBom = [...p.bom];
        const [moved] = newBom.splice(fromIdx, 1);
        newBom.splice(toIdx, 0, moved);
        return { ...p, bom: newBom };
      }
      return p;
    });
    setProducts(updatedProducts);
    saveProductsEverywhere(updatedProducts);
    if (selectedProduct && selectedProduct.id === prodId) {
      setSelectedProduct(updatedProducts.find(p => p.id === prodId));
    }
  };

  const updateBomItemInfo = (prodId, labelId, field, value) => {
    const updatedProducts = products.map(p => {
      if (p.id === prodId) {
        return { ...p, bom: p.bom.map(b => {
          if (b.labelId === labelId) {
            return { ...b, careInfo: { ...(b.careInfo || {}), [field]: value } };
          }
          return b;
        })};
      }
      return p;
    });
    setProducts(updatedProducts);
    if (selectedProduct && selectedProduct.id === prodId) {
      setSelectedProduct(updatedProducts.find(p => p.id === prodId));
    }
  };

  // --- 발주 저장 리스트 ---
  const [savedOrders, setSavedOrders] = useState(() => {
    const saved = localStorage.getItem('label_saved_orders');
    return saved ? JSON.parse(saved) : [];
  });
  const [viewOrder, setViewOrder] = useState(null);
  const [viewOrderEditMode, setViewOrderEditMode] = useState(false);
  const [viewOrderEdits, setViewOrderEdits] = useState({});
  const [openOrderMenuId, setOpenOrderMenuId] = useState(null);
  const [orderMenuPos, setOrderMenuPos] = useState({ top: 0, left: 0 });

  const applyOrderToStock = async (order) => {
    if (order.applied) { alert('이미 발주 확정된 내역입니다.'); return; }
    const orderItems = (order.details || []).filter(d => d.shortage > 0);
    if (orderItems.length === 0) { alert('발주 수량이 없습니다.'); return; }
    const confirmMsg = `발주 확정 시 재고에서 다음 수량이 차감됩니다:\n${orderItems.map(d => `• ${d.labelName || d.name} (${d.size}): ${d.shortage.toLocaleString()}개`).join('\n')}\n\n진행하시겠습니까?`;
    if (!window.confirm(confirmMsg)) return;
    const appliedAt = new Date().toLocaleString('ko-KR');
    const _uid = user?.email ? user.email.split('@')[0] : '';
    const _name = currentUserName || user?.displayName || '';
    try {
      // runTransaction: 동시 접속 시 재고 이중 차감 방지 (원자적 처리)
      let logItems = [];
      await runTransaction(db, async (tx) => {
        const ordersSnap = await tx.get(doc(db, 'settings', 'savedOrders'));
        const labelsSnap = await tx.get(doc(db, 'settings', 'labels'));
        const fsOrders = ordersSnap.data()?.list || [];
        const fsLabels = labelsSnap.data()?.list || [];

        // ── 로컬 데이터를 기준으로 병합 (Firestore에 없는 항목 보존) ──
        const localOrders = JSON.parse(localStorage.getItem('label_saved_orders') || '[]');
        const mergedOrders = [...localOrders];
        fsOrders.forEach(fo => {
          const idx = mergedOrders.findIndex(o => o.id === fo.id);
          if (idx === -1) mergedOrders.push(fo);
          else mergedOrders[idx] = { ...fo, ...mergedOrders[idx],
            applied: mergedOrders[idx].applied || fo.applied,
            appliedAt: mergedOrders[idx].appliedAt || fo.appliedAt };
        });

        const localLabels = JSON.parse(localStorage.getItem('label_inventory') || '[]');
        const mergedLabels = localLabels.map(ll => {
          const fl = fsLabels.find(f => f.id === ll.id);
          // Firestore stock이 더 최신 (다른 사용자가 차감했을 수 있음)
          return fl ? { ...ll, stock: fl.stock } : ll;
        });
        fsLabels.forEach(fl => { if (!mergedLabels.find(l => l.id === fl.id)) mergedLabels.push(fl); });

        // 이미 다른 사용자가 확정했는지 체크
        const targetOrder = mergedOrders.find(o => o.id === order.id);
        if (targetOrder?.applied) throw new Error('already_applied');

        // 재고 차감
        logItems = orderItems.map(d => {
          const lbl = mergedLabels.find(l => l.id === d.id);
          const before = lbl ? lbl.stock : 0;
          return { labelId: d.id, labelName: d.labelName || d.name, size: d.size, before, change: -d.shortage, after: before - d.shortage };
        });
        const updatedLabels = mergedLabels.map(lbl => {
          const matched = orderItems.find(d => d.id === lbl.id);
          return matched ? { ...lbl, stock: lbl.stock - matched.shortage } : lbl;
        });
        const updatedOrders = mergedOrders.map(o => o.id === order.id ? { ...o, applied: true, appliedAt } : o);
        tx.set(doc(db, 'settings', 'labels'), { list: updatedLabels });
        tx.set(doc(db, 'settings', 'savedOrders'), { list: updatedOrders });
      });
      // 트랜잭션 성공 → 로컬 상태 업데이트
      setLabels(prev => prev.map(lbl => {
        const matched = orderItems.find(d => d.id === lbl.id);
        return matched ? { ...lbl, stock: lbl.stock - matched.shortage } : lbl;
      }));
      setSavedOrders(prev => prev.map(o => o.id === order.id ? { ...o, applied: true, appliedAt } : o));
      if (viewOrder?.id === order.id) setViewOrder(prev => ({ ...prev, applied: true, appliedAt }));
      setStockLogs(prev => [{ id: Date.now(), date: new Date().toLocaleString('ko-KR'), type: 'deduct', orderId: order.id, productName: order.productName || '(미선택)', factory: order.factory || '-', items: logItems, userId: _uid, userName: _name }, ...prev]);
      alert('발주가 확정되었습니다. 재고에서 발주 수량이 차감되었습니다.');
    } catch(e) {
      if (e.message === 'already_applied') alert('이미 다른 사용자가 발주 확정했습니다. 새로고침 후 확인하세요.');
      else alert('발주 확정 중 오류가 발생했습니다: ' + e.message);
    }
  };

  const cancelOrderFromStock = async (order) => {
    if (!order.applied) return;
    const orderItems = (order.details || []).filter(d => d.shortage > 0);
    if (!window.confirm(`발주 확정을 취소하시겠습니까?\n차감된 재고 수량이 원복됩니다.`)) return;
    const _restoreUid = user?.email ? user.email.split('@')[0] : '';
    const _restoreName = currentUserName || user?.displayName || '';
    try {
      let logItems = [];
      await runTransaction(db, async (tx) => {
        const ordersSnap = await tx.get(doc(db, 'settings', 'savedOrders'));
        const labelsSnap = await tx.get(doc(db, 'settings', 'labels'));
        const fsOrders = ordersSnap.data()?.list || [];
        const fsLabels = labelsSnap.data()?.list || [];

        // 로컬 + Firestore 병합
        const localOrders = JSON.parse(localStorage.getItem('label_saved_orders') || '[]');
        const mergedOrders = [...localOrders];
        fsOrders.forEach(fo => {
          const idx = mergedOrders.findIndex(o => o.id === fo.id);
          if (idx === -1) mergedOrders.push(fo);
          else mergedOrders[idx] = { ...fo, ...mergedOrders[idx],
            applied: mergedOrders[idx].applied || fo.applied,
            appliedAt: mergedOrders[idx].appliedAt || fo.appliedAt };
        });

        const localLabels = JSON.parse(localStorage.getItem('label_inventory') || '[]');
        const mergedLabels = localLabels.map(ll => {
          const fl = fsLabels.find(f => f.id === ll.id);
          return fl ? { ...ll, stock: fl.stock } : ll;
        });
        fsLabels.forEach(fl => { if (!mergedLabels.find(l => l.id === fl.id)) mergedLabels.push(fl); });

        // 이미 취소됐는지 체크
        const targetOrder = mergedOrders.find(o => o.id === order.id);
        if (targetOrder && !targetOrder.applied) throw new Error('already_cancelled');

        logItems = orderItems.map(d => {
          const lbl = mergedLabels.find(l => l.id === d.id);
          const before = lbl ? lbl.stock : 0;
          return { labelId: d.id, labelName: d.labelName || d.name, size: d.size, before, change: +d.shortage, after: before + d.shortage };
        });
        const updatedLabels = mergedLabels.map(lbl => {
          const matched = orderItems.find(d => d.id === lbl.id);
          return matched ? { ...lbl, stock: lbl.stock + matched.shortage } : lbl;
        });
        const updatedOrders = mergedOrders.map(o => o.id === order.id ? { ...o, applied: false, appliedAt: null } : o);
        tx.set(doc(db, 'settings', 'labels'), { list: updatedLabels });
        tx.set(doc(db, 'settings', 'savedOrders'), { list: updatedOrders });
      });
      // 트랜잭션 성공 → 로컬 상태 업데이트
      setLabels(prev => prev.map(label => {
        const matched = orderItems.find(d => d.id === label.id);
        return matched ? { ...label, stock: label.stock + matched.shortage } : label;
      }));
      setSavedOrders(prev => prev.map(o => o.id === order.id ? { ...o, applied: false, appliedAt: null } : o));
      if (viewOrder?.id === order.id) {
        setViewOrder(prev => ({ ...prev, applied: false, appliedAt: null }));
      }
      setStockLogs(prev => [{ id: Date.now(), date: new Date().toLocaleString('ko-KR'), type: 'restore', orderId: order.id, productName: order.productName || '(미선택)', factory: order.factory || '-', items: logItems, userId: _restoreUid, userName: _restoreName }, ...prev]);
      alert('발주 확정이 취소되었습니다. 재고가 원복되었습니다.');
    } catch(e) {
      if (e.message === 'already_cancelled') alert('이미 취소된 발주입니다. 새로고침 후 확인하세요.');
      else alert('취소 처리 중 오류가 발생했습니다: ' + e.message);
    }
  };

  // --- SavedOrders 실시간 동기화 (onSnapshot) ---
  const ordersCanSave = useRef(false);
  const ordersLastWriteJson = useRef('');
  useEffect(() => {
    const localRaw = localStorage.getItem('label_saved_orders');
    const localData = localRaw ? JSON.parse(localRaw) : [];

    // 초기 병합 (로컬 + Firestore)
    getDoc(doc(db, 'settings', 'savedOrders')).then(snap => {
      const fsData = (snap.exists() && Array.isArray(snap.data()?.list)) ? snap.data().list : [];
      const merged = [...localData];
      fsData.forEach(fo => {
        const idx = merged.findIndex(m => m.id === fo.id);
        if (idx === -1) { merged.push(fo); }
        else {
          merged[idx] = { ...fo, ...merged[idx],
            applied: merged[idx].applied || fo.applied,
            appliedAt: merged[idx].appliedAt || fo.appliedAt };
        }
      });
      setSavedOrders(merged);
      localStorage.setItem('label_saved_orders', JSON.stringify(merged));
      const clean = JSON.parse(JSON.stringify(merged));
      ordersLastWriteJson.current = JSON.stringify(clean);
      setDoc(doc(db, 'settings', 'savedOrders'), { list: clean }).catch(() => {});
    }).catch(() => {}).finally(() => { ordersCanSave.current = true; });

    // 실시간 리스너: 다른 사용자의 발주 확정/취소를 즉시 반영
    const unsub = onSnapshot(doc(db, 'settings', 'savedOrders'), { includeMetadataChanges: true }, (snap) => {
      if (!snap.exists() || snap.metadata.hasPendingWrites) return;
      const fsData = snap.data().list;
      if (!Array.isArray(fsData)) return;
      const fsJson = JSON.stringify(fsData);
      if (fsJson === ordersLastWriteJson.current) return; // 내 쓰기 확정 스킵
      // 외부 변경 병합: applied:true 는 절대 false로 되돌리지 않음
      setSavedOrders(prev => {
        let changed = false;
        const merged = prev.map(lo => {
          const fo = fsData.find(f => f.id === lo.id);
          if (!fo) return lo;
          const newApplied = lo.applied || fo.applied;
          const newAppliedAt = lo.appliedAt || fo.appliedAt;
          if (JSON.stringify({ ...fo, applied: newApplied, appliedAt: newAppliedAt }) !== JSON.stringify(lo)) {
            changed = true;
            return { ...fo, applied: newApplied, appliedAt: newAppliedAt };
          }
          return lo;
        });
        fsData.forEach(fo => { if (!merged.find(m => m.id === fo.id)) { merged.push(fo); changed = true; } });
        if (changed) localStorage.setItem('label_saved_orders', JSON.stringify(merged));
        return changed ? merged : prev;
      });
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    try { localStorage.setItem('label_saved_orders', JSON.stringify(savedOrders)); } catch(e) {}
    if (!ordersCanSave.current) return;
    try {
      const cleanData = JSON.parse(JSON.stringify(savedOrders));
      ordersLastWriteJson.current = JSON.stringify(cleanData);
      setDoc(doc(db, 'settings', 'savedOrders'), { list: cleanData }).catch(() => {});
    } catch(e) {}
  }, [savedOrders]);

  // --- 재고 변동 로그 ---
  const [logSearch, setLogSearch] = useState('');
  const [expandedLogs, setExpandedLogs] = useState(new Set());
  const toggleLog = (id) => setExpandedLogs(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const [logPage, setLogPage] = useState(1);
  const [logPageSize, setLogPageSize] = useState(30);
  const [stockLogs, setStockLogs] = useState(() => {
    const saved = localStorage.getItem('label_stock_logs');
    return saved ? JSON.parse(saved) : [];
  });
  const logsCanSave = useRef(false);
  const firestoreLogsLoaded = useRef(false);
  useEffect(() => {
    if (firestoreLogsLoaded.current) return;
    firestoreLogsLoaded.current = true;
    getDoc(doc(db, 'settings', 'stockLogs')).then(snap => {
      if (snap.exists() && Array.isArray(snap.data().list) && snap.data().list.length > 0) {
        const data = snap.data().list;
        setStockLogs(data);
        localStorage.setItem('label_stock_logs', JSON.stringify(data));
      } else if (logsWasInLS.current) {
        try {
          const clean = JSON.parse(JSON.stringify(stockLogs));
          setDoc(doc(db, 'settings', 'stockLogs'), { list: clean }).catch(() => {});
        } catch(e) {}
      }
    }).catch(() => {}).finally(() => { logsCanSave.current = true; });
  }, []);
  useEffect(() => {
    try { localStorage.setItem('label_stock_logs', JSON.stringify(stockLogs)); } catch(e) {}
    if (!logsCanSave.current) return;
    try {
      const cleanData = JSON.parse(JSON.stringify(stockLogs));
      setDoc(doc(db, 'settings', 'stockLogs'), { list: cleanData }).catch(() => {});
    } catch(e) {}
  }, [stockLogs]);

  const addLog = (entry) => {
    const uid = user?.email ? user.email.split('@')[0] : '';
    const userName = currentUserName || user?.displayName || '';
    setStockLogs(prev => [{ id: Date.now() + Math.random(), date: new Date().toLocaleString('ko-KR'), userId: uid, userName, ...entry }, ...prev]);
  };
  const safetyStockPrev = useRef({});

  // --- 자료실 ---
  const [documents, setDocuments] = useState(() => {
    const saved = localStorage.getItem('label_documents');
    return saved ? JSON.parse(saved) : [];
  });
  const docsCanSave = useRef(false);
  const firestoreDocsLoaded = useRef(false);
  useEffect(() => {
    if (firestoreDocsLoaded.current) return;
    firestoreDocsLoaded.current = true;
    getDoc(doc(db, 'settings', 'documents')).then(snap => {
      if (snap.exists() && Array.isArray(snap.data().list)) {
        const data = snap.data().list;
        setDocuments(data);
        localStorage.setItem('label_documents', JSON.stringify(data));
      } else if (!!localStorage.getItem('label_documents')) {
        try {
          const clean = JSON.parse(JSON.stringify(documents));
          setDoc(doc(db, 'settings', 'documents'), { list: clean }).catch(() => {});
        } catch(e) {}
      }
    }).catch(() => {}).finally(() => { docsCanSave.current = true; });
  }, []);
  useEffect(() => {
    try { localStorage.setItem('label_documents', JSON.stringify(documents)); } catch(e) {}
    if (!docsCanSave.current) return;
    try {
      setDoc(doc(db, 'settings', 'documents'), { list: JSON.parse(JSON.stringify(documents)) }).catch(() => {});
    } catch(e) {}
  }, [documents]);

  const [docActiveFolder, setDocActiveFolder] = useState(null); // null = 폴더 목록, '라벨이미지'|'재고리스트'|'재고로그'
  const [docSearch, setDocSearch] = useState('');
  const [docImageBrandFilter, setDocImageBrandFilter] = useState('전체');
  const [docUploading, setDocUploading] = useState(false);

  const DOC_FOLDERS = [
    { id: '라벨이미지', label: '라벨이미지', icon: ImageIcon, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200', activeBg: 'bg-purple-600' },
    { id: '재고리스트', label: '재고리스트', icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', activeBg: 'bg-blue-600' },
    { id: '재고로그', label: '재고로그', icon: History, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', activeBg: 'bg-green-600' },
    ...(isAdmin ? [{ id: '계정관리', label: '계정 관리', icon: Users, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200', activeBg: 'bg-violet-600', adminOnly: true }] : []),
  ];

  const getFileIcon = (ext) => {
    const e = (ext || '').toLowerCase();
    if (['pdf'].includes(e)) return <FileText size={20} className="text-red-500" />;
    if (['xls','xlsx','csv'].includes(e)) return <FileText size={20} className="text-green-600" />;
    if (['doc','docx'].includes(e)) return <FileText size={20} className="text-blue-600" />;
    if (['jpg','jpeg','png','gif','webp'].includes(e)) return <ImageIcon size={20} className="text-purple-500" />;
    return <File size={20} className="text-slate-400" />;
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes/1024).toFixed(1)}KB`;
    return `${(bytes/1024/1024).toFixed(1)}MB`;
  };

  const handleDocUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setDocUploading(true);
    try {
      for (const file of files) {
        const ext = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const storageRef = ref(storage, `documents/${fileName}`);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        const newDoc = {
          id: Date.now() + Math.random(),
          name: file.name,
          storageName: fileName,
          url,
          size: file.size,
          ext,
          category: docActiveFolder || '라벨이미지',
          uploadedAt: new Date().toISOString(),
          memo: '',
        };
        setDocuments(prev => [newDoc, ...prev]);
      }
    } catch(err) {
      alert('업로드 중 오류가 발생했습니다.');
    }
    setDocUploading(false);
    e.target.value = '';
  };

  const deleteDocument = async (docItem) => {
    if (!window.confirm(`"${docItem.name}" 을(를) 삭제하시겠습니까?`)) return;
    try {
      const storageRef = ref(storage, `documents/${docItem.storageName}`);
      await deleteObject(storageRef).catch(() => {});
    } catch(e) {}
    setDocuments(prev => prev.filter(d => d.id !== docItem.id));
  };

  const getDocLabelBrand = (doc) => {
    const matched = labels.find(l => l.img === doc.url);
    if (matched?.brand) return matched.brand;
    const nameNoExt = doc.name.replace(/\.[^.]+$/, '');
    const firstWord = nameNoExt.split(/\s+/)[0];
    const allBrands = [...new Set(labels.map(l => l.brand).filter(Boolean))];
    return allBrands.includes(firstWord) ? firstWord : null;
  };
  const labelImgBrands = ['전체', ...new Set(
    documents.filter(d => d.category === '라벨이미지').map(getDocLabelBrand).filter(Boolean)
  )];
  const filteredDocs = documents.filter(d => {
    const catMatch = !docActiveFolder || d.category === docActiveFolder;
    const searchMatch = !docSearch.trim() || d.name.toLowerCase().includes(docSearch.toLowerCase());
    const brandMatch = docActiveFolder !== '라벨이미지' || docImageBrandFilter === '전체' || getDocLabelBrand(d) === docImageBrandFilter;
    return catMatch && searchMatch && brandMatch;
  });

  const filteredStockLogs = (() => {
    const q = logSearch.trim().toLowerCase();
    if (!q) return stockLogs;
    return stockLogs.filter(log =>
      (log.summary || '').toLowerCase().includes(q) ||
      (log.productName || '').toLowerCase().includes(q) ||
      (log.factory || '').toLowerCase().includes(q) ||
      (log.labelName || '').toLowerCase().includes(q) ||
      (log.items || []).some(item => (item.labelName || '').toLowerCase().includes(q))
    );
  })();
  const logTotalPages = Math.max(1, Math.ceil(filteredStockLogs.length / logPageSize));
  const pagedStockLogs = filteredStockLogs.slice((logPage - 1) * logPageSize, logPage * logPageSize);

  // --- [3] 발주 계산기 함수 ---
  const [calcTarget, setCalcTarget] = useState('');
  const [calcSearchText, setCalcSearchText] = useState('');
  const [calcSearchOpen, setCalcSearchOpen] = useState(false);
  const calcSearchRef = useRef(null);
  const [calcColorText, setCalcColorText] = useState('블랙, 그레이');
  const [calcSizeText, setCalcSizeText] = useState('M, L, XL, 2XL');
  const [calcQtyGrid, setCalcQtyGrid] = useState({});
  const [calcResult, setCalcResult] = useState(null);
  const [calcLabelPopup, setCalcLabelPopup] = useState(null);
  const [pdfPreview, setPdfPreview] = useState(null); // { url, filename }
  const [pdfLoading, setPdfLoading] = useState(false);
  const [calcFactory, setCalcFactory] = useState('');
  const [calcOrderer, setCalcOrderer] = useState('');
  const [calcOrdererMode, setCalcOrdererMode] = useState('select');
  const ORDERER_LIST = ['천영균', '이형주', '장경환', '선호준', '양동준'];
  const [calcNote, setCalcNote] = useState('');
  const [calcMfgDate, setCalcMfgDate] = useState(() => `${new Date().getFullYear()}.`);
  const [calcRnNumber, setCalcRnNumber] = useState('');
  const [calcDaebongQty, setCalcDaebongQty] = useState('');
  const [calcDaebongType, setCalcDaebongType] = useState('');
  const DAEBONG_RATIO = { '반팔': 50, '후드': 20, '아우터': 15, '바지': 50 };
  const [calcRnMode, setCalcRnMode] = useState('select');
  const RN_LIST = [
    { rn: 'RN#1487', factory: '성진' }, { rn: 'RN#1633', factory: '동원' }, { rn: 'RN#2527', factory: 'JB(2DAY텍스)' },
    { rn: 'RN#3084', factory: 'KC' }, { rn: 'RN#5786', factory: '에스앤비' }, { rn: 'RN#6573', factory: '인앤코' },
    { rn: 'RN#9001', factory: '태원' }, { rn: 'RN#A630', factory: '고은사' }, { rn: 'RN#A710', factory: '실니트' },
    { rn: 'RN#A969', factory: '두성' }, { rn: 'RN#B523', factory: '이화사' }, { rn: 'RN#C202', factory: '다송사' },
    { rn: 'RN#C375', factory: '정한' }, { rn: 'RN#C450', factory: '서윤' }, { rn: 'RN#C825', factory: '다산' },
    { rn: 'RN#D160', factory: '로로팝' }, { rn: 'RN#D777', factory: '베스트' }, { rn: 'RN#D900', factory: '써머' },
    { rn: 'RN#DM157', factory: '동명' }, { rn: 'RN#E800', factory: '흥신' }, { rn: 'RN#E180', factory: '탱크' },
    { rn: 'RN#K-87', factory: '케이소싱' }, { rn: 'RN#CH001', factory: '이건(프로모션)' }, { rn: 'RN#CAP01', factory: '알에스비' },
    { rn: 'RN#DM159', factory: '에스에이알(동명)' },
  ];

  const calcColorList = calcColorText.split(',').map(s => s.trim()).filter(Boolean);
  const calcSizeList = calcSizeText.split(',').map(s => s.trim()).filter(Boolean);

  const getCalcQty = (color, size) => calcQtyGrid[`${color}_${size}`] || '';
  const setCalcQty = (color, size, value) => {
    setCalcQtyGrid(prev => ({ ...prev, [`${color}_${size}`]: value }));
    setCalcResult(null);
  };

  const getAllCalcRows = () => {
    const rows = [];
    calcColorList.forEach(c => calcSizeList.forEach(s => {
      const qty = parseInt(getCalcQty(c, s)) || 0;
      if (qty > 0) rows.push({ color: c, size: s, qty });
    }));
    return rows;
  };

  const calculateOrder = () => {
    if (!calcTarget) return alert('상품을 선택해주세요.');
    const validRows = getAllCalcRows();
    if (validRows.length === 0) return alert('수량을 1개 이상 입력해주세요.');
    const totalQty = validRows.reduce((sum, r) => sum + r.qty, 0);
    const product = products.find(p => p.id === parseInt(calcTarget));
    if (!product) return;
    let totalCost = 0;
    const daebongRatio = calcDaebongType ? DAEBONG_RATIO[calcDaebongType] : 0;
    const daebongCalcQty = daebongRatio > 0 ? Math.ceil(totalQty / daebongRatio) : 0;
    // 사이즈별 수량 합계 (예: M→170, L→170, ...)
    const sizeQtyMap = {};
    validRows.forEach(r => { sizeQtyMap[r.size] = (sizeQtyMap[r.size] || 0) + r.qty; });

    const details = product.bom.map(item => {
      const label = labels.find(l => l.id === item.labelId);
      if (!label) return null;
      const isDaebong = label.name.includes('대봉') || label.code?.includes('DAEBONG') || label.code?.includes('ALLBST');
      const isSizeSpecific = !isDaebong && label.size && label.size !== 'OS' && label.size !== 'FR' && label.size !== '소' && label.size !== '대';
      // 사이즈 전용 라벨인데 해당 사이즈 수량이 없으면 제외
      if (isSizeSpecific && sizeQtyMap[label.size] === undefined) return null;
      // 사이즈 전용 라벨은 해당 사이즈 합계만 사용, 그 외는 총합
      const effectiveQty = isSizeSpecific ? sizeQtyMap[label.size] : totalQty;
      const totalNeed = isDaebong && daebongCalcQty > 0 ? daebongCalcQty : item.qtyPerUnit * effectiveQty;
      const availableStock = Math.max(0, label.stock - (label.reserveStock ?? 0));
      const shortage = Math.max(0, totalNeed - availableStock);
      const cost = shortage * label.price;
      totalCost += cost;
      return { ...label, careInfo: item.careInfo, needQty: totalNeed, availableStock, shortage, cost };
    }).filter(Boolean);
    setCalcResult({ details, totalCost, totalQty, sizeBreakdown: validRows });
  };

  // ── PDF 발주서 생성 — html2canvas 방식 (한글 완벽 지원) ─────────────────
  const generateOrderPDF = async (resultDetails, vendorName = null) => {
    setPdfLoading(true);
    try {

      const todayStr = (() => {
        const d = new Date();
        return `${String(d.getFullYear()).slice(2)}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
      })();

      // 공급처별 그룹
      const groups = {};
      resultDetails.forEach(item => {
        const v = item.vendor || '(공급처 미입력)';
        if (!vendorName || v === vendorName) {
          if (!groups[v]) groups[v] = [];
          groups[v].push(item);
        }
      });

      // 이미지 → base64 (fetch 방식 - Firebase Storage CORS 우회)
      const loadImageBase64 = async (url) => {
        if (!url) return null;
        try {
          const res = await fetch(url);
          if (!res.ok) return null;
          const blob = await res.blob();
          return await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          });
        } catch (e) { return null; }
      };

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const PAGE_W = doc.internal.pageSize.width;   // 297mm
      const PAGE_H = doc.internal.pageSize.height;  // 210mm
      const MARGIN = 8;

      let isFirstPage = true;

      // 품번 앞자리(베이스) 추출: 'JMSL001-2' → 'JMSL001', 'JMHT001' → 'JMHT001'
      const getCodeBase = (code) => {
        if (!code) return '_no_code_';
        const m = code.match(/^(.*)-(\d+)$/);
        return m ? m[1] : code;
      };
      // 품번 범위 압축: ['JMSL001-2','JMSL001-3','JMSL001-4','JMSL001-5'] → 'JMSL001-2~5'
      const condenseCodeRange = (codes) => {
        const unique = [...new Set(codes.filter(Boolean))].sort();
        if (unique.length === 0) return '-';
        if (unique.length === 1) return unique[0];
        const first = unique[0];
        const last = unique[unique.length - 1];
        let i = 0;
        while (i < first.length && i < last.length && first[i] === last[i]) i++;
        if (i > 0 && i < first.length) {
          return `${first.substring(0, i)}${first.substring(i)}~${last.substring(i)}`;
        }
        return unique.join(', ');
      };

      for (const [vendor, items] of Object.entries(groups)) {
        // ── 그룹핑 키: 라벨명 + 품번 앞자리(베이스) ──
        const groupKey = (item) => item.name + '||' + getCodeBase(item.code);

        // ── 이미지 병렬 프리로드 (그룹 기준 중복 제거) ──
        const uniqueItems = [...new Map(items.map(item => [groupKey(item), item])).values()];
        const imgResults = await Promise.all(uniqueItems.map(item => item.img ? loadImageBase64(item.img) : Promise.resolve(null)));
        const imgCache = {};
        uniqueItems.forEach((item, i) => { imgCache[groupKey(item)] = imgResults[i]; });

        // ── 품번 앞자리 동일 → 한 그룹으로 묶기 ──
        const nameGroupMap = new Map();
        items.forEach(item => {
          const key = groupKey(item);
          if (!nameGroupMap.has(key)) nameGroupMap.set(key, []);
          nameGroupMap.get(key).push(item);
        });

        // ── HTML 테이블 구성 ──
        const cellStyle = `border:1px solid #ccc; padding:6px 8px; vertical-align:middle; font-size:11px; word-break:break-word;`;
        const centerCell = cellStyle + 'text-align:center;';

        let tbodyHtml = '';
        for (const [key, groupItems] of nameGroupMap.entries()) {
          const n = groupItems.length;
          const first = groupItems[0];
          const isCare = first.type === '케어라벨';
          const imgB64 = imgCache[key] || null;
          const codeRange = condenseCodeRange(groupItems.map(item => item.code));
          const rowBg = isCare ? 'background:#ffff00;' : '';

          let labelHtml = `<strong>${first.name}</strong>`;
          if (isCare) {
            const parts = [];
            if (first.careInfo?.code)     parts.push(`품번: ${first.careInfo.code}`);
            if (first.careInfo?.material) parts.push(`소재: ${first.careInfo.material}`);
            if (calcMfgDate)              parts.push(`제조년월: ${calcMfgDate}`);
            if (calcRnNumber)             parts.push(`RN#: ${calcRnNumber}`);
            if (parts.length) labelHtml += '<br><span style="font-size:10px">' + parts.join('<br>') + '</span>';
          }

          const imgHtml = imgB64
            ? `<img src="${imgB64}" style="max-width:60px;max-height:60px;object-fit:contain;display:block;margin:auto"/>`
            : '';

          groupItems.forEach((item, idx) => {
            const qty = item.shortage > 0 ? item.shortage : item.needQty;
            if (idx === 0) {
              tbodyHtml += `<tr style="${rowBg}">
                <td rowspan="${n}" style="${centerCell}">${todayStr}</td>
                <td rowspan="${n}" style="${centerCell}">${calcOrderer || '-'}</td>
                <td rowspan="${n}" style="${centerCell}">${calcFactory || '-'}</td>
                <td rowspan="${n}" style="${cellStyle}">${labelHtml}</td>
                <td rowspan="${n}" style="${centerCell}">${codeRange}</td>
                <td rowspan="${n}" style="${centerCell}padding:4px;">${imgHtml}</td>
                <td rowspan="${n}" style="${cellStyle}font-size:10px;">${calcSearchText || '-'}</td>
                <td style="${centerCell}font-weight:bold;">${item.size || 'FR'}</td>
                <td style="${centerCell}font-weight:bold;">${qty.toLocaleString()}개</td>
                <td rowspan="${n}" style="${cellStyle}${isCare ? 'background:#ffff00;' : ''}">${calcNote || ''}</td>
              </tr>`;
            } else {
              tbodyHtml += `<tr style="${rowBg}">
                <td style="${centerCell}font-weight:bold;">${item.size || 'FR'}</td>
                <td style="${centerCell}font-weight:bold;">${qty.toLocaleString()}개</td>
              </tr>`;
            }
          });
        }

        const html = `<div style="font-family:'맑은 고딕','Malgun Gothic','Apple SD Gothic Neo','나눔고딕',sans-serif;background:white;padding:16px;width:1100px;">
          <h2 style="text-align:center;font-size:22px;margin:0 0 12px;font-weight:bold;">${vendor} 발주서</h2>
          <table style="border-collapse:collapse;width:100%;table-layout:fixed;">
            <colgroup>
              <col style="width:70px"/><col style="width:60px"/><col style="width:70px"/>
              <col style="width:140px"/><col style="width:85px"/><col style="width:80px"/>
              <col style="width:200px"/><col style="width:45px"/><col style="width:65px"/>
              <col style="width:115px"/>
            </colgroup>
            <thead>
              <tr style="background:#333;color:white;font-size:12px;">
                <th style="padding:8px;text-align:center;border:1px solid #555;">작성일</th>
                <th style="padding:8px;text-align:center;border:1px solid #555;">발주</th>
                <th style="padding:8px;text-align:center;border:1px solid #555;">입고처</th>
                <th style="padding:8px;text-align:center;border:1px solid #555;">아이템</th>
                <th style="padding:8px;text-align:center;border:1px solid #555;">품번</th>
                <th style="padding:8px;text-align:center;border:1px solid #555;">이미지</th>
                <th style="padding:8px;text-align:center;border:1px solid #555;">품명/품번</th>
                <th style="padding:8px;text-align:center;border:1px solid #555;">size</th>
                <th style="padding:8px;text-align:center;border:1px solid #555;">수량</th>
                <th style="padding:8px;text-align:center;border:1px solid #555;">비고</th>
              </tr>
            </thead>
            <tbody>${tbodyHtml}</tbody>
          </table>
        </div>`;

        // DOM에 임시 삽입 후 이미지 로드 완료 대기 → 캡처
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'position:fixed;top:-99999px;left:-99999px;z-index:-1;';
        wrapper.innerHTML = html;
        document.body.appendChild(wrapper);

        // 모든 img 태그 로드 완료 대기
        const imgEls = Array.from(wrapper.querySelectorAll('img'));
        await Promise.all(imgEls.map(img =>
          img.complete
            ? Promise.resolve()
            : new Promise(res => { img.onload = res; img.onerror = res; })
        ));

        const canvas = await html2canvas(wrapper.firstChild, {
          scale: 1,
          useCORS: false,
          allowTaint: false,
          logging: false,
          backgroundColor: '#ffffff',
          imageTimeout: 0,
        });
        document.body.removeChild(wrapper);

        // ── 캔버스를 페이지 높이 단위로 잘라서 PDF에 추가 ──
        const contentW = PAGE_W - MARGIN * 2;
        const contentH = PAGE_H - MARGIN * 2;
        const pxPerMm = canvas.width / contentW;
        const pageCanvasPx = contentH * pxPerMm;
        let yPx = 0;

        while (yPx < canvas.height) {
          if (!isFirstPage) doc.addPage();
          isFirstPage = false;

          const sliceH = Math.min(pageCanvasPx, canvas.height - yPx);
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = sliceH;
          sliceCanvas.getContext('2d').drawImage(canvas, 0, -yPx);

          const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.75);
          const displayH = sliceH / pxPerMm;
          doc.addImage(sliceData, 'JPEG', MARGIN, MARGIN, contentW, displayH);
          yPx += pageCanvasPx;
        }
      }

      // 품번: 상품명/품번 입력값에서 품번 부분만 추출 (공백 기준 마지막 단어)
      const productCode = (() => {
        const text = (calcSearchText || '').trim();
        if (!text) return '';
        const parts = text.split(/\s+/);
        return parts[parts.length - 1];
      })();
      const factory = (calcFactory || '').trim();
      const filenameParts = [todayStr, productCode, factory].filter(Boolean);
      const filename = `${filenameParts.join('_')}.pdf`;
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      setPdfPreview({ url, filename });
    } catch(e) { alert('PDF 생성 중 오류가 발생했습니다: ' + e.message); console.error(e); }
    finally { setPdfLoading(false); }
  };

  const logTypeConfig = {
    deduct:       { border: 'border-orange-200', bg: 'bg-orange-50/40',  badge: 'bg-orange-100 text-orange-700',   label: '📦 발주 확정 (재고 차감)' },
    restore:      { border: 'border-blue-200',   bg: 'bg-blue-50/40',    badge: 'bg-blue-100 text-blue-700',       label: '↩ 확정 취소 (재고 원복)' },
    add:          { border: 'border-green-200',  bg: 'bg-green-50/40',   badge: 'bg-green-100 text-green-700',     label: '➕ 라벨 신규 등록' },
    delete:       { border: 'border-red-200',    bg: 'bg-red-50/40',     badge: 'bg-red-100 text-red-700',         label: '🗑 라벨 삭제' },
    edit:         { border: 'border-violet-200', bg: 'bg-violet-50/40',  badge: 'bg-violet-100 text-violet-700',   label: '✏️ 라벨 수정' },
    bulk_delete:  { border: 'border-red-200',    bg: 'bg-red-50/40',     badge: 'bg-red-100 text-red-700',         label: '🗑 일괄 삭제' },
    bulk_edit:    { border: 'border-violet-200', bg: 'bg-violet-50/40',  badge: 'bg-violet-100 text-violet-700',   label: '✏️ 일괄 수정' },
    csv_import:   { border: 'border-teal-200',   bg: 'bg-teal-50/40',    badge: 'bg-teal-100 text-teal-700',       label: '📄 CSV 가져오기' },
    safety_stock: { border: 'border-amber-200',  bg: 'bg-amber-50/40',   badge: 'bg-amber-100 text-amber-700',     label: '🔒 안전재고 변경' },
    image_update: { border: 'border-sky-200',    bg: 'bg-sky-50/40',     badge: 'bg-sky-100 text-sky-700',         label: '🖼 이미지 업데이트' },
    image_sync:   { border: 'border-sky-200',    bg: 'bg-sky-50/40',     badge: 'bg-sky-100 text-sky-700',         label: '🔄 이미지 자동 매핑' },
    order_save:   { border: 'border-emerald-200',bg: 'bg-emerald-50/40', badge: 'bg-emerald-100 text-emerald-700', label: '💾 발주 저장' },
    order_delete: { border: 'border-red-200',    bg: 'bg-red-50/40',     badge: 'bg-red-100 text-red-700',         label: '🗑 발주 삭제' },
    order_delete_all: { border: 'border-red-200',bg: 'bg-red-50/40',     badge: 'bg-red-100 text-red-700',         label: '🗑 발주 전체 삭제' },
    order_edit:   { border: 'border-violet-200', bg: 'bg-violet-50/40',  badge: 'bg-violet-100 text-violet-700',   label: '✏️ 발주 수정' },
    product_add:  { border: 'border-green-200',  bg: 'bg-green-50/40',   badge: 'bg-green-100 text-green-700',     label: '➕ 상품 등록' },
    product_delete:{ border: 'border-red-200',   bg: 'bg-red-50/40',     badge: 'bg-red-100 text-red-700',         label: '🗑 상품 삭제' },
    product_edit: { border: 'border-violet-200', bg: 'bg-violet-50/40',  badge: 'bg-violet-100 text-violet-700',   label: '✏️ 상품 수정' },
    bom_add:      { border: 'border-indigo-200', bg: 'bg-indigo-50/40',  badge: 'bg-indigo-100 text-indigo-700',   label: '🔗 BOM 라벨 추가' },
    bom_remove:   { border: 'border-rose-200',   bg: 'bg-rose-50/40',    badge: 'bg-rose-100 text-rose-700',       label: '✂️ BOM 라벨 제거' },
  };
  const renderLogCard = (log) => {
    const c = logTypeConfig[log.type] || { border: 'border-slate-200', bg: 'bg-slate-50/40', badge: 'bg-slate-100 text-slate-700', label: log.type };
    const isOpen = expandedLogs.has(log.id);
    // 상세 내용이 있는 타입인지 판단
    const hasDetail = (
      ((log.type === 'deduct' || log.type === 'restore') && log.items?.length > 0) ||
      (log.type === 'edit' && log.changes?.length > 0) ||
      (log.type === 'bulk_delete' && log.labelNames?.length > 0) ||
      (log.type === 'bulk_edit' && log.fields) ||
      log.type === 'safety_stock' ||
      (log.type === 'csv_import' && log.fileName) ||
      log.type === 'image_sync' ||
      log.type === 'image_update' ||
      (log.type === 'order_save' || log.type === 'order_delete') ||
      log.type === 'order_delete_all' ||
      (log.type === 'order_edit' && log.changes?.length > 0) ||
      (log.type === 'product_add' || log.type === 'product_delete') ||
      (log.type === 'product_edit' && log.changes?.length > 0) ||
      (log.type === 'bom_add' || log.type === 'bom_remove')
    );
    return (
      <div key={log.id} className={`rounded-xl border ${c.border} ${c.bg} overflow-hidden`}>
        {/* 아코디언 헤더 */}
        <div
          className={`flex items-center justify-between px-4 py-3 flex-wrap gap-2 ${hasDetail ? 'cursor-pointer hover:brightness-95 transition-all select-none' : ''}`}
          onClick={() => hasDetail && toggleLog(log.id)}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${c.badge}`}>{c.label}</span>
            <span className="text-sm font-semibold text-slate-700">{log.summary || log.productName || log.labelName}</span>
            {log.factory && log.factory !== '-' && <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{log.factory}</span>}
          </div>
          <div className="flex items-center gap-3">
            {(log.userId || log.userName) && (
              <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                {log.userName ? `${log.userName}` : ''}{log.userId && log.userName ? ` (${log.userId})` : log.userId}
              </span>
            )}
            <span className="text-xs text-slate-400 whitespace-nowrap">{log.date}</span>
            {hasDetail && (
              <span className="text-slate-400 transition-transform duration-200" style={{ display:'inline-block', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                ▼
              </span>
            )}
          </div>
        </div>
        {/* 아코디언 바디 — 펼쳤을 때만 표시 */}
        {isOpen && <div className="px-4 pb-4 border-t border-white/60">
        {(log.type === 'deduct' || log.type === 'restore') && log.items?.length > 0 && (
          <div className="overflow-x-auto mt-1">
            <table className="w-full text-xs">
              <thead><tr className="text-slate-400 border-b border-slate-200">
                <th className="text-left pb-1.5 font-medium">라벨명</th>
                <th className="text-center pb-1.5 font-medium">사이즈</th>
                <th className="text-right pb-1.5 font-medium">변경 전</th>
                <th className="text-center pb-1.5 font-medium">변동량</th>
                <th className="text-right pb-1.5 font-medium">변경 후</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {(log.items || []).map((item, i) => (
                  <tr key={i} className="hover:bg-white/60">
                    <td className="py-1.5 text-slate-700 font-medium pr-4">{item.labelName}</td>
                    <td className="py-1.5 text-center text-slate-500">{item.size}</td>
                    <td className="py-1.5 text-right text-slate-500">{item.before?.toLocaleString()}</td>
                    <td className="py-1.5 text-center font-bold">
                      <span className={item.change < 0 ? 'text-red-500' : 'text-blue-500'}>{item.change > 0 ? '+' : ''}{item.change?.toLocaleString()}</span>
                    </td>
                    <td className="py-1.5 text-right font-semibold text-slate-800">{item.after?.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {log.type === 'edit' && log.changes?.length > 0 && (
          <div className="mt-2 space-y-1 pl-1">
            {log.changes.map((ch, i) => (
              <div key={i} className="text-xs flex items-center gap-2">
                <span className="text-slate-400 w-16 shrink-0">{ch.field}</span>
                <span className="text-red-400 line-through">{String(ch.before)}</span>
                <span className="text-slate-300">→</span>
                <span className="text-blue-500">{String(ch.after)}</span>
              </div>
            ))}
          </div>
        )}
        {log.type === 'bulk_delete' && log.labelNames?.length > 0 && (
          <div className="mt-2 text-xs text-slate-500 pl-1">{log.labelNames.join(', ')}</div>
        )}
        {log.type === 'bulk_edit' && log.fields && (
          <div className="mt-2 pl-1 space-y-0.5">
            {log.fields.brand && <div className="text-xs text-slate-500">브랜드 → <span className="text-blue-500 font-medium">{log.fields.brand}</span></div>}
            {log.fields.type && <div className="text-xs text-slate-500">종류 → <span className="text-blue-500 font-medium">{log.fields.type}</span></div>}
            {log.fields.vendor && <div className="text-xs text-slate-500">공급처 → <span className="text-blue-500 font-medium">{log.fields.vendor}</span></div>}
          </div>
        )}
        {log.type === 'safety_stock' && (
          <div className="mt-2 text-xs text-slate-500 pl-1">
            {log.labelName} ({log.labelCode}): <span className="text-red-400">{log.before}</span> → <span className="text-blue-500 font-medium">{log.after}</span>
          </div>
        )}
        {log.type === 'csv_import' && log.fileName && (
          <div className="mt-2 space-y-2 pl-1">
            <div className="text-xs text-slate-400">{log.fileName}</div>
            {log.newItems?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-green-700 mb-1">➕ 신규 등록 {log.newItems.length}개</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-slate-400 border-b border-slate-100">
                      <th className="text-left pb-1 font-medium pr-3">라벨명</th>
                      <th className="text-left pb-1 font-medium pr-3">품번</th>
                      <th className="text-left pb-1 font-medium pr-3">브랜드</th>
                      <th className="text-left pb-1 font-medium pr-3">종류</th>
                      <th className="text-left pb-1 font-medium">사이즈</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-50">
                      {log.newItems.map((item, i) => (
                        <tr key={i}>
                          <td className="py-1 text-slate-700 pr-3">{item.name}</td>
                          <td className="py-1 text-slate-500 pr-3">{item.code}</td>
                          <td className="py-1 text-slate-500 pr-3">{item.brand}</td>
                          <td className="py-1 text-slate-500 pr-3">{item.type}</td>
                          <td className="py-1 text-slate-500">{item.size}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {log.updatedItems?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-amber-700 mb-1">✏️ 업데이트 {log.updatedItems.length}개</p>
                <div className="space-y-1">
                  {log.updatedItems.map((item, i) => (
                    <div key={i} className="text-xs bg-amber-50 border border-amber-100 rounded px-2 py-1.5">
                      <span className="font-medium text-slate-700">{item.name} ({item.code})</span>
                      <div className="mt-0.5 space-y-0.5">
                        {item.changes.map((ch, j) => (
                          <div key={j} className="flex items-center gap-1.5">
                            <span className="text-slate-400 w-14 shrink-0">{ch.field}</span>
                            <span className="text-red-400 line-through">{String(ch.before ?? '(없음)')}</span>
                            <span className="text-slate-300">→</span>
                            <span className="text-blue-500 font-medium">{String(ch.after)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {log.type === 'image_sync' && (
          <div className="mt-2 text-xs text-slate-500 pl-1">{log.count}개 라벨에 이미지 연결</div>
        )}
        {log.type === 'image_update' && (
          <div className="mt-2 text-xs text-slate-500 pl-1">{log.labelName} ({log.labelCode})</div>
        )}
        {(log.type === 'order_save' || log.type === 'order_delete') && (
          <div className="mt-2 text-xs text-slate-500 pl-1 space-y-0.5">
            {log.factory && log.factory !== '-' && <div>공장: <span className="text-slate-700 font-medium">{log.factory}</span></div>}
            {log.orderer && log.orderer !== '-' && <div>발주자: <span className="text-slate-700 font-medium">{log.orderer}</span></div>}
            {log.itemCount != null && <div>라벨 종류: <span className="text-slate-700 font-medium">{log.itemCount}종</span></div>}
            {log.totalCost != null && <div>발주 비용: <span className="text-slate-700 font-medium">{log.totalCost.toLocaleString()}원</span></div>}
          </div>
        )}
        {log.type === 'order_delete_all' && (
          <div className="mt-2 text-xs text-slate-500 pl-1">{log.count}건 전체 삭제</div>
        )}
        {log.type === 'order_edit' && log.changes?.length > 0 && (
          <div className="mt-2 space-y-1 pl-1">
            {log.changes.map((ch, i) => (
              <div key={i} className="text-xs flex items-center gap-2">
                <span className="text-slate-400 w-16 shrink-0">{ch.field}</span>
                <span className="text-red-400 line-through">{String(ch.before ?? '(없음)')}</span>
                <span className="text-slate-300">→</span>
                <span className="text-blue-500">{String(ch.after ?? '(없음)')}</span>
              </div>
            ))}
          </div>
        )}
        {(log.type === 'product_add' || log.type === 'product_delete') && (
          <div className="mt-2 text-xs text-slate-500 pl-1">
            {log.productBrand && <span className="mr-2">브랜드: <span className="text-slate-700 font-medium">{log.productBrand}</span></span>}
            {log.bomCount != null && <span>BOM: <span className="text-slate-700 font-medium">{log.bomCount}종</span></span>}
          </div>
        )}
        {log.type === 'product_edit' && log.changes?.length > 0 && (
          <div className="mt-2 space-y-1 pl-1">
            {log.changes.map((ch, i) => (
              <div key={i} className="text-xs flex items-center gap-2">
                <span className="text-slate-400 w-16 shrink-0">{ch.field}</span>
                <span className="text-red-400 line-through">{String(ch.before ?? '(없음)')}</span>
                <span className="text-slate-300">→</span>
                <span className="text-blue-500">{String(ch.after ?? '(없음)')}</span>
              </div>
            ))}
          </div>
        )}
        {(log.type === 'bom_add' || log.type === 'bom_remove') && (
          <div className="mt-2 text-xs text-slate-500 pl-1 space-y-0.5">
            <div>상품: <span className="text-slate-700 font-medium">{log.productName}</span></div>
            {log.labelNames?.length > 0 && <div>라벨: {log.labelNames.map((n, i) => <span key={i} className="inline-block bg-indigo-50 text-indigo-700 rounded px-1.5 py-0.5 mr-1 mb-0.5">{n}</span>)}</div>}
            {log.qty != null && <div>수량/단위: <span className="text-slate-700 font-medium">{log.qty}개</span></div>}
          </div>
        )}
        </div>}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex">

      {/* 왼쪽 사이드바 */}
      <aside className={`${navExpanded ? 'w-52' : 'w-14'} min-h-screen bg-white border-r border-slate-200 flex flex-col transition-all duration-200 shrink-0`} style={{position:'sticky',top:0,height:'100vh',overflowY:'auto'}}>
        <div className="p-3 border-b border-slate-100 flex items-center justify-between gap-1">
          {navExpanded ? (
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-slate-800 leading-tight">라벨 발주 시스템</h1>
              <p className="text-xs text-slate-400 mt-0.5">{labels.length}종 등록</p>
            </div>
          ) : (
            <Package size={18} className="text-blue-600 mx-auto" />
          )}
          <button onClick={() => setNavExpanded(v => !v)} className="flex items-center justify-center gap-0.5 p-1 text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors shrink-0">
            {navExpanded ? <><ChevronLeft size={13}/> 접기</> : <ChevronRight size={13}/>}
          </button>
        </div>
        <nav className="flex-1 py-2 px-2 space-y-0.5">
          {[
            { id:'inventory', label:'재고리스트', icon:<Package size={17}/>, color:'text-blue-700', bg:'bg-blue-50' },
            { id:'bom', label:'상품 세팅', icon:<Layers size={17}/>, color:'text-indigo-700', bg:'bg-indigo-50' },
            { id:'calc', label:'발주 계산기', icon:<Calculator size={17}/>, color:'text-emerald-700', bg:'bg-emerald-50' },
            { id:'orders', label:'저장리스트', icon:<ClipboardList size={17}/>, color:'text-orange-700', bg:'bg-orange-50', badge:savedOrders.filter(o => Date.now() - o.id < 3600000).length },
            { id:'docs', label:'자료실', icon:<FolderOpen size={17}/>, color:'text-teal-700', bg:'bg-teal-50', badge:documents.filter(d => Date.now() - new Date(d.uploadedAt).getTime() < 3600000).length },
          ].map(item => (
            <button key={item.id} onClick={() => setActiveTab(item.id)}
              className={`relative w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === item.id ? `${item.bg} ${item.color}` : 'text-slate-600 hover:bg-slate-100'}`}>
              <span className="shrink-0">{item.icon}</span>
              {navExpanded && <span className="truncate">{item.label}</span>}
              {navExpanded && item.badge > 0 && (
                <span className="ml-auto bg-slate-400 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">{item.badge > 99 ? '99+' : item.badge}</span>
              )}
            </button>
          ))}
        </nav>

        {/* 사용자 정보 + 로그아웃 */}
        <div className={`border-t border-slate-100 p-2 ${navExpanded ? '' : 'flex justify-center'}`}>
          {navExpanded ? (
            <div className="flex items-center gap-2 px-2 py-2">
              <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center shrink-0 text-xs font-bold text-slate-600">
                {user?.email?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-700 truncate">{user?.email?.split('@')[0] || ''}</p>
                <button onClick={() => signOut(auth)} className="text-xs text-slate-400 hover:text-red-500 transition-colors">로그아웃</button>
              </div>
            </div>
          ) : (
            <button onClick={() => signOut(auth)} title="로그아웃" className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          )}
        </div>
      </aside>

      {/* 메인 컨텐츠 */}
      <div className="flex-1 min-w-0 p-6">
      <div className="w-full max-w-[1600px] mx-auto space-y-6">

        {/* [1] 라벨 마스터 탭 */}
        {activeTab === 'inventory' && (
          <>
          {(() => {
            const lowStockLabels = labels.filter(l => Number(l.safetyStock) > 0 && l.stock < Number(l.safetyStock));
            if (lowStockLabels.length === 0) return null;
            return (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-red-700 font-bold">
                    <AlertCircle size={18} /> 안전재고 미달 라벨 ({lowStockLabels.length}건)
                  </div>
                  <button onClick={() => setLowStockExpanded(v => !v)} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 px-2 py-1 rounded hover:bg-red-100 transition-colors">
                    {lowStockExpanded ? '▲ 숨기기' : '▼ 펼치기'}
                  </button>
                </div>
                {lowStockExpanded && (() => {
                  const vendorGroups = {};
                  lowStockLabels.forEach(l => {
                    const v = l.vendor || '(공급처 미입력)';
                    if (!vendorGroups[v]) vendorGroups[v] = [];
                    vendorGroups[v].push(l);
                  });
                  return (
                    <div className="mt-3 space-y-3">
                      {Object.entries(vendorGroups).sort(([a],[b]) => a.localeCompare(b)).map(([vendor, items]) => (
                        <div key={vendor}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">{vendor}</span>
                            <span className="text-xs text-red-400">{items.length}건</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                            {items.map(l => (
                              <div key={l.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 text-sm border border-red-100 cursor-pointer hover:bg-red-50 transition-colors"
                                onClick={() => { setActiveTab('inventory'); setSearchInput(l.name); setSearchQuery(l.name); setLabelPage(1); setBrandFilter('전체'); setVendorFilter('전체'); }}>
                                <span className="font-medium text-slate-700 hover:text-red-600 hover:underline">[{l.brand}] {l.name} <span className="text-slate-400">({l.size})</span></span>
                                <span className="text-red-600 font-bold ml-2">{l.stock} / {l.safetyStock}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            );
          })()}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-lg font-bold flex items-center gap-2"><Package className="text-blue-600" /> 라벨 재고 리스트 <span className="text-sm font-normal text-slate-400">({filteredLabels.length}종)</span></h2>
              <div className="flex items-center gap-3">
                {/* 검색 */}
                <div className="relative flex items-center gap-1">
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" value={searchInput} onChange={e => setSearchInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') executeSearch(); }} placeholder="라벨명, 품번 검색" className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                  </div>
                  <button onClick={executeSearch} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors">검색</button>
                  {searchQuery && <button onClick={() => { setSearchInput(''); setSearchQuery(''); }} className="px-2 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-600 text-xs font-medium rounded-lg transition-colors">초기화</button>}
                </div>
                {/* 브랜드 필터 */}
                <select value={brandFilter} onChange={e => { setBrandFilter(e.target.value); setLabelPage(1); }} className="px-2 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                  {brandList.map(b => <option key={b} value={b}>{b === '전체' ? '브랜드 전체' : b}</option>)}
                </select>
                {/* 종류 필터 */}
                <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setLabelPage(1); }} className="px-2 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                  {typeList.map(t => <option key={t} value={t}>{t === '전체' ? '종류 전체' : t}</option>)}
                </select>
                {/* 공급처 필터 */}
                <select value={vendorFilter} onChange={e => { setVendorFilter(e.target.value); setLabelPage(1); }} className="px-2 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  {vendorList.map(v => <option key={v} value={v}>{v === '전체' ? '공급처 전체' : v}</option>)}
                </select>
                {/* 신규 라벨 추가 버튼 */}
                <button onClick={() => setShowAddLabelModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors">
                  <Plus size={16} /> 신규 라벨 추가
                </button>
                {/* CSV 대량 업로드 버튼 */}
                <label className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium cursor-pointer transition-colors">
                  <Upload size={16} /> CSV 대량 등록
                  <input type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" />
                </label>
                {/* 양식 다운로드 버튼 */}
                <button onClick={downloadCSVTemplate} className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm font-medium transition-colors" title="현재 재고리스트 CSV 다운로드">
                  <Download size={16} /> 양식 다운로드
                </button>
              </div>
            </div>


            {/* 일괄 액션 바 */}
            {selectedLabelIds.size > 0 && (
              <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg">
                <span className="text-sm font-medium text-blue-700">{selectedLabelIds.size}개 선택됨</span>
                <button onClick={() => { setBulkEditFields({ vendor: '', type: '', brand: '' }); setShowBulkEditModal(true); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors">
                  <Pencil size={13} /> 일괄 수정
                </button>
                <button onClick={() => { if (window.confirm(`선택한 ${selectedLabelIds.size}개 라벨을 삭제하시겠습니까?`)) { const deletedLabels = labels.filter(l => selectedLabelIds.has(l.id)); setLabels(prev => prev.filter(l => !selectedLabelIds.has(l.id))); addLog({ type: 'bulk_delete', count: deletedLabels.length, labelNames: deletedLabels.map(l => l.name), summary: `일괄 삭제: ${deletedLabels.length}개 라벨` }); setSelectedLabelIds(new Set()); } }} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-medium transition-colors">
                  <Trash2 size={13} /> 일괄 삭제
                </button>
                <button onClick={() => setSelectedLabelIds(new Set())} className="ml-auto text-xs text-slate-500 hover:text-slate-700">선택 해제</button>
              </div>
            )}

            <div className="overflow-auto max-h-[70vh] border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-sm text-slate-600">
                    <th className="p-3 font-medium sticky top-0 bg-slate-50 z-10 w-8">
                      <input type="checkbox"
                        checked={pagedLabels.length > 0 && pagedLabels.every(l => selectedLabelIds.has(l.id))}
                        onChange={e => {
                          setSelectedLabelIds(prev => {
                            const next = new Set(prev);
                            pagedLabels.forEach(l => e.target.checked ? next.add(l.id) : next.delete(l.id));
                            return next;
                          });
                        }}
                        className="cursor-pointer w-4 h-4 accent-blue-600"
                      />
                    </th>
                    <th className="p-3 font-medium sticky top-0 bg-slate-50 z-10">이미지</th>
                    <th className="p-3 font-medium sticky top-0 bg-slate-50 z-10">브랜드</th>
                    <th className="p-3 font-medium sticky top-0 bg-slate-50 z-10">종류</th>
                    <th className="p-3 font-medium sticky top-0 bg-slate-50 z-10">라벨명</th>
                    <th className="p-3 font-medium sticky top-0 bg-slate-50 z-10">품번</th>
                    <th className="p-3 font-medium sticky top-0 bg-slate-50 z-10">사이즈</th>
                    <th className="p-3 font-medium text-right sticky top-0 bg-slate-50 z-10">현재고</th>
                    <th className="p-3 font-medium text-right sticky top-0 bg-slate-50 z-10">안전재고</th>
                    <th className="p-3 font-medium text-right sticky top-0 bg-amber-50 z-10 text-amber-600">최소보유</th>
                    <th className="p-3 font-medium text-right sticky top-0 bg-slate-50 z-10">단가</th>
                    <th className="p-3 font-medium sticky top-0 bg-slate-50 z-10">공급처</th>
                    <th className="p-3 font-medium text-center sticky top-0 bg-slate-50 z-10">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedLabels.map((l, lIdx) => (
                    <tr key={l.id} className={`hover:bg-slate-50 transition-colors ${selectedLabelIds.has(l.id) ? 'bg-blue-50' : ''}`}>
                      <td className="p-3 w-8">
                        <input type="checkbox" checked={selectedLabelIds.has(l.id)}
                          onChange={e => setSelectedLabelIds(prev => { const next = new Set(prev); e.target.checked ? next.add(l.id) : next.delete(l.id); return next; })}
                          className="cursor-pointer w-4 h-4 accent-blue-600"
                        />
                      </td>
                      <td className="p-3">
                        <div className="relative group">
                          <label className="cursor-pointer block">
                            <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                              const file = e.target.files[0];
                              if (file) {
                                const url = await uploadToStorage(file);
                                addToLabelImageFolder(l.name, url, file, l.code);
                                setLabels(prev => prev.map(item => item.id === l.id ? { ...item, img: url } : item));
                                addLog({ type: 'image_update', labelId: l.id, labelName: l.name, labelCode: l.code, summary: `이미지 업데이트: ${l.name} (${l.code})` });
                              }
                            }} />
                            {l.img
                              ? <img src={l.img} alt="label" className="w-12 h-12 rounded object-cover border border-slate-200 hover:opacity-70 transition-opacity" />
                              : <div className="w-12 h-12 rounded bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200 hover:bg-slate-200 transition-colors"><ImageIcon size={20} /></div>}
                          </label>
                          {l.img && (
                            <button onClick={() => setPreviewImg(l.img)} className="absolute -top-1 -right-1 bg-blue-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-md">
                              <ZoomIn size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                          l.brand === 'WV' ? 'bg-blue-100 text-blue-700' :
                          l.brand === 'JM' ? 'bg-purple-100 text-purple-700' :
                          l.brand === 'EZ' ? 'bg-amber-100 text-amber-700' :
                          l.brand === 'FP' ? 'bg-rose-100 text-rose-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>{l.brand}</span>
                      </td>
                      <td className="p-3 text-sm">{l.type}</td>
                      <td className="p-3 font-medium text-slate-800">{l.name}</td>
                      <td className="p-3 text-sm text-slate-500">{l.code}</td>
                      <td className="p-3 text-sm">{l.size}</td>
                      <td className={`p-3 text-right font-bold ${l.stock < 0 ? 'text-red-600' : l.stock > 0 && l.stock >= (l.safetyStock || 0) ? 'text-blue-600' : l.stock > 0 ? 'text-orange-500' : 'text-slate-400'}`}>{l.stock < 0 ? `-${Math.abs(l.stock).toLocaleString()}` : l.stock.toLocaleString()}</td>
                      <td className="p-3 text-right text-sm">
                        <input type="number" min="0" value={l.safetyStock || 0} onFocus={e => { safetyStockPrev.current[l.id] = parseInt(e.target.value) || 0; }} onChange={e => setLabels(labels.map(lb => lb.id === l.id ? { ...lb, safetyStock: parseInt(e.target.value) || 0 } : lb))} onBlur={e => { const newVal = parseInt(e.target.value) || 0; const oldVal = safetyStockPrev.current[l.id]; if (oldVal !== undefined && oldVal !== newVal) addLog({ type: 'safety_stock', labelId: l.id, labelName: l.name, labelCode: l.code, before: oldVal, after: newVal, summary: `안전재고 변경: ${l.name} (${l.code}) ${oldVal}→${newVal}` }); delete safetyStockPrev.current[l.id]; }} className="w-16 p-1 border border-slate-200 rounded text-right text-sm bg-white" />
                      </td>
                      <td className="p-3 text-right text-sm">
                        <input type="number" min="0" value={l.reserveStock ?? 0} onChange={e => setLabels(labels.map(lb => lb.id === l.id ? { ...lb, reserveStock: parseInt(e.target.value) || 0 } : lb))} className="w-16 p-1 border border-amber-200 rounded text-right text-sm bg-amber-50 text-amber-700" />
                      </td>
                      <td className="p-3 text-right">{l.price > 0 ? `${l.price.toLocaleString()}원` : '-'}</td>
                      <td className="p-3 text-sm">{l.vendor || '-'}</td>
                      <td className="p-3 text-center relative">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setLabelLogModal(l)} className="text-slate-400 hover:text-blue-500 p-1" title="발주 로그 보기">
                            <History size={15} />
                          </button>
                          <button onClick={() => setOpenMenuId(openMenuId === l.id ? null : l.id)} className="text-slate-400 hover:text-slate-600 p-1">
                            <MoreVertical size={16} />
                          </button>
                        </div>
                        {openMenuId === l.id && (
                          <>
                            <div className="fixed inset-0 z-20" onClick={() => setOpenMenuId(null)} />
                            <div className={`absolute right-0 z-30 bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-28 ${lIdx >= pagedLabels.length - 3 ? 'bottom-10' : 'top-10'}`}>
                              <button onClick={() => startEdit(l)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2 text-slate-700">
                                <Pencil size={14} /> 수정
                              </button>
                              <button onClick={() => { setOpenMenuId(null); deleteLabel(l.id); }} className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 flex items-center gap-2 text-red-500">
                                <Trash2 size={14} /> 삭제
                              </button>
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 페이지네이션 */}
            <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span>페이지당</span>
                {[30, 50, 100].map(size => (
                  <button key={size} onClick={() => { setLabelPageSize(size); setLabelPage(1); }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${labelPageSize === size ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {size}
                  </button>
                ))}
                <span className="ml-2 text-slate-400">{filteredLabels.length}개 중 {(labelPage-1)*labelPageSize+1}–{Math.min(labelPage*labelPageSize, filteredLabels.length)}</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setLabelPage(1)} disabled={labelPage === 1} className="px-2 py-1 rounded text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30">«</button>
                <button onClick={() => setLabelPage(p => Math.max(1, p-1))} disabled={labelPage === 1} className="px-2 py-1 rounded text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30">‹</button>
                {Array.from({length: labelTotalPages}, (_, i) => i+1)
                  .filter(p => p === 1 || p === labelTotalPages || Math.abs(p - labelPage) <= 2)
                  .reduce((acc, p, idx, arr) => {
                    if (idx > 0 && p - arr[idx-1] > 1) acc.push('...');
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, idx) => p === '...' ? (
                    <span key={`e${idx}`} className="px-1.5 py-1 text-xs text-slate-400">…</span>
                  ) : (
                    <button key={p} onClick={() => setLabelPage(p)}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${labelPage === p ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                      {p}
                    </button>
                  ))}
                <button onClick={() => setLabelPage(p => Math.min(labelTotalPages, p+1))} disabled={labelPage === labelTotalPages} className="px-2 py-1 rounded text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30">›</button>
                <button onClick={() => setLabelPage(labelTotalPages)} disabled={labelPage === labelTotalPages} className="px-2 py-1 rounded text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30">»</button>
              </div>
            </div>

            {/* 일괄 수정 모달 */}
            {showBulkEditModal && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowBulkEditModal(false)}>
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                  <h3 className="text-lg font-bold text-slate-800 mb-1">일괄 수정</h3>
                  <p className="text-sm text-slate-400 mb-4">선택한 {selectedLabelIds.size}개 라벨에 적용됩니다. 비워두면 해당 항목은 변경되지 않습니다.</p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">브랜드</label>
                      <select value={bulkEditFields.brand} onChange={e => setBulkEditFields(p => ({ ...p, brand: e.target.value }))} className="w-full p-2 border border-slate-200 rounded-lg text-sm">
                        <option value="">변경 안 함</option>
                        {['WV','JM','EZ','FP','공용'].map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">종류</label>
                      <input type="text" placeholder="변경 안 함" value={bulkEditFields.type} onChange={e => setBulkEditFields(p => ({ ...p, type: e.target.value }))} className="w-full p-2 border border-slate-200 rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">공급처</label>
                      <input type="text" placeholder="변경 안 함" value={bulkEditFields.vendor} onChange={e => setBulkEditFields(p => ({ ...p, vendor: e.target.value }))} className="w-full p-2 border border-slate-200 rounded-lg text-sm" />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-5 justify-end">
                    <button onClick={() => setShowBulkEditModal(false)} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">취소</button>
                    <button onClick={() => {
                      const changedFields = [];
                      if (bulkEditFields.brand) changedFields.push(`브랜드→${bulkEditFields.brand}`);
                      if (bulkEditFields.type) changedFields.push(`종류→${bulkEditFields.type}`);
                      if (bulkEditFields.vendor) changedFields.push(`공급처→${bulkEditFields.vendor}`);
                      setLabels(prev => prev.map(l => {
                        if (!selectedLabelIds.has(l.id)) return l;
                        return {
                          ...l,
                          ...(bulkEditFields.brand ? { brand: bulkEditFields.brand } : {}),
                          ...(bulkEditFields.type ? { type: bulkEditFields.type } : {}),
                          ...(bulkEditFields.vendor ? { vendor: bulkEditFields.vendor } : {}),
                        };
                      }));
                      addLog({ type: 'bulk_edit', count: selectedLabelIds.size, fields: { ...bulkEditFields }, summary: `일괄 수정: ${selectedLabelIds.size}개 라벨 (${changedFields.join(', ')})` });
                      setShowBulkEditModal(false);
                      setSelectedLabelIds(new Set());
                    }} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium">적용</button>
                  </div>
                </div>
              </div>
            )}

            {/* 신규 라벨 추가 모달 */}
            {showAddLabelModal && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAddLabelModal(false)}>
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-bold text-slate-800 flex items-center gap-2"><Plus size={16} className="text-blue-600" /> 신규 라벨 등록</h3>
                    <button onClick={() => setShowAddLabelModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="col-span-2 md:col-span-4">
                      <label className="block text-xs text-slate-500 mb-1">라벨 이미지 (선택)</label>
                      <input type="file" accept="image/*" onChange={handleImageUpload} className="w-full text-sm p-2 border border-slate-300 rounded bg-white" />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">브랜드</label>
                      <select value={newLabel.brand} onChange={e => setNewLabel({ ...newLabel, brand: e.target.value })} className="w-full p-2 border border-slate-300 rounded text-sm bg-white">
                        <option value="WV">WV</option>
                        <option value="JM">JM</option>
                        <option value="EZ">EZ</option>
                        <option value="FP">FP</option>
                        <option value="공용">공용</option>
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
                      <label className="block text-xs text-slate-500 mb-1">최소보유수량 <span className="text-amber-500">(발주 계산 제외)</span></label>
                      <input type="number" value={newLabel.reserveStock ?? 0} onChange={e => setNewLabel({ ...newLabel, reserveStock: parseInt(e.target.value) || 0 })} className="w-full p-2 border border-amber-300 rounded text-sm" placeholder="예: 100" />
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
                  <div className="flex justify-end gap-2 mt-5">
                    <button onClick={() => setShowAddLabelModal(false)} className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200">취소</button>
                    <button onClick={addLabel} className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"><Plus size={16} /> 추가</button>
                  </div>
                </div>
              </div>
            )}
          </div>
          </>
        )}

        {/* [2] 상품 BOM 세팅 탭 */}
        {activeTab === 'bom' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 md:col-span-1 h-fit">
              <div className="pb-4 mb-4 border-b border-slate-100">
                <label className="block text-xs text-slate-500 mb-1">새 상품 등록</label>
                <div className="flex gap-2">
                  <select value={newProductBrand} onChange={e => setNewProductBrand(e.target.value)} className="w-20 p-2 border border-slate-300 rounded text-sm bg-white">
                    {brandList.filter(b => b !== '전체').map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                  <input type="text" value={newProductName} onChange={e => setNewProductName(e.target.value)} placeholder="예: 24FW 와이드 팬츠" className="flex-1 p-2 border border-slate-300 rounded text-sm" />
                  <button onClick={addProduct} className="bg-slate-800 text-white px-3 py-2 rounded hover:bg-slate-700"><Plus size={18} /></button>
                </div>
              </div>
              <h2 className="text-lg font-bold mb-3 flex items-center gap-2"><Layers className="text-indigo-600" /> 생산 상품 목록</h2>
              <div className="relative mb-3">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="상품명 검색..." className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded text-sm bg-white" />
              </div>
              <div className="space-y-2">
                {products.filter(p => {
                  if (!productSearch) return true;
                  const q = productSearch.toLowerCase();
                  return p.name.toLowerCase().includes(q) || (p.brand || '').toLowerCase().includes(q);
                }).map(p => (
                  <div key={p.id} className={`flex items-center gap-2 p-3 rounded-lg border transition-all ${selectedProduct?.id === p.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'}`}>
                    <button onClick={() => { setSelectedProduct(p); setBomBrandFilter('auto'); }} className={`flex-1 text-left text-sm ${selectedProduct?.id === p.id ? 'text-indigo-700 font-medium' : 'text-slate-600'}`}>
                      <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold mr-2 ${p.brand === 'WV' ? 'bg-blue-100 text-blue-700' : p.brand === 'JM' ? 'bg-purple-100 text-purple-700' : p.brand === 'EZ' ? 'bg-amber-100 text-amber-700' : p.brand === 'FP' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700'}`}>{p.brand || '공용'}</span>
                      {p.name}
                    </button>
                    <div className="relative shrink-0">
                      <button onClick={() => setOpenProductMenuId(openProductMenuId === p.id ? null : p.id)} className="text-slate-400 hover:text-slate-600 p-1">
                        <MoreVertical size={14} />
                      </button>
                      {openProductMenuId === p.id && (
                        <>
                          <div className="fixed inset-0 z-20" onClick={() => setOpenProductMenuId(null)} />
                          <div className="absolute right-0 top-8 z-30 bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-28">
                            <button onClick={() => startEditProduct(p)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2 text-slate-700">
                              <Pencil size={14} /> 수정
                            </button>
                            <button onClick={() => { setOpenProductMenuId(null); deleteProduct(p.id); }} className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 flex items-center gap-2 text-red-500">
                              <Trash2 size={14} /> 삭제
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 md:col-span-2">
              {selectedProduct ? (
                <>
                  <h2 className="text-lg font-bold mb-1 flex items-center gap-2 text-indigo-800">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${selectedProduct.brand === 'WV' ? 'bg-blue-100 text-blue-700' : selectedProduct.brand === 'JM' ? 'bg-purple-100 text-purple-700' : selectedProduct.brand === 'EZ' ? 'bg-amber-100 text-amber-700' : selectedProduct.brand === 'FP' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700'}`}>{selectedProduct.brand || '공용'}</span>
                    {selectedProduct.name} <span className="text-sm font-normal text-slate-500 ml-2">소요 라벨 세팅</span>
                  </h2>
                  <p className="text-sm text-slate-500 mb-6">이 옷을 1벌 만들 때 들어가는 라벨과 수량을 등록해두세요.</p>

                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6">
                    {/* 검색 + 필터 + 수량 + 추가 — 1줄 */}
                    <div className="flex gap-2 items-center mb-3">
                      <input
                        type="text"
                        value={bomSearchInput}
                        onChange={e => setBomSearchInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && setBomSearchQuery(bomSearchInput)}
                        placeholder="라벨명, 품번 검색"
                        className="flex-1 min-w-0 p-2 border border-slate-300 rounded text-sm bg-white"
                      />
                      <button onClick={() => setBomSearchQuery(bomSearchInput)} className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded font-medium">검색</button>
                      <select value={bomBrandFilter} onChange={e => { setBomBrandFilter(e.target.value); setBomSelection({ ...bomSelection, labelIds: [] }); }} className="p-2 border border-slate-300 rounded text-sm bg-white">
                        <option value="auto">{selectedProduct.brand}</option>
                        {[...new Set(labels.map(l => l.brand))].filter(b => b !== '공용' && b !== selectedProduct.brand).map(b => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                        <option value="공용">공용</option>
                        <option value="all">브랜드 전체</option>
                      </select>
                      <select value={bomTypeFilter} onChange={e => setBomTypeFilter(e.target.value)} className="p-2 border border-slate-300 rounded text-sm bg-white">
                        <option value="전체">종류 전체</option>
                        {[...new Set(labels.map(l => l.type).filter(Boolean))].sort().map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <span className="text-xs text-slate-500 ml-2 whitespace-nowrap">1벌당 수량</span>
                      <input type="number" min="1" value={bomSelection.qty} onChange={e => setBomSelection({ ...bomSelection, qty: e.target.value })} className="w-16 p-2 border border-slate-300 rounded text-sm bg-white" />
                      <button onClick={addLabelToBom} disabled={bomSelection.labelIds.length === 0} className={`px-4 py-2 rounded text-sm font-medium whitespace-nowrap ${bomSelection.labelIds.length > 0 ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-slate-300 text-slate-500 cursor-not-allowed'}`}>
                        추가 {bomSelection.labelIds.length > 0 && `(${bomSelection.labelIds.length})`}
                      </button>
                    </div>
                    <div className="max-h-96 overflow-y-auto border border-slate-200 rounded bg-white">
                      {labels.filter(l => {
                        const brandMatch = (() => {
                          if (bomBrandFilter === 'all') return true;
                          const brand = bomBrandFilter === 'auto' ? selectedProduct.brand : bomBrandFilter;
                          return l.brand === brand;
                        })();
                        const typeMatch = bomTypeFilter === '전체' || l.type === bomTypeFilter;
                        const q = bomSearchQuery.trim().toLowerCase();
                        const searchMatch = !q || l.name?.toLowerCase().includes(q) || l.code?.toLowerCase().includes(q);
                        return brandMatch && typeMatch && searchMatch;
                      }).map(l => {
                        const alreadyAdded = selectedProduct.bom.some(b => b.labelId === l.id);
                        const isChecked = bomSelection.labelIds.includes(String(l.id));
                        return (
                          <label key={l.id} className={`flex items-center gap-2 px-3 py-1.5 text-sm border-b border-slate-50 last:border-0 cursor-pointer ${alreadyAdded ? 'bg-slate-50 text-slate-400' : isChecked ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                            <input type="checkbox" disabled={alreadyAdded} checked={isChecked} onChange={e => {
                              if (e.target.checked) setBomSelection({ ...bomSelection, labelIds: [...bomSelection.labelIds, String(l.id)] });
                              else setBomSelection({ ...bomSelection, labelIds: bomSelection.labelIds.filter(id => id !== String(l.id)) });
                            }} className="rounded border-slate-300 text-indigo-600" />
                            <span className={alreadyAdded ? 'line-through' : ''}>[{l.brand}] {l.name} ({l.code}) - {l.size}</span>
                            {alreadyAdded && <span className="text-xs text-slate-400 ml-auto">등록됨</span>}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-sm text-slate-600">
                        <th className="p-3 font-medium text-center w-16">순서</th>
                        <th className="p-3 font-medium">이미지</th>
                        <th className="p-3 font-medium">라벨명 (품번) / 사이즈</th>
                        <th className="p-3 font-medium text-center">1벌당 소요량</th>
                        <th className="p-3 font-medium text-center">삭제</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedProduct.bom.length === 0 && (
                        <tr><td colSpan="5" className="p-4 text-center text-slate-400 text-sm">등록된 라벨이 없습니다.</td></tr>
                      )}
                      {selectedProduct.bom.map((item, idx) => {
                        const label = labels.find(l => l.id === item.labelId);
                        if (!label) return null;
                        const isCareLabel = label.type === '케어라벨' || label.name.includes('케어라벨');
                        return (
                          <React.Fragment key={item.labelId}>
                            <tr
                              draggable
                              onDragStart={() => setDragIdx(idx)}
                              onDragOver={e => { e.preventDefault(); setDragOverIdx(idx); }}
                              onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                              onDrop={() => { dropBomItem(selectedProduct.id, dragIdx, idx); setDragIdx(null); setDragOverIdx(null); }}
                              className={`${dragIdx === idx ? 'opacity-40' : ''} ${dragOverIdx === idx && dragIdx !== idx ? 'border-t-2 border-indigo-400' : ''} transition-all`}
                            >
                              <td className="p-3 text-center cursor-grab active:cursor-grabbing">
                                <div className="flex items-center justify-center gap-1 text-slate-300 hover:text-slate-500">
                                  <GripVertical size={16} />
                                  <span className="text-xs text-slate-400 font-medium">{idx + 1}</span>
                                </div>
                              </td>
                              <td className="p-3">
                                {label.img
                                  ? <img src={label.img} alt="label" className="w-10 h-10 rounded object-cover border border-slate-200" />
                                  : <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200"><ImageIcon size={16} /></div>}
                              </td>
                              <td className="p-3 font-medium">
                                {label.name} <span className="text-xs text-slate-400 ml-1">{label.code}</span>
                                {label.size && <span className="ml-2 inline-block px-1.5 py-0.5 bg-slate-100 text-slate-500 text-xs rounded">{label.size}</span>}
                              </td>
                              <td className="p-3 text-center font-bold text-indigo-600">{item.qtyPerUnit}개</td>
                              <td className="p-3 text-center">
                                <button onClick={() => removeLabelFromBom(selectedProduct.id, label.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={16} /></button>
                              </td>
                            </tr>
                            {isCareLabel && (
                              <tr className="bg-amber-50/50">
                                <td></td>
                                <td></td>
                                <td colSpan="3" className="px-3 pb-3 pt-1">
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="block text-xs text-slate-500 mb-0.5">품번</label>
                                      <input type="text" placeholder="품번 입력" value={item.careInfo?.code || ''} onChange={e => updateBomItemInfo(selectedProduct.id, item.labelId, 'code', e.target.value)} className="w-full p-1.5 border border-slate-300 rounded text-xs bg-white" />
                                    </div>
                                    <div>
                                      <label className="block text-xs text-slate-500 mb-0.5">소재</label>
                                      <input type="text" placeholder="소재 입력" value={item.careInfo?.material || ''} onChange={e => updateBomItemInfo(selectedProduct.id, item.labelId, 'material', e.target.value)} className="w-full p-1.5 border border-slate-300 rounded text-xs bg-white" />
                                    </div>
                                  </div>
                                  <p className="text-xs text-amber-600 mt-1.5">※ 제조년월 · RN넘버는 발주 계산기에서 발주 시마다 입력합니다.</p>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>

                  {selectedProduct.bom.length > 0 && (
                    <div className="mt-6 flex justify-center">
                      {bomSaved ? (
                        <div className="flex items-center gap-2 text-green-600 font-medium text-sm bg-green-50 px-6 py-3 rounded-lg border border-green-200">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          저장 완료!
                        </div>
                      ) : (
                        <button onClick={() => { setBomSaved(true); setTimeout(() => setBomSaved(false), 2000); }} className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-lg text-sm font-bold shadow-sm transition-colors">
                          ✅ 라벨 세팅 완료
                        </button>
                      )}
                    </div>
                  )}
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

            <div className="bg-emerald-50 p-6 rounded-xl border border-emerald-100 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-bold text-emerald-900 mb-2">어떤 상품을 생산하시나요?</label>
                  <div className="relative" ref={calcSearchRef}>
                    <input
                      type="text"
                      value={calcSearchText}
                      onChange={e => { setCalcSearchText(e.target.value); setCalcSearchOpen(true); if (!e.target.value) { setCalcTarget(''); setCalcResult(null); } }}
                      onFocus={() => setCalcSearchOpen(true)}
                      onBlur={() => setTimeout(() => setCalcSearchOpen(false), 150)}
                      placeholder="상품명 검색..."
                      className="w-full p-3 border border-emerald-200 rounded-lg bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    {calcSearchOpen && (
                      <ul className="absolute z-50 w-full mt-1 bg-white border border-emerald-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                        {products.filter(p => `[${p.brand}] ${p.name}`.toLowerCase().includes(calcSearchText.toLowerCase())).length === 0
                          ? <li className="px-3 py-2 text-sm text-slate-400">검색 결과 없음</li>
                          : products.filter(p => `[${p.brand}] ${p.name}`.toLowerCase().includes(calcSearchText.toLowerCase())).map(p => (
                            <li
                              key={p.id}
                              onMouseDown={() => { setCalcTarget(String(p.id)); setCalcSearchText(`[${p.brand}] ${p.name}`); setCalcSearchOpen(false); setCalcResult(null); setCalcMfgDate(`${new Date().getFullYear()}.`); setCalcRnNumber(''); }}
                              className={`px-3 py-2 text-sm cursor-pointer hover:bg-emerald-50 ${String(p.id) === calcTarget ? 'bg-emerald-100 font-medium' : ''}`}
                            >
                              [{p.brand}] {p.name}
                            </li>
                          ))
                        }
                      </ul>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-emerald-900 mb-2">공장명</label>
                  <input type="text" value={calcFactory} onChange={e => setCalcFactory(e.target.value)} placeholder="공장명 입력" className="w-full p-3 border border-emerald-200 rounded-lg bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-emerald-900 mb-2">발주자</label>
                  {calcOrdererMode === 'select' ? (
                    <select
                      value={calcOrderer}
                      onChange={e => {
                        if (e.target.value === '__direct__') { setCalcOrdererMode('direct'); setCalcOrderer(''); }
                        else setCalcOrderer(e.target.value);
                      }}
                      className="w-full p-3 border border-emerald-200 rounded-lg bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                    >
                      <option value="">-- 선택 --</option>
                      {ORDERER_LIST.map(n => <option key={n} value={n}>{n}</option>)}
                      <option value="__direct__">✏️ 직접입력</option>
                    </select>
                  ) : (
                    <div className="flex gap-2">
                      <input type="text" value={calcOrderer} onChange={e => setCalcOrderer(e.target.value)} placeholder="발주자명 직접 입력" autoFocus className="flex-1 p-3 border border-emerald-200 rounded-lg bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm" />
                      <button onClick={() => { setCalcOrdererMode('select'); setCalcOrderer(''); }} className="px-3 py-2 text-xs text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50">목록</button>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-emerald-900 mb-2">특이사항</label>
                <textarea value={calcNote} onChange={e => setCalcNote(e.target.value)} placeholder="특이사항 입력 (선택)" rows="2" className="w-full p-3 border border-emerald-200 rounded-lg bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm resize-none" />
              </div>
              {calcTarget && (() => {
                const _prod = products.find(p => p.id === parseInt(calcTarget));
                const _careBomItem = _prod?.bom.find(b => labels.find(l => l.id === b.labelId)?.name.includes('케어라벨'));
                if (!_careBomItem) return null;
                return (
                  <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm font-bold text-amber-800">케어라벨 정보</span>
                      <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">발주마다 입력</span>
                    </div>
                    {(_careBomItem.careInfo?.code || _careBomItem.careInfo?.material) && (
                      <p className="text-xs text-slate-500 mb-3 bg-white px-3 py-1.5 rounded border border-amber-100">
                        품번: <span className="font-medium text-slate-700">{_careBomItem.careInfo?.code || '-'}</span>
                        &nbsp;&nbsp;|&nbsp;&nbsp;
                        소재: <span className="font-medium text-slate-700">{_careBomItem.careInfo?.material || '-'}</span>
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-600 mb-1 font-medium">제조년월</label>
                        <input type="text" value={calcMfgDate} onChange={e => setCalcMfgDate(e.target.value)} placeholder="예: 2025.03" className="w-full p-2 border border-amber-200 rounded bg-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-400" />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 mb-1 font-medium">RN넘버</label>
                        {calcRnMode === 'select' ? (
                          <select
                            value={calcRnNumber}
                            onChange={e => {
                              if (e.target.value === '__direct__') { setCalcRnMode('direct'); setCalcRnNumber(''); }
                              else setCalcRnNumber(e.target.value);
                            }}
                            className="w-full p-2 border border-amber-200 rounded bg-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
                          >
                            <option value="">-- 선택 --</option>
                            {RN_LIST.map(item => <option key={item.rn} value={item.rn}>{item.rn} — {item.factory}</option>)}
                            <option value="__direct__">✏️ 직접입력</option>
                          </select>
                        ) : (
                          <div className="flex gap-2">
                            <input type="text" value={calcRnNumber} onChange={e => setCalcRnNumber(e.target.value)} placeholder="RN넘버 직접 입력" autoFocus className="flex-1 p-2 border border-amber-200 rounded bg-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-400" />
                            <button onClick={() => { setCalcRnMode('select'); setCalcRnNumber(''); }} className="px-3 py-1.5 text-xs text-slate-500 border border-slate-200 rounded hover:bg-slate-50">목록</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
              <div>
                <label className="block text-sm font-bold text-emerald-900 mb-2">색상 / 사이즈별 생산 수량</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">색상 (쉼표로 구분)</label>
                    <input type="text" value={calcColorText} onChange={e => { setCalcColorText(e.target.value); setCalcResult(null); }} placeholder="예: 블랙, 네이비, 그레이" className="w-full p-2 border border-emerald-200 rounded text-sm bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">사이즈 (쉼표로 구분)</label>
                    <input type="text" value={calcSizeText} onChange={e => { setCalcSizeText(e.target.value); setCalcResult(null); }} placeholder="예: M, L, XL, 2XL" className="w-full p-2 border border-emerald-200 rounded text-sm bg-white" />
                  </div>
                </div>

                {calcColorList.length > 0 && calcSizeList.length > 0 ? (
                  <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="p-2 text-left font-medium text-slate-600 border-b border-r border-slate-200 min-w-[80px]">색상 \ 사이즈</th>
                          {calcSizeList.map(size => (
                            <th key={size} className="p-2 text-center font-medium text-slate-600 border-b border-slate-200 min-w-[70px]">{size}</th>
                          ))}
                          <th className="p-2 text-center font-medium text-slate-500 border-b border-slate-200 bg-slate-100 min-w-[60px]">소계</th>
                        </tr>
                      </thead>
                      <tbody>
                        {calcColorList.map(color => (
                          <tr key={color} className="border-b border-slate-100 last:border-0">
                            <td className="p-2 font-medium text-slate-700 border-r border-slate-200 bg-slate-50">{color}</td>
                            {calcSizeList.map(size => (
                              <td key={size} className="p-1">
                                <input type="number" min="0" value={getCalcQty(color, size)} onChange={e => setCalcQty(color, size, e.target.value)} placeholder="0" className="w-full p-1.5 border border-slate-200 rounded text-sm text-center bg-white focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400" />
                              </td>
                            ))}
                            <td className="p-2 text-center font-bold text-emerald-700 bg-slate-50">
                              {calcSizeList.reduce((s, size) => s + (parseInt(getCalcQty(color, size)) || 0), 0).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-slate-100 border-t border-slate-300">
                          <td className="p-2 font-bold text-slate-600 border-r border-slate-200">사이즈합계</td>
                          {calcSizeList.map(size => (
                            <td key={size} className="p-2 text-center font-bold text-slate-600">
                              {calcColorList.reduce((s, color) => s + (parseInt(getCalcQty(color, size)) || 0), 0).toLocaleString()}
                            </td>
                          ))}
                          <td className="p-2 text-center font-bold text-emerald-800 text-base">
                            {calcColorList.reduce((total, c) => total + calcSizeList.reduce((s, sz) => s + (parseInt(getCalcQty(c, sz)) || 0), 0), 0).toLocaleString()}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center text-slate-400 text-sm py-4 border border-dashed border-slate-200 rounded-lg">색상과 사이즈를 입력하면 수량 입력표가 자동 생성됩니다.</div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button onClick={calculateOrder} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white p-3 rounded-lg font-bold shadow-md transition-transform active:scale-95">
                  재고 확인 및 발주량 계산
                </button>
                <div className="flex items-center gap-2 bg-white border border-emerald-200 rounded-lg px-3 py-2 shadow-sm shrink-0">
                  <label className="text-xs font-bold text-slate-600 whitespace-nowrap">대봉스티커</label>
                  <select
                    value={calcDaebongType}
                    onChange={e => setCalcDaebongType(e.target.value)}
                    className="p-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white"
                  >
                    <option value="">종류 선택</option>
                    {Object.keys(DAEBONG_RATIO).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  {calcDaebongType && (() => {
                    const totalQty = getAllCalcRows().reduce((s, r) => s + r.qty, 0);
                    const ratio = DAEBONG_RATIO[calcDaebongType];
                    const needed = totalQty > 0 ? Math.ceil(totalQty / ratio) : 0;
                    return (
                      <span className="text-xs text-slate-500 whitespace-nowrap">
                        = <span className="font-bold text-emerald-700 text-sm">{needed}</span>장
                        <span className="text-slate-300 ml-1">({totalQty}개÷{ratio})</span>
                      </span>
                    );
                  })()}
                </div>
              </div>
            </div>

            {calcResult && (
              <div className="mt-8 space-y-6">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <AlertCircle className="text-amber-500" /> 예상 발주 리스트
                  <span className="text-sm font-normal text-slate-400">— 공급처별</span>
                </h3>
                {(() => {
                  const todayStr = (() => { const d = new Date(); return `${String(d.getFullYear()).slice(2)}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`; })();
                  // 공급처별 그룹핑
                  const groups = {};
                  calcResult.details.forEach(item => {
                    const v = item.vendor || '(공급처 미입력)';
                    if (!groups[v]) groups[v] = [];
                    groups[v].push(item);
                  });
                  return Object.entries(groups).map(([vendor, items]) => {
                    const vendorCost = items.filter(i => i.shortage > 0).reduce((s, i) => s + i.cost, 0);
                    return (
                      <div key={vendor} className="border border-slate-200 rounded-lg overflow-hidden">
                        <div className="bg-slate-700 text-white px-4 py-2 flex items-center justify-between">
                          <span className="font-bold text-sm">📦 {vendor}</span>
                          <span className="text-xs text-slate-300">발주 필요 {items.filter(i => i.shortage > 0).length}종 / 예상 비용 <span className="text-emerald-300 font-bold">{vendorCost.toLocaleString()}원</span></span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-sm">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                                <th className="p-3 font-medium whitespace-nowrap">날짜</th>
                                <th className="p-3 font-medium whitespace-nowrap">발주자</th>
                                <th className="p-3 font-medium whitespace-nowrap">공장</th>
                                <th className="p-3 font-medium whitespace-nowrap">라벨명</th>
                                <th className="p-3 font-medium whitespace-nowrap">이미지</th>
                                <th className="p-3 font-medium whitespace-nowrap">상품명</th>
                                <th className="p-3 font-medium whitespace-nowrap text-center">SIZE</th>
                                <th className="p-3 font-medium whitespace-nowrap text-right bg-slate-50 text-slate-500">현재고</th>
                                <th className="p-3 font-medium whitespace-nowrap text-right bg-amber-50 text-amber-600">가용재고</th>
                                <th className="p-3 font-medium whitespace-nowrap text-right bg-red-50 text-red-600">필요수량</th>
                                <th className="p-3 font-medium whitespace-nowrap">특이사항</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {items.map((item, idx) => (
                                <tr key={idx} className={item.shortage > 0 ? 'hover:bg-red-50/30' : 'hover:bg-slate-50'}>
                                  <td className="p-3 text-slate-500 whitespace-nowrap">{todayStr}</td>
                                  <td className="p-3 text-slate-800">{calcOrderer || '-'}</td>
                                  <td className="p-3 text-slate-800">{calcFactory || '-'}</td>
                                  <td className="p-3 cursor-pointer hover:text-indigo-600 group" onClick={() => { const l = labels.find(lb => lb.id === item.id); if (l) setCalcLabelPopup(l); }}>
                                    <div className="font-medium text-slate-800 group-hover:text-indigo-600 group-hover:underline transition-colors">{item.name}</div>
                                    <div className="text-xs text-slate-400">{item.code}</div>
                                    {item.type === '케어라벨' && (
                                      <div className="mt-1 space-y-0.5">
                                        {item.careInfo?.code && <div className="text-xs text-amber-700">품번: <span className="font-medium">{item.careInfo.code}</span></div>}
                                        {item.careInfo?.material && <div className="text-xs text-amber-700">소재: <span className="font-medium">{item.careInfo.material}</span></div>}
                                        {calcMfgDate && <div className="text-xs text-amber-700">제조년월: <span className="font-medium">{calcMfgDate}</span></div>}
                                        {calcRnNumber && <div className="text-xs text-amber-700">RN#: <span className="font-medium">{calcRnNumber}</span></div>}
                                      </div>
                                    )}
                                  </td>
                                  <td className="p-3">
                                    {item.img
                                      ? <img src={item.img} alt="img" className="w-10 h-10 rounded object-cover border border-slate-200" />
                                      : <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center"><ImageIcon size={14} className="text-slate-300" /></div>
                                    }
                                  </td>
                                  <td className="p-3 text-slate-800 whitespace-nowrap">{calcSearchText || '-'}</td>
                                  <td className="p-3 text-center text-slate-800 text-base font-bold">{item.size || '-'}</td>
                                  <td className="p-3 text-right text-slate-600">
                                    <div>
                                      <div>{(item.stock ?? 0).toLocaleString()}</div>
                                      {(item.reserveStock ?? 0) > 0 && (
                                        <div className="text-xs text-amber-600 whitespace-nowrap">유보 {item.reserveStock.toLocaleString()}</div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="p-3 text-right text-amber-700 font-medium">
                                    {(item.availableStock ?? item.stock ?? 0).toLocaleString()}
                                  </td>
                                  <td className="p-3 text-right font-bold">
                                    <span className={item.shortage > 0 ? 'text-red-600' : 'text-slate-800'}>
                                      {item.needQty.toLocaleString()}개
                                    </span>
                                  </td>
                                  <td className="p-3 text-slate-500 text-xs max-w-32 truncate">{calcNote || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  });
                })()}
                <div className="border border-slate-200 rounded-lg bg-slate-800 text-white px-4 py-3 flex justify-between items-center">
                  <span className="font-medium text-slate-300">총 예상 발주 비용 합계</span>
                  <span className="font-bold text-lg text-emerald-400">{calcResult.totalCost.toLocaleString()} 원</span>
                </div>
                <div className="mt-4 flex justify-between items-center gap-3">
                  {/* PDF 다운로드 버튼 — 스마트 발주서만 */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => generateOrderPDF(calcResult.details.filter(d => d.vendor === '스마트'), '스마트')}
                      disabled={pdfLoading}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-3 rounded-lg font-bold shadow transition-colors text-sm"
                    >
                      <FileDown size={16} /> {pdfLoading ? '생성 중...' : '스마트 발주서 PDF'}
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      const order = {
                        id: Date.now(),
                        date: new Date().toLocaleString('ko-KR'),
                        productName: calcSearchText,
                        factory: calcFactory,
                        orderer: calcOrderer,
                        note: calcNote,
                        mfgDate: calcMfgDate,
                        rnNumber: calcRnNumber,
                        totalCost: calcResult.totalCost,
                        totalQty: calcResult.details.reduce((s, d) => s + d.needQty, 0),
                        details: calcResult.details,
                      };
                      setSavedOrders(prev => [order, ...prev]);
                      addLog({ type: 'order_save', productName: order.productName || '(미선택)', factory: order.factory || '-', orderer: order.orderer || '-', itemCount: order.details?.filter(d => d.shortage > 0).length || 0, totalCost: order.totalCost, summary: `발주 저장: ${order.productName || '(미선택)'}` });
                      alert('발주 내용이 저장되었습니다!');
                    }}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-lg font-bold shadow transition-colors"
                  >
                    <Save size={18} /> 발주내용 저장
                  </button>
                  <button
                    onClick={() => {
                      if (!window.confirm('처음부터 다시 시작하시겠습니까?\n입력한 내용이 모두 초기화됩니다.')) return;
                      setCalcTarget('');
                      setCalcSearchText('');
                      setCalcFactory('');
                      setCalcOrderer('');
                      setCalcOrdererMode('select');
                      setCalcNote('');
                      setCalcMfgDate(`${new Date().getFullYear()}.`);
                      setCalcRnNumber('');
                      setCalcRnMode('select');
                      setCalcColorText('블랙, 그레이');
                      setCalcSizeText('M, L, XL, 2XL');
                      setCalcQtyGrid({});
                      setCalcResult(null);
                      setCalcDaebongType('');
                      setCalcDaebongQty('');
                    }}
                    className="flex items-center gap-2 bg-slate-500 hover:bg-slate-600 text-white px-6 py-3 rounded-lg font-bold shadow transition-colors"
                  >
                    <X size={18} /> 취소
                  </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* [4] 저장리스트 탭 */}
      {activeTab === 'orders' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <ClipboardList size={22} className="text-orange-500" /> 발주 저장리스트
              <span className="text-sm font-normal text-slate-400">({savedOrders.length}건)</span>
            </h2>
            {savedOrders.length > 0 && (
              <button onClick={() => { if (window.confirm('저장리스트를 전체 삭제할까요?')) { addLog({ type: 'order_delete_all', count: savedOrders.length, summary: `발주 저장리스트 전체 삭제 (${savedOrders.length}건)` }); setSavedOrders([]); } }} className="text-sm text-red-400 hover:text-red-600 font-medium">전체 삭제</button>
            )}
          </div>

          {savedOrders.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <ClipboardList size={40} className="mx-auto mb-3 opacity-30" />
              <p>저장된 발주 내용이 없습니다.</p>
              <p className="text-sm mt-1">발주 계산기에서 계산 후 저장해보세요.</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="p-3 font-semibold text-slate-600">저장일시</th>
                    <th className="p-3 font-semibold text-slate-600">상품명</th>
                    <th className="p-3 font-semibold text-slate-600">공장</th>
                    <th className="p-3 font-semibold text-slate-600">발주자</th>
                    <th className="p-3 font-semibold text-slate-600 text-center">발주 라벨 수</th>
                    <th className="p-3 font-semibold text-slate-600 text-right">예상 비용</th>
                    <th className="p-3 font-semibold text-slate-600 text-center">상세</th>
                    <th className="p-3 font-semibold text-slate-600 text-center">발주</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {savedOrders.map((order, idx) => (
                    <React.Fragment key={order.id}>
                      <tr className={`hover:bg-slate-50 ${order.applied ? 'bg-green-50/40' : ''}`}>
                        <td className="p-3 text-slate-400 text-xs whitespace-nowrap">{order.date}</td>
                        <td className="p-3 font-medium text-slate-800 cursor-pointer hover:text-indigo-600 hover:underline transition-colors" onClick={() => setViewOrder(order)}>{order.productName || '(미선택)'}</td>
                        <td className="p-3 text-slate-600">{order.factory || '-'}</td>
                        <td className="p-3 text-slate-600">{order.orderer || '-'}</td>
                        <td className="p-3 text-center text-slate-700">{order.details?.filter(d => d.shortage > 0).length || 0}종</td>
                        <td className="p-3 text-right font-bold text-red-600">{order.totalCost?.toLocaleString()}원</td>
                        <td className="p-3 text-center">
                          <button onClick={() => setViewOrder(order)} className="text-xs text-indigo-500 hover:text-indigo-700 underline">▼ 보기</button>
                        </td>
                        <td className="p-3 text-center">
                          {order.applied
                            ? <div className="flex flex-col items-center gap-1">
                                <span className="text-xs text-green-600 font-medium bg-green-100 px-2 py-1 rounded-full">✓ 완료</span>
                                <button onClick={() => cancelOrderFromStock(order)} className="text-xs text-red-400 hover:text-red-600 hover:underline transition-colors">↩ 취소</button>
                              </div>
                            : <button onClick={() => applyOrderToStock(order)} className="text-xs bg-orange-500 hover:bg-orange-600 text-white font-medium px-3 py-1 rounded-lg transition-colors">발주 확정</button>
                          }
                        </td>
                        <td className="p-3 text-center">
                          <button onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setOrderMenuPos({ top: r.bottom, left: r.right - 112 }); setOpenOrderMenuId(openOrderMenuId === order.id ? null : order.id); }} className="text-slate-400 hover:text-slate-600 p-1">
                            <MoreVertical size={16} />
                          </button>
                          {openOrderMenuId === order.id && (
                            <>
                              <div className="fixed inset-0 z-20" onClick={() => setOpenOrderMenuId(null)} />
                              <div style={{ position: 'fixed', top: orderMenuPos.top, left: orderMenuPos.left }} className="z-30 bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-28">
                                <button onClick={() => { setViewOrder(order); setViewOrderEditMode(true); setViewOrderEdits({ orderer: order.orderer || '', factory: order.factory || '', note: order.note || '', mfgDate: order.mfgDate || '', rnNumber: order.rnNumber || '', details: (order.details || []).map(d => ({ ...d })), _idx: idx }); setOpenOrderMenuId(null); }} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2 text-slate-700">
                                  <Pencil size={14} /> 수정
                                </button>
                                <button onClick={() => { setOpenOrderMenuId(null); addLog({ type: 'order_delete', productName: order.productName || '(미선택)', factory: order.factory || '-', orderer: order.orderer || '-', itemCount: order.details?.filter(d => d.shortage > 0).length || 0, totalCost: order.totalCost, summary: `발주 삭제: ${order.productName || '(미선택)'}` }); setSavedOrders(prev => prev.filter(o => o.id !== order.id)); }} className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 flex items-center gap-2 text-red-500">
                                  <Trash2 size={14} /> 삭제
                                </button>
                              </div>
                            </>
                          )}
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 발주 리스트 상세 모달 */}
      {viewOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setViewOrder(null); setViewOrderEditMode(false); }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="flex-1 mr-4">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-bold text-slate-800">📋 예상 발주 리스트</h3>
                  {!viewOrderEditMode && (
                    <button onClick={() => { setViewOrderEditMode(true); setViewOrderEdits({ orderer: viewOrder.orderer || '', factory: viewOrder.factory || '', note: viewOrder.note || '', mfgDate: viewOrder.mfgDate || '', rnNumber: viewOrder.rnNumber || '', details: (viewOrder.details || []).map(d => ({ ...d })), _idx: savedOrders.findIndex(o => o.id === viewOrder.id) }); }} className="flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-500 border border-slate-200 rounded px-2 py-0.5 hover:border-indigo-300">
                      <Pencil size={11} /> 수정
                    </button>
                  )}
                </div>
                {viewOrderEditMode ? (
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs text-slate-400">{viewOrder.date}</span>
                    <label className="flex items-center gap-1 text-xs text-slate-500">발주자 <input value={viewOrderEdits.orderer} onChange={e => setViewOrderEdits(p => ({ ...p, orderer: e.target.value }))} className="border border-slate-300 rounded px-2 py-0.5 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-orange-300" /></label>
                    <label className="flex items-center gap-1 text-xs text-slate-500">공장 <input value={viewOrderEdits.factory} onChange={e => setViewOrderEdits(p => ({ ...p, factory: e.target.value }))} className="border border-slate-300 rounded px-2 py-0.5 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-orange-300" /></label>
                    <label className="flex items-center gap-1 text-xs text-slate-500">특이사항 <input value={viewOrderEdits.note} onChange={e => setViewOrderEdits(p => ({ ...p, note: e.target.value }))} className="border border-slate-300 rounded px-2 py-0.5 text-xs w-36 focus:outline-none focus:ring-1 focus:ring-orange-300" /></label>
                    <label className="flex items-center gap-1 text-xs text-slate-500">제조년월 <input value={viewOrderEdits.mfgDate || ''} onChange={e => setViewOrderEdits(p => ({ ...p, mfgDate: e.target.value }))} placeholder="예: 2025.03" className="border border-slate-300 rounded px-2 py-0.5 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-orange-300" /></label>
                    <label className="flex items-center gap-1 text-xs text-slate-500">RN넘버 <input value={viewOrderEdits.rnNumber || ''} onChange={e => setViewOrderEdits(p => ({ ...p, rnNumber: e.target.value }))} placeholder="RN넘버" className="border border-slate-300 rounded px-2 py-0.5 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-orange-300" /></label>
                    <button onClick={() => {
                      const newDetails = (viewOrderEdits.details || viewOrder.details || []).map(({ _globalIdx, ...rest }) => rest);
                      const newTotalCost = newDetails.reduce((s, d) => s + (d.shortage > 0 ? (d.cost || 0) : 0), 0);
                      const updated = { ...viewOrder, orderer: viewOrderEdits.orderer, factory: viewOrderEdits.factory, note: viewOrderEdits.note, mfgDate: viewOrderEdits.mfgDate, rnNumber: viewOrderEdits.rnNumber, details: newDetails, totalCost: newTotalCost };
                      const orderEditFieldLabels = { orderer: '발주자', factory: '공장', note: '특이사항', mfgDate: '제조년월', rnNumber: 'RN넘버' };
                      const orderChanges = Object.keys(orderEditFieldLabels).filter(k => String(viewOrder[k] ?? '') !== String(viewOrderEdits[k] ?? '')).map(k => ({ field: orderEditFieldLabels[k], before: viewOrder[k], after: viewOrderEdits[k] }));
                      const oldDetails = (viewOrder.details || []);
                      const newDetailsCmp = newDetails;
                      newDetailsCmp.forEach((d, i) => { if (oldDetails[i] && oldDetails[i].shortage !== d.shortage) orderChanges.push({ field: `${d.name}(${d.size}) 발주수량`, before: oldDetails[i].shortage, after: d.shortage }); });
                      if (orderChanges.length > 0) addLog({ type: 'order_edit', productName: viewOrder.productName || '(미선택)', changes: orderChanges, summary: `발주 수정: ${viewOrder.productName || '(미선택)'}` });
                      setSavedOrders(prev => prev.map((o, i) => i === viewOrderEdits._idx ? updated : o));
                      setViewOrder(updated);
                      setViewOrderEditMode(false);
                    }} className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold px-3 py-1 rounded">저장</button>
                    <button onClick={() => setViewOrderEditMode(false)} className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1">취소</button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    {viewOrder.date} &nbsp;|&nbsp; 발주자: {viewOrder.orderer || '-'} &nbsp;|&nbsp; 공장: {viewOrder.factory || '-'}
                    {(viewOrder.mfgDate || viewOrder.rnNumber) && (
                      <> &nbsp;|&nbsp; 제조년월: <span className="text-amber-600 font-medium">{viewOrder.mfgDate || '-'}</span> &nbsp;|&nbsp; RN넘버: <span className="text-amber-600 font-medium">{viewOrder.rnNumber || '-'}</span></>
                    )}
                  </p>
                )}
              </div>
              <button onClick={() => { setViewOrder(null); setViewOrderEditMode(false); }} className="text-slate-400 hover:text-red-500 flex-shrink-0"><X size={20} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              {(() => {
                const dateStr = (() => {
                  const raw = viewOrder.date || '';
                  const d = new Date(raw);
                  if (isNaN(d)) return raw.slice(0,8);
                  return `${String(d.getFullYear()).slice(2)}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
                })();
                const activeDetails = viewOrderEditMode && viewOrderEdits.details ? viewOrderEdits.details : (viewOrder.details || []);
                const groups = {};
                activeDetails.forEach((d, globalIdx) => {
                  const v = d.vendor || '(공급처 미입력)';
                  if (!groups[v]) groups[v] = [];
                  groups[v].push({ ...d, _globalIdx: globalIdx });
                });
                return Object.entries(groups).map(([vendor, items]) => {
                  const needItems = items.filter(i => i.shortage > 0);
                  const vendorCost = needItems.reduce((s,i) => s + (i.cost || 0), 0);
                  return (
                    <div key={vendor} className="border border-slate-200 rounded-lg overflow-hidden">
                      <div className="bg-slate-700 text-white px-4 py-2 flex items-center justify-between text-sm">
                        <span className="font-bold">📦 {vendor}</span>
                        <span className="text-xs text-slate-300">발주 필요 {needItems.length}종 / 예상 비용 <span className="text-emerald-300 font-bold">{vendorCost.toLocaleString()}원</span></span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                              <th className="p-3 font-medium whitespace-nowrap">날짜</th>
                              <th className="p-3 font-medium whitespace-nowrap">발주자</th>
                              <th className="p-3 font-medium whitespace-nowrap">공장</th>
                              <th className="p-3 font-medium whitespace-nowrap">라벨명</th>
                              <th className="p-3 font-medium whitespace-nowrap">이미지</th>
                              <th className="p-3 font-medium whitespace-nowrap">상품명</th>
                              <th className="p-3 font-medium whitespace-nowrap text-center">SIZE</th>
                              <th className="p-3 font-medium whitespace-nowrap text-right bg-red-50 text-red-600">수량</th>
                              <th className="p-3 font-medium whitespace-nowrap">특이사항</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {items.map((d, i) => (
                              <tr key={i} className={d.shortage > 0 ? 'hover:bg-red-50/30' : 'hover:bg-slate-50 opacity-40'}>
                                <td className="p-3 text-slate-400 whitespace-nowrap">{dateStr}</td>
                                <td className="p-3 text-slate-700">{viewOrderEditMode ? (viewOrderEdits.orderer || '-') : (viewOrder.orderer || '-')}</td>
                                <td className="p-3 text-slate-700">{viewOrderEditMode ? (viewOrderEdits.factory || '-') : (viewOrder.factory || '-')}</td>
                                <td className="p-3">
                                  <div className="font-medium text-slate-800">{d.labelName || d.name}</div>
                                  <div className="text-xs text-slate-400">{d.code}</div>
                                  {(d.labelName || d.name || '').includes('케어라벨') && (
                                    <div className="mt-1 space-y-0.5">
                                      {(d.careInfo?.code || d.careInfo?.material) && (
                                        <div className="text-xs text-slate-500">
                                          {d.careInfo?.code && <span className="mr-2">품번: <span className="font-medium text-slate-700">{d.careInfo.code}</span></span>}
                                          {d.careInfo?.material && <span>소재: <span className="font-medium text-slate-700">{d.careInfo.material}</span></span>}
                                        </div>
                                      )}
                                      {(viewOrder.mfgDate || viewOrder.rnNumber) && (
                                        <div className="text-xs text-amber-600">
                                          {viewOrder.mfgDate && <span className="mr-2">제조년월: <span className="font-medium">{viewOrder.mfgDate}</span></span>}
                                          {viewOrder.rnNumber && <span>RN: <span className="font-medium">{viewOrder.rnNumber}</span></span>}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </td>
                                <td className="p-3">
                                  {d.img
                                    ? <img src={d.img} alt="" className="w-10 h-10 rounded object-cover border border-slate-200" />
                                    : <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center"><ImageIcon size={14} className="text-slate-300" /></div>
                                  }
                                </td>
                                <td className="p-3 text-slate-700">{viewOrder.productName || '-'}</td>
                                <td className="p-3 text-center text-slate-700 text-base font-bold">{d.size || '-'}</td>
                                <td className="p-3 text-right font-bold">
                                  {viewOrderEditMode
                                    ? <input
                                        type="number"
                                        min="0"
                                        value={d.shortage}
                                        onChange={e => setViewOrderEdits(prev => {
                                          const newDetails = [...prev.details];
                                          newDetails[d._globalIdx] = { ...newDetails[d._globalIdx], shortage: parseInt(e.target.value) || 0 };
                                          return { ...prev, details: newDetails };
                                        })}
                                        className="w-20 text-right border border-slate-300 rounded px-2 py-0.5 text-sm text-red-600 font-bold focus:outline-none focus:ring-1 focus:ring-orange-300"
                                      />
                                    : <span className={d.shortage > 0 ? 'text-red-600' : 'text-emerald-600'}>{d.shortage.toLocaleString()}개</span>
                                  }
                                </td>
                                <td className="p-3 text-slate-500 text-xs max-w-32 truncate">{viewOrderEditMode ? (viewOrderEdits.note || '-') : (viewOrder.note || '-')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                });
              })()}
              <div className="bg-slate-800 text-white rounded-lg px-5 py-3 flex justify-between items-center">
                <span className="text-slate-300 font-medium">총 예상 발주 비용 합계</span>
                <span className="text-emerald-400 font-bold text-lg">{viewOrder.totalCost?.toLocaleString()} 원</span>
              </div>
              <div className="flex justify-end pt-2">
                {viewOrder.applied
                  ? <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 text-green-600 font-medium text-sm bg-green-50 px-5 py-2.5 rounded-lg border border-green-200">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        발주 확정 완료 ({viewOrder.appliedAt})
                      </div>
                      <button onClick={() => cancelOrderFromStock(viewOrder)} className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-500 hover:text-red-700 px-4 py-2.5 rounded-lg font-medium text-sm border border-red-200 transition-colors">
                        ↩ 확정 취소
                      </button>
                    </div>
                  : <button onClick={() => applyOrderToStock(viewOrder)} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-6 py-2.5 rounded-lg font-bold shadow transition-colors">
                      📦 발주 확정 (재고 차감)
                    </button>
                }
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PDF 발주서 미리보기 팝업 */}
      {pdfPreview && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => { URL.revokeObjectURL(pdfPreview.url); setPdfPreview(null); }}>
          <div className="bg-white rounded-xl shadow-2xl flex flex-col" style={{ width: '92vw', height: '92vh' }} onClick={e => e.stopPropagation()}>
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-2">
                <FileDown size={18} className="text-blue-600" />
                <span className="font-bold text-slate-800 text-sm">{pdfPreview.filename}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.open(pdfPreview.url, '_blank')}
                  className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  새 탭에서 열기
                </button>
                <a
                  href={pdfPreview.url}
                  download={pdfPreview.filename}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                >
                  <Download size={15} /> 다운로드
                </a>
                <button onClick={() => { URL.revokeObjectURL(pdfPreview.url); setPdfPreview(null); }} className="text-slate-400 hover:text-red-500 p-1"><X size={20} /></button>
              </div>
            </div>
            {/* PDF 미리보기 — embed가 가장 안정적 */}
            <embed
              src={pdfPreview.url + '#toolbar=1&navpanes=0'}
              type="application/pdf"
              className="flex-1 w-full rounded-b-xl"
              style={{ border: 'none' }}
            />
          </div>
        </div>
      )}

      {/* 발주 계산기 라벨 상세 팝업 */}
      {calcLabelPopup && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setCalcLabelPopup(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">라벨 재고 상세</h3>
              <button onClick={() => setCalcLabelPopup(null)} className="text-slate-400 hover:text-red-500"><X size={20} /></button>
            </div>
            <div className="flex items-center gap-4">
              {calcLabelPopup.img
                ? <img src={calcLabelPopup.img} alt="" className="w-16 h-16 rounded-lg object-cover border border-slate-200" />
                : <div className="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center"><ImageIcon size={22} className="text-slate-300" /></div>
              }
              <div>
                <div className="font-bold text-slate-800 text-sm">{calcLabelPopup.name}</div>
                <div className="text-xs text-slate-400 mt-0.5">{calcLabelPopup.code}</div>
                <div className="text-xs text-slate-500 mt-1">{calcLabelPopup.brand} · {calcLabelPopup.type} · {calcLabelPopup.size}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <div className="text-xs text-slate-400 mb-1">현재고</div>
                <div className={`text-xl font-bold ${calcLabelPopup.stock < 0 ? 'text-red-600' : calcLabelPopup.stock === 0 ? 'text-slate-400' : 'text-blue-600'}`}>{calcLabelPopup.stock?.toLocaleString()}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <div className="text-xs text-slate-400 mb-1">안전재고</div>
                <div className="text-xl font-bold text-amber-600">{calcLabelPopup.safetyStock > 0 ? calcLabelPopup.safetyStock?.toLocaleString() : '-'}</div>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              {calcLabelPopup.price > 0 && <div className="flex justify-between"><span className="text-slate-400">단가</span><span className="font-medium text-slate-700">{calcLabelPopup.price?.toLocaleString()}원</span></div>}
              {calcLabelPopup.vendor && <div className="flex justify-between"><span className="text-slate-400">공급처</span><span className="font-medium text-slate-700">{calcLabelPopup.vendor}</span></div>}
              {Number(calcLabelPopup.safetyStock) > 0 && calcLabelPopup.stock < Number(calcLabelPopup.safetyStock) && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600 font-medium text-center">⚠️ 안전재고 미달</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* [5] 재고 로그 탭 */}
      {activeTab === 'logs' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800">
              <History className="text-slate-600" size={20} /> 재고 변동 로그
              <span className="text-sm font-normal text-slate-400">총 {stockLogs.length}건</span>
            </h2>
            <div className="flex items-center gap-2 ml-auto">
              <div className="flex items-center gap-1 border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
                <Search size={14} className="text-slate-400" />
                <input
                  type="text" value={logSearch} onChange={e => { setLogSearch(e.target.value); setLogPage(1); }}
                  placeholder="상품명, 라벨명 검색"
                  className="text-sm outline-none w-44 text-slate-700 placeholder-slate-400"
                />
              </div>
              {stockLogs.length > 0 && (
                <button
                  onClick={() => { if (window.confirm('로그 전체를 삭제하시겠습니까?')) setStockLogs([]); }}
                  className="text-xs text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors"
                >
                  전체 삭제
                </button>
              )}
            </div>
          </div>

          {stockLogs.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <History size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">변경 이력이 없습니다.</p>
            </div>
          ) : filteredStockLogs.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <Search size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">검색 결과가 없습니다.</p>
            </div>
          ) : (
            <>
              {/* 상단 페이지네이션 */}
              <div className="flex items-center justify-between flex-wrap gap-3 pb-1">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <span>페이지당</span>
                  {[30, 50, 100].map(size => (
                    <button key={size} onClick={() => { setLogPageSize(size); setLogPage(1); }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${logPageSize === size ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                      {size}
                    </button>
                  ))}
                  <span className="ml-2 text-slate-400">{filteredStockLogs.length}건 중 {(logPage-1)*logPageSize+1}–{Math.min(logPage*logPageSize, filteredStockLogs.length)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setLogPage(1)} disabled={logPage === 1} className="px-2 py-1 rounded text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30">«</button>
                  <button onClick={() => setLogPage(p => Math.max(1, p-1))} disabled={logPage === 1} className="px-2 py-1 rounded text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30">‹</button>
                  {Array.from({length: logTotalPages}, (_, i) => i+1)
                    .filter(p => p === 1 || p === logTotalPages || Math.abs(p - logPage) <= 2)
                    .reduce((acc, p, idx, arr) => { if (idx > 0 && p - arr[idx-1] > 1) acc.push('...'); acc.push(p); return acc; }, [])
                    .map((p, idx) => p === '...' ? (
                      <span key={`e${idx}`} className="px-1.5 py-1 text-xs text-slate-400">…</span>
                    ) : (
                      <button key={p} onClick={() => setLogPage(p)}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${logPage === p ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                        {p}
                      </button>
                    ))}
                  <button onClick={() => setLogPage(p => Math.min(logTotalPages, p+1))} disabled={logPage === logTotalPages} className="px-2 py-1 rounded text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30">›</button>
                  <button onClick={() => setLogPage(logTotalPages)} disabled={logPage === logTotalPages} className="px-2 py-1 rounded text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30">»</button>
                </div>
              </div>
              {/* 로그 카드 목록 */}
              <div className="space-y-3">
                {pagedStockLogs.map(log => renderLogCard(log))}
              </div>
            </>
          )}

        </div>
      )}

      {/* 상품 수정 모달 */}
      {editProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditProduct(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-slate-800">상품 정보 수정</h3>
              <button onClick={() => setEditProduct(null)} className="text-slate-400 hover:text-red-500"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">브랜드</label>
                <select value={editProduct.brand || '공용'} onChange={e => setEditProduct({ ...editProduct, brand: e.target.value })} className="w-full p-2 border border-slate-300 rounded text-sm bg-white">
                  <option value="WV">WV</option>
                  <option value="JM">JM</option>
                  <option value="EZ">EZ</option>
                  <option value="FP">FP</option>
                  <option value="공용">공용</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">상품명</label>
                <input type="text" value={editProduct.name} onChange={e => setEditProduct({ ...editProduct, name: e.target.value })} className="w-full p-2 border border-slate-300 rounded text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditProduct(null)} className="px-4 py-2 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg">취소</button>
              <button onClick={saveEditProduct} className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg font-medium">저장</button>
            </div>
          </div>
        </div>
      )}

      {/* 라벨 발주 로그 모달 */}
      {labelLogModal && (() => {
        // labelId 직접 매칭 또는 이름+사이즈 폴백 매칭 (구버전 ID 호환)
        const labelLogs = stockLogs.filter(log =>
          log.items?.some(item =>
            item.labelId === labelLogModal.id ||
            (item.labelName === labelLogModal.name && item.size === labelLogModal.size)
          )
        );
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setLabelLogModal(null)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                    <History size={16} className="text-blue-500" />
                    발주 로그
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">{labelLogModal.name} {labelLogModal.size && `(${labelLogModal.size})`}</p>
                </div>
                <button onClick={() => setLabelLogModal(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
              </div>
              {labelLogs.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <History size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">발주 이력이 없습니다.</p>
                </div>
              ) : (
                <div className="overflow-auto max-h-[720px]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-xs">
                        <th className="p-2 text-left font-medium">발주날짜</th>
                        <th className="p-2 text-left font-medium">사용자</th>
                        <th className="p-2 text-left font-medium">공장명</th>
                        <th className="p-2 text-left font-medium">상품명</th>
                        <th className="p-2 text-right font-medium">수량</th>
                        <th className="p-2 text-center font-medium">구분</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {labelLogs.map(log => {
                        const item = log.items?.find(i =>
                          i.labelId === labelLogModal.id ||
                          (i.labelName === labelLogModal.name && i.size === labelLogModal.size)
                        );
                        return (
                          <tr key={log.id} className="hover:bg-slate-50">
                            <td className="p-2 text-slate-600 whitespace-nowrap">{log.date}</td>
                            <td className="p-2 text-slate-700 whitespace-nowrap">
                              {log.userName && <div className="font-medium">{log.userName}</div>}
                              {log.userId && <div className="text-xs text-slate-400">{log.userId}</div>}
                              {!log.userName && !log.userId && <span className="text-slate-300">-</span>}
                            </td>
                            <td className="p-2 text-slate-700">{log.factory || '-'}</td>
                            <td className="p-2 text-slate-700">{log.productName || '-'}</td>
                            <td className="p-2 text-right font-medium">
                              <span className={log.type === 'deduct' ? 'text-orange-600' : 'text-blue-600'}>
                                {log.type === 'deduct' ? '-' : '+'}{Math.abs(item?.change ?? 0).toLocaleString()}
                              </span>
                            </td>
                            <td className="p-2 text-center">
                              <span className={`text-xs px-1.5 py-0.5 rounded-full ${log.type === 'deduct' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                                {log.type === 'deduct' ? '차감' : '복원'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* 라벨 수정 모달 */}
      {editLabel && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditLabel(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-slate-800">라벨 정보 수정</h3>
              <button onClick={() => setEditLabel(null)} className="text-slate-400 hover:text-red-500"><X size={20} /></button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">브랜드</label>
                <select value={editLabel.brand} onChange={e => setEditLabel({ ...editLabel, brand: e.target.value })} className="w-full p-2 border border-slate-300 rounded text-sm bg-white">
                  <option value="WV">WV</option>
                  <option value="JM">JM</option>
                  <option value="EZ">EZ</option>
                  <option value="FP">FP</option>
                  <option value="공용">공용</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">종류</label>
                <input type="text" value={editLabel.type} onChange={e => setEditLabel({ ...editLabel, type: e.target.value })} className="w-full p-2 border border-slate-300 rounded text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">라벨명</label>
                <input type="text" value={editLabel.name} onChange={e => setEditLabel({ ...editLabel, name: e.target.value })} className="w-full p-2 border border-slate-300 rounded text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">품번</label>
                <input type="text" value={editLabel.code} onChange={e => setEditLabel({ ...editLabel, code: e.target.value })} className="w-full p-2 border border-slate-300 rounded text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">사이즈</label>
                <input type="text" value={editLabel.size} onChange={e => setEditLabel({ ...editLabel, size: e.target.value })} className="w-full p-2 border border-slate-300 rounded text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">현재 재고</label>
                <input type="number" value={editLabel.stock} onChange={e => setEditLabel({ ...editLabel, stock: parseInt(e.target.value) || 0 })} className="w-full p-2 border border-slate-300 rounded text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">최소보유수량 <span className="text-amber-500">(발주 계산 제외)</span></label>
                <input type="number" value={editLabel.reserveStock ?? 0} onChange={e => setEditLabel({ ...editLabel, reserveStock: parseInt(e.target.value) || 0 })} className="w-full p-2 border border-amber-300 rounded text-sm" placeholder="예: 100" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">단가(원)</label>
                <input type="number" value={editLabel.price} onChange={e => setEditLabel({ ...editLabel, price: parseInt(e.target.value) || 0 })} className="w-full p-2 border border-slate-300 rounded text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">공급처</label>
                <input type="text" value={editLabel.vendor} onChange={e => setEditLabel({ ...editLabel, vendor: e.target.value })} className="w-full p-2 border border-slate-300 rounded text-sm" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-slate-500 mb-1">이미지</label>
                <div className="flex items-center gap-3">
                  {editLabel.img && (
                    <div className="flex items-center gap-2">
                      <img src={editLabel.img} alt="preview" className="w-12 h-12 rounded object-cover border border-slate-200" />
                      <button
                        onClick={() => setEditLabel(prev => ({ ...prev, img: '' }))}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                        title="이미지 삭제"
                      >
                        <Trash2 size={12} /> 이미지 삭제
                      </button>
                    </div>
                  )}
                  <input type="file" accept="image/*" onChange={handleEditImageUpload} className="text-sm" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditLabel(null)} className="px-4 py-2 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg">취소</button>
              <button onClick={saveEdit} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg font-medium">저장</button>
            </div>
          </div>
        </div>
      )}

      {/* [6] 자료실 탭 */}
      {activeTab === 'docs' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-5">
          {/* 헤더 */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800">
              {docActiveFolder ? (
                <button onClick={() => { setDocActiveFolder(null); setDocSearch(''); setDocImageBrandFilter('전체'); }} className="flex items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors mr-1">
                  <ChevronLeft size={18} />
                </button>
              ) : null}
              <FolderOpen size={20} className="text-teal-600" />
              {docActiveFolder ? (
                <>
                  <span className="text-slate-400 font-normal">자료실</span>
                  <span className="text-slate-400">/</span>
                  {docActiveFolder}
                  <span className="text-sm font-normal text-slate-400">({filteredDocs.length}개)</span>
                </>
              ) : (
                <>자료실 <span className="text-sm font-normal text-slate-400">({documents.length}개)</span></>
              )}
            </h2>
            {docActiveFolder && (
              <label className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${docUploading ? 'bg-slate-200 text-slate-400' : 'bg-teal-600 text-white hover:bg-teal-700'}`}>
                <FilePlus size={16} />
                {docUploading ? '업로드 중...' : '파일 추가'}
                <input type="file" multiple className="hidden" onChange={handleDocUpload} disabled={docUploading} />
              </label>
            )}
          </div>

          {/* 폴더 목록 화면 */}
          {!docActiveFolder ? (
            <>
            <div className="flex justify-end">
              <button onClick={syncLabelImages} className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg text-xs font-medium transition-colors" title="라벨이미지 폴더의 파일명(라벨명 품번)을 기준으로 재고리스트 이미지 자동 매핑">
                <ImageIcon size={14} /> 재고리스트에 이미지 매핑
              </button>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {DOC_FOLDERS.map(folder => {
                const count = documents.filter(d => d.category === folder.id).length;
                const FolderIcon = folder.icon;
                return (
                  <button key={folder.id} onClick={() => { setDocActiveFolder(folder.id); setDocSearch(''); }}
                    className={`flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 ${folder.border} ${folder.bg} hover:shadow-md transition-all group`}>
                    <div className={`w-14 h-14 rounded-2xl bg-white shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform`}>
                      <FolderIcon size={28} className={folder.color} />
                    </div>
                    <div className="text-center">
                      <p className={`font-bold text-base ${folder.color}`}>{folder.label}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{count}개 파일</p>
                    </div>
                  </button>
                );
              })}
            </div>
            </>
          ) : docActiveFolder === '계정관리' ? (
            /* 계정관리 폴더 = 관리자 전용 사용자 관리 */
            <AdminPage currentUser={user} />
          ) : docActiveFolder === '재고로그' ? (
            /* 재고로그 폴더 = 재고 변동 로그 뷰 */
            <>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <span className="text-sm text-slate-500">총 {stockLogs.length}건</span>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
                    <Search size={14} className="text-slate-400" />
                    <input type="text" value={logSearch} onChange={e => { setLogSearch(e.target.value); setLogPage(1); }}
                      placeholder="상품명, 라벨명 검색"
                      className="text-sm outline-none w-44 text-slate-700 placeholder-slate-400" />
                  </div>
                  {stockLogs.length > 0 && (
                    <button onClick={() => { if (window.confirm('로그 전체를 삭제하시겠습니까?')) setStockLogs([]); }}
                      className="text-xs text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors">
                      전체 삭제
                    </button>
                  )}
                </div>
              </div>
              {stockLogs.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <History size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">변경 이력이 없습니다.</p>
                </div>
              ) : filteredStockLogs.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <Search size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">검색 결과가 없습니다.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredStockLogs.map(log => renderLogCard(log))}
                </div>
              )}
            </>
          ) : (
            <>
              {/* 라벨이미지 브랜드 필터 */}
              {docActiveFolder === '라벨이미지' && (
                <div className="flex flex-wrap gap-1.5">
                  {labelImgBrands.map(brand => (
                    <button key={brand} onClick={() => setDocImageBrandFilter(brand)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${docImageBrandFilter === brand ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-purple-50 hover:border-purple-300 hover:text-purple-700'}`}>
                      {brand}
                    </button>
                  ))}
                </div>
              )}
              {/* 검색 */}
              <div className="flex items-center gap-2">
                <Search size={15} className="text-slate-400" />
                <input
                  type="text" placeholder="파일명 검색" value={docSearch} onChange={e => setDocSearch(e.target.value)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm w-56 focus:outline-none focus:ring-2 focus:ring-teal-300"
                />
              </div>

              {/* 파일 목록 */}
              {filteredDocs.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <FolderOpen size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">{docSearch ? '검색 결과가 없습니다.' : '파일을 추가해주세요.'}</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredDocs.map(d => (
                    <div key={d.id} className="flex items-center gap-3 py-3 hover:bg-slate-50 rounded-lg px-2 transition-colors group">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                        {getFileIcon(d.ext)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{d.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {formatBytes(d.size)} · {new Date(d.uploadedAt).toLocaleDateString('ko-KR')}
                        </p>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <a href={d.url} target="_blank" rel="noopener noreferrer"
                          className="p-1.5 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 transition-colors" title="다운로드">
                          <Download size={15} />
                        </a>
                        <button onClick={() => deleteDocument(d)}
                          className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors" title="삭제">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* CSV 대량 등록 확인 모달 */}
      {csvImportPending && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setCsvImportPending(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Upload size={18} className="text-emerald-600" /> CSV 대량 등록 확인
              </h3>
              <button onClick={() => setCsvImportPending(null)} className="text-slate-400 hover:text-red-500"><X size={20} /></button>
            </div>

            <div className="space-y-3">
              {/* 신규 등록 */}
              <div className={`rounded-lg p-3 ${csvImportPending.newLabels.length > 0 ? 'bg-green-50 border border-green-200' : 'bg-slate-50 border border-slate-200'}`}>
                <p className="text-sm font-semibold text-slate-700">
                  ➕ 신규 등록 <span className={`ml-1 font-bold ${csvImportPending.newLabels.length > 0 ? 'text-green-700' : 'text-slate-400'}`}>{csvImportPending.newLabels.length}개</span>
                </p>
                {csvImportPending.newLabels.length > 0 && (
                  <p className="text-xs text-slate-500 mt-1">{csvImportPending.newLabels.slice(0, 3).map(l => l.name).join(', ')}{csvImportPending.newLabels.length > 3 ? ` 외 ${csvImportPending.newLabels.length - 3}개` : ''}</p>
                )}
              </div>

              {/* 중복 업데이트 */}
              <div className={`rounded-lg p-3 ${csvImportPending.duplicateUpdates.length > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50 border border-slate-200'}`}>
                <p className="text-sm font-semibold text-slate-700">
                  ✏️ 빈 항목 채우기 <span className={`ml-1 font-bold ${csvImportPending.duplicateUpdates.length > 0 ? 'text-amber-700' : 'text-slate-400'}`}>{csvImportPending.duplicateUpdates.length}개</span>
                </p>
                {csvImportPending.duplicateUpdates.length > 0 && (
                  <div className="mt-2 max-h-40 overflow-y-auto space-y-1.5">
                    {csvImportPending.duplicateUpdates.map((u, i) => (
                      <div key={i} className="text-xs bg-white rounded border border-amber-100 px-2.5 py-1.5">
                        <span className="font-medium text-slate-700">{u.existing.name} ({u.existing.code})</span>
                        <span className="text-slate-400 ml-2">
                          {Object.entries(u.fieldsToFill).map(([f, v]) => `${CSV_FIELD_LABEL[f]}: ${v}`).join(' / ')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 변경 없는 중복 */}
              {csvImportPending.duplicateCount - csvImportPending.duplicateUpdates.length > 0 && (
                <div className="rounded-lg p-3 bg-slate-50 border border-slate-200">
                  <p className="text-sm text-slate-500">
                    ⏭ 변경 없음 (이미 동일한 데이터) <span className="font-bold">{csvImportPending.duplicateCount - csvImportPending.duplicateUpdates.length}개</span>
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setCsvImportPending(null)} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">취소</button>
              <button onClick={applyCSVImport} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium">
                확인 ({csvImportPending.newLabels.length + csvImportPending.duplicateUpdates.length}개 적용)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 이미지 미리보기 모달 */}
      {previewImg && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-8" onClick={() => setPreviewImg(null)}>
          <div className="relative max-w-2xl max-h-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreviewImg(null)} className="absolute -top-3 -right-3 bg-white text-slate-600 hover:text-red-500 rounded-full p-1.5 shadow-lg z-10">
              <X size={20} />
            </button>
            <img src={previewImg} alt="미리보기" className="max-w-full max-h-[80vh] rounded-xl shadow-2xl object-contain bg-white" />
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
