import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCUtXeC05HeaOHOjjj-BkPqlOQ_iXLafT4",
  authDomain: "label-6f843.firebaseapp.com",
  projectId: "label-6f843",
  storageBucket: "label-6f843.firebasestorage.app",
  messagingSenderId: "113804983646",
  appId: "1:113804983646:web:6a613d8903ac8212b423cf",
  measurementId: "G-7HK39EF8BV"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
