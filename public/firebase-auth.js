// firebase-auth.js — login com Google e GitHub via Firebase Authentication.
// Carregado como <script type="module"> no index.html.
// Expõe window.chequettoFirebase { signInWithGoogle, signInWithGithub, signOut }
// e dispara o evento "chequetto:firebase-auth-changed" com { user } sempre
// que o estado de login muda (usado pelo conta.js pra atualizar a tela).

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  GithubAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

// Chave de API do Firebase: não é secreta, é feita pra ficar visível no
// navegador — a segurança do projeto vem das regras do Firebase, não daqui.
const firebaseConfig = {
  apiKey: "AIzaSyCFlsqycVNpoQaB1NM8RpuaaWLjssWOKZw",
  authDomain: "gerador-de-app.firebaseapp.com",
  projectId: "gerador-de-app",
  storageBucket: "gerador-de-app.firebasestorage.app",
  messagingSenderId: "185466039573",
  appId: "1:185466039573:web:304e54f424a6612d4dcd1c",
  measurementId: "G-SVFRYKR8FN",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
const githubProvider = new GithubAuthProvider();
// Pede permissão de "repo" pra poder criar repositórios em nome do usuário
// quando ele clicar em "Publicar no GitHub".
githubProvider.addScope('repo');

// Guarda o token de acesso do GitHub em memória (não persiste em disco) —
// só existe enquanto a aba está aberta e o usuário está logado nesta sessão.
let githubAccessToken = null;

function publicUser(user) {
  if (!user) return null;
  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoURL: user.photoURL,
    provider: user.providerData?.[0]?.providerId || null,
  };
}

function notificar(user) {
  window.dispatchEvent(new CustomEvent('chequetto:firebase-auth-changed', { detail: { user: publicUser(user) } }));
}

onAuthStateChanged(auth, (user) => {
  if (!user) githubAccessToken = null;
  notificar(user);
});

async function signInWithGoogle() {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    console.error('[FIREBASE][GOOGLE] erro ao entrar', error);
    alert('Não foi possível entrar com Google: ' + (error.message || 'erro desconhecido'));
  }
}

async function signInWithGithub() {
  try {
    const resultado = await signInWithPopup(auth, githubProvider);
    const credencial = GithubAuthProvider.credentialFromResult(resultado);
    githubAccessToken = credencial?.accessToken || null;
  } catch (error) {
    console.error('[FIREBASE][GITHUB] erro ao entrar', error);
    alert('Não foi possível entrar com GitHub: ' + (error.message || 'erro desconhecido'));
  }
}

async function signOut() {
  try {
    await firebaseSignOut(auth);
    githubAccessToken = null;
  } catch (error) {
    console.error('[FIREBASE][LOGOUT] erro ao sair', error);
  }
}

function getGithubToken() {
  return githubAccessToken;
}

window.chequettoFirebase = { signInWithGoogle, signInWithGithub, signOut, getGithubToken };
