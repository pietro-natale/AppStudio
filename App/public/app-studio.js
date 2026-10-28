/**
 * PONTE DELL'APP DELLO STUDIO («Studio T», portale/app-studio).
 * ---------------------------------------------------------------------------
 * Un solo file, caricato da tutte e tre le pagine dell'app PRIMA del loro codice:
 *   index.html          accesso e notifiche (home/accesso.js)
 *   studio.html         il cruscotto della dottoressa (portale/web, come tramontano.studio/studio)
 *   agenda/index.html   l'agenda (cartella agenda, come tramontano.studio/agenda/)
 * Fuori dall'app (sito, browser) non fa nulla: window.AppStudio non esiste e le due
 * parti restano quelle di sempre.
 *
 * Nell'app:
 *  - window.AppStudio: le pagine lo usano per uscire, per tornare all'accesso quando la
 *    sessione finisce e per lo stato delle notifiche (studio.js, agenda/src/main.jsx);
 *  - barra in basso (build 2): le schede dell'agenda (Agenda, Clienti, Richieste, Attesa)
 *    e «Altro» (Promemoria, Impostazioni, Notifiche del telefono, Esci), con i numeri da
 *    vedere; per la dottoressa in piu' «Studio», il cruscotto. Nell'app l'agenda non mostra
 *    la sua fila di schede in alto e dice qui quale scheda e' aperta (AppStudio.schede).
 *    Mentre si scrive (tastiera aperta) la barra si toglie;
 *  - tocco su una notifica: apre la parte e la scheda giuste (dati.apri: "/agenda/#richieste",
 *    "/studio#arrivi"...); alla segretaria cio' che e' del cruscotto apre l'agenda;
 *  - tasto Indietro di Android: chiude «Altro» o il pannello aperto, torna alla vista
 *    precedente o, nell'agenda, alla scheda Agenda; dalla vista principale manda l'app in
 *    secondo piano;
 *  - aree sicure di Android (Capacitor 8): all'agenda arrivano anche i valori giusti.
 * Build 4 (versione .57):
 *  - telefono in orizzontale: la barra diventa una colonna a sinistra (nella fascia della tacca,
 *    altrimenti vuota) e la pagina usa tutta l'altezza;
 *  - iPhone: con un campo attivo la barra si toglie sempre (sopra compaiono tastiera o la fila
 *    ^ v ✓ dei campi, che la coprivano);
 *  - fascia sotto la barra di stato: cio' che scorre non passa piu' sotto l'orologio;
 *  - «Studio» toccato dentro il cruscotto riporta alla sua pagina iniziale;
 *  - la registrazione per le notifiche si rinnova qui, in sottofondo, a pagina gia' aperta
 *    (prima l'accesso la aspettava fino a 5 secondi a ogni avvio).
 * Versione .69:
 *  - ritorno in primo piano: evento «app-in-primo-piano» per la pagina aperta (l'agenda rilegge richieste e
 *    numeri, il cruscotto il contatore «Dai pazienti»), notifiche gia' consegnate tolte dal centro notifiche e,
 *    nel cruscotto, la sessione dello Studio rinnovata prima che scada (rinnovaSeServe);
 *  - notifica arrivata ad app aperta (o toccata): evento «app-studio-notifica-arrivata» (l'agenda rilegge le richieste);
 *  - tasto Indietro: nell'agenda chiude l'ultima finestra aperta (window.__agendaIndietro, con conferma se ci sono
 *    modifiche), nell'accesso torna dalla pagina delle notifiche alla parte da cui si e' venuti (window.__homeIndietro).
 * Le pagine si aprono sempre con il nome del file (/agenda/index.html, non /agenda/):
 * nell'app un indirizzo senza file apre la pagina iniziale.
 */
(function () {
  'use strict';
  var C = window.Capacitor;
  if (!C || typeof C.isNativePlatform !== 'function' || !C.isNativePlatform()) return;

  var PAGINE = { home: '/index.html', studio: '/studio.html', agenda: '/agenda/index.html' };
  var CHIAVE_RUOLO = 'app-studio-ruolo', CHIAVE_SEZIONE = 'app-studio-sezione';
  /* le schede dell'agenda, come in agenda/src/main.jsx: quattro nella barra, due in «Altro» */
  var SCHEDE_AGENDA = ['agenda', 'clienti', 'promemoria', 'richieste', 'attesa', 'impostazioni'];
  var IN_ALTRO = ['promemoria', 'impostazioni'];
  var plugin = function (n) { return (C.Plugins && C.Plugins[n]) || null; };
  var piattaforma = typeof C.getPlatform === 'function' ? C.getPlatform() : 'android';
  var leggi = function (k) { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } };
  var scrivi = function (k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (_) {} };
  var p = location.pathname;
  var pagina = /\/agenda\//.test(p) ? 'agenda' : (/\/studio(\.html)?$/.test(p) ? 'studio' : 'home');
  var ruolo = function () { return leggi(CHIAVE_RUOLO); };
  if (pagina !== 'home') scrivi(CHIAVE_SEZIONE, pagina);   // all'avvio si riapre l'ultima parte usata

  /* scheda dell'agenda scritta nell'indirizzo (#clienti...); '' se non e' una scheda */
  function schedaDaIndirizzo() {
    var h = String(location.hash || '').replace(/^#/, '');
    return SCHEDE_AGENDA.indexOf(h) >= 0 ? h : '';
  }
  /* cio' che mostra la barra: la voce attiva e i numeri dell'agenda (richieste, attesa, promemoria) */
  var barraStato = { attiva: pagina === 'studio' ? 'studio' : (schedaDaIndirizzo() || 'agenda'), conteggi: {} };

  /* Pagina da aprire per una notifica o una scelta: "/agenda/#richieste" -> /agenda/index.html#richieste.
     Il cruscotto e' solo della dottoressa: per chiunque altro diventa l'agenda (scheda Richieste). */
  function destinazione(apri) {
    var a = String(apri || '');
    var i = a.indexOf('#'), hash = i >= 0 ? a.slice(i) : '', via = i >= 0 ? a.slice(0, i) : a;
    if (/^\/studio/.test(via)) return ruolo() === 'dottoressa' ? PAGINE.studio + hash : PAGINE.agenda + '#richieste';
    if (/^\/agenda/.test(via)) return PAGINE.agenda + hash;
    return '';
  }
  function modificheNonSalvate() {
    try { return pagina === 'studio' && typeof window.__studioModificato === 'function' && window.__studioModificato(); } catch (_) { return false; }
  }
  /* Apre una pagina dell'app. Sulla stessa pagina cambia solo la scheda (#...), senza ricaricare. */
  function apriPagina(url) {
    if (!url) return;
    var i = url.indexOf('#'), via = i >= 0 ? url.slice(0, i) : url, hash = i >= 0 ? url.slice(i) : '';
    if (location.pathname === via) {
      if (hash) {
        if (location.hash === hash) { history.replaceState(null, '', via); }   // stessa scheda: si riapre lo stesso
        location.hash = hash;
      }
      return;
    }
    if (modificheNonSalvate() && !window.confirm('Ci sono modifiche non salvate. Uscire comunque?')) return;
    location.href = url;
  }

  /* .69 (A-1): la sessione dello Studio (12 ore dalla creazione) si rinnova prima che scada, quando il cruscotto si apre
     o torna in primo piano senza lavoro in corso: l'API ne da' una nuova quando a quella di prima manca meno di un'ora,
     quindi si chiede da 11 ore e 5 minuti in poi. L'eta' la scrive accesso.js (app-studio-token-studio-dal). Un
     tentativo ogni mezz'ora al massimo: nessun giro fra accesso e cruscotto. */
  var ORE_STUDIO = 12, ANTICIPO_MS = 55 * 60 * 1000, CHIAVE_TENTATO = 'app-studio-rinnovo-tentato';
  function studioDaRinnovare() {
    var t = ''; try { t = sessionStorage.getItem('studio-token') || ''; } catch (_) {}
    var dal = Number(leggi('app-studio-token-studio-dal')) || 0;
    if (!t || !dal || t !== leggi('app-studio-token-studio')) return false;
    return Date.now() - dal > ORE_STUDIO * 3600e3 - ANTICIPO_MS;
  }
  function rinnovoPreventivo() {
    if (pagina !== 'studio' || !studioDaRinnovare()) return false;
    if (modificheNonSalvate() || document.querySelector('.mod, .sel-ov')) return false;   // lavoro aperto: lo protegge la bozza (studio.js)
    var tentato = 0; try { tentato = Number(sessionStorage.getItem(CHIAVE_TENTATO)) || 0; } catch (_) {}
    if (Date.now() - tentato < 30 * 60 * 1000) return false;
    try { sessionStorage.setItem(CHIAVE_TENTATO, String(Date.now())); } catch (_) {}
    window.AppStudio.studioScaduto();
    return true;
  }
  /* .69 (A-1): via dal centro notifiche quelle gia' consegnate (l'app aperta le ha viste), come nell'app dei pazienti.
     Su iPhone il plugin lo rifiuta finche' in questo avvio il telefono non si e' registrato: si riprova dopo. */
  function pulisciNotifiche() {
    var P = plugin('PushNotifications');
    if (!P || !P.removeAllDeliveredNotifications) return;
    try { var r = P.removeAllDeliveredNotifications(); if (r && r.catch) r.catch(function () {}); } catch (_) {}
  }
  function evento(nome, dati) {
    try { window.dispatchEvent(new CustomEvent(nome, { detail: dati || {} })); } catch (_) {}
  }

  var dopoNotifica = '';   // pagina home: la notifica toccata ad app chiusa la apre accesso.js, a controlli fatti
  window.AppStudio = {
    sito: 'https://tramontano.studio',     // i link mandati ai pazienti puntano al sito, non all'app
    pagina: pagina,
    piattaforma: piattaforma,
    ruolo: ruolo,
    /** 'studio' | 'agenda' | 'notifiche' (impostazioni delle notifiche, poi si torna qui) */
    vai: function (dove) {
      if (dove === 'notifiche') { apriPagina(PAGINE.home + '#notifiche-' + pagina); return; }
      apriPagina(PAGINE[dove] || PAGINE.home);
    },
    /** Uscita completa (telefono senza notifiche, sessioni chiuse): la fa la pagina di accesso. */
    esci: function () {
      if (modificheNonSalvate() && !window.confirm('Ci sono modifiche non salvate. Uscire comunque?')) return;
      location.href = PAGINE.home + '#esci';
    },
    /** L'agenda non ha piu' la sessione (scaduta o chiusa): di nuovo all'accesso dell'app. */
    accesso: function () { location.href = PAGINE.home + '#accesso'; },
    /** La sessione del cruscotto e' scaduta (12 ore): l'accesso dell'app la rinnova e riapre il cruscotto. */
    studioScaduto: function () { location.href = PAGINE.home + '#rinnova-studio'; },
    destinazione: destinazione,
    apriPagina: apriPagina,
    /** Notifica toccata prima che la pagina di accesso abbia finito i controlli (solo home). */
    prendiNotifica: function () { var d = dopoNotifica; dopoNotifica = ''; return d; },
    /** Stato delle notifiche su questo telefono: 'attive' | 'spente' | 'negate' | 'impossibile'. */
    statoNotifiche: function () {
      var Push = plugin('PushNotifications');
      if (!Push) return Promise.resolve('impossibile');
      return Push.checkPermissions().then(function (r) {
        // subito dopo l'accesso il token si sta ancora rinnovando (rinnovaNotifiche): sono attive, non spente
        if (r.receive === 'granted') return (leggi('app-studio-push-token') || rinnovoInCorso()) ? 'attive' : 'spente';
        return r.receive === 'denied' ? 'negate' : 'spente';
      }).catch(function () { return 'impossibile'; });
    },
    /** .69 (A-1): il cruscotto, all'apertura: true se la sessione dello Studio va rinnovata adesso (la pagina cambia). */
    rinnovaSeServe: function () { return rinnovoPreventivo(); },
    /** L'agenda dice quale scheda e' aperta e i numeri da mostrare nella barra:
        { attiva: 'clienti', conteggi: { richieste: 2, attesa: 5, promemoria: 0 } }.
        Se c'e' questa funzione, l'agenda lascia le schede alla barra in basso. */
    schede: function (s) {
      if (pagina !== 'agenda' || !s) return;
      if (SCHEDE_AGENDA.indexOf(s.attiva) >= 0) barraStato.attiva = s.attiva;
      barraStato.conteggi = s.conteggi || {};
      aggiornaBarra();
    }
  };

  /* ---- notifiche: il tocco porta alla parte giusta (la registrazione la fa la pagina di accesso) ---- */
  var Push = plugin('PushNotifications');
  if (Push && Push.addListener) {
    try {
      Push.addListener('pushNotificationActionPerformed', function (ev) {
        var d = destinazione(ev && ev.notification && ev.notification.data && ev.notification.data.apri);
        if (pagina === 'home') { dopoNotifica = d; try { window.dispatchEvent(new CustomEvent('app-studio-notifica')); } catch (_) {} return; }
        mostraAltro(false);
        // .69 (G-02): sulla stessa pagina cambia solo la scheda: la pagina rilegge cio' che la notifica annuncia
        evento('app-studio-notifica-arrivata', (ev && ev.notification && ev.notification.data) || {});
        apriPagina(d);
      });
      // .69 (G-02): notifica arrivata con l'app aperta: richieste e contatori si rileggono subito
      Push.addListener('pushNotificationReceived', function (n) { evento('app-studio-notifica-arrivata', (n && n.data) || {}); });
    } catch (_) {}
  }

  /* ---- tasto Indietro (Android) ---- */
  var App = plugin('App');
  function inSecondoPiano() {
    if (App && App.minimizeApp) { App.minimizeApp().catch(function () {}); return; }
    if (App && App.exitApp) App.exitApp();
  }
  /* ---- .69 (A-1): ritorno in primo piano (Android e iPhone) ---- */
  if (App && App.addListener) {
    try {
      App.addListener('appStateChange', function (st) {
        if (!st || !st.isActive) return;
        pulisciNotifiche();
        if (rinnovoPreventivo()) return;              // cruscotto: la pagina passa al rinnovo
        evento('app-in-primo-piano');
      });
    } catch (_) {}
  }
  if (pagina === 'home') pulisciNotifiche();          // avvio dell'app
  if (App && App.addListener && piattaforma === 'android') {
    try {
      App.addListener('backButton', function () {
        if (altroAperto) { mostraAltro(false); return; }                             // «Altro» della barra
        if (pagina === 'studio') {
          var sel = document.querySelector('.sel-ov');
          if (sel) { sel.remove(); return; }                                         // scelta dal catalogo
          var chiudi = document.querySelector('.mod #chiudi');
          if (chiudi) { chiudi.click(); return; }                                    // modifica della dieta
          var torna = document.querySelector('.riga-torna .link');
          if (torna) { torna.click(); return; }                                      // vista interna: indietro
          inSecondoPiano(); return;
        }
        if (pagina === 'agenda') {
          // .69 (G-09): l'agenda chiude l'ultima finestra aperta (con conferma se ha modifiche); un'agenda di prima no
          if (typeof window.__agendaIndietro === 'function') { if (window.__agendaIndietro()) return; }
          else if (document.querySelector('.modal-safe, .fixed.inset-0')) return;
          if (barraStato.attiva !== 'agenda') { scegli('agenda'); return; }           // da un'altra scheda: all'Agenda
          inSecondoPiano(); return;
        }
        // .69 (G-09): dalla pagina delle notifiche si torna alla parte da cui si e' venuti
        if (typeof window.__homeIndietro === 'function' && window.__homeIndietro()) return;
        inSecondoPiano();
      });
    } catch (_) {}
  }

  /* ---- schermata di avvio: si toglie quando la parte aperta e' pronta (la pagina di accesso la toglie da se') ---- */
  if (pagina !== 'home') {
    var togliAvvio = function () {
      var S = plugin('SplashScreen');
      if (S && S.hide) { try { var r = S.hide(); if (r && r.catch) r.catch(function () {}); } catch (_) {} }
    };
    if (document.readyState === 'complete') setTimeout(togliAvvio, 250);
    else window.addEventListener('load', function () { setTimeout(togliAvvio, 250); });
  }

  /* ---- aspetto: aree sicure e barra in basso ---- */
  function stile(css) { var s = document.createElement('style'); s.setAttribute('data-app-studio', ''); s.textContent = css; (document.head || document.documentElement).appendChild(s); }
  var CARATTERE = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
  /* telefono in orizzontale (poca altezza): barra a sinistra. Stesso confine nei fogli di cruscotto e agenda. */
  var ORIZZONTALE = '(orientation: landscape) and (max-height: 520px)';
  stile(
    'html{--as-alto:var(--safe-area-inset-top, env(safe-area-inset-top, 0px));--as-basso:var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px));' +
    '--as-sx:var(--safe-area-inset-left, env(safe-area-inset-left, 0px));--as-dx:var(--safe-area-inset-right, env(safe-area-inset-right, 0px));--as-barra:60px;' +
    '--as-binario:76px;--as-lato:calc(var(--as-binario) + var(--as-sx))}' +
    // agenda: le sue aree sicure con i valori di Capacitor (Android 15+, WebView vecchie)
    'html:root{--safe-top:var(--as-alto);--safe-bottom:var(--as-basso);--safe-left:var(--as-sx);--safe-right:var(--as-dx)}' +
    '.as-barra{position:fixed;left:0;right:0;bottom:0;z-index:45;display:flex;justify-content:center;box-sizing:border-box;height:calc(var(--as-barra) + var(--as-basso));' +
    'padding:0 var(--as-dx) var(--as-basso) var(--as-sx);background:#fff;border-top:1px solid #e3e1d8;font-family:' + CARATTERE + '}' +
    '.as-voci{display:flex;flex:1 1 auto;max-width:640px;height:var(--as-barra)}' +
    '.as-voce{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border:0;background:none;margin:0;padding:0 1px;' +
    'color:#64635b;font:inherit;font-size:clamp(10px,2.9vw,12px);font-weight:500;line-height:1.15;-webkit-tap-highlight-color:transparent;cursor:pointer;-webkit-user-select:none;user-select:none}' +
    '.as-testo{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.as-icona{position:relative;display:flex;align-items:center;justify-content:center;width:50px;height:30px;border-radius:15px;transition:background-color .15s ease}' +
    '.as-icona svg{display:block;width:23px;height:23px}' +
    '.as-voce.attiva{color:#2f6b57;font-weight:700}.as-voce.attiva .as-icona{background:#dcebe3}.as-voce:active .as-icona{background:#eaf2ed}' +
    '.as-conta{position:absolute;top:-3px;left:calc(50% + 4px);min-width:18px;height:18px;padding:0 5px;box-sizing:border-box;border-radius:9px;background:#e11d48;' +
    'color:#fff;font-size:11px;font-weight:700;line-height:18px;text-align:center;box-shadow:0 0 0 2px #fff;font-variant-numeric:tabular-nums}' +
    '.as-conta[hidden],.as-riga-conta[hidden]{display:none}' +
    // «Altro»: pannello sopra la barra, con il velo sul resto della pagina
    '.as-velo{position:fixed;left:0;right:0;top:0;bottom:calc(var(--as-barra) + var(--as-basso));z-index:46;background:rgba(32,34,30,.3)}' +
    '.as-altro{position:fixed;left:0;right:0;bottom:calc(var(--as-barra) + var(--as-basso));z-index:47;box-sizing:border-box;max-width:640px;margin:0 auto;' +
    'max-height:calc(100vh - var(--as-barra) - var(--as-basso) - var(--as-alto) - 16px);overflow-y:auto;padding:8px var(--as-dx) 6px var(--as-sx);' +
    'background:#fff;border-radius:18px 18px 0 0;box-shadow:0 -6px 24px rgba(0,0,0,.14);font-family:' + CARATTERE + '}' +
    '.as-riga{display:flex;align-items:center;gap:14px;width:100%;min-height:52px;box-sizing:border-box;padding:0 20px;border:0;background:none;margin:0;' +
    'font:inherit;font-size:16px;color:#2b2a26;text-align:left;-webkit-tap-highlight-color:transparent;cursor:pointer}' +
    '.as-riga svg{flex:none;width:22px;height:22px;color:#64635b}.as-riga:active{background:#f1f4f2}' +
    '.as-riga.attiva{color:#2f6b57;font-weight:700}.as-riga.attiva svg{color:#2f6b57}' +
    '.as-riga.as-esci{border-top:1px solid #eeece6;margin-top:4px;color:#9f1239}.as-riga.as-esci svg{color:#9f1239}' +
    '.as-riga-testo{flex:1;min-width:0}' +
    '.as-riga-conta{min-width:22px;height:22px;padding:0 7px;box-sizing:border-box;border-radius:11px;background:#e11d48;color:#fff;font-size:12px;font-weight:700;line-height:22px;text-align:center}' +
    // mentre si scrive la barra non serve (e su Android salirebbe sopra la tastiera)
    'body.as-tastiera .as-barra,body.as-tastiera .as-velo,body.as-tastiera .as-altro{display:none}' +
    // fascia sotto la barra di stato (orologio, batteria): cio' che scorre ci passa sotto, non attraverso
    // (e non si tocca per sbaglio: su Android la barra di stato sta sopra la pagina)
    '.as-cielo{position:fixed;left:0;right:0;top:0;height:var(--as-alto);z-index:44}' +
    // agenda: il pulsante «+» e gli avvisi sopra la barra; il fondo della pagina ha gia' spazio (pb-28)
    'body.as-con-barra .fab-safe{bottom:calc(var(--as-basso) + 1.5rem + var(--as-barra)) !important}' +
    'body.as-con-barra.as-tastiera .fab-safe{bottom:calc(var(--as-basso) + 1.5rem) !important}' +
    'body.as-con-barra.as-agenda .bottom-24{bottom:calc(6rem + var(--as-barra)) !important}' +
    // cruscotto: l'ultima riga resta sopra la barra (sul tablet il suo margine in fondo era piu' basso della barra)
    'body.as-con-barra.as-studio .contenuto{padding-bottom:calc(var(--as-barra) + var(--as-basso) + 20px) !important}' +
    // telefono in orizzontale: la barra diventa una colonna a sinistra, nella fascia della tacca
    '@media ' + ORIZZONTALE + '{' +
      '.as-barra{top:0;right:auto;width:var(--as-lato);height:auto;flex-direction:column;justify-content:flex-start;overflow-y:auto;' +
        'padding:calc(var(--as-alto) + 4px) 0 calc(var(--as-basso) + 4px) var(--as-sx);border-top:0;border-right:1px solid #e3e1d8}' +
      '.as-voci{flex:0 0 auto;flex-direction:column;width:var(--as-binario);max-width:none;height:auto;gap:2px;margin:auto 0}' +
      '.as-voce{flex:0 0 auto;height:52px;padding:0 2px;font-size:11px}' +
      '.as-icona{width:46px;height:28px}' +
      '.as-velo{left:var(--as-lato);bottom:0}' +
      // mentre si scrive la colonna resta, vuota (la pagina non si sposta e non resta un buco a sinistra)
      'body.as-tastiera .as-barra{display:flex}body.as-tastiera .as-voci{visibility:hidden}' +
      '.as-altro{left:calc(var(--as-lato) + 8px);right:auto;bottom:calc(var(--as-basso) + 8px);width:300px;max-width:calc(100vw - var(--as-lato) - var(--as-dx) - 16px);' +
        'margin:0;padding:6px 0;border-radius:16px;max-height:calc(100vh - var(--as-alto) - var(--as-basso) - 16px)}' +
      'body.as-con-barra.as-agenda{padding-left:var(--as-lato) !important}' +
      'body.as-con-barra .fab-safe,body.as-con-barra.as-tastiera .fab-safe{bottom:calc(var(--as-basso) + 1rem) !important}' +
      'body.as-con-barra.as-agenda .bottom-24{bottom:calc(var(--as-basso) + 1rem) !important}' +
      // cruscotto: la colonna prende anche la tacca, che quindi non si conta una seconda volta
      'body.as-con-barra.as-studio #app{padding-left:calc(var(--as-lato) - var(--as-sx))}' +
      'body.as-con-barra.as-studio .contenuto{padding-bottom:calc(var(--as-basso) + 20px) !important}' +
    '}'
  );
  var T = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var ICONE = {
    studio: T + '<path d="M9 3h6l1 2h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3z"/><path d="M9 12h6M9 16h4"/></svg>',
    agenda: T + '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    clienti: T + '<circle cx="9" cy="8.2" r="3.2"/><path d="M3.5 19.5c.6-3.3 2.8-5.2 5.5-5.2s4.9 1.9 5.5 5.2"/><path d="M15.6 5.2a3.1 3.1 0 0 1 0 6M17.4 14.6c1.8.6 2.8 2.3 3.1 4.9"/></svg>',
    richieste: T + '<path d="M4 13.5 6.3 6.4A2 2 0 0 1 8.2 5h7.6a2 2 0 0 1 1.9 1.4L20 13.5"/><path d="M4 13.5V18a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 18v-4.5h-4.7l-1.4 2.4h-3.8l-1.4-2.4z"/></svg>',
    attesa: T + '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    altro: T + '<circle cx="5.5" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.7" fill="currentColor" stroke="none"/></svg>',
    promemoria: T + '<path d="M5 19V6.8A1.8 1.8 0 0 1 6.8 5h10.4A1.8 1.8 0 0 1 19 6.8v7.4a1.8 1.8 0 0 1-1.8 1.8H8.6z"/><path d="M8.5 9.5h7M8.5 12.5h4.5"/></svg>',
    impostazioni: T + '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6"/></svg>',
    notifiche: T + '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5z"/><path d="M10 20.2a2 2 0 0 0 4 0"/></svg>',
    esci: T + '<path d="M10 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H10"/><path d="M14.5 8 19 12l-4.5 4M19 12H9.5"/></svg>'
  };
  var NOMI = { studio: 'Studio', agenda: 'Agenda', clienti: 'Clienti', richieste: 'Richieste', attesa: 'Attesa', altro: 'Altro',
    promemoria: 'Promemoria', impostazioni: 'Impostazioni', notifiche: 'Notifiche del telefono', esci: 'Esci' };
  var VOCI_ALTRO = ['promemoria', 'impostazioni', 'notifiche', 'esci'];
  function vociBarra() {
    var v = ['agenda', 'clienti', 'richieste', 'attesa', 'altro'];
    return ruolo() === 'dottoressa' ? ['studio'].concat(v) : v;      // nel dubbio, come la segretaria
  }
  function conteggio(id) {
    var c = barraStato.conteggi || {};
    var n = Number(id === 'altro' ? c.promemoria : c[id]) || 0;
    return n > 0 ? Math.floor(n) : 0;
  }
  function inCima(subito) {
    try { window.scrollTo({ top: 0, behavior: subito ? 'auto' : 'smooth' }); } catch (_) { window.scrollTo(0, 0); }
  }

  var navBarra = null, altroAperto = false, veloAltro = null, foglioAltro = null;
  /* Tocco su una voce della barra o di «Altro» */
  function scegli(id) {
    if (id === 'altro') { mostraAltro(!altroAperto); return; }
    mostraAltro(false);
    if (id === 'studio') {
      if (pagina !== 'studio') window.AppStudio.vai('studio');
      // dentro il cruscotto (un paziente, una dieta): di nuovo alla sua pagina iniziale; li', in cima
      else if (!(typeof window.__studioHome === 'function' && window.__studioHome())) inCima();
      return;
    }
    if (id === 'notifiche') { window.AppStudio.vai('notifiche'); return; }
    if (id === 'esci') { window.AppStudio.esci(); return; }
    if (SCHEDE_AGENDA.indexOf(id) < 0) return;
    if (pagina !== 'agenda') { apriPagina(PAGINE.agenda + '#' + id); return; }
    if (barraStato.attiva === id && location.hash === '#' + id) { inCima(); return; }     // gia' li': torna in cima
    barraStato.attiva = id;
    aggiornaBarra();
    // l'agenda segue l'indirizzo: si cambia senza aggiungere passi alla cronologia, poi si avvisa la pagina
    try {
      history.replaceState(null, '', location.pathname + location.search + '#' + id);
      var ev; try { ev = new HashChangeEvent('hashchange'); } catch (_) { ev = document.createEvent('Event'); ev.initEvent('hashchange', false, false); }
      window.dispatchEvent(ev);
    } catch (_) { location.hash = '#' + id; }
    inCima(true);
  }
  function creaVoce(id) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'as-voce';
    b.setAttribute('data-voce', id);
    b.innerHTML = '<span class="as-icona">' + ICONE[id] + '<span class="as-conta" hidden></span></span><span class="as-testo">' + NOMI[id] + '</span>';
    if (id === 'altro') b.setAttribute('aria-haspopup', 'dialog');
    b.addEventListener('click', function () { scegli(id); });
    return b;
  }
  function creaRiga(id) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'as-riga' + (id === 'esci' ? ' as-esci' : '');
    b.setAttribute('data-voce', id);
    b.innerHTML = ICONE[id] + '<span class="as-riga-testo">' + NOMI[id] + '</span><span class="as-riga-conta" hidden></span>';
    b.addEventListener('click', function () { scegli(id); });
    return b;
  }
  function mostraAltro(si) {
    si = !!si;
    if (si === altroAperto) return;
    altroAperto = si;
    if (si) {
      veloAltro = document.createElement('div');
      veloAltro.className = 'as-velo';
      veloAltro.addEventListener('click', function () { mostraAltro(false); });
      foglioAltro = document.createElement('div');
      foglioAltro.className = 'as-altro';
      foglioAltro.setAttribute('role', 'dialog');
      foglioAltro.setAttribute('aria-label', 'Altro');
      VOCI_ALTRO.forEach(function (id) { foglioAltro.appendChild(creaRiga(id)); });
      document.body.appendChild(veloAltro);
      document.body.appendChild(foglioAltro);
    } else {
      if (veloAltro && veloAltro.parentNode) veloAltro.parentNode.removeChild(veloAltro);
      if (foglioAltro && foglioAltro.parentNode) foglioAltro.parentNode.removeChild(foglioAltro);
      veloAltro = foglioAltro = null;
    }
    aggiornaBarra();
  }
  /* voce attiva e numeri, nella barra e in «Altro» */
  function aggiornaBarra() {
    var tutte = document.querySelectorAll('.as-barra [data-voce], .as-altro [data-voce]');
    for (var i = 0; i < tutte.length; i++) {
      var b = tutte[i], id = b.getAttribute('data-voce'), riga = b.className.indexOf('as-riga') >= 0;
      var on;
      if (riga) on = pagina === 'agenda' && barraStato.attiva === id;
      else if (id === 'altro') on = altroAperto || (pagina === 'agenda' && IN_ALTRO.indexOf(barraStato.attiva) >= 0);
      else on = !altroAperto && (pagina === 'studio' ? id === 'studio' : (pagina === 'agenda' && barraStato.attiva === id));
      if (on) { b.classList.add('attiva'); b.setAttribute('aria-current', 'page'); } else { b.classList.remove('attiva'); b.removeAttribute('aria-current'); }
      var n = riga ? (id === 'promemoria' ? conteggio('promemoria') : 0) : conteggio(id);
      var c = b.querySelector('.as-conta, .as-riga-conta');
      if (c) { c.hidden = !n; c.textContent = n ? (n > 99 ? '99+' : String(n)) : ''; }
      b.setAttribute('aria-label', NOMI[id] + (n ? (id === 'attesa' ? ', ' + n + ' in lista' : ', ' + n + ' da vedere') : ''));
      if (id === 'altro' && !riga) b.setAttribute('aria-expanded', altroAperto ? 'true' : 'false');
    }
  }
  /* fascia sotto la barra di stato, del colore di cio' che c'e' in cima (testata bianca del cruscotto, fondo dell'agenda) */
  function cielo() {
    if (pagina === 'home' || document.querySelector('.as-cielo')) return;
    var c = document.createElement('div');
    c.className = 'as-cielo';
    c.setAttribute('aria-hidden', 'true');
    c.style.background = pagina === 'agenda' ? '#f6f4ef' : '#fff';
    document.body.appendChild(c);
  }
  function barra() {
    cielo();
    if (navBarra || document.querySelector('.as-barra')) return;
    if (pagina !== 'agenda' && !(pagina === 'studio' && ruolo() === 'dottoressa')) return;
    navBarra = document.createElement('nav');
    navBarra.className = 'as-barra';
    navBarra.setAttribute('aria-label', 'Sezioni dell’app');
    var voci = document.createElement('div');
    voci.className = 'as-voci';
    vociBarra().forEach(function (id) { voci.appendChild(creaVoce(id)); });
    navBarra.appendChild(voci);
    document.body.appendChild(navBarra);
    document.body.classList.add('as-con-barra', 'as-' + pagina);
    aggiornaBarra();
    controllaTastiera();
  }
  if (pagina === 'agenda') {
    // una notifica o l'agenda stessa cambiano la scheda nell'indirizzo: la barra segue
    window.addEventListener('hashchange', function () {
      var s = schedaDaIndirizzo();
      if (altroAperto) mostraAltro(false);
      if (s && s !== barraStato.attiva) { barraStato.attiva = s; aggiornaBarra(); }
    });
  }

  /* ---- tastiera ----
     Android: si riconosce dall'altezza visibile che cala mentre si scrive in un campo (un campo puo' restare
     attivo a tastiera chiusa, e la barra allora deve restare).
     iPhone: con un campo attivo sopra la pagina c'e' sempre qualcosa (la tastiera, o soltanto la fila ^ v ✓
     dei campi con una tastiera esterna e nel simulatore, che non abbassa abbastanza l'altezza): la barra si
     toglie finche' il campo e' attivo, e torna con ✓ o toccando fuori. */
  var altezzaMax = 0;
  function campoDiTesto(el) {
    if (!el || !el.tagName) return false;
    var t = el.tagName.toLowerCase();
    if (t === 'textarea' || t === 'select' || el.isContentEditable) return true;
    return t === 'input' && !/^(checkbox|radio|button|submit|reset|range|color|file|image|hidden)$/i.test(el.type || '');
  }
  function controllaTastiera() {
    if (!document.body) return;
    var vv = window.visualViewport, h = vv ? vv.height : window.innerHeight;
    if (h > altezzaMax) altezzaMax = h;
    var el = document.activeElement, scelta = !!(el && el.tagName && el.tagName.toLowerCase() === 'select');
    // iPhone: un elenco a scelta puo' restare attivo anche a ruota chiusa: per lui vale l'altezza, come su Android
    var su = campoDiTesto(el) && ((piattaforma === 'ios' && !scelta) || h < altezzaMax - 120);
    if (su) document.body.classList.add('as-tastiera'); else document.body.classList.remove('as-tastiera');
  }
  try {
    (window.visualViewport || window).addEventListener('resize', controllaTastiera);
    window.addEventListener('orientationchange', function () { altezzaMax = 0; setTimeout(controllaTastiera, 400); });
    // iPhone: subito al tocco (la fila dei campi compare insieme), Android: quando la tastiera ha finito di salire
    document.addEventListener('focusin', function () { if (piattaforma === 'ios') controllaTastiera(); setTimeout(controllaTastiera, 300); });
    document.addEventListener('focusout', function () { setTimeout(controllaTastiera, 120); });
  } catch (_) {}

  /* ---- notifiche: la registrazione si rinnova in sottofondo, a pagina gia' aperta ----
     Il token di Firebase puo' cambiare: a ogni avvio l'accesso (accesso.js) lascia qui cosa serve (indirizzo
     dell'API, versione, sessione dell'agenda appena controllata) e la parte aperta lo manda al server, senza far
     aspettare nessuno. Senza rete resta da fare: si riprova alla prossima pagina. */
  var CHIAVE_RINNOVO = 'app-studio-push-rinnova';
  function rinnovoInCorso() { try { return !!sessionStorage.getItem(CHIAVE_RINNOVO); } catch (_) { return false; } }
  /* Android: il canale «promemoria» delle notifiche (lo stesso di accesso.js e del server, promemoria/src/fcm.js),
     da creare prima della registrazione: senza, Android le mostra come «Varie», senza avviso in alto. Rifarlo non cambia nulla. */
  var CANALE = { id: 'promemoria', name: 'Avvisi dello studio', description: 'Richieste di appuntamento, lista d’attesa e messaggi dei pazienti',
    importance: 5, visibility: 1, vibration: true };
  function rinnovaNotifiche() {
    var d = null;
    try { d = JSON.parse(sessionStorage.getItem(CHIAVE_RINNOVO) || 'null'); } catch (_) {}
    var P = plugin('PushNotifications');
    if (!d || !d.api || !d.token || !P || !P.register || !P.addListener) return;
    var finito = false;
    var chiudi = function () { finito = true; try { sessionStorage.removeItem(CHIAVE_RINNOVO); } catch (_) {} };
    if (leggi('app-studio-notifiche-spente')) { chiudi(); return; }       // spente a mano: restano spente
    try {
      P.addListener('registration', function (r) {
        if (finito || !r || !r.value) return;
        fetch(d.api + '/api/staff/dispositivo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + d.token },
          body: JSON.stringify({ token: r.value, piattaforma: piattaforma, versione: d.versione || '' })
        }).then(function (x) {
          if (x.ok) { scrivi('app-studio-push-token', r.value); chiudi(); pulisciNotifiche(); }   // .69: su iPhone ora si puo'
          else if (x.status === 401 || x.status === 403) chiudi();     // accesso non piu' valido: lo dira' il prossimo avvio
        }).catch(function () {});
      });
      // errore di Firebase (non di rete): si riprova al prossimo avvio dell'app, come prima
      P.addListener('registrationError', function () { chiudi(); });
      var canale = piattaforma === 'android' && P.createChannel ? Promise.resolve(P.createChannel(CANALE)).catch(function () {}) : Promise.resolve();
      canale.then(function () { return P.register(); }).catch(function () {});
    } catch (_) {}
  }
  if (pagina !== 'home') setTimeout(rinnovaNotifiche, 1200);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', barra); else barra();
})();
