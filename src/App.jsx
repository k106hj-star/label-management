import React, { useState, useEffect, useRef } from 'react';
import { Package, Calculator, Layers, Plus, Trash2, Image as ImageIcon, AlertCircle, ZoomIn, X, Upload, MoreVertical, Pencil, Search, GripVertical, ClipboardList, Save } from 'lucide-react';
import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

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

// CSV 파서 함수 (따옴표 안의 쉼표 처리)
function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current);
    if (fields.length < 7) continue;

    const stockRaw = fields[5].replace(/,/g, '').trim();
    const stock = (!stockRaw || stockRaw === '-') ? 0 : (parseInt(stockRaw) || 0);
    const priceRaw = fields[6].replace(/,/g, '').trim();
    const price = (!priceRaw || priceRaw === '-') ? 0 : (parseInt(priceRaw) || 0);

    results.push({
      id: i,
      brand: fields[0].trim(),
      type: fields[1].trim(),
      name: fields[2].trim(),
      size: fields[3].trim(),
      code: fields[4].trim(),
      stock,
      price,
      vendor: (fields[7] || '').trim(),
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

export default function App() {
  const [activeTab, setActiveTab] = useState('inventory');

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
    if (savedVersion === String(DATA_VERSION)) {
      const saved = localStorage.getItem('label_products');
      return saved ? JSON.parse(saved) : initialProducts;
    }
    return initialProducts;
  });

  // Firestore에서 products 로드 (앱 시작 시 1회)
  const firestoreLoaded = useRef(false);
  useEffect(() => {
    if (firestoreLoaded.current) return;
    firestoreLoaded.current = true;
    getDoc(doc(db, 'settings', 'products')).then(snap => {
      if (snap.exists()) {
        const data = snap.data().list;
        if (Array.isArray(data) && data.length > 0) {
          setProducts(data);
          localStorage.setItem('label_products', JSON.stringify(data));
        }
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    localStorage.setItem('label_inventory', JSON.stringify(labels));
    localStorage.setItem('label_data_version', String(DATA_VERSION));
  }, [labels]);

  // localStorage + Firestore 동시 저장
  useEffect(() => {
    localStorage.setItem('label_products', JSON.stringify(products));
    setDoc(doc(db, 'settings', 'products'), { list: products }).catch(() => {});
  }, [products]);

  // 이미지 미리보기 모달 상태
  const [previewImg, setPreviewImg] = useState(null);

  // 드롭다운 메뉴 & 수정 모달 상태
  const [openMenuId, setOpenMenuId] = useState(null);
  const [editLabel, setEditLabel] = useState(null);

  const startEdit = (label) => {
    setEditLabel({ ...label });
    setOpenMenuId(null);
  };

  const saveEdit = () => {
    if (!editLabel.name || !editLabel.code) return alert('라벨명과 품번은 필수입니다.');
    setLabels(prev => prev.map(l => l.id === editLabel.id ? { ...editLabel } : l));
    setEditLabel(null);
  };

  const handleEditImageUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const compressed = await compressImage(file);
      setEditLabel(prev => ({ ...prev, img: compressed }));
    }
  };

  // 브랜드 필터 & 검색 상태
  const [brandFilter, setBrandFilter] = useState('전체');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const brandList = ['전체', 'WV', 'JM', 'EZ', 'FP', '공용'];

  const executeSearch = () => setSearchQuery(searchInput);

  const filteredLabels = labels.filter(l => {
    const brandMatch = brandFilter === '전체' || l.brand === brandFilter;
    if (!searchQuery.trim()) return brandMatch;
    const q = searchQuery.trim().toLowerCase();
    return brandMatch && (
      l.name.toLowerCase().includes(q) ||
      l.code.toLowerCase().includes(q) ||
      l.type.toLowerCase().includes(q) ||
      l.vendor.toLowerCase().includes(q) ||
      l.size.toLowerCase().includes(q)
    );
  });

  // --- [1] 라벨 마스터 관련 함수 ---
  const [newLabel, setNewLabel] = useState({ brand: 'WV', type: '행택', name: '', size: '', code: '', stock: 0, price: 0, vendor: '', img: '' });

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const compressed = await compressImage(file);
      setNewLabel(prev => ({ ...prev, img: compressed }));
    }
  };

  // CSV 대량 업로드 핸들러
  const handleCSVUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        alert('유효한 데이터가 없습니다. CSV 형식을 확인해주세요.\n\n필수 컬럼: 브랜드, 종류, 라벨 명, 사이즈, 품번, 재고수량, 단가, 공급처');
        return;
      }
      const existingKeys = new Set(labels.map(l => `${l.code}_${l.size}`));
      const newLabels = parsed
        .filter(p => !existingKeys.has(`${p.code}_${p.size}`))
        .map((p, idx) => ({ ...p, id: Date.now() + idx }));

      if (newLabels.length === 0) {
        alert(`${parsed.length}개 데이터 확인 완료.\n모든 데이터가 이미 등록되어 있습니다.`);
        return;
      }

      setLabels(prev => [...prev, ...newLabels]);
      alert(`총 ${parsed.length}개 중 ${newLabels.length}개의 새로운 라벨이 등록되었습니다.\n(중복 ${parsed.length - newLabels.length}개 제외)`);
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const addLabel = () => {
    if (!newLabel.name || !newLabel.code) return alert('라벨명과 품번은 필수입니다.');
    setLabels([...labels, { ...newLabel, id: Date.now() }]);
    setNewLabel({ brand: 'WV', type: '행택', name: '', size: '', code: '', stock: 0, price: 0, vendor: '', img: '' });
  };

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
  const [productSearch, setProductSearch] = useState('');

  const startEditProduct = (product) => {
    setEditProduct({ ...product });
    setOpenProductMenuId(null);
  };

  const saveEditProduct = () => {
    if (!editProduct.name) return alert('상품명은 필수입니다.');
    setProducts(prev => prev.map(p => p.id === editProduct.id ? { ...editProduct } : p));
    if (selectedProduct?.id === editProduct.id) {
      setSelectedProduct(editProduct);
    }
    setEditProduct(null);
  };

  const addProduct = () => {
    if (!newProductName) return;
    const newProd = { id: Date.now(), brand: newProductBrand, name: newProductName, bom: [] };
    setProducts([...products, newProd]);
    setNewProductBrand('WV');
    setNewProductName('');
    setSelectedProduct(newProd);
  };

  const deleteProduct = (id) => {
    if (window.confirm('상품을 삭제하시겠습니까?')) {
      setProducts(products.filter(p => p.id !== id));
      if (selectedProduct?.id === id) {
        setSelectedProduct(null);
      }
    }
  };

  const addLabelToBom = () => {
    if (!selectedProduct || bomSelection.labelIds.length === 0) return;
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
    setBomSelection({ ...bomSelection, labelIds: [] });
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

  useEffect(() => {
    localStorage.setItem('label_saved_orders', JSON.stringify(savedOrders));
    setDoc(doc(db, 'settings', 'savedOrders'), { list: savedOrders }).catch(() => {});
  }, [savedOrders]);

  const firestoreOrdersLoaded = useRef(false);
  useEffect(() => {
    if (firestoreOrdersLoaded.current) return;
    firestoreOrdersLoaded.current = true;
    getDoc(doc(db, 'settings', 'savedOrders')).then(snap => {
      if (snap.exists()) {
        const data = snap.data().list;
        if (Array.isArray(data) && data.length > 0) {
          setSavedOrders(data);
        }
      }
    }).catch(() => {});
  }, []);

  // --- [3] 발주 계산기 함수 ---
  const [calcTarget, setCalcTarget] = useState('');
  const [calcSearchText, setCalcSearchText] = useState('');
  const [calcSearchOpen, setCalcSearchOpen] = useState(false);
  const calcSearchRef = useRef(null);
  const [calcColorText, setCalcColorText] = useState('');
  const [calcSizeText, setCalcSizeText] = useState('');
  const [calcQtyGrid, setCalcQtyGrid] = useState({});
  const [calcResult, setCalcResult] = useState(null);
  const [calcFactory, setCalcFactory] = useState('');
  const [calcOrderer, setCalcOrderer] = useState('');
  const [calcNote, setCalcNote] = useState('');

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
    const details = product.bom.map(item => {
      const label = labels.find(l => l.id === item.labelId);
      if (!label) return null;
      const totalNeed = item.qtyPerUnit * totalQty;
      const shortage = Math.max(0, totalNeed - label.stock);
      const cost = shortage * label.price;
      totalCost += cost;
      return { ...label, needQty: totalNeed, shortage, cost };
    }).filter(Boolean);
    setCalcResult({ details, totalCost, totalQty, sizeBreakdown: validRows });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* 헤더 */}
        <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-slate-100">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">라벨 재고 및 지능형 발주 시스템</h1>
            <p className="text-sm text-slate-500 mt-1">전체 라벨 {labels.length}종 등록 완료</p>
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
            <button onClick={() => setActiveTab('orders')} className={`relative flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === 'orders' ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              <ClipboardList size={18} /> 저장리스트
              {savedOrders.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">{savedOrders.length}</span>
              )}
            </button>
          </div>
        </div>

        {/* [1] 라벨 마스터 탭 */}
        {activeTab === 'inventory' && (
          <>
          {(() => {
            const lowStockLabels = labels.filter(l => (l.safetyStock || 0) > 0 && l.stock < l.safetyStock);
            if (lowStockLabels.length === 0) return null;
            return (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-center gap-2 text-red-700 font-bold mb-2">
                  <AlertCircle size={18} /> 안전재고 미달 라벨 ({lowStockLabels.length}건)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {lowStockLabels.map(l => (
                    <div key={l.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 text-sm border border-red-100">
                      <span className="font-medium text-slate-700">[{l.brand}] {l.name} <span className="text-slate-400">({l.size})</span></span>
                      <span className="text-red-600 font-bold ml-2">{l.stock} / {l.safetyStock}</span>
                    </div>
                  ))}
                </div>
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
                <div className="flex gap-1">
                  {brandList.map(b => (
                    <button key={b} onClick={() => setBrandFilter(b)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${brandFilter === b ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                      {b}
                    </button>
                  ))}
                </div>
                {/* CSV 대량 업로드 버튼 */}
                <label className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium cursor-pointer transition-colors">
                  <Upload size={16} /> CSV 대량 등록
                  <input type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" />
                </label>
              </div>
            </div>

            <div className="overflow-auto max-h-[70vh] border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-sm text-slate-600">
                    <th className="p-3 font-medium sticky top-0 bg-slate-50 z-10">이미지</th>
                    <th className="p-3 font-medium sticky top-0 bg-slate-50 z-10">브랜드</th>
                    <th className="p-3 font-medium sticky top-0 bg-slate-50 z-10">종류</th>
                    <th className="p-3 font-medium sticky top-0 bg-slate-50 z-10">라벨명</th>
                    <th className="p-3 font-medium sticky top-0 bg-slate-50 z-10">품번</th>
                    <th className="p-3 font-medium sticky top-0 bg-slate-50 z-10">사이즈</th>
                    <th className="p-3 font-medium text-right sticky top-0 bg-slate-50 z-10">현재고</th>
                    <th className="p-3 font-medium text-right sticky top-0 bg-slate-50 z-10">안전재고</th>
                    <th className="p-3 font-medium text-right sticky top-0 bg-slate-50 z-10">단가</th>
                    <th className="p-3 font-medium sticky top-0 bg-slate-50 z-10">공급처</th>
                    <th className="p-3 font-medium text-center sticky top-0 bg-slate-50 z-10">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLabels.map(l => (
                    <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3">
                        <div className="relative group">
                          <label className="cursor-pointer block">
                            <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                              const file = e.target.files[0];
                              if (file) {
                                const compressed = await compressImage(file);
                                setLabels(prev => prev.map(item => item.id === l.id ? { ...item, img: compressed } : item));
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
                      <td className={`p-3 text-right font-bold ${l.stock > 0 && l.stock >= (l.safetyStock || 0) ? 'text-blue-600' : l.stock > 0 ? 'text-orange-500' : 'text-slate-400'}`}>{l.stock.toLocaleString()}</td>
                      <td className="p-3 text-right text-sm">
                        <input type="number" min="0" value={l.safetyStock || 0} onChange={e => setLabels(labels.map(lb => lb.id === l.id ? { ...lb, safetyStock: parseInt(e.target.value) || 0 } : lb))} className="w-16 p-1 border border-slate-200 rounded text-right text-sm bg-white" />
                      </td>
                      <td className="p-3 text-right">{l.price > 0 ? `${l.price.toLocaleString()}원` : '-'}</td>
                      <td className="p-3 text-sm">{l.vendor || '-'}</td>
                      <td className="p-3 text-center relative">
                        <button onClick={() => setOpenMenuId(openMenuId === l.id ? null : l.id)} className="text-slate-400 hover:text-slate-600 p-1">
                          <MoreVertical size={16} />
                        </button>
                        {openMenuId === l.id && (
                          <>
                            <div className="fixed inset-0 z-20" onClick={() => setOpenMenuId(null)} />
                            <div className="absolute right-0 top-10 z-30 bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-28">
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
                    <option value="WV">WV</option>
                    <option value="JM">JM</option>
                    <option value="EZ">EZ</option>
                    <option value="FP">FP</option>
                    <option value="공용">공용</option>
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
                    <div className="flex gap-4 items-end mb-3">
                    <div className="w-32">
                      <label className="block text-xs text-slate-500 mb-1">브랜드 필터</label>
                      <select value={bomBrandFilter} onChange={e => { setBomBrandFilter(e.target.value); setBomSelection({ ...bomSelection, labelIds: [] }); }} className="w-full p-2 border border-slate-300 rounded text-sm bg-white">
                        <option value="auto">{selectedProduct.brand}</option>
                        {[...new Set(labels.map(l => l.brand))].filter(b => b !== '공용' && b !== selectedProduct.brand).map(b => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                        <option value="공용">공용</option>
                        <option value="all">전체</option>
                      </select>
                    </div>
                    <div className="w-24">
                      <label className="block text-xs text-slate-500 mb-1">1벌당 수량</label>
                      <input type="number" min="1" value={bomSelection.qty} onChange={e => setBomSelection({ ...bomSelection, qty: e.target.value })} className="w-full p-2 border border-slate-300 rounded text-sm bg-white" />
                    </div>
                    <button onClick={addLabelToBom} disabled={bomSelection.labelIds.length === 0} className={`px-4 py-2 rounded text-sm font-medium ${bomSelection.labelIds.length > 0 ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-slate-300 text-slate-500 cursor-not-allowed'}`}>
                      추가 {bomSelection.labelIds.length > 0 && `(${bomSelection.labelIds.length})`}
                    </button>
                    </div>
                    <div className="max-h-48 overflow-y-auto border border-slate-200 rounded bg-white">
                      {labels.filter(l => {
                        if (bomBrandFilter === 'all') return true;
                        const brand = bomBrandFilter === 'auto' ? selectedProduct.brand : bomBrandFilter;
                        return l.brand === brand;
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
                        const isCareLabel = label.name.includes('케어라벨');
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
                                    <div>
                                      <label className="block text-xs text-slate-500 mb-0.5">제조년월</label>
                                      <input type="text" placeholder="예: 2024.06" value={item.careInfo?.mfgDate || ''} onChange={e => updateBomItemInfo(selectedProduct.id, item.labelId, 'mfgDate', e.target.value)} className="w-full p-1.5 border border-slate-300 rounded text-xs bg-white" />
                                    </div>
                                    <div>
                                      <label className="block text-xs text-slate-500 mb-0.5">RN넘버</label>
                                      <input type="text" placeholder="RN넘버 입력" value={item.careInfo?.rnNumber || ''} onChange={e => updateBomItemInfo(selectedProduct.id, item.labelId, 'rnNumber', e.target.value)} className="w-full p-1.5 border border-slate-300 rounded text-xs bg-white" />
                                    </div>
                                  </div>
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
                              onMouseDown={() => { setCalcTarget(String(p.id)); setCalcSearchText(`[${p.brand}] ${p.name}`); setCalcSearchOpen(false); setCalcResult(null); }}
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
                  <input type="text" value={calcOrderer} onChange={e => setCalcOrderer(e.target.value)} placeholder="발주자명 입력" className="w-full p-3 border border-emerald-200 rounded-lg bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-emerald-900 mb-2">특이사항</label>
                <textarea value={calcNote} onChange={e => setCalcNote(e.target.value)} placeholder="특이사항 입력 (선택)" rows="2" className="w-full p-3 border border-emerald-200 rounded-lg bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm resize-none" />
              </div>
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

              <button onClick={calculateOrder} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white p-3 rounded-lg font-bold shadow-md transition-transform active:scale-95">
                재고 확인 및 발주량 계산
              </button>
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
                                <th className="p-3 font-medium whitespace-nowrap text-right bg-red-50 text-red-600">수량</th>
                                <th className="p-3 font-medium whitespace-nowrap">특이사항</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {items.map((item, idx) => (
                                <tr key={idx} className={item.shortage > 0 ? 'hover:bg-red-50/30' : 'hover:bg-slate-50 opacity-40'}>
                                  <td className="p-3 text-slate-400 whitespace-nowrap">{todayStr}</td>
                                  <td className="p-3 text-slate-700">{calcOrderer || '-'}</td>
                                  <td className="p-3 text-slate-700">{calcFactory || '-'}</td>
                                  <td className="p-3">
                                    <div className="font-medium text-slate-800">{item.name}</div>
                                    <div className="text-xs text-slate-400">{item.code}</div>
                                  </td>
                                  <td className="p-3">
                                    {item.img
                                      ? <img src={item.img} alt="img" className="w-10 h-10 rounded object-cover border border-slate-200" />
                                      : <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center"><ImageIcon size={14} className="text-slate-300" /></div>
                                    }
                                  </td>
                                  <td className="p-3 text-slate-700 whitespace-nowrap">{calcSearchText || '-'}</td>
                                  <td className="p-3 text-center text-slate-600">{item.size || '-'}</td>
                                  <td className="p-3 text-right font-bold">
                                    {item.shortage > 0
                                      ? <span className="text-red-600">{item.shortage.toLocaleString()}개</span>
                                      : <span className="text-emerald-600 text-xs font-normal">재고충분</span>
                                    }
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
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => {
                      const order = {
                        id: Date.now(),
                        date: new Date().toLocaleString('ko-KR'),
                        productName: calcSearchText,
                        factory: calcFactory,
                        orderer: calcOrderer,
                        note: calcNote,
                        totalCost: calcResult.totalCost,
                        totalQty: calcResult.details.reduce((s, d) => s + d.need, 0),
                        details: calcResult.details,
                      };
                      setSavedOrders(prev => [order, ...prev]);
                      alert('발주 내용이 저장되었습니다!');
                    }}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-lg font-bold shadow transition-colors"
                  >
                    <Save size={18} /> 발주내용 저장
                  </button>
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
              <button onClick={() => { if (window.confirm('저장리스트를 전체 삭제할까요?')) setSavedOrders([]); }} className="text-sm text-red-400 hover:text-red-600 font-medium">전체 삭제</button>
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
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {savedOrders.map((order, idx) => (
                    <React.Fragment key={order.id}>
                      <tr className="hover:bg-slate-50">
                        <td className="p-3 text-slate-400 text-xs whitespace-nowrap">{order.date}</td>
                        <td className="p-3 font-medium text-slate-800">{order.productName || '(미선택)'}</td>
                        <td className="p-3 text-slate-600">{order.factory || '-'}</td>
                        <td className="p-3 text-slate-600">{order.orderer || '-'}</td>
                        <td className="p-3 text-center text-slate-700">{order.details?.filter(d => d.shortage > 0).length || 0}종</td>
                        <td className="p-3 text-right font-bold text-red-600">{order.totalCost?.toLocaleString()}원</td>
                        <td className="p-3 text-center">
                          <button onClick={() => setViewOrder(order)} className="text-xs text-indigo-500 hover:text-indigo-700 underline">▼ 보기</button>
                        </td>
                        <td className="p-3 text-center relative">
                          <button onClick={() => setOpenOrderMenuId(openOrderMenuId === order.id ? null : order.id)} className="text-slate-400 hover:text-slate-600 p-1">
                            <MoreVertical size={16} />
                          </button>
                          {openOrderMenuId === order.id && (
                            <>
                              <div className="fixed inset-0 z-20" onClick={() => setOpenOrderMenuId(null)} />
                              <div className="absolute right-0 top-10 z-30 bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-28">
                                <button onClick={() => { setViewOrder(order); setViewOrderEditMode(true); setViewOrderEdits({ orderer: order.orderer || '', factory: order.factory || '', note: order.note || '', details: (order.details || []).map(d => ({ ...d })), _idx: idx }); setOpenOrderMenuId(null); }} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2 text-slate-700">
                                  <Pencil size={14} /> 수정
                                </button>
                                <button onClick={() => { setOpenOrderMenuId(null); setSavedOrders(prev => prev.filter((_, i) => i !== idx)); }} className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 flex items-center gap-2 text-red-500">
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
                    <button onClick={() => { setViewOrderEditMode(true); setViewOrderEdits({ orderer: viewOrder.orderer || '', factory: viewOrder.factory || '', note: viewOrder.note || '', details: (viewOrder.details || []).map(d => ({ ...d })), _idx: savedOrders.findIndex(o => o.id === viewOrder.id) }); }} className="flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-500 border border-slate-200 rounded px-2 py-0.5 hover:border-indigo-300">
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
                    <button onClick={() => {
                      const newDetails = (viewOrderEdits.details || viewOrder.details || []).map(({ _globalIdx, ...rest }) => rest);
                      const newTotalCost = newDetails.reduce((s, d) => s + (d.shortage > 0 ? (d.cost || 0) : 0), 0);
                      const updated = { ...viewOrder, orderer: viewOrderEdits.orderer, factory: viewOrderEdits.factory, note: viewOrderEdits.note, details: newDetails, totalCost: newTotalCost };
                      setSavedOrders(prev => prev.map((o, i) => i === viewOrderEdits._idx ? updated : o));
                      setViewOrder(updated);
                      setViewOrderEditMode(false);
                    }} className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold px-3 py-1 rounded">저장</button>
                    <button onClick={() => setViewOrderEditMode(false)} className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1">취소</button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">{viewOrder.date} &nbsp;|&nbsp; 발주자: {viewOrder.orderer || '-'} &nbsp;|&nbsp; 공장: {viewOrder.factory || '-'}</p>
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
                                </td>
                                <td className="p-3">
                                  {d.img
                                    ? <img src={d.img} alt="" className="w-10 h-10 rounded object-cover border border-slate-200" />
                                    : <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center"><ImageIcon size={14} className="text-slate-300" /></div>
                                  }
                                </td>
                                <td className="p-3 text-slate-700">{viewOrder.productName || '-'}</td>
                                <td className="p-3 text-center text-slate-600">{d.size || '-'}</td>
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
                                    : d.shortage > 0
                                      ? <span className="text-red-600">{d.shortage.toLocaleString()}개</span>
                                      : <span className="text-emerald-600 text-xs font-normal">재고충분</span>
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
            </div>
          </div>
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
                  {editLabel.img && <img src={editLabel.img} alt="preview" className="w-12 h-12 rounded object-cover border border-slate-200" />}
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
  );
}
