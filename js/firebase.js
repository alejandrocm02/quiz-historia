import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, limit, getDocs, where }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB93zW5NshdocVjCXs5aeK9nZKbb97LoKg",
  authDomain: "quiz-historia-5f44f.firebaseapp.com",
  projectId: "quiz-historia-5f44f",
  storageBucket: "quiz-historia-5f44f.firebasestorage.app",
  messagingSenderId: "396973193386",
  appId: "1:396973193386:web:ad4eaf05864107eabe38d3"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

/* expose to global scope */
window._db = db;
window._fbReady = true;
window._collection = collection;
window._addDoc = addDoc;
window._query = query;
window._orderBy = orderBy;
window._limit = limit;
window._getDocs = getDocs;
window._where = where;

/* load initial ranking */
window.loadRanking('easy', 'rank-preview', '');
