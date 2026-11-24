// sign-in gate and current user
// (part of the UltraMed app script — the files under js/app load in order and share one global scope)
// ---- GATE / USER ----
async function selectUser(name, role){
  // the changes waiting on this phone belong to the login that made them (v129, the security audit's C7): another
  // login is asked before they are sent under it, or signs out and leaves them (queueOwnerCheck, 04-sync.js)
  if(typeof queueOwnerCheck === 'function' && !(await queueOwnerCheck(name))) return;
  if(typeof dropFullBackup === 'function') dropFullBackup(); // a full backup held for the last sign-in is never handed to the next (13-exports.js)
  // a screen drawn for someone else (another person's session, or the early open of the person this phone last signed
  // in) is never shown to this one: covered until this person's own screen is drawn (v126 speed, part 3; 04-sync.js)
  if(typeof earlyDrop === 'function') earlyDrop();
  if(typeof screenCoverFor === 'function') screenCoverFor(name, role);
  currentUser = {name, role};
  if(!FIREBASE_ENABLED){
    try{ await window.storage.set('currentUser', JSON.stringify(currentUser), false); }catch(e){}
  }
  document.getElementById('gate').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('bottomNav').style.display = 'flex';
  welcomeDismissed = false;
  // a new sign-in: what waited on this phone because the cloud refused it goes again (v123 review, 04-sync.js)
  if(typeof unparkSaves === 'function') unparkSaves();
  await loadAll();
}
function switchUser(){
  if(typeof dropFullBackup === 'function') dropFullBackup();
  // currentUser first: a queue upload on its way stops at the next list
  // (flushOutbox), and what it had not sent stays on this phone, queued — it
  // uploads after the next sign-in (v123 review: refused for want of a
  // sign-in, it was taken off the queue).
  const was = currentUser && USERS[currentUser.name] ? String(USERS[currentUser.name].email || '').toLowerCase() : '';
  currentUser = null;
  forgetUser(); // the next start shows the sign-in screen, never this person's copy (v126 speed, part 3)
  if(typeof earlyDrop === 'function') earlyDrop();
  if(FIREBASE_ENABLED && window.firebase){ _signedOutOf = was || null; signedOutKeep(was); firebase.auth().signOut().catch(()=>{}); }
  showGateScreen();
}
// Signed out on this phone before the SDK had told who its saved session was (the early open's window, v126 speed part
// 3): the SDK finishes its start first and tells that session, then the sign-out — that late word is not a sign-in.
// Kept until the SDK says "nobody" (the sign-out has landed): a sign-in asked for meanwhile is told after it.
let _signedOutOf = null;
// …and kept on the phone too (rerev S1): Firebase's sign-out waits behind its start, so an app closed in the early open's
// window kept Firebase's saved session, and the next start signed that person in again by itself — whoever picked up the
// phone acted as her. Until the SDK says "nobody" (or holds another person's session), a start told of that very session
// signs it out instead; that person signing in again on the sign-in screen clears it (she is signing in on purpose).
const SIGNED_OUT = 'um_signedOut';
function signedOutKeep(email){ try{ if(email) localStorage.setItem(SIGNED_OUT, String(email).toLowerCase()); else localStorage.removeItem(SIGNED_OUT); }catch(e){} }
function signedOutOnPhone(){ try{ return localStorage.getItem(SIGNED_OUT) || null; }catch(e){ return null; } }
function showGateScreen(){
  document.body.classList.remove('on-today');   // the main screen's light page is not the sign-in page's
  renderGate();
  document.getElementById('gate').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  document.getElementById('bottomNav').style.display = 'none';
}
// The sign-in ended while the app was open — a password changed on another
// device, the login disabled or reset (a tap on Sign out is switchUser): the
// sign-in screen, and what waits in the queue stays on this phone; it uploads
// after the next sign-in (v123 review: this used to be ignored, and every save
// the app went on making was refused).
function signInEnded(){
  if(typeof dropFullBackup === 'function') dropFullBackup();
  currentUser = null;
  forgetUser(); // the next start shows the sign-in screen, never this person's copy (v126 speed, part 3)
  if(typeof earlyDrop === 'function') earlyDrop();
  showGateScreen();
  const waiting = typeof outboxList === 'function' ? outboxList().length : 0;
  showToast(waiting ? '🔒 Signed out — sign in again. Changes wait on this phone and upload after you sign in' : '🔒 Signed out — sign in again', 8000);
}
function openAccountMenu(){
  const email = (USERS[currentUser.name]||{}).email || '';
  showModal(`
    <h3 style="margin-top:0;" data-ic="users">${esc(currentUser.name)}</h3>
    <p style="color:var(--muted); font-size:13px; margin-top:-6px;">${esc(email)}</p>
    <label>Language / اللغة</label>
    <div class="chip-row" data-notr>
      <div class="chip ${uiLang==='en'?'on':''}" onclick="setUiLang('en')">English</div>
      <div class="chip ${uiLang==='ar'?'on':''}" onclick="setUiLang('ar')">العربية</div>
    </div>
    <button class="btn secondary" onclick="closeModal(); switchView('log')">${I('plus')} Log a visit</button>
    <button class="btn secondary" onclick="openHelp()">${I('nhelp')} Help &amp; Support</button>
    ${FIREBASE_ENABLED ? `<button class="btn secondary" onclick="openChangePassword()">${I('lock')} Change password</button>` : ''}
    <button class="btn ghost" onclick="closeModal(); switchUser();">Sign out</button>
  `);
}
function openChangePassword(){
  showModal(`
    <h3 style="margin-top:0;" data-ic="lock">Change password</h3>
    <p style="color:var(--muted); font-size:13px; margin-top:-6px;">Enter your current password to confirm it's you.</p>
    <label>Current password</label>
    <input type="password" id="cpCurrent" autocomplete="current-password">
    <label>New password</label>
    <input type="password" id="cpNew" autocomplete="new-password" placeholder="At least 6 characters">
    <label>Confirm new password</label>
    <input type="password" id="cpConfirm" autocomplete="new-password">
    <button class="btn" onclick="submitChangePassword()">Update password</button>
  `);
}
async function submitChangePassword(){
  const current = document.getElementById('cpCurrent').value;
  const next = document.getElementById('cpNew').value;
  const confirm = document.getElementById('cpConfirm').value;
  if(!current){ showToast('Enter your current password'); return; }
  if(next.length<6){ showToast('New password must be at least 6 characters'); return; }
  if(next!==confirm){ showToast('New passwords don’t match'); return; }
  const user = firebase.auth().currentUser;
  const email = (USERS[currentUser.name]||{}).email;
  if(!user || !email){ showToast('Not signed in'); return; }
  try{
    const cred = firebase.auth.EmailAuthProvider.credential(email, current);
    await user.reauthenticateWithCredential(cred);
    await user.updatePassword(next);
    closeModal();
    showToast('✅ Password updated');
  }catch(e){
    // (with Firebase's e-mail enumeration protection on, a wrong password is auth/invalid-credential — security review)
    if(e.code==='auth/wrong-password' || e.code==='auth/invalid-credential' || e.code==='auth/invalid-login-credentials') showToast('Current password is incorrect');
    else if(e.code==='auth/weak-password') showToast('Choose a stronger password');
    else if(e.code==='auth/too-many-requests') showToast('Too many attempts — try again later');
    else showToast('Could not update password');
  }
}
function renderGate(){
  const el = document.getElementById('gateGrid');
  if(!el) return;
  const reps = staff.filter(s=>s.role==='rep');
  const sups = staff.filter(s=>s.role!=='rep');
  const tile = (s, wide) => `
    <div class="gate-tile${wide?' wide':''}" onclick="gateTap('${jsArg(s.name)}')">
      <div class="gate-av" style="background:${esc((s.av==='linear-gradient(140deg,#0B3D22,#01150C)'?AVATARS[0]:s.av)||AVATARS[0])};">${esc(initials(s.name))}</div>
      <div>
        <div class="gate-name">${esc(s.name)}</div>
        <div class="gate-role">${s.role==='rep'?I('tooth')+' Sales Rep':I('star')+' Supervisor'}</div>
      </div>
    </div>`;
  // Odd rep out gets a full-width tile so the grid never leaves a gap
  let html = reps.map((s,i)=> tile(s, reps.length%2===1 && i===reps.length-1 && sups.length===0)).join('');
  html += sups.map(s=> tile(s, true)).join('');
  el.innerHTML = html || `<div style="color:var(--muted); font-size:13px;">No team members yet.</div>`;
}
function gateTap(name){
  if(!FIREBASE_ENABLED){ selectUser(name, USERS[name].role); return; }
  // The code carries names only (it is public): a phone that has not signed
  // in yet does not know this person's address — ask for it instead of a
  // password that could never work. After that the phone keeps the team list.
  if(!(USERS[name] || {}).email){ openEmailLogin(name); return; }
  showModal(`
    <h3 style="margin-top:0;" data-ic="lock">${esc(name)}</h3>
    <p style="color:var(--muted); font-size:13px; margin-top:-6px;">Enter your password to continue.</p>
    <input type="password" id="gatePassword" placeholder="Password">
    <button class="btn" onclick="submitGateLogin('${jsArg(name)}')">Log in</button>
  `);
  setTimeout(()=>{
    const el = document.getElementById('gatePassword');
    if(el){ el.focus(); el.onkeydown = (e)=>{ if(e.key==='Enter') submitGateLogin(name); }; }
  }, 80);
}
function openEmailLogin(name){
  if(!FIREBASE_ENABLED){ showToast('Offline mode — tap your name'); return; }
  const who = typeof name === 'string' && name ? name : '';
  showModal(`
    <h3 style="margin-top:0;" data-ic="lock">${who ? esc(who) : 'Sign in'}</h3>
    ${who ? `<p style="color:var(--muted); font-size:13px; margin-top:-6px;">First sign-in on this phone: enter your work email and password. After that, your name is enough.</p>`
      : `<p style="color:var(--muted); font-size:13px; margin-top:-6px;">Use your work email and password.</p>`}
    <input type="email" id="elEmail" placeholder="name@ultramed-kw.com" autocomplete="username">
    <input type="password" id="elPwd" placeholder="Password" style="margin-top:8px;" autocomplete="current-password">
    <button class="btn" onclick="submitEmailLogin()">Log in</button>
  `);
  setTimeout(()=>{
    const el = document.getElementById('elPwd');
    if(el) el.onkeydown = e => { if(e.key==='Enter') submitEmailLogin(); };
  }, 80);
}
async function submitEmailLogin(){
  const email = (document.getElementById('elEmail').value||'').trim().toLowerCase();
  const pwd = document.getElementById('elPwd').value;
  if(!email || !pwd){ showToast('Enter email and password'); return; }
  try{
    // (_signedOutOf stays until the SDK says "nobody": Firebase queues this sign-in behind a sign-out asked before its
    // start had told the saved session — it tells that session first, then the sign-out, then this one; cleared here,
    // the earlier person was signed in again for a moment and the new one was told "Signed out", v126 review 2, U1)
    if(signedOutOnPhone() === email) signedOutKeep(null); // (she signs in again on purpose: her session is not the one signed out of, rerev S1)
    await firebase.auth().signInWithEmailAndPassword(email, pwd);
    closeModal();
  }catch(e){
    showToast(navigator.onLine ? 'Wrong email or password'
      : '📴 No connection — sign in once online, then the app works offline');
  }
}
async function submitGateLogin(name){
  const pwd = document.getElementById('gatePassword').value;
  if(!pwd){ showToast('Enter your password'); return; }
  try{
    // (_signedOutOf stays until the SDK says "nobody" — see submitEmailLogin: v126 review 2, U1)
    if(signedOutOnPhone() === String(USERS[name].email || '').toLowerCase()) signedOutKeep(null); // (rerev S1, as above)
    await firebase.auth().signInWithEmailAndPassword(USERS[name].email, pwd);
    closeModal();
  }catch(e){
    showToast(navigator.onLine ? 'Wrong password, try again'
      : '📴 No connection — sign in once online, then the app works offline');
  }
}
// ---- The person this phone last signed in (the early open, v126 speed part 3) ----
// Written when the cloud's sign-in confirms a person on the team list, removed at Sign out, when the sign-in ends (a
// password changed on another device, a login disabled) and when the login is not on the team list: a start draws
// from this phone's copy only for this person, and only while Firebase's own saved session on the phone is theirs.
const LAST_USER = 'um_lastUser';
function rememberUser(name, role, email){ try{ localStorage.setItem(LAST_USER, JSON.stringify({ name, role, email: String(email || '').toLowerCase() })); }catch(e){} }
function forgetUser(){ try{ localStorage.removeItem(LAST_USER); }catch(e){} }
function rememberedUser(){
  try{ const o = JSON.parse(localStorage.getItem(LAST_USER) || 'null'); return o && typeof o.name === 'string' && o.name && typeof o.role === 'string' && typeof o.email === 'string' && o.email ? o : null; }catch(e){ return null; }
}
// Whose session Firebase keeps on this phone — read as the SDK keeps it (its IndexedDB "firebaseLocalStorageDb", else
// web storage), without the SDK and without the network; null when there is none or it cannot be read (no early
// open then). A database the SDK has not made yet is never made here (its creation is aborted).
function firebaseSavedEmail(){
  const key = 'firebase:authUser:' + FIREBASE_CONFIG.apiKey + ':[DEFAULT]';
  const emailOf = v => { const o = typeof v === 'string' ? UMCore.safeParse(v, null) : v; return o && typeof o === 'object' && typeof o.email === 'string' && o.email ? o.email.toLowerCase() : null; };
  try{ const ls = localStorage.getItem(key); if(ls) return Promise.resolve(emailOf(ls)); }catch(e){}
  return new Promise(res => {
    let done = false; const end = v => { if(!done){ done = true; res(v); } };
    setTimeout(() => end(null), 1500);
    let rq;
    try{ if(typeof indexedDB === 'undefined' || !indexedDB) return end(null); rq = indexedDB.open('firebaseLocalStorageDb'); }catch(e){ return end(null); }
    rq.onupgradeneeded = () => { try{ rq.transaction.abort(); }catch(e){} };
    rq.onerror = rq.onblocked = () => end(null);
    rq.onsuccess = () => {
      const db = rq.result;
      try{
        if(!db.objectStoreNames.contains('firebaseLocalStorage')){ db.close(); return end(null); }
        const g = db.transaction('firebaseLocalStorage', 'readonly').objectStore('firebaseLocalStorage').get(key);
        g.onsuccess = () => { try{ db.close(); }catch(e){} end(g.result ? emailOf(g.result.value) : null); };
        g.onerror = () => { try{ db.close(); }catch(e){} end(null); };
      }catch(e){ try{ db.close(); }catch(e2){} end(null); }
    };
  });
}
async function tryAutoLogin(){
  if(FIREBASE_ENABLED && !window.firebase){
    // Offline first-boot without the Firebase SDK cached: show the gate and
    // let sign-in happen once the network is back.
    renderGate();
    return;
  }
  if(FIREBASE_ENABLED){
    // the screen of the person this phone last signed in, drawn from this phone's copy before the sign-in is confirmed
    // and before any cloud read (v126 speed, part 3: earlyOpen, 04-sync.js) — nothing is read from the cloud or written
    if(typeof earlyOpen === 'function') earlyOpen();
    firebase.auth().onAuthStateChanged(async (user)=>{
      // signed out here before the SDK's start told this session (switchUser in the early open's window): not a sign-in
      if(user && _signedOutOf && String(user.email || '').toLowerCase() === _signedOutOf) return;
      // …or before the app was last closed, its sign-out never reached the SDK (rerev S1): signed out now, the sign-in screen stays
      if(user && !_signedOutOf && signedOutOnPhone() && String(user.email || '').toLowerCase() === signedOutOnPhone()){
        _signedOutOf = signedOutOnPhone(); forgetUser(); if(typeof earlyDrop === 'function') earlyDrop();
        if(!currentUser) showGateScreen();
        firebase.auth().signOut().catch(()=>{});
        return;
      }
      if(!user){ _signedOutOf = null; signedOutKeep(null); } // (the sign-out has landed: that person told again later is a new sign-in)
      else if(signedOutOnPhone() && String(user.email || '').toLowerCase() !== signedOutOnPhone()) signedOutKeep(null); // (the SDK holds another person's session now)
      if(!user && currentUser){ signInEnded(); return; } // the sign-in ended under the app (v123 review)
      if(!user){ if(typeof earlyDrop === 'function' && earlyDrop()) forgetUser(); return; } // ended before the early open drew anything
      if(!user.email) return;
      const email = user.email.toLowerCase();
      let found = Object.entries(USERS).find(([n,u])=>(u.email||'').toLowerCase()===email);
      if(!found){
        // Roster may be stale on this device — we can read it now that we're
        // authenticated, so refresh and look again before giving up.
        try{
          const st = await window.storage.get('staff', true);
          if(st){
            staff = JSON.parse(st.value); refreshStaff();
            found = Object.entries(USERS).find(([n,u])=>(u.email||'').toLowerCase()===email);
          }
        }catch(e){}
      }
      if(!found){
        // Offline, the roster read fails — that is NOT proof of removal, and
        // signing out would destroy the device's only cached credential.
        if(!navigator.onLine || _loadFailed.staff){
          showToast('📴 Offline — using this device\u2019s saved data');
          return;
        }
        showToast('This login is not on the team list');
        forgetUser();
        if(typeof earlyDrop === 'function' && earlyDrop() && currentUser){ currentUser = null; showGateScreen(); }
        await firebase.auth().signOut().catch(()=>{});
        return;
      }
      rememberUser(found[0], found[1].role, email);
      // the screen drawn from this phone's copy is this person's: the start's cloud read now (earlyConfirmed)
      if(typeof earlyFor === 'function' && earlyFor(found[0], found[1].role)){ if(!_early.confirmed) await earlyConfirmed(found[0], found[1].role); return; } // (once: the same person told again changes nothing, as before)
      if(!currentUser || currentUser.name!==found[0]) await selectUser(found[0], found[1].role);
    });
    return;
  }
  try{
    const res = await window.storage.get('currentUser', false);
    if(res && res.value){
      const u = JSON.parse(res.value);
      if(u && u.name){ await selectUser(u.name, u.role); return; }
    }
  }catch(e){}
}

