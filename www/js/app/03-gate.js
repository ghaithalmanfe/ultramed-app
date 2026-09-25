// sign-in gate and current user
// (part of the UltraMed app script — the files under js/app load in order and share one global scope)
// ---- GATE / USER ----
async function selectUser(name, role){
  currentUser = {name, role};
  if(!FIREBASE_ENABLED){
    try{ await window.storage.set('currentUser', JSON.stringify(currentUser), false); }catch(e){}
  }
  document.getElementById('gate').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('bottomNav').style.display = 'flex';
  welcomeDismissed = false;
  await loadAll();
}
function switchUser(){
  if(FIREBASE_ENABLED && window.firebase){ firebase.auth().signOut().catch(()=>{}); }
  currentUser = null;
  renderGate();
  document.getElementById('gate').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  document.getElementById('bottomNav').style.display = 'none';
}
function openAccountMenu(){
  const email = (USERS[currentUser.name]||{}).email || '';
  showModal(`
    <h3 style="margin-top:0;">${esc(currentUser.name)}</h3>
    <p style="color:var(--muted); font-size:13px; margin-top:-6px;">${esc(email)}</p>
    <label>Language / اللغة</label>
    <div class="chip-row" data-notr>
      <div class="chip ${uiLang==='en'?'on':''}" onclick="setUiLang('en')">English</div>
      <div class="chip ${uiLang==='ar'?'on':''}" onclick="setUiLang('ar')">العربية</div>
    </div>
    ${FIREBASE_ENABLED ? `<button class="btn secondary" onclick="openChangePassword()">${I('lock')} Change password</button>` : ''}
    <button class="btn ghost" onclick="closeModal(); switchUser();">Sign out</button>
  `);
}
function openChangePassword(){
  showModal(`
    <h3 style="margin-top:0;">Change password</h3>
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
    if(e.code==='auth/wrong-password') showToast('Current password is incorrect');
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
    <div class="gate-tile${wide?' wide':''}" onclick="gateTap('${esc(s.name)}')">
      <div class="gate-av" style="background:${(s.av==='linear-gradient(140deg,#0B3D22,#01150C)'?AVATARS[0]:s.av)||AVATARS[0]};">${initials(s.name)}</div>
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
  showModal(`
    <h3 style="margin-top:0;">${esc(name)}</h3>
    <p style="color:var(--muted); font-size:13px; margin-top:-6px;">Enter your password to continue.</p>
    <input type="password" id="gatePassword" placeholder="Password">
    <button class="btn" onclick="submitGateLogin('${name}')">Log in</button>
  `);
  setTimeout(()=>{
    const el = document.getElementById('gatePassword');
    if(el){ el.focus(); el.onkeydown = (e)=>{ if(e.key==='Enter') submitGateLogin(name); }; }
  }, 80);
}
function openEmailLogin(){
  if(!FIREBASE_ENABLED){ showToast('Offline mode — tap your name'); return; }
  showModal(`
    <h3 style="margin-top:0;">Sign in</h3>
    <p style="color:var(--muted); font-size:13px; margin-top:-6px;">Use your work email and password.</p>
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
    await firebase.auth().signInWithEmailAndPassword(USERS[name].email, pwd);
    closeModal();
  }catch(e){
    showToast(navigator.onLine ? 'Wrong password, try again'
      : '📴 No connection — sign in once online, then the app works offline');
  }
}
async function tryAutoLogin(){
  if(FIREBASE_ENABLED && !window.firebase){
    // Offline first-boot without the Firebase SDK cached: show the gate and
    // let sign-in happen once the network is back.
    renderGate();
    return;
  }
  if(FIREBASE_ENABLED){
    firebase.auth().onAuthStateChanged(async (user)=>{
      if(!user || !user.email) return;
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
        await firebase.auth().signOut().catch(()=>{});
        return;
      }
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

