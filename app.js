/* ========================================
   SISTEMA DE ALARMA COMUNITARIA
   App Logic with Firebase Realtime Database
   ======================================== */

(function() {
    'use strict';

    // ===== Firebase Config =====
    const firebaseConfig = {
        apiKey: "AIzaSyCQE5FdJkPGXI5hXkH9ImLWhdcbzUvUu8g",
        authDomain: "alarma-comunitaria-4a6dd.firebaseapp.com",
        databaseURL: "https://alarma-comunitaria-4a6dd-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "alarma-comunitaria-4a6dd",
        storageBucket: "alarma-comunitaria-4a6dd.firebasestorage.app",
        messagingSenderId: "887856789718",
        appId: "1:887856789718:web:03c45bd5d65a5a29dcb177"
    };

    firebase.initializeApp(firebaseConfig);
    const db = firebase.database();
    const alertsRef = db.ref('alerts');
    const usersRef = db.ref('users');

    // ===== Local session =====
    const SESSION_KEY = 'ac_session';
    function getSession() { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
    function saveSession(user) { localStorage.setItem(SESSION_KEY, JSON.stringify(user)); }
    function clearSession() { localStorage.removeItem(SESSION_KEY); }

    // ===== Sound Manager =====
    const SoundManager = {
        ctx: null, playing: false, nodes: [], userInteracted: false,
        init() {
            if (!this.ctx) {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
        },
        startSiren() {
            if (!this.userInteracted) return;
            this.init();
            if (this.playing) return;
            this.playing = true;
            this._loop();
        },
        _loop() {
            if (!this.playing) return;
            const ctx = this.ctx;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(600, ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.5);
            osc.frequency.linearRampToValueAtTime(600, ctx.currentTime + 1.0);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.3);
            gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.7);
            gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.0);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 1.0);
            this.nodes.push(osc, gain);
            setTimeout(() => { if (this.playing) this._loop(); }, 1050);
        },
        stopSiren() {
            this.playing = false;
            this.nodes.forEach(n => { try { n.disconnect(); } catch(e){} });
            this.nodes = [];
        }
    };

    // Mark user interaction on ANY click/touch so audio can play
    document.addEventListener('click', () => { SoundManager.userInteracted = true; }, { once: false });
    document.addEventListener('touchstart', () => { SoundManager.userInteracted = true; }, { once: false });

    // ===== DOM =====
    const $ = id => document.getElementById(id);
    const views = { login: $('view-login'), register: $('view-register'), dashboard: $('view-dashboard') };

    function showView(name) {
        Object.values(views).forEach(v => v.classList.remove('active'));
        views[name].classList.add('active');
    }

    // ===== Toast =====
    function toast(message, type = 'info', icon = 'ℹ️') {
        const container = $('toast-container');
        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        el.innerHTML = `<span class="toast-icon">${icon}</span><span>${message}</span>`;
        container.appendChild(el);
        setTimeout(() => { el.classList.add('toast-exit'); setTimeout(() => el.remove(), 300); }, 3500);
    }

    // ===== Auth (Firebase-backed) =====
    $('link-to-register').addEventListener('click', e => { e.preventDefault(); showView('register'); });
    $('link-to-login').addEventListener('click', e => { e.preventDefault(); showView('login'); });

    $('form-login').addEventListener('submit', e => {
        e.preventDefault();
        const username = $('login-username').value.trim();
        const password = $('login-password').value;
        const btn = $('btn-login');
        btn.disabled = true;
        
        usersRef.once('value', snap => {
            btn.disabled = false;
            const users = snap.val() || {};
            const userEntry = Object.entries(users).find(([k, v]) => v.username === username);
            
            if (!userEntry) { toast('Usuario no encontrado', 'danger', '❌'); return; }
            
            const key = userEntry[0];
            const user = { ...userEntry[1], id: key };
            
            if (user.password !== password) { toast('Contraseña incorrecta', 'danger', '❌'); return; }
            
            saveSession(user);
            $('form-login').reset();
            enterDashboard(user);
        }).catch(err => {
            btn.disabled = false;
            toast('Error de conexión', 'danger', '❌');
            console.error(err);
        });
    });

    $('form-register').addEventListener('submit', e => {
        e.preventDefault();
        const name = $('reg-name').value.trim();
        const address = $('reg-address').value.trim();
        const username = $('reg-username').value.trim();
        const password = $('reg-password').value;
        if (password.length < 4) { toast('La contraseña debe tener al menos 4 caracteres', 'danger', '❌'); return; }

        const btn = $('btn-register');
        btn.disabled = true;

        usersRef.once('value', snap => {
            const users = snap.val() || {};
            const exists = Object.values(users).some(u => u.username === username);
            
            if (exists) { 
                btn.disabled = false;
                toast('Ese nombre de usuario ya existe', 'danger', '❌'); 
                return; 
            }
            
            const newRef = usersRef.push();
            const userData = { name, address, username, password };
            
            newRef.set(userData).then(() => {
                btn.disabled = false;
                const user = { ...userData, id: newRef.key };
                saveSession(user);
                $('form-register').reset();
                toast('¡Cuenta creada exitosamente!', 'success', '✅');
                enterDashboard(user);
            }).catch(err => {
                btn.disabled = false;
                toast('Error al crear cuenta', 'danger', '❌');
                console.error(err);
            });
        }).catch(err => {
            btn.disabled = false;
            toast('Error de conexión', 'danger', '❌');
            console.error(err);
        });
    });

    $('btn-logout').addEventListener('click', () => {
        SoundManager.stopSiren();
        $('alarm-overlay').classList.add('hidden');
        if (activeListener) { alertsRef.off('value', activeListener); activeListener = null; }
        currentUser = null;
        clearSession();
        showView('login');
    });

    // ===== Dashboard =====
    let currentUser = null;
    let alertsCache = {};
    let activeListener = null;
    let previousAlertCount = 0;

    function enterDashboard(user) {
        currentUser = user;
        $('navbar-user').textContent = user.name;
        showView('dashboard');
        listenToAlerts();
    }

    // ===== Real-time listener =====
    function listenToAlerts() {
        // Remove previous listener to prevent duplicates
        if (activeListener) { alertsRef.off('value', activeListener); }

        activeListener = alertsRef.on('value', snap => {
            const newCache = snap.val() || {};
            const oldActiveCount = countOtherActiveAlerts(alertsCache);
            alertsCache = newCache;
            const newActiveCount = countOtherActiveAlerts(alertsCache);

            // Show toast for new alerts arriving
            if (newActiveCount > oldActiveCount && oldActiveCount >= 0) {
                const diff = newActiveCount - oldActiveCount;
                if (diff > 0 && previousAlertCount > 0) {
                    toast(`🚨 ¡${diff} nueva${diff > 1 ? 's' : ''} alerta${diff > 1 ? 's' : ''} de emergencia!`, 'danger', '🔔');
                }
            }
            previousAlertCount = newActiveCount;

            renderDashboard();
        });
    }

    function countOtherActiveAlerts(cache) {
        if (!currentUser) return 0;
        return Object.values(cache).filter(a => a.userId !== currentUser.id && a.active).length;
    }

    function renderDashboard() {
        if (!currentUser) return;

        const alertsList = Object.entries(alertsCache).map(([key, val]) => ({ ...val, firebaseKey: key }));
        const myAlert = alertsList.find(a => a.userId === currentUser.id && a.active);
        const otherAlerts = alertsList.filter(a => a.userId !== currentUser.id && a.active);

        // My alarm banner
        const banner = $('my-alarm-banner');
        if (myAlert) {
            banner.classList.remove('hidden');
            $('my-alarm-cause').textContent = myAlert.cause;
            renderMyAlarmResponses(myAlert);
            $('alarm-overlay').classList.remove('hidden');
            SoundManager.startSiren();
        } else {
            banner.classList.add('hidden');
        }

        // Feed
        const feed = $('alerts-feed');
        const empty = $('feed-empty');
        const badge = $('alert-count-badge');

        if (otherAlerts.length === 0) {
            feed.innerHTML = '';
            feed.appendChild(empty);
            empty.style.display = '';
            badge.classList.add('hidden');
        } else {
            empty.style.display = 'none';
            feed.innerHTML = '';
            badge.textContent = otherAlerts.length;
            badge.classList.remove('hidden');
            otherAlerts.sort((a, b) => b.timestamp - a.timestamp).forEach(alert => {
                feed.appendChild(createAlertCard(alert));
            });
            // Play siren for receivers too
            if (!myAlert) {
                $('alarm-overlay').classList.remove('hidden');
                SoundManager.startSiren();
            }
        }

        // If no alerts at all
        if (!myAlert && otherAlerts.length === 0) {
            $('alarm-overlay').classList.add('hidden');
            SoundManager.stopSiren();
        }

        // Update page title to attract attention
        if (myAlert || otherAlerts.length > 0) {
            document.title = '🚨 ¡ALERTA! - Alarma Comunitaria';
        } else {
            document.title = 'Alarma Comunitaria | Protege tu Vecindario';
        }
    }

    function renderMyAlarmResponses(alert) {
        const container = $('my-alarm-responses');
        container.innerHTML = '';
        const responses = alert.responses ? Object.values(alert.responses) : [];
        if (responses.length === 0) {
            container.innerHTML = '<span style="font-size:0.82rem;color:var(--text-muted)">Esperando respuestas de la comunidad...</span>';
            return;
        }
        const counts = {};
        responses.forEach(r => { counts[r.action] = (counts[r.action] || 0) + 1; });
        Object.entries(counts).forEach(([action, count]) => {
            const tag = document.createElement('div');
            tag.className = 'response-tag';
            tag.innerHTML = `${action} <span class="tag-count">${count}</span>`;
            container.appendChild(tag);
        });
    }

    // ===== Alert Card =====
    function createAlertCard(alert) {
        const card = document.createElement('div');
        card.className = 'alert-card';
        const initials = alert.userName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
        const time = getRelativeTime(alert.timestamp);
        const responses = alert.responses ? Object.values(alert.responses) : [];
        const respCount = responses.length;

        card.innerHTML = `
            <div class="alert-card-header">
                <div class="alert-card-user">
                    <div class="alert-avatar">${initials}</div>
                    <div class="alert-user-info">
                        <strong>${escHtml(alert.userName)}</strong>
                        <span>Alerta activa</span>
                    </div>
                </div>
                <span class="alert-time">${time}</span>
            </div>
            <div class="alert-cause">🚨 ${escHtml(alert.cause)}</div>
            <div class="alert-address">📍 ${escHtml(alert.address)}</div>
            <div class="alert-card-footer">
                <span class="alert-responses-summary">${respCount} respuesta${respCount !== 1 ? 's' : ''}</span>
                <button class="alert-view-btn">Ver detalle →</button>
            </div>
        `;
        card.addEventListener('click', () => openDetailModal(alert.firebaseKey));
        return card;
    }

    // ===== Create Alert Modal =====
    let selectedCause = null;

    $('btn-panic').addEventListener('click', () => {
        const alertsList = Object.entries(alertsCache).map(([k, v]) => ({ ...v, firebaseKey: k }));
        if (alertsList.find(a => a.userId === currentUser.id && a.active)) {
            toast('Ya tienes una alarma activa', 'danger', '⚠️');
            return;
        }
        selectedCause = null;
        document.querySelectorAll('.cause-btn').forEach(b => b.classList.remove('selected'));
        $('custom-cause-wrap').classList.add('hidden');
        $('custom-cause').value = '';
        $('btn-confirm-alert').disabled = true;
        $('modal-alert').classList.remove('hidden');
    });

    document.querySelectorAll('.cause-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cause-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            const cause = btn.dataset.cause;
            if (cause === 'Otro') {
                $('custom-cause-wrap').classList.remove('hidden');
                selectedCause = null;
                $('btn-confirm-alert').disabled = true;
            } else {
                $('custom-cause-wrap').classList.add('hidden');
                selectedCause = cause;
                $('btn-confirm-alert').disabled = false;
            }
        });
    });

    $('custom-cause').addEventListener('input', e => {
        const val = e.target.value.trim();
        selectedCause = val.length > 0 ? val : null;
        $('btn-confirm-alert').disabled = !selectedCause;
    });

    $('modal-close').addEventListener('click', () => $('modal-alert').classList.add('hidden'));
    $('btn-cancel-alert').addEventListener('click', () => $('modal-alert').classList.add('hidden'));
    $('modal-alert').querySelector('.modal-backdrop').addEventListener('click', () => $('modal-alert').classList.add('hidden'));

    $('btn-confirm-alert').addEventListener('click', () => {
        if (!selectedCause) return;
        const newAlertRef = alertsRef.push();
        newAlertRef.set({
            userId: currentUser.id,
            userName: currentUser.name,
            address: currentUser.address,
            cause: selectedCause,
            timestamp: Date.now(),
            active: true
        });
        $('modal-alert').classList.add('hidden');
        toast('¡Alarma activada! Tu comunidad ha sido alertada.', 'danger', '🚨');
    });

    // ===== Deactivate =====
    $('btn-deactivate').addEventListener('click', () => {
        const alertsList = Object.entries(alertsCache).map(([k, v]) => ({ ...v, firebaseKey: k }));
        const myAlert = alertsList.find(a => a.userId === currentUser.id && a.active);
        if (myAlert) {
            alertsRef.child(myAlert.firebaseKey).update({ active: false });
            toast('Alarma desactivada', 'success', '✅');
        }
    });

    // ===== Detail Modal =====
    function openDetailModal(firebaseKey) {
        const alert = alertsCache[firebaseKey];
        if (!alert) return;

        const body = $('detail-body');
        const actions = $('detail-actions');
        const time = new Date(alert.timestamp).toLocaleString('es-CL');
        const responses = alert.responses ? Object.values(alert.responses) : [];

        let responsesHtml = '';
        if (responses.length > 0) {
            const colorMap = { 'Voy en camino': 'green', 'Pide más antecedentes': 'blue', 'Llamé a Carabineros': 'orange', 'Llamé a Bomberos': 'purple', '¿Estás bien?': 'yellow' };
            responsesHtml = `<div class="detail-responses-section"><h3>Respuestas</h3><div class="detail-response-list">`;
            responses.forEach(r => {
                const c = colorMap[r.action] || 'green';
                responsesHtml += `<div class="detail-response-item"><span class="resp-user">${escHtml(r.userName)}</span><span class="resp-action ${c}">${escHtml(r.action)}</span></div>`;
            });
            responsesHtml += `</div></div>`;
        }

        body.innerHTML = `
            <div class="detail-info">
                <div class="detail-row"><span class="detail-label">Quién</span><span class="detail-value">${escHtml(alert.userName)}</span></div>
                <div class="detail-row"><span class="detail-label">Dirección</span><span class="detail-value">📍 ${escHtml(alert.address)}</span></div>
                <div class="detail-row"><span class="detail-label">Motivo</span><span class="detail-value" style="color:var(--accent-red);font-weight:600">🚨 ${escHtml(alert.cause)}</span></div>
                <div class="detail-row"><span class="detail-label">Hora</span><span class="detail-value">${time}</span></div>
            </div>
            ${responsesHtml}
        `;

        const alreadyResponded = responses.find(r => r.userId === currentUser.id);
        const isOwner = alert.userId === currentUser.id;

        if (isOwner) {
            actions.innerHTML = `<span style="font-size:0.85rem;color:var(--text-muted)">Esta es tu alerta</span>`;
        } else if (alreadyResponded) {
            actions.innerHTML = `<span style="font-size:0.85rem;color:var(--accent-green);font-weight:600">✓ Ya respondiste: ${escHtml(alreadyResponded.action)}</span>`;
        } else {
            const btns = [
                { action: 'Voy en camino', icon: '🏃', cls: 'a-enroute' },
                { action: 'Pide más antecedentes', icon: '❓', cls: 'a-info' },
                { action: 'Llamé a Carabineros', icon: '🚔', cls: 'a-police' },
                { action: 'Llamé a Bomberos', icon: '🚒', cls: 'a-fire' },
                { action: '¿Estás bien?', icon: '💬', cls: 'a-ok' }
            ];
            actions.innerHTML = btns.map(b =>
                `<button class="action-btn ${b.cls}" data-fkey="${firebaseKey}" data-action="${b.action}">${b.icon} ${b.action}</button>`
            ).join('');
            actions.querySelectorAll('.action-btn').forEach(btn => {
                btn.addEventListener('click', () => respondToAlert(btn.dataset.fkey, btn.dataset.action));
            });
        }

        $('modal-detail').classList.remove('hidden');
    }

    $('detail-close').addEventListener('click', () => $('modal-detail').classList.add('hidden'));
    $('modal-detail').querySelector('.modal-backdrop').addEventListener('click', () => $('modal-detail').classList.add('hidden'));

    function respondToAlert(firebaseKey, action) {
        const alert = alertsCache[firebaseKey];
        if (!alert) return;
        const responses = alert.responses ? Object.values(alert.responses) : [];
        if (responses.find(r => r.userId === currentUser.id)) {
            toast('Ya respondiste a esta alerta', 'info', 'ℹ️');
            return;
        }
        alertsRef.child(firebaseKey).child('responses').push({
            userId: currentUser.id,
            userName: currentUser.name,
            action: action,
            timestamp: Date.now()
        });
        $('modal-detail').classList.add('hidden');
        toast(`Respuesta enviada: ${action}`, 'success', '✅');
    }

    // ===== Helpers =====
    function escHtml(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
    function getRelativeTime(ts) {
        const diff = Math.floor((Date.now() - ts) / 1000);
        if (diff < 10) return 'Ahora';
        if (diff < 60) return `Hace ${diff}s`;
        if (diff < 3600) return `Hace ${Math.floor(diff / 60)}m`;
        if (diff < 86400) return `Hace ${Math.floor(diff / 3600)}h`;
        return new Date(ts).toLocaleDateString('es-CL');
    }

    // ===== Init =====
    const session = getSession();
    if (session && session.id) {
        // Validate session: re-fetch user from Firebase to ensure ID is correct
        usersRef.child(session.id).once('value', snap => {
            if (snap.val()) {
                enterDashboard(session);
            } else {
                // Old session with invalid ID, force re-login
                clearSession();
                showView('login');
                toast('Tu sesión expiró. Inicia sesión nuevamente.', 'info', 'ℹ️');
            }
        });
    } else {
        clearSession();
        showView('login');
    }

})();
