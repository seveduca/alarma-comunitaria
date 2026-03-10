/* ========================================
   SISTEMA DE ALARMA COMUNITARIA - App Logic
   ======================================== */

(function() {
    'use strict';

    // ===== Storage Keys =====
    const KEYS = {
        USERS: 'ac_users',
        SESSION: 'ac_session',
        ALERTS: 'ac_alerts'
    };

    // ===== BroadcastChannel for cross-tab sync =====
    let channel;
    try { channel = new BroadcastChannel('alarm_community'); } catch(e) { channel = null; }

    // ===== Sound Manager =====
    const SoundManager = {
        ctx: null,
        playing: false,
        nodes: [],
        init() {
            if (!this.ctx) {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            }
        },
        startSiren() {
            this.init();
            if (this.playing) return;
            this.playing = true;
            this._playSirenLoop();
        },
        _playSirenLoop() {
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
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 1.0);
            this.nodes.push(osc, gain);
            setTimeout(() => { if (this.playing) this._playSirenLoop(); }, 1050);
        },
        stopSiren() {
            this.playing = false;
            this.nodes.forEach(n => { try { n.disconnect(); } catch(e){} });
            this.nodes = [];
        }
    };

    // ===== Data Helpers =====
    function getUsers() {
        return JSON.parse(localStorage.getItem(KEYS.USERS) || '[]');
    }
    function saveUsers(users) {
        localStorage.setItem(KEYS.USERS, JSON.stringify(users));
    }
    function getSession() {
        return JSON.parse(localStorage.getItem(KEYS.SESSION) || 'null');
    }
    function saveSession(user) {
        localStorage.setItem(KEYS.SESSION, JSON.stringify(user));
    }
    function clearSession() {
        localStorage.removeItem(KEYS.SESSION);
    }
    function getAlerts() {
        return JSON.parse(localStorage.getItem(KEYS.ALERTS) || '[]');
    }
    function saveAlerts(alerts) {
        localStorage.setItem(KEYS.ALERTS, JSON.stringify(alerts));
        if (channel) channel.postMessage({ type: 'alerts_updated' });
    }

    // ===== DOM References =====
    const $ = id => document.getElementById(id);
    const views = {
        login: $('view-login'),
        register: $('view-register'),
        dashboard: $('view-dashboard')
    };

    // ===== View Management =====
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
        setTimeout(() => {
            el.classList.add('toast-exit');
            setTimeout(() => el.remove(), 300);
        }, 3500);
    }

    // ===== Auth =====
    $('link-to-register').addEventListener('click', e => { e.preventDefault(); showView('register'); });
    $('link-to-login').addEventListener('click', e => { e.preventDefault(); showView('login'); });

    $('form-login').addEventListener('submit', e => {
        e.preventDefault();
        const username = $('login-username').value.trim();
        const password = $('login-password').value;
        const users = getUsers();
        const user = users.find(u => u.username === username && u.password === password);
        if (!user) { toast('Usuario o contraseña incorrectos', 'danger', '❌'); return; }
        saveSession(user);
        $('form-login').reset();
        enterDashboard(user);
    });

    $('form-register').addEventListener('submit', e => {
        e.preventDefault();
        const name = $('reg-name').value.trim();
        const address = $('reg-address').value.trim();
        const username = $('reg-username').value.trim();
        const password = $('reg-password').value;
        if (password.length < 4) { toast('La contraseña debe tener al menos 4 caracteres', 'danger', '❌'); return; }
        const users = getUsers();
        if (users.find(u => u.username === username)) { toast('Ese nombre de usuario ya existe', 'danger', '❌'); return; }
        const user = { id: Date.now().toString(), name, address, username, password };
        users.push(user);
        saveUsers(users);
        saveSession(user);
        $('form-register').reset();
        toast('¡Cuenta creada exitosamente!', 'success', '✅');
        enterDashboard(user);
    });

    $('btn-logout').addEventListener('click', () => {
        SoundManager.stopSiren();
        $('alarm-overlay').classList.add('hidden');
        clearSession();
        showView('login');
    });

    // ===== Dashboard =====
    let currentUser = null;

    function enterDashboard(user) {
        currentUser = user;
        $('navbar-user').textContent = user.name;
        showView('dashboard');
        refreshDashboard();
    }

    function refreshDashboard() {
        if (!currentUser) return;
        const alerts = getAlerts();
        const myAlert = alerts.find(a => a.userId === currentUser.id && a.active);

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
            $('alarm-overlay').classList.add('hidden');
            SoundManager.stopSiren();
        }

        // Feed - show other users' active alerts
        const otherAlerts = alerts.filter(a => a.userId !== currentUser.id && a.active);
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
            // Play siren for receiver too if there are active alerts
            if (!myAlert && otherAlerts.length > 0) {
                $('alarm-overlay').classList.remove('hidden');
                SoundManager.startSiren();
            }
        }

        // If no alerts at all, stop everything
        if (!myAlert && otherAlerts.length === 0) {
            $('alarm-overlay').classList.add('hidden');
            SoundManager.stopSiren();
        }
    }

    function renderMyAlarmResponses(alert) {
        const container = $('my-alarm-responses');
        container.innerHTML = '';
        if (!alert.responses || alert.responses.length === 0) {
            container.innerHTML = '<span style="font-size:0.82rem;color:var(--text-muted)">Esperando respuestas de la comunidad...</span>';
            return;
        }
        const counts = {};
        alert.responses.forEach(r => {
            counts[r.action] = (counts[r.action] || 0) + 1;
        });
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
        const respCount = (alert.responses || []).length;

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
        card.addEventListener('click', () => openDetailModal(alert.id));
        return card;
    }

    // ===== Create Alert Modal =====
    let selectedCause = null;

    $('btn-panic').addEventListener('click', () => {
        // Check if user already has active alarm
        const alerts = getAlerts();
        if (alerts.find(a => a.userId === currentUser.id && a.active)) {
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
        if (val.length > 0) {
            selectedCause = val;
            $('btn-confirm-alert').disabled = false;
        } else {
            selectedCause = null;
            $('btn-confirm-alert').disabled = true;
        }
    });

    $('modal-close').addEventListener('click', () => $('modal-alert').classList.add('hidden'));
    $('btn-cancel-alert').addEventListener('click', () => $('modal-alert').classList.add('hidden'));
    $('modal-alert').querySelector('.modal-backdrop').addEventListener('click', () => $('modal-alert').classList.add('hidden'));

    $('btn-confirm-alert').addEventListener('click', () => {
        if (!selectedCause) return;
        const alert = {
            id: Date.now().toString(),
            userId: currentUser.id,
            userName: currentUser.name,
            address: currentUser.address,
            cause: selectedCause,
            timestamp: Date.now(),
            active: true,
            responses: []
        };
        const alerts = getAlerts();
        alerts.push(alert);
        saveAlerts(alerts);
        $('modal-alert').classList.add('hidden');
        toast('¡Alarma activada! Tu comunidad ha sido alertada.', 'danger', '🚨');
        refreshDashboard();
    });

    // ===== Deactivate Alarm =====
    $('btn-deactivate').addEventListener('click', () => {
        const alerts = getAlerts();
        const idx = alerts.findIndex(a => a.userId === currentUser.id && a.active);
        if (idx !== -1) {
            alerts[idx].active = false;
            saveAlerts(alerts);
            toast('Alarma desactivada', 'success', '✅');
            refreshDashboard();
        }
    });

    // ===== Detail Modal =====
    function openDetailModal(alertId) {
        const alerts = getAlerts();
        const alert = alerts.find(a => a.id === alertId);
        if (!alert) return;

        const body = $('detail-body');
        const actions = $('detail-actions');
        const time = new Date(alert.timestamp).toLocaleString('es-CL');

        let responsesHtml = '';
        if (alert.responses && alert.responses.length > 0) {
            const colorMap = { 'Voy en camino': 'green', 'Pide más antecedentes': 'blue', 'Llamé a Carabineros': 'orange', 'Llamé a Bomberos': 'purple', '¿Estás bien?': 'yellow' };
            responsesHtml = `<div class="detail-responses-section"><h3>Respuestas</h3><div class="detail-response-list">`;
            alert.responses.forEach(r => {
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

        // Check if current user already responded
        const alreadyResponded = alert.responses && alert.responses.find(r => r.userId === currentUser.id);
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
                `<button class="action-btn ${b.cls}" data-alert-id="${alertId}" data-action="${b.action}">${b.icon} ${b.action}</button>`
            ).join('');

            actions.querySelectorAll('.action-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    respondToAlert(btn.dataset.alertId, btn.dataset.action);
                });
            });
        }

        $('modal-detail').classList.remove('hidden');
    }

    $('detail-close').addEventListener('click', () => $('modal-detail').classList.add('hidden'));
    $('modal-detail').querySelector('.modal-backdrop').addEventListener('click', () => $('modal-detail').classList.add('hidden'));

    function respondToAlert(alertId, action) {
        const alerts = getAlerts();
        const alert = alerts.find(a => a.id === alertId);
        if (!alert) return;
        if (!alert.responses) alert.responses = [];
        if (alert.responses.find(r => r.userId === currentUser.id)) {
            toast('Ya respondiste a esta alerta', 'info', 'ℹ️');
            return;
        }
        alert.responses.push({
            userId: currentUser.id,
            userName: currentUser.name,
            action: action,
            timestamp: Date.now()
        });
        saveAlerts(alerts);
        $('modal-detail').classList.add('hidden');
        toast(`Respuesta enviada: ${action}`, 'success', '✅');
        refreshDashboard();
    }

    // ===== Cross-tab sync =====
    if (channel) {
        channel.onmessage = (e) => {
            if (e.data.type === 'alerts_updated') {
                refreshDashboard();
            }
        };
    }
    // Fallback: poll localStorage every 2 seconds
    setInterval(() => { if (currentUser) refreshDashboard(); }, 2000);

    // ===== Helpers =====
    function escHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

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
    if (session) {
        enterDashboard(session);
    } else {
        showView('login');
    }

})();
