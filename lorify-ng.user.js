// ==UserScript==
// @name        lorify-ng
// @description Юзерскрипт для сайта linux.org.ru поддерживающий загрузку комментариев через технологию WebSocket, а так же уведомления об ответах через системные оповещения и многое другое.
// @namespace   https://github.com/OpenA
// @include     https://www.linux.org.ru/*
// @include     http://www.linux.org.ru/*
// @version     3.3.9
// @grant       none
// @homepageURL https://github.com/OpenA/lorify-ng
// @updateURL   https://github.com/OpenA/lorify-ng/blob/master/lorify-ng.user.js?raw=true
// @icon        https://github.com/OpenA/lorify-ng/blob/master/icons/loriko.svg?raw=true
// @run-at      document-start
// ==/UserScript==

const USER_SETTINGS = {
	'Realtime Loader'      : true,
	'CSS3 Animation'       : true,
	'Delay Open Preview'   : 50,
	'Delay Close Preview'  : 800,
	'Desktop Notification' : true,
	'Preloaded Pages Count': 1,
	'Picture Viewer'       : 2,
	'Scroll Top View'      : true,
	'Upload Post Delay'    : 3,
	'Code Block Short Size': 15,
	'Code Highlight Style' : 0
}

let ContentNode, Navigation, CommentForm, gRefList;
let LORCODE_MODE = 0, Drops = 1, ThrMap = {};

const LOR           = parseLORUrl(location.href);
const TOUCH_DEVICE  = 'ontouchstart' in window;
const RESIZE_FUNCT  = 'onorientationchange' in window ? 'orientationchange' : 'resize';

const Timer = {
	// clear timer by name
	delete: function(...names) {
		for (const name of names) {
			clearTimeout(this[name]);
			delete this[name];
		}
	},
	// set/replace timer by name
	set: function(name, func, t = 50) {
		if (name in this)
			clearTimeout(this[name]);
		this[name] = setTimeout(func, USER_SETTINGS['Delay '+ name] || t);
	}
}

const lory_css = document.getElementById('loryCSS') || _setup('style', { id: 'loryCSS' });
const code_css = document.getElementById('codeCSS') || _setup('style', { id: 'codeCSS' });
const lory_js  = document.getElementById('loryJS') || _setup('script', { id: 'loryJS'  });

const Dynamic_Style = (() => {

	const shrink_h = document.createTextNode('15');
	const _lc_     = document.createTextNode('');
	const cs_type  = document.createTextNode('');
	const reacts_s = document.createTextNode('');

	const cut = `
	.cutted > .shrink-line:before,*:not(.cutted) > .shrink-line:after { color: #689b19; }
	.cutted > .shrink-line:after,*:not(.cutted) > .shrink-line:before { font: bold 12px monospace; }
	.cutted > *:not(.shrink-line) {
				   display: none;  }
	.cutted      { display: table; }
	.shrink-line { display: inline;
		border-radius: 0 0 5px;
		background: rgba(0,0,0,.2);
		padding: 5px 8px;
	}
	.shrink-line:before           { content: '<<<\x20\x20';  }
	.shrink-line:after            { content: 'убрать код';   }
	.cutted > .shrink-line:after  { content: '\x20\x20>>>';  }
	.cutted > .shrink-line:before { content: 'показать код'; }`;

	const short = `
	.shrink-line {
		position: absolute;
		bottom: 0; right: 0;
		padding: 5px 15px;
		border-radius: 15px 0 0 0;
		background: rgba(0,0,0,.5);
		text-align: center;
		color: white;
		cursor: pointer;
		opacity: .5;
	}
	.shrink-line:hover            { opacity: 1; }
	.shrink-line:before           { content: 'Свернуть';   }
	.cutted > .shrink-line:before { content: 'Развернуть'; }
	.cutted,`;

	const reacts_list = [
		'.reactions, .reactions-form, .reactions-li { display: none !important; }',
		'',
	];

	reacts_s.textContent = reacts_list[1];
	code_css.append(cs_type,
		'.shrinked { max-height:', shrink_h, 'px!important; overflow-y: hidden!important; }\n'+
		'.lc .emphasis { font-style: italic!important; } .lc .strong { font-weight: 700!important; } .lc .link { text-decoration: underline!important; }\n',
	_lc_, reacts_s);

	return {
		set main_counter (n) {
			let m_counter = document.getElementById('main_events_count');
			if (m_counter)
				m_counter.textContent = n ? `(${n})`: '';
			else if ((m_counter = document.getElementById('counter_block'))) {
				const txt = m_counter.firstChild.textContent.replace(/\d+/, n);
				m_counter.firstChild.textContent = txt;
				m_counter.hidden = !n;
			}
		},
		set 'Code Block Short Size' (v) {
			shrink_h.textContent = v.toString();
			cs_type.textContent = v > 35 ? short : cut;
			correctBlockCode(v, document);
		},
		set 'Code Highlight Style' (v) {
			_lc_.textContent = getHLJSStyle(v).css
				.replace(/(;|})/g, '!important$1')
				.replace(/(\.lc code)/, '.lc.cutted > .shrink-line:after,.lc:not(.cutted) > .shrink-line:before,$1')
				.replace(/(\.lc \.string)/, '.lc.cutted > .shrink-line:before,.lc:not(.cutted) > .shrink-line:after,$1');
		},
		set 'Reactions Style' (v) {
			reacts_s.textContent = reacts_list[v];
		}
	}
})();

const App = typeof chrome !== 'undefined'&& chrome.runtime && chrome.runtime.id ? WebExt() : UserScript();

lory_js.textContent = `

	const $ = _c => {_c()}, _Void = () => void 0;

	var initNextPrevKeys,  initStarPopovers,  fixTimezone;
	    initNextPrevKeys = initStarPopovers = fixTimezone = _Void;

	var tag_memories_form_setup,  topic_memories_form_setup;
	    tag_memories_form_setup = topic_memories_form_setup = (a,b,c,d) => {
			window.dispatchEvent(
				new CustomEvent('setMemories', { bubbles: true, detail: [a,b,c,d] }) );
		};

	const $script = function(src, name = '_') {
		const { _resol, _loads } = $script;
		const ok = resolve => {
			const hd = document.getElementsByTagName('head')[0] || document.documentElement;
			const js = document.createElement('script');
			js.type = 'text/javascript', js.async = true, js.src = src;
			js.onload = () => resolve(true); js.onerror = () => resolve(false);
			hd.append(js);
		}
		if (!(name in _loads)) {
			_loads[name] = new Promise(ok);
		} else if (_resol[name]) {
			ok(_resol[name]);
			delete _resol[name];
		}
	};
	const is_user  = ${/^\/people\/[\w_-]+\/(?:profile)$/.test(location.pathname)};
	$script._resol = Object.create(null);
	$script._loads = { lorjs: !is_user, hljs: false, realtime: false, plugins: is_user, jquery: is_user, jqueryui: false, _: false };
	$script.ready  = (names, call) => {
		const { _resol, _loads } = $script;
		const ok = n => (
			n in _loads ? _loads[n] : (_loads[n] = new Promise(r => {_resol[n] = r}))
		);
		Promise.all(Array.isArray(names) ? names.map(ok) : [ok(names)]).then(res => {
			if (!res.includes(false))
				call();
		});
	}
	const moment = (date) => ({
		format: (m = '') => Intl.DateTimeFormat('ru', (
			m.charAt(0) === 'M' ? { month: 'long' } : { weekday: 'short', day: 'numeric', month: '2-digit', year: 'numeric' }
		)).format(date)
	}); moment.locale = _Void;
`;

lory_css.textContent = `
	.newadded  { border: 1px solid #006880; }
	.msg-error { color: red; font-weight: bold; }
	.broken    { color: inherit !important; cursor: default; }
	.select-break::selection { background: rgba(99,99,99,.3); }
	.ref-map, .ref-map > a { padding: 0 3px !important; }
	.page-number, .icode { position: relative; margin-right: 5px; }
	.page-number[cnt-new]:not(.broken):after {
		content: attr(cnt-new);
		position: absolute;
		font-size: 12px;
		top: -6px;
		color: white;
		background: #3d96ab;
		line-height: 12px;
		padding: 3px;
		border-radius: 5px;
		z-index: 1;
	}
	.deleted > .title:before {
		content: "Сообщение удалено";
		font-weight: bold;
		display: block;
	}
	.page-loader {
		border: 5px solid #f3f3f3;
		-webkit-animation: spin 1s linear infinite;
		animation: spin 1s linear infinite;
		border-top: 5px solid #555;
		border-radius: 50%;
		width: 50px;
		height: 50px;
	}
	#comments > .page-loader {
		margin: 500px auto;
	}
	.slide-left  { animation-name: slideLeft; }
	.slide-right { animation-name: slideRight; }
	.slide-left, .slide-right {
		animation-duration: .4s;
		position: relative;
	}
	.preview {
		animation-duration: .3s;
		position: absolute;
		z-index: 300;
	}
	#realtime.ws-warn  { background-color: rgb(202, 114, 71); }
	#realtime.ws-error { background-color: rgb(160, 52, 52); }

	.ws-warn:before  { content: 'Соединение разорвано.\\A'; }
	.ws-error:before { content: 'Соединение аварийно прервано.\\A'; }

	.ws-warn  > *:first-child, .hidaft > *,
	.ws-error > *:first-child, .hidaft ~ *,
	.mobile-show {
		display: none;
	}
	.show-in {
		animation: showIn .3s ease-in;
	}
	.swipe-up {
		top: -100%;
		animation: swipeUp .5s ease-in-out;
	}
	.swipe-down {
		top: 100%;
		animation: swipeDown .5s ease-in-out;
	}
	.slide-down {
		overflow-y: hidden;
		animation: slideUp 1.5s linear reverse;
	}
	.slide-up {
		max-height: 0;
		overflow-y: hidden;
		animation: slideUp 1s ease-out;
	}
	#markup-panel > .btn {
		font-size: smaller!important;
		padding: 3px 10px!important;
		font-variant: small-caps;
		margin: 0 5px 5px 0;
		border: 0!important;
	}
	.lorcode > .btn:before {
		content: attr(lorcode);
	}
	.preview .reaction-show-list, .preview .reaction-show,
	.preview .zero-reactions-show, .preview .reactions-li,
	.markdown > .btn:not([markdown]), *[hidden], .hidden {
		display: none!important;
	}
	#yandex_rtb * {
		z-index: 0!important;
	}
	.markdown > .btn:before {
		content: attr(markdown);
	}
	.markdown > .btn[lorcode=pre]:before { content: "•\xA0"; }
	.process {
		color: transparent!important;
		position: relative;
		max-width: 80px;
	}
	.process:after {
		content: "....";
		margin: 6px 20px;
		top: 0;
		display: block;
		position: absolute;
		color: white!important;
		overflow: hidden;
		animation: process 3s linear infinite;
		-webkit-animation: process 3s linear infinite;
	}
	.scroll-nav {
		position: fixed;
		background-color: rgba(0,0,0,.5);
		border-radius: 7px;
		right: 15px;
		bottom: 15px;
		overflow: hidden;
		opacity: .5;
	}
	.scroll-nav:hover {
		opacity: .8;
	}
	.scroll-up:before   { transform: rotate(90deg); }
	.scroll-down:before { transform: rotate(-90deg); }
	.scroll-btn {
		cursor: pointer;
		padding: 6px;
	}
	.scroll-btn:before {
		font-size: 22px;
		font-weight: bold;
		display: block;
	}
	.link-self:before, .scroll-btn:before {
		content: 'R';
		font-family: fontello;
	}
	.scroll-btn:hover {
		background-color: black;
		filter: invert(100%);
	}
	.reply-thread {
		left: 0; right: 0;
		top: 0; bottom: 0;
		overflow: scroll;
		position: fixed;
		background-color: rgba(77,77,77,.7);
		overscroll-behavior: contain;
		z-index: 1;
	}
	.reply-thread > .messages {
		border: 0 solid rgba(0,0,0,.3);
		border-width: 0 2px 3px 0;
		max-width: 800px;
		position: relative;
	}
	.reply-thread > * {
		margin: 40px auto;
	}
	.fake-flee + * {
		position: absolute;
		left: 0; right: 0;
		max-height: 400px;
		overflow-y: auto;
	}
	.reply-thread > .messages > .msg {
		margin-bottom: 1px;
		border-radius: 0;
	}
	.link-self, .link-thread, .reactions-li a {
		text-decoration: none;
	}
	.reaction:not(.reactions-list) {
		margin: 0 4px 0 0 !important;
		cursor: pointer;
	}
	.reactions-list {
		position: absolute;
		bottom: 100%;
	}
	.reactions-form {
		position: relative;
	}
	.reactions-li a:before {
		content: '😶';
		font-size: smaller;
	}
	.preview .reaction {
		border-size: 0;
		font-size: smaller;
		padding: 0 4px;
	}
	.preview .reactions {
		margin: 4px 0 0 0;
	}
	.highlight { outline: 2px dashed red; }
	.ref-map:before      { content: ':\\A' }
	.ref-map:empty:after { content: '...' }
	.central-pic-overlay {
		left: 0;
		top: 0;
		right: 0;
		bottom: 0;
		background-color: rgba(17,17,17,.9);
		position: fixed;
		z-index: 99999;
	}
	.central-pic-overlay * {
		position: absolute;
	}
	.central-pic-rotate {
		left: 8px;
		bottom: 8px;
		width: 32px;
		cursor: pointer;
		user-select: none;
	}
	.svg-circle-arrow {
		fill: rgba(99,99,99,.5);
	}
	.central-pic-rotate:hover .svg-circle-arrow {
		fill: #777;
	}
	.tag-list {
		max-height: 120px;
		overflow-y: auto;
		position: absolute;
	}
	.tag-list > .tag {
		display: list-item;
		padding: 4px 1em;
		list-style: none;
	}
	.title > .lory-time, .sign > .lory-time {
		font-size: smaller;
	}
	.title > .lory-time {
		background-color: #0000001c;
		border: 1px dashed #0004;
		border-radius: 2px;
		padding: 0 1px;
		opacity: .7;
	}
	.sign > .lory-time:after {
		content: attr(data-format);
	}
	#reset_form { display: inline; }
	#reset_form button { border: none!important; margin-left: 10px; }
	@media screen and (max-width: 960px) {
		#bd { padding: 0 !important; }
		#bd > article[id^="topic"] { margin-left: 5px !important; margin-right: 5px !important; }
		.message-w-userpic { padding: 0 !important; }
		.message-w-userpic > * { margin-left: 115px !important; }
		.message-w-userpic > .form-container { margin-left: 0 !important; clear: both; }
	}
	@media screen and (max-width: 640px) {
		#markup-panel > .btn { padding: 3px!important; width: 30px; }
		#markup-panel > .btn:before { display: block; overflow: hidden; }
		.msg .reply { clear: both !important; }
		.messages .msg { padding: 2px 10px 7px 14px !important; }
		.message-w-userpic > * { margin-left: 0 !important; }
		.message-w-userpic > *:first-child:not(p) { margin-left: 60px !important; }
		.msg_body ul, .msg_body ol { margin: 0 0 1em !important; }
		.userpic { margin-right: 14px !important; }
		.photo[src="/img/p.gif"] { display: none !important; }
	}
	@media screen and (max-width: 460px) {
		.mobile-show { display: inherit; }
		.mobile-hide { display: none;    }
		.sign time   { font-size: 12px;  }
	}
	@-webkit-keyframes process { 0% { width: 0; } 100% { width: 20px; } }
	@keyframes process { 0% { width: 0; } 100% { width: 20px; } }

	@-webkit-keyframes swipeDown { from { top: 0; } to { top: 100%; } }
	@keyframes swipeDown { from { top: 0; } to { top: 100%; } }

	@-webkit-keyframes slideUp { from { max-height: 2000px; } to { max-height: 0; } }
	@keyframes slideUp { from { max-height: 2000px; } to { max-height: 0; } }

	@-webkit-keyframes showIn { from { opacity: 0; } to { opacity: 1; } }
	@keyframes showIn { from { opacity: 0; } to { opacity: 1; } }

	@-webkit-keyframes swipeUp { from { top: 0; } to { top: -100%; } }
	@keyframes swipeUp { from { top: 0; } to { top: -100%; } }

	@-webkit-keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
	@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

	@-webkit-keyframes slideRight { 0% { right: 100%; opacity: 0; } 100% { right: 0%; opacity: 1; } }
	@keyframes slideRight { 0% { right: 100%; opacity: 0; } 100% { right: 0%; opacity: 1; } }

	@-webkit-keyframes slideLeft { 0% { left: 100%; opacity: 0; } 100% { left: 0%; opacity: 1; } }
	@keyframes slideLeft { 0% { left: 100%; opacity: 0; } 100% { left: 0%; opacity: 1; } }
`;
document.documentElement.append(
	lory_js, lory_css, code_css
);

class TopicNavigation {

	constructor() {

		this.pages_count = 0;

		window.addEventListener('popstate', e => {
			const { page, cid } = parseLORUrl(location.href);
			const _jmpTo = () => {
				if (cid)
					document.getElementById(`comment-${LOR.cid = cid}`).scrollIntoView({ block: 'start', behavior: 'smooth' });
				else if (e.state && e.state.lorYoffset)
					window.scrollTo(0, e.state.lorYoffset);
			};
			if (LOR.page !== page) {
				this.gotoPage(page).then(_jmpTo);
			} else
				_jmpTo();
		});

		let nav_t = document.createElement('div');
		    nav_t.append(
				_setup('a', { class: 'page-number prev', href: 'javascript:void(0)', text: '←' }),
				_setup('a', { class: 'page-number next', href: 'javascript:void(0)', text: '→' })
			);
		let nav_b = nav_t.cloneNode(true);

		Object.defineProperties(this, {
			nav_t: { value: _setup(nav_t, { class: 'nav', id: 'nav_t' }), enumerable: true },
			nav_b: { value: _setup(nav_b, { class: 'nav', id: 'nav_b' }), enumerable: true },
			pload: { value: _setup('div', { class: 'page-loader' }), enumerable: false },
			queue: { value: Object.create(null), enumerable: false }
		});
	}

	preloadPage(uri = '', pass = 0x00) {

		let { path, page } = LOR;

		const url = location.origin + path + uri,
		     quid = uri || '/page0',
		   opaque = quid.startsWith('?cid=') && Object.keys(this.queue).length !== 0,
		   promis = this.queue[quid];

		const rq_params = {
			credentials: 'same-origin',
			cache: 'no-cache'
		};
		const onFinally = res => {

			const ok  = res.ok ? res.text().then(getPageContent) : Promise.reject(res.status +' '+ res.statusText);
			const num = parseLORUrl(res.url).page;

			const doRef = Boolean(pass & 0x1), doUpd = Boolean(pass & 0x2),
			      isNew = Boolean(pass & 0x4), reNav = Boolean(pass & 0x8);

			const doDe = () => {
				/* rm queue by prev id and by page num */
				delete this.queue[quid];
				delete this.queue['/page'+ num];
			}
			const doFin = ({ pg_comms, msg_list, nav_count, top_msg, t_info, events }) => {
				let pcont = document.getElementById('pcont_'+ num);
				if (pcont) {
					msg_list = mergeComments(pcont, msg_list, isNew);
				} else {
					const comms = document.getElementById('comments');
					pcont = _setup(pg_comms, {
						id: 'pcont_'+ num, class: 'page-content hidden', style: undefined
					});
					comms.append(pcont);
				}
				const ref = workComments(msg_list); doDe();
				ref.page_num = num,
				ref.pcont = pcont;
				if (doUpd) {
					if (events !== -1)
						App.setNotes(events);
					updTopicContent(top_msg, t_info);
				}
				if (isNew)
					this.setNavBoubble(num, msg_list.length);
				if (reNav && nav_count !== this.pages_count)
					this.resetNav(nav_count);
				if (doRef)
					genRefMap(ref.ref_list);
				return ref;
			}
			return ok.catch(doDe), ok.then(doFin);
		}
		const onTry = res => {

			let pageN = '/page'+ parseLORUrl(res.url).page,
			   promis = this.queue[pageN];

			if (promis) {
				return promis;
			} else if (res.ok) {
				return (this.queue[pageN] = fetch(res.url, rq_params).then(onFinally));
			} else {
				delete this.queue[quid];
				return Promise.reject(res.status +' '+ res.statusText);
			}
		}
		return promis || ( this.queue[quid] = fetch(
				url, (opaque ? Object.assign({ method: 'HEAD' }, rq_params) : rq_params)
			).then( (opaque ? onTry : onFinally) )
		);
	}

	gotoPage(num) {
		const { nav_t, nav_b } = this;
		const { page } = LOR;

		const tmpid = (page << 8) | num,
		     reAnim = (LOR.page = num) > page;

		for (var i = 0; i < nav_b.children.length; i++) {
			nav_t.children[i].classList.remove('broken');
			nav_b.children[i].classList.remove('broken');
		}
		if (num <= 0) {
			// set prev button to inactive
			nav_t.firstElementChild.classList.add('broken');
			nav_b.firstElementChild.classList.add('broken');
		} else
		if (num >= i - 3) {
			// set next button to inactive
			nav_t.lastElementChild.classList.add('broken');
			nav_b.lastElementChild.classList.add('broken');
		}
		nav_t.children[`navt_${ num }`].classList.add('broken');
		nav_b.children[`navb_${ num }`].classList.add('broken');

		if (USER_SETTINGS['Scroll Top View']) {
			nav_t.parentNode.scrollIntoView({ block: 'start' });
		}
		const pcont = document.getElementById('pcont_'+ page);
		this.__swpid = tmpid, pcont.classList.add('hidden');
		return new Promise(resolve => {
			if (this.swapContent( num, reAnim, resolve )) {
				this.preloadPage('/page'+ num, 0x3).then(() => {
					if (this.__swpid === tmpid) {
						this.__swpid = 0;
						this.swapContent( num, reAnim, resolve );
					}
				});
			} else if (this.__swpid === tmpid)
				this.__swpid = 0;
		});
	}

	resetNav(nav_count = 1) {

		let   { page, path } = LOR;
		const { nav_t, nav_b, pages_count } = this, pidx = nav_count - 1,
		prevT = nav_t.firstElementChild, nextT = nav_t.lastElementChild,
		prevB = nav_b.firstElementChild, nextB = nav_b.lastElementChild;

		if (nav_count < pages_count) {
			for (let i = nav_count; i < pages_count; i++) {
				nav_t.children[`navt_${ i }`].remove();
				nav_b.children[`navb_${ i }`].remove();
			}
			if (page > pidx)
				page = pidx;
		} else if (pages_count < nav_count) {
			for (let i = pages_count; i < nav_count; i++) {
				nextT.before(_setup('a', { id: `navt_${ i }`, class: 'page-number', href: `${ path }/page${ i }#comments`, text: `${ i + 1 }` }));
				nextB.before(_setup('a', { id: `navb_${ i }`, class: 'page-number', href: `${ path }/page${ i }#comments`, text: `${ i + 1 }` }));
			}
		}
		nav_b.hidden = nav_t.hidden = 1 >= (
			this.pages_count = nav_count
		);
		if (page === 0) {
			prevT.classList.add('broken');
			prevB.classList.add('broken');
		} else
		if (page === pidx) {
			nextT.classList.add('broken');
			nextB.classList.add('broken');
		}
		nav_t.children[`navt_${ page }`].classList.add('broken');
		nav_b.children[`navb_${ page }`].classList.add('broken');
		return page;
	}

	goToCommentPage(cid = '', alt = `topic-${LOR.topic}`, clearid = false) {

		const { path, lastmod, page: prev, cid: pid = '' } = LOR;
		const id = cid ? `comment-${LOR.cid = cid}` : alt,
		    comm = document.getElementById(id),
		newState = cid !== pid;

		const state = history.state || {};
		state.lorYoffset = window.pageYOffset;
		history.replaceState(state, null, lorifyUrl(path, prev, lastmod, clearid ? '' : pid));

		return new Promise(resolve => {
			const _jmpMsg = (msg, page) => {
				msg.scrollIntoView({ block: 'start', behavior: 'smooth' });
				if (newState) {
					const href = lorifyUrl(path, page, lastmod, cid);
					history.pushState({ lorYoffset: 0, prev, pid }, null, href);
				}
				resolve(msg);
			}
			if (comm) {
				let num = cid ? Number(comm.parentNode.id.substr('pcont_'.length)) : prev;
				if (num === prev)
					_jmpMsg(comm, prev);
				else
					this.gotoPage(num).then(() => _jmpMsg(comm, num));
			} else if (cid) {
				this.swapContent();
				this.preloadPage('?cid='+ cid, 0x3).then(({ pcont, page_num }) => {
					this.gotoPage(page_num).then(() => _jmpMsg(pcont.children[id], page_num));
				});
			}
		});
	}

	handleEvent(e) {

		const el  = e.target,
		   aClass = el.classList,
		   aPath  = el.pathname,
		  aSearch = el.search;
		let alter = true,
		   parent = el.parentNode;

		switch (aClass[0]) {
		case 'page-number':
			if (!aClass.contains('broken')) {
				let { path, page, lastmod } = LOR,  prev = page;
				const state = history.state || {};
				switch (aClass[1]) {
					case 'prev': page--; break;
					case 'next': page++; break;
					default    : page = Number(el.id.substring(5));
				}
				if (state.prev === page && !state.pid) {
					history.back();
				} else {
					this.gotoPage(page);
					history.pushState({ lorYoffset: 0, prev }, null, lorifyUrl(path, page, lastmod));
				}
			}
			break;
		case 'scroll-btn':
			if ((alter = aClass[1] === 'scroll-down')) {
				let rt = document.getElementById('related-topics');
				parent = rt ? rt.previousElementSibling : parent.parentNode;
			} else
				parent = document.body;
			parent.scrollIntoView({ block: alter ? 'end' : 'start', behavior: 'smooth' });
			break;
		case 'shrink-line':
			parent.classList.toggle('cutted');
			if (parent.scrollHeight > window.innerHeight)
				parent.scrollIntoView();
			break;
		case 'link-rthub':
			if (parent.classList.contains('ws-warn') && USER_SETTINGS['Realtime Loader']) {
				parent.style.display = 'none';
				RealtimeHub.restart();
			} else
				location.href = aPath + aSearch;
			break;
		case 'link-navs':
			if (aPath !== LOR.path) {
				if (App.openUrl(aPath + aSearch)) {
					return;
				} else
					break;
			}
		case 'link-self':
		case 'link-pref':
			var cid = aSearch.substring('?cid='.length);
			Timer.delete('Close Preview', 'Open Preview', cid);
			Drops = 1, clearPreviews();
			this.goToCommentPage(cid);
			break;
		case 'link-thread':
			var [ tid, cid ] = parseReplyUrl(aPath + el.hash, 1);
			showReplyThread(aPath, tid, cid);
			break;
		case 'link-quote': alter = false;
		case 'link-reply': parent = parent.parentNode.parentNode.parentNode;
			var [ tid, cid ] = parseReplyUrl(aSearch);
			if (parent.classList.contains('no-reply')) {
				this.goToCommentPage(cid).then(target => {
					toggleForm(target.lastElementChild.lastElementChild, tid, cid, !alter);
				});
			} else
				toggleForm(parent, tid, cid, !alter);
			break;
		case 'medium-image': alter = false;
		case   'link-image':
			if (USER_SETTINGS['Picture Viewer'] > alter) {
				CentralPicture.expose(alter ? el.href : el.srcset);
				break;
			}
		default:
			return;
		}
		e.stopPropagation(), e.preventDefault();
	}

	swapContent(num, reAnim = false, resolve = () => void 0) {

		const aName = 'slide-'+ (reAnim ? 'left': 'right');
		const pcont = document.getElementById('pcont_'+ num);
		if ( !pcont ) {
			this.nav_t.after(this.pload);
			return true;
		}
		this.pload.remove();
		pcont.classList.remove('hidden');

		if (USER_SETTINGS['CSS3 Animation']) {
			const termHandler = () => {
				pcont.removeEventListener('animationend', termHandler, true);
				pcont.classList.remove(aName);
				resolve(pcont);
			}
			pcont.addEventListener('animationend', termHandler, true);
			pcont.classList.add(aName);
		} else {
			resolve(pcont);
		}
		correctBlockCode(USER_SETTINGS['Code Block Short Size'], pcont);
		return false;
	}

	setNavBoubble(num, cn) {
		const top = this.nav_t.children[`navt_${num}`],
		      bot = this.nav_b.children[`navb_${num}`];
		if ( !bot )
			return;
		if (cn > 0) {
			cn += Number(bot.getAttribute('cnt-new') || 0),
			top.setAttribute('cnt-new', cn),
			bot.setAttribute('cnt-new', cn);
		} else {
			top.removeAttribute('cnt-new');
			bot.removeAttribute('cnt-new');
		}
	}
}

const Favicon = {
	
	original : '//www.linux.org.ru/favicon.ico',
	index    : 0,
	colors   : ['#48de3d', '#e47702', '#F00'], // ok, warn, error

	setTitle: (label) => {
		document.title = document.title.replace(/\s\(\d+\)|$/, ` (${label})`);
	},

	get canvas() {
		let canvas = document.createElement('canvas');
		canvas.width = canvas.height = 32;
		Object.defineProperty(this, 'canvas', { value: canvas });
		return canvas;
	},

	get icon() {
		let links = document.head.getElementsByTagName('link'),
		   length = links.length;
		
		for (var i = 0; i < length; i++) {
			if (links[i].rel && /\bicon\b/i.test(links[i].rel)) {
				this.original = links[i].href;
				Object.defineProperty(this, 'icon', { configurable: true, value: links[i] });
				return links[i];
			}
		}
	},
	
	draw: function(label = '', color = 0) {

		const { icon, canvas, original, colors } = this;

		if (!label) {
			icon.href = original;
			return;
		}
		let d = new Path2D('M5.4 22.3a15 15 0 0 0 3.8 7c-3.4 1.7 2.3 3.9 4.2 2a32 32 0 0 1 5.4-.1c1.5 1.6 7.2-1 3.7-2.4 1.8-1.8 3-3.8 3.4-6.4.9.3 5.5 2.3 6.1.8-1.5-2.5-4.6-4.8-5.8-7.5-1.1-3-.9-6.3-1.9-9.3C22.4 2 20.4 0 15.9 0S9.7 1.4 8 5.4c-1.1 3-1 6-1.7 8.8C4.4 14-1 7.7.2 12.8c.5 1.5 4.4 9.8 5.2 9.5');
		let x = 0, w = canvas.width , fntPos = w *.5,
		    y = 0, h = canvas.height, fontPx = 24;

		if (Number(label) > 9) {
			fontPx -= 2;
			if (Number(label) > 999) {
				label = '1k+';
			}
		}
		const ctx = canvas.getContext('2d');
		// clear canvas
		ctx.clearRect(x, y, w, h);

		// colored icon
		ctx.strokeStyle = 'rgba(0,0,0,.5)';
		ctx.fillStyle = colors[color];
		ctx.fill(d);

		// text label
		ctx.font = 'bold '+ fontPx +'px Arial';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle'; 
		ctx.fillStyle = 'white';

		ctx.strokeText(label, fntPos + 1, fntPos + 1);
		ctx.fillText(label, fntPos, fntPos);

		_setup(icon, { type: 'image/png', rel: 'icon', href: canvas.toDataURL() });
	}
}

const ContentFinder = {

	get CodeHiglight () {
		const hl_engine = new HighlightJS({
			classPrefix: '' /*, noHighlightRe: /(!^)/*/
		});
		Object.defineProperty(this, 'CodeHiglight', { value: hl_engine })
		return hl_engine;
	},

	get IMAGE_LINKS () {
		const img_links = ['jpg','jpeg','png','gif','svg','webp'].map(ext => `a[href*=".${ext}?"],a[href$=".${ext}"]`).join(',');
		Object.defineProperty(this, 'IMAGE_LINKS', { value: img_links })
		return img_links;
	},

	check: function(comment) {

		const { IMAGE_LINKS, CodeHiglight } = this;

		const MAX_H = USER_SETTINGS['Code Block Short Size'];

		for (const code of comment.querySelectorAll('pre > code')) {

			const highlight     = CodeHiglight.apply(code);
			const shrink_line   = _setup('div', { class: 'shrink-line' });
			const offset_height = code.offsetHeight;
			const parent_pre    = code.parentNode;

			let block = parent_pre.parentNode;
			if (block.classList[0] === 'msg_body') {
				block = block.insertBefore(_setup('div', { class: 'icode' }), parent_pre);
				block.append(parent_pre);
			} else
			if (block.classList[0] !== 'code')
				block = parent_pre;
			if (highlight)
				block.classList.add('lc');
			if (offset_height > 0 && MAX_H > 35 && MAX_H >= offset_height)
				shrink_line.classList.add('hidden');
			block.classList.add('cutted');
			block.prepend( shrink_line );
		}
		for (const a of comment.querySelectorAll('.msg_body > *:not(.reply):not(.sign) a[href*="?cid="], a[class^="event-unread"]')) {
			a.className = `link-navs${ a.className ? ' '+ a.className : ''}`;
		}
		for (const a of comment.querySelectorAll(IMAGE_LINKS)) {
			a.className = 'link-image';
		}
		for (const t of comment.querySelectorAll('time[data-format]:not(.lory-time)')) {
			this.localizeTime(t, t.getAttribute('data-format'));
		}
	},
	localizeTime: (el, fmt = '') => {
		const date = new Date(el.dateTime);
		let full_d = '', short_d = '', time_c = '', offs_t = '', simple = false;
		let format = {
			day: 'numeric', month: '2-digit', year: 'numeric',
			hour: '2-digit', minute: '2-digit', second: '2-digit'
		}, formaZ = {
			weekday: 'short', timeZoneName:'short'
		}, lang = 'it';

		switch(fmt) {
		case 'interval': simple = true;
		case 'compact-interval':
			const today = new Date,
			       diff = today - date;
			if (date >= today.setHours(0,0,0)) {
				let m = Math.floor(diff /  6e4) %  60,
					h = Math.floor(diff / 36e5) + (30 < m);
				time_c = h ? `${h}ч.` : `${m}мин.`;
				full_d = simple ? '' : '\nназад';
				break;
			} else
			if (date >= today.setDate(today.getDate() - 1)) {
				time_c = date.toLocaleString('ru', { hour: '2-digit', minute: '2-digit' });
				full_d = '\nвчера', short_d = '\n1дн';
				if (simple)
					time_c += short_d, full_d = short_d = '';
				break;
			} else {
				delete format.minute, delete format.hour, 
				delete format.second, lang = 'ru';
			}
		default:
			let [wday, gmt = ''] = date.toLocaleString('ru', formaZ).split(/,?\s+/),
			    [caln, tim = ''] = date.toLocaleString(lang, format).split(/,?\s+/);

			short_d = `\n${wday}:`+ caln.substr(0, caln.length - 4) + caln.substr(-2);
			 time_c = tim;
			if (simple) {
				time_c += short_d, short_d = '';
			} else {
				offs_t = '\n'+ gmt;
				full_d = `\n${wday.charAt(0).toUpperCase() + wday.substr(1) } ${caln}`;
			}
		}
		el.textContent = time_c;
		if (full_d)
			el.append( _setup('span', { class: 'mobile-hide', text: full_d }) );
		if (short_d)
			el.append( _setup('span', { class: 'mobile-show', text: short_d }) );
		el.setAttribute('data-format', offs_t);
		el.classList.add('lory-time');
	}
}

const onDOMReady = () => {

	const { path, page, lastmod, cid, topic } = LOR;

	const body = document.getElementById('bd') || document.body;
	const main = document.getElementById('main_events_count');
	const init = App.init();

	if (!(ContentNode = document.getElementById('lorify_cont'))) {
		body.appendChild(
			ContentNode = _setup('div', { id: 'lorify_cont' })
		).appendChild( // add scroll top button
			_setup('div', { class: 'scroll-nav' })
		).append(
			_setup('div', { class: 'scroll-btn scroll-up' }),
			_setup('div', { class: 'scroll-btn scroll-down' })
		);
	}

	if (main) {
		let notes = Number(main.textContent.match(/\d+/));
		if (notes)
			App.setNotes( notes );
	}
	for (const fav of body.querySelectorAll('.fav-buttons > a'))
		fav.href = 'javascript:void(0)';

	if ('regform' in document.forms) {
		const user = document.getElementById('loginGreating');
		user.addEventListener('click', (e) => {
			if (e.target.id.endsWith('loginbutton')) {
				const h = e.target.id.startsWith('hide');
				user.children[0].style.display = h ?  null : 'none';
				user.children[1].style.display = h ? 'none':  null ;
				e.preventDefault();
			}
		});
		handleRegForm(document.forms.regform);
	} else
		RealtimeHub.init();

	if ((CommentForm = document.forms.commentForm || document.forms.messageForm)) {

		handleCommentForm(CommentForm);

		let bd_rep = body.querySelector('h2 > a[name="rep"], #navPath');
		if (bd_rep) {
			bd_rep.append('\n(', _setup('a', {
				text : 'с цитатой',
				style: 'color: indianred!important;',
				href : 'javascript:void(0)'
			},{
				click: () => {
					const [ topid, repid ] = parseReplyUrl(location.search);
					convMsgBody(
						body.querySelector(`#topic-${ topid } .msg_body > div:not([class]), #comment-${ repid } .msg_body`)
					);
				}
			}), ')\n');
		}
	} else if ('reset_form' in document.forms) {
		handleResetForm(document.forms.reset_form);
	}

	const realtime = document.getElementById('realtime') || ContentNode.insertBefore(
	   _setup('div', { id: 'realtime', style: 'display: none;' }), ContentNode.firstElementChild
	);
	if(!realtime.childNodes.length) {
		realtime.append(
		   document.createElement('span'),
		  _setup('a', { text: 'Обновить.', class: 'link-rthub', href: path || location.pathname })
		);
	}

	if (topic) {

		const top = document.getElementById(`topic-${ topic }`);
		const ts = top.querySelector(`a[itemprop="creator"]`);

		if (ts) {
			LOR.TopicStarter = ts.innerText;
			lory_css.append(`\n
			a[itemprop="creator"][href="${ ts.pathname }"], .ts { color: indianred!important; }
			a[itemprop="creator"][href="${ ts.pathname }"]:after, .ts:after {
				content: "тс";
				font-size: 75%;
				color: dimgrey!important;
				display: inline-block;
				vertical-align: super;
			}`);
		}

		let shwdel = body.querySelector('input[name=deleted] + [type=submit]');
		if (shwdel) {
			shwdel.className = 'btn btn-default';
			/*shwdel.parentNode.onsubmit = e => {
				e.preventDefault();
				if (shwdel.className === 'btn btn-default') {
					shwdel.className =   'btn btn-primary';
					fetch(e.target.action, {
						method: 'POST', body: new FormData(e.target)
					}).then(res => {
						if (res.ok) {

						}
					});
				}
			}*/
		}
		handleReplyLinks( top, topic );
		ContentFinder.check( top );

	} else {

		body.addEventListener('click', TopicNavigation.prototype.handleEvent);
		ContentFinder.check( body );
		return;
	}

	const comments = document.getElementById('comments'),
	      msg_list = comments.querySelectorAll('.msg[id^="comment-"]'),
	      messages = comments.parentNode,
	      navPages = messages.querySelectorAll('#comments ~ .nav > .page-number'),
	      pg_count = navPages.length ? navPages.length - 2 : 1,
	      infotext = (realtime.nextElementSibling || realtime).textContent;

	const { nav_t, nav_b } = (Navigation = new TopicNavigation);
	const pcont = _setup('div', { id: 'pcont_'+ Navigation.resetNav(pg_count), class: 'page-content' });

	let lastPageIdx = pg_count - 1;
	if (lastPageIdx) {
		const old_b = navPages[0].parentNode,
		      old_t = comments.querySelector('.nav');
		old_t.parentNode.replaceChild(nav_t, old_t);
		old_b.parentNode.replaceChild(nav_b, old_b);
		nav_t.after(pcont);
	} else {
		if (msg_list.length)
			msg_list[0].before(nav_t, pcont);
		else
			comments.append(nav_t, pcont);
			realtime.after (nav_b);
	}
	messages.addEventListener('click', onReactionClick);
	body.addEventListener('click', Navigation);

	let promisList = [];
	if (msg_list.length) {
		promisList.push(new Promise(_r => _r( workComments(msg_list) )));
	}
	for (let next; (next = pcont.nextElementSibling);) {
		pcont.append(next);
	}

	if (/\/thread\/|.jsp/.test(location.pathname))
		return;
	if (!/Тема (?:удалена|перемещена в архив)/.test(infotext)) {
		if (page !== lastPageIdx) {
			const lastp = Navigation.preloadPage('/page'+ lastPageIdx);
			lastp.then(({ ref_map }) => {
				const last = Object.keys(ref_map).reduce(
					(a,b) => Number(a) > Number(b) ? a : b, 0);
				RealtimeHub.watch(topic, last);
			});
			promisList.push( lastp );
		} else {
			RealtimeHub.watch(topic,
				msg_list.length ? msg_list[msg_list.length - 1].id.substring('comment-'.length) : ''
			);
		}
	}

	init.then(() => {
		const PL_COUNT = USER_SETTINGS['Preloaded Pages Count'];
		let g = 1 + (page != lastPageIdx);

		for (let i = page + 1; g < PL_COUNT && i < lastPageIdx; i++, g++) {
			promisList.push(Navigation.preloadPage('/page'+ i));
		}
		for (let i = page - 1; g < PL_COUNT && i >= 0; i--, g++) {
			promisList.push(Navigation.preloadPage('/page'+ i));
		}
		Promise.all(promisList).then(refs => {
			const g_list = [], g_map = {};

			for (const { ref_list, ref_map } of refs) {
				g_list.push(...ref_list),
				Object.assign(g_map, ref_map);
			}
			gRefList = g_list.length ? addRefLinks(g_list, g_map) : g_list;
		});
	});
	window.addEventListener('dblclick', resetNavBoubbles);
};

window.addEventListener('keydown', e => {
	const { target, key, ctrlKey } = e;
	const c = ['ArrowLeft', 'ArrowRight'].indexOf(key);

	if (ctrlKey && c >= 0) {
		let a = (
		  document.body.querySelector(`a[rel="${['prev','next'][c]}"]`) ||
		  document.body.querySelector(`td[align="${['left','right'][c]}"] > a[href^="${location.pathname}"]`)
		);
		if (a)
			location.href = a.href;
	} else if (key === 'Escape') {
		resetNavBoubbles(true);
	}
});

const RealtimeHub = {
/* - - - 
  -2: onhold
  -1: oninit
   0: running
   1: stopped
   2: crushed
 - - - */
	state: -1, to_send: '',

	init() {
		const id = 'lorify_realtime_js';

		window.addEventListener('message', this);
		document.getElementById(id) || document.head.appendChild(
			_setup('script', { id, text: 'const startRealtimeWS = '+
				this.start.toString().replace('RealtimeHub.start', 'startRealtimeWS')  +'; startRealtimeWS();'
			})
		);
	},
	watch(topic_id = '', last_id = '') {

		const wsText = topic_id + (last_id ? ' '+ last_id : '');
		this.to_send = wsText;

		if (this.state === 0)
			window.postMessage({ wsRequest: 'send', wsText });
	},
	start: () => {

		let buffer = [], ct = -1, err = false;

		const wS = new WebSocket('wss://www.linux.org.ru:9000/ws');
		const _handler  = ({ origin, data }) => {
			if (origin !== location.origin || !data.wsRequest)
				return;
			switch(data.wsRequest) {
			case 'restart':
				if (wS.readyState === wS.CLOSED)
					window.removeEventListener('message', _handler);
				else
					wS.close(1000, 'restarting...');
				RealtimeHub.start();
				break;
			case 'stop':
				wS.close(1000, data.wsText);
				break;
			case 'send':
				wS.send(data.wsText);
				break;
			}
		}
		wS.onmessage = ({ data }) => {
			let evt = data.split(' ');
			if (evt[0] === 'comment') {
				clearTimeout(ct),
				buffer.push(evt[1]),
				ct = setTimeout(() => {
					window.postMessage({ wsEvent: 'new-comments', wsData: buffer }, location.origin);
					buffer = [];
				}, 1e3);
			} else {
				window.postMessage({ wsEvent: evt[0], wsData: evt[1] }, location.origin);
			}
		}
		wS.onopen = () => {
			console.info('Установлено соединение c '+ wS.url);
			window.addEventListener('message', _handler);
			window.postMessage({ wsEvent: 'stat-change', wsData: 0 }, location.origin);
		}
		wS.onclose = ({ code, reason }) => {
			let wsData = 1 + err;
			if (code === 1000 || code === 1001) {
				console.info('Закрыто соединение c '+ wS.url +' ('+ reason +')');
				wsData = -2;
			} else {
				console.warn('Соединение c '+ wS.url +' было прервано "'+ reason +'" [код: '+ code +']');
			}
			if (wsData === -2)
				window.removeEventListener('message', _handler);
			window.postMessage({ wsEvent: 'stat-change', wsData }, location.origin);
		}
		wS.onerror = () => { err = true; };
	},
	restart() {
		this.state = 1;
		window.postMessage({ wsRequest: 'restart', wsText: '' });
	},
	handleEvent({ origin, data }) {
		if (origin !== location.origin || !data.wsEvent)
			return;
		let wd = data.wsData;
		switch ( data.wsEvent ) {
		case 'new-comments':
			onWSData(wd);
			break;
		case 'events-refresh':
			App.checkNow(wd);
			break;
		case 'stat-change':
			if (wd === -2)
				return;
			if (this.state !== -1)
				onWSChange(wd);
			if ((this.state = wd) === 0 && this.to_send)
				window.postMessage({ wsRequest: 'send', wsText: this.to_send });
		}
	},
	terminate(wasStop = false, reason = '') {
		this.to_send = '';
		if (wasStop)
			window.postMessage({ wsRequest: 'stop', wsText: reason });
	}
}

const onWSChange = (s) => {

	const realtime = document.getElementById('realtime');

	realtime.className = s ? `ws-${ s === 1 ? 'warn' : 'error' }` : '';
	realtime.style.display = s ? null : 'none';
	Favicon.draw(Favicon.index || ['','!','–'][s], s);
}

const injectText = (str, nl = false) => {
	const txtArea = CommentForm.elements.msg;
	
	let val = txtArea.value,
	    len = txtArea.value.length,
	  start = txtArea.selectionStart,
	    end = txtArea.selectionEnd;

	if (start === end && nl) {
		if (len && val.charAt(len - 1) !== '\n')
			str = '\n'+ str;
		txtArea.value += str +'\n';
	} else {
		txtArea.value = val.substring(0, start) + str + val.substring(end);
	}
	txtArea.selectionStart = txtArea.selectionEnd = 0;
};

window.addEventListener('setMemories', ({ detail: [m_tag, memories] }) => {
   switch (Number(memories)) {
   case 1 : _setup(document.getElementById('memories_button'), { m_tag, onclick: toMemories, title: mem_title['memories'][Number(!m_tag)], class: m_tag ? 'selected' : ''}); break;
   case 0 : _setup(document.getElementById('favs_button'    ), { m_tag, onclick: toMemories, title: mem_title['favorite'][Number(!m_tag)], class: m_tag ? 'selected' : ''}); break;
   default: _setup(document.getElementById('tagFavAdd'      ), { m_tag, onclick: toMemories });
            _setup(document.getElementById('tagIgnore'      ), { m_tag, onclick: toMemories });
   }
});

function locKeyHandler(e) {

	const { target, key, ctrlKey } = e;

	const val = target.value,
	    start = target.selectionStart,
	      end = target.selectionEnd,
	     char = val.charAt(start - 1);

	let isValidMark = false, isNColl = start !== end,
	    isBackspace = false, isEnter = false;

	let op = '', ed = '', ic = -1;

	e.stopPropagation();

	switch (key) {
	case 'Enter':
		isEnter = true;
		if (ctrlKey) {
			target.dispatchEvent(new CustomEvent('doAction', { bubbles: true, detail: 'upload' }));
			return e.preventDefault();
		}
		break;
	case 'Backspace':
		isBackspace = true;
		break;
	case 'Tab': isValidMark = isNColl = true;
		op = '    ', ed = '\n    ';
		break;
	case '>': isValidMark = true, isNColl &= !char || char === '\n';
		op = '>', ed = '\n>';
		break;
	case '*': isValidMark = true;
		if (LORCODE_MODE) {
			op = '[*]', ed = '[/*]';
		} else if (!char || char === '\n')
			op = '* ', ed = '\n* ';
		else
			op = '*';
		break;
	case '@': isValidMark = true;
		if (LORCODE_MODE)
			op = '[user]', ed = '[/user]';
		else
			op = '@';
		break;
	case '~': isValidMark = true;
		if (LORCODE_MODE)
			op = '[s]', ed = '[/s]';
		else
			op = '~~';
		break;
	case '`': isValidMark = isNColl && !LORCODE_MODE
		if (isValidMark) {
			op = /\n/gm.test(val.substring(start, end)) ? '```' : '`';
			break;
		}
	default:
		ic = '({[\'"`)}]'.indexOf(key);
	}

	if (isValidMark) {
		if (!isNColl)
			isValidMark = false;
		else if (ed)
			lorcodeMarkup.call(target, op, ed);
		else
			markdownMarkup.call(target, op);
	} else if (!isNColl && (isEnter || isBackspace) || ic >= 0) {

		let prev = val.substring(0, start),
		    next = val.substring(end),
			xni  = ')}]\'"`'.indexOf(isNColl ? val.charAt(end - 1) :  next.charAt(0));

		let codeSp = prev.split(LORCODE_MODE ? /\[code(?:=[^\]]*)?\]/ : /```[^\n]*\n/);
		let codeEp = prev.split(LORCODE_MODE ? '[/code]' : '\n```');

		if (codeSp.length > codeEp.length) {

			if (isEnter) {
				codeSp = codeSp[codeSp.length - 1];
				let li = codeSp.lastIndexOf('\n'),
				    ln = codeSp.substring(li + 1).replace(/^([\s]*).*/, '$1'),
				   sig = xni >= 0 && xni === '({['.indexOf(char);
				    li = ln.length;

				if ((isValidMark = li > 0 || sig)) {
					ln  = '\n'+ ln,
					li += 1;
					if (sig) {
						ln += '    '+ ln;
						li += 4;
					}
					target.value = prev + ln + next;
					target.setSelectionRange(start + li, start + li);
				}
			} else if (isBackspace) {
				if (xni >= 0 && xni === '({[\'"`'.indexOf(char)) {
					isValidMark = true;
					target.value = prev.substring(0, start - 1) + next.substring(1);
					target.setSelectionRange(start - 1, start - 1);
				}
			} else {
				if ((isValidMark = ic <= 5)) {
					let ln = isNColl ? val.substring(start, end) : '',
					    sp = isNColl ? start - 1 : start + 1;
					target.value = prev + key + ln + ')}]\'"`'.charAt(ic) + next;
					target.setSelectionRange(sp, end + 1);
				} else
				if ((isValidMark = ic - 6 === xni)) {
					target.setSelectionRange(end + 1, end + 1);
				}
			}
		}
	}
	if (isValidMark) {
		e.preventDefault();
	} else if (target.classList.contains('select-break')) {
		if (!isBackspace)
			target.setSelectionRange(end, end);
		target.classList.remove('select-break');
	}
}

function winKeyHandler(e) {
	const key = e.key, tag = e.target.tagName;
	if (key === '>' || key === '@' && !/input|textarea/i.test(tag)) {
		const wSelect = window.getSelection();
		if (  wSelect.isCollapsed  )
			return;
		let text = wSelect.toString().trim();
		if (key === '>')
			injectText('>'+ text.replace(/\n/gm, '\n>'), true);
		else
			injectText(LORCODE_MODE ? '[user]'+ text +'[/user]' : key + text);
		e.preventDefault();
	}
}

function markdownMarkup(open) {
	
	const val    = this.value;
	const end    = this.selectionEnd;
	const start  = this.selectionStart;
	const select = this.value.substring(start, end);
	
	const typex = (g = '') => new RegExp('^(\\s*)(.*?)(\\s*)$', g);
	
	let close = open, usel = 0, mkdwnText = '';
	
	switch (open) {
		case '>>>':
			close = '<<<';
			usel += 1;
		case '```':
			mkdwnText = select.replace(/^\n?/, `${open}\n`).replace(/\n?$/, `\n${close}\n`);
			usel += open.length;
			break;
		case 'http://':
			const [ uri = '' ] = /(?:ht|f)tps?:\/\/[^\s]+/.exec(select) || '';
			mkdwnText = select.replace(uri, '').replace(typex(), `$1[$2](${uri})$3`);
			usel = select ? mkdwnText.length - !uri : 1;
			break;
		case '1.':
			for (let i = 0, li = select.split(/\n/); i < li.length; i++)
				mkdwnText += `\n${i+1}. ${ li[i] }`;
			if (!start || this.value.substring(start - 1, start) == '\n')
				mkdwnText = mkdwnText.substring(1);
			break;
		case '@':
			close = '';
		default:
			const uline = typex().exec(select) === null ? 'gm' : '';
			mkdwnText = select.replace(typex( uline ), `$1${open}$2${close}$3`);
	}
	this.value = val.substring(0, start) + mkdwnText + val.substring(end);
	
	if (usel) {
		this.selectionStart = this.selectionEnd = start + usel;
	} else {
		this.setSelectionRange(start, start + mkdwnText.length);
		this.classList.add('select-break');
	}
	this.focus();
	this.dispatchEvent( new InputEvent('input', { bubbles: true }) );
}

function lorcodeMarkup(open, close) {
	
	const val = this.value,
	      end = this.selectionEnd,
	    start = this.selectionStart,
	    collp = start === end;

	let mtext = '', soff = 0, eoff = 0;
	
	if (collp) {
		if (open === '[br]' || close.charAt(0) === '\n')
			close = '';
		soff = eoff = open.length;
	} else {
		mtext = val.substring(start, end);
		switch (open) {
			case '[br]':
				mtext = mtext.replace(/\n/gm, open +'\n'),
				open  = '';
				break;
			case '[*]':
				mtext = mtext.replace(/\[\/?\*\]/g, '').replace(/\n/gm, '\n'+ open);
				break;
			case '[url]':
				const [ uri ] = /(?:ht|f)tps?:\/\/[^\s]+/.exec(mtext) || '';
				if (uri) {
					open  = `[url=${ uri }]`;
					mtext = mtext.replace(uri, '');
				}
			default:
				if (close.charAt(0) === '\n') {
					mtext = mtext.replace(/\n/gm, close);
					close = '';
				}
		}
		eoff = open.length + mtext.length + close.length;
	}
	this.value = val.substring(0, start) + open + mtext + close + val.substring(end);
	this.classList.add('select-break');
	this.focus();
	this.setSelectionRange(start + soff, start + eoff);
	this.dispatchEvent( new InputEvent('input', { bubbles: true }) );
}

const onWSData = (cids) => {

	const rtime  = document.getElementById('realtime');
	const search = '?cid='+ cids[0];
	const hasCom = document.getElementById('comment-'+ cids[0]);

	let g = 0, count = cids.length, g_ref = [];

	const recuThen = ({ pcont, ref_list, page_num }) => {
		for (var next = null; g < count; g++) {
			if (!(`comment-${cids[g]}` in pcont.children)) {
				next = Navigation.preloadPage('/page'+ (page_num + 1), 0x4);
				break;
			}
		}
		Favicon.draw((Favicon.index += g));
		g_ref.push(...ref_list);
		if (g === count)
			genRefMap(g_ref);
		if (next)
			next.then(recuThen);
	};
	rtime.children[0].textContent = `Добавлено ${count} новых.\n`;
	rtime.children[1].search = search;
	RealtimeHub.to_send =`${LOR.topic} ${cids[count-1]}`;

	if (!USER_SETTINGS['Realtime Loader']) {
		rtime.style.display = null;
	} else {
		rtime.style.display = 'none';
		Navigation.preloadPage(search, 0xE).then(recuThen);
	}
}

const mergeComments = (pcont, msg_list, isNew = false) => {

	const new_list = [];

	for(const msg of msg_list) {
		const old = document.getElementById(msg.id);

		if (old) {
			updCommentContent(old, msg);
		} else {
			if (isNew)
				msg.classList.add('newadded');
			new_list.push(msg);
			pcont.append(msg);
		}
	}
	return new_list;
}

const workComments = (msg_list, mouse = mousePreviewHandler) => {

	let ref_map  = Object.create(null),
	    ref_list = [];

	for(const msg of msg_list) {
		const cid = msg.id.substring('comment-'.length);
		let reply = msg.querySelector('.title > a[href*="?cid="]:not(.link-pref)');
		if (reply) {
			// Extract reply comment ID from the 'search' string
			let reid = reply.search.substring('?cid='.length);
			let user = msg.querySelector('a[itemprop="creator"]');
			let text = reply.nextSibling.textContent,
			     off = text.indexOf('от ') + 3;
			// Create new response-map for this comment
			ref_list.push({ cid, name: (user ? user.innerText : 'anon'), reid });
			// Write special attributes
			_setup(reply, { class: 'link-pref', text: text.substr(off).trim() }, mouse);
			reply.nextSibling.textContent = text.substr(0, off);
		}
		let refmap = msg.querySelector('.ref-map');
		if(!refmap) {
			refmap = document.createElement('span');
			handleReplyLinks(msg, cid, refmap);
			ContentFinder.check(msg);
		}
		ref_map[cid] = _setup(refmap, { class: 'ref-map' }, mouse);
	}
	if (msg_list.length > 1 && ref_list.length)
		ref_list = addRefLinks(ref_list, ref_map);
	return { ref_list, ref_map };
}

const genRefMap = (ref_list) => {
	let ref_map = Object.create(null),
		 hasMap = false;

	ref_list = ref_list.concat(gRefList);

	for(let { reid } of ref_list) {
		let msg = document.getElementById(`comment-${reid}`),
			ref = msg && msg.querySelector('.ref-map');
		if (ref)
			ref_map[reid] = ref, hasMap = true;
	}
	gRefList = hasMap ? addRefLinks(ref_list, ref_map) : ref_list;
}

const addRefLinks = (ref_list, ref_map) => {

	const { path, TopicStarter } = LOR;
	const unused = [];

	for(const ref of ref_list) {
		let { reid, name, cid } = ref, map = ref_map[reid];
		if ( !map ) {
			unused.push(ref);
			continue;
		}
		let lnk = _setup('a', {
			class: `link-pref${name === TopicStarter ? ' ts' : ''}`,
			href: `${path}?cid=${cid}`,
			text: name
		});
		map.append( lnk );
		map.parentNode.classList.remove('hidden');
	}
	return unused;
}

const getPageContent = (html) => {
	// Create new DOM tree
	const newdoc = new DOMParser().parseFromString(html, 'text/html'),
	      events = newdoc.getElementById('main_events_count'),
	     top_msg = newdoc.getElementById('topic-'+ LOR.topic),
	    pg_comms = newdoc.getElementById('comments'),
	      t_info = newdoc.body.querySelector('.messages > .infoblock');

	let msg_list = [], del_list = [], nav_count = 1;
	// filter comments elements
	for (const ch of pg_comms.children) {
		switch (ch.classList[0]) {
		case 'msg': msg_list.push(ch);
		case 'datejump': break;
		case 'nav': nav_count = ch.children.length - 2;
		default: del_list.push(ch);
		}
	}
	for (const ch of del_list)
		pg_comms.removeChild(ch);
	// resolve promis with comment nodes
	return {
		pg_comms, msg_list, nav_count, top_msg,
		t_info: t_info ? String(t_info.innerText) : '',
		events: events ? Number(events.textContent.match(/\d+/)) : -1
	};
};

const updTopicContent = (new_top, t_info = '') => {
	// check topic changes
	const old_top = document.getElementById('topic-'+ LOR.topic),
	        newfv = new_top.querySelector('.fav-buttons'),
	        oldfv = old_top.querySelector('.fav-buttons'),
	         msgs = old_top.parentNode;
	// update favorites and memories counter
	oldfv.children.favs_count.textContent = newfv.children.favs_count.textContent;
	oldfv.children.memories_count.textContent = newfv.children.memories_count.textContent;
	// update info line
	if (t_info) {
		let info = msgs.querySelector('#comments ~ .infoblock') ||
		           msgs.appendChild( _setup('div', { class: 'infoblock' }) );
		info.textContent = t_info;
		// stop watch if topic deleted
		if (t_info.includes('Тема удалена'))
			RealtimeHub.terminate();
	}
	// update topic body if modifed
	updCommentContent(old_top, new_top, 1);
}

const updCommentContent = (old_msg, new_msg, si = 0) => {

	const new_lmd = new_msg.querySelector('.sign_more > time');
	const old_lmd = old_msg.querySelector('.sign_more > time');
	const new_rly = new_msg.querySelector('.reply');
	const old_rly = old_msg.querySelector('.reply');
	const new_emj = new_msg.querySelector('.reactions-form');
	const old_emj = old_msg.querySelector('.reactions-form');

	let old_ebt = old_rly.querySelector('a[href^="/edit_comment"]');
	if (old_ebt)
		old_ebt.parentNode.hidden = !new_rly.querySelector('a[href^="/edit_comment"]');

	if (new_lmd && (!old_lmd || new_lmd.dateTime !== old_lmd.dateTime)) {
		const new_body = new_rly.parentNode;
		const old_body = old_rly.parentNode;

		ContentFinder.check(new_body);

		for (let oc; (oc = old_body.childNodes[si]) && oc !== old_rly;)
			old_body.removeChild(oc);
		for (let nc; (nc = new_body.childNodes[si]) && nc !== new_rly;)
			old_body.insertBefore(nc, old_rly);
	}

	let new_reacts = new_emj && new_emj.elements.reation;
	if (new_reacts) {
		let old_reacts = old_emj && old_emj.elements.reaction;
		if (old_reacts) {
			const val = {}, [show, hide] = preferReactions(old_emj);
			for (const r of new_reation) {
				let c  =  r.value.substr(0, r.value.indexOf('-'));
				val[c] = [r.value, r.lastElementChild.innerText, r.title];
			}
			for (const r of Array.from(old_reacts)) {
				let [f,c,t] = val[r.value.substr(0, r.value.indexOf('-'))],
				       cont = f.endsWith('false') ? show : hide;
				r.value = f, r.lastElementChild.textContent = c;
				r.title = t, !cont.contains(r) && cont.append(r);
			}
		} else if (!old_emj) {
			old_rly.after(new_emj.parentNode);
		} else
			old_emj.replaceWith(new_emj);
	}
}

const clearPreviews = preview => {
	const pstack = document.getElementsByClassName('preview');
	let c = pstack.length - Drops;
	while ( pstack[c] !== preview)
	        pstack[c--].remove();
}

class CentralPicture {

	static expose(src) {
		const pic = new CentralPicture;
		Object.defineProperty(CentralPicture, 'expose', {
			value: src => pic.expose(src)
		});
		pic.expose(src);
	}

	constructor() {
		this.posX = 0; this.angle = 0;
		this.posY = 0; this.scale = 1;

		const image = _setup('img', {
			class: 'central-pic-img'
		}, { load: this,
			error: ({ target: { style } }) => {
				style.visibility = 'visible';
			}
		});

		const overly = _setup('div', {
			class : 'central-pic-overlay',
			html  : `
				<svg class="central-pic-rotate" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
					<path class="svg-circle-arrow" d="m31 20c-0.6 4.5-3.7 8.6-8 10.5-2 1.25-5 1.6-7.7 1.5l-1.7-0.15c-2.5-0.6-5-1.7-7-3.5-4.3-3.6-6-10-4-15 1.6-4.55 6-8.1 11-9 1.2-0.25 2.45-0.3 3.7-0.25l0.6-4.1h0.1c2.1 2.7 4.15 5.34 6.3 8-2.8 2-5.6 4.1-8.4 6 0.2-1.4 0.4-2.7 0.56-4.1-2.5-0.025-5.1 1.1-6.6 3.1-2.5 2.75-2.5 7.1-0.13 10 1.8 2.5 5.25 3.6 8.4 3 2.156-0.3 4.1-1.6 5.3-3.4 0.8-1 1.1-2.25 1.5-3.4 2 0.25 4 0.5 7 0.8l0.1-0.05z"/>
				</svg>`
		});

		const cleanUp = () => {
			overly.remove();
			window.removeEventListener(RESIZE_FUNCT, this);
			image.src = ''; this.transform(0, 0, 1, 0);
			image.className = 'central-pic-img';
		}
		const handler = e => {
			switch (e.target.classList[0]) {
				case 'central-pic-rotate':
				case 'svg-circle-arrow':
					this.transform(
						this.posX, this.posY, this.scale,
						this.angle === 270 ? 0 : this.angle + 90
					);
					break;
				case 'central-pic-overlay':
					cleanUp();
			}
			e.stopPropagation(), e.preventDefault();
		}

		if (TOUCH_DEVICE) {

			let startX = 0, iS = 1;
			let startY = 0, iY = 0, point2D = -1;

			image.addEventListener('touchstart', e => {

				const [p0, p1] = e.touches;

				let x0 = p0.clientX, y0 = p0.clientY;

				point2D = p1 ? Math.sqrt(
					(x0 - p1.clientX) * (x0 - p1.clientX) +
					(y0 - p1.clientY) * (y0 - p1.clientY)
				) : -1;
				startX = x0 - this.posX, iS = this.scale;
				startY = y0 - this.posY, iY = y0;

				e.stopPropagation(), e.preventDefault();
			});
			image.addEventListener('touchmove', ({ changedTouches: [p0, p1] }) => {

				let x0 = p0.clientX, y0 = p0.clientY;

				let moveY = this.posY, scale = this.scale,
				    moveX = this.posX;
				if (point2D !== -1) {
					scale = Math.sqrt(
						(x0 - p1.clientX) * (x0 - p1.clientX) +
						(y0 - p1.clientY) * (y0 - p1.clientY)
					) / point2D * iS;
					if (scale >= 0.95 && scale <= 1.05)
						scale = 1;
					else if (scale < 0.4)
						scale = 0.4;
				} else {
					/**/moveY = y0 - startY, y0 -= iY;
					if (scale > 1) {
						moveX = x0 - startX;
					} else if (y0 <= -this.swipeY) {
						image.classList.add('swipe-up');
					} else if (y0 >=  this.swipeY) {
						image.classList.add('swipe-down');
					}
				}
				this.transform(moveX, moveY, scale);
			});
			image.addEventListener('touchend', ({ touches, changedTouches: [p0] }) => {
				if (!touches.length && this.scale <= 1) {
					this.transform(
						(window.innerWidth  - image.width ) / 2,
						(window.innerHeight - image.height) / 2
					);
				}
			});
			image.addEventListener('animationend', cleanUp);
			overly.addEventListener('touchstart', handler);
		} else {

			image.addEventListener('mousedown', e => {

				if ( e.button !== 0 ) return;

				const startX = e.clientX - this.posX;
				const startY = e.clientY - this.posY;
				const onMove = m => this.transform(
					m.clientX - startX,
					m.clientY - startY
				);
				const onEnd = () => {
					window.removeEventListener('mousemove', onMove);
					window.removeEventListener('mouseup', onEnd);
				}
				window.addEventListener('mousemove', onMove);
				window.addEventListener('mouseup', onEnd);
				e.stopPropagation(), e.preventDefault();
			});
			image.addEventListener('wheel', e => {

				let d = e.deltaX || e.deltaY,
				    s = this.scale, r = s * 0.15;

				this.transform(
					this.posX, this.posY,
					(d < 0 ? r + s : (s - r) > 0.1 ? s - r : 0.1)
				);
				e.preventDefault();
			});
			overly.addEventListener('click', handler);
		}
		Object.defineProperties(this, {
			_Box: { value: overly },
			_Img: { value: overly.appendChild( image ) }
		});
	}
	handleEvent() {

		const { naturalWidth, naturalHeight } = this._Img;
		const {   innerWidth,   innerHeight } = window;

		let iW = naturalWidth, iS = innerWidth < 960 ? 1 : 0.85,
		    iH = naturalHeight,iK = innerHeight * 0.75;

		if (innerWidth / innerHeight < iW / iH) {
			const ratio = innerWidth * iS;
			if (!(ratio > naturalWidth)) {
				iH *= (iW = ratio) / naturalWidth;
			}
		} else {
			const ratio = iS * innerHeight;
			if (!(ratio > naturalHeight)) {
				iW *= (iH = ratio) / naturalHeight;
			}
		}
		this._Img.width  = iW; this.swipeY = iK;
		this._Img.height = iH;
		this.transform(
			(innerWidth  - iW) / 2,
			(innerHeight - iH) / 2
		);
		this._Img.style.visibility = 'visible';
	}
	transform(x, y, s = this.scale, a = this.angle) {
		this._Img.style.transform = `translate(${
			this.posX  = x}px, ${
			this.posY  = y}px) scale(${
			this.scale = s}) rotate(${
			this.angle = a}deg)`;
	}
	expose(src = '') {
		const is_sset = /\s\d+w$/.test(src);
		this._Img.style.visibility = 'hidden';
		this._Img.src    = is_sset ? '' : src;
		this._Img.srcset = is_sset ? src : '';

		window.addEventListener(RESIZE_FUNCT, this, false);
		ContentNode.append( this._Box );
	}
}

if (!('scrollTopMax' in Element.prototype)) {
	Object.defineProperty(Element.prototype, 'scrollTopMax', {
		get: function scrollTopMax() {
			return this.scrollHeight - this.clientHeight;
		}
	});
}

const showReplyThread = (uri, tid, cid) => {

	const id = 'thread-'+ tid,
	    exis = ContentNode.children[id] || ThrMap[tid];
	if (exis)
		return ContentNode.append(exis);

	const msgcol = _setup('div', { class: 'page-loader' });
	const thread = _setup('div', { class: 'reply-thread', id });

	getDataResponse(uri, html => {
		const { msg_list } = getPageContent(html);

		workComments(msg_list, null);
		msgcol.className = 'messages show-in';
		msgcol.append(...msg_list);
		ThrMap[tid] = thread;
	});
	addThreadHandler( thread, msgcol );
	ContentNode.appendChild(thread).append(msgcol);
}

const addThreadHandler = (thread, msgcol) => {

	const _start = TOUCH_DEVICE ? 'touchstart' : 'mouseover';
	const _end   = TOUCH_DEVICE ? 'touchend'   : 'mouseout';

	const fle = _setup('div', { class: 'msg fake-flee' });
	msgcol.addEventListener('animationstart', (e) => {
		if (e.animationName === 'showIn' && thread.scrollTopMax) {
			thread.style.touchAction = null;
		}
	});
	msgcol.addEventListener('animationend', (e) => {
		if (e.animationName.substring(0,5) === 'swipe') {
			thread.remove();
			msgcol.classList.remove('swipe-up', 'swipe-down');
		}
	});

	if (TOUCH_DEVICE) {
		let sY = 0, eY = 0, lock = false;

		thread.style.touchAction = 'none';
		thread.addEventListener('scroll', () => {
			lock = thread.scrollTop > 0 && thread.scrollTop < thread.scrollTopMax;
		});
		thread.addEventListener('touchstart', (e) => {
			sY = e.touches[0].clientY;
		});
		thread.addEventListener('touchend', () => {
			msgcol.style.top = null;
		});
		thread.addEventListener('touchmove', (e) => {
			if (!lock) {
				eY = e.changedTouches[0].clientY - sY;
				msgcol.style.top = (eY * .35) +'px';
				if (Math.abs(eY) > window.innerHeight * .75) {
					msgcol.classList.add('swipe-'+ (eY > 0 ? 'down' : 'up'));
				}
			}
		});
	}
	const onOut = ({ target: anc }) => {
		let cid = anc.search.substring('?cid='.length),
		    msg = msgcol.children['comment-'+ cid];
		msg.classList.remove('highlight');
		fle.remove(); msg.style = '';
		anc.removeEventListener(_end, onOut)
	};

	msgcol.addEventListener(_start, e => {

		let anc = e.target;
		if (anc.classList[0] !== 'link-pref')
			return;
		e.stopPropagation(), e.preventDefault();

		const cid = anc.search.substring('?cid='.length),
		      msg = msgcol.children['comment-'+ cid],
		     winH = window.innerHeight;

		const { height: mH, y: mY } = msg.getBoundingClientRect();

		if (!(mY + mH > 60 && mY < winH - 60)) {
			const { height: aH, y: aY } = anc.getBoundingClientRect();
			fle.style.height = mH +'px';
			fle.style.padding = '0';
			msg.before(fle);
			msg.style.visibility = 'hidden';
			msg.style.top = `${thread.scrollTop + aY + aH}px`;
			msg.style.visibility = 'visible';
		}
		msg.classList.add('highlight');
		anc.addEventListener(_end, onOut);
	});

	thread.addEventListener('click', e => {
		const el  = e.target,
		   aClass = el.classList,
		   aPath  = el.pathname,
		  aSearch = el.search;
		let param = false;

		switch(aClass[0]) {
		case 'link-navs':
			if (aPath !== LOR.path) {
				if (App.openUrl(aPath + aSearch)) {
					return;
				} else
					break;
			}
		case 'link-self': param = true;
		case 'link-pref':
			var cid = aSearch.substring('?cid='.length),
			    msg = msgcol.children[`comment-${cid}`];
			if (!param && msg) {
				onOut(e), msg.scrollIntoView({ block: 'start', behavior: 'smooth' });
				break;
			}
			Navigation.goToCommentPage(cid);
		case 'reply-thread': thread.remove();
			break;
		case 'link-quote': param = true;
		case 'link-reply':
			var [ tid, cid ] = parseReplyUrl(aSearch);
			toggleForm(msgcol.children[`comment-${cid}`], tid, cid, param);
			break;
		default:
			return;
		}
		e.stopPropagation(), e.preventDefault();
	});
}

const mousePreviewHandler = !TOUCH_DEVICE && {

	mouseover: e => {
		const anc = e.target;
		if (anc.classList[0] === 'link-pref') {
			// Get comment's ID from search attribute
			const cid = anc.search.substring('?cid='.length);
			Timer.delete(cid);
			Timer.set('Open Preview', () => {
				Drops = 2;
				showPreview(anc, cid);
			});
			e.preventDefault();
		}
	},
	mouseout: e => {
		if (e.target.classList[0] === 'link-pref') {
			Drops = 1;
			Timer.delete('Open Preview');
		}
	}
};

const stubHandler = e => {
	e.stopPropagation(), e.preventDefault();
};

const cloneMsgBody = (dst, msg) => {
	do {
		let mx, dx, cc;
		for (const c of msg.children) {
			let name = c.classList[0];
			if (name === 'form-container')
				continue;
			if (name === 'msg-container' || name === 'msg_body') {
				dx = cc = (mx = c).cloneNode();
				dx.classList.add('no-reply');
			} else {
				cc = c.cloneNode(true);
				if (name === 'reactions')
					cc.children[0].onsubmit = cc.children[0].onclick = stubHandler;
			}
			dst.append(cc);
		}
		msg = mx;
		dst = dx;
	} while (msg);
}

const showPreview = (anc, cid) => {

	const pos = anc.getBoundingClientRect();
	let preview = document.getElementById('preview-'+ cid);
	// check existing preview by ID
	if (!preview) {
		 preview = _setup('article', {
			id: 'preview-'+ cid,
			class: 'msg preview',
			style: 'border: 1px solid grey;'
		}, !TOUCH_DEVICE ? Object.assign({
			// remove all preview's
			mouseleave: () => { Timer.set('Close Preview', clearPreviews) },
			mouseenter: () => { Timer.set('Close Preview', () => clearPreviews(preview));
				// remove all preview's after this one
				Timer.delete(cid);
			}
		}, mousePreviewHandler) : null);
		// get comment from page or request from server
		let msg = document.getElementById('comment-'+ cid);
		if (msg) {
			// Without the 'clone' call we'll just move the original comment
			cloneMsgBody(preview, msg);
		} else {
			// Add Loading Process stub
			preview.textContent = 'Загрузка...';
			// Get an HTML containing the comment
			Navigation.preloadPage('?cid='+ cid, 0x3).then(({ pcont }) => {
				preview.style.visibility = 'hidden';
				preview.textContent = '';
				cloneMsgBody(preview, pcont.children['comment-'+ cid]);
				popupPreview(preview, pos);
			}).catch(err => { // => Error
				preview.textContent = err;
				preview.classList.add('msg-error');
			});
		}
	}
	if (USER_SETTINGS['CSS3 Animation'])
		preview.classList.add('show-in');
	else
		preview.classList.remove('show-in');
	anc.onmouseleave = () => {
		// remove this preview
		Timer.set(cid, () => preview.remove(), USER_SETTINGS['Delay Close Preview']);
	};
	popupPreview( preview, pos );
}

const popupPreview = (preview, { left, right, top, bottom }) => {

	const { scrollX:sX,scrollY:sY, innerWidth:iW,innerHeight:iH } = window;

	const comms = document.getElementById('comments');
	const style = preview.style,
	      sLeft = left + (right - left),
	     sRight = iW - left,
	      sBotm = iH - bottom;

	style.visibility = 'hidden',
	style.maxWidth = `${iW * .64}px`,
	style.left = `${sX + (sLeft > sRight ? 0 : left)}px`;
	style.top  = `${sY + bottom + 6}px`;
	// add preview in to screen and checks his rendered w/h
	let { offsetWidth:w, offsetHeight:h } = comms.appendChild(preview);
	// correct left/top position
	if (sLeft > sRight && sLeft > w)
		style.left = `${sX + (sLeft - w)}px`;
	if (sBotm < top && sBotm < h)
		style.top  = `${sY + (top - h - 4)}px`;
	style.visibility = 'visible';
}

function correctBlockCode (max_h, parent) {
	for(const s of parent.getElementsByClassName('shrink-line')) {
		const code     = s.nextElementSibling.firstElementChild,
		    { height } = code.getBoundingClientRect();

		if (max_h > 35 && max_h >= height)
			s.classList.add('hidden');
		else
			s.classList.remove('hidden');
	}
}

function _setup(el, attrs, events) {

	if (!el)
		return '';

	switch (typeof el) {
		case 'string':
			el = document.createElement(el);
		case 'object':
			for (const key in attrs) {
				attrs[key] === undefined ? el.removeAttribute(key) :
				key === 'class'? el.className   = attrs[key] :
				key === 'html' ? el.innerHTML   = attrs[key] :
				key === 'text' ? el.textContent = attrs[key] :
				key in el    && (el[key]        = attrs[key] ) == attrs[key]
							 &&  el[key]       == attrs[key] || el.setAttribute(key, attrs[key]);
			}
			for (const name in events) {
				if (!events[name])
					continue;
				if (Array.isArray(events[name]))
					events[name].forEach(handler => el.addEventListener(name, handler, false));
				else
					el.addEventListener(name, events[name], false);
			}
	}
	return el;
}

const lorifyUrl = (path, page, lastmod, cid) => (path +
	(page    ? `/page${     page    }` : '') +
	(lastmod ? `?lastmod=${ lastmod }` : '') +
	(cid     ? `#comment-${ cid     }` : '')
)

function parseLORUrl(uri) {
	const out = Object.create(null);
	var m = uri.match(/^(?:https?:\/\/www\.linux\.org\.ru)?(\/[^\/]+\/(?!archive)[^\/]+\/(\d+))(?:\/page([0-9]+))?(?:[&?]lastmod=(\d+))?(?:(?:[&?]cid=|#comment-)(\d+))?/);
	if (m) {
		out.path  = m[1];
		out.topic = m[2];
		out.page  = Number(m[3]) || 0;
		out.lastmod = m[4];
		out.cid     = m[5];
	}
	return out;
}

const parseReplyUrl = (uri = '', rxi = 0) => {
	const  m = uri.match([
		/\?topic=(\d+)(?:\&replyto=(\d+))?/,
		/thread\/(\d+)(?:\#comment-(\d+))?/
	][rxi]);
	return m ? [ m[1], m[2] || '' ] : ['', ''];
}

function getDataResponse(uri, resolve, reject = () => void 0) {
	const xhr = new XMLHttpRequest;
	xhr.withCredentials = true;
	xhr.open('GET', location.origin + uri, true);
	xhr.onreadystatechange = () => {
		if (xhr.readyState !== 4)
			return;
		xhr.status === 200 ? resolve(xhr.responseText, xhr.responseURL) : reject(xhr);
	}
	xhr.send(null);
}

const sendFormData = (uri, formData, fl = 0, signal = null) => (
	fetch(location.origin + uri, { signal,
		credentials : 'same-origin',
		method      : 'POST',
		body        : formData,
		headers     : { 'Accept': 'application/json' }
	}).then(res => {
		if (res.ok) {
			return (fl === 0x1 ? res.json() :
			        fl === 0x2 ? res.text() : Promise.resolve(res.url));
		} else {
			const err = res.status +' '+ res.statusText;
			return (fl ? Promise.resolve({ errors: [err], url: res.url }) :
			             Promise.reject(err));
		}
	})
);

const resetNavBoubbles = (all = false) => {
	const page = LOR.page,
		newcom = document.querySelectorAll(`${
		   all ? '#pcont_'+ page : '.page-content'} > .newadded`);
	let ncnt = newcom.length;
	if(!ncnt)
		return;
	for (let i = ncnt - 1; i >= 0; i--)
		newcom[i].classList.remove('newadded');
	if (all) {
		for (let p = 0; p < Navigation.pages_count; p++)
			Navigation.setNavBoubble(p, 0);
		ncnt = 0;
	} else {
		ncnt = Favicon.index - ncnt;
		Navigation.setNavBoubble(page, 0);
	}
	Favicon.draw( (Favicon.index = ncnt) );
};

const handleRegForm = form => {
	const cel = form.elements.hide_loginbutton;
	const snd = form.querySelector('button:not([type="button"]), [type="submit"]');

	const btnClear = (ok = true, str = '') => {
		const emsg = form.querySelector('.msg-error') || form.insertBefore(
			_setup('label', { class: 'msg-error' }), form.firstElementChild
		);
		emsg.hidden = ok, emsg.textContent = str;
		snd.disabled = false, cel.onclick = null;
	};

	form.onsubmit = e => { e.preventDefault();
		if (snd.disabled)
			return;
		snd.disabled = true;

		const uri  = form.action.substr(form.action.lastIndexOf('/'));
		let signal = null;
		if (window.AbortController) {
			const control = new AbortController;
				  signal  = control.signal;
			cel.onclick = () => (control.abort(), btnClear(true, ''));
		}
		sendFormData(uri, new FormData(form), 1, signal).then(({
			errors = ['Неверное имя или пароль.'], loggedIn = false
		}) => {
			btnClear(loggedIn, errors.join('\n'));
			if (loggedIn)
				location.reload();
		});
	};
};

const handleResetForm = form => {
	const btn = form.querySelector('button:not([type="button"]), [type="submit"]');
	btn.className = 'btn btn-danger', btn.id = 'do_reset';
	form.onsubmit = e => { e.preventDefault();
		if (btn.disabled)
			return;
		btn.disabled = true;
		btn.className = 'btn btn-primary', btn.textContent = '...';
		sendFormData('/notifications-reset', new FormData(form)).then(() => {
			btn.className = 'btn btn-danger', btn.textContent = 'Сбросить';
			btn.disabled = false;
			App.setNotes(0);
		});
	}
}

function handleCommentForm(form) {

	const URI_ACTION   = form.action.substring(form.action.lastIndexOf('/'));
	const TEXT_AREA    = form.elements.msg;
	const TITLE_AREA   = form.elements.title || { value: '' };
	const FACT_PANNEL  = form.querySelector('.form-actions');
	const NODE_PREVIEW = _setup('div', { id: 'commentPreview' });
	const MARKUP_PANEL = _setup('div', { id: 'markup-panel', class: 'lorcode'});

	for (let attrs of [
		{ lorcode: 'b'  },
		{ lorcode: 'i'     , markdown: '*'  },
		{ lorcode: 'u'  },
		{ lorcode: 's'     , markdown: '~~' },
		{ lorcode: 'em' },
		{ lorcode: 'br' },
		{ lorcode: 'cut'   , markdown: '>>>'},
		{ lorcode: 'list'  , markdown: '1.' },
		{ lorcode: 'strong' },
		{ lorcode: 'pre'   , markdown: '* ' },
		{ lorcode: 'user'  , markdown: '@'  },
		{ lorcode: 'code'  , markdown: '```'},
		{ lorcode: 'inline', markdown: '`'  },
		{ lorcode: 'quote' , markdown: '>'  },
		{ lorcode: 'url'   , markdown: 'http://'}
	]) {
		attrs.type  = 'button';
		attrs.class = 'btn btn-default';
		MARKUP_PANEL.append( _setup('button', attrs) )
	}

	NODE_PREVIEW.append(
		_setup('span', { class: 'error' }),
		_setup('span', { class: 'msg_body' })
	);

	MARKUP_PANEL.addEventListener('click', e => {
		e.preventDefault();
		if (e.target.type === 'button') {
			const tag = e.target.getAttribute(LORCODE_MODE ? 'lorcode' : 'markdown')
			if (!LORCODE_MODE && tag) {
				if (tag === '>' || tag === '* ')
					lorcodeMarkup.call(TEXT_AREA, tag, `\n${ tag }`);
				else
					markdownMarkup.call(TEXT_AREA, tag);
			} else {
				lorcodeMarkup.call(TEXT_AREA, '['+ tag +']', '[/'+ tag +']');
			}
		}
	});
	TEXT_AREA.parentNode.firstElementChild.appendChild(MARKUP_PANEL).previousSibling.remove();

	if (!form.elements['cancel']) {
		form.elements['preview'].after(
			'\n', _setup('button', { type: 'button', class: 'btn btn-default', id: 'cancel', text: 'Отмена' })
		)
	} else
		_setup(form.elements['cancel'], { type: 'button', name: void 0, id:  'cancel' });

	for (const submit_btn of FACT_PANNEL.querySelectorAll('[type="submit"]')) {
		_setup(submit_btn, { type: 'button', name: void 0, id: submit_btn.name, 'do-upload': '' });
	}

	const render_preview = html => {

		const doc = new DOMParser().parseFromString(html, 'text/html'),
		      msg = NODE_PREVIEW.children[1];
		      msg.textContent = '';

		let preview = doc.getElementById('topic-0');
		if (preview) {
			msg.className = 'messages';
			msg.append(preview);
		} else
			msg.append.apply(msg, Array.from(doc.body.children));
		ContentFinder.check( msg );
	}

	const refresh_preview = () => {

		const data = new FormData( form ),
		      ajax = !!form.elements.topic,
		      uri  = ajax ? '/add_comment_ajax' : URI_ACTION;

		data.append('preview', '');

		sendFormData(uri, data, (ajax ? 1 : 2)).then(o => {
			const { errors = [], preview = o } = o;
			if (preview)
				render_preview(preview);
			NODE_PREVIEW.children[0].textContent = errors.join('\n');
		}).catch(err => {
			NODE_PREVIEW.children[0].textContent = err;
		});
	}

	const submit_process = (sbtn, y) => {
		const btns = FACT_PANNEL.querySelectorAll('.btn[do-upload]');
		if (!sbtn) sbtn = btns[0];
		form.elements.cancel.className = `btn btn-${ y ? 'danger' : 'default' }`;
		form.elements.preview.disabled = sbtn.disabled = y;
		sbtn.classList[y ? 'add' : 'remove']('process');
		for (const primary of btns) {
			primary.disabled = y;
		}
	}

	const purge_form = () => {
		NODE_PREVIEW.remove();
		NODE_PREVIEW.removeAttribute('opened');
		NODE_PREVIEW.children[0].textContent = TITLE_AREA.value = '';
		NODE_PREVIEW.children[1].textContent = TEXT_AREA.value = '';
		TEXT_AREA.oninput = null;
	}

	const doAction = {

		 do_abort: null,

		'do_open': () => {
			const parent = form.parentNode;
			const slideCompl = () => {
				TEXT_AREA.focus();
				parent.classList.remove('slide-down');
				parent.removeEventListener('animationend', slideCompl);
			}
			parent.style.display = null;
			parent.className = 'form-container slide-down';
			parent.addEventListener('animationend', slideCompl);
			window.addEventListener('keypress', winKeyHandler);
		},

		'do_close': () => {
			const parent = form.parentNode;
			const slideCompl = () => {
				parent.style.display = 'none';
				parent.classList.remove('slide-up');
				parent.removeEventListener('animationend', slideCompl);
			}
			parent.className = 'form-container slide-up';
			parent.addEventListener('animationend', slideCompl);
			window.removeEventListener('keypress', winKeyHandler);
		},

		'do_upload': (btn, param) => {

			const delay = USER_SETTINGS['Upload Post Delay'] * 1e3;

			const onAbort = () => {
				Timer.delete('Upload Post Delay');
				submit_process(btn, false);
				alert('Отправка прервана.');
			}
			let signal = null;

			if (window.AbortController) {
				const control = new AbortController;
				      signal  = control.signal;

				// срабатывает при вызове controller.abort()
				signal.addEventListener('abort', onAbort);

				doAction.do_abort = () => control.abort(); // отмена!
			} else
				doAction.do_abort = onAbort;

			submit_process(btn, true);

			const doUpload = () => {

				const formData = new FormData( form );
				const targetId = (form.elements['original'] || { value: 'last' }).value

				if (param)
					formData.append(param, '');

				sendFormData(URI_ACTION, formData, 0, signal).then(url => {
					if (!USER_SETTINGS['Realtime Loader'] || parseLORUrl(url).topic != LOR.topic) {
						window.onbeforeunload = null;
						location.href         = url + (
							/(?:#comment-|(?:\?|&)cid=)\d+$/.test(url) ? '' : '#comment-'+ targetId
						);
						return;
					}
					purge_form();
					submit_process(btn, false);
					doAction.do_abort = null;
					doAction.do_close();
				}).catch(err => {
					doAction.do_abort = null;
					form.appendChild( NODE_PREVIEW ).children[0].textContent = `Не удалось выполнить запрос, попробуйте повторить еще раз.\n\n(${ err })`;
					submit_process(btn, false);
				});
			}
			if (delay > 25)
				Timer.set('Upload Post Delay', doUpload, delay);
			else
				doUpload();
		},

		'do_preview': () => {

			if (NODE_PREVIEW.hasAttribute('opened')) {
				NODE_PREVIEW.removeAttribute('opened');
				NODE_PREVIEW.remove();
				TEXT_AREA.oninput = null;
			} else {
				refresh_preview();
				form.appendChild( NODE_PREVIEW ).setAttribute('opened', '');
				TEXT_AREA.oninput = () => Timer.set('Refresh Preview', refresh_preview, 1e3);
			}
		},

		'do_cancel': () => {

			if (form.elements['cancel'].classList.contains('btn-danger')) {
				if (doAction.do_abort)
					doAction.do_abort();
			} else {
				const length = TEXT_AREA.textLength + TITLE_AREA.value.length;
				if (length > 0 && window.confirm('Очистить форму?'))
					purge_form();
				doAction.do_close();
			}
		}
	}

	TEXT_AREA.addEventListener('click', ({ target }) => target.classList.remove('select-break'));
	FACT_PANNEL.addEventListener('click', e => {

		const { type, id } = e.target;

		if (type === 'button') {
			if (`do_${id}` in doAction) {
				doAction[`do_${id}`]();
			} else if (e.target.hasAttribute('do-upload')) {
				doAction.do_upload(e.target, id);
			}
		}
		e.preventDefault();
	});

	form.addEventListener('doAction', ({ detail }) => {
		if (`do_${detail}` in doAction)
			doAction[`do_${detail}`]();
	});
	TEXT_AREA.addEventListener('keydown', locKeyHandler);
	window.onbeforeunload = () => (
		TEXT_AREA.value != '' && form.parentNode.style['display'] != 'none'
			? 'Вы что-то напечатали в форме. Все введенные данные будут потеряны при закрытии страницы.'
			: void 0
	);

	const mode_change = ({ target: { value } }) => {
		LORCODE_MODE = /markdown/i.test(value) ? 0 : /lorcode/i.test(value) ? 1 : 2;
		MARKUP_PANEL.className = LORCODE_MODE ? 'lorcode' : 'markdown';
	};
	
	let mode = form.elements['mode'] || form.querySelector('select[disabled]');
	if (mode) {
		mode.addEventListener('change', mode_change);
		mode_change({ target: mode });
	} else {
		let tags = [], lcm = false;
		form.firstElementChild.before((
			mode = _setup('select', { style: 'display: block;', html: '<option>LORCODE</option><option>Markdown</option>' }, { change: mode_change })
		));
		for (const b of MARKUP_PANEL.children)
			tags.push(b.getAttribute('lorcode'));
		lcm = new RegExp(`\\[\\/?(?:${tags.join('|')})(?:=[^\\]]*)?\\]`).test(TEXT_AREA.value);
		mode.selectedIndex = LORCODE_MODE = Number(lcm);
		MARKUP_PANEL.className = LORCODE_MODE ? 'lorcode' : 'markdown';
	}
	if ('tags' in form.elements) {
		handleTagsInput(form.elements['tags']);
	}
}

function handleTagsInput(TAGS_INPUT) {

	const isMainT = TOUCH_DEVICE ? e => e.touches.length === 1 : e => e.button === 0;
	const tagList = _setup('div', { class: 'tag-list infoblock' }, {
		click: e => e.preventDefault()
	});

	tagList.addEventListener(TOUCH_DEVICE ? 'touchstart' : 'mousedown', e => {
		if (isMainT(e) && e.target.classList[0] === 'tag') {
			const val = TAGS_INPUT.value,
				  idx = val.lastIndexOf(',') + 1;
			TAGS_INPUT.value = (idx ? val.substring(0, idx).trim() +' ' : '') + e.target.innerText +', ';
		}
	});

	let keywd = ' ';
	let focus = false;

	const handleList = () => {

		const last = TAGS_INPUT.value.lastIndexOf(',') + 1,
			  term = TAGS_INPUT.value.substring(last).trim();
		
		tagList.style.left = last ? getCaretCoordinates(TAGS_INPUT, last).left +'px' : '0';
		
		if (keywd === term) {
			focus && TAGS_INPUT.after(tagList);
		}
		else if (term) {
			getDataResponse(`/tags?term=${(keywd = term)}`, response => {

				const possibleTags = JSON.parse(response);
				
				for (var i = 0; i < possibleTags.length; i++) {
					const text = possibleTags[i];
					const item = tagList.children[i] || tagList.appendChild(
						document.createElement('a')
					);
					_setup(item, { class: 'tag', href: '/tag/'+ text, text });
				}
				while (i < tagList.children.length) {
					tagList.children[i++].className = 'hidden';
				}
				focus && TAGS_INPUT.after(tagList);
			});
		}
	}
	_setup(TAGS_INPUT, { autocomplete: 'off' }, {
		'focus': () => {
			focus = true;
			handleList();
		},
		'input': () => {
			tagList.remove();
			Timer.set('Search Tags', handleList, 800);
		},
		'blur' : () => {
			focus = false;
			tagList.remove();
		}
	});
}

function getCaretCoordinates() {
	// The properties that we copy into a mirrored div.
	// Note that some browsers, such as Firefox,
	// do not concatenate properties, i.e. padding-top, bottom etc. -> padding,
	// so we have to do every single property specifically.
	const properties = [
	  'direction',  // RTL support
	  'boxSizing',
	  'width',  // on Chrome and IE, exclude the scrollbar, so the mirror div wraps exactly as the textarea does
	  'height',
	  'overflowX',
	  'overflowY',  // copy the scrollbar for IE
	
	  'borderTopWidth',
	  'borderRightWidth',
	  'borderBottomWidth',
	  'borderLeftWidth',
	  'borderStyle',
	
	  'paddingTop',
	  'paddingRight',
	  'paddingBottom',
	  'paddingLeft',
	
	  // https://developer.mozilla.org/en-US/docs/Web/CSS/font
	  'fontStyle',
	  'fontVariant',
	  'fontWeight',
	  'fontStretch',
	  'fontSize',
	  'fontSizeAdjust',
	  'lineHeight',
	  'fontFamily',
	
	  'textAlign',
	  'textTransform',
	  'textIndent',
	  'textDecoration',  // might not make a difference, but better be safe
	
	  'letterSpacing',
	  'wordSpacing',
	
	  'tabSize',
	  'MozTabSize'
	];
		
	const isFirefox = window.mozInnerScreenX != null;
	const mirror    = document.createElement('div');
	const carret    = document.createElement('span');
	const iText     = document.createTextNode('');

	mirror.style = 'position: absolute; visibility: hidden; word-wrap: break-word;';
	mirror.append(iText, carret);

	return (getCaretCoordinates = (input, position) => {

		const computed  = getComputedStyle(input);
		const { style } = document.body.appendChild(mirror);
		
		// transfer the element's properties to the div
		for (const name of properties) {
			style[ name ] = computed[ name ];
		}
		// the second special handling for input type="text" vs textarea: spaces need to be set non-breaking spaces
		style.whiteSpace = `${ input.tagName === 'INPUT' ? 'no' : 'pre-' }wrap`;
		
		if (isFirefox) {
			// Firefox lies about the overflow property for textareas: https://bugzilla.mozilla.org/show_bug.cgi?id=984275
			if (input.scrollHeight > parseInt(computed.height))
				style.overflowY = 'scroll';
		} else {
			style.overflow = 'hidden';  // for Chrome to not render a scrollbar; IE keeps overflowY = 'scroll'
		}
		// Wrapping must be replicated *exactly*, including when a long word gets
		// onto the next line, with whitespace at the end of the line before (#7).
		// The  *only* reliable way to do that is to copy the *entire* rest of the
		// textarea's content into the <span> created at the caret position.
		// for inputs, just '|' would be enough, but why bother?
		carret.textContent = input.value.substring(position) || '|';  // || because a completely empty faux span doesn't render at all
		iText.textContent  = input.value.substring(0, position);
		
		const coordinates = {
			top  : carret.offsetTop  + parseInt( computed.borderTopWidth  ),
			left : carret.offsetLeft + parseInt( computed.borderLeftWidth )
		};
		
		document.body.removeChild(mirror);
		
		return coordinates;
	})(arguments[0], arguments[1]);
}

const lor_token = document.cookie.match(/(?:CSRF_TOKEN="?|$)([^;"]*)/)[1];
const mem_title = Object.freeze({
	favorite : ['Убрать из избранного' , 'Добавить в избранное'],
	ignore   : ['Cнять игнор'          , 'Добавить в игнор'    ],
	memories : ['Не следить'           , 'Следить за темой'    ]
});
function toMemories(e) {

	e.preventDefault();

	if (this.disabled || !lor_token)
		return;
	// приостановка действий по клику на кнопку до окончания текущего запроса
	this.disabled = true;

	const m_tag  = this.getAttribute('m_tag');
	const f_data = new FormData;

	f_data.append('csrf', lor_token);

	let watch = false, uri = '', name = 'favorite', cntr = null;
	let to_del = Number(this.classList.contains('selected'));

	switch (this.id) {
	case 'tagIgnore': name = 'ignore';
	case 'tagFavAdd': 
		f_data.append(to_del ? 'del' : 'add', '');
		f_data.append('tagName', m_tag);
		uri = `/user-filter/${name}-tag`;
		cntr = this.parentNode.children[name.replace('orite', 's') + 'Count'];
		break;
	case 'memories_button':
		name = 'memories', watch = true;
	default:
		f_data.append('watch', watch);
		if (m_tag === '0') {
			f_data.append('msgid', LOR.topic);
			f_data.append('add', ''); to_del = 0;
		} else {
			f_data.append('remove', ''); to_del = 1;
			f_data.append('id', m_tag);
		}
		uri = '/memories.jsp';
		cntr = this.parentNode.children[(watch ? 'memories' : 'favs') +'_count'];
	}
	sendFormData(uri, f_data, 1).then(data => {
		this.disabled = false;
		if (Number.isInteger(data)) {
			var id = '0', count = data, errors = false;
		} else
			var { count, id, errors } = data;
		if (errors)
			throw errors.join(', ');
		if (id)
			this.setAttribute('m_tag', id);
		cntr.textContent = count;
		this.title = mem_title[name][to_del];
		this.classList[ to_del ? 'remove' : 'add' ]('selected');
	});
}

const toggleForm = (underc, tid, cid, quote) => {

	const { topic, replyto } = CommentForm.elements;
	const   parent           = CommentForm.parentNode;

	let toshow = (parent.style.display === 'none');
	if (quote) {
		let sel = window.getSelection(), msg_bd;
		if(!sel.isCollapsed && underc.contains(sel.anchorNode)) {
			msg_bd = sel.getRangeAt(0).cloneContents();
		} else
			msg_bd = underc.querySelector('[itemprop="articleBody"]') || underc;
		convMsgBody(
			msg_bd
		);
		if (parent.parentNode === underc && !toshow)
			return;
	}
	if (replyto.value != cid) {
		parent.style.display = 'none';
		toshow = true;
	}
	if (toshow) {
		replyto.value = cid;
		topic.value   = tid;
		underc.append(parent);
	}
	CommentForm.dispatchEvent( new CustomEvent('doAction', { detail: toshow ? 'open' : 'close' }) );
}

const preferReactions = (form) => {
	let hide = form.querySelector('.zero-reactions, .zero-reactions-show');
	let user = form.querySelector('.reaction-show-list');
	let show = form.querySelector('.apply-reactions');

	if (!user)
	     user = _setup('span', { class: 'reaction reaction-show-list', text: '?' });
	if (!hide) {
		form.append(
			 user,  _setup('span', { class: 'reaction reaction-show', text: '\u00BB' }),
			(hide = _setup('span', { class: 'zero-reactions-show' }))
		);
		form.parentNode.classList.remove('zero-reactions-show');
	}
	if (!show) {
		 show = form.insertBefore(
			_setup('span', { class: 'apply-reactions' }), user);
		for (const r of form.querySelectorAll('.reaction-count'))
			(Number(r.innerText) > 0 ? show : hide).append(r.parentNode);
	}
	return [show, hide];
}

function onReactionClick(e) {
	let btn = e.target, parent = btn.parentNode;
	let [clss0, clss1] = btn.classList;

	if (clss1 && clss1.startsWith('reaction'))
		clss0 = clss1;

	switch(clss0) {
	case 'reaction-count':
		btn = parent, parent = parent.parentNode;
	case 'reaction':
		const { value, form } = btn;
		if (value && form) {
			const data = new FormData(form); data.append('reaction', value);
			const p = sendFormData('/reactions/ajax', data, 1),
			      i = value.indexOf('-') + 1,
			      f = value.substr(i) !== 'true';

			const [show, hide] = preferReactions(form);

			p.then(({ errors, count }) => {
				if (errors)
					return console.warn(errors.join('\n'));

				btn.lastElementChild.textContent = count.toString();
				btn.value = value.substr(0, i) + f;

				if (f) btn.classList.remove('btn-primary');
				else   btn.classList.add('btn-primary');

				if (count === 0) hide.append(btn); else
				if (count === 1) show.append(btn);
			});
		}
		break;
	case 'reaction-show':
		if (parent.classList.contains('reactions-form')) {
			if((parent = parent.querySelector('.zero-reactions, .zero-reactions-show')))
				parent.classList.toggle('zero-reactions-show');
		} else {
			parent = parent.parentNode.parentNode.parentNode.querySelector('.reactions');
		}
		if (parent)
			parent.classList.toggle('zero-reactions');
		break;
	case 'reaction-show-list':
		let rlist = parent.querySelector('.reactions-list') || parent.insertBefore(
			_setup('pre', { class: 'reactions-list msg hidden', style: 'border: 1px solid darkslategrey;' }), btn
		);
		if (!rlist.classList.toggle('hidden')) {
			let parts = [];
			for (let { value, title } of parent.querySelectorAll('.reaction[title*=":"]')) {
				value = value.substr(0,value.indexOf('-'));
				title = title.substr(title.indexOf(':')).trim();
				parts.push(value + title);
			}
			rlist.textContent = parts.join('\n');
		}
		break;
	default:
		return;
	}
	e.stopPropagation(), e.preventDefault();
}

function handleReplyLinks(msg, cid, refmap = '') {

	const { path, topic } = LOR;

	let self_p = null, no_ref = true;

	for(const a of msg.querySelectorAll('.reply a')) {

		const { pathname, search, parentNode: parent } = a;

		if (pathname === '/comment-message.jsp' || pathname === '/add_comment.jsp') {
			const rep = a.cloneNode();
			const qut = a.cloneNode();

			rep.className = 'link-reply', rep.textContent = 'Ответить';
			qut.className = 'link-quote', qut.textContent = 'с цитатой';
			  a.replaceWith(rep, '\n.\n', qut);
		} else
		if (pathname === '/reactions') {
			parent.className = 'reactions-li';
			a.textContent = '';
		} else
		if (pathname.startsWith(path)) {
			let reid = search.substring('?cid='.length);
			if (topic === cid || reid === cid) {
				a.className = 'link-self', self_p = parent;
				a.textContent = '';
			} else {
				if (reid)
					a.setAttribute('href', `${pathname}/thread/${cid}#comment-${reid}`);
				a.className = 'link-thread', no_ref = false;
				a.textContent = '\nОтветы';
				a.after( refmap );
			}
		}
	}
	if (no_ref && refmap) {
		const a = _setup('a' , { class: 'link-thread', text: '\nОтветы', href: `${path}/thread/${cid}#comments` }),
		     li = _setup('li', { class: 'hidden' });
		if ( !self_p ) {
			(msg.querySelector('.reply > ul') || msg.lastElementChild.lastElementChild.appendChild(
				_setup('ul', { class: 'reply' })
			)).append(li);
		} else
			self_p.before(li);
		li.append(a, refmap);
	}
}

function convMsgBody(msg) {

	let text = '', qt = true, br = '\n\n', reg = /(?:[\n]+){3,}/g;

	if (LORCODE_MODE) { // lorcode, line-break
		let nobl = msg.querySelector('div.code,pre,ul,ol,table');
		      qt = !nobl || nobl.parentNode.className === 'reply';
		    text = domToLORCODE(msg, qt).trim();
		if (LORCODE_MODE === 2)
			br = '\n', reg = /(?:[\n]+){2,}/g
	} else
		text = domToMarkdown(msg).trim(); // markdown
	if (qt)
		text = '>'+ text.replace(reg, br).replace(/\n/g, '\n>');
	else
		text = '[quote]'+ text.replace(reg, br) +'[/quote]';
	
	injectText(text, true);
}

function listToLORCODE(listNodes, type) {

	var text = '';

	for (let li of listNodes) {
		switch (li.tagName) {
			case 'UL':
			case 'OL': text += listToLORCODE(li.children, li.type); break;
			case 'LI': text += '[*]'+ domToLORCODE(li);
		}
	}
	return `[list${ type ? '='+ type : '' }]\n${ text }[/list]\n`;
}

function domToLORCODE({childNodes}, nobl) {

	var text = '';

	for(const el of childNodes) {
		const tag = el.nodeName,
		      chs = el.children,
		      len = chs && chs.length,
		      str = el.textContent.trim();

		switch (tag) {
		case 'B': case 'STRONG': text += `[b]${ domToLORCODE(el, nobl) }[/b]`; break;
		case 'S': case 'DEL'   : text += `[s]${ domToLORCODE(el, nobl) }[/s]`; break;
		case 'I': case 'EM'    : text += `[i]${ domToLORCODE(el, nobl) }[/i]`; break;
		case 'U': /* underline */text += `[u]${ domToLORCODE(el, nobl) }[/u]`; break;
		case 'A':
			let url = decodeURIComponent(el.href);
			text += `[url${ str !== url ? '='+ url : '' }]${ str }[/url]`;
			break;
		case 'SPAN':
			if (el.classList[0] === 'code')
				text += `[inline]${ str }[/inline]`;
			else if (len && chs[0].tagName === 'IMG')
				text += `[user]${ str }[/user]`;
			break;
		case 'DIV':
			if (el.classList[0] === 'code') {
				let lng = chs[len-1].className.replace(/^.+\-(?:highlight|(.+))$/, '$1');
				text += `[code${ lng ? '='+ lng : '' }]\n${ chs[len-1].innerText.replace(/[\n+]$|$/, '') }[/code]\n`;
			} else if (/^cut/.test(el.id))
				text += '\n'+ domToLORCODE(el, nobl); //`[cut]\n${ domToLORCODE(el, nobl) }[/cut]\n`;
			break;
		case 'UL': case 'OL':
			text += listToLORCODE(chs, el.type);
			break;
		case 'BLOCKQUOTE':
			let qtex = domToLORCODE(el, nobl);
			let pass = nobl || (text && /\n|^/.test(text.slice(-1)));
			text += pass ? `>${ qtex.replace(/\n/g, '\n>').replace(/(?:[>]+(?:\n|$)){1,}/gm, '')}` : `[quote]${ qtex.trim() }[/quote]`;
			break;
		case 'PRE': case 'P':
			text += domToLORCODE(el, nobl);
			if (el.nextElementSibling && el.nextElementSibling.tagName == 'P')
				text += '\n';
		case 'BR':
			text += '\n';
			break;
		default:
			text += /^H\d*$/.test(tag) ? `[strong]${ str }[br][/strong]\n` : str;
		}
	}
	return text;
}

function listToMarkdown(listNodes, order = false, deep = 0) {

	var text = '', ln = ' '.repeat(deep) + (order ? '%d. ' : '* ');

	deep += 3;

	for (let i = 0; i < listNodes.length;) {
		let li = listNodes[i++];
		switch (li.tagName) {
			case 'UL': text += listToMarkdown(li.children,false, deep); break;
			case 'OL': text += listToMarkdown(li.children, true, deep); break;
			case 'LI': text += ln.replace('%d', i) + domToMarkdown(li, deep) +'\n';
		}
	}
	return `${ text }\n\n`;
}

function domToMarkdown({childNodes}, deep = 0) {

	var text = '';

	for(const el of childNodes) {
		const tag = el.nodeName,
		      chs = el.children,
		      len = chs && chs.length,
		      str = el.textContent.trim();

		switch (tag) {
		case 'B': case 'STRONG': text += `**${ domToMarkdown(el) }**`; break;
		case 'S': case 'DEL'   : text += `~~${ domToMarkdown(el) }~~`; break;
		case 'I': case 'EM'    : text +=  `*${ domToMarkdown(el) }*` ; break;
		case 'A':
			let url = decodeURIComponent(el.href);
			text += str !== url ? `[${ str }](${ url })` : url;
			break;
		case 'SPAN':
			if (el.classList[0] === 'code')
				text += `\`${ str }\``;
			else if (len && chs[0].tagName === 'IMG')
				text += '@'+ str;
			break;
		case 'DIV':
			if (el.classList[0] === 'code') {
				let lng = chs[len-1].className.replace(/^.+\-(?:highlight|(.+))$/, '$1');
				text += '```'+ lng +'\n'+ chs[len-1].innerText.replace(/[\n+]$|$/, '\n```\n');
			} else if (/^cut/.test(el.id))
				text += domToMarkdown(el); //`>>>\n${ domToMarkdown(el) }\n>>>\n`;
			break;
		case 'BLOCKQUOTE':
			text += '>'+ domToMarkdown(el)
				.replace(/\n/g, '\n>')
				.replace(/([>]+(?:\n|$)){2,}/gm, '$1') +'\n';
			break;
		case 'UL': text += listToMarkdown(chs,false, deep); break;
		case 'OL': text += listToMarkdown(chs, true, deep); break;
		case 'PRE': case 'P':
			text += domToMarkdown(el);
		case 'BR':
			text += '\n\n';
			break;
		default:
			text += (
				tag.charAt(0) === 'H' ? '#'.repeat(Number(tag.substr(1))) +` ${ str }\n\n` : str
			);
		}
	}
	return text;
}

if (document.readyState === 'loading') {
	const _scrollTo = () => {
		let alt = location.hash.substring(1);
		if (alt && Navigation)
			Navigation.goToCommentPage(LOR.cid, alt, true);
		window.removeEventListener('load', _scrollTo);
	};
	document.addEventListener('DOMContentLoaded', onDOMReady);
	window.addEventListener('load', _scrollTo);
} else
	onDOMReady();

function WebExt() {

	let opened;

	const portConnect = resolve => {
		const port = chrome.runtime.connect({ name: 'lory-wss' });
		port.onMessage.addListener(({ action, data }) => {
			switch (action) {
			case 'notes-count-update':
				Dynamic_Style.main_counter = data;
				break;
			case 'scroll-to-comment':
				Navigation.goToCommentPage(data.split('?cid=')[1]);
				break;
			case 'need-codestyles':
				getHLJSStyle('names').then(names => {
					port.postMessage({ action: 'l0rNG-codestyles', data: names });
				});
				break;
			case 'connection-resolve':
				console.info('WebExt Runtime Connected!');
				resolve(port);
			case 'settings-change':
				for (const key in data) {
					Dynamic_Style[key] = USER_SETTINGS[key] = data[key];
				}
			}
		});
		port.onDisconnect.addListener(() => {
			console.info('WebExt Runtime Disconnected!');
			opened = null;
		});
	}
	opened = new Promise(portConnect);

	const sendMessage = (action, data) => {
		if(!opened)
			opened = new Promise(portConnect)
		opened.then(
			port => port.postMessage({ action, data })
		);
	}
	return {
		checkNow : () => sendMessage( 'l0rNG-notes-chk' ),
		openUrl  : al => sendMessage( 'l0rNG-open-tab', 'lor:/'+ al ),
		setNotes : nc => sendMessage( 'l0rNG-notes-set', nc),
		init     : () => opened
	}
}

function UserScript() {

	let notes, ready, lorypanel, lorylist, loryform, granted = false;

	const self = {
		checkNow: () => void 0,
		openUrl : () => true,
		setNotes: () => void 0,
		init    : () => {
			document.body.append(lorypanel);
			return ready;
		}
	}

	const sendNotify = count => {
		if (USER_SETTINGS['Desktop Notification'] && granted) {
			const notif = new Notification('LINUX.ORG.RU', {
				icon: 'data:image/webp;base64,UklGRoIDAABXRUJQVlA4THUDAAAvL8ALELXIsm3btJ36pD5OFYw/2zx77vtabNu2vmzbtn3w1kMBdjzSzB2nsW0kSXGyntlFl/k/5NC2duzRsm3bTiqjs23bTpWUrIyxbbuzZzrbjPXpTECoDsXMiXMqnR7p/+PVO2ll7CpHO6pOidwWWciVl38ShhXnWcsdiss3SamoAczlHeUVSeoq5iEV5xrlF8VJqxCvEEtZFKcKmEhN3pngnKoAyQOG+7nawm7sxFRkjMcmnMYprPV7oBUBntrJLQaRDuMh0n9KwGMt7uMhYow3MBkgN80c21+e9Dxmn8efM4jZNzDYlkAiyMqrYJpX0XIbAZw+K2c7O3w0uQNPQK5ayV2ukEziED+R1YnUbB5SkSXuwWa8/5Bws0nYC54cbaeQoCS5yADmXnFfxjkSA+XahInYgRjjGIB0FZFe5J/TPpFahlcB9xEvozZqoD5ijItbFnbsaLgaE2Mz1EQnxBgHA2RHEWkG5LbnnnKG4Xt8gNHYip8xHito+NPg522fhZj9AB4CcqeIEwAgq15LO6ohyBW4iZitibdv37a8yPkOyEKRIDdJy30JD/IT7iDrXkDXjbdv336+E5J1DwAlrkW8hAyQt1CGB8iKV2I6HDT4afEwY+RuQFYcCkCqijykIs+zgAmI+RcSFrXciIj5cwHIhSJB0gssR4HiewDIludQ5CEVeZR3AEZ3MQCA7C8SnMScf3dgFN8DOBlFgtzJmopovR4p+S9+RRJhomSsg9kepJBPZewKBNmdsQVme5GBvBjAqEAZS1lI/Tfbhyzkdk96ecFpT22F2cccfg+jnTeRmlwF1sBsHTEP7+hDKjmhL2O5IjCXaDbLAsg3kTJwevKClwoDCPdhNdAmOLmetbT9FgEQKRGdlzCUDTgMo7MA/ocQfkm6DHpzTwcwzwtyEBbAaBVAHgXL/jxEhBMwuY2BACkwCV9hEt5YrAV4r9tRt/ntfIeFMDhOEZlfJbHB2IkXBV48QHnOkwdYAGc4mHsDwFRcRbFjhJJVkJMTqdkFZwYYiNW4jLwrWE76BfJ5CINgL6Gyh7TH8xXYjj02d1vdaXWtjUk2PpKWNwlfsxIvETCVJVmRMbN2NJ0G6Zf7ObIqv+S9/P/xQ2TkpbxDhkKFOnHvnHs888YHMA/ZXrCc9goH0OjPox31igkhYS9dnk+oXgEA',
				body: `\n${ count } новых сообщений`,
			});
			notif.onclick = () => { window.focus() };
		}
	}

	const checkNow = () => Timer.set(
		'Check Notifications',
		getDataResponse.bind(null, '/notifications-count',
		( response ) => {
			let count = Number(response);
			if (count > notes)
				sendNotify(count);
			setNotes(count);
		}),
	1300); /*  */ self.checkNow = checkNow;

	const setNotes = (count, save = true) => {
		const lorynotify = lorypanel.children.lorynotify;
		Dynamic_Style.main_counter = (notes = count);
		if (save)
			localStorage.setItem('l0rNG-notes', count);
		if (!count) {
			lorynotify.removeAttribute('cnt-new');
			lorynotify.classList.remove('pushed');
			getNotesList(-1).remove();
		} else {
			if (lorynotify.classList.contains('pushed'))
				getNotesList(count);
			lorynotify.setAttribute('cnt-new', count);
		}
	}; /*  */ self.setNotes = setNotes;

	const setValues = items => {
		for (const name in Object.assign(USER_SETTINGS, items)) {
			 const type  = loryform.elements[name].type,
			       param = type === 'checkbox' ? 'checked' : type === 'select-one' ? 'selectedIndex' : 'value';
			Dynamic_Style[name] = loryform.elements[name][ param ] = USER_SETTINGS[name];
		}
	}

	const saveParams = changes => {
		loryform.classList.add('save-msg');
		localStorage.setItem('lorify-ng', JSON.stringify(changes));
	}

	const onValueChange = input => {
		switch (input.type) {
			case 'checkbox':
				USER_SETTINGS[input.id] = input.checked;
				break;
			default:
				const min = Number (input.min || 0);
				const val = input.type === 'select-one' ? input.selectedIndex : Number (input.value);
				Dynamic_Style[input.id] = USER_SETTINGS[input.id] = val >= min ? val : (input.value = min);
		}
		saveParams(USER_SETTINGS);
	}

	const getNotesList = (max) => {
		let empty = true;

		if(!lorylist) {
			lorylist = _setup('div', { class: 'lorify-notes-panel'});
			lorylist.append(
				_setup('label', { class: 'note-clear lory-btn', for: 'do_reset', text: 'Очистить уведомления' })
			);
		} else {
			let list = lorylist.children.notifications;
			if (list && (empty = list.children.length !== max))
				list.remove();
		}
		if (max > 0 && empty) {
			getDataResponse('/notifications', html => {
				const doc = new DOMParser().parseFromString(html, 'text/html'),
					  tab = doc.querySelector('.notifications'),
					new_rf= doc.forms.reset_form;
				if (new_rf) {
					const isNf = location.pathname !== '/notifications';
					let old_rf = document.forms.reset_form;
					if (old_rf) {
						old_rf.elements.topId.value = new_rf.elements.topId.value;
						old_rf.parentNode.hidden = isNf;
					} else {
						const bd = isNf ? lorylist : document.getElementById('bd');
						handleResetForm(new_rf);
						bd.insertBefore(new_rf.parentNode, bd.children[2]).hidden = isNf;
					}
				}
				for (let i = 0; i < max; i++) {
					const anc = tab.children[i], [,info,warn,user] = anc.children,
					     tags = warn.firstElementChild,
					     time = user.firstElementChild.lastElementChild,
					     ftag = tags && tags.firstElementChild;
					anc.className = 'link-navs '+ anc.className.replace('notifications-', 'notify-');
					anc.target = '_blank';
					if (!ftag) {
						 if(warn.innerText.trim())
							user.className = 'notifications-mod-warn',
							user.replaceChild(tags, user.firstElementChild);
					} else if (ftag.className === 'reactions') {
						info.firstElementChild.appendChild(ftag).style.display = 'block';
					} else if (ftag.className === 'tag')
						info.appendChild(tags).className = 'notify-tags';
						user.appendChild(time).className = 'notify-time';
					ContentFinder.localizeTime(time, 'interval');
				}
				tab.id = 'notifications';
				tab.className = 'notify-list';
				while (tab.children[max])
					   tab.children[max].remove();
				lorylist.append(tab);
			});
		}
		return lorylist;
	}

ready = new Promise(resolve => {

	notes = Number(localStorage.getItem('l0rNG-notes'));
	const defaults = Object.assign({}, USER_SETTINGS);

	loryform = _setup('form', { id: 'loryform', class: 'tab-gt', html: `
	<div class="tab-row">
		<span class="tab-cell">Автоподгрузка комментариев:</span>
		<span class="tab-cell"><input type="checkbox" id="Realtime Loader"></span>
	</div>
	<div class="tab-row">
		<span class="tab-cell">Укорачивать блоки кода свыше:</span>
		<span class="tab-cell" chr="px"><input type="number" id="Code Block Short Size" min="0" step="1"></span>
	</div>
	<div class="tab-row">
		<span class="tab-cell">Стиль подсветки кода:</span>
		<span class="tab-cell"><select id="Code Highlight Style"></select></span>
	</div>
	<div class="tab-row">
		<span class="tab-cell">Задержка появления / исчезновения превью:</span>
		<span class="tab-cell" chr="мс">
			<input type="number" id="Delay Open Preview" min="50" step="25">
			/
			<input type="number" id="Delay Close Preview" min="50" step="25">
		</span>
	</div>
	<div class="tab-row">
		<span class="tab-cell">Предзагружаемых страниц:</span>
		<span class="tab-cell" chr="ст"><input type="number" id="Preloaded Pages Count" min="1" step="1"></span>
	</div>
	<div class="tab-row">
		<span class="tab-cell">Оповещения на рабочий стол:</span>
		<span class="tab-cell"><input type="checkbox" id="Desktop Notification"></span>
	</div>
	<div class="tab-row">
		<span class="tab-cell">Просмотр картинок:</span>
		<span class="tab-cell">
			<select id="Picture Viewer">
				<option>Откл.</option>
				<option>Только для превью</option>
				<option>Для превью и ссылок</option>
			</select>
		</span>
	</div>
	<div class="tab-row">
		<span class="tab-cell">Задержка перед отправкой:</span>
		<span class="tab-cell step-line">
			<input type="range" min="0" max="9" step="1" id="Upload Post Delay">
			<st></st><st></st><st></st><st></st><st></st><st></st><st></st><st></st><st></st><st></st>
		</span>
	</div>
	<div class="tab-row">
		<span class="tab-cell">Перемещать в начало страницы:</span>
		<span class="tab-cell"><input type="checkbox" id="Scroll Top View"></span>
	</div>
	<div class="tab-row">
		<span class="tab-cell">CSS анимация:</span>
		<span class="tab-cell"><input type="checkbox" id="CSS3 Animation">
			<button type="button" id="reset-setts" title="вернуть настройки по умолчанию">сброс</button>
		</span>
	</div>`}, {
		animationend: () => {
			loryform.classList.remove('save-msg');
		},
		change: ({ target }) => {
			if (!target.hasAttribute('input-hold'))
				onValueChange(target);
		},
		input : ({ target }) => {
			target.setAttribute('input-hold','');
			Timer.set('Settings on Changed', () => {
				target.removeAttribute('input-hold');
				onValueChange(target);
			}, 750)
		}
	});

	setValues( JSON.parse(localStorage.getItem('lorify-ng')) );

	getHLJSStyle('names').then(names => {
		const input = loryform.elements['Code Highlight Style'];
		input.append.apply(input, names.map(text => _setup('option', { text })));
		input.selectedIndex = USER_SETTINGS['Code Highlight Style'];
	});

	lorypanel = _setup('div', { class: 'lorify-settings-panel', html: `
	<svg id="loriko-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
	  <path id="loriko-belly" fill="snow" d="m14.2 8 9.4-3.2 10.2 2.8 3.7 15-1.9 12.8-6.4 6-11 .2-5.6-5.5-2.5-10Z"/>
	  <path id="loriko-body" fill="#2a1725" d="M8.8 31.1c.5 3.7 3 7.1 5.6 9.7-1.7 0-3.3 1.3-4.1 2.2-1 1.1 0 1.4 2 1.4 0 1.4.4 1 2.3 1.4 0 2 2.4.5 5.5-1.4a89 89 0 0 1 9-.1c2.7 2.6 4.4 3.2 4.7 1.2 2.5.4 2.6-.3 2.8-2 5 2 .8-3.1-2.6-3.2a16 16 0 0 0 5-9c1.2.5 8.1 3.3 9 1.1.3-.8-.8-2-1.3-2.7-1.5-2.1-6.3-5.3-7.3-7.7-1.7-4.2-1.3-8.8-2.8-13-2.3-6.3-6-9-12.6-9-6.7 0-9.6 2.6-12 9-1.4 4-1.4 8.3-3 12.5-1 2.4-6.2 6.1-7.7 8.2-.5.6-1.6 1.9-1.2 2.7.8 2.2 1.9 1 3.2.5m15-26C21 6.8 22 9.2 24 9.2c1 0 2.1-1.3 3-1.8a5 5 0 0 1 6 1.1c3 3.5 1 7.3 1.4 11.2.2 2 1.5 3.9 1.6 6 .6 7.3-2.5 13.8-10 14.7-8 .8-14-3.7-14.3-12-.1-3 1.4-5.5 1.7-8.3.4-5-2.1-12.3 5.6-13"/>
	  <path id="loriko-nose" fill="#9c6c6c" d="m23 16.2 3 .6.2 3-2.7 1.2-2-2.3z" paint-order="fill markers stroke"/>
	  <path id="loriko-eyes" fill="none" stroke="#000" d="M16.3 16.6c.9-.2 1.8-.4 2.7-.4m9.6-.4c.7.2 1.9-.3 2.4.2"/>
	</svg>
	<div id="lorynotify" class="lory-btn"></div>
	<div id="lorytoggle" class="lory-btn"></div>
	<style>
		#lorynotify {
			top: -5px; left: -3px;
			color: white;
			font: bold 16px "Open Sans";
			background-color: #3e85a8;
			border-radius: 5px;
			z-index: 1;
		}
		#lorynotify[cnt-new]:before {
			content: attr(cnt-new);
			padding: 0 4px;
		}
		#lorytoggle {
			left: 0; top: 0;
			right: 0; bottom: 0;
		}
		#loriko-svg {
			width: 40px;
			margin: 2px;
		}
		#loryform {
			min-width: 360px;
			right: 5px;
			top: 5px;
			padding: 4px 6px;
		}
		#loryform, .lorify-notes-panel {
			background: #eee;
			border-radius: 5px;
			box-shadow: -1px 2px 8px rgba(0,0,0,.3);
			position: fixed;
		}
		#loryform .tab-cell {
			padding: 4px 2px;
			max-width: 180px;
		}
		#loryform .tab-row, .lorify-notes-panel {
			font-size: 85%;
			color: #666;
		}
		.lorify-notes-panel {
			top: 5px;
			right: 34px;
			overflow: hidden auto;
			max-height: 100%;
		}
		.lorify-notes-panel > * {
			padding: 6px 8px;
		}
		.lorify-notes-panel > .lory-btn:hover,
		.notify-item:hover {
			background: #e1e1e1;
		}
		.note-clear {
			display: block;
			text-align: center;
			font-size: 18px;
			color: #299a7b;
			text-decoration: underline dashed;
		}
		.notify-item:before {
			content:"";
			position: absolute;
			left: 0; right: 0;
			top: 0; bottom: 0;
			display: block;
		}
		.notify-item > * {
			padding: 5px 0 0 12px;
			max-width: 360px;
		}
		.notify-item > .notifications-who-when   { color: #03b71f; font-weight: bold; }
		.notify-item > .notifications-mod-warn p { color: #f00; }
		.notify-item > .notifications-who-when s { color: #6b747d; }
		.notify-item,  #notifications a:visited  { color: #31aea8; }
		.notify-time, .notify-tags {
			position: absolute;
			margin: 0; bottom: 0;
		}
		.notify-item .reaction { font: bold 14px caption; padding: 1px 5px; }
		.notify-time           { font: bold 14px monospace; background-color: #aa512e; }
		.notify-tags .tag      { font: bold 12px monospace; background-color: slategray; }
		.notify-tags .tag,
		.notify-time {
			color: white;
			white-space: nowrap;
			border-radius: 3px 3px 0 0;
			padding: 1px 3px;
		}
		.lorify-settings-panel {
			position: fixed;
			top: 5px;
			right: 5px;
		}
		.lorify-settings-panel:hover #loriko-body, #loryform ~ * #loriko-body { fill: #949494; }
		.lorify-settings-panel:hover #loriko-belly, #loryform ~ * #loriko-belly { fill: white; }
		.lory-btn { cursor: pointer; }
		.tab-gt  , .notify-list    { display: table; }
		.tab-row , .notify-item    { display: table-row;  position: relative; }
		.tab-cell, .notify-item >* { display: table-cell; vertical-align: middle; }
		#loryform select { width: 160px; }
		#loryform input[type="number"] { width: 60px; }
		.tab-cell[chr]:after {
			content: attr(chr) ".";
			font: italic 14px serif;
		}
		.step-line, .step-line > input {
			counter-reset: stepIdx -1;
			width: 180px;
		}
		st:before, .step-line > input, #lorynotify, #lorytoggle {
			position: absolute;
		}
		st + st {
			margin-left: 10%;
		}
		st {
			padding: 5px 0;
			border: 0 solid #ccc;
			counter-increment: stepIdx;
			border-left-width: 1px;
		}
		st:before {
			content: counter(stepIdx);
			font: italic 10px Arial;
		}
		#loginGreating, #topProfile { margin-right: 60px!important; }
		#reset-setts, #loryform:before { position: absolute; right: 0; }
		#loryform:before {
			-webkit-animation: 2s ease-in 2 alternate showIn;
			animation: 2s ease-in 2 alternate showIn;
			color: #d25555;
			background-color: white;
			left: 0; top: 0;
			z-index: 9;
		}
		.save-msg:before {
			content: 'Настройки сохранены.';
			padding: 15px 0;
			text-align: center;
		}
		@media screen and (max-width: 570px) {
			#loryform, .lorify-notes-panel { right: 0; }
			#lorynotify.pushed { border-radius: 0 0 5px 5px; padding: 2px 6px; }
			#loriko-svg { width: 28px; margin: 1px; }
		}
	</style>`}, {
		click: e => {
			const btn = e.target,
			   pannel = btn.id === 'lorynotify' ? getNotesList(notes) :
			            btn.id === 'lorytoggle' ? loryform : null;
			if (pannel) {
				if (btn.classList.toggle('pushed')) {
					ContentNode.append(pannel);
				} else
					pannel.remove();
			}
		}
	});
	loryform.querySelector('#reset-setts').addEventListener('click', () => {
		setValues( defaults );
		saveParams( defaults );
	});
	window.addEventListener('storage', ({ key, newValue }) => {
		switch(key) {
		case 'lorify-ng':
			setValues( JSON.parse( newValue ) );
			break;
		case 'l0rNG-notes':
			Timer.delete('Check Notifications');
			setNotes ( Number(newValue), false);
			break;
		}
	});

	(permission => {
		// Определяем статус оповещений:
		granted = (permission === 'granted'); // - разрешены

		if (permission === 'default') {
			// - требуется подтверждение
			Notification.requestPermission(p => {
				granted = (p === 'granted');
			});
		}
	})( window.Notification ? Notification.permission : 'denied' );

resolve() });

	return self;
}





/*
  Highlight.js 10.1.1 (ea62ab20)
  License: BSD-3-Clause
  Copyright (c) 2006-2020, Ivan Sagalaev
*/
function HighlightJS(params) {
	'use strict';
 
	const hljs = this;
 
	class Response {
	   constructor(mode) {
		  this.data = mode.data || {};
	   }
	   ignoreMatch() {
		  this.ignore = true;
	   }
	}
 
	const tagName = el => el.localName;
	const escapeChar = str => new RegExp(str.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'm');
	const escapeHTML = val => val
	   .replace(/&/g, '&amp;')
	   .replace(/</g, '&lt;')
	   .replace(/>/g, '&gt;')
	   .replace(/"/g, '&quot;')
	   .replace(/'/g, '&#x27;');
 
	const toSource = r => (!r ? '' : typeof r === 'string' ? r : r.source);
	const concatStr = (...args) => args.map(x => toSource(x)).join('');
	//Any of the passed expresssions may match
	const lookahead = r => concatStr('(?=', r, ')');
	const either = (...args) => `(${args.map((x) => concatStr(x)).join('|')})`;
 
	const countMatchGroups = r => (new RegExp(r.toString() + '|')).exec('').length - 1;
 
	//Does lexeme start with a regular expression match at the beginning
	function startsWith(re, lexeme) {
	   var match = re && re.exec(lexeme);
	   return match && match.index === 0;
	}
 
	//performs a shallow merge of multiple objects into one
	function inherit(original, ...objects) {
	   var result = {};
 
	   for (const key in original) {
		  result[key] = original[key];
	   }
	   objects.forEach(function (obj) {
		  for (const key in obj) {
			 result[key] = obj[key];
		  }
	   });
	   return result;
	}
 
	/* Stream merging */
	function nodeStream(node) {
	   var result = [];
	   (function _nodeStream(node, offset) {
		  for (var child = node.firstChild; child; child = child.nextSibling) {
			 if (child.nodeType === 3) {
				offset += child.nodeValue.length;
			 } else if (child.nodeType === 1) {
				result.push({
				   event: 'start',
				   offset: offset,
				   node: child
				});
				offset = _nodeStream(child, offset);
				// Prevent void elements from having an end tag that would actually
				// double them in the output. There are more void elements in HTML
				// but we list only those realistically expected in code display.
				if (!tagName(child).match(/br|hr|img|input/)) {
				   result.push({
					  event: 'stop',
					  offset: offset,
					  node: child
				   });
				}
			 }
		  }
		  return offset;
	   })(node, 0);
	   return result;
	}
 
	function mergeStreams(original, highlighted, value) {
	   var processed = 0;
	   var result = '';
	   var nodeStack = [];
 
	   function selectStream() {
		  if (!original.length || !highlighted.length) {
			 return original.length ? original : highlighted;
		  }
		  if (original[0].offset !== highlighted[0].offset) {
			 return (original[0].offset < highlighted[0].offset) ? original : highlighted;
		  }
		  //To avoid starting the stream just before it should stop the order is
		  // ensured that original always starts first and closes last:
		  return highlighted[0].event === 'start' ? original : highlighted;
	   }
 
	   function open(node) {
		  function attr_str(attr) {
			 return ' ' + attr.nodeName + '="' + escapeHTML(attr.value) + '"';
		  }
		  result += '<' + tagName(node) + [].map.call(node.attributes, attr_str).join('') + '>';
	   }
 
	   function close(node) {
		  result += '</' + tagName(node) + '>';
	   }
 
	   function render(event) {
		  (event.event === 'start' ? open : close)(event.node);
	   }
 
	   while (original.length || highlighted.length) {
		  var stream = selectStream();
		  result += escapeHTML(value.substring(processed, stream[0].offset));
		  processed = stream[0].offset;
		  if (stream === original) {
			 /* On any opening or closing tag of the original markup we first close
			 the entire highlighted node stack, then render the original tag along
			 with all the following original tags at the same offset and then
			 reopen all the tags on the highlighted stack.
			 */
			 nodeStack.reverse().forEach(close);
			 do {
				render(stream.splice(0, 1)[0]);
				stream = selectStream();
			 } while (stream === original && stream.length && stream[0].offset === processed);
			 nodeStack.reverse().forEach(open);
		  } else {
			 if (stream[0].event === 'start') {
				nodeStack.push(stream[0].node);
			 } else {
				nodeStack.pop();
			 }
			 render(stream.splice(0, 1)[0]);
		  }
	   }
	   return result + escapeHTML(value.substr(processed));
	}
 
	//Determines if a node needs to be wrapped in <span>
	const emitsWrappingTags = (node) => {
	   return !!node.kind;
	};
 
	class HTMLRenderer {
	   //Creates a new HTMLRenderer
	   constructor(parseTree, options) {
		  this.buffer = "";
		  this.classPrefix = options.classPrefix;
		  parseTree.walk(this);
	   }
	   //Adds texts to the output stream
	   addText(text) {
		  this.buffer += escapeHTML(text);
	   }
	   //Adds a node open to the output stream (if needed)
	   openNode(node) {
		  if (!emitsWrappingTags(node)) return;
		  let className = node.kind;
		  if (!node.sublanguage) {
			 className = `${this.classPrefix}${className}`;
		  }
		  this.span(className);
	   }
	   //Adds a node close to the output stream (if needed)
	   closeNode(node) {
		  if (!emitsWrappingTags(node)) return;
		  this.buffer += '</span>';
	   }
	   //returns the accumulated buffer
	   value() {
		  return this.buffer;
	   }
	   //Builds a span element
	   span(className) {
		  this.buffer += `<span class="${className}">`;
	   }
	}
 
	class TokenTree {
	   constructor() {
		  this.rootNode = { children: [] };
		  this.stack = [this.rootNode];
	   }
	   get top() {
		  return this.stack[this.stack.length - 1];
	   }
	   get root() { return this.rootNode; }
 
	   add(node) {
		  this.top.children.push(node);
	   }
	   openNode(kind) {
		  const node = { kind, children: [] };
		  this.add(node);
		  this.stack.push(node);
	   }
	   closeNode() {
		  if (this.stack.length > 1) {
			 return this.stack.pop();
		  }
		  // eslint-disable-next-line no-undefined
		  return undefined;
	   }
	   closeAllNodes() {
		  while (this.closeNode());
	   }
	   toJSON() {
		  return JSON.stringify(this.rootNode, null, 4);
	   }
	   walk(builder) {
		  // this does not
		  return this.constructor._walk(builder, this.rootNode);
		  // this works
		  // return TokenTree._walk(builder, this.rootNode);
	   }
	   static _walk(builder, node) {
		  if (typeof node === "string") {
			 builder.addText(node);
		  } else if (node.children) {
			 builder.openNode(node);
			 node.children.forEach((child) => this._walk(builder, child));
			 builder.closeNode(node);
		  }
		  return builder;
	   }
	   static _collapse(node) {
		  if (typeof node === "string") return;
		  if (!node.children) return;
 
		  if (node.children.every(el => typeof el === "string")) {
			 // node.text = node.children.join("");
			 // delete node.children;
			 node.children = [node.children.join("")];
		  } else {
			 node.children.forEach((child) => {
				TokenTree._collapse(child);
			 });
		  }
	   }
	}
 
	/**
	  Currently this is all private API, but this is the minimal API necessary
	  that an Emitter must implement to fully support the parser.
 
	  Minimal interface:
 
	  - addKeyword(text, kind)
	  - addText(text)
	  - addSublanguage(emitter, subLanguageName)
	  - finalize()
	  - openNode(kind)
	  - closeNode()
	  - closeAllNodes()
	  - toHTML()
	*/
	class TokenTreeEmitter extends TokenTree {
	   constructor(options) {
		  super();
		  this.options = options;
	   }
	   addKeyword(text, kind) {
		  if (text === "") { return; }
 
		  this.openNode(kind);
		  this.addText(text);
		  this.closeNode();
	   }
	   addText(text) {
		  if (text === "") { return; }
 
		  this.add(text);
	   }
	   addSublanguage(emitter, name) {
		  const node = emitter.root;
		  node.kind = name;
		  node.sublanguage = true;
		  this.add(node);
	   }
	   toHTML() {
		  const renderer = new HTMLRenderer(this, this.options);
		  return renderer.value();
	   }
	   finalize() {
		  return true;
	   }
	}
 
	// join logically computes regexps.join(separator), but fixes the
	// backreferences so they continue to match.
	// it also places each individual regular expression into it's own
	// match group, keeping track of the sequencing of those match groups
	// is currently an exercise for the caller. :-)
	function join(regexps, separator = "|") {
	   // backreferenceRe matches an open parenthesis or backreference. To avoid
	   // an incorrect parse, it additionally matches the following:
	   // - [...] elements, where the meaning of parentheses and escapes change
	   // - other escape sequences, so we do not misparse escape sequences as
	   //   interesting elements
	   // - non-matching or lookahead parentheses, which do not capture. These
	   //   follow the '(' with a '?'.
	   var backreferenceRe = /\[(?:[^\\\]]|\\.)*\]|\(\??|\\([1-9][0-9]*)|\\./;
	   var numCaptures = 0;
	   var ret = '';
	   for (var i = 0; i < regexps.length; i++) {
		  numCaptures += 1;
		  var offset = numCaptures;
		  var re = toSource(regexps[i]);
		  if (i > 0) {
			 ret += separator;
		  }
		  ret += "(";
		  while (re.length > 0) {
			 var match = backreferenceRe.exec(re);
			 if (match == null) {
				ret += re;
				break;
			 }
			 ret += re.substring(0, match.index);
			 re = re.substring(match.index + match[0].length);
			 if (match[0][0] === '\\' && match[1]) {
				// Adjust the backreference.
				ret += '\\' + String(Number(match[1]) + offset);
			 } else {
				ret += match[0];
				if (match[0] === '(') {
				   numCaptures++;
				}
			 }
		  }
		  ret += ")";
	   }
	   return ret;
	}
 
	// Common regexps
	const IDENT_RE = '[a-zA-Z]\\w*';
	const UNDERSCORE_IDENT_RE = '[a-zA-Z_]\\w*';
	const NUMBER_RE = '\\b\\d+(\\.\\d+)?';
	const C_NUMBER_RE = '(-?)(\\b0[xX][a-fA-F0-9]+|(\\b\\d+(\\.\\d*)?|\\.\\d+)([eE][-+]?\\d+)?)'; // 0x..., 0..., decimal, float
	const BINARY_NUMBER_RE = '\\b(0b[01]+)'; // 0b...
	const RE_STARTERS_RE = '!|!=|!==|%|%=|&|&&|&=|\\*|\\*=|\\+|\\+=|,|-|-=|/=|/|:|;|<<|<<=|<=|<|===|==|=|>>>=|>>=|>=|>>>|>>|>|\\?|\\[|\\{|\\(|\\^|\\^=|\\||\\|=|\\|\\||~';
	const SHEBANG = (opts = {}) => {
	   const beginShebang = /^#![ ]*\//;
	   if (opts.binary) {
		  opts.begin = concatStr(
			 beginShebang,
			 /.*\b/,
			 opts.binary,
			 /\b.*/);
	   }
	   return inherit({
		  className: 'meta',
		  begin: beginShebang,
		  end: /$/,
		  relevance: 0,
		  /** @type {ModeCallback} */
		  "on:begin": (m, resp) => {
			 if (m.index !== 0) resp.ignoreMatch();
		  }
	   }, opts);
	};
 
	// Common modes
	const BACKSLASH_ESCAPE = {
	   begin: '\\\\[\\s\\S]', relevance: 0
	};
	const APOS_STRING_MODE = {
	   className: 'string',
	   begin: '\'',
	   end: '\'',
	   illegal: '\\n',
	   contains: [BACKSLASH_ESCAPE]
	};
	const QUOTE_STRING_MODE = {
	   className: 'string',
	   begin: '"',
	   end: '"',
	   illegal: '\\n',
	   contains: [BACKSLASH_ESCAPE]
	};
	const PHRASAL_WORDS_MODE = {
	   begin: /\b(a|an|the|are|I'm|isn't|don't|doesn't|won't|but|just|should|pretty|simply|enough|gonna|going|wtf|so|such|will|you|your|they|like|more)\b/
	};
	//Creates a comment mode
	const COMMENT = function (begin, end, modeOptions = {}) {
	   var mode = inherit(
		  {
			 className: 'comment',
			 begin,
			 end,
			 contains: []
		  },
		  modeOptions
	   );
	   mode.contains.push(PHRASAL_WORDS_MODE);
	   mode.contains.push({
		  className: 'doctag',
		  begin: '(?:TODO|FIXME|NOTE|BUG|OPTIMIZE|HACK|XXX):',
		  relevance: 0
	   });
	   return mode;
	};
	const C_LINE_COMMENT_MODE = COMMENT('//', '$');
	const C_BLOCK_COMMENT_MODE = COMMENT('/\\*', '\\*/');
	const HASH_COMMENT_MODE = COMMENT('#', '$');
	const NUMBER_MODE = {
	   className: 'number',
	   begin: NUMBER_RE,
	   relevance: 0
	};
	const C_NUMBER_MODE = {
	   className: 'number',
	   begin: C_NUMBER_RE,
	   relevance: 0
	};
	const BINARY_NUMBER_MODE = {
	   className: 'number',
	   begin: BINARY_NUMBER_RE,
	   relevance: 0
	};
	const CSS_NUMBER_MODE = {
	   className: 'number',
	   begin: NUMBER_RE + '(' +
		  '%|em|ex|ch|rem' +
		  '|vw|vh|vmin|vmax' +
		  '|cm|mm|in|pt|pc|px' +
		  '|deg|grad|rad|turn' +
		  '|s|ms' +
		  '|Hz|kHz' +
		  '|dpi|dpcm|dppx' +
		  ')?',
	   relevance: 0
	};
	const REGEXP_MODE = {
	   // this outer rule makes sure we actually have a WHOLE regex and not simply
	   // an expression such as:
	   //
	   //     3 / something
	   //
	   // (which will then blow up when regex's `illegal` sees the newline)
	   begin: /(?=\/[^/\n]*\/)/,
	   contains: [{
		  className: 'regexp',
		  begin: /\//,
		  end: /\/[gimuy]*/,
		  illegal: /\n/,
		  contains: [
			 BACKSLASH_ESCAPE,
			 {
				begin: /\[/,
				end: /\]/,
				relevance: 0,
				contains: [BACKSLASH_ESCAPE]
			 }
		  ]
	   }]
	};
	const TITLE_MODE = {
	   className: 'title',
	   begin: IDENT_RE,
	   relevance: 0
	};
	const UNDERSCORE_TITLE_MODE = {
	   className: 'title',
	   begin: UNDERSCORE_IDENT_RE,
	   relevance: 0
	};
	const METHOD_GUARD = {
	   // excludes method names from keyword processing
	   begin: '\\.\\s*' + UNDERSCORE_IDENT_RE,
	   relevance: 0
	};
 
	/**
	 * Adds end same as begin mechanics to a mode
	 *
	 * Your mode must include at least a single () match group as that first match
	 * group is what is used for comparison
	 */
	const END_SAME_AS_BEGIN = function (mode) {
	   return Object.assign(mode,
		  {
			 /** @type {ModeCallback} */
			 'on:begin': (m, resp) => { resp.data._beginMatch = m[1]; },
			 /** @type {ModeCallback} */
			 'on:end': (m, resp) => { if (resp.data._beginMatch !== m[1]) resp.ignoreMatch(); }
		  });
	};
 
	const MODES = Object.freeze({
	   __proto__: null,
	   IDENT_RE, UNDERSCORE_IDENT_RE, NUMBER_RE,
	   C_NUMBER_RE, BINARY_NUMBER_RE, RE_STARTERS_RE,
	   SHEBANG,
	   BACKSLASH_ESCAPE, APOS_STRING_MODE,
	   QUOTE_STRING_MODE, PHRASAL_WORDS_MODE,
	   COMMENT,
	   C_LINE_COMMENT_MODE, C_BLOCK_COMMENT_MODE,
	   HASH_COMMENT_MODE, NUMBER_MODE,
	   C_NUMBER_MODE, BINARY_NUMBER_MODE,
	   CSS_NUMBER_MODE, REGEXP_MODE, TITLE_MODE,
	   UNDERSCORE_TITLE_MODE, METHOD_GUARD,
	   END_SAME_AS_BEGIN
	});
 
	// keywords that should have no default relevance value
	var COMMON_KEYWORDS = 'of and for in not or if then'.split(' ');
 
	/**
	 * Compiles a language definition result
	 *
	 * Given the raw result of a language definition (Language), compiles this so
	 * that it is ready for highlighting code.
	 */
	function compileLanguage(language) {
	   //Builds a regex with the case sensativility of the current language
	   function langRe(value, global) {
		  return new RegExp(
			 toSource(value),
			 'm' + (language.case_insensitive ? 'i' : '') + (global ? 'g' : '')
		  );
	   }
 
	   /**
		 Stores multiple regular expressions and allows you to quickly search for
		 them all in a string simultaneously - returning the first match.  It does
		 this by creating a huge (a|b|c) regex - each individual item wrapped with ()
		 and joined by `|` - using match groups to track position.  When a match is
		 found checking which position in the array has content allows us to figure
		 out which of the original regexes / match groups triggered the match.
 
		 The match object itself (the result of `Regex.exec`) is returned but also
		 enhanced by merging in any meta-data that was registered with the regex.
		 This is how we keep track of which mode matched, and what type of rule
		 (`illegal`, `begin`, end, etc).
	   */
	   class MultiRegex {
		  constructor() {
			 this.matchIndexes = {};
			 this.regexes = [];
			 this.matchAt = 1;
			 this.position = 0;
		  }
		  addRule(re, opts) {
			 opts.position = this.position++;
			 this.matchIndexes[this.matchAt] = opts;
			 this.regexes.push([opts, re]);
			 this.matchAt += countMatchGroups(re) + 1;
		  }
		  compile() {
			 if (this.regexes.length === 0) {
				// avoids the need to check length every time exec is called
				this.exec = () => null;
			 }
			 const terminators = this.regexes.map(el => el[1]);
			 this.matcherRe = langRe(join(terminators), true);
			 this.lastIndex = 0;
		  }
		  exec(s) {
			 this.matcherRe.lastIndex = this.lastIndex;
			 const match = this.matcherRe.exec(s);
			 if (!match) { return null; }
 
			 // eslint-disable-next-line no-undefined
			 const i = match.findIndex((el, i) => i > 0 && el !== undefined);
			 const matchData = this.matchIndexes[i];
			 // trim off any earlier non-relevant match groups (ie, the other regex
			 // match groups that make up the multi-matcher)
			 match.splice(0, i);
 
			 return Object.assign(match, matchData);
		  }
	   }
 
 /*
   Created to solve the key deficiently with MultiRegex - there is no way to
   test for multiple matches at a single location.  Why would we need to do
   that?  In the future a more dynamic engine will allow certain matches to be
   ignored.  An example: if we matched say the 3rd regex in a large group but
   decided to ignore it - we'd need to started testing again at the 4th
   regex... but MultiRegex itself gives us no real way to do that.
 
   So what this class creates MultiRegexs on the fly for whatever search
   position they are needed.
 
   NOTE: These additional MultiRegex objects are created dynamically.  For most
   grammars most of the time we will never actually need anything more than the
   first MultiRegex - so this shouldn't have too much overhead.
 
   Say this is our search group, and we match regex3, but wish to ignore it.
 
   regex1 | regex2 | regex3 | regex4 | regex5    ' ie, startAt = 0
 
   What we need is a new MultiRegex that only includes the remaining
   possibilities:
 
   regex4 | regex5                               ' ie, startAt = 3
 
   This class wraps all that complexity up in a simple API... `startAt` decides
   where in the array of expressions to start doing the matching. It
   auto-increments, so if a match is found at position 2, then startAt will be
   set to 3.  If the end is reached startAt will return to 0.
 
   MOST of the time the parser will be setting startAt manually to 0.
 */
	   class ResumableMultiRegex {
		  constructor() {
			 this.rules = [];
			 this.multiRegexes = [];
			 this.count = 0;
 
			 this.lastIndex = 0;
			 this.regexIndex = 0;
		  }
 
		  getMatcher(index) {
			 if (this.multiRegexes[index]) return this.multiRegexes[index];
 
			 const matcher = new MultiRegex();
			 this.rules.slice(index).forEach(([re, opts]) => matcher.addRule(re, opts));
			 matcher.compile();
			 this.multiRegexes[index] = matcher;
			 return matcher;
		  }
 
		  considerAll() {
			 this.regexIndex = 0;
		  }
 
		  addRule(re, opts) {
			 this.rules.push([re, opts]);
			 if (opts.type === "begin") this.count++;
		  }
 
		  exec(s) {
			 const m = this.getMatcher(this.regexIndex);
			 m.lastIndex = this.lastIndex;
			 const result = m.exec(s);
			 if (result) {
				this.regexIndex += result.position + 1;
				if (this.regexIndex === this.count) { // wrap-around
				   this.regexIndex = 0;
				}
			 }
 
			 // this.regexIndex = 0;
			 return result;
		  }
	   }
 
	   /**
		* Given a mode, builds a huge ResumableMultiRegex that can be used to walk
		* the content and find matches.
		*/
	   function buildModeRegex(mode) {
		  const mm = new ResumableMultiRegex();
 
		  mode.contains.forEach(term => mm.addRule(term.begin, { rule: term, type: "begin" }));
 
		  if (mode.terminator_end) {
			 mm.addRule(mode.terminator_end, { type: "end" });
		  }
		  if (mode.illegal) {
			 mm.addRule(mode.illegal, { type: "illegal" });
		  }
 
		  return mm;
	   }
 
	   // TODO: We need negative look-behind support to do this properly
	   /**
		* Skip a match if it has a preceding or trailing dot
		*
		* This is used for `beginKeywords` to prevent matching expressions such as
		* `bob.keyword.do()`. The mode compiler automatically wires this up as a
		* special _internal_ 'on:begin' callback for modes with `beginKeywords`
		*/
	   function skipIfhasPrecedingOrTrailingDot(match, response) {
		  const before = match.input[match.index - 1];
		  const after = match.input[match.index + match[0].length];
		  if (before === "." || after === ".") {
			 response.ignoreMatch();
		  }
	   }
 
 /** skip vs abort vs ignore
  *
  * @skip   - The mode is still entered and exited normally (and contains rules apply),
  *           but all content is held and added to the parent buffer rather than being
  *           output when the mode ends.  Mostly used with `sublanguage` to build up
  *           a single large buffer than can be parsed by sublanguage.
  *
  *             - The mode begin ands ends normally.
  *             - Content matched is added to the parent mode buffer.
  *             - The parser cursor is moved forward normally.
  *
  * @abort  - A hack placeholder until we have ignore.  Aborts the mode (as if it
  *           never matched) but DOES NOT continue to match subsequent `contains`
  *           modes.  Abort is bad/suboptimal because it can result in modes
  *           farther down not getting applied because an earlier rule eats the
  *           content but then aborts.
  *
  *             - The mode does not begin.
  *             - Content matched by `begin` is added to the mode buffer.
  *             - The parser cursor is moved forward accordingly.
  *
  * @ignore - Ignores the mode (as if it never matched) and continues to match any
  *           subsequent `contains` modes.  Ignore isn't technically possible with
  *           the current parser implementation.
  *
  *             - The mode does not begin.
  *             - Content matched by `begin` is ignored.
  *             - The parser cursor is not moved forward.
  */
 
	   /**
		* Compiles an individual mode
		*
		* This can raise an error if the mode contains certain detectable known logic
		* issues.
		*/
	   function compileMode(mode, parent) {
		  const cmode = /** @type CompiledMode */ (mode);
		  if (mode.compiled) return cmode;
		  mode.compiled = true;
 
		  // __beforeBegin is considered private API, internal use only
		  mode.__beforeBegin = null;
 
		  mode.keywords = mode.keywords || mode.beginKeywords;
 
		  let kw_pattern = null;
		  if (typeof mode.keywords === "object") {
			 kw_pattern = mode.keywords.$pattern;
			 delete mode.keywords.$pattern;
		  }
 
		  if (mode.keywords) {
			 mode.keywords = compileKeywords(mode.keywords, language.case_insensitive);
		  }
 
		  // both are not allowed
		  if (mode.lexemes && kw_pattern) {
			 throw new Error("ERR: Prefer `keywords.$pattern` to `mode.lexemes`, BOTH are not allowed. (see mode reference) ");
		  }
 
		  // `mode.lexemes` was the old standard before we added and now recommend
		  // using `keywords.$pattern` to pass the keyword pattern
		  cmode.keywordPatternRe = langRe(mode.lexemes || kw_pattern || /\w+/, true);
 
		  if (parent) {
			 if (mode.beginKeywords) {
				// for languages with keywords that include non-word characters checking for
				// a word boundary is not sufficient, so instead we check for a word boundary
				// or whitespace - this does no harm in any case since our keyword engine
				// doesn't allow spaces in keywords anyways and we still check for the boundary
				// first
				mode.begin = '\\b(' + mode.beginKeywords.split(' ').join('|') + ')(?=\\b|\\s)';
				mode.__beforeBegin = skipIfhasPrecedingOrTrailingDot;
			 }
			 if (!mode.begin) mode.begin = /\B|\b/;
			 cmode.beginRe = langRe(mode.begin);
			 if (mode.endSameAsBegin) mode.end = mode.begin;
			 if (!mode.end && !mode.endsWithParent) mode.end = /\B|\b/;
			 if (mode.end) cmode.endRe = langRe(mode.end);
			 cmode.terminator_end = toSource(mode.end);
			 if (mode.endsWithParent && parent.terminator_end) {
				cmode.terminator_end += (mode.end ? '|' : '') + parent.terminator_end;
			 }
		  }
		  if (mode.illegal) cmode.illegalRe = langRe(mode.illegal);
		  // eslint-disable-next-line no-undefined
		  if (mode.relevance === undefined) mode.relevance = 1;
		  if (!mode.contains) mode.contains = [];
 
		  mode.contains = [].concat(...mode.contains.map(function (c) {
			 return expand_or_clone_mode(c === 'self' ? mode : c);
		  }));
		  mode.contains.forEach(function (c) { compileMode(/** @type Mode */(c), cmode); });
 
		  if (mode.starts) {
			 compileMode(mode.starts, parent);
		  }
 
		  cmode.matcher = buildModeRegex(cmode);
		  return cmode;
	   }
 
	   // self is not valid at the top-level
	   if (language.contains && language.contains.includes('self')) {
		  throw new Error("ERR: contains `self` is not supported at the top-level of a language.  See documentation.");
	   }
	   return compileMode(/** @type Mode */(language));
	}
 
	/**
	 * Determines if a mode has a dependency on it's parent or not
	 *
	 * If a mode does have a parent dependency then often we need to clone it if
	 * it's used in multiple places so that each copy points to the correct parent,
	 * where-as modes without a parent can often safely be re-used at the bottom of
	 * a mode chain.
	 * */
	function dependencyOnParent(mode) {
	   if (!mode) return false;
 
	   return mode.endsWithParent || dependencyOnParent(mode.starts);
	}
 
	/**
	 * Expands a mode or clones it if necessary
	 *
	 * This is necessary for modes with parental dependenceis (see notes on
	 * `dependencyOnParent`) and for nodes that have `variants` - which must then be
	 * exploded into their own individual modes at compile time.
	 * */
	function expand_or_clone_mode(mode) {
	   if (mode.variants && !mode.cached_variants) {
		  mode.cached_variants = mode.variants.map(function (variant) {
			 return inherit(mode, { variants: null }, variant);
		  });
	   }
 
	   // EXPAND
	   // if we have variants then essentially "replace" the mode with the variants
	   // this happens in compileMode, where this function is called from
	   if (mode.cached_variants) {
		  return mode.cached_variants;
	   }
 
	   // CLONE
	   // if we have dependencies on parents then we need a unique
	   // instance of ourselves, so we can be reused with many
	   // different parents without issue
	   if (dependencyOnParent(mode)) {
		  return inherit(mode, { starts: mode.starts ? inherit(mode.starts) : null });
	   }
 
	   if (Object.isFrozen(mode)) {
		  return inherit(mode);
	   }
 
	   // no special dependency issues, just return ourselves
	   return mode;
	}
 
	//Given raw keywords from a language definition, compile them.
	function compileKeywords(rawKeywords, case_insensitive) {
	   var compiled_keywords = {};
 
	   //Compiles an individual list of keywords
	   const splitAndCompile = (className, keywordList) => {
		  if (case_insensitive) {
			 keywordList = keywordList.toLowerCase();
		  }
		  keywordList.split(' ').forEach(function (keyword) {
			 var pair = keyword.split('|');
			 compiled_keywords[pair[0]] = [className, scoreForKeyword(pair[0], pair[1])];
		  });
	   }
	   if (typeof rawKeywords === 'string') { // string
		  splitAndCompile('keyword', rawKeywords);
	   } else {
		  Object.keys(rawKeywords).forEach(function (className) {
			 splitAndCompile(className, rawKeywords[className]);
		  });
	   }
	   return compiled_keywords;
	}
 
	/**
	 * Returns the proper score for a given keyword
	 *
	 * Also takes into account comment keywords, which will be scored 0 UNLESS
	 * another score has been manually assigned.
	 */
	function scoreForKeyword(keyword, providedScore) {
	   // manual scores always win over common keywords
	   // so you can force a score of 1 if you really insist
	   if (providedScore) {
		  return Number(providedScore);
	   }
 
	   return commonKeyword(keyword) ? 0 : 1;
	}
	//Determines if a given keyword is common or not
	function commonKeyword(keyword) {
	   return COMMON_KEYWORDS.includes(keyword.toLowerCase());
	}
 
	/*
	Syntax highlighting with language autodetection.
	https://highlightjs.org/
	*/
	const NO_MATCH = Symbol("nomatch");
 
	// Global internal variables used within the highlight.js library.
	var languages = Object.create(null);
	var aliases = Object.create(null);
	var plugins = [];
 
	// safe/production mode - swallows more errors, tries to keep running
	// even if a single syntax or parse hits a fatal error
	var SAFE_MODE = true;
	var fixMarkupRe = /(^(<[^>]+>|\t|)+|\n)/gm;
	var LANGUAGE_NOT_FOUND = "Could not find the language '{}', did you forget to load/include a language module?";
	const PLAINTEXT_LANGUAGE = { disableAutodetect: true, name: 'Plain text', contains: [] };
 
	// Global options used when within external APIs. This is modified when
	// calling the `hljs.configure` function.
	var options = {
	   noHighlightRe: /^(no-?highlight)$/i,
	   languageDetectRe: /\blang(?:uage)?-([\w-]+)\b/i,
	   classPrefix: 'hljs-',
	   tabReplace: null,
	   useBR: false,
	   languages: null,
	   // beta configuration options, subject to change, welcome to discuss
	   // https://github.com/highlightjs/highlight.js/issues/1086
	   __emitter: TokenTreeEmitter
	};
	//Tests a language name to see if highlighting should be skipped
	function shouldNotHighlight(languageName) {
	   return options.noHighlightRe.test(languageName);
	}
	function blockLanguage(block) {
	   var classes = block.className + ' ';
 
	   classes += block.parentNode ? block.parentNode.className : '';
 
	   // language-* takes precedence over non-prefixed class names.
	   const match = options.languageDetectRe.exec(classes);
	   if (match) {
		  var language = getLanguage(match[1]);
		  if (!language) {
			 console.warn(LANGUAGE_NOT_FOUND.replace("{}", match[1]));
			 console.warn("Falling back to no-highlight mode for this block.", block);
		  }
		  return language ? match[1] : 'no-highlight';
	   }
 
	   return classes
		  .split(/\s+/)
		  .find((_class) => shouldNotHighlight(_class) || getLanguage(_class));
	}
 
	//Core highlighting function.
	function highlight(languageName, code, ignoreIllegals, continuation) {
	   var context = {
		  code,
		  language: languageName
	   };
	   // the plugin can change the desired language or the code to be highlighted
	   // just be changing the object it was passed
	   fire("before:highlight", context);
 
	   // a before plugin can usurp the result completely by providing it's own
	   // in which case we don't even need to call highlight
	   var result = context.result ?
		  context.result :
		  _highlight(context.language, context.code, ignoreIllegals, continuation);
 
	   result.code = context.code;
	   // the plugin can change anything in result to suite it
	   fire("after:highlight", result);
 
	   return result;
	}
 
	//private highlight that's used internally and does not fire callbacks
	function _highlight(languageName, code, ignoreIllegals, continuation) {
	   var codeToHighlight = code;
 
	   //Return keyword data if a match is a keyword
	   function keywordData(mode, match) {
		  var matchText = language.case_insensitive ? match[0].toLowerCase() : match[0];
		  return Object.prototype.hasOwnProperty.call(mode.keywords, matchText) && mode.keywords[matchText];
	   }
 
	   function processKeywords() {
		  if (!top.keywords) {
			 emitter.addText(mode_buffer);
			 return;
		  }
 
		  let last_index = 0;
		  top.keywordPatternRe.lastIndex = 0;
		  let match = top.keywordPatternRe.exec(mode_buffer);
		  let buf = "";
 
		  while (match) {
			 buf += mode_buffer.substring(last_index, match.index);
			 const data = keywordData(top, match);
			 if (data) {
				const [kind, keywordRelevance] = data;
				emitter.addText(buf);
				buf = "";
 
				relevance += keywordRelevance;
				emitter.addKeyword(match[0], kind);
			 } else {
				buf += match[0];
			 }
			 last_index = top.keywordPatternRe.lastIndex;
			 match = top.keywordPatternRe.exec(mode_buffer);
		  }
		  buf += mode_buffer.substr(last_index);
		  emitter.addText(buf);
	   }
 
	   function processSubLanguage() {
		  if (mode_buffer === "") return;
		  var result = null;
 
		  if (typeof top.subLanguage === 'string') {
			 if (!languages[top.subLanguage]) {
				emitter.addText(mode_buffer);
				return;
			 }
			 result = _highlight(top.subLanguage, mode_buffer, true, continuations[top.subLanguage]);
			 continuations[top.subLanguage] = result.top;
		  } else {
			 result = highlightAuto(mode_buffer, top.subLanguage.length ? top.subLanguage : null);
		  }
 
		  // Counting embedded language score towards the host language may be disabled
		  // with zeroing the containing mode relevance. Use case in point is Markdown that
		  // allows XML everywhere and makes every XML snippet to have a much larger Markdown
		  // score.
		  if (top.relevance > 0) {
			 relevance += result.relevance;
		  }
		  emitter.addSublanguage(result.emitter, result.language);
	   }
 
	   function processBuffer() {
		  if (top.subLanguage != null) {
			 processSubLanguage();
		  } else {
			 processKeywords();
		  }
		  mode_buffer = '';
	   }
 
	   function startNewMode(mode) {
		  if (mode.className) {
			 emitter.openNode(mode.className);
		  }
		  top = Object.create(mode, { parent: { value: top } });
		  return top;
	   }
 
	   function endOfMode(mode, match, matchPlusRemainder) {
		  let matched = startsWith(mode.endRe, matchPlusRemainder);
 
		  if (matched) {
			 if (mode["on:end"]) {
				const resp = new Response(mode);
				mode["on:end"](match, resp);
				if (resp.ignore) matched = false;
			 }
 
			 if (matched) {
				while (mode.endsParent && mode.parent) {
				   mode = mode.parent;
				}
				return mode;
			 }
		  }
		  // even if on:end fires an `ignore` it's still possible
		  // that we might trigger the end node because of a parent mode
		  if (mode.endsWithParent) {
			 return endOfMode(mode.parent, match, matchPlusRemainder);
		  }
	   }
	   //Handle matching but then ignoring a sequence of text
	   function doIgnore(lexeme) {
		  if (top.matcher.regexIndex === 0) {
			 // no more regexs to potentially match here, so we move the cursor forward one
			 // space
			 mode_buffer += lexeme[0];
			 return 1;
		  } else {
			 // no need to move the cursor, we still have additional regexes to try and
			 // match at this very spot
			 continueScanAtSamePosition = true;
			 return 0;
		  }
	   }
	   //Handle the start of a new potential mode match
	   function doBeginMatch(match) {
		  var lexeme = match[0];
		  var new_mode = match.rule;
 
		  const resp = new Response(new_mode);
		  // first internal before callbacks, then the public ones
		  const beforeCallbacks = [new_mode.__beforeBegin, new_mode["on:begin"]];
		  for (const cb of beforeCallbacks) {
			 if (!cb) continue;
			 cb(match, resp);
			 if (resp.ignore) return doIgnore(lexeme);
		  }
 
		  if (new_mode && new_mode.endSameAsBegin) {
			 new_mode.endRe = escapeChar(lexeme);
		  }
 
		  if (new_mode.skip) {
			 mode_buffer += lexeme;
		  } else {
			 if (new_mode.excludeBegin) {
				mode_buffer += lexeme;
			 }
			 processBuffer();
			 if (!new_mode.returnBegin && !new_mode.excludeBegin) {
				mode_buffer = lexeme;
			 }
		  }
		  startNewMode(new_mode);
		  // if (mode["after:begin"]) {
		  //   let resp = new Response(mode);
		  //   mode["after:begin"](match, resp);
		  // }
		  return new_mode.returnBegin ? 0 : lexeme.length;
	   }
	   //Handle the potential end of mode
	   function doEndMatch(match) {
		  var lexeme = match[0];
		  var matchPlusRemainder = codeToHighlight.substr(match.index);
 
		  var end_mode = endOfMode(top, match, matchPlusRemainder);
		  if (!end_mode) { return NO_MATCH; }
 
		  var origin = top;
		  if (origin.skip) {
			 mode_buffer += lexeme;
		  } else {
			 if (!(origin.returnEnd || origin.excludeEnd)) {
				mode_buffer += lexeme;
			 }
			 processBuffer();
			 if (origin.excludeEnd) {
				mode_buffer = lexeme;
			 }
		  }
		  do {
			 if (top.className) {
				emitter.closeNode();
			 }
			 if (!top.skip && !top.subLanguage) {
				relevance += top.relevance;
			 }
			 top = top.parent;
		  } while (top !== end_mode.parent);
		  if (end_mode.starts) {
			 if (end_mode.endSameAsBegin) {
				end_mode.starts.endRe = end_mode.endRe;
			 }
			 startNewMode(end_mode.starts);
		  }
		  return origin.returnEnd ? 0 : lexeme.length;
	   }
 
	   function processContinuations() {
		  var list = [];
		  for (var current = top; current !== language; current = current.parent) {
			 if (current.className) {
				list.unshift(current.className);
			 }
		  }
		  list.forEach(item => emitter.openNode(item));
	   }
	   var lastMatch = {};
 
	   //Process an individual match
	   function processLexeme(textBeforeMatch, match) {
		  var lexeme = match && match[0];
 
		  // add non-matched text to the current mode buffer
		  mode_buffer += textBeforeMatch;
 
		  if (lexeme == null) {
			 processBuffer();
			 return 0;
		  }
		  // we've found a 0 width match and we're stuck, so we need to advance
		  // this happens when we have badly behaved rules that have optional matchers to the degree that
		  // sometimes they can end up matching nothing at all
		  // Ref: https://github.com/highlightjs/highlight.js/issues/2140
		  if (lastMatch.type === "begin" && match.type === "end" && lastMatch.index === match.index && lexeme === "") {
			 // spit the "skipped" character that our regex choked on back into the output sequence
			 mode_buffer += codeToHighlight.slice(match.index, match.index + 1);
			 if (!SAFE_MODE) {
				const err = new Error('0 width match regex');
				err.languageName = languageName;
				err.badRule = lastMatch.rule;
				throw err;
			 }
			 return 1;
		  }
		  lastMatch = match;
 
		  if (match.type === "begin") {
			 return doBeginMatch(match);
		  } else if (match.type === "illegal" && !ignoreIllegals) {
			 // illegal match, we do not continue processing
			 const err = new Error('Illegal lexeme "' + lexeme + '" for mode "' + (top.className || '<unnamed>') + '"');
			 err.mode = top;
			 throw err;
		  } else if (match.type === "end") {
			 var processed = doEndMatch(match);
			 if (processed !== NO_MATCH) {
				return processed;
			 }
		  }
		  // edge case for when illegal matches $ (end of line) which is technically
		  // a 0 width match but not a begin/end match so it's not caught by the
		  // first handler (when ignoreIllegals is true)
		  if (match.type === "illegal" && lexeme === "") {
			 // advance so we aren't stuck in an infinite loop
			 return 1;
		  }
		  // infinite loops are BAD, this is a last ditch catch all. if we have a
		  // decent number of iterations yet our index (cursor position in our
		  // parsing) still 3x behind our index then something is very wrong
		  // so we bail
		  if (iterations > 100000 && iterations > match.index * 3) {
			 const err = new Error('potential infinite loop, way more iterations than matches');
			 throw err;
		  }
		  /* Why might be find ourselves here?  Only one occasion now.  An end match that was
			 triggered but could not be completed.  When might this happen?  When an `endSameasBegin`
			 rule sets the end rule to a specific match.  Since the overall mode termination rule that's
			 being used to scan the text isn't recompiled that means that any match that LOOKS like
			 the end (but is not, because it is not an exact match to the beginning) will
			 end up here.  A definite end match, but when `doEndMatch` tries to "reapply"
			 the end rule and fails to match, we wind up here, and just silently ignore the end.
			 This causes no real harm other than stopping a few times too many.
		  */
		  mode_buffer += lexeme;
		  return lexeme.length;
	   }
	   var language = getLanguage(languageName);
	   if (!language) {
		  console.error(LANGUAGE_NOT_FOUND.replace("{}", languageName));
		  throw new Error('Unknown language: "' + languageName + '"');
	   }
	   var md = compileLanguage(language);
	   var result = '';
	   var top = continuation || md;
	   var continuations = {}; // keep continuations for sub-languages
	   var emitter = new options.__emitter(options);
	   processContinuations();
	   var mode_buffer = '';
	   var relevance = 0;
	   var index = 0;
	   var iterations = 0;
	   var continueScanAtSamePosition = false;
 
	   try {
		  top.matcher.considerAll();
 
		  for (; ;) {
			 iterations++;
			 if (continueScanAtSamePosition) {
				// only regexes not matched previously will now be
				// considered for a potential match
				continueScanAtSamePosition = false;
			 } else {
				top.matcher.lastIndex = index;
				top.matcher.considerAll();
			 }
			 const match = top.matcher.exec(codeToHighlight);
			 // console.log("match", match[0], match.rule && match.rule.begin)
			 if (!match) break;
 
			 const beforeMatch = codeToHighlight.substring(index, match.index);
			 const processedCount = processLexeme(beforeMatch, match);
			 index = match.index + processedCount;
		  }
		  processLexeme(codeToHighlight.substr(index));
		  emitter.closeAllNodes();
		  emitter.finalize();
		  result = emitter.toHTML();
 
		  return {
			 relevance: relevance,
			 value: result,
			 language: languageName,
			 illegal: false,
			 emitter: emitter,
			 top: top
		  };
	   } catch (err) {
		  if (err.message && err.message.includes('Illegal')) {
			 return {
				illegal: true,
				illegalBy: {
				   msg: err.message,
				   context: codeToHighlight.slice(index - 100, index + 100),
				   mode: err.mode
				},
				sofar: result,
				relevance: 0,
				value: escapeHTML(codeToHighlight),
				emitter: emitter
			 };
		  } else if (SAFE_MODE) {
			 return {
				illegal: false,
				relevance: 0,
				value: escapeHTML(codeToHighlight),
				emitter: emitter,
				language: languageName,
				top: top,
				errorRaised: err
			 };
		  } else {
			 throw err;
		  }
	   }
	}
	/**
	 * returns a valid highlight result, without actually doing any actual work,
	 * auto highlight starts with this and it's possible for small snippets that
	 * auto-detection may not find a better match
	 */
	function justTextHighlightResult(code) {
	   const result = {
		  relevance: 0,
		  emitter: new options.__emitter(options),
		  value: escapeHTML(code),
		  illegal: false,
		  top: PLAINTEXT_LANGUAGE
	   };
	   result.emitter.addText(code);
	   return result;
	}
 
	/**
	Highlighting with language detection. Accepts a string with the code to
	highlight. Returns an object with the following properties:
 
	- language (detected language)
	- relevance (int)
	- value (an HTML string with highlighting markup)
	- second_best (object with the same structure for second-best heuristically
	  detected language, may be absent)
	*/
	function highlightAuto(code, languageSubset) {
	   languageSubset = languageSubset || options.languages || Object.keys(languages);
	   var result = justTextHighlightResult(code);
	   var secondBest = result;
	   languageSubset.filter(getLanguage).filter(autoDetection).forEach(function (name) {
		  var current = _highlight(name, code, false);
		  current.language = name;
		  if (current.relevance > secondBest.relevance) {
			 secondBest = current;
		  }
		  if (current.relevance > result.relevance) {
			 secondBest = result;
			 result = current;
		  }
	   });
	   if (secondBest.language) {
		  // second_best (with underscore) is the expected API
		  result.second_best = secondBest;
	   }
	   return result;
	}
 
	/**
	Post-processing of the highlighted markup:
 
	- replace TABs with something more useful
	- replace real line-breaks with '<br>' for non-pre containers
	*/
	function fixMarkup(html) {
	   if (!(options.tabReplace || options.useBR)) {
		  return html;
	   }
 
	   return html.replace(fixMarkupRe, match => {
		  if (match === '\n') {
			 return options.useBR ? '<br>' : match;
		  } else if (options.tabReplace) {
			 return match.replace(/\t/g, options.tabReplace);
		  }
		  return match;
	   });
	}
	//Builds new class name for block given the language name
	function buildClassName(prevClassName, currentLang, resultLang) {
	   var language = currentLang ? aliases[currentLang] : resultLang;
	   var result = [prevClassName.trim()];
 
	   if (!prevClassName.includes(language)) {
		  result.push(language);
	   }
 
	   return result.join(' ').trim();
	}
	/**
	 * Applies highlighting to a DOM node containing code. Accepts a DOM node and
	 * two optional parameters for fixMarkup.
	*/
	function highlightBlock(element) {
	   let node = null;
	   const language = blockLanguage(element);
 
	   if (shouldNotHighlight(language)) return false;
 
	   fire("before:highlightBlock",
		  { block: element, language: language });
 
	   if (options.useBR) {
		  node = document.createElement('div');
		  node.innerHTML = element.innerHTML.replace(/\n/g, '').replace(/<br[ /]*>/g, '\n');
	   } else {
		  node = element;
	   }
	   const text = node.textContent;
	   const result = language ? highlight(language, text, true) : highlightAuto(text);
 
	   const originalStream = nodeStream(node);
	   if (originalStream.length) {
		  const resultNode = document.createElement('div');
		  resultNode.innerHTML = result.value;
		  result.value = mergeStreams(originalStream, nodeStream(resultNode), text);
	   }
	   result.value = fixMarkup(result.value);
 
	   fire("after:highlightBlock", { block: element, result: result });
 
	   element.innerHTML = result.value;
	   element.className = buildClassName(element.className, language, result.language);
	   element.result = {
		  language: result.language,
		  // TODO: remove with version 11.0
		  re: result.relevance,
		  relavance: result.relevance
	   };
	   if (result.second_best) {
		  element.second_best = {
			 language: result.second_best.language,
			 // TODO: remove with version 11.0
			 re: result.second_best.relevance,
			 relavance: result.second_best.relevance
		  };
	   }
	   return true;
	}
	//Updates highlight.js global options with the passed options
	function configure(userOptions) {
	   options = inherit(options, userOptions);
	}
	//Register a language grammar module
	function registerLanguage(languageName, languageDefinition) {
	   var lang = null;
	   try {
		  lang = languageDefinition(MODES);
	   } catch (error) {
		  console.error("Language definition for '{}' could not be registered.".replace("{}", languageName));
		  // hard or soft error
		  if (!SAFE_MODE) { throw error; } else { console.error(error); }
		  // languages that have serious errors are replaced with essentially a
		  // "plaintext" stand-in so that the code blocks will still get normal
		  // css classes applied to them - and one bad language won't break the
		  // entire highlighter
		  lang = PLAINTEXT_LANGUAGE;
	   }
	   // give it a temporary name if it doesn't have one in the meta-data
	   if (!lang.name) lang.name = languageName;
	   languages[languageName] = lang;
	   lang.rawDefinition = languageDefinition.bind(null, MODES);
 
	   if (lang.aliases) {
		  registerAliases(lang.aliases, { languageName });
	   }
	}
	/**
	  intended usage: When one language truly requires another
 
	  Unlike `getLanguage`, this will throw when the requested language
	  is not available.
	*/
	function getLanguage(name) {
	   name = (name || '').toLowerCase();
	   return languages[name] || languages[aliases[name]];
	}
	function registerAliases(aliasList, { languageName }) {
	   if (typeof aliasList === 'string') {
		  aliasList = [aliasList];
	   }
	   aliasList.forEach(alias => { aliases[alias] = languageName; });
	}
	//Determines if a given language has auto-detection enabled
	function autoDetection(name) {
	   var lang = getLanguage(name);
	   return lang && !lang.disableAutodetect;
	}
	function fire(event, args) {
	   var cb = event;
	   plugins.forEach(function (plugin) {
		  if (plugin[cb]) {
			 plugin[cb](args);
		  }
	   });
	}
	/* Interface definition */
	hljs.versionString = "10.1.1";
	hljs.apply = highlightBlock;
	configure(params);


 registerLanguage('python',
	/*
	Language: Python
	Description: Python is an interpreted, object-oriented, high-level programming language with dynamic semantics.
	Website: https://www.python.org
	Category: common
	*/
	function python(_M0DE$) {
	   var KEYWORDS = {
		  keyword:
			 'and elif is global as in if from raise for except finally print import pass return ' +
			 'exec else break not with class assert yield try while continue del or def lambda ' +
			 'async await nonlocal|10',
		  built_in:
			 'Ellipsis NotImplemented',
		  literal: 'False None True'
	   };
	   var PROMPT = {
		  className: 'meta', begin: /^(>>>|\.\.\.) /
	   };
	   var SUBST = {
		  className: 'subst',
		  begin: /\{/, end: /\}/,
		  keywords: KEYWORDS,
		  illegal: /#/
	   };
	   var LITERAL_BRACKET = {
		  begin: /\{\{/,
		  relevance: 0
	   };
	   var STRING = {
		  className: 'string',
		  contains: [_M0DE$.BACKSLASH_ESCAPE],
		  variants: [
			 {
				begin: /(u|b)?r?'''/, end: /'''/,
				contains: [_M0DE$.BACKSLASH_ESCAPE, PROMPT],
				relevance: 10
			 },
			 {
				begin: /(u|b)?r?"""/, end: /"""/,
				contains: [_M0DE$.BACKSLASH_ESCAPE, PROMPT],
				relevance: 10
			 },
			 {
				begin: /(fr|rf|f)'''/, end: /'''/,
				contains: [_M0DE$.BACKSLASH_ESCAPE, PROMPT, LITERAL_BRACKET, SUBST]
			 },
			 {
				begin: /(fr|rf|f)"""/, end: /"""/,
				contains: [_M0DE$.BACKSLASH_ESCAPE, PROMPT, LITERAL_BRACKET, SUBST]
			 },
			 { begin: /(u|r|ur)'/, end: /'/, relevance: 10 },
			 { begin: /(u|r|ur)"/, end: /"/, relevance: 10 },
			 { begin: /(b|br)'/, end: /'/ },
			 { begin: /(b|br)"/, end: /"/ },
			 {
				begin: /(fr|rf|f)'/, end: /'/,
				contains: [_M0DE$.BACKSLASH_ESCAPE, LITERAL_BRACKET, SUBST]
			 },
			 {
				begin: /(fr|rf|f)"/, end: /"/,
				contains: [_M0DE$.BACKSLASH_ESCAPE, LITERAL_BRACKET, SUBST]
			 },
			 _M0DE$.APOS_STRING_MODE,
			 _M0DE$.QUOTE_STRING_MODE
		  ]
	   };
	   var NUMBER = {
		  className: 'number', relevance: 0,
		  variants: [
			 { begin: _M0DE$.BINARY_NUMBER_RE + '[lLjJ]?' },
			 { begin: '\\b(0o[0-7]+)[lLjJ]?' },
			 { begin: _M0DE$.C_NUMBER_RE + '[lLjJ]?' }
		  ]
	   };
	   var PARAMS = {
		  className: 'params',
		  variants: [
			 // Exclude params at functions without params
			 { begin: /\(\s*\)/, skip: true, className: null },
			 {
				begin: /\(/, end: /\)/, excludeBegin: true, excludeEnd: true,
				contains: ['self', PROMPT, NUMBER, STRING, _M0DE$.HASH_COMMENT_MODE],
			 },
		  ],
	   };
	   SUBST.contains = [STRING, NUMBER, PROMPT];
	   return {
		  name: 'Python',
		  aliases: ['py', 'gyp', 'ipython'],
		  keywords: KEYWORDS,
		  illegal: /(<\/|->|\?)|=>/,
		  contains: [
			 PROMPT,
			 NUMBER,
			 // eat "if" prior to string so that it won't accidentally be
			 // labeled as an f-string as in:
			 { beginKeywords: "if", relevance: 0 },
			 STRING,
			 _M0DE$.HASH_COMMENT_MODE,
			 {
				variants: [
				   { className: 'function', beginKeywords: 'def' },
				   { className: 'class', beginKeywords: 'class' }
				],
				end: /:/,
				illegal: /[${=;\n,]/,
				contains: [
				   _M0DE$.UNDERSCORE_TITLE_MODE,
				   PARAMS,
				   {
					  begin: /->/, endsWithParent: true,
					  keywords: 'None'
				   }
				]
			 },
			 {
				className: 'meta',
				begin: /^[\t ]*@/, end: /$/
			 },
			 {
				begin: /\b(print|exec)\(/ // don’t highlight keywords-turned-functions in Python 3
			 }
		  ]
	   };
	});
 
 registerLanguage('python-repl',
	/*
	Language: Python REPL
	Requires: python.js
	Author: Josh Goebel <hello@joshgoebel.com>
	Category: common
	*/
	function pythonRepl() {
	   return {
		  aliases: ['pycon'],
		  contains: [
			 {
				className: 'meta',
				starts: {
				   // a space separates the REPL prefix from the actual code
				   // this is purely for cleaner HTML output
				   end: / |$/,
				   starts: {
					  end: '$', subLanguage: 'python'
				   }
				},
				variants: [
				   { begin: /^>>>(?=[ ]|$)/ },
				   { begin: /^\.\.\.(?=[ ]|$)/ }
				]
			 },
		  ]
	   }
	});
 
 registerLanguage('makefile',
	/*
	Language: Makefile
	Author: Ivan Sagalaev <maniac@softwaremaniacs.org>
	Contributors: Joël Porquet <joel@porquet.org>
	Website: https://www.gnu.org/software/make/manual/html_node/Introduction.html
	Category: common
	*/
	function makefile(_M0DE$) {
	   /* Variables: simple (eg $(var)) and special (eg $@) */
	   var VARIABLE = {
		  className: 'variable',
		  variants: [
			 {
				begin: '\\$\\('+ _M0DE$.UNDERSCORE_IDENT_RE +'\\)',
				contains: [_M0DE$.BACKSLASH_ESCAPE],
			 },
			 {
				begin: /\$[@%<?\^\+\*]/
			 },
		  ]
	   };
	   /* Quoted string with variables inside */
	   var QUOTE_STRING = {
		  className: 'string',
		  begin: /"/, end: /"/,
		  contains: [
			 _M0DE$.BACKSLASH_ESCAPE, VARIABLE
		  ]
	   };
	   /* Function: $(func arg,...) */
	   var FUNC = {
		  className: 'variable',
		  begin: /\$\([\w-]+\s/, end: /\)/,
		  keywords: {
			 built_in:
				'subst patsubst strip findstring filter filter-out sort ' +
				'word wordlist firstword lastword dir notdir suffix basename ' +
				'addsuffix addprefix join wildcard realpath abspath error warning ' +
				'shell origin flavor foreach if or and call eval file value',
		  },
		  contains: [ VARIABLE ]
	   };
	   /* Variable assignment */
	   var ASSIGNMENT = {
		  begin: '^' + _M0DE$.UNDERSCORE_IDENT_RE + '\\s*(?=[:+?]?=)'
	   };
	   /* Meta targets (.PHONY) */
	   var META = {
		  className: 'meta',
		  begin: /^\.PHONY:/, end: /$/,
		  keywords: {
			 $pattern: /[\.\w]+/,
			 'meta-keyword': '.PHONY'
		  }
	   };
	   /* Targets */
	   var TARGET = {
		  className: 'section',
		  begin: /^[^\s]+:/, end: /$/,
		  contains: [ VARIABLE ]
	   };
	   return {
		  name: 'Makefile',
		  aliases: ['mk', 'mak'],
		  keywords: {
			 $pattern: /[\w-]+/,
			 keyword: 'define endef undefine ifdef ifndef ifeq ifneq else endif ' +
				'include -include sinclude override export unexport private vpath'
		  },
		  contains: [
			 _M0DE$.HASH_COMMENT_MODE, VARIABLE, QUOTE_STRING, FUNC, ASSIGNMENT, META, TARGET
		  ]
	   };
	});
 
 registerLanguage('csharp',
	/*
	Language: C#
	Author: Jason Diamond <jason@diamond.name>
	Contributor: Nicolas LLOBERA <nllobera@gmail.com>, Pieter Vantorre <pietervantorre@gmail.com>
	Website: https://docs.microsoft.com/en-us/dotnet/csharp/
	Category: common
	*/
	function csharp(_M0DE$) {
	   var KEYWORDS = {
		  keyword:
			 // Normal keywords.
			 'abstract as base bool break byte case catch char checked const continue decimal ' +
			 'default delegate do double enum event explicit extern finally fixed float ' +
			 'for foreach goto if implicit in init int interface internal is lock long ' +
			 'object operator out override params private protected public readonly ref sbyte ' +
			 'sealed short sizeof stackalloc static string struct switch this try typeof ' +
			 'uint ulong unchecked unsafe ushort using virtual void volatile while ' +
			 // Contextual keywords.
			 'add alias ascending async await by descending dynamic equals from get global group into join ' +
			 'let nameof on orderby partial remove select set value var when where yield',
		  literal:
			 'null false true'
	   };
	   var TITLE_MODE = inherit(_M0DE$.TITLE_MODE, { begin: '[a-zA-Z](\\.?\\w)*' });
	   var NUMBERS = {
		  className: 'number',
		  variants: [
			 { begin: '\\b(0b[01\']+)' },
			 { begin: '(-?)\\b([\\d\']+(\\.[\\d\']*)?|\\.[\\d\']+)(u|U|l|L|ul|UL|f|F|b|B)' },
			 { begin: '(-?)(\\b0[xX][a-fA-F0-9\']+|(\\b[\\d\']+(\\.[\\d\']*)?|\\.[\\d\']+)([eE][-+]?[\\d\']+)?)' }
		  ],
		  relevance: 0
	   };
	   var VERBATIM_STRING = {
		  className: 'string',
		  begin: '@"', end: '"',
		  contains: [{ begin: '""' }]
	   };
	   var VERBATIM_STRING_NO_LF = inherit(VERBATIM_STRING, { illegal: /\n/ });
	   var SUBST = {
		  className: 'subst',
		  begin: '{', end: '}',
		  keywords: KEYWORDS
	   };
	   var SUBST_NO_LF = inherit(SUBST, { illegal: /\n/ });
	   var INTERPOLATED_STRING = {
		  className: 'string',
		  begin: /\$"/, end: '"',
		  illegal: /\n/,
		  contains: [{ begin: '{{' }, { begin: '}}' }, _M0DE$.BACKSLASH_ESCAPE, SUBST_NO_LF]
	   };
	   var INTERPOLATED_VERBATIM_STRING = {
		  className: 'string',
		  begin: /\$@"/, end: '"',
		  contains: [{ begin: '{{' }, { begin: '}}' }, { begin: '""' }, SUBST]
	   };
	   var INTERPOLATED_VERBATIM_STRING_NO_LF = inherit(INTERPOLATED_VERBATIM_STRING, {
		  illegal: /\n/,
		  contains: [{ begin: '{{' }, { begin: '}}' }, { begin: '""' }, SUBST_NO_LF]
	   });
	   SUBST.contains = [
		  INTERPOLATED_VERBATIM_STRING,
		  INTERPOLATED_STRING,
		  VERBATIM_STRING,
		  _M0DE$.APOS_STRING_MODE,
		  _M0DE$.QUOTE_STRING_MODE,
		  NUMBERS,
		  _M0DE$.C_BLOCK_COMMENT_MODE
	   ];
	   SUBST_NO_LF.contains = [
		  INTERPOLATED_VERBATIM_STRING_NO_LF,
		  INTERPOLATED_STRING,
		  VERBATIM_STRING_NO_LF,
		  _M0DE$.APOS_STRING_MODE,
		  _M0DE$.QUOTE_STRING_MODE,
		  NUMBERS,
		  inherit(_M0DE$.C_BLOCK_COMMENT_MODE, { illegal: /\n/ })
	   ];
	   var STRING = {
		  variants: [
			 INTERPOLATED_VERBATIM_STRING,
			 INTERPOLATED_STRING,
			 VERBATIM_STRING,
			 _M0DE$.APOS_STRING_MODE,
			 _M0DE$.QUOTE_STRING_MODE
		  ]
	   };
	   var GENERIC_MODIFIER = {
		  begin: "<",
		  end: ">",
		  contains: [
			 { beginKeywords: "in out" },
			 TITLE_MODE
		  ]
	   };
	   var TYPE_IDENT_RE = _M0DE$.IDENT_RE + '(<' + _M0DE$.IDENT_RE + '(\\s*,\\s*' + _M0DE$.IDENT_RE + ')*>)?(\\[\\])?';
	   var AT_IDENTIFIER = {
		  // prevents expressions like `@class` from incorrect flagging
		  // `class` as a keyword
		  begin: "@" + _M0DE$.IDENT_RE,
		  relevance: 0
	   };
	   return {
		  name: 'C#',
		  aliases: ['cs', 'c#'],
		  keywords: KEYWORDS,
		  illegal: /::/,
		  contains: [
			 _M0DE$.COMMENT(
				'///',
				'$',
				{
				   returnBegin: true,
				   contains: [
					  {
						 className: 'doctag',
						 variants: [
							{
							   begin: '///', relevance: 0
							},
							{
							   begin: '<!--|-->'
							},
							{
							   begin: '</?', end: '>'
							}
						 ]
					  }
				   ]
				}
			 ),
			 _M0DE$.C_LINE_COMMENT_MODE,
			 _M0DE$.C_BLOCK_COMMENT_MODE,
			 {
				className: 'meta',
				begin: '#', end: '$',
				keywords: {
				   'meta-keyword': 'if else elif endif define undef warning error line region endregion pragma checksum'
				}
			 },
			 STRING, NUMBERS,
			 {
				beginKeywords: 'class interface', end: /[{;=]/,
				illegal: /[^\s:,]/,
				contains: [
				   { beginKeywords: "where class" },
				   TITLE_MODE,
				   GENERIC_MODIFIER,
				   _M0DE$.C_LINE_COMMENT_MODE,
				   _M0DE$.C_BLOCK_COMMENT_MODE
				]
			 },
			 {
				beginKeywords: 'namespace', end: /[{;=]/,
				illegal: /[^\s:]/,
				contains: [
				   TITLE_MODE,
				   _M0DE$.C_LINE_COMMENT_MODE,
				   _M0DE$.C_BLOCK_COMMENT_MODE
				]
			 },
			 {
				beginKeywords: 'record', end: /[{;=]/,
				illegal: /[^\s:]/,
				contains: [
				   TITLE_MODE,
				   GENERIC_MODIFIER,
				   _M0DE$.C_LINE_COMMENT_MODE,
				   _M0DE$.C_BLOCK_COMMENT_MODE
				]
			 },
			 {
				// [Attributes("")]
				className: 'meta',
				begin: '^\\s*\\[', excludeBegin: true, end: '\\]', excludeEnd: true,
				contains: [
				   { className: 'meta-string', begin: /"/, end: /"/ }
				]
			 },
			 {
				// Expression keywords prevent 'keyword Name(...)' from being
				// recognized as a function definition
				beginKeywords: 'new return throw await else',
				relevance: 0
			 },
			 {
				className: 'function',
				begin: '(' + TYPE_IDENT_RE + '\\s+)+' + _M0DE$.IDENT_RE + '\\s*(\\<.+\\>)?\\s*\\(', returnBegin: true,
				end: /\s*[{;=]/, excludeEnd: true,
				keywords: KEYWORDS,
				contains: [
				   {
					  begin: _M0DE$.IDENT_RE + '\\s*(\\<.+\\>)?\\s*\\(', returnBegin: true,
					  contains: [
						 _M0DE$.TITLE_MODE,
						 GENERIC_MODIFIER
					  ],
					  relevance: 0
				   },
				   {
					  className: 'params',
					  begin: /\(/, end: /\)/,
					  excludeBegin: true,
					  excludeEnd: true,
					  keywords: KEYWORDS,
					  relevance: 0,
					  contains: [
						 STRING,
						 NUMBERS,
						 _M0DE$.C_BLOCK_COMMENT_MODE
					  ]
				   },
				   _M0DE$.C_LINE_COMMENT_MODE,
				   _M0DE$.C_BLOCK_COMMENT_MODE
				]
			 },
			 AT_IDENTIFIER
		  ]
	   };
	});
 
 registerLanguage('c-like',
	/*
	Language: C-like foundation grammar for C/C++ grammars
	Author: Ivan Sagalaev <maniac@softwaremaniacs.org>
	Contributors: Evgeny Stepanischev <imbolk@gmail.com>, Zaven Muradyan <megalivoithos@gmail.com>, Roel Deckers <admin@codingcat.nl>, Sam Wu <samsam2310@gmail.com>, Jordi Petit <jordi.petit@gmail.com>, Pieter Vantorre <pietervantorre@gmail.com>, Google Inc. (David Benjamin) <davidben@google.com>
	Category: common, system
	*/
 
	/* In the future the intention is to split out the C/C++ grammars distinctly
	since they are separate languages.  They will likely share a common foundation
	though, and this file sets the groundwork for that - so that we get the breaking
	change in v10 and don't have to change the requirements again later.
   
	See: https://github.com/highlightjs/highlight.js/issues/2146
	*/
	function cLike(_M0DE$) {
	   function optional(s) {
		  return '(?:' + s + ')?';
	   }
	   var DECLTYPE_AUTO_RE = 'decltype\\(auto\\)';
	   var NAMESPACE_RE = '[a-zA-Z_]\\w*::';
	   var TEMPLATE_ARGUMENT_RE = '<.*?>';
	   var FUNCTION_TYPE_RE = '('+ DECLTYPE_AUTO_RE +'|'+
		  optional(NAMESPACE_RE) +'[a-zA-Z_]\\w*'+ optional(TEMPLATE_ARGUMENT_RE) +')';
	   var CPP_PRIMITIVE_TYPES = {
		  className: 'keyword',
		  begin: '\\b[a-z\\d_]*_t\\b'
	   };
	   // https://en.cppreference.com/w/cpp/language/escape
	   // \\ \x \xFF \u2837 \u00323747 \374
	   var CHARACTER_ESCAPES = '\\\\(x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4,8}|[0-7]{3}|\\S)';
	   var STRINGS = {
		  className: 'string',
		  variants: [
			 {
				begin: '(u8?|U|L)?"', end: '"',
				illegal: '\\n',
				contains: [_M0DE$.BACKSLASH_ESCAPE]
			 },
			 {
				begin: '(u8?|U|L)?\'(' + CHARACTER_ESCAPES + "|.)", end: '\'',
				illegal: '.'
			 },
			 _M0DE$.END_SAME_AS_BEGIN({
				begin: /(?:u8?|U|L)?R"([^()\\ ]{0,16})\(/,
				end: /\)([^()\\ ]{0,16})"/,
			 })
		  ]
	   };
	   var NUMBERS = {
		  className: 'number',
		  variants: [
			 { begin: '\\b(0b[01\']+)' },
			 { begin: '(-?)\\b([\\d\']+(\\.[\\d\']*)?|\\.[\\d\']+)(u|U|l|L|ul|UL|f|F|b|B)' },
			 { begin: '(-?)(\\b0[xX][a-fA-F0-9\']+|(\\b[\\d\']+(\\.[\\d\']*)?|\\.[\\d\']+)([eE][-+]?[\\d\']+)?)' }
		  ],
		  relevance: 0
	   };
	   var PREPROCESSOR = {
		  className: 'meta',
		  begin: /#\s*[a-z]+\b/, end: /$/,
		  keywords: {
			 'meta-keyword':
				'if else elif endif define undef warning error line ' +
				'pragma _Pragma ifdef ifndef include'
		  },
		  contains: [
			 {
				begin: /\\\n/, relevance: 0
			 },
			 inherit(STRINGS, { className: 'meta-string' }),
			 {
				className: 'meta-string',
				begin: /<.*?>/, end: /$/,
				illegal: '\\n',
			 },
			 _M0DE$.C_LINE_COMMENT_MODE,
			 _M0DE$.C_BLOCK_COMMENT_MODE
		  ]
	   };
	   var TITLE_MODE = {
		  className: 'title',
		  begin: optional(NAMESPACE_RE) + _M0DE$.IDENT_RE,
		  relevance: 0
	   };
	   var FUNCTION_TITLE = optional(NAMESPACE_RE) + _M0DE$.IDENT_RE + '\\s*\\(';
	   var CPP_KEYWORDS = {
		  keyword: 'int float while private char char8_t char16_t char32_t catch import module export virtual operator sizeof ' +
			 'dynamic_cast|10 typedef const_cast|10 const for static_cast|10 union namespace ' +
			 'unsigned long volatile static protected bool template mutable if public friend ' +
			 'do goto auto void enum else break extern using asm case typeid wchar_t ' +
			 'short reinterpret_cast|10 default double register explicit signed typename try this ' +
			 'switch continue inline delete alignas alignof constexpr consteval constinit decltype ' +
			 'concept co_await co_return co_yield requires ' +
			 'noexcept static_assert thread_local restrict final override ' +
			 'atomic_bool atomic_char atomic_schar ' +
			 'atomic_uchar atomic_short atomic_ushort atomic_int atomic_uint atomic_long atomic_ulong atomic_llong ' +
			 'atomic_ullong new throw return ' +
			 'and and_eq bitand bitor compl not not_eq or or_eq xor xor_eq',
		  built_in: 'std string wstring cin cout cerr clog stdin stdout stderr stringstream istringstream ostringstream ' +
			 'auto_ptr deque list queue stack vector map set pair bitset multiset multimap unordered_set ' +
			 'unordered_map unordered_multiset unordered_multimap priority_queue make_pair array shared_ptr abort terminate abs acos ' +
			 'asin atan2 atan calloc ceil cosh cos exit exp fabs floor fmod fprintf fputs free frexp ' +
			 'fscanf future isalnum isalpha iscntrl isdigit isgraph islower isprint ispunct isspace isupper ' +
			 'isxdigit tolower toupper labs ldexp log10 log malloc realloc memchr memcmp memcpy memset modf pow ' +
			 'printf putchar puts scanf sinh sin snprintf sprintf sqrt sscanf strcat strchr strcmp ' +
			 'strcpy strcspn strlen strncat strncmp strncpy strpbrk strrchr strspn strstr tanh tan ' +
			 'vfprintf vprintf vsprintf endl initializer_list unique_ptr _Bool complex _Complex imaginary _Imaginary',
		  literal: 'true false nullptr NULL'
	   };
 
	   var EXPRESSION_CONTAINS = [
		  CPP_PRIMITIVE_TYPES,
		  _M0DE$.C_LINE_COMMENT_MODE,
		  _M0DE$.C_BLOCK_COMMENT_MODE,
		  NUMBERS,
		  STRINGS
	   ];
 
	   var EXPRESSION_CONTEXT = {
		  // This mode covers expression context where we can't expect a function
		  // definition and shouldn't highlight anything that looks like one:
		  // `return some()`, `else if()`, `(x*sum(1, 2))`
		  variants: [
			 { begin: /=/, end: /;/ },
			 { begin: /\(/, end: /\)/ },
			 { beginKeywords: 'new throw return else', end: /;/ }
		  ],
		  keywords: CPP_KEYWORDS,
		  contains: EXPRESSION_CONTAINS.concat([
			 {
				begin: /\(/, end: /\)/,
				keywords: CPP_KEYWORDS,
				contains: EXPRESSION_CONTAINS.concat(['self']),
				relevance: 0
			 }
		  ]),
		  relevance: 0
	   };
 
	   var FUNCTION_DECLARATION = {
		  className: 'function',
		  begin: '(' + FUNCTION_TYPE_RE + '[\\*&\\s]+)+' + FUNCTION_TITLE,
		  returnBegin: true, end: /[{;=]/,
		  excludeEnd: true,
		  keywords: CPP_KEYWORDS,
		  illegal: /[^\w\s\*&:<>]/,
		  contains: [
 
			 { // to prevent it from being confused as the function title
				begin: DECLTYPE_AUTO_RE,
				keywords: CPP_KEYWORDS,
				relevance: 0,
			 },
			 {
				begin: FUNCTION_TITLE, returnBegin: true,
				contains: [TITLE_MODE],
				relevance: 0
			 },
			 {
				className: 'params',
				begin: /\(/, end: /\)/,
				keywords: CPP_KEYWORDS,
				relevance: 0,
				contains: [
				   _M0DE$.C_LINE_COMMENT_MODE,
				   _M0DE$.C_BLOCK_COMMENT_MODE,
				   STRINGS,
				   NUMBERS,
				   CPP_PRIMITIVE_TYPES,
				   // Count matching parentheses.
				   {
					  begin: /\(/, end: /\)/,
					  keywords: CPP_KEYWORDS,
					  relevance: 0,
					  contains: [
						 'self',
						 _M0DE$.C_LINE_COMMENT_MODE,
						 _M0DE$.C_BLOCK_COMMENT_MODE,
						 STRINGS,
						 NUMBERS,
						 CPP_PRIMITIVE_TYPES
					  ]
				   }
				]
			 },
			 CPP_PRIMITIVE_TYPES,
			 _M0DE$.C_LINE_COMMENT_MODE,
			 _M0DE$.C_BLOCK_COMMENT_MODE,
			 PREPROCESSOR
		  ]
	   };
	   return {
		  aliases: ['c', 'cc', 'h', 'c++', 'h++', 'hpp', 'hh', 'hxx', 'cxx'],
		  keywords: CPP_KEYWORDS,
		  // the base c-like language will NEVER be auto-detected, rather the
		  // derivitives: c, c++, arduino turn auto-detect back on for themselves
		  disableAutodetect: true,
		  illegal: '</',
		  contains: [].concat(
			 EXPRESSION_CONTEXT,
			 FUNCTION_DECLARATION,
			 EXPRESSION_CONTAINS,
			 [
				PREPROCESSOR,
				{ // containers: ie, `vector <int> rooms (9);`
				   begin: '\\b(deque|list|queue|priority_queue|pair|stack|vector|map|set|bitset|multiset|multimap|unordered_map|unordered_set|unordered_multiset|unordered_multimap|array)\\s*<', end: '>',
				   keywords: CPP_KEYWORDS,
				   contains: ['self', CPP_PRIMITIVE_TYPES]
				},
				{
				   begin: _M0DE$.IDENT_RE + '::',
				   keywords: CPP_KEYWORDS
				},
				{
				   className: 'class',
				   beginKeywords: 'class struct', end: /[{;:]/,
				   contains: [
					  { begin: /</, end: />/, contains: ['self'] }, // skip generic stuff
					  _M0DE$.TITLE_MODE
				   ]
				}
			 ]),
		  exports: {
			 preprocesor: PREPROCESSOR,
			 strings: STRINGS,
			 keywords: CPP_KEYWORDS
		  }
	   };
	});
 
 registerLanguage('cpp',
	/*
	Language: C++
	Category: common, system
	Website: https://isocpp.org
	Requires: c-like.js
	*/
	function cpp() {
	   var lang = getLanguage('c-like').rawDefinition();
	   // return auto-detection back on
	   lang.disableAutodetect = false;
	   lang.name = 'C++';
	   lang.aliases = ['cc', 'c++', 'h++', 'hpp', 'hh', 'hxx', 'cxx'];
	   return lang;
	});
 
 registerLanguage('apache',
	/*
	Language: Apache config
	Author: Ruslan Keba <rukeba@gmail.com>
	Contributors: Ivan Sagalaev <maniac@softwaremaniacs.org>
	Website: https://httpd.apache.org
	Description: language definition for Apache configuration files (httpd.conf & .htaccess)
	Category: common, config
	*/
	function apache(_M0DE$) {
	   var NUMBER_REF = { className: 'number', begin: '[\\$%]\\d+' };
	   var NUMBER = { className: 'number', begin: '\\d+' };
	   var IP_ADDRESS = {
		  className: "number",
		  begin: '\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}(:\\d{1,5})?'
	   };
	   var PORT_NUMBER = {
		  className: "number",
		  begin: ":\\d{1,5}"
	   };
	   return {
		  name: 'Apache config',
		  aliases: ['apacheconf'],
		  case_insensitive: true,
		  contains: [
			 _M0DE$.HASH_COMMENT_MODE,
			 {
				className: 'section', begin: '</?', end: '>',
				contains: [
				   IP_ADDRESS,
				   PORT_NUMBER,
				   // low relevance prevents us from claming XML/HTML where this rule would
				   // match strings inside of XML tags
				   inherit(_M0DE$.QUOTE_STRING_MODE, { relevance: 0 })
				]
			 },
			 {
				className: 'attribute',
				begin: /\w+/,
				relevance: 0,
				// keywords aren’t needed for highlighting per se, they only boost relevance
				// for a very generally defined mode (starts with a word, ends with line-end
				keywords: {
				   nomarkup:
					  'order deny allow setenv rewriterule rewriteengine rewritecond documentroot ' +
					  'sethandler errordocument loadmodule options header listen serverroot ' +
					  'servername'
				},
				starts: {
				   end: /$/,
				   relevance: 0,
				   keywords: {
					  literal: 'on off all deny allow'
				   },
				   contains: [
					  {
						 className: 'meta',
						 begin: '\\s\\[', end: '\\]$'
					  },
					  {
						 className: 'variable',
						 begin: '[\\$%]\\{', end: '\\}',
						 contains: ['self', NUMBER_REF]
					  },
					  IP_ADDRESS,
					  NUMBER,
					  _M0DE$.QUOTE_STRING_MODE
				   ]
				}
			 }
		  ],
		  illegal: /\S/
	   };
	});
 
 registerLanguage('haskell',
	/*
	Language: Haskell
	Author: Jeremy Hull <sourdrums@gmail.com>
	Contributors: Zena Treep <zena.treep@gmail.com>
	Website: https://www.haskell.org
	Category: functional
	*/
	function haskell(_M0DE$) {
	   var COMMENT = {
		  variants: [
			 _M0DE$.COMMENT('--', '$'),
			 _M0DE$.COMMENT(
				'{-',
				'-}',
				{
				   contains: ['self']
				}
			 )
		  ]
	   };
	   var PRAGMA = {
		  className: 'meta',
		  begin: '{-#', end: '#-}'
	   };
	   var PREPROCESSOR = {
		  className: 'meta',
		  begin: '^#', end: '$'
	   };
	   var CONSTRUCTOR = {
		  className: 'type',
		  begin: '\\b[A-Z][\\w\']*', // TODO: other constructors (build-in, infix).
		  relevance: 0
	   };
	   var LIST = {
		  begin: '\\(', end: '\\)',
		  illegal: '"',
		  contains: [
			 PRAGMA,
			 PREPROCESSOR,
			 { className: 'type', begin: '\\b[A-Z][\\w]*(\\((\\.\\.|,|\\w+)\\))?' },
			 inherit(_M0DE$.TITLE_MODE, { begin: '[_a-z][\\w\']*' }),
			 COMMENT
		  ]
	   };
	   var RECORD = {
		  begin: '{', end: '}',
		  contains: LIST.contains
	   };
	   return {
		  name: 'Haskell',
		  aliases: ['hs'],
		  keywords:
			 'let in if then else case of where do module import hiding ' +
			 'qualified type data newtype deriving class instance as default ' +
			 'infix infixl infixr foreign export ccall stdcall cplusplus ' +
			 'jvm dotnet safe unsafe family forall mdo proc rec',
		  contains: [
			 // Top-level constructions.
			 {
				beginKeywords: 'module', end: 'where',
				keywords: 'module where',
				contains: [LIST, COMMENT],
				illegal: '\\W\\.|;'
			 },
			 {
				begin: '\\bimport\\b', end: '$',
				keywords: 'import qualified as hiding',
				contains: [LIST, COMMENT],
				illegal: '\\W\\.|;'
			 },
			 {
				className: 'class',
				begin: '^(\\s*)?(class|instance)\\b', end: 'where',
				keywords: 'class family instance where',
				contains: [CONSTRUCTOR, LIST, COMMENT]
			 },
			 {
				className: 'class',
				begin: '\\b(data|(new)?type)\\b', end: '$',
				keywords: 'data family type newtype deriving',
				contains: [PRAGMA, CONSTRUCTOR, LIST, RECORD, COMMENT]
			 },
			 {
				beginKeywords: 'default', end: '$',
				contains: [CONSTRUCTOR, LIST, COMMENT]
			 },
			 {
				beginKeywords: 'infix infixl infixr', end: '$',
				contains: [_M0DE$.C_NUMBER_MODE, COMMENT]
			 },
			 {
				begin: '\\bforeign\\b', end: '$',
				keywords: 'foreign import export ccall stdcall cplusplus jvm ' +
				   'dotnet safe unsafe',
				contains: [CONSTRUCTOR, _M0DE$.QUOTE_STRING_MODE, COMMENT]
			 },
			 {
				className: 'meta',
				begin: '#!\\/usr\\/bin\\/env\ runhaskell', end: '$'
			 },
			 // "Whitespaces".
			 PRAGMA,
			 PREPROCESSOR,
			 // Literals and names.
			 // TODO: characters.
			 _M0DE$.QUOTE_STRING_MODE,
			 _M0DE$.C_NUMBER_MODE,
			 CONSTRUCTOR,
			 inherit(_M0DE$.TITLE_MODE, { begin: '^[_a-z][\\w\']*' }),
			 COMMENT,
			 { begin: '->|<-' } // No markup, relevance booster
		  ]
	   };
	});
 
 registerLanguage('bash',
	/*
	Language: Bash
	Author: vah <vahtenberg@gmail.com>
	Contributrors: Benjamin Pannell <contact@sierrasoftworks.com>
	Website: https://www.gnu.org/software/bash/
	Category: common
	*/
	function bash(_M0DE$) {
	   const VAR = {};
	   const BRACED_VAR = {
		  begin: /\$\{/, end: /\}/,
		  contains: [
			 { begin: /:-/, contains: [VAR] } // default values
		  ]
	   };
	   Object.assign(VAR, {
		  className: 'variable',
		  variants: [
			 { begin: /\$[\w\d#@][\w\d_]*/ },
			 BRACED_VAR
		  ]
	   });
	   const SUBST = {
		  className: 'subst',
		  begin: /\$\(/, end: /\)/,
		  contains: [_M0DE$.BACKSLASH_ESCAPE]
	   };
	   const QUOTE_STRING = {
		  className: 'string',
		  begin: /"/, end: /"/,
		  contains: [
			 _M0DE$.BACKSLASH_ESCAPE,
			 VAR,
			 SUBST
		  ]
	   };
	   SUBST.contains.push(QUOTE_STRING);
	   const ESCAPED_QUOTE = {
		  className: '',
		  begin: /\\"/
 
	   };
	   const APOS_STRING = {
		  className: 'string',
		  begin: /'/, end: /'/
	   };
	   const ARITHMETIC = {
		  begin: /\$\(\(/,
		  end: /\)\)/,
		  contains: [
			 { begin: /\d+#[0-9a-f]+/, className: "number" },
			 _M0DE$.NUMBER_MODE,
			 VAR
		  ]
	   };
	   const SH_LIKE_SHELLS = [
		  "fish","bash","zsh","sh","csh","ksh","tcsh","dash","scsh",
	   ];
	   const KNOWN_SHEBANG = _M0DE$.SHEBANG({
		  binary: `(${SH_LIKE_SHELLS.join("|")})`,
		  relevance: 10
	   });
	   const FUNCTION = {
		  className: 'function',
		  begin: /\w[\w\d_]*\s*\(\s*\)\s*\{/,
		  returnBegin: true,
		  contains: [inherit(_M0DE$.TITLE_MODE, { begin: /\w[\w\d_]*/ })],
		  relevance: 0
	   };
	   return {
		  name: 'Bash',
		  aliases: ['sh', 'zsh'],
		  keywords: {
			 $pattern: /\b-?[a-z\._]+\b/,
			 keyword:
				'if then else elif fi for while in do done case esac function',
			 literal:
				'true false',
			 built_in:
				// Shell built-ins
				// http://www.gnu.org/software/bash/manual/html_node/Shell-Builtin-Commands.html
				'break cd continue eval exec exit export getopts hash pwd readonly return shift test times ' +
				'trap umask unset ' +
				// Bash built-ins
				'alias bind builtin caller command declare echo enable help let local logout mapfile printf ' +
				'read readarray source type typeset ulimit unalias ' +
				// Shell modifiers
				'set shopt ' +
				// Zsh built-ins
				'autoload bg bindkey bye cap chdir clone comparguments compcall compctl compdescribe compfiles ' +
				'compgroups compquote comptags comptry compvalues dirs disable disown echotc echoti emulate ' +
				'fc fg float functions getcap getln history integer jobs kill limit log noglob popd print ' +
				'pushd pushln rehash sched setcap setopt stat suspend ttyctl unfunction unhash unlimit ' +
				'unsetopt vared wait whence where which zcompile zformat zftp zle zmodload zparseopts zprof ' +
				'zpty zregexparse zsocket zstyle ztcp',
			 _:
				'-ne -eq -lt -gt -f -d -e -s -l -a' // relevance booster
		  },
		  contains: [
			 KNOWN_SHEBANG, // to catch known shells and boost relevancy
			 _M0DE$.SHEBANG(), // to catch unknown shells but still highlight the shebang
			 FUNCTION,
			 ARITHMETIC,
			 _M0DE$.HASH_COMMENT_MODE,
			 QUOTE_STRING,
			 ESCAPED_QUOTE,
			 APOS_STRING,
			 VAR
		  ]
	   };
	});
 
 registerLanguage('shell',
	/*
	Language: Shell Session
	Requires: bash.js
	Author: TSUYUSATO Kitsune <make.just.on@gmail.com>
	Category: common
	*/
	function shell() {
	   return {
		  name: 'Shell Session',
		  aliases: ['console'],
		  contains: [
			 {
				className: 'meta',
				begin: '^\\s{0,3}[/\\w\\d\\[\\]()@-]*[>%$#]',
				starts: {
				   end: '$', subLanguage: 'bash'
				}
			 }
		  ]
	   }
	});
 
 registerLanguage('plaintext',
	/*
	Language: Plain text
	Author: Egor Rogov (e.rogov@postgrespro.ru)
	Description: Plain text without any highlighting.
	Category: common
	*/
	function plaintext() {
	   return {
		  name: 'Plain text',
		  aliases: ['text', 'txt'],
		  disableAutodetect: true
	   };
	});
 
 registerLanguage('perl',
	/*
	Language: Perl
	Author: Peter Leonov <gojpeg@yandex.ru>
	Website: https://www.perl.org
	Category: common
	*/
	function perl(_M0DE$) {
	   var PERL_KEYWORDS = {
		  $pattern: /[\w.]+/,
		  keyword: 'getpwent getservent quotemeta msgrcv scalar kill dbmclose undef lc ' +
			 'ma syswrite tr send umask sysopen shmwrite vec qx utime local oct semctl localtime ' +
			 'readpipe do return format read sprintf dbmopen pop getpgrp not getpwnam rewinddir qq ' +
			 'fileno qw endprotoent wait sethostent bless s|0 opendir continue each sleep endgrent ' +
			 'shutdown dump chomp connect getsockname die socketpair close flock exists index shmget ' +
			 'sub for endpwent redo lstat msgctl setpgrp abs exit select print ref gethostbyaddr ' +
			 'unshift fcntl syscall goto getnetbyaddr join gmtime symlink semget splice x|0 ' +
			 'getpeername recv log setsockopt cos last reverse gethostbyname getgrnam study formline ' +
			 'endhostent times chop length gethostent getnetent pack getprotoent getservbyname rand ' +
			 'mkdir pos chmod y|0 substr endnetent printf next open msgsnd readdir use unlink ' +
			 'getsockopt getpriority rindex wantarray hex system getservbyport endservent int chr ' +
			 'untie rmdir prototype tell listen fork shmread ucfirst setprotoent else sysseek link ' +
			 'getgrgid shmctl waitpid unpack getnetbyname reset chdir grep split require caller ' +
			 'lcfirst until warn while values shift telldir getpwuid my getprotobynumber delete and ' +
			 'sort uc defined srand accept package seekdir getprotobyname semop our rename seek if q|0 ' +
			 'chroot sysread setpwent no crypt getc chown sqrt write setnetent setpriority foreach ' +
			 'tie sin msgget map stat getlogin unless elsif truncate exec keys glob tied closedir ' +
			 'ioctl socket readlink eval xor readline binmode setservent eof ord bind alarm pipe ' +
			 'atan2 getgrent exp time push setgrent gt lt or ne m|0 break given say state when'
	   };
	   var SUBST = {
		  className: 'subst',
		  begin: '[$@]\\{', end: '\\}',
		  keywords: PERL_KEYWORDS
	   };
	   var METHOD = {
		  begin: '->{', end: '}'
		  // contains defined later
	   };
	   var VAR = {
		  variants: [
			 { begin: /\$\d/ },
			 { begin: /[\$%@](\^\w\b|#\w+(::\w+)*|{\w+}|\w+(::\w*)*)/ },
			 { begin: /[\$%@][^\s\w{]/, relevance: 0 }
		  ]
	   };
	   var STRING_CONTAINS = [_M0DE$.BACKSLASH_ESCAPE, SUBST, VAR];
	   var PERL_DEFAULT_CONTAINS = [
		  VAR,
		  _M0DE$.HASH_COMMENT_MODE,
		  _M0DE$.COMMENT(
			 '^\\=\\w',
			 '\\=cut',
			 {
				endsWithParent: true
			 }
		  ),
		  METHOD,
		  {
			 className: 'string',
			 contains: STRING_CONTAINS,
			 variants: [
				{ begin: 'q[qwxr]?\\s*\\(', end: '\\)', relevance: 5 },
				{ begin: 'q[qwxr]?\\s*\\[', end: '\\]', relevance: 5 },
				{ begin: 'q[qwxr]?\\s*\\{', end: '\\}', relevance: 5 },
				{ begin: 'q[qwxr]?\\s*\\|', end: '\\|', relevance: 5 },
				{ begin: 'q[qwxr]?\\s*\\<', end: '\\>', relevance: 5 },
				{ begin: 'qw\\s+q'        , end: 'q'  , relevance: 5 },
				{ begin: '\''             , end: '\'' , contains: [_M0DE$.BACKSLASH_ESCAPE] },
				{ begin: '"'              , end: '"' },
				{ begin: '`'              , end: '`'  , contains: [_M0DE$.BACKSLASH_ESCAPE] },
				{ begin: '{\\w+}'                     , contains: [], relevance: 0 },
				{ begin: '\-?\\w+\\s*\\=\\>'          , contains: [], relevance: 0 }
			 ]
		  },
		  {
			 className: 'number',
			 begin: '(\\b0[0-7_]+)|(\\b0x[0-9a-fA-F_]+)|(\\b[1-9][0-9_]*(\\.[0-9_]+)?)|[0_]\\b',
			 relevance: 0
		  },
		  { // regexp container
			 begin: '(\\/\\/|' + _M0DE$.RE_STARTERS_RE + '|\\b(split|return|print|reverse|grep)\\b)\\s*',
			 keywords: 'split return print reverse grep',
			 relevance: 0,
			 contains: [
				_M0DE$.HASH_COMMENT_MODE,
				{
				   className: 'regexp',
				   begin: '(s|tr|y)/(\\\\.|[^/])*/(\\\\.|[^/])*/[a-z]*',
				   relevance: 10
				},
				{
				   className: 'regexp',
				   begin: '(m|qr)?/', end: '/[a-z]*',
				   contains: [_M0DE$.BACKSLASH_ESCAPE],
				   relevance: 0 // allows empty "//" which is a common comment delimiter in other languages
				}
			 ]
		  },
		  {
			 className: 'function',
			 beginKeywords: 'sub', end: '(\\s*\\(.*?\\))?[;{]', excludeEnd: true,
			 relevance: 5,
			 contains: [_M0DE$.TITLE_MODE]
		  },
		  {
			 begin: '-\\w\\b',
			 relevance: 0
		  },
		  {
			 begin: "^__DATA__$",
			 end: "^__END__$",
			 subLanguage: 'mojolicious',
			 contains: [
				{
				   begin: "^@@.*",
				   end: "$",
				   className: "comment"
				}
			 ]
		  }
	   ];
	   SUBST.contains = PERL_DEFAULT_CONTAINS;
	   METHOD.contains = PERL_DEFAULT_CONTAINS;
 
	   return {
		  name: 'Perl',
		  aliases: ['pl', 'pm'],
		  keywords: PERL_KEYWORDS,
		  contains: PERL_DEFAULT_CONTAINS
	   };
	});
 
 registerLanguage('lua',
	/*
	Language: Lua
	Description: Lua is a powerful, efficient, lightweight, embeddable scripting language.
	Author: Andrew Fedorov <dmmdrs@mail.ru>
	Category: common, scripting
	Website: https://www.lua.org
	*/
	function lua(_M0DE$) {
	   var OPENING_LONG_BRACKET = '\\[=*\\[';
	   var CLOSING_LONG_BRACKET = '\\]=*\\]';
	   var LONG_BRACKETS = {
		  begin: OPENING_LONG_BRACKET, end: CLOSING_LONG_BRACKET,
		  contains: ['self']
	   };
	   var COMMENTS = [
		  _M0DE$.COMMENT('--(?!' + OPENING_LONG_BRACKET + ')', '$'),
		  _M0DE$.COMMENT(
			 '--' + OPENING_LONG_BRACKET,
			 CLOSING_LONG_BRACKET,
			 {
				contains: [LONG_BRACKETS],
				relevance: 10
			 }
		  )
	   ];
	   return {
		  name: 'Lua',
		  keywords: {
			 $pattern: _M0DE$.UNDERSCORE_IDENT_RE,
			 literal: "true false nil",
			 keyword: "and break do else elseif end for goto if in local not or repeat return then until while",
			 built_in:
				//Metatags and globals:
				'_G _ENV _VERSION __index __newindex __mode __call __metatable __tostring __len ' +
				'__gc __add __sub __mul __div __mod __pow __concat __unm __eq __lt __le assert ' +
				//Standard methods and properties:
				'collectgarbage dofile error getfenv getmetatable ipairs load loadfile loadstring ' +
				'module next pairs pcall print rawequal rawget rawset require select setfenv ' +
				'setmetatable tonumber tostring type unpack xpcall arg self ' +
				//Library methods and properties (one line per library):
				'coroutine resume yield status wrap create running debug getupvalue ' +
				'debug sethook getmetatable gethook setmetatable setlocal traceback setfenv getinfo setupvalue getlocal getregistry getfenv ' +
				'io lines write close flush open output type read stderr stdin input stdout popen tmpfile ' +
				'math log max acos huge ldexp pi cos tanh pow deg tan cosh sinh random randomseed frexp ceil floor rad abs sqrt modf asin min mod fmod log10 atan2 exp sin atan ' +
				'os exit setlocale date getenv difftime remove time clock tmpname rename execute package preload loadlib loaded loaders cpath config path seeall ' +
				'string sub upper len gfind rep find match char dump gmatch reverse byte format gsub lower ' +
				'table setn insert getn foreachi maxn foreach concat sort remove'
		  },
		  contains: COMMENTS.concat([
			 {
				className: 'function',
				beginKeywords: 'function', end: '\\)',
				contains: [
				   inherit(_M0DE$.TITLE_MODE, { begin: '([_a-zA-Z]\\w*\\.)*([_a-zA-Z]\\w*:)?[_a-zA-Z]\\w*' }),
				   {
					  className: 'params',
					  begin: '\\(', endsWithParent: true,
					  contains: COMMENTS
				   }
				].concat(COMMENTS)
			 },
			 _M0DE$.C_NUMBER_MODE,
			 _M0DE$.APOS_STRING_MODE,
			 _M0DE$.QUOTE_STRING_MODE,
			 {
				className: 'string',
				begin: OPENING_LONG_BRACKET, end: CLOSING_LONG_BRACKET,
				contains: [LONG_BRACKETS],
				relevance: 5
			 }
		  ])
	   };
	});
 
 registerLanguage('nginx',
	/*
	Language: Nginx config
	Author: Peter Leonov <gojpeg@yandex.ru>
	Contributors: Ivan Sagalaev <maniac@softwaremaniacs.org>
	Category: common, config
	Website: https://www.nginx.com
	*/
	function nginx(_M0DE$) {
		var VAR = {
			className: 'variable',
			variants: [
				{ begin: /\$\d+/ },
				{ begin: /\$\{/, end: /}/ },
				{ begin: '[\\$\\@]' + _M0DE$.UNDERSCORE_IDENT_RE }
			]
		};
		var DEFAULT = {
		  endsWithParent: true,
		  keywords: {
			 $pattern: '[a-z/_]+',
			 literal:
				'on off yes no true false none blocked debug info notice warn error crit ' +
				'select break last permanent redirect kqueue rtsig epoll poll /dev/poll'
		  },
		  relevance: 0,
		  illegal: '=>',
		  contains: [
			 _M0DE$.HASH_COMMENT_MODE,
			 {
				className: 'string',
				contains: [_M0DE$.BACKSLASH_ESCAPE, VAR],
				variants: [
				   { begin: /"/, end: /"/ },
				   { begin: /'/, end: /'/ }
				]
			 },
			 // this swallows entire URLs to avoid detecting numbers within
			 {
				begin: '([a-z]+):/', end: '\\s', endsWithParent: true, excludeEnd: true,
				contains: [VAR]
			 },
			 {
				className: 'regexp',
				contains: [_M0DE$.BACKSLASH_ESCAPE, VAR],
				variants: [
				   { begin: "\\s\\^", end: "\\s|{|;", returnEnd: true },
				   // regexp locations (~, ~*)
				   { begin: "~\\*?\\s+", end: "\\s|{|;", returnEnd: true },
				   // *.example.com
				   { begin: "\\*(\\.[a-z\\-]+)+" },
				   // sub.example.*
				   { begin: "([a-z\\-]+\\.)+\\*" }
				]
			 },
			 // IP
			 {
				className: 'number',
				begin: '\\b\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}(:\\d{1,5})?\\b'
			 },
			 // units
			 {
				className: 'number',
				begin: '\\b\\d+[kKmMgGdshdwy]*\\b',
				relevance: 0
			 },
			 VAR
		  ]
	   };
	   return {
		  name: 'Nginx config',
		  aliases: ['nginxconf'],
		  contains: [
			 _M0DE$.HASH_COMMENT_MODE,
			 {
				begin: _M0DE$.UNDERSCORE_IDENT_RE + '\\s+{', returnBegin: true,
				end: '{',
				contains: [
				   {
					  className: 'section',
					  begin: _M0DE$.UNDERSCORE_IDENT_RE
				   }
				],
				relevance: 0
			 },
			 {
				begin: _M0DE$.UNDERSCORE_IDENT_RE + '\\s', end: ';|{', returnBegin: true,
				contains: [
				   {
					  className: 'attribute',
					  begin: _M0DE$.UNDERSCORE_IDENT_RE,
					  starts: DEFAULT
				   }
				],
				relevance: 0
			 }
		  ],
		  illegal: '[^\\s\\}]'
	   };
	});
 
 registerLanguage('kotlin',
	/*
	 Language: Kotlin
	 Description: Kotlin is an OSS statically typed programming language that targets the JVM, Android, JavaScript and Native.
	 Author: Sergey Mashkov <cy6erGn0m@gmail.com>
	 Website: https://kotlinlang.org
	 Category: common
	 */
	function kotlin(_M0DE$) {
	   var KEYWORDS = {
		  keyword:
			 'abstract as val var vararg get set class object open private protected public noinline ' +
			 'crossinline dynamic final enum if else do while for when throw try catch finally ' +
			 'import package is in fun override companion reified inline lateinit init ' +
			 'interface annotation data sealed internal infix operator out by constructor super ' +
			 'tailrec where const inner suspend typealias external expect actual',
		  built_in:
			 'Byte Short Char Int Long Boolean Float Double Void Unit Nothing',
		  literal:
			 'true false null'
	   };
	   var KEYWORDS_WITH_LABEL = {
		  className: 'keyword',
		  begin: /\b(break|continue|return|this)\b/,
		  starts: {
			 contains: [
				{
				   className: 'symbol',
				   begin: /@\w+/
				}
			 ]
		  }
	   };
	   var LABEL = {
		  className: 'symbol', begin: _M0DE$.UNDERSCORE_IDENT_RE + '@'
	   };
	   // for string templates
	   var SUBST = {
		  className: 'subst',
		  begin: '\\${', end: '}', contains: [_M0DE$.C_NUMBER_MODE]
	   };
	   var VARIABLE = {
		  className: 'variable', begin: '\\$' + _M0DE$.UNDERSCORE_IDENT_RE
	   };
	   var STRING = {
		  className: 'string',
		  variants: [
			 {
				begin: '"""', end: '"""(?=[^"])',
				contains: [VARIABLE, SUBST]
			 },
			 // Can't use built-in modes easily, as we want to use STRING in the meta
			 // context as 'meta-string' and there's no syntax to remove explicitly set
			 // classNames in built-in modes.
			 {
				begin: '\'', end: '\'',
				illegal: /\n/,
				contains: [_M0DE$.BACKSLASH_ESCAPE]
			 },
			 {
				begin: '"', end: '"',
				illegal: /\n/,
				contains: [_M0DE$.BACKSLASH_ESCAPE, VARIABLE, SUBST]
			 }
		  ]
	   };
	   SUBST.contains.push(STRING);
 
	   var ANNOTATION_USE_SITE = {
		  className: 'meta', begin: '@(?:file|property|field|get|set|receiver|param|setparam|delegate)\\s*:(?:\\s*' + _M0DE$.UNDERSCORE_IDENT_RE + ')?'
	   };
	   var ANNOTATION = {
		  className: 'meta', begin: '@' + _M0DE$.UNDERSCORE_IDENT_RE,
		  contains: [
			 {
				begin: /\(/, end: /\)/,
				contains: [
				   inherit(STRING, { className: 'meta-string' })
				]
			 }
		  ]
	   };
	   // https://kotlinlang.org/docs/reference/whatsnew11.html#underscores-in-numeric-literals
	   // According to the doc above, the number mode of kotlin is the same as java 8,
	   // so the code below is copied from java.js
	   var KOTLIN_NUMBER_RE = '\\b' +
		  '(' +
		  '0[bB]([01]+[01_]+[01]+|[01]+)' + // 0b...
		  '|' +
		  '0[xX]([a-fA-F0-9]+[a-fA-F0-9_]+[a-fA-F0-9]+|[a-fA-F0-9]+)' + // 0x...
		  '|' +
		  '(' +
		  '([\\d]+[\\d_]+[\\d]+|[\\d]+)(\\.([\\d]+[\\d_]+[\\d]+|[\\d]+))?' +
		  '|' +
		  '\\.([\\d]+[\\d_]+[\\d]+|[\\d]+)' +
		  ')' +
		  '([eE][-+]?\\d+)?' + // octal, decimal, float
		  ')' +
		  '[lLfF]?';
	   var KOTLIN_NUMBER_MODE = {
		  className: 'number',
		  begin: KOTLIN_NUMBER_RE,
		  relevance: 0
	   };
	   var KOTLIN_NESTED_COMMENT = _M0DE$.COMMENT(
		  '/\\*', '\\*/',
		  { contains: [_M0DE$.C_BLOCK_COMMENT_MODE] }
	   );
	   var KOTLIN_PAREN_TYPE = {
		  variants: [
			 {
				className: 'type',
				begin: _M0DE$.UNDERSCORE_IDENT_RE
			 },
			 {
				begin: /\(/, end: /\)/,
				contains: [] //defined later
			 }
		  ]
	   };
	   var KOTLIN_PAREN_TYPE2 = KOTLIN_PAREN_TYPE;
	   KOTLIN_PAREN_TYPE2.variants[1].contains = [KOTLIN_PAREN_TYPE];
	   KOTLIN_PAREN_TYPE.variants[1].contains = [KOTLIN_PAREN_TYPE2];
	   return {
		  name: 'Kotlin',
		  aliases: ['kt'],
		  keywords: KEYWORDS,
		  contains: [
			 _M0DE$.COMMENT(
				'/\\*\\*',
				'\\*/',
				{
				   relevance: 0,
				   contains: [{
					  className: 'doctag',
					  begin: '@[A-Za-z]+'
				   }]
				}
			 ),
			 _M0DE$.C_LINE_COMMENT_MODE,
			 KOTLIN_NESTED_COMMENT,
			 KEYWORDS_WITH_LABEL,
			 LABEL,
			 ANNOTATION_USE_SITE,
			 ANNOTATION,
			 {
				className: 'function',
				beginKeywords: 'fun', end: '[(]|$',
				returnBegin: true,
				excludeEnd: true,
				keywords: KEYWORDS,
				illegal: /fun\s+(<.*>)?[^\s\(]+(\s+[^\s\(]+)\s*=/,
				relevance: 5,
				contains: [
				   {
					  begin: _M0DE$.UNDERSCORE_IDENT_RE + '\\s*\\(', returnBegin: true,
					  relevance: 0,
					  contains: [_M0DE$.UNDERSCORE_TITLE_MODE]
				   },
				   {
					  className: 'type',
					  begin: /</, end: />/, keywords: 'reified',
					  relevance: 0
				   },
				   {
					  className: 'params',
					  begin: /\(/, end: /\)/,
					  endsParent: true,
					  keywords: KEYWORDS,
					  relevance: 0,
					  contains: [
						 {
							begin: /:/, end: /[=,\/]/, endsWithParent: true,
							contains: [
							   KOTLIN_PAREN_TYPE,
							   _M0DE$.C_LINE_COMMENT_MODE,
							   KOTLIN_NESTED_COMMENT
							],
							relevance: 0
						 },
						 _M0DE$.C_LINE_COMMENT_MODE,
						 KOTLIN_NESTED_COMMENT,
						 ANNOTATION_USE_SITE,
						 ANNOTATION,
						 STRING,
						 _M0DE$.C_NUMBER_MODE
					  ]
				   },
				   KOTLIN_NESTED_COMMENT
				]
			 },
			 {
				className: 'class',
				beginKeywords: 'class interface trait', end: /[:\{(]|$/, // remove 'trait' when removed from KEYWORDS
				excludeEnd: true,
				illegal: 'extends implements',
				contains: [
				   { beginKeywords: 'public protected internal private constructor' },
				   _M0DE$.UNDERSCORE_TITLE_MODE,
				   {
					  className: 'type',
					  begin: /</, end: />/, excludeBegin: true, excludeEnd: true,
					  relevance: 0
				   },
				   {
					  className: 'type',
					  begin: /[,:]\s*/, end: /[<\(,]|$/, excludeBegin: true, returnEnd: true
				   },
				   ANNOTATION_USE_SITE,
				   ANNOTATION
				]
			 },
			 STRING,
			 {
				className: 'meta',
				begin: "^#!/usr/bin/env", end: '$',
				illegal: '\n'
			 },
			 KOTLIN_NUMBER_MODE
		  ]
	   };
	});
 
 registerLanguage('smalltalk',
	/*
	Language: Smalltalk
	Description: Smalltalk is an object-oriented, dynamically typed reflective programming language.
	Author: Vladimir Gubarkov <xonixx@gmail.com>
	Website: https://en.wikipedia.org/wiki/Smalltalk
	*/
	function smalltalk(_M0DE$) {
	   var VAR_IDENT_RE = '[a-z][a-zA-Z0-9_]*';
	   var CHAR = {
		  className: 'string',
		  begin: '\\$.{1}'
	   };
	   var SYMBOL = {
		  className: 'symbol',
		  begin: '#' + _M0DE$.UNDERSCORE_IDENT_RE
	   };
	   return {
		  name: 'Smalltalk',
		  aliases: ['st'],
		  keywords: 'self super nil true false thisContext', // only 6
		  contains: [
			 _M0DE$.COMMENT('"', '"'),
			 _M0DE$.APOS_STRING_MODE,
			 {
				className: 'type',
				begin: '\\b[A-Z][A-Za-z0-9_]*',
				relevance: 0
			 },
			 {
				begin: VAR_IDENT_RE + ':',
				relevance: 0
			 },
			 _M0DE$.C_NUMBER_MODE, SYMBOL, CHAR,
			 {
				// This looks more complicated than needed to avoid combinatorial
				// explosion under V8. It effectively means `| var1 var2 ... |` with
				// whitespace adjacent to `|` being optional.
				begin: '\\|[ ]*' + VAR_IDENT_RE + '([ ]+' + VAR_IDENT_RE + ')*[ ]*\\|',
				returnBegin: true, end: /\|/,
				illegal: /\S/,
				contains: [{ begin: '(\\|[ ]*)?' + VAR_IDENT_RE }]
			 },
			 {
				begin: '\\#\\(', end: '\\)',
				contains: [
				   _M0DE$.APOS_STRING_MODE, CHAR,
				   _M0DE$.C_NUMBER_MODE, SYMBOL
				]
			 }
		  ]
	   };
	});
 
 registerLanguage('erlang',
	/*
	Language: Erlang
	Description: Erlang is a general-purpose functional language, with strict evaluation, single assignment, and dynamic typing.
	Author: Nikolay Zakharov <nikolay.desh@gmail.com>, Dmitry Kovega <arhibot@gmail.com>
	Website: https://www.erlang.org
	Category: functional
	*/
	function erlang(_M0DE$) {
	   var BASIC_ATOM_RE = '[a-z\'][a-zA-Z0-9_\']*';
	   var FUNCTION_NAME_RE = '(' + BASIC_ATOM_RE + ':' + BASIC_ATOM_RE + '|' + BASIC_ATOM_RE + ')';
	   var ERLANG_RESERVED = {
		  keyword:
			 'after and andalso|10 band begin bnot bor bsl bzr bxor case catch cond div end fun if ' +
			 'let not of orelse|10 query receive rem try when xor',
		  literal:
			 'false true'
	   };
	   var COMMENT = _M0DE$.COMMENT('%', '$');
	   var NUMBER = {
		  className: 'number',
		  begin: '\\b(\\d+(_\\d+)*#[a-fA-F0-9]+(_[a-fA-F0-9]+)*|\\d+(_\\d+)*(\\.\\d+(_\\d+)*)?([eE][-+]?\\d+)?)',
		  relevance: 0
	   };
	   var NAMED_FUN = {
		  begin: 'fun\\s+' + BASIC_ATOM_RE + '/\\d+'
	   };
	   var FUNCTION_CALL = {
		  begin: FUNCTION_NAME_RE + '\\(', end: '\\)',
		  returnBegin: true,
		  relevance: 0,
		  contains: [
			 {
				begin: FUNCTION_NAME_RE, relevance: 0
			 },
			 {
				begin: '\\(', end: '\\)', endsWithParent: true,
				returnEnd: true,
				relevance: 0
				// "contains" defined later
			 }
		  ]
	   };
	   var TUPLE = {
		  begin: '{', end: '}',
		  relevance: 0
		  // "contains" defined later
	   };
	   var VAR1 = {
		  begin: '\\b_([A-Z][A-Za-z0-9_]*)?',
		  relevance: 0
	   };
	   var VAR2 = {
		  begin: '[A-Z][a-zA-Z0-9_]*',
		  relevance: 0
	   };
	   var RECORD_ACCESS = {
		  begin: '#' + _M0DE$.UNDERSCORE_IDENT_RE,
		  relevance: 0,
		  returnBegin: true,
		  contains: [
			 {
				begin: '#' + _M0DE$.UNDERSCORE_IDENT_RE,
				relevance: 0
			 },
			 {
				begin: '{', end: '}',
				relevance: 0
				// "contains" defined later
			 }
		  ]
	   };
	   var BLOCK_STATEMENTS = {
		  beginKeywords: 'fun receive if try case', end: 'end',
		  keywords: ERLANG_RESERVED
	   };
	   BLOCK_STATEMENTS.contains = [
		  COMMENT,
		  NAMED_FUN,
		  inherit(_M0DE$.APOS_STRING_MODE, { className: '' }),
		  BLOCK_STATEMENTS,
		  FUNCTION_CALL,
		  _M0DE$.QUOTE_STRING_MODE,
		  NUMBER,
		  TUPLE,
		  VAR1, VAR2,
		  RECORD_ACCESS
	   ];
	   var BASIC_MODES = [
		  COMMENT,
		  NAMED_FUN,
		  BLOCK_STATEMENTS,
		  FUNCTION_CALL,
		  _M0DE$.QUOTE_STRING_MODE,
		  NUMBER,
		  TUPLE,
		  VAR1, VAR2,
		  RECORD_ACCESS
	   ];
	   FUNCTION_CALL.contains[1].contains = BASIC_MODES;
	   TUPLE.contains = BASIC_MODES;
	   RECORD_ACCESS.contains[1].contains = BASIC_MODES;
	   var PARAMS = {
		  className: 'params',
		  begin: '\\(', end: '\\)',
		  contains: BASIC_MODES
	   };
	   return {
		  name: 'Erlang',
		  aliases: ['erl'],
		  keywords: ERLANG_RESERVED,
		  illegal: '(</|\\*=|\\+=|-=|/\\*|\\*/|\\(\\*|\\*\\))',
		  contains: [
			 {
				className: 'function',
				begin: '^' + BASIC_ATOM_RE + '\\s*\\(', end: '->',
				returnBegin: true,
				illegal: '\\(|#|//|/\\*|\\\\|:|;',
				contains: [
				   PARAMS,
				   inherit(_M0DE$.TITLE_MODE, { begin: BASIC_ATOM_RE })
				],
				starts: {
				   end: ';|\\.',
				   keywords: ERLANG_RESERVED,
				   contains: BASIC_MODES
				}
			 },
			 COMMENT,
			 {
				begin: '^-', end: '\\.',
				relevance: 0,
				excludeEnd: true,
				returnBegin: true,
				keywords: {
				   $pattern: '-' + _M0DE$.IDENT_RE,
				   keyword: '-module -record -undef -export -ifdef -ifndef -author -copyright -doc -vsn ' +
					  '-import -include -include_lib -compile -define -else -endif -file -behaviour ' +
					  '-behavior -spec'
				},
				contains: [PARAMS]
			 },
			 NUMBER,
			 _M0DE$.QUOTE_STRING_MODE,
			 RECORD_ACCESS,
			 VAR1, VAR2,
			 TUPLE,
			 { begin: /\.$/ } // relevance booster
		  ]
	   };
	});
 
 registerLanguage('diff',
	/*
	Language: Diff
	Description: Unified and context diff
	Author: Vasily Polovnyov <vast@whiteants.net>
	Website: https://www.gnu.org/software/diffutils/
	Category: common
	*/
	function diff() {
	   return {
		  name: 'Diff',
		  aliases: ['patch'],
		  contains: [
			 {
				className: 'meta',
				relevance: 10,
				variants: [
				   { begin: /^@@ +\-\d+,\d+ +\+\d+,\d+ +@@$/ },
				   { begin: /^\*\*\* +\d+,\d+ +\*\*\*\*$/ },
				   { begin: /^\-\-\- +\d+,\d+ +\-\-\-\-$/ }
				]
			 },
			 {
				className: 'comment',
				variants: [
				   { begin: /Index: /, end: /$/ },
				   { begin: /={3,}/, end: /$/ },
				   { begin: /^\-{3}/, end: /$/ },
				   { begin: /^\*{3} /, end: /$/ },
				   { begin: /^\+{3}/, end: /$/ },
				   { begin: /^\*{15}$/ }
				]
			 },
			 { className: 'addition', begin: '^\\+', end: '$' },
			 { className: 'deletion', begin: '^\\-', end: '$' },
			 { className: 'addition', begin: '^\\!', end: '$' }
		  ]
	   };
	});
 
 registerLanguage('sql',
	/*
	 Language: SQL
	 Contributors: Nikolay Lisienko <info@neor.ru>, Heiko August <post@auge8472.de>, Travis Odom <travis.a.odom@gmail.com>, Vadimtro <vadimtro@yahoo.com>, Benjamin Auder <benjamin.auder@gmail.com>
	 Website: https://en.wikipedia.org/wiki/SQL
	 Category: common
	 */
	function sql(_M0DE$) {
	   var COMMENT_MODE = _M0DE$.COMMENT('--', '$');
	   return {
		  name: 'SQL',
		  case_insensitive: true,
		  illegal: /[<>{}*]/,
		  contains: [
			 {
				beginKeywords:
				   'begin end start commit rollback savepoint lock alter create drop rename call ' +
				   'delete do handler insert load replace select truncate update set show pragma grant ' +
				   'merge describe use explain help declare prepare execute deallocate release ' +
				   'unlock purge reset change stop analyze cache flush optimize repair kill ' +
				   'install uninstall checksum restore check backup revoke comment values with',
				end: /;/, endsWithParent: true,
				keywords: {
				   $pattern: /[\w\.]+/,
				   keyword:
					  'as abort abs absolute acc acce accep accept access accessed accessible account acos action activate add ' +
					  'addtime admin administer advanced advise aes_decrypt aes_encrypt after agent aggregate ali alia alias ' +
					  'all allocate allow alter always analyze ancillary and anti any anydata anydataset anyschema anytype apply ' +
					  'archive archived archivelog are as asc ascii asin assembly assertion associate asynchronous at atan ' +
					  'atn2 attr attri attrib attribu attribut attribute attributes audit authenticated authentication authid ' +
					  'authors auto autoallocate autodblink autoextend automatic availability avg backup badfile basicfile ' +
					  'before begin beginning benchmark between bfile bfile_base big bigfile bin binary_double binary_float ' +
					  'binlog bit_and bit_count bit_length bit_or bit_xor bitmap blob_base block blocksize body both bound ' +
					  'bucket buffer_cache buffer_pool build bulk by byte byteordermark bytes cache caching call calling cancel ' +
					  'capacity cascade cascaded case cast catalog category ceil ceiling chain change changed char_base ' +
					  'char_length character_length characters characterset charindex charset charsetform charsetid check ' +
					  'checksum checksum_agg child choose chr chunk class cleanup clear client clob clob_base clone close ' +
					  'cluster_id cluster_probability cluster_set clustering coalesce coercibility col collate collation ' +
					  'collect colu colum column column_value columns columns_updated comment commit compact compatibility ' +
					  'compiled complete composite_limit compound compress compute concat concat_ws concurrent confirm conn ' +
					  'connec connect connect_by_iscycle connect_by_isleaf connect_by_root connect_time connection ' +
					  'consider consistent constant constraint constraints constructor container content contents context ' +
					  'contributors controlfile conv convert convert_tz corr corr_k corr_s corresponding corruption cos cost ' +
					  'count count_big counted covar_pop covar_samp cpu_per_call cpu_per_session crc32 create creation ' +
					  'critical cross cube cume_dist curdate current current_date current_time current_timestamp current_user ' +
					  'cursor curtime customdatum cycle data database databases datafile datafiles datalength date_add ' +
					  'date_cache date_format date_sub dateadd datediff datefromparts datename datepart datetime2fromparts ' +
					  'day day_to_second dayname dayofmonth dayofweek dayofyear days db_role_change dbtimezone ddl deallocate ' +
					  'declare decode decompose decrement decrypt deduplicate def defa defau defaul default defaults ' +
					  'deferred defi defin define degrees delayed delegate delete delete_all delimited demand dense_rank ' +
					  'depth dequeue des_decrypt des_encrypt des_key_file desc descr descri describ describe descriptor ' +
					  'deterministic diagnostics difference dimension direct_load directory disable disable_all ' +
					  'disallow disassociate discardfile disconnect diskgroup distinct distinctrow distribute distributed div ' +
					  'do document domain dotnet double downgrade drop dumpfile duplicate duration each edition editionable ' +
					  'editions element ellipsis else elsif elt empty enable enable_all enclosed encode encoding encrypt ' +
					  'end end-exec endian enforced engine engines enqueue enterprise entityescaping eomonth error errors ' +
					  'escaped evalname evaluate event eventdata events except exception exceptions exchange exclude excluding ' +
					  'execu execut execute exempt exists exit exp expire explain explode export export_set extended extent external ' +
					  'external_1 external_2 externally extract failed failed_login_attempts failover failure far fast ' +
					  'feature_set feature_value fetch field fields file file_name_convert filesystem_like_logging final ' +
					  'finish first first_value fixed flash_cache flashback floor flush following follows for forall force foreign ' +
					  'form forma format found found_rows freelist freelists freepools fresh from from_base64 from_days ' +
					  'ftp full function general generated get get_format get_lock getdate getutcdate global global_name ' +
					  'globally go goto grant grants greatest group group_concat group_id grouping grouping_id groups ' +
					  'gtid_subtract guarantee guard handler hash hashkeys having hea head headi headin heading heap help hex ' +
					  'hierarchy high high_priority hosts hour hours http id ident_current ident_incr ident_seed identified ' +
					  'identity idle_time if ifnull ignore iif ilike ilm immediate import in include including increment ' +
					  'index indexes indexing indextype indicator indices inet6_aton inet6_ntoa inet_aton inet_ntoa infile ' +
					  'initial initialized initially initrans inmemory inner innodb input insert install instance instantiable ' +
					  'instr interface interleaved intersect into invalidate invisible is is_free_lock is_ipv4 is_ipv4_compat ' +
					  'is_not is_not_null is_used_lock isdate isnull isolation iterate java join json json_exists ' +
					  'keep keep_duplicates key keys kill language large last last_day last_insert_id last_value lateral lax lcase ' +
					  'lead leading least leaves left len lenght length less level levels library like like2 like4 likec limit ' +
					  'lines link list listagg little ln load load_file lob lobs local localtime localtimestamp locate ' +
					  'locator lock locked log log10 log2 logfile logfiles logging logical logical_reads_per_call ' +
					  'logoff logon logs long loop low low_priority lower lpad lrtrim ltrim main make_set makedate maketime ' +
					  'managed management manual map mapping mask master master_pos_wait match matched materialized max ' +
					  'maxextents maximize maxinstances maxlen maxlogfiles maxloghistory maxlogmembers maxsize maxtrans ' +
					  'md5 measures median medium member memcompress memory merge microsecond mid migration min minextents ' +
					  'minimum mining minus minute minutes minvalue missing mod mode model modification modify module monitoring month ' +
					  'months mount move movement multiset mutex name name_const names nan national native natural nav nchar ' +
					  'nclob nested never new newline next nextval no no_write_to_binlog noarchivelog noaudit nobadfile ' +
					  'nocheck nocompress nocopy nocycle nodelay nodiscardfile noentityescaping noguarantee nokeep nologfile ' +
					  'nomapping nomaxvalue nominimize nominvalue nomonitoring none noneditionable nonschema noorder ' +
					  'nopr nopro noprom nopromp noprompt norely noresetlogs noreverse normal norowdependencies noschemacheck ' +
					  'noswitch not nothing notice notnull notrim novalidate now nowait nth_value nullif nulls num numb numbe ' +
					  'nvarchar nvarchar2 object ocicoll ocidate ocidatetime ociduration ociinterval ociloblocator ocinumber ' +
					  'ociref ocirefcursor ocirowid ocistring ocitype oct octet_length of off offline offset oid oidindex old ' +
					  'on online only opaque open operations operator optimal optimize option optionally or oracle oracle_date ' +
					  'oradata ord ordaudio orddicom orddoc order ordimage ordinality ordvideo organization orlany orlvary ' +
					  'out outer outfile outline output over overflow overriding package pad parallel parallel_enable ' +
					  'parameters parent parse partial partition partitions pascal passing password password_grace_time ' +
					  'password_lock_time password_reuse_max password_reuse_time password_verify_function patch path patindex ' +
					  'pctincrease pctthreshold pctused pctversion percent percent_rank percentile_cont percentile_disc ' +
					  'performance period period_add period_diff permanent physical pi pipe pipelined pivot pluggable plugin ' +
					  'policy position post_transaction pow power pragma prebuilt precedes preceding precision prediction ' +
					  'prediction_cost prediction_details prediction_probability prediction_set prepare present preserve ' +
					  'prior priority private private_sga privileges procedural procedure procedure_analyze processlist ' +
					  'profiles project prompt protection public publishingservername purge quarter query quick quiesce quota ' +
					  'quotename radians raise rand range rank raw read reads readsize rebuild record records ' +
					  'recover recovery recursive recycle redo reduced ref reference referenced references referencing refresh ' +
					  'regexp_like register regr_avgx regr_avgy regr_count regr_intercept regr_r2 regr_slope regr_sxx regr_sxy ' +
					  'reject rekey relational relative relaylog release release_lock relies_on relocate rely rem remainder rename ' +
					  'repair repeat replace replicate replication required reset resetlogs resize resource respect restore ' +
					  'restricted result result_cache resumable resume retention return returning returns reuse reverse revoke ' +
					  'right rlike role roles rollback rolling rollup round row row_count rowdependencies rowid rownum rows ' +
					  'rtrim rules safe salt sample save savepoint sb1 sb2 sb4 scan schema schemacheck scn scope scroll ' +
					  'sdo_georaster sdo_topo_geometry search sec_to_time second seconds section securefile security seed segment select ' +
					  'self semi sequence sequential serializable server servererror session session_user sessions_per_user set ' +
					  'sets settings sha sha1 sha2 share shared shared_pool short show shrink shutdown si_averagecolor ' +
					  'si_colorhistogram si_featurelist si_positionalcolor si_stillimage si_texture siblings sid sign sin ' +
					  'size size_t sizes skip slave sleep smalldatetimefromparts smallfile snapshot some soname sort soundex ' +
					  'source space sparse spfile split sql sql_big_result sql_buffer_result sql_cache sql_calc_found_rows ' +
					  'sql_small_result sql_variant_property sqlcode sqldata sqlerror sqlname sqlstate sqrt square standalone ' +
					  'standby start starting startup statement static statistics stats_binomial_test stats_crosstab ' +
					  'stats_ks_test stats_mode stats_mw_test stats_one_way_anova stats_t_test_ stats_t_test_indep ' +
					  'stats_t_test_one stats_t_test_paired stats_wsr_test status std stddev stddev_pop stddev_samp stdev ' +
					  'stop storage store stored str str_to_date straight_join strcmp strict string struct stuff style subdate ' +
					  'subpartition subpartitions substitutable substr substring subtime subtring_index subtype success sum ' +
					  'suspend switch switchoffset switchover sync synchronous synonym sys sys_xmlagg sysasm sysaux sysdate ' +
					  'sysdatetimeoffset sysdba sysoper system system_user sysutcdatetime table tables tablespace tablesample tan tdo ' +
					  'template temporary terminated tertiary_weights test than then thread through tier ties time time_format ' +
					  'time_zone timediff timefromparts timeout timestamp timestampadd timestampdiff timezone_abbr ' +
					  'timezone_minute timezone_region to to_base64 to_date to_days to_seconds todatetimeoffset trace tracking ' +
					  'transaction transactional translate translation treat trigger trigger_nestlevel triggers trim truncate ' +
					  'try_cast try_convert try_parse type ub1 ub2 ub4 ucase unarchived unbounded uncompress ' +
					  'under undo unhex unicode uniform uninstall union unique unix_timestamp unknown unlimited unlock unnest unpivot ' +
					  'unrecoverable unsafe unsigned until untrusted unusable unused update updated upgrade upped upper upsert ' +
					  'url urowid usable usage use use_stored_outlines user user_data user_resources users using utc_date ' +
					  'utc_timestamp uuid uuid_short validate validate_password_strength validation valist value values var ' +
					  'var_samp varcharc vari varia variab variabl variable variables variance varp varraw varrawc varray ' +
					  'verify version versions view virtual visible void wait wallet warning warnings week weekday weekofyear ' +
					  'wellformed when whene whenev wheneve whenever where while whitespace window with within without work wrapped ' +
					  'xdb xml xmlagg xmlattributes xmlcast xmlcolattval xmlelement xmlexists xmlforest xmlindex xmlnamespaces ' +
					  'xmlpi xmlquery xmlroot xmlschema xmlserialize xmltable xmltype xor year year_to_month years yearweek',
				   literal:
					  'true false null unknown',
				   built_in:
					  'array bigint binary bit blob bool boolean char character date dec decimal float int int8 integer interval number ' +
					  'numeric real record serial serial8 smallint text time timestamp tinyint varchar varchar2 varying void'
				},
				contains: [
				   {
					  className: 'string',
					  begin: '\'', end: '\'',
					  contains: [{ begin: '\'\'' }]
				   },
				   {
					  className: 'string',
					  begin: '"', end: '"',
					  contains: [{ begin: '""' }]
				   },
				   {
					  className: 'string',
					  begin: '`', end: '`'
				   },
				   _M0DE$.C_NUMBER_MODE,
				   _M0DE$.C_BLOCK_COMMENT_MODE,
				   COMMENT_MODE,
				   _M0DE$.HASH_COMMENT_MODE
				]
			 },
			 _M0DE$.C_BLOCK_COMMENT_MODE,
			 COMMENT_MODE,
			 _M0DE$.HASH_COMMENT_MODE
		  ]
	   };
	});
 
 registerLanguage('vala',
	/*
	Language: Vala
	Author: Antono Vasiljev <antono.vasiljev@gmail.com>
	Description: Vala is a new programming language that aims to bring modern programming language features to GNOME developers without imposing any additional runtime requirements and without using a different ABI compared to applications and libraries written in C.
	Website: https://wiki.gnome.org/Projects/Vala
	*/
	function vala(_M0DE$) {
	   return {
		  name: 'Vala',
		  keywords: {
			 keyword:
				// Value types
				'char uchar unichar int uint long ulong short ushort int8 int16 int32 int64 uint8 ' +
				'uint16 uint32 uint64 float double bool struct enum string void ' +
				// Reference types
				'weak unowned owned ' +
				// Modifiers
				'async signal static abstract interface override virtual delegate ' +
				// Control Structures
				'if while do for foreach else switch case break default return try catch ' +
				// Visibility
				'public private protected internal ' +
				// Other
				'using new this get set const stdout stdin stderr var',
			 built_in:
				'DBus GLib CCode Gee Object Gtk Posix',
			 literal:
				'false true null'
		  },
		  contains: [
			 {
				className: 'class',
				beginKeywords: 'class interface namespace', end: '{', excludeEnd: true,
				illegal: '[^,:\\n\\s\\.]',
				contains: [
				   _M0DE$.UNDERSCORE_TITLE_MODE
				]
			 },
			 _M0DE$.C_LINE_COMMENT_MODE,
			 _M0DE$.C_BLOCK_COMMENT_MODE,
			 {
				className: 'string',
				begin: '"""', end: '"""',
				relevance: 5
			 },
			 _M0DE$.APOS_STRING_MODE,
			 _M0DE$.QUOTE_STRING_MODE,
			 _M0DE$.C_NUMBER_MODE,
			 {
				className: 'meta',
				begin: '^#', end: '$',
				relevance: 2
			 }
		  ]
	   };
	});
 
 registerLanguage('ruby',
	/*
	Language: Ruby
	Description: Ruby is a dynamic, open source programming language with a focus on simplicity and productivity.
	Website: https://www.ruby-lang.org/
	Author: Anton Kovalyov <anton@kovalyov.net>
	Contributors: Peter Leonov <gojpeg@yandex.ru>, Vasily Polovnyov <vast@whiteants.net>, Loren Segal <lsegal@soen.ca>, Pascal Hurni <phi@ruby-reactive.org>, Cedric Sohrauer <sohrauer@googlemail.com>
	Category: common
	*/
	function ruby(_M0DE$) {
	   var RUBY_METHOD_RE = '[a-zA-Z_]\\w*[!?=]?|[-+~]\\@|<<|>>|=~|===?|<=>|[<>]=?|\\*\\*|[-/+%^&*~`|]|\\[\\]=?';
	   var RUBY_KEYWORDS = {
		  keyword:
			 'and then defined module in return redo if BEGIN retry end for self when ' +
			 'next until do begin unless END rescue else break undef not super class case ' +
			 'require yield alias while ensure elsif or include attr_reader attr_writer attr_accessor',
		  literal:
			 'true false nil'
	   };
	   var YARDOCTAG = {
		  className: 'doctag',
		  begin: '@[A-Za-z]+'
	   };
	   var IRB_OBJECT = {
		  begin: '#<', end: '>'
	   };
	   var COMMENT_MODES = [
		  _M0DE$.COMMENT(
			 '#',
			 '$',
			 {
				contains: [YARDOCTAG]
			 }
		  ),
		  _M0DE$.COMMENT(
			 '^\\=begin',
			 '^\\=end',
			 {
				contains: [YARDOCTAG],
				relevance: 10
			 }
		  ),
		  _M0DE$.COMMENT('^__END__', '\\n$')
	   ];
	   var SUBST = {
		  className: 'subst',
		  begin: '#\\{', end: '}',
		  keywords: RUBY_KEYWORDS
	   };
	   var STRING = {
		  className: 'string',
		  contains: [_M0DE$.BACKSLASH_ESCAPE, SUBST],
		  variants: [
			 { begin: /'/, end: /'/ },
			 { begin: /"/, end: /"/ },
			 { begin: /`/, end: /`/ },
			 { begin: '%[qQwWx]?\\(', end: '\\)' },
			 { begin: '%[qQwWx]?\\[', end: '\\]' },
			 { begin: '%[qQwWx]?{', end: '}' },
			 { begin: '%[qQwWx]?<', end: '>' },
			 { begin: '%[qQwWx]?/', end: '/' },
			 { begin: '%[qQwWx]?%', end: '%' },
			 { begin: '%[qQwWx]?-', end: '-' },
			 { begin: '%[qQwWx]?\\|', end: '\\|' },
			 {
				// \B in the beginning suppresses recognition of ?-sequences where ?
				// is the last character of a preceding identifier, as in: `func?4`
				begin: /\B\?(\\\d{1,3}|\\x[A-Fa-f0-9]{1,2}|\\u[A-Fa-f0-9]{4}|\\?\S)\b/
			 },
			 { // heredocs
				begin: /<<[-~]?'?(\w+)(?:.|\n)*?\n\s*\1\b/,
				returnBegin: true,
				contains: [
				   { begin: /<<[-~]?'?/ },
				   _M0DE$.END_SAME_AS_BEGIN({
					  begin: /(\w+)/, end: /(\w+)/,
					  contains: [_M0DE$.BACKSLASH_ESCAPE, SUBST],
				   })
				]
			 }
		  ]
	   };
	   var PARAMS = {
		  className: 'params',
		  begin: '\\(', end: '\\)', endsParent: true,
		  keywords: RUBY_KEYWORDS
	   };
	   var RUBY_DEFAULT_CONTAINS = [
		  STRING,
		  IRB_OBJECT,
		  {
			 className: 'class',
			 beginKeywords: 'class module', end: '$|;',
			 illegal: /=/,
			 contains: [
				inherit(_M0DE$.TITLE_MODE, { begin: '[A-Za-z_]\\w*(::\\w+)*(\\?|\\!)?' }),
				{
				   begin: '<\\s*',
				   contains: [{
					  begin: '(' + _M0DE$.IDENT_RE + '::)?' + _M0DE$.IDENT_RE
				   }]
				}
			 ].concat(COMMENT_MODES)
		  },
		  {
			 className: 'function',
			 beginKeywords: 'def', end: '$|;',
			 contains: [
				inherit(_M0DE$.TITLE_MODE, { begin: RUBY_METHOD_RE }),
				PARAMS
			 ].concat(COMMENT_MODES)
		  },
		  {
			 // swallow namespace qualifiers before symbols
			 begin: _M0DE$.IDENT_RE + '::'
		  },
		  {
			 className: 'symbol',
			 begin: _M0DE$.UNDERSCORE_IDENT_RE + '(\\!|\\?)?:',
			 relevance: 0
		  },
		  {
			 className: 'symbol',
			 begin: ':(?!\\s)',
			 contains: [STRING, { begin: RUBY_METHOD_RE }],
			 relevance: 0
		  },
		  {
			 className: 'number',
			 begin: '(\\b0[0-7_]+)|(\\b0x[0-9a-fA-F_]+)|(\\b[1-9][0-9_]*(\\.[0-9_]+)?)|[0_]\\b',
			 relevance: 0
		  },
		  {
			 begin: '(\\$\\W)|((\\$|\\@\\@?)(\\w+))' // variables
		  },
		  {
			 className: 'params',
			 begin: /\|/, end: /\|/,
			 keywords: RUBY_KEYWORDS
		  },
		  { // regexp container
			 begin: '(' + _M0DE$.RE_STARTERS_RE + '|unless)\\s*',
			 keywords: 'unless',
			 contains: [
				IRB_OBJECT,
				{
				   className: 'regexp',
				   contains: [_M0DE$.BACKSLASH_ESCAPE, SUBST],
				   illegal: /\n/,
				   variants: [
					  { begin: '/', end: '/[a-z]*' },
					  { begin: '%r{', end: '}[a-z]*' },
					  { begin: '%r\\(', end: '\\)[a-z]*' },
					  { begin: '%r!', end: '![a-z]*' },
					  { begin: '%r\\[', end: '\\][a-z]*' }
				   ]
				}
			 ].concat(COMMENT_MODES),
			 relevance: 0
		  }
	   ].concat(COMMENT_MODES);
	   SUBST.contains = RUBY_DEFAULT_CONTAINS;
	   PARAMS.contains = RUBY_DEFAULT_CONTAINS;
	   var SIMPLE_PROMPT = "[>?]>";
	   var DEFAULT_PROMPT = "[\\w#]+\\(\\w+\\):\\d+:\\d+>";
	   var RVM_PROMPT = "(\\w+-)?\\d+\\.\\d+\\.\\d(p\\d+)?[^>]+>";
	   var IRB_DEFAULT = [
		  {
			 begin: /^\s*=>/,
			 starts: {
				end: '$', contains: RUBY_DEFAULT_CONTAINS
			 }
		  },
		  {
			 className: 'meta',
			 begin: '^(' + SIMPLE_PROMPT + "|" + DEFAULT_PROMPT + '|' + RVM_PROMPT + ')',
			 starts: {
				end: '$', contains: RUBY_DEFAULT_CONTAINS
			 }
		  }
	   ];
	   return {
		  name: 'Ruby',
		  aliases: ['rb', 'gemspec', 'podspec', 'thor', 'irb'],
		  keywords: RUBY_KEYWORDS,
		  illegal: /\/\*/,
		  contains: COMMENT_MODES.concat(IRB_DEFAULT).concat(RUBY_DEFAULT_CONTAINS)
	   };
	});
 
 registerLanguage('yaml',
	/*
	Language: YAML
	Description: Yet Another Markdown Language
	Author: Stefan Wienert <stwienert@gmail.com>
	Contributors: Carl Baxter <carl@cbax.tech>
	Requires: ruby.js
	Website: https://yaml.org
	Category: common, config
	*/
	function yaml(_M0DE$) {
	   var LITERALS = 'true false yes no null';
	   // YAML spec allows non-reserved URI characters in tags.
	   var URI_CHARACTERS = '[\\w#;/?:@&=+$,.~*\\\'()[\\]]+';
	   // Define keys as starting with a word character
	   // ...containing word chars, spaces, colons, forward-slashes, hyphens and periods
	   // ...and ending with a colon followed immediately by a space, tab or newline.
	   // The YAML spec allows for much more than this, but this covers most use-cases.
	   var KEY = {
		  className: 'attr',
		  variants: [
			 { begin: '\\w[\\w :\\/.-]*:(?=[ \t]|$)' },
			 { begin: '"\\w[\\w :\\/.-]*":(?=[ \t]|$)' }, // double quoted keys
			 { begin: '\'\\w[\\w :\\/.-]*\':(?=[ \t]|$)' } // single quoted keys
		  ]
	   };
	   var TEMPLATE_VARIABLES = {
		  className: 'template-variable',
		  variants: [
			 { begin: '{{', end: '}}' }, // jinja templates Ansible
			 { begin: '%{', end: '}' } // Ruby i18n
		  ]
	   };
	   var STRING = {
		  className: 'string',
		  relevance: 0,
		  variants: [
			 { begin: /'/, end: /'/ },
			 { begin: /"/, end: /"/ },
			 { begin: /\S+/ }
		  ],
		  contains: [
			 _M0DE$.BACKSLASH_ESCAPE,
			 TEMPLATE_VARIABLES
		  ]
	   };
	   // Strings inside of value containers (objects) can't contain braces,
	   // brackets, or commas
	   var CONTAINER_STRING = inherit(STRING, {
		  variants: [
			 { begin: /'/, end: /'/ },
			 { begin: /"/, end: /"/ },
			 { begin: /[^\s,{}[\]]+/ }
		  ]
	   });
	   var DATE_RE = '[0-9]{4}(-[0-9][0-9]){0,2}';
	   var TIME_RE = '([Tt \\t][0-9][0-9]?(:[0-9][0-9]){2})?';
	   var FRACTION_RE = '(\\.[0-9]*)?';
	   var ZONE_RE = '([ \\t])*(Z|[-+][0-9][0-9]?(:[0-9][0-9])?)?';
	   var TIMESTAMP = {
		  className: 'number',
		  begin: '\\b' + DATE_RE + TIME_RE + FRACTION_RE + ZONE_RE + '\\b'
	   };
	   var VALUE_CONTAINER = {
		  end: ',',
		  endsWithParent: true,
		  excludeEnd: true,
		  contains: [],
		  keywords: LITERALS,
		  relevance: 0
	   };
	   var OBJECT = {
		  begin: '{',
		  end: '}',
		  contains: [VALUE_CONTAINER],
		  illegal: '\\n',
		  relevance: 0
	   };
	   var ARRAY = {
		  begin: '\\[',
		  end: '\\]',
		  contains: [VALUE_CONTAINER],
		  illegal: '\\n',
		  relevance: 0
	   };
	   var MODES = [
		  KEY,
		  {
			 className: 'meta',
			 begin: '^---\s*$',
			 relevance: 10
		  },
		  { // multi line string
			 // Blocks start with a | or > followed by a newline
			 //
			 // Indentation of subsequent lines must be the same to
			 // be considered part of the block
			 className: 'string',
			 begin: '[\\|>]([0-9]?[+-])?[ ]*\\n( *)[\\S ]+\\n(\\2[\\S ]+\\n?)*'
		  },
		  { // Ruby/Rails erb
			 begin: '<%[%=-]?',
			 end: '[%-]?%>',
			 subLanguage: 'ruby',
			 excludeBegin: true,
			 excludeEnd: true,
			 relevance: 0
		  },
		  { // named tags
			 className: 'type',
			 begin: '!\\w+!' + URI_CHARACTERS
		  },
		  // https://yaml.org/spec/1.2/spec.html#id2784064
		  { // verbatim tags
			 className: 'type',
			 begin: '!<' + URI_CHARACTERS + ">"
		  },
		  { // primary tags
			 className: 'type',
			 begin: '!' + URI_CHARACTERS
		  },
		  { // secondary tags
			 className: 'type',
			 begin: '!!' + URI_CHARACTERS
		  },
		  { // fragment id &ref
			 className: 'meta',
			 begin: '&' + _M0DE$.UNDERSCORE_IDENT_RE + '$'
		  },
		  { // fragment reference *ref
			 className: 'meta',
			 begin: '\\*' + _M0DE$.UNDERSCORE_IDENT_RE + '$'
		  },
		  { // array listing
			 className: 'bullet',
			 // TODO: remove |$ hack when we have proper look-ahead support
			 begin: '\\-(?=[ ]|$)',
			 relevance: 0
		  },
		  _M0DE$.HASH_COMMENT_MODE,
		  {
			 beginKeywords: LITERALS,
			 keywords: { literal: LITERALS }
		  },
		  TIMESTAMP,
		  // numbers are any valid C-style number that
		  // sit isolated from other words
		  {
			 className: 'number',
			 begin: _M0DE$.C_NUMBER_RE + '\\b'
		  },
		  OBJECT, ARRAY, STRING
	   ];
	   var VALUE_MODES = [...MODES];
	   VALUE_MODES.pop();
	   VALUE_MODES.push(CONTAINER_STRING);
	   VALUE_CONTAINER.contains = VALUE_MODES;
	   return {
		  name: 'YAML',
		  case_insensitive: true,
		  aliases: ['yml', 'YAML'],
		  contains: MODES
	   };
	});
 
 registerLanguage('rust',
	/*
	Language: Rust
	Author: Andrey Vlasovskikh <andrey.vlasovskikh@gmail.com>
	Contributors: Roman Shmatov <romanshmatov@gmail.com>, Kasper Andersen <kma_untrusted@protonmail.com>
	Website: https://www.rust-lang.org
	Category: common, system
	*/
	function rust(_M0DE$) {
	   var NUM_SUFFIX = '([ui](8|16|32|64|128|size)|f(32|64))\?';
	   var KEYWORDS =
		  'abstract as async await become box break const continue crate do dyn ' +
		  'else enum extern false final fn for if impl in let loop macro match mod ' +
		  'move mut override priv pub ref return self Self static struct super ' +
		  'trait true try type typeof unsafe unsized use virtual where while yield';
	   var BUILTINS =
		  // functions
		  'drop ' +
		  // types
		  'i8 i16 i32 i64 i128 isize ' +
		  'u8 u16 u32 u64 u128 usize ' +
		  'f32 f64 ' +
		  'str char bool ' +
		  'Box Option Result String Vec ' +
		  // traits
		  'Copy Send Sized Sync Drop Fn FnMut FnOnce ToOwned Clone Debug ' +
		  'PartialEq PartialOrd Eq Ord AsRef AsMut Into From Default Iterator ' +
		  'Extend IntoIterator DoubleEndedIterator ExactSizeIterator ' +
		  'SliceConcatExt ToString ' +
		  // macros
		  'assert! assert_eq! bitflags! bytes! cfg! col! concat! concat_idents! ' +
		  'debug_assert! debug_assert_eq! env! panic! file! format! format_args! ' +
		  'include_bin! include_str! line! local_data_key! module_path! ' +
		  'option_env! print! println! select! stringify! try! unimplemented! ' +
		  'unreachable! vec! write! writeln! macro_rules! assert_ne! debug_assert_ne!';
	   return {
		  name: 'Rust',
		  aliases: ['rs'],
		  keywords: {
			 $pattern: _M0DE$.IDENT_RE + '!?',
			 keyword:
				KEYWORDS,
			 literal:
				'true false Some None Ok Err',
			 built_in:
				BUILTINS
		  },
		  illegal: '</',
		  contains: [
			 _M0DE$.C_LINE_COMMENT_MODE,
			 _M0DE$.COMMENT('/\\*', '\\*/', { contains: ['self'] }),
			 inherit(_M0DE$.QUOTE_STRING_MODE, { begin: /b?"/, illegal: null }),
			 {
				className: 'string',
				variants: [
				   { begin: /r(#*)"(.|\n)*?"\1(?!#)/ },
				   { begin: /b?'\\?(x\w{2}|u\w{4}|U\w{8}|.)'/ }
				]
			 },
			 {
				className: 'symbol',
				begin: /'[a-zA-Z_][a-zA-Z0-9_]*/
			 },
			 {
				className: 'number',
				variants: [
				   { begin: '\\b0b([01_]+)' + NUM_SUFFIX },
				   { begin: '\\b0o([0-7_]+)' + NUM_SUFFIX },
				   { begin: '\\b0x([A-Fa-f0-9_]+)' + NUM_SUFFIX },
				   {
					  begin: '\\b(\\d[\\d_]*(\\.[0-9_]+)?([eE][+-]?[0-9_]+)?)' +
						 NUM_SUFFIX
				   }
				],
				relevance: 0
			 },
			 {
				className: 'function',
				beginKeywords: 'fn', end: '(\\(|<)', excludeEnd: true,
				contains: [_M0DE$.UNDERSCORE_TITLE_MODE]
			 },
			 {
				className: 'meta',
				begin: '#\\!?\\[', end: '\\]',
				contains: [
				   {
					  className: 'meta-string',
					  begin: /"/, end: /"/
				   }
				]
			 },
			 {
				className: 'class',
				beginKeywords: 'type', end: ';',
				contains: [
				   inherit(_M0DE$.UNDERSCORE_TITLE_MODE, { endsParent: true })
				],
				illegal: '\\S'
			 },
			 {
				className: 'class',
				beginKeywords: 'trait enum struct union', end: '{',
				contains: [
				   inherit(_M0DE$.UNDERSCORE_TITLE_MODE, { endsParent: true })
				],
				illegal: '[\\w\\d]'
			 },
			 {
				begin: _M0DE$.IDENT_RE + '::',
				keywords: { built_in: BUILTINS }
			 },
			 {
				begin: '->'
			 }
		  ]
	   };
	});
 
 ((/* JS - like */) => {
	const IDENT_RE$1 = '[A-Za-z$_][0-9A-Za-z$_]*';
	const KEYWORDS = [
	   "as", "in", "of", "if", "for", "while", "finally", "var", "new", "function", "do", "return", "void",
	   "else", "break", "catch", "instanceof", "with", "throw", "case", "default", "try", "switch",
	   "continue", "typeof", "delete", "let", "yield", "const", "class",
	   // JS handles these with a special rule
	   // "get", "set",
	   "debugger", "async", "await", "static", "import", "from", "export", "extends"
	];
	const LITERALS = [
	   "true", "false", "null", "undefined", "NaN", "Infinity"
	];
	const TYPES = [
	   "Intl", "DataView", "Number", "Math", "Date", "String", "RegExp", "Object", "Function", "Boolean",
	   "Error", "Symbol", "Set", "Map", "WeakSet", "WeakMap", "Proxy", "Reflect", "JSON", "Promise",
	   "Float64Array", "Int16Array", "Int32Array", "Int8Array", "Uint16Array", "Uint32Array",
	   "Array", "Uint8Array", "Uint8ClampedArray", "Float32Array", "ArrayBuffer"
	];
	const ERROR_TYPES = [
	   "EvalError",
	   "InternalError",
	   "RangeError",
	   "ReferenceError",
	   "SyntaxError",
	   "TypeError",
	   "URIError"
	];
	const BUILT_IN_GLOBALS = [
	   "setInterval", "setTimeout", "clearInterval", "clearTimeout",
	   "eval", "isFinite", "isNaN", "parseFloat", "parseInt", "decodeURI", "decodeURIComponent", "encodeURI", "encodeURIComponent",
	   "require", "exports", "escape", "unescape"
	];
	const BUILT_IN_VARIABLES = [
	   "arguments","this","super","console","window","document","localStorage","module","global"
	];
	const BUILT_INS = [].concat(
	   BUILT_IN_GLOBALS,
	   BUILT_IN_VARIABLES,
	   TYPES,
	   ERROR_TYPES
	);
 
	registerLanguage('typescript',
	   /*
	   Language: TypeScript
	   Author: Panu Horsmalahti <panu.horsmalahti@iki.fi>
	   Contributors: Ike Ku <dempfi@yahoo.com>
	   Description: TypeScript is a strict superset of JavaScript
	   Website: https://www.typescriptlang.org
	   Category: common, scripting
	   */
	   function typescript(_M0DE$) {
		  var TYPES = [
			 "any",
			 "void",
			 "number",
			 "boolean",
			 "string",
			 "object",
			 "never",
			 "enum"
		  ];
		  var TS_SPECIFIC_KEYWORDS = [
			 "type",
			 "namespace",
			 "typedef",
			 "interface",
			 "public",
			 "private",
			 "protected",
			 "implements",
			 "declare",
			 "abstract",
			 "readonly"
		  ];
		  var KEYWORDS$1 = {
			 $pattern: IDENT_RE$1,
			 keyword: KEYWORDS.concat(TS_SPECIFIC_KEYWORDS).join(" "),
			 literal: LITERALS.join(" "),
			 built_in: BUILT_INS.concat(TYPES).join(" ")
		  };
		  var DECORATOR = {
			 className: 'meta',
			 begin: '@' + IDENT_RE$1,
		  };
		  var NUMBER = {
			 className: 'number',
			 variants: [
				{ begin: '\\b(0[bB][01]+)n?' },
				{ begin: '\\b(0[oO][0-7]+)n?' },
				{ begin: _M0DE$.C_NUMBER_RE + 'n?' }
			 ],
			 relevance: 0
		  };
		  var SUBST = {
			className: 'subst',
			begin: '\\$\\{', end: '\\}',
			keywords: KEYWORDS$1,
			contains: []  // defined later
		  };
		  var HTML_TEMPLATE = {
			 begin: 'html`', end: '',
			 starts: {
				end: '`', returnEnd: false,
				contains: [
				   _M0DE$.BACKSLASH_ESCAPE,
				   SUBST
				],
				subLanguage: 'xml',
			 }
		  };
		  var CSS_TEMPLATE = {
			 begin: 'css`', end: '',
			 starts: {
				end: '`', returnEnd: false,
				contains: [
				   _M0DE$.BACKSLASH_ESCAPE,
				   SUBST
				],
				subLanguage: 'css',
			 }
		  };
		  var TEMPLATE_STRING = {
			 className: 'string',
			 begin: '`', end: '`',
			 contains: [
				_M0DE$.BACKSLASH_ESCAPE,
				SUBST
			 ]
		  };
		  SUBST.contains = [
			 _M0DE$.APOS_STRING_MODE,
			 _M0DE$.QUOTE_STRING_MODE,
			 HTML_TEMPLATE,
			 CSS_TEMPLATE,
			 TEMPLATE_STRING,
			 NUMBER,
			 _M0DE$.REGEXP_MODE
		  ];
		  var ARGUMENTS =
		  {
			 begin: '\\(',
			 end: /\)/,
			 keywords: KEYWORDS$1,
			 contains: [
				'self',
				_M0DE$.QUOTE_STRING_MODE,
				_M0DE$.APOS_STRING_MODE,
				_M0DE$.NUMBER_MODE
			 ]
		  };
		  var PARAMS = {
			 className: 'params',
			 begin: /\(/, end: /\)/,
			 excludeBegin: true,
			 excludeEnd: true,
			 keywords: KEYWORDS$1,
			 contains: [
				_M0DE$.C_LINE_COMMENT_MODE,
				_M0DE$.C_BLOCK_COMMENT_MODE,
				DECORATOR,
				ARGUMENTS
			 ]
		  };
		  return {
			 name: 'TypeScript',
			 aliases: ['ts'],
			 keywords: KEYWORDS$1,
			 contains: [
				_M0DE$.SHEBANG(),
				{
				   className: 'meta',
				   begin: /^\s*['"]use strict['"]/
				},
				_M0DE$.APOS_STRING_MODE,
				_M0DE$.QUOTE_STRING_MODE,
				HTML_TEMPLATE,
				CSS_TEMPLATE,
				TEMPLATE_STRING,
				_M0DE$.C_LINE_COMMENT_MODE,
				_M0DE$.C_BLOCK_COMMENT_MODE,
				NUMBER,
				{ // "value" container
				   begin: '(' + _M0DE$.RE_STARTERS_RE + '|\\b(case|return|throw)\\b)\\s*',
				   keywords: 'return throw case',
				   contains: [
					  _M0DE$.C_LINE_COMMENT_MODE,
					  _M0DE$.C_BLOCK_COMMENT_MODE,
					  _M0DE$.REGEXP_MODE,
					  {
						 className: 'function',
						 // we have to count the parens to make sure we actually have the
						 // correct bounding ( ) before the =>.  There could be any number of
						 // sub-expressions inside also surrounded by parens.
						 begin: '(\\([^(]*' +
							'(\\([^(]*' +
							'(\\([^(]*' +
							'\\))?' +
							'\\))?' +
							'\\)|' + _M0DE$.UNDERSCORE_IDENT_RE + ')\\s*=>', returnBegin: true,
						 end: '\\s*=>',
						 contains: [
							{
							   className: 'params',
							   variants: [
								  {
									 begin: _M0DE$.UNDERSCORE_IDENT_RE
								  },
								  {
									 className: null,
									 begin: /\(\s*\)/,
									 skip: true
								  },
								  {
									 begin: /\(/, end: /\)/,
									 excludeBegin: true, excludeEnd: true,
									 keywords: KEYWORDS$1,
									 contains: ARGUMENTS.contains
								  }
							   ]
							}
						 ]
					  }
				   ],
				   relevance: 0
				},
				{
				   className: 'function',
				   beginKeywords: 'function', end: /[\{;]/, excludeEnd: true,
				   keywords: KEYWORDS$1,
				   contains: [
					  'self',
					  inherit(_M0DE$.TITLE_MODE, { begin: IDENT_RE$1 }),
					  PARAMS
				   ],
				   illegal: /%/,
				   relevance: 0 // () => {} is more typical in TypeScript
				},
				{
				   beginKeywords: 'constructor', end: /[\{;]/, excludeEnd: true,
				   contains: [ 'self', PARAMS ]
				},
				{ // prevent references like module.id from being higlighted as module definitions
				   begin: /module\./,
				   keywords: { built_in: 'module' },
				   relevance: 0
				},
				{
				   beginKeywords: 'module', end: /\{/, excludeEnd: true
				},
				{
				   beginKeywords: 'interface', end: /\{/, excludeEnd: true,
				   keywords: 'interface extends'
				},
				{
				   begin: /\$[(.]/ // relevance booster for a pattern common to JS libs: `$(something)` and `$.something`
				},
				{
				   begin: '\\.' + _M0DE$.IDENT_RE, relevance: 0 // hack: prevents detection of keywords after dots
				},
				DECORATOR,
				ARGUMENTS
			 ]
		  };
	   });
 
	registerLanguage('javascript',
	   /*
	   Language: JavaScript
	   Description: JavaScript (JS) is a lightweight, interpreted, or just-in-time compiled programming language with first-class functions.
	   Category: common, scripting
	   Website: https://developer.mozilla.org/en-US/docs/Web/JavaScript
	   */
	   function javascript(_M0DE$) {
		  var FRAGMENT = {
			 begin: '<>',
			 end: '</>'
		  };
		  var XML_TAG = {
			 begin: /<[A-Za-z0-9\\._:-]+/,
			 end: /\/[A-Za-z0-9\\._:-]+>|\/>/
		  };
		  var KEYWORDS$1 = {
			 $pattern: IDENT_RE$1,
			 keyword: KEYWORDS.join(" "),
			 literal: LITERALS.join(" "),
			 built_in: BUILT_INS.join(" ")
		  };
		  var NUMBER = {
			 className: 'number',
			 variants: [
				{ begin: '\\b(0[bB][01]+)n?' },
				{ begin: '\\b(0[oO][0-7]+)n?' },
				{ begin: _M0DE$.C_NUMBER_RE + 'n?' }
			 ],
			 relevance: 0
		  };
		  var SUBST = {
			className: 'subst',
			begin: '\\$\\{', end: '\\}',
			keywords: KEYWORDS$1,
			contains: []  // defined later
		  };
		  var HTML_TEMPLATE = {
			 begin: 'html`', end: '',
			 starts: {
				end: '`', returnEnd: false,
				contains: [
				   _M0DE$.BACKSLASH_ESCAPE, SUBST
				],
				subLanguage: 'xml',
			 }
		  };
		  var CSS_TEMPLATE = {
			 begin: 'css`', end: '',
			 starts: {
				end: '`', returnEnd: false,
				contains: [
				   _M0DE$.BACKSLASH_ESCAPE, SUBST
				],
				subLanguage: 'css',
			 }
		  };
		  var TEMPLATE_STRING = {
			 className: 'string',
			 begin: '`', end: '`',
			 contains: [
				_M0DE$.BACKSLASH_ESCAPE, SUBST
			 ]
		  };
		  SUBST.contains = [
			 _M0DE$.APOS_STRING_MODE,
			 _M0DE$.QUOTE_STRING_MODE,
			 HTML_TEMPLATE,
			 CSS_TEMPLATE,
			 TEMPLATE_STRING,
			 NUMBER,
			 _M0DE$.REGEXP_MODE
		  ];
		  var PARAMS_CONTAINS = SUBST.contains.concat([
			 // eat recursive parens in sub expressions
			 {
				begin: /\(/, end: /\)/,
				contains: ["self"].concat(SUBST.contains, [_M0DE$.C_BLOCK_COMMENT_MODE, _M0DE$.C_LINE_COMMENT_MODE])
			 },
			 _M0DE$.C_BLOCK_COMMENT_MODE,
			 _M0DE$.C_LINE_COMMENT_MODE
		  ]);
		  var PARAMS = {
			 className: 'params',
			 begin: /\(/, end: /\)/,
			 excludeBegin: true,
			 excludeEnd: true,
			 contains: PARAMS_CONTAINS
		  };
		  return {
			 name: 'JavaScript',
			 aliases: ['js', 'jsx', 'mjs', 'cjs'],
			 keywords: KEYWORDS$1,
			 contains: [
				_M0DE$.SHEBANG({
				   binary: "node",
				   relevance: 5
				}),
				{
				   className: 'meta',
				   relevance: 10,
				   begin: /^\s*['"]use (strict|asm)['"]/
				},
				_M0DE$.APOS_STRING_MODE,
				_M0DE$.QUOTE_STRING_MODE,
				HTML_TEMPLATE,
				CSS_TEMPLATE,
				TEMPLATE_STRING,
				_M0DE$.C_LINE_COMMENT_MODE,
				_M0DE$.COMMENT(
				   '/\\*\\*',
				   '\\*/',
				   {
					  relevance: 0,
					  contains: [
						 {
							className: 'doctag',
							begin: '@[A-Za-z]+',
							contains: [
							   {
								  className: 'type',
								  begin: '\\{',
								  end: '\\}',
								  relevance: 0
							   },
							   {
								  className: 'variable',
								  begin: IDENT_RE$1 + '(?=\\s*(-)|$)',
								  endsParent: true,
								  relevance: 0
							   },
							   // eat spaces (not newlines) so we can find
							   // types or variables
							   {
								  begin: /(?=[^\n])\s/,
								  relevance: 0
							   },
							]
						 }
					  ]
				   }
				),
				_M0DE$.C_BLOCK_COMMENT_MODE, NUMBER,
				{ // object attr container
				   begin: concatStr(/[{,\n]\s*/,
					  // we need to look ahead to make sure that we actually have an
					  // attribute coming up so we don't steal a comma from a potential
					  // "value" container
					  //
					  // NOTE: this might not work how you think.  We don't actually always
					  // enter this mode and stay.  Instead it might merely match `,
					  // <comments up next>` and then immediately end after the , because it
					  // fails to find any actual attrs. But this still does the job because
					  // it prevents the value contain rule from grabbing this instead and
					  // prevening this rule from firing when we actually DO have keys.
					  lookahead(concatStr(
						 // we also need to allow for multiple possible comments inbetween
						 // the first key:value pairing
						 /(((\/\/.*$)|(\/\*(.|\n)*\*\/))\s*)*/,
						 IDENT_RE$1 + '\\s*:'))),
				   relevance: 0,
				   contains: [
					  {
						 className: 'attr',
						 begin: IDENT_RE$1 + lookahead('\\s*:'),
						 relevance: 0,
					  },
				   ]
				},
				{ // "value" container
				   begin: '(' + _M0DE$.RE_STARTERS_RE + '|\\b(case|return|throw)\\b)\\s*',
				   keywords: 'return throw case',
				   contains: [
					  _M0DE$.C_LINE_COMMENT_MODE,
					  _M0DE$.C_BLOCK_COMMENT_MODE,
					  _M0DE$.REGEXP_MODE,
					  {
						 className: 'function',
						 // we have to count the parens to make sure we actually have the
						 // correct bounding ( ) before the =>.  There could be any number of
						 // sub-expressions inside also surrounded by parens.
						 begin: '(\\([^(]*' +
							'(\\([^(]*' +
							'(\\([^(]*' +
							'\\))?' +
							'\\))?' +
							'\\)|' + _M0DE$.UNDERSCORE_IDENT_RE + ')\\s*=>', returnBegin: true,
						 end: '\\s*=>',
						 contains: [
							{
							   className: 'params',
							   variants: [
								  {
									 begin: _M0DE$.UNDERSCORE_IDENT_RE
								  },
								  {
									 className: null,
									 begin: /\(\s*\)/,
									 skip: true
								  },
								  {
									 begin: /\(/, end: /\)/,
									 excludeBegin: true, excludeEnd: true,
									 keywords: KEYWORDS$1,
									 contains: PARAMS_CONTAINS
								  }
							   ]
							}
						 ]
					  },
					  { // could be a comma delimited list of params to a function call
						 begin: /,/, relevance: 0,
					  },
					  {
						 className: '',
						 begin: /\s/,
						 end: /\s*/,
						 skip: true,
					  },
					  { // JSX
						 variants: [
							{ begin: FRAGMENT.begin, end: FRAGMENT.end },
							{ begin: XML_TAG.begin, end: XML_TAG.end }
						 ],
						 subLanguage: 'xml',
						 contains: [
							{
							   begin: XML_TAG.begin, end: XML_TAG.end, skip: true,
							   contains: ['self']
							}
						 ]
					  },
				   ],
				   relevance: 0
				},
				{
				   className: 'function',
				   beginKeywords: 'function', end: /\{/, excludeEnd: true,
				   contains: [
					  inherit(_M0DE$.TITLE_MODE, { begin: IDENT_RE$1 }),
					  PARAMS
				   ],
				   illegal: /\[|%/
				},
				{
				   begin: /\$[(.]/ // relevance booster for a pattern common to JS libs: `$(something)` and `$.something`
				},
				_M0DE$.METHOD_GUARD,
				{ // ES6 class
				   className: 'class',
				   beginKeywords: 'class', end: /[{;=]/, excludeEnd: true,
				   illegal: /[:"\[\]]/,
				   contains: [
					  { beginKeywords: 'extends' },
					  _M0DE$.UNDERSCORE_TITLE_MODE
				   ]
				},
				{
				   beginKeywords: 'constructor', end: /\{/, excludeEnd: true
				},
				{
				   begin: '(get|set)\\s+(?=' + IDENT_RE$1 + '\\()',
				   end: /{/,
				   keywords: "get set",
				   contains: [
					  inherit(_M0DE$.TITLE_MODE, { begin: IDENT_RE$1 }),
					  { begin: /\(\)/ }, // eat to avoid empty params
					  PARAMS
				   ]
				}
			 ],
			 illegal: /#(?!!)/
		  };
	   });
	
	registerLanguage('coffeescript',
	   /*
	   Language: CoffeeScript
	   Author: Dmytrii Nagirniak <dnagir@gmail.com>
	   Contributors: Oleg Efimov <efimovov@gmail.com>, Cédric Néhémie <cedric.nehemie@gmail.com>
	   Description: CoffeeScript is a programming language that transcompiles to JavaScript. For info about language see http://coffeescript.org/
	   Category: common, scripting
	   Website: https://coffeescript.org
	   */
	   function coffeescript(_M0DE$) {
		 var COFFEE_BUILT_INS = ['npm','print'];
		 var COFFEE_LITERALS = ['yes','no','on','off'];
		 var COFFEE_KEYWORDS = ['then','unless','until','loop','by','when','and','or','is','isnt','not'];
		 var NOT_VALID_KEYWORDS = ["var", "const","let","function","static" ];
		 var excluding = (list) =>
		   (kw) => !list.includes(kw);
		 var KEYWORDS$1 = {
		   keyword: KEYWORDS.concat(COFFEE_KEYWORDS).filter(excluding(NOT_VALID_KEYWORDS)).join(" "),
		   literal: LITERALS.concat(COFFEE_LITERALS).join(" "),
		   built_in: BUILT_INS.concat(COFFEE_BUILT_INS).join(" ")
		 };
		 var JS_IDENT_RE = '[A-Za-z$_][0-9A-Za-z$_]*';
		 var SUBST = {
		   className: 'subst',
		   begin: /#\{/, end: /}/,
		   keywords: KEYWORDS$1
		 };
		 var EXPRESSIONS = [
		   _M0DE$.BINARY_NUMBER_MODE,
		   inherit(_M0DE$.C_NUMBER_MODE, {starts: {end: '(\\s*/)?', relevance: 0}}), // a number tries to eat the following slash to prevent treating it as a regexp
		   {
			 className: 'string',
			 variants: [
			   { begin: /'''/, end: /'''/,
				 contains: [_M0DE$.BACKSLASH_ESCAPE]
			   },
			   { begin: /'/, end: /'/,
				 contains: [_M0DE$.BACKSLASH_ESCAPE]
			   },
			   { begin: /"""/, end: /"""/,
				 contains: [_M0DE$.BACKSLASH_ESCAPE, SUBST]
			   },
			   { begin: /"/, end: /"/,
				 contains: [_M0DE$.BACKSLASH_ESCAPE, SUBST]
			   }
			 ]
		   },
		   {
			 className: 'regexp',
			 variants: [
			   { begin: '///', end: '///',
				 contains: [SUBST, _M0DE$.HASH_COMMENT_MODE]
			   },
			   { begin: '//[gim]{0,3}(?=\\W)',
				 relevance: 0
			   },
			   {
				 // regex can't start with space to parse x / 2 / 3 as two divisions
				 // regex can't start with *, and it supports an "illegal" in the main mode
				 begin: /\/(?![ *]).*?(?![\\]).\/[gim]{0,3}(?=\W)/
			   }
			 ]
		   },
		   { 
			 begin: '@' + JS_IDENT_RE // relevance booster
		   },
		   {
			 subLanguage: 'javascript',
			 excludeBegin: true, excludeEnd: true,
			 variants: [
			   { begin: '```', end: '```' },
			   { begin: '`', end: '`' }
			 ]
		   }
		 ];
		 SUBST.contains = EXPRESSIONS;
	 
		 var TITLE = inherit(_M0DE$.TITLE_MODE, {begin: JS_IDENT_RE});
		 var PARAMS_RE = '(\\(.*\\))?\\s*\\B[-=]>';
		 var PARAMS = {
		   className: 'params',
		   begin: '\\([^\\(]', returnBegin: true,
		   /* We need another contained nameless mode to not have every nested
		   pair of parens to be called "params" */
		   contains: [{
			 begin: /\(/, end: /\)/,
			 keywords: KEYWORDS$1,
			 contains: ['self'].concat(EXPRESSIONS)
		   }]
		 };
		 return {
		   name: 'CoffeeScript',
		   aliases: ['coffee', 'cson', 'iced'],
		   keywords: KEYWORDS$1,
		   illegal: /\/\*/,
		   contains: EXPRESSIONS.concat([
			 _M0DE$.COMMENT('###', '###'),
			 _M0DE$.HASH_COMMENT_MODE,
			 {
			   className: 'function',
			   begin: '^\\s*' + JS_IDENT_RE + '\\s*=\\s*' + PARAMS_RE, end: '[-=]>',
			   returnBegin: true,
			   contains: [TITLE, PARAMS]
			 },
			 {// anonymous function start
			   begin: /[:\(,=]\s*/,
			   relevance: 0,
			   contains: [
				 {
				   className: 'function',
				   begin: PARAMS_RE, end: '[-=]>',
				   returnBegin: true,
				   contains: [PARAMS]
				 }
			   ]
			 },
			 {
			   className: 'class',
			   beginKeywords: 'class',
			   end: '$',
			   illegal: /[:="\[\]]/,
			   contains: [
				 {
				   beginKeywords: 'extends',
				   endsWithParent: true,
				   illegal: /[:="\[\]]/,
				   contains: [TITLE]
				 },
				 TITLE
			   ]
			 },
			 {
			   begin: JS_IDENT_RE + ':', end: ':',
			   returnBegin: true, returnEnd: true,
			   relevance: 0
			 }
		   ])
		 };
	   });
 })();

 registerLanguage('clojure',
   /*
   Language: Clojure
   Description: Clojure syntax (based on lisp.js)
   Author: mfornos
   Website: https://clojure.org
   Category: lisp
   */
   function clojure(_M0DE$) {
	 var SYMBOLSTART = 'a-zA-Z_\\-!.?+*=<>&#\'';
	 var SYMBOL_RE = '[' + SYMBOLSTART + '][' + SYMBOLSTART + '0-9/;:]*';
	 var globals = 'def defonce defprotocol defstruct defmulti defmethod defn- defn defmacro deftype defrecord';
	 var keywords = {
	   $pattern: SYMBOL_RE,
	   'builtin-name':
		 // Clojure keywords
		 globals + ' ' +
		 'cond apply if-not if-let if not not= = < > <= >= == + / * - rem ' +
		 'quot neg? pos? delay? symbol? keyword? true? false? integer? empty? coll? list? ' +
		 'set? ifn? fn? associative? sequential? sorted? counted? reversible? number? decimal? ' +
		 'class? distinct? isa? float? rational? reduced? ratio? odd? even? char? seq? vector? ' +
		 'string? map? nil? contains? zero? instance? not-every? not-any? libspec? -> ->> .. . ' +
		 'inc compare do dotimes mapcat take remove take-while drop letfn drop-last take-last ' +
		 'drop-while while intern condp case reduced cycle split-at split-with repeat replicate ' +
		 'iterate range merge zipmap declare line-seq sort comparator sort-by dorun doall nthnext ' +
		 'nthrest partition eval doseq await await-for let agent atom send send-off release-pending-sends ' +
		 'add-watch mapv filterv remove-watch agent-error restart-agent set-error-handler error-handler ' +
		 'set-error-mode! error-mode shutdown-agents quote var fn loop recur throw try monitor-enter ' +
		 'monitor-exit macroexpand macroexpand-1 for dosync and or ' +
		 'when when-not when-let comp juxt partial sequence memoize constantly complement identity assert ' +
		 'peek pop doto proxy first rest cons cast coll last butlast ' +
		 'sigs reify second ffirst fnext nfirst nnext meta with-meta ns in-ns create-ns import ' +
		 'refer keys select-keys vals key val rseq name namespace promise into transient persistent! conj! ' +
		 'assoc! dissoc! pop! disj! use class type num float double short byte boolean bigint biginteger ' +
		 'bigdec print-method print-dup throw-if printf format load compile get-in update-in pr pr-on newline ' +
		 'flush read slurp read-line subvec with-open memfn time re-find re-groups rand-int rand mod locking ' +
		 'assert-valid-fdecl alias resolve ref deref refset swap! reset! set-validator! compare-and-set! alter-meta! ' +
		 'reset-meta! commute get-validator alter ref-set ref-history-count ref-min-history ref-max-history ensure sync io! ' +
		 'new next conj set! to-array future future-call into-array aset gen-class reduce map filter find empty ' +
		 'hash-map hash-set sorted-map sorted-map-by sorted-set sorted-set-by vec vector seq flatten reverse assoc dissoc list ' +
		 'disj get union difference intersection extend extend-type extend-protocol int nth delay count concat chunk chunk-buffer ' +
		 'chunk-append chunk-first chunk-rest max min dec unchecked-inc-int unchecked-inc unchecked-dec-inc unchecked-dec unchecked-negate ' +
		 'unchecked-add-int unchecked-add unchecked-subtract-int unchecked-subtract chunk-next chunk-cons chunked-seq? prn vary-meta ' +
		 'lazy-seq spread list* str find-keyword keyword symbol gensym force rationalize'
	 };
	 var SIMPLE_NUMBER_RE = '[-+]?\\d+(\\.\\d+)?';
	 var SYMBOL = {
	   begin: SYMBOL_RE,
	   relevance: 0
	 };
	 var NUMBER = {
	   className: 'number', begin: SIMPLE_NUMBER_RE,
	   relevance: 0
	 };
	 var STRING = inherit(_M0DE$.QUOTE_STRING_MODE, {illegal: null});
	 var COMMENT = _M0DE$.COMMENT(';', '$', { relevance: 0 } );
	 var LITERAL = {
	   className: 'literal',
	   begin: /\b(true|false|nil)\b/
	 };
	 var COLLECTION = {
	   begin: '[\\[\\{]', end: '[\\]\\}]'
	 };
	 var HINT = {
	   className: 'comment',
	   begin: '\\^' + SYMBOL_RE
	 };
	 var HINT_COL = _M0DE$.COMMENT('\\^\\{', '\\}');
	 var KEY = {
	   className: 'symbol',
	   begin: '[:]{1,2}' + SYMBOL_RE
	 };
	 var LIST = {
	   begin: '\\(', end: '\\)'
	 };
	 var BODY = {
	   endsWithParent: true,
	   relevance: 0
	 };
	 var NAME = {
	   keywords: keywords,
	   className: 'name', begin: SYMBOL_RE,
	   starts: BODY
	 };
	 var DEFAULT_CONTAINS = [LIST, STRING, HINT, HINT_COL, COMMENT, KEY, COLLECTION, NUMBER, LITERAL, SYMBOL];
 
	 var GLOBAL = {
	   beginKeywords: globals,
	   lexemes: SYMBOL_RE,
	   end: '(\\[|\\#|\\d|"|:|\\{|\\)|\\(|$)',
	   contains: [
		 {
		   className: 'title',
		   begin: SYMBOL_RE,
		   relevance: 0,
		   excludeEnd: true,
		   // we can only have a single title
		   endsParent: true
		 },
	   ].concat(DEFAULT_CONTAINS)
	 };
 
	 LIST.contains = [_M0DE$.COMMENT('comment', ''), GLOBAL, NAME, BODY];
	 BODY.contains = DEFAULT_CONTAINS;
	 COLLECTION.contains = DEFAULT_CONTAINS;
	 HINT_COL.contains = [COLLECTION];
 
	 return {
	   name: 'Clojure',
	   aliases: ['clj'],
	   illegal: /\S/,
	   contains: [LIST, STRING, HINT, HINT_COL, COMMENT, KEY, COLLECTION, NUMBER, LITERAL]
	 };
   });
 
 registerLanguage('clojure-repl',
   /*
   Language: Clojure REPL
   Description: Clojure REPL sessions
   Author: Ivan Sagalaev <maniac@softwaremaniacs.org>
   Requires: clojure.js
   Website: https://clojure.org
   Category: lisp
   */
   function clojureRepl(_M0DE$) {
	 return {
	   name: 'Clojure REPL',
	   contains: [
		 {
		   className: 'meta',
		   begin: /^([\w.-]+|\s*#_)?=>/,
		   starts: {
			 end: /$/,
			 subLanguage: 'clojure'
		   }
		 }
	   ]
	 }
   });

 registerLanguage('go',
	/*
	Language: Go
	Author: Stephan Kountso aka StepLg <steplg@gmail.com>
	Contributors: Evgeny Stepanischev <imbolk@gmail.com>
	Description: Google go language (golang). For info about language
	Website: http://golang.org/
	Category: common, system
	*/
	function go(_M0DE$) {
	   var GO_KEYWORDS = {
		  keyword:
			 'break default func interface select case map struct chan else goto package switch ' +
			 'const fallthrough if range type continue for import return var go defer ' +
			 'bool byte complex64 complex128 float32 float64 int8 int16 int32 int64 string uint8 ' +
			 'uint16 uint32 uint64 int uint uintptr rune',
		  literal:
			 'true false iota nil',
		  built_in:
			 'append cap close complex copy imag len make new panic print println real recover delete'
	   };
	   return {
		  name: 'Go',
		  aliases: ['golang'],
		  keywords: GO_KEYWORDS,
		  illegal: '</',
		  contains: [
			 _M0DE$.C_LINE_COMMENT_MODE,
			 _M0DE$.C_BLOCK_COMMENT_MODE,
			 {
				className: 'string',
				variants: [
				   _M0DE$.QUOTE_STRING_MODE,
				   _M0DE$.APOS_STRING_MODE,
				   { begin: '`', end: '`' },
				]
			 },
			 {
				className: 'number',
				variants: [
				   { begin: _M0DE$.C_NUMBER_RE + '[i]', relevance: 1 },
				   _M0DE$.C_NUMBER_MODE
				]
			 },
			 {
				begin: /:=/ // relevance booster
			 },
			 {
				className: 'function',
				beginKeywords: 'func', end: '\\s*(\\{|$)', excludeEnd: true,
				contains: [
				   _M0DE$.TITLE_MODE,
				   {
					  className: 'params',
					  begin: /\(/, end: /\)/,
					  keywords: GO_KEYWORDS,
					  illegal: /["']/
				   }
				]
			 }
		  ]
	   };
	});
 
 registerLanguage('c',
	/*
	Language: C
	Category: common, system
	Website: https://en.wikipedia.org/wiki/C_(programming_language)
	Requires: c-like.js
	*/
	function c() {
	   var lang = getLanguage('c-like').rawDefinition();
	   // Until C is actually different than C++ there is no reason to auto-detect C
	   // as it's own language since it would just fail auto-detect testing or
	   // simply match with C++.
	   //
	   // See further comments in c-like.js.
	   lang.disableAutodetect = false;
	   lang.name = 'C';
	   lang.aliases = ['c', 'h'];
	   return lang;
	});
 
 registerLanguage('xml',
	/*
	Language: HTML, XML
	Website: https://www.w3.org/XML/
	Category: common
	*/
	function xml(_M0DE$) {
	   var XML_IDENT_RE = '[A-Za-z0-9\\._:-]+';
	   var XML_ENTITIES = {
		  className: 'symbol',
		  begin: '&[a-z]+;|&#[0-9]+;|&#x[a-f0-9]+;'
	   };
	   var XML_META_KEYWORDS = {
		  begin: '\\s',
		  contains: [
			 {
				className: 'meta-keyword',
				begin: '#?[a-z_][a-z1-9_-]+',
				illegal: '\\n',
			 }
		  ]
	   };
	   var XML_META_PAR_KEYWORDS = inherit(XML_META_KEYWORDS, { begin: '\\(', end: '\\)' });
	   var APOS_META_STRING_MODE = inherit(_M0DE$.APOS_STRING_MODE, { className: 'meta-string' });
	   var QUOTE_META_STRING_MODE = inherit(_M0DE$.QUOTE_STRING_MODE, { className: 'meta-string' });
	   var TAG_INTERNALS = {
		  endsWithParent: true,
		  illegal: /</,
		  relevance: 0,
		  contains: [
			 {
				className: 'attr',
				begin: XML_IDENT_RE,
				relevance: 0
			 },
			 {
				begin: /=\s*/,
				relevance: 0,
				contains: [
				   {
					  className: 'string',
					  endsParent: true,
					  variants: [
						 { begin: /"/, end: /"/, contains: [XML_ENTITIES] },
						 { begin: /'/, end: /'/, contains: [XML_ENTITIES] },
						 { begin: /[^\s"'=<>`]+/ }
					  ]
				   }
				]
			 }
		  ]
	   };
	   return {
		  name: 'HTML, XML',
		  aliases: ['html', 'xhtml', 'rss', 'atom', 'xjb', 'xsd', 'xsl', 'plist', 'wsf', 'svg'],
		  case_insensitive: true,
		  contains: [
			 {
				className: 'meta',
				begin: '<![a-z]', end: '>',
				relevance: 10,
				contains: [
				   XML_META_KEYWORDS,
				   QUOTE_META_STRING_MODE,
				   APOS_META_STRING_MODE,
				   XML_META_PAR_KEYWORDS,
				   {
					  begin: '\\[', end: '\\]',
					  contains: [
						 {
							className: 'meta',
							begin: '<![a-z]', end: '>',
							contains: [
							   XML_META_KEYWORDS,
							   XML_META_PAR_KEYWORDS,
							   QUOTE_META_STRING_MODE,
							   APOS_META_STRING_MODE
							]
						 }
					  ]
				   }
				]
			 },
			 _M0DE$.COMMENT(
				'<!--',
				'-->',
				{
				   relevance: 10
				}
			 ),
			 {
				begin: '<\\!\\[CDATA\\[', end: '\\]\\]>',
				relevance: 10
			 },
			 XML_ENTITIES,
			 {
				className: 'meta',
				begin: /<\?xml/, end: /\?>/, relevance: 10
			 },
			 {
				className: 'tag',
				/*
				The lookahead pattern (?=...) ensures that 'begin' only matches
				'<style' as a single word, followed by a whitespace or an
				ending braket. The '$' is needed for the lexeme to be recognized
				by hljs.subMode() that tests lexemes outside the stream.
				*/
				begin: '<style(?=\\s|>)', end: '>',
				keywords: { name: 'style' },
				contains: [TAG_INTERNALS],
				starts: {
				   end: '</style>', returnEnd: true,
				   subLanguage: ['css', 'xml']
				}
			 },
			 {
				className: 'tag',
				// See the comment in the <style tag about the lookahead pattern
				begin: '<script(?=\\s|>)', end: '>',
				keywords: { name: 'script' },
				contains: [TAG_INTERNALS],
				starts: {
				   end: '\<\/script\>', returnEnd: true,
				   subLanguage: ['javascript', 'handlebars', 'xml']
				}
			 },
			 {
				className: 'tag',
				begin: '</?', end: '/?>',
				contains: [
				   {
					  className: 'name', begin: /[^\/><\s]+/, relevance: 0
				   },
				   TAG_INTERNALS
				]
			 }
		  ]
	   };
	});
 
 registerLanguage('php',
	/*
	Language: PHP
	Author: Victor Karamzin <Victor.Karamzin@enterra-inc.com>
	Contributors: Evgeny Stepanischev <imbolk@gmail.com>, Ivan Sagalaev <maniac@softwaremaniacs.org>
	Website: https://www.php.net
	Category: common
	*/
	function php(_M0DE$) {
	   var VARIABLE = {
		  begin: '\\$+[a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*'
	   };
	   var PREPROCESSOR = {
		  className: 'meta',
		  variants: [
			 { begin: /<\?php/, relevance: 10 }, // boost for obvious PHP
			 { begin: /<\?[=]?/ },
			 { begin: /\?>/ } // end php tag
		  ]
	   };
	   var STRING = {
		  className: 'string',
		  contains: [_M0DE$.BACKSLASH_ESCAPE, PREPROCESSOR],
		  variants: [
			 {
				begin: 'b"', end: '"'
			 },
			 {
				begin: 'b\'', end: '\''
			 },
			 inherit(_M0DE$.APOS_STRING_MODE, { illegal: null }),
			 inherit(_M0DE$.QUOTE_STRING_MODE, { illegal: null })
		  ]
	   };
	   var NUMBER = { variants: [_M0DE$.BINARY_NUMBER_MODE, _M0DE$.C_NUMBER_MODE] };
	   var KEYWORDS = {
		  keyword:
			 // Magic constants:
			 // <https://www.php.net/manual/en/language.constants.predefined.php>
			 '__CLASS__ __DIR__ __FILE__ __FUNCTION__ __LINE__ __METHOD__ __NAMESPACE__ __TRAIT__ ' +
			 // Function that look like language construct or language construct that look like function:
			 // List of keywords that may not require parenthesis
			 'die echo exit include include_once print require require_once ' +
			 // These are not language construct (function) but operate on the currently-executing function and can access the current symbol table
			 // 'compact extract func_get_arg func_get_args func_num_args get_called_class get_parent_class ' +
			 // Other keywords:
			 // <https://www.php.net/manual/en/reserved.php>
			 // <https://www.php.net/manual/en/language.types.type-juggling.php>
			 'array abstract and as binary bool boolean break callable case catch class clone const continue declare default do double else elseif empty enddeclare endfor endforeach endif endswitch endwhile eval extends final finally float for foreach from global goto if implements instanceof insteadof int integer interface isset iterable list new object or private protected public real return string switch throw trait try unset use var void while xor yield',
		  literal: 'false null true',
		  built_in:
			 // Standard PHP library:
			 // <https://www.php.net/manual/en/book.spl.php>
			 'Error|0 ' + // error is too common a name esp since PHP is case in-sensitive
			 'AppendIterator ArgumentCountError ArithmeticError ArrayIterator ArrayObject AssertionError BadFunctionCallException BadMethodCallException CachingIterator CallbackFilterIterator CompileError Countable DirectoryIterator DivisionByZeroError DomainException EmptyIterator ErrorException Exception FilesystemIterator FilterIterator GlobIterator InfiniteIterator InvalidArgumentException IteratorIterator LengthException LimitIterator LogicException MultipleIterator NoRewindIterator OutOfBoundsException OutOfRangeException OuterIterator OverflowException ParentIterator ParseError RangeException RecursiveArrayIterator RecursiveCachingIterator RecursiveCallbackFilterIterator RecursiveDirectoryIterator RecursiveFilterIterator RecursiveIterator RecursiveIteratorIterator RecursiveRegexIterator RecursiveTreeIterator RegexIterator RuntimeException SeekableIterator SplDoublyLinkedList SplFileInfo SplFileObject SplFixedArray SplHeap SplMaxHeap SplMinHeap SplObjectStorage SplObserver SplObserver SplPriorityQueue SplQueue SplStack SplSubject SplSubject SplTempFileObject TypeError UnderflowException UnexpectedValueException ' +
			 // Reserved interfaces:
			 // <https://www.php.net/manual/en/reserved.interfaces.php>
			 'ArrayAccess Closure Generator Iterator IteratorAggregate Serializable Throwable Traversable WeakReference ' +
			 // Reserved classes:
			 // <https://www.php.net/manual/en/reserved.classes.php>
			 'Directory __PHP_Incomplete_Class parent php_user_filter self static stdClass'
	   };
	   return {
		  aliases: ['php', 'php3', 'php4', 'php5', 'php6', 'php7'],
		  case_insensitive: true,
		  keywords: KEYWORDS,
		  contains: [
			 _M0DE$.HASH_COMMENT_MODE,
			 _M0DE$.COMMENT('//', '$', { contains: [PREPROCESSOR] }),
			 _M0DE$.COMMENT(
				'/\\*',
				'\\*/',
				{
				   contains: [
					  {
						 className: 'doctag',
						 begin: '@[A-Za-z]+'
					  }
				   ]
				}
			 ),
			 _M0DE$.COMMENT(
				'__halt_compiler.+?;',
				false,
				{
				   endsWithParent: true,
				   keywords: '__halt_compiler'
				}
			 ),
			 {
				className: 'string',
				begin: /<<<['"]?\w+['"]?$/, end: /^\w+;?$/,
				contains: [
				   _M0DE$.BACKSLASH_ESCAPE,
				   {
					  className: 'subst',
					  variants: [
						 { begin: /\$\w+/ },
						 { begin: /\{\$/, end: /\}/ }
					  ]
				   }
				]
			 },
			 PREPROCESSOR,
			 {
				className: 'keyword', begin: /\$this\b/
			 },
			 VARIABLE,
			 {
				// swallow composed identifiers to avoid parsing them as keywords
				begin: /(::|->)+[a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*/
			 },
			 {
				className: 'function',
				beginKeywords: 'fn function', end: /[;{]/, excludeEnd: true,
				illegal: '[$%\\[]',
				contains: [
				   _M0DE$.UNDERSCORE_TITLE_MODE,
				   {
					  className: 'params',
					  begin: '\\(', end: '\\)',
					  excludeBegin: true,
					  excludeEnd: true,
					  keywords: KEYWORDS,
					  contains: [
						 'self',
						 VARIABLE,
						 _M0DE$.C_BLOCK_COMMENT_MODE,
						 STRING,
						 NUMBER
					  ]
				   }
				]
			 },
			 {
				className: 'class',
				beginKeywords: 'class interface', end: '{', excludeEnd: true,
				illegal: /[:\(\$"]/,
				contains: [
				   { beginKeywords: 'extends implements' },
				   _M0DE$.UNDERSCORE_TITLE_MODE
				]
			 },
			 {
				beginKeywords: 'namespace', end: ';',
				illegal: /[\.']/,
				contains: [_M0DE$.UNDERSCORE_TITLE_MODE]
			 },
			 {
				beginKeywords: 'use', end: ';',
				contains: [_M0DE$.UNDERSCORE_TITLE_MODE]
			 },
			 {
				begin: '=>' // No markup, just a relevance booster
			 },
			 STRING, NUMBER
		  ]
	   };
	});
 
 registerLanguage('php-template',
	/*
	Language: PHP Template
	Requires: xml.js, php.js
	Author: Josh Goebel <hello@joshgoebel.com>
	Website: https://www.php.net
	Category: common
	*/
	function phpTemplate(_M0DE$) {
	   return {
		  name: "PHP template",
		  subLanguage: 'xml',
		  contains: [
			 {
				begin: /<\?(php|=)?/,
				end: /\?>/,
				subLanguage: 'php',
				contains: [
				   // We don't want the php closing tag ?> to close the PHP block when
				   // inside any of the following blocks:
				   { begin: '/\\*', end: '\\*/', skip: true },
				   { begin: 'b"', end: '"', skip: true },
				   { begin: 'b\'', end: '\'', skip: true },
				   inherit(_M0DE$.APOS_STRING_MODE, { illegal: null, className: null, contains: null, skip: true }),
				   inherit(_M0DE$.QUOTE_STRING_MODE, { illegal: null, className: null, contains: null, skip: true })
				]
			 }
		  ]
	   };
	});
 
 registerLanguage('java',
	/*
	Language: Java
	Author: Vsevolod Solovyov <vsevolod.solovyov@gmail.com>
	Category: common, enterprise
	Website: https://www.java.com/
	*/
	function java(_M0DE$) {
	   var JAVA_IDENT_RE = '[\u00C0-\u02B8a-zA-Z_$][\u00C0-\u02B8a-zA-Z_$0-9]*';
	   var GENERIC_IDENT_RE = JAVA_IDENT_RE + '(<' + JAVA_IDENT_RE + '(\\s*,\\s*' + JAVA_IDENT_RE + ')*>)?';
	   var KEYWORDS = 'false synchronized int abstract float private char boolean var static null if const ' +
		  'for true while long strictfp finally protected import native final void ' +
		  'enum else break transient catch instanceof byte super volatile case assert short ' +
		  'package default double public try this switch continue throws protected public private ' +
		  'module requires exports do';
	   var ANNOTATION = {
		  className: 'meta',
		  begin: '@' + JAVA_IDENT_RE,
		  contains: [
			 {
				begin: /\(/,
				end: /\)/,
				contains: ["self"] // allow nested () inside our annotation
			 },
		  ]
	   };
	   /**
		* A given sequence, possibly with underscores
		* @type {(s: string | RegExp) => string}  */
	   var SEQUENCE_ALLOWING_UNDERSCORES = (seq) => concatStr('[', seq, ']+([', seq, '_]*[', seq, ']+)?');
	   var JAVA_NUMBER_MODE = {
		  className: 'number',
		  variants: [
			 { begin: `\\b(0[bB]${SEQUENCE_ALLOWING_UNDERSCORES('01')})[lL]?` }, // binary
			 { begin: `\\b(0${SEQUENCE_ALLOWING_UNDERSCORES('0-7')})[dDfFlL]?` }, // octal
			 {
				begin: concatStr(
				   /\b0[xX]/,
				   either(
					  concatStr(SEQUENCE_ALLOWING_UNDERSCORES('a-fA-F0-9'), /\./, SEQUENCE_ALLOWING_UNDERSCORES('a-fA-F0-9')),
					  concatStr(SEQUENCE_ALLOWING_UNDERSCORES('a-fA-F0-9'), /\.?/),
					  concatStr(/\./, SEQUENCE_ALLOWING_UNDERSCORES('a-fA-F0-9'))
				   ),
				   /([pP][+-]?(\d+))?/,
				   /[fFdDlL]?/ // decimal & fp mixed for simplicity
				)
			 },
			 // scientific notation
			 {
				begin: concatStr(
				   /\b/,
				   either(
					  concatStr(/\d*\./, SEQUENCE_ALLOWING_UNDERSCORES("\\d")), // .3, 3.3, 3.3_3
					  SEQUENCE_ALLOWING_UNDERSCORES("\\d") // 3, 3_3
				   ),
				   /[eE][+-]?[\d]+[dDfF]?/)
			 },
			 // decimal & fp mixed for simplicity
			 {
				begin: concatStr(
				   /\b/,
				   SEQUENCE_ALLOWING_UNDERSCORES(/\d/),
				   concatStr('(', /\.?/, ')?'),
				   concatStr('(', SEQUENCE_ALLOWING_UNDERSCORES(/\d/), ')?'),
				   /[dDfFlL]?/)
			 }
		  ],
		  relevance: 0
	   };
	   return {
		  name: 'Java',
		  aliases: ['jsp'],
		  keywords: KEYWORDS,
		  illegal: /<\/|#/,
		  contains: [
			 _M0DE$.COMMENT(
				'/\\*\\*',
				'\\*/',
				{
				   relevance: 0,
				   contains: [
					  {
						 // eat up @'s in emails to prevent them to be recognized as doctags
						 begin: /\w+@/, relevance: 0
					  },
					  {
						 className: 'doctag',
						 begin: '@[A-Za-z]+'
					  }
				   ]
				}
			 ),
			 _M0DE$.C_LINE_COMMENT_MODE,
			 _M0DE$.C_BLOCK_COMMENT_MODE,
			 _M0DE$.APOS_STRING_MODE,
			 _M0DE$.QUOTE_STRING_MODE,
			 {
				className: 'class',
				beginKeywords: 'class interface enum', end: /[{;=]/, excludeEnd: true,
				keywords: 'class interface enum',
				illegal: /[:"\[\]]/,
				contains: [
				   { beginKeywords: 'extends implements' },
				   _M0DE$.UNDERSCORE_TITLE_MODE
				]
			 },
			 {
				// Expression keywords prevent 'keyword Name(...)' from being
				// recognized as a function definition
				beginKeywords: 'new throw return else',
				relevance: 0
			 },
			 {
				className: 'function',
				begin: '(' + GENERIC_IDENT_RE + '\\s+)+' + _M0DE$.UNDERSCORE_IDENT_RE + '\\s*\\(', returnBegin: true, end: /[{;=]/,
				excludeEnd: true,
				keywords: KEYWORDS,
				contains: [
				   {
					  begin: _M0DE$.UNDERSCORE_IDENT_RE + '\\s*\\(', returnBegin: true,
					  relevance: 0,
					  contains: [_M0DE$.UNDERSCORE_TITLE_MODE]
				   },
				   {
					  className: 'params',
					  begin: /\(/, end: /\)/,
					  keywords: KEYWORDS,
					  relevance: 0,
					  contains: [
						 ANNOTATION,
						 _M0DE$.APOS_STRING_MODE,
						 _M0DE$.QUOTE_STRING_MODE,
						 _M0DE$.C_NUMBER_MODE,
						 _M0DE$.C_BLOCK_COMMENT_MODE
					  ]
				   },
				   _M0DE$.C_LINE_COMMENT_MODE,
				   _M0DE$.C_BLOCK_COMMENT_MODE
				]
			 },
			 JAVA_NUMBER_MODE,
			 ANNOTATION
		  ]
	   };
	});
 
 registerLanguage('latex',
	/*
	Language: LaTeX
	Author: Vladimir Moskva <vladmos@gmail.com>
	Website: https://www.latex-project.org
	Category: markup
	*/
	function latex(_M0DE$) {
	   var COMMAND = {
		  className: 'tag',
		  begin: /\\/,
		  relevance: 0,
		  contains: [
			 {
				className: 'name',
				variants: [
				   { begin: /[a-zA-Z\u0430-\u044f\u0410-\u042f]+[*]?/ },
				   { begin: /[^a-zA-Z\u0430-\u044f\u0410-\u042f0-9]/ }
				],
				starts: {
				   endsWithParent: true,
				   relevance: 0,
				   contains: [
					  {
						 className: 'string', // because it looks like attributes in HTML tags
						 variants: [
							{ begin: /\[/, end: /\]/ },
							{ begin: /\{/, end: /\}/ }
						 ]
					  },
					  {
						 begin: /\s*=\s*/, endsWithParent: true,
						 relevance: 0,
						 contains: [
							{
							   className: 'number',
							   begin: /-?\d*\.?\d+(pt|pc|mm|cm|in|dd|cc|ex|em)?/
							}
						 ]
					  }
				   ]
				}
			 }
		  ]
	   };
	   return {
		  name: 'LaTeX',
		  aliases: ['tex'],
		  contains: [
			 COMMAND,
			 {
				className: 'formula',
				contains: [COMMAND],
				relevance: 0,
				variants: [
				   { begin: /\$\$/, end: /\$\$/ },
				   { begin: /\$/, end: /\$/ }
				]
			 },
			 _M0DE$.COMMENT(
				'%',
				'$',
				{
				   relevance: 0
				}
			 )
		  ]
	   };
	});
 
 registerLanguage('d',
	/*
	Language: D
	Author: Aleksandar Ruzicic <aleksandar@ruzicic.info>
	Description: D is a language with C-like syntax and static typing. It pragmatically combines efficiency, control, and modeling power, with safety and programmer productivity.
	Version: 1.0a
	Website: https://dlang.org
	Date: 2012-04-08
	*//**
	 * Known issues:
	 *
	 * - invalid hex string literals will be recognized as a double quoted strings
	 *   but 'x' at the beginning of string will not be matched
	 *
	 * - delimited string literals are not checked for matching end delimiter
	 *   (not possible to do with js regexp)
	 *
	 * - content of token string is colored as a string (i.e. no keyword coloring inside a token string)
	 *   also, content of token string is not validated to contain only valid D tokens
	 *
	 * - special token sequence rule is not strictly following D grammar (anything following #line
	 *   up to the end of line is matched as special token sequence)
	 */
	function d(_M0DE$) {
	   var D_KEYWORDS = {
		  $pattern: _M0DE$.UNDERSCORE_IDENT_RE,
		  keyword:
			 'abstract alias align asm assert auto body break byte case cast catch class ' +
			 'const continue debug default delete deprecated do else enum export extern final ' +
			 'finally for foreach foreach_reverse|10 goto if immutable import in inout int ' +
			 'interface invariant is lazy macro mixin module new nothrow out override package ' +
			 'pragma private protected public pure ref return scope shared static struct ' +
			 'super switch synchronized template this throw try typedef typeid typeof union ' +
			 'unittest version void volatile while with __FILE__ __LINE__ __gshared|10 ' +
			 '__thread __traits __DATE__ __EOF__ __TIME__ __TIMESTAMP__ __VENDOR__ __VERSION__',
		  built_in:
			 'bool cdouble cent cfloat char creal dchar delegate double dstring float function ' +
			 'idouble ifloat ireal long real short string ubyte ucent uint ulong ushort wchar ' +
			 'wstring',
		  literal:
			 'false null true'
	   };
	   var decimal_integer_re = '(0|[1-9][\\d_]*)',
		  decimal_integer_nosus_re = '(0|[1-9][\\d_]*|\\d[\\d_]*|[\\d_]+?\\d)',
		  binary_integer_re = '0[bB][01_]+',
		  hexadecimal_digits_re = '([\\da-fA-F][\\da-fA-F_]*|_[\\da-fA-F][\\da-fA-F_]*)',
		  hexadecimal_integer_re = '0[xX]' + hexadecimal_digits_re,
		  decimal_exponent_re = '([eE][+-]?' + decimal_integer_nosus_re + ')',
		  decimal_float_re = '(' + decimal_integer_nosus_re + '(\\.\\d*|' + decimal_exponent_re + ')|' +
			 '\\d+\\.' + decimal_integer_nosus_re + decimal_integer_nosus_re + '|' +
			 '\\.' + decimal_integer_re + decimal_exponent_re + '?' +
			 ')',
		  hexadecimal_float_re = '(0[xX](' +
			 hexadecimal_digits_re + '\\.' + hexadecimal_digits_re + '|' +
			 '\\.?' + hexadecimal_digits_re +
			 ')[pP][+-]?' + decimal_integer_nosus_re + ')',
		  integer_re = '(' +
			 decimal_integer_re + '|' +
			 binary_integer_re + '|' +
			 hexadecimal_integer_re +
			 ')',
		  float_re = '(' +
			 hexadecimal_float_re + '|' +
			 decimal_float_re +
			 ')';
	   var escape_sequence_re = '\\\\(' +
		  '[\'"\\?\\\\abfnrtv]|' +  // common escapes
		  'u[\\dA-Fa-f]{4}|' +     // four hex digit unicode codepoint
		  '[0-7]{1,3}|' +       // one to three octal digit ascii char code
		  'x[\\dA-Fa-f]{2}|' +    // two hex digit ascii char code
		  'U[\\dA-Fa-f]{8}' +      // eight hex digit unicode codepoint
		  ')|' +
		  '&[a-zA-Z\\d]{2,};';      // named character entity
	   var D_INTEGER_MODE = {
		  className: 'number',
		  begin: '\\b' + integer_re + '(L|u|U|Lu|LU|uL|UL)?',
		  relevance: 0
	   };
	   var D_FLOAT_MODE = {
		  className: 'number',
		  begin: '\\b(' +
			 float_re + '([fF]|L|i|[fF]i|Li)?|' +
			 integer_re + '(i|[fF]i|Li)' +
			 ')',
		  relevance: 0
	   };
	   var D_CHARACTER_MODE = {
		  className: 'string',
		  begin: '\'(' + escape_sequence_re + '|.)', end: '\'',
		  illegal: '.'
	   };
	   var D_ESCAPE_SEQUENCE = {
		  begin: escape_sequence_re,
		  relevance: 0
	   };
	   var D_STRING_MODE = {
		  className: 'string',
		  begin: '"',
		  contains: [D_ESCAPE_SEQUENCE],
		  end: '"[cwd]?'
	   };
	   var D_WYSIWYG_DELIMITED_STRING_MODE = {
		  className: 'string',
		  begin: '[rq]"',
		  end: '"[cwd]?',
		  relevance: 5
	   };
	   var D_ALTERNATE_WYSIWYG_STRING_MODE = {
		  className: 'string',
		  begin: '`',
		  end: '`[cwd]?'
	   };
	   var D_HEX_STRING_MODE = {
		  className: 'string',
		  begin: 'x"[\\da-fA-F\\s\\n\\r]*"[cwd]?',
		  relevance: 10
	   };
	   var D_TOKEN_STRING_MODE = {
		  className: 'string',
		  begin: 'q"\\{',
		  end: '\\}"'
	   };
	   var D_HASHBANG_MODE = {
		  className: 'meta',
		  begin: '^#!',
		  end: '$',
		  relevance: 5
	   };
	   var D_SPECIAL_TOKEN_SEQUENCE_MODE = {
		  className: 'meta',
		  begin: '#(line)',
		  end: '$',
		  relevance: 5
	   };
	   var D_ATTRIBUTE_MODE = {
		  className: 'keyword',
		  begin: '@[a-zA-Z_][a-zA-Z_\\d]*'
	   };
	   var D_NESTING_COMMENT_MODE = _M0DE$.COMMENT(
		  '\\/\\+',
		  '\\+\\/',
		  {
			 contains: ['self'],
			 relevance: 10
		  }
	   );
	   return {
		  name: 'D',
		  keywords: D_KEYWORDS,
		  contains: [
			 _M0DE$.C_LINE_COMMENT_MODE,
			 _M0DE$.C_BLOCK_COMMENT_MODE,
			 D_NESTING_COMMENT_MODE,
			 D_HEX_STRING_MODE,
			 D_STRING_MODE,
			 D_WYSIWYG_DELIMITED_STRING_MODE,
			 D_ALTERNATE_WYSIWYG_STRING_MODE,
			 D_TOKEN_STRING_MODE,
			 D_FLOAT_MODE,
			 D_INTEGER_MODE,
			 D_CHARACTER_MODE,
			 D_HASHBANG_MODE,
			 D_SPECIAL_TOKEN_SEQUENCE_MODE,
			 D_ATTRIBUTE_MODE
		  ]
	   };
	});
 
 registerLanguage('delphi',
	/*
	Language: Delphi
	Website: https://www.embarcadero.com/products/delphi
	*/
	function delphi(_M0DE$) {
	   var KEYWORDS =
		  'exports register file shl array record property for mod while set ally label uses raise not ' +
		  'stored class safecall var interface or private static exit index inherited to else stdcall ' +
		  'override shr asm far resourcestring finalization packed virtual out and protected library do ' +
		  'xorwrite goto near function end div overload object unit begin string on inline repeat until ' +
		  'destructor write message program with read initialization except default nil if case cdecl in ' +
		  'downto threadvar of try pascal const external constructor type public then implementation ' +
		  'finally published procedure absolute reintroduce operator as is abstract alias assembler ' +
		  'bitpacked break continue cppdecl cvar enumerator experimental platform deprecated ' +
		  'unimplemented dynamic export far16 forward generic helper implements interrupt iochecks ' +
		  'local name nodefault noreturn nostackframe oldfpccall otherwise saveregisters softfloat ' +
		  'specialize strict unaligned varargs ';
	   var COMMENT_MODES = [
		  _M0DE$.C_LINE_COMMENT_MODE,
		  _M0DE$.COMMENT(/\{/, /\}/, { relevance: 0 }),
		  _M0DE$.COMMENT(/\(\*/, /\*\)/, { relevance: 10 })
	   ];
	   var DIRECTIVE = {
		  className: 'meta',
		  variants: [
			 { begin: /\{\$/, end: /\}/ },
			 { begin: /\(\*\$/, end: /\*\)/ }
		  ]
	   };
	   var STRING = {
		  className: 'string',
		  begin: /'/, end: /'/,
		  contains: [{ begin: /''/ }]
	   };
	   var NUMBER = {
		  className: 'number',
		  relevance: 0,
		  // Source: https://www.freepascal.org/docs-html/ref/refse6.html
		  variants: [
			 {
				// Hexadecimal notation, e.g., $7F.
				begin: '\\$[0-9A-Fa-f]+',
			 },
			 {
				// Octal notation, e.g., &42.
				begin: '&[0-7]+',
			 },
			 {
				// Binary notation, e.g., %1010.
				begin: '%[01]+',
			 }
		  ]
	   };
	   var CHAR_STRING = {
		  className: 'string', begin: /(#\d+)+/
	   };
	   var CLASS = {
		  begin: _M0DE$.IDENT_RE + '\\s*=\\s*class\\s*\\(', returnBegin: true,
		  contains: [
			 _M0DE$.TITLE_MODE
		  ]
	   };
	   var FUNCTION = {
		  className: 'function',
		  beginKeywords: 'function constructor destructor procedure', end: /[:;]/,
		  keywords: 'function constructor|10 destructor|10 procedure|10',
		  contains: [
			 _M0DE$.TITLE_MODE,
			 {
				className: 'params',
				begin: /\(/, end: /\)/,
				keywords: KEYWORDS,
				contains: [STRING, CHAR_STRING, DIRECTIVE].concat(COMMENT_MODES)
			 },
			 DIRECTIVE
		  ].concat(COMMENT_MODES)
	   };
	   return {
		  name: 'Delphi',
		  aliases: ['dpr', 'dfm', 'pas', 'pascal', 'freepascal', 'lazarus', 'lpr', 'lfm'],
		  case_insensitive: true,
		  keywords: KEYWORDS,
		  illegal: /"|\$[G-Zg-z]|\/\*|<\/|\|/,
		  contains: [
			 STRING, CHAR_STRING,
			 _M0DE$.NUMBER_MODE,
			 NUMBER,
			 CLASS,
			 FUNCTION,
			 DIRECTIVE
		  ].concat(COMMENT_MODES)
	   };
	});
 
 registerLanguage('http',
	/*
	Language: HTTP
	Description: HTTP request and response headers with automatic body highlighting
	Author: Ivan Sagalaev <maniac@softwaremaniacs.org>
	Category: common, protocols
	Website: https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview
	*/
	function http() {
	   var VERSION = 'HTTP/[0-9\\.]+';
	   return {
		  name: 'HTTP',
		  aliases: ['https'],
		  illegal: '\\S',
		  contains: [
			 {
				begin: '^' + VERSION, end: '$',
				contains: [{ className: 'number', begin: '\\b\\d{3}\\b' }]
			 },
			 {
				begin: '^[A-Z]+ (.*?) ' + VERSION + '$', returnBegin: true, end: '$',
				contains: [
				   {
					  className: 'string',
					  begin: ' ', end: ' ',
					  excludeBegin: true, excludeEnd: true
				   },
				   {
					  begin: VERSION
				   },
				   {
					  className: 'keyword',
					  begin: '[A-Z]+'
				   }
				]
			 },
			 {
				className: 'attribute',
				begin: '^\\w', end: ': ', excludeEnd: true,
				illegal: '\\n|\\s|=',
				starts: { end: '$', relevance: 0 }
			 },
			 {
				begin: '\\n\\n',
				starts: { subLanguage: [], endsWithParent: true }
			 }
		  ]
	   };
	});
 
 registerLanguage('swift',
	/*
	Language: Swift
	Description: Swift is a general-purpose programming language built using a modern approach to safety, performance, and software design patterns.
	Author: Chris Eidhof <chris@eidhof.nl>
	Contributors: Nate Cook <natecook@gmail.com>, Alexander Lichter <manniL@gmx.net>
	Website: https://swift.org
	Category: common, system
	*/
	function swift(_M0DE$) {
	   var SWIFT_KEYWORDS = {
		  keyword: '#available #colorLiteral #column #else #elseif #endif #file ' +
			 '#fileLiteral #function #if #imageLiteral #line #selector #sourceLocation ' +
			 '_ __COLUMN__ __FILE__ __FUNCTION__ __LINE__ Any as as! as? associatedtype ' +
			 'associativity break case catch class continue convenience default defer deinit didSet do ' +
			 'dynamic dynamicType else enum extension fallthrough false fileprivate final for func ' +
			 'get guard if import in indirect infix init inout internal is lazy left let ' +
			 'mutating nil none nonmutating open operator optional override postfix precedence ' +
			 'prefix private protocol Protocol public repeat required rethrows return ' +
			 'right self Self set static struct subscript super switch throw throws true ' +
			 'try try! try? Type typealias unowned var weak where while willSet',
		  literal: 'true false nil',
		  built_in: 'abs advance alignof alignofValue anyGenerator assert assertionFailure ' +
			 'bridgeFromObjectiveC bridgeFromObjectiveCUnconditional bridgeToObjectiveC ' +
			 'bridgeToObjectiveCUnconditional c compactMap contains count countElements countLeadingZeros ' +
			 'debugPrint debugPrintln distance dropFirst dropLast dump encodeBitsAsWords ' +
			 'enumerate equal fatalError filter find getBridgedObjectiveCType getVaList ' +
			 'indices insertionSort isBridgedToObjectiveC isBridgedVerbatimToObjectiveC ' +
			 'isUniquelyReferenced isUniquelyReferencedNonObjC join lazy lexicographicalCompare ' +
			 'map max maxElement min minElement numericCast overlaps partition posix ' +
			 'precondition preconditionFailure print println quickSort readLine reduce reflect ' +
			 'reinterpretCast reverse roundUpToAlignment sizeof sizeofValue sort split ' +
			 'startsWith stride strideof strideofValue swap toString transcode ' +
			 'underestimateCount unsafeAddressOf unsafeBitCast unsafeDowncast unsafeUnwrap ' +
			 'unsafeReflect withExtendedLifetime withObjectAtPlusZero withUnsafePointer ' +
			 'withUnsafePointerToObject withUnsafeMutablePointer withUnsafeMutablePointers ' +
			 'withUnsafePointer withUnsafePointers withVaList zip'
	   };
	   var TYPE = {
		  className: 'type',
		  begin: '\\b[A-Z][\\w\u00C0-\u02B8\']*',
		  relevance: 0
	   };
	   // slightly more special to swift
	   var OPTIONAL_USING_TYPE = {
		  className: 'type',
		  begin: '\\b[A-Z][\\w\u00C0-\u02B8\']*[!?]'
	   };
	   var BLOCK_COMMENT = _M0DE$.COMMENT(
		  '/\\*',
		  '\\*/',
		  {
			 contains: ['self']
		  }
	   );
	   var SUBST = {
		  className: 'subst',
		  begin: /\\\(/, end: '\\)',
		  keywords: SWIFT_KEYWORDS,
		  contains: [] // assigned later
	   };
	   var STRING = {
		  className: 'string',
		  contains: [_M0DE$.BACKSLASH_ESCAPE, SUBST],
		  variants: [
			 { begin: /"""/, end: /"""/ },
			 { begin: /"/, end: /"/ },
		  ]
	   };
	   var NUMBERS = {
		  className: 'number',
		  begin: '\\b([\\d_]+(\\.[\\deE_]+)?|0x[a-fA-F0-9_]+(\\.[a-fA-F0-9p_]+)?|0b[01_]+|0o[0-7_]+)\\b',
		  relevance: 0
	   };
	   SUBST.contains = [NUMBERS];
	   return {
		  name: 'Swift',
		  keywords: SWIFT_KEYWORDS,
		  contains: [
			 STRING,
			 _M0DE$.C_LINE_COMMENT_MODE,
			 BLOCK_COMMENT,
			 OPTIONAL_USING_TYPE,
			 TYPE,
			 NUMBERS,
			 {
				className: 'function',
				beginKeywords: 'func', end: '{', excludeEnd: true,
				contains: [
				   inherit(_M0DE$.TITLE_MODE, {
					  begin: /[A-Za-z$_][0-9A-Za-z$_]*/
				   }),
				   {
					  begin: /</, end: />/
				   },
				   {
					  className: 'params',
					  begin: /\(/, end: /\)/, endsParent: true,
					  keywords: SWIFT_KEYWORDS,
					  contains: [
						 'self',
						 NUMBERS,
						 STRING,
						 _M0DE$.C_BLOCK_COMMENT_MODE,
						 { begin: ':' } // relevance booster
					  ],
					  illegal: /["']/
				   }
				],
				illegal: /\[|%/
			 },
			 {
				className: 'class',
				beginKeywords: 'struct protocol class extension enum',
				keywords: SWIFT_KEYWORDS,
				end: '\\{',
				excludeEnd: true,
				contains: [
				   inherit(_M0DE$.TITLE_MODE, { begin: /[A-Za-z$_][\u00C0-\u02B80-9A-Za-z$_]*/ })
				]
			 },
			 {
				className: 'meta', // @attributes
				begin: '(@discardableResult|@warn_unused_result|@exported|@lazy|@noescape|' +
				   '@NSCopying|@NSManaged|@objc|@objcMembers|@convention|@required|' +
				   '@noreturn|@IBAction|@IBDesignable|@IBInspectable|@IBOutlet|' +
				   '@infix|@prefix|@postfix|@autoclosure|@testable|@available|' +
				   '@nonobjc|@NSApplicationMain|@UIApplicationMain|@dynamicMemberLookup|' +
				   '@propertyWrapper)\\b'
			 },
			 {
				beginKeywords: 'import', end: /$/,
				contains: [_M0DE$.C_LINE_COMMENT_MODE, BLOCK_COMMENT]
			 }
		  ]
	   };
	});
 
 registerLanguage('ini',
	/*
	Language: TOML, also INI
	Description: TOML aims to be a minimal configuration file format that's easy to read due to obvious semantics.
	Contributors: Guillaume Gomez <guillaume1.gomez@gmail.com>
	Category: common, config
	Website: https://github.com/toml-lang/toml
	*/
	function ini(_M0DE$) {
	   var NUMBERS = {
		  className: 'number',
		  relevance: 0,
		  variants: [
			 { begin: /([\+\-]+)?[\d]+_[\d_]+/ },
			 { begin: _M0DE$.NUMBER_RE }
		  ]
	   };
	   var COMMENTS = _M0DE$.COMMENT();
	   COMMENTS.variants = [
		  { begin: /;/, end: /$/ },
		  { begin: /#/, end: /$/ },
	   ];
	   var VARIABLES = {
		  className: 'variable',
		  variants: [
			 { begin: /\$[\w\d"][\w\d_]*/ },
			 { begin: /\$\{(.*?)}/ }
		  ]
	   };
	   var LITERALS = {
		  className: 'literal',
		  begin: /\bon|off|true|false|yes|no\b/
	   };
	   var STRINGS = {
		  className: "string",
		  contains: [_M0DE$.BACKSLASH_ESCAPE],
		  variants: [
			 { begin: "'''", end: "'''", relevance: 10 },
			 { begin: '"""', end: '"""', relevance: 10 },
			 { begin: '"', end: '"' },
			 { begin: "'", end: "'" }
		  ]
	   };
	   var ARRAY = {
		  begin: /\[/, end: /\]/,
		  contains: [
			 COMMENTS,
			 LITERALS,
			 VARIABLES,
			 STRINGS,
			 NUMBERS,
			 'self'
		  ],
		  relevance: 0
	   };
	   var BARE_KEY = /[A-Za-z0-9_-]+/;
	   var QUOTED_KEY_DOUBLE_QUOTE = /"(\\"|[^"])*"/;
	   var QUOTED_KEY_SINGLE_QUOTE = /'[^']*'/;
	   var ANY_KEY = either(
		  BARE_KEY, QUOTED_KEY_DOUBLE_QUOTE, QUOTED_KEY_SINGLE_QUOTE
	   );
	   var DOTTED_KEY = concatStr(
		  ANY_KEY, '(\\s*\\.\\s*', ANY_KEY, ')*',
		  lookahead(/\s*=\s*[^#\s]/)
	   );
	   return {
		  name: 'TOML, also INI',
		  aliases: ['toml'],
		  case_insensitive: true,
		  illegal: /\S/,
		  contains: [
			 COMMENTS,
			 {
				className: 'section',
				begin: /\[+/, end: /\]+/
			 },
			 {
				begin: DOTTED_KEY,
				className: 'attr',
				starts: {
				   end: /$/,
				   contains: [
					  COMMENTS,
					  ARRAY,
					  LITERALS,
					  VARIABLES,
					  STRINGS,
					  NUMBERS
				   ]
				}
			 }
		  ]
	   };
	});
 
 registerLanguage('lisp',
	/*
	Language: Lisp
	Description: Generic lisp syntax
	Author: Vasily Polovnyov <vast@whiteants.net>
	Category: lisp
	*/
	function lisp(_M0DE$) {
	   var LISP_IDENT_RE = '[a-zA-Z_\\-\\+\\*\\/\\<\\=\\>\\&\\#][a-zA-Z0-9_\\-\\+\\*\\/\\<\\=\\>\\&\\#!]*';
	   var MEC_RE = '\\|[^]*?\\|';
	   var LISP_SIMPLE_NUMBER_RE = '(\\-|\\+)?\\d+(\\.\\d+|\\/\\d+)?((d|e|f|l|s|D|E|F|L|S)(\\+|\\-)?\\d+)?';
	   var LITERAL = {
		  className: 'literal',
		  begin: '\\b(t{1}|nil)\\b'
	   };
	   var NUMBER = {
		  className: 'number',
		  variants: [
			 { begin: LISP_SIMPLE_NUMBER_RE, relevance: 0 },
			 { begin: '#(b|B)[0-1]+(/[0-1]+)?' },
			 { begin: '#(o|O)[0-7]+(/[0-7]+)?' },
			 { begin: '#(x|X)[0-9a-fA-F]+(/[0-9a-fA-F]+)?' },
			 { begin: '#(c|C)\\(' + LISP_SIMPLE_NUMBER_RE + ' +' + LISP_SIMPLE_NUMBER_RE, end: '\\)' }
		  ]
	   };
	   var STRING = inherit(_M0DE$.QUOTE_STRING_MODE, { illegal: null });
	   var COMMENT = _M0DE$.COMMENT(
		  ';', '$',
		  {
			 relevance: 0
		  }
	   );
	   var VARIABLE = {
		  begin: '\\*', end: '\\*'
	   };
	   var KEYWORD = {
		  className: 'symbol',
		  begin: '[:&]' + LISP_IDENT_RE
	   };
	   var IDENT = {
		  begin: LISP_IDENT_RE,
		  relevance: 0
	   };
	   var MEC = {
		  begin: MEC_RE
	   };
	   var QUOTED_LIST = {
		  begin: '\\(', end: '\\)',
		  contains: ['self', LITERAL, STRING, NUMBER, IDENT]
	   };
	   var QUOTED = {
		  contains: [NUMBER, STRING, VARIABLE, KEYWORD, QUOTED_LIST, IDENT],
		  variants: [
			 {
				begin: '[\'`]\\(', end: '\\)'
			 },
			 {
				begin: '\\(quote ', end: '\\)',
				keywords: { name: 'quote' }
			 },
			 {
				begin: '\'' + MEC_RE
			 }
		  ]
	   };
	   var QUOTED_ATOM = {
		  variants: [
			 { begin: '\'' + LISP_IDENT_RE },
			 { begin: '#\'' + LISP_IDENT_RE + '(::' + LISP_IDENT_RE + ')*' }
		  ]
	   };
	   var LIST = {
		  begin: '\\(\\s*', end: '\\)'
	   };
	   var BODY = {
		  endsWithParent: true,
		  relevance: 0
	   };
	   LIST.contains = [
		  {
			 className: 'name',
			 variants: [
				{ begin: LISP_IDENT_RE },
				{ begin: MEC_RE }
			 ]
		  },
		  BODY
	   ];
	   BODY.contains = [QUOTED, QUOTED_ATOM, LIST, LITERAL, NUMBER, STRING, COMMENT, VARIABLE, KEYWORD, MEC, IDENT];
 
	   return {
		  name: 'Lisp',
		  illegal: /\S/,
		  contains: [
			 NUMBER,
			 _M0DE$.SHEBANG(),
			 LITERAL,
			 STRING,
			 COMMENT,
			 QUOTED,
			 QUOTED_ATOM,
			 LIST,
			 IDENT
		  ]
	   };
	});
 
 registerLanguage('cmake',
	/*
	Language: CMake
	Description: CMake is an open-source cross-platform system for build automation.
	Author: Igor Kalnitsky <igor@kalnitsky.org>
	Website: https://cmake.org
	*/
	function cmake(_M0DE$) {
	   return {
		  name: 'CMake',
		  aliases: ['cmake.in'],
		  case_insensitive: true,
		  keywords: {
			 keyword:
				// scripting commands
				'break cmake_host_system_information cmake_minimum_required cmake_parse_arguments ' +
				'cmake_policy configure_file continue elseif else endforeach endfunction endif endmacro ' +
				'endwhile execute_process file find_file find_library find_package find_path ' +
				'find_program foreach function get_cmake_property get_directory_property ' +
				'get_filename_component get_property if include include_guard list macro ' +
				'mark_as_advanced math message option return separate_arguments ' +
				'set_directory_properties set_property set site_name string unset variable_watch while ' +
				// project commands
				'add_compile_definitions add_compile_options add_custom_command add_custom_target ' +
				'add_definitions add_dependencies add_executable add_library add_link_options ' +
				'add_subdirectory add_test aux_source_directory build_command create_test_sourcelist ' +
				'define_property enable_language enable_testing export fltk_wrap_ui ' +
				'get_source_file_property get_target_property get_test_property include_directories ' +
				'include_external_msproject include_regular_expression install link_directories ' +
				'link_libraries load_cache project qt_wrap_cpp qt_wrap_ui remove_definitions ' +
				'set_source_files_properties set_target_properties set_tests_properties source_group ' +
				'target_compile_definitions target_compile_features target_compile_options ' +
				'target_include_directories target_link_directories target_link_libraries ' +
				'target_link_options target_sources try_compile try_run ' +
				// CTest commands
				'ctest_build ctest_configure ctest_coverage ctest_empty_binary_directory ctest_memcheck ' +
				'ctest_read_custom_files ctest_run_script ctest_sleep ctest_start ctest_submit ' +
				'ctest_test ctest_update ctest_upload ' +
				// deprecated commands
				'build_name exec_program export_library_dependencies install_files install_programs ' +
				'install_targets load_command make_directory output_required_files remove ' +
				'subdir_depends subdirs use_mangled_mesa utility_source variable_requires write_file ' +
				'qt5_use_modules qt5_use_package qt5_wrap_cpp ' +
				// core keywords
				'on off true false and or not command policy target test exists is_newer_than ' +
				'is_directory is_symlink is_absolute matches less greater equal less_equal ' +
				'greater_equal strless strgreater strequal strless_equal strgreater_equal version_less ' +
				'version_greater version_equal version_less_equal version_greater_equal in_list defined'
		  },
		  contains: [
			 {
				className: 'variable',
				begin: '\\${', end: '}'
			 },
			 _M0DE$.HASH_COMMENT_MODE,
			 _M0DE$.QUOTE_STRING_MODE,
			 _M0DE$.NUMBER_MODE
		  ]
	   };
	});
 
 registerLanguage('css',
	/*
	Language: CSS
	Category: common, css
	Website: https://developer.mozilla.org/en-US/docs/Web/CSS
	*/
	function css(_M0DE$) {
	   var FUNCTION_LIKE = {
		  begin: /[\w-]+\(/, returnBegin: true,
		  contains: [
			 {
				className: 'built_in',
				begin: /[\w-]+/
			 },
			 {
				begin: /\(/, end: /\)/,
				contains: [
				   _M0DE$.APOS_STRING_MODE,
				   _M0DE$.QUOTE_STRING_MODE,
				   _M0DE$.CSS_NUMBER_MODE,
				]
			 }
		  ]
	   };
	   var ATTRIBUTE = {
		  className: 'attribute',
		  begin: /\S/, end: ':', excludeEnd: true,
		  starts: {
			 endsWithParent: true, excludeEnd: true,
			 contains: [
				FUNCTION_LIKE,
				_M0DE$.CSS_NUMBER_MODE,
				_M0DE$.QUOTE_STRING_MODE,
				_M0DE$.APOS_STRING_MODE,
				_M0DE$.C_BLOCK_COMMENT_MODE,
				{
				   className: 'number', begin: '#[0-9A-Fa-f]+'
				},
				{
				   className: 'meta', begin: '!important'
				}
			 ]
		  }
	   };
	   var AT_IDENTIFIER = '@[a-z-]+'; // @font-face
	   var AT_MODIFIERS = "and or not only";
	   var AT_PROPERTY_RE = /@\-?\w[\w]*(\-\w+)*/; // @-webkit-keyframes
	   var IDENT_RE = '[a-zA-Z-][a-zA-Z0-9_-]*';
	   var RULE = {
		  begin: /(?:[A-Z\_\.\-]+|--[a-zA-Z0-9_-]+)\s*:/, returnBegin: true, end: ';', endsWithParent: true,
		  contains: [
			 ATTRIBUTE
		  ]
	   };
 
	   return {
		  name: 'CSS',
		  case_insensitive: true,
		  illegal: /[=\/|'\$]/,
		  contains: [
			 _M0DE$.C_BLOCK_COMMENT_MODE,
			 {
				className: 'selector-id', begin: /#[A-Za-z0-9_-]+/
			 },
			 {
				className: 'selector-class', begin: /\.[A-Za-z0-9_-]+/
			 },
			 {
				className: 'selector-attr',
				begin: /\[/, end: /\]/,
				illegal: '$',
				contains: [
				   _M0DE$.APOS_STRING_MODE,
				   _M0DE$.QUOTE_STRING_MODE,
				]
			 },
			 {
				className: 'selector-pseudo',
				begin: /:(:)?[a-zA-Z0-9\_\-\+\(\)"'.]+/
			 },
			 // matching these here allows us to treat them more like regular CSS
			 // rules so everything between the {} gets regular rule highlighting,
			 // which is what we want for page and font-face
			 {
				begin: '@(page|font-face)',
				lexemes: AT_IDENTIFIER,
				keywords: '@page @font-face'
			 },
			 {
				begin: '@', end: '[{;]', // at_rule eating first "{" is a good thing
				// because it doesn’t let it to be parsed as
				// a rule set but instead drops parser into
				// the default mode which is how it should be.
				illegal: /:/, // break on Less variables @var: ...
				returnBegin: true,
				contains: [
				   {
					  className: 'keyword',
					  begin: AT_PROPERTY_RE
				   },
				   {
					  begin: /\s/, endsWithParent: true, excludeEnd: true,
					  relevance: 0,
					  keywords: AT_MODIFIERS,
					  contains: [
						 {
							begin: /[a-z-]+:/,
							className: "attribute"
						 },
						 _M0DE$.APOS_STRING_MODE,
						 _M0DE$.QUOTE_STRING_MODE,
						 _M0DE$.CSS_NUMBER_MODE
					  ]
				   }
				]
			 },
			 {
				className: 'selector-tag', begin: IDENT_RE,
				relevance: 0
			 },
			 {
				begin: '{', end: '}',
				illegal: /\S/,
				contains: [_M0DE$.C_BLOCK_COMMENT_MODE, RULE,]
			 }
		  ]
	   };
	});
 
 registerLanguage('scala',
	/*
	Language: Scala
	Category: functional
	Author: Jan Berkel <jan.berkel@gmail.com>
	Contributors: Erik Osheim <d_m@plastic-idolatry.com>
	Website: https://www.scala-lang.org
	*/
	function scala(_M0DE$) {
 
	   var ANNOTATION = { className: 'meta', begin: '@[A-Za-z]+' };
 
	   // used in strings for escaping/interpolation/substitution
	   var SUBST = {
		  className: 'subst',
		  variants: [
			 { begin: '\\$[A-Za-z0-9_]+' },
			 { begin: '\\${', end: '}' }
		  ]
	   };
 
	   var STRING = {
		  className: 'string',
		  variants: [
			 {
				begin: '"', end: '"',
				illegal: '\\n',
				contains: [_M0DE$.BACKSLASH_ESCAPE]
			 },
			 {
				begin: '"""', end: '"""',
				relevance: 10
			 },
			 {
				begin: '[a-z]+"', end: '"',
				illegal: '\\n',
				contains: [_M0DE$.BACKSLASH_ESCAPE, SUBST]
			 },
			 {
				className: 'string',
				begin: '[a-z]+"""', end: '"""',
				contains: [SUBST],
				relevance: 10
			 }
		  ]
	   };
 
	   var SYMBOL = {
		  className: 'symbol',
		  begin: '\'\\w[\\w\\d_]*(?!\')'
	   };
 
	   var TYPE = {
		  className: 'type',
		  begin: '\\b[A-Z][A-Za-z0-9_]*',
		  relevance: 0
	   };
 
	   var NAME = {
		  className: 'title',
		  begin: /[^0-9\n\t "'(),.`{}\[\]:;][^\n\t "'(),.`{}\[\]:;]+|[^0-9\n\t "'(),.`{}\[\]:;=]/,
		  relevance: 0
	   };
 
	   var CLASS = {
		  className: 'class',
		  beginKeywords: 'class object trait type',
		  end: /[:={\[\n;]/,
		  excludeEnd: true,
		  contains: [
			 {
				beginKeywords: 'extends with',
				relevance: 10
			 },
			 {
				begin: /\[/,
				end: /\]/,
				excludeBegin: true,
				excludeEnd: true,
				relevance: 0,
				contains: [TYPE]
			 },
			 {
				className: 'params',
				begin: /\(/,
				end: /\)/,
				excludeBegin: true,
				excludeEnd: true,
				relevance: 0,
				contains: [TYPE]
			 },
			 NAME
		  ]
	   };
 
	   var METHOD = {
		  className: 'function',
		  beginKeywords: 'def',
		  end: /[:={\[(\n;]/,
		  excludeEnd: true,
		  contains: [NAME]
	   };
 
	   return {
		  name: 'Scala',
		  keywords: {
			 literal: 'true false null',
			 keyword: 'type yield lazy override def with val var sealed abstract private trait object if forSome for while throw finally protected extends import final return else break new catch super class case package default try this match continue throws implicit'
		  },
		  contains: [_M0DE$.C_LINE_COMMENT_MODE, _M0DE$.C_BLOCK_COMMENT_MODE, STRING, SYMBOL, TYPE, METHOD, CLASS, _M0DE$.C_NUMBER_MODE, ANNOTATION]
	   };
	});
 
 registerLanguage('markdown',
	/*
	Language: Markdown
	Requires: xml.js
	Author: John Crepezzi <john.crepezzi@gmail.com>
	Website: https://daringfireball.net/projects/markdown/
	Category: common, markup
	*/
	function markdown() {
	   const INLINE_HTML = {
		  begin: '<', end: '>',
		  subLanguage: 'xml',
		  relevance: 0
	   };
	   const HORIZONTAL_RULE = {
		  begin: '^[-\\*]{3,}', end: '$'
	   };
	   const CODE = {
		  className: 'code',
		  variants: [
			 // TODO: fix to allow these to work with sublanguage also
			 { begin: '(`{3,})(.|\\n)*?\\1`*[ ]*', },
			 { begin: '(~{3,})(.|\\n)*?\\1~*[ ]*', },
			 // needed to allow markdown as a sublanguage to work
			 { begin: '```', end: '```+[ ]*$' },
			 { begin: '~~~', end: '~~~+[ ]*$' },
			 { begin: '`.+?`' },
			 {
				begin: '(?=^( {4}|\\t))',
				// use contains to gobble up multiple lines to allow the block to be whatever size
				// but only have a single open/close tag vs one per line
				contains: [
				   { begin: '^( {4}|\\t)', end: '(\\n)$' }
				],
				relevance: 0
			 }
		  ]
	   };
	   const LIST = {
		  className: 'bullet',
		  begin: '^[ \t]*([*+-]|(\\d+\\.))(?=\\s+)',
		  end: '\\s+',
		  excludeEnd: true
	   };
	   const LINK_REFERENCE = {
		  begin: /^\[[^\n]+\]:/,
		  returnBegin: true,
		  contains: [
			 {
				className: 'symbol',
				begin: /\[/, end: /\]/,
				excludeBegin: true, excludeEnd: true
			 },
			 {
				className: 'link',
				begin: /:\s*/, end: /$/,
				excludeBegin: true
			 }
		  ]
	   };
	   const LINK = {
		  begin: '\\[.+?\\][\\(\\[].*?[\\)\\]]',
		  returnBegin: true,
		  contains: [
			 {
				className: 'string',
				begin: '\\[', end: '\\]',
				excludeBegin: true,
				returnEnd: true,
				relevance: 0
			 },
			 {
				className: 'link',
				begin: '\\]\\(', end: '\\)',
				excludeBegin: true, excludeEnd: true
			 },
			 {
				className: 'symbol',
				begin: '\\]\\[', end: '\\]',
				excludeBegin: true, excludeEnd: true
			 }
		  ],
		  relevance: 10
	   };
	   const BOLD = {
		  className: 'strong',
		  contains: [],
		  variants: [
			 { begin: /_{2}/, end: /_{2}/ },
			 { begin: /\*{2}/, end: /\*{2}/ }
		  ]
	   };
	   const ITALIC = {
		  className: 'emphasis',
		  contains: [],
		  variants: [
			 { begin: /\*(?!\*)/, end: /\*/ },
			 { begin: /_(?!_)/, end: /_/, relevance: 0 },
		  ]
	   };
	   BOLD.contains.push(ITALIC);
	   ITALIC.contains.push(BOLD);
 
	   var CONTAINABLE = [
		  INLINE_HTML,
		  LINK
	   ];
 
	   BOLD.contains = BOLD.contains.concat(CONTAINABLE);
	   ITALIC.contains = ITALIC.contains.concat(CONTAINABLE);
 
	   CONTAINABLE = CONTAINABLE.concat(BOLD, ITALIC);
 
	   const HEADER = {
		  className: 'section',
		  variants: [
			 {
				begin: '^#{1,6}',
				end: '$',
				contains: CONTAINABLE
			 },
			 {
				begin: '(?=^.+?\\n[=-]{2,}$)',
				contains: [
				   { begin: '^[=-]*$' },
				   { begin: '^', end: "\\n", contains: CONTAINABLE },
				]
			 }
		  ]
	   };
 
	   const BLOCKQUOTE = {
		  className: 'quote',
		  begin: '^>\\s+',
		  contains: CONTAINABLE,
		  end: '$',
	   };
	   return {
		  name: 'Markdown',
		  aliases: ['md', 'mkdown', 'mkd'],
		  contains: [HEADER, INLINE_HTML, LIST, BOLD, ITALIC, BLOCKQUOTE, CODE, HORIZONTAL_RULE, LINK, LINK_REFERENCE]
	   };
	});
 
 registerLanguage('objectivec',
	/*
	Language: Objective-C
	Author: Valerii Hiora <valerii.hiora@gmail.com>
	Contributors: Angel G. Olloqui <angelgarcia.mail@gmail.com>, Matt Diephouse <matt@diephouse.com>, Andrew Farmer <ahfarmer@gmail.com>, Minh Nguyễn <mxn@1ec5.org>
	Website: https://developer.apple.com/documentation/objectivec
	Category: common
	*/
	function objectivec(_M0DE$) {
	   var API_CLASS = {
		  className: 'built_in',
		  begin: '\\b(AV|CA|CF|CG|CI|CL|CM|CN|CT|MK|MP|MTK|MTL|NS|SCN|SK|UI|WK|XC)\\w+',
	   };
	   var IDENTIFIER_RE = /[a-zA-Z@][a-zA-Z0-9_]*/;
	   var OBJC_KEYWORDS = {
		  $pattern: IDENTIFIER_RE,
		  keyword:
			 'int float while char export sizeof typedef const struct for union ' +
			 'unsigned long volatile static bool mutable if do return goto void ' +
			 'enum else break extern asm case short default double register explicit ' +
			 'signed typename this switch continue wchar_t inline readonly assign ' +
			 'readwrite self @synchronized id typeof ' +
			 'nonatomic super unichar IBOutlet IBAction strong weak copy ' +
			 'in out inout bycopy byref oneway __strong __weak __block __autoreleasing ' +
			 '@private @protected @public @try @property @end @throw @catch @finally ' +
			 '@autoreleasepool @synthesize @dynamic @selector @optional @required ' +
			 '@encode @package @import @defs @compatibility_alias ' +
			 '__bridge __bridge_transfer __bridge_retained __bridge_retain ' +
			 '__covariant __contravariant __kindof ' +
			 '_Nonnull _Nullable _Null_unspecified ' +
			 '__FUNCTION__ __PRETTY_FUNCTION__ __attribute__ ' +
			 'getter setter retain unsafe_unretained ' +
			 'nonnull nullable null_unspecified null_resettable class instancetype ' +
			 'NS_DESIGNATED_INITIALIZER NS_UNAVAILABLE NS_REQUIRES_SUPER ' +
			 'NS_RETURNS_INNER_POINTER NS_INLINE NS_AVAILABLE NS_DEPRECATED ' +
			 'NS_ENUM NS_OPTIONS NS_SWIFT_UNAVAILABLE ' +
			 'NS_ASSUME_NONNULL_BEGIN NS_ASSUME_NONNULL_END ' +
			 'NS_REFINED_FOR_SWIFT NS_SWIFT_NAME NS_SWIFT_NOTHROW ' +
			 'NS_DURING NS_HANDLER NS_ENDHANDLER NS_VALUERETURN NS_VOIDRETURN',
		  literal:
			 'false true FALSE TRUE nil YES NO NULL',
		  built_in:
			 'BOOL dispatch_once_t dispatch_queue_t dispatch_sync dispatch_async dispatch_once'
	   };
	   var CLASS_KEYWORDS = {
		  $pattern: IDENTIFIER_RE,
		  keyword: '@interface @class @protocol @implementation'
	   };
	   return {
		  name: 'Objective-C',
		  aliases: ['mm', 'objc', 'obj-c'],
		  keywords: OBJC_KEYWORDS,
		  illegal: '</',
		  contains: [
			 API_CLASS,
			 _M0DE$.C_LINE_COMMENT_MODE,
			 _M0DE$.C_BLOCK_COMMENT_MODE,
			 _M0DE$.C_NUMBER_MODE,
			 _M0DE$.QUOTE_STRING_MODE,
			 _M0DE$.APOS_STRING_MODE,
			 {
				className: 'string',
				variants: [
				   {
					  begin: '@"', end: '"',
					  illegal: '\\n',
					  contains: [_M0DE$.BACKSLASH_ESCAPE]
				   }
				]
			 },
			 {
				className: 'meta',
				begin: /#\s*[a-z]+\b/, end: /$/,
				keywords: {
				   'meta-keyword':
					  'if else elif endif define undef warning error line ' +
					  'pragma ifdef ifndef include'
				},
				contains: [
				   {
					  begin: /\\\n/, relevance: 0
				   },
				   inherit(_M0DE$.QUOTE_STRING_MODE, { className: 'meta-string' }),
				   {
					  className: 'meta-string',
					  begin: /<.*?>/, end: /$/,
					  illegal: '\\n',
				   },
				   _M0DE$.C_LINE_COMMENT_MODE,
				   _M0DE$.C_BLOCK_COMMENT_MODE
				]
			 },
			 {
				className: 'class',
				begin: '(' + CLASS_KEYWORDS.keyword.split(' ').join('|') + ')\\b', end: '({|$)', excludeEnd: true,
				keywords: CLASS_KEYWORDS,
				contains: [
				   _M0DE$.UNDERSCORE_TITLE_MODE
				]
			 },
			 {
				begin: '\\.' + _M0DE$.UNDERSCORE_IDENT_RE,
				relevance: 0
			 }
		  ]
	   };
	});
 
 registerLanguage('fsharp',
	/*
	Language: F#
	Author: Jonas Follesø <jonas@follesoe.no>
	Contributors: Troy Kershaw <hello@troykershaw.com>, Henrik Feldt <henrik@haf.se>
	Website: https://docs.microsoft.com/en-us/dotnet/fsharp/
	Category: functional
	*/
	function fsharp(_M0DE$) {
	   var TYPEPARAM = {
		  begin: '<', end: '>',
		  contains: [
			 inherit(_M0DE$.TITLE_MODE, { begin: /'[a-zA-Z0-9_]+/ })
		  ]
	   };
	   return {
		  name: 'F#',
		  aliases: ['fs'],
		  keywords:
			 'abstract and as assert base begin class default delegate do done ' +
			 'downcast downto elif else end exception extern false finally for ' +
			 'fun function global if in inherit inline interface internal lazy let ' +
			 'match member module mutable namespace new null of open or ' +
			 'override private public rec return sig static struct then to ' +
			 'true try type upcast use val void when while with yield',
		  illegal: /\/\*/,
		  contains: [
			 {
				// monad builder keywords (matches before non-bang kws)
				className: 'keyword',
				begin: /\b(yield|return|let|do)!/
			 },
			 {
				className: 'string',
				begin: '@"', end: '"',
				contains: [{ begin: '""' }]
			 },
			 {
				className: 'string',
				begin: '"""', end: '"""'
			 },
			 _M0DE$.COMMENT('\\(\\*', '\\*\\)'),
			 {
				className: 'class',
				beginKeywords: 'type', end: '\\(|=|$', excludeEnd: true,
				contains: [
				   _M0DE$.UNDERSCORE_TITLE_MODE,
				   TYPEPARAM
				]
			 },
			 {
				className: 'meta',
				begin: '\\[<', end: '>\\]',
				relevance: 10
			 },
			 {
				className: 'symbol',
				begin: '\\B(\'[A-Za-z])\\b',
				contains: [_M0DE$.BACKSLASH_ESCAPE]
			 },
			 _M0DE$.C_LINE_COMMENT_MODE,
			 inherit(_M0DE$.QUOTE_STRING_MODE, { illegal: null }),
			 _M0DE$.C_NUMBER_MODE
		  ]
	   };
	});
 
 registerLanguage('fortran',
	/*
	Language: Fortran
	Author: Anthony Scemama <scemama@irsamc.ups-tlse.fr>
	Website: https://en.wikipedia.org/wiki/Fortran
	Category: scientific
	*/
	function fortran(_M0DE$) {
	   const PARAMS = {
		  className: 'params',
		  begin: '\\(', end: '\\)'
	   };
 
	   const COMMENT = {
		  variants: [
			 _M0DE$.COMMENT('!', '$', { relevance: 0 }),
			 // allow Fortran 77 style comments
			 _M0DE$.COMMENT('^C', '$', { relevance: 0 })
		  ]
	   };
 
	   const NUMBER = {
		  className: 'number',
		  // regex in both fortran and irpf90 should match
		  begin: '(?=\\b|\\+|\\-|\\.)(?:\\.|\\d+\\.?)\\d*([de][+-]?\\d+)?(_[a-z_\\d]+)?',
		  relevance: 0
	   };
 
	   const FUNCTION_DEF = {
		  className: 'function',
		  beginKeywords: 'subroutine function program',
		  illegal: '[${=\\n]',
		  contains: [_M0DE$.UNDERSCORE_TITLE_MODE, PARAMS]
	   };
 
	   const STRING = {
		  className: 'string',
		  relevance: 0,
		  variants: [
			 _M0DE$.APOS_STRING_MODE,
			 _M0DE$.QUOTE_STRING_MODE
		  ]
	   };
 
	   const KEYWORDS = {
		  literal: '.False. .True.',
		  keyword: 'kind do concurrent local shared while private call intrinsic where elsewhere ' +
			 'type endtype endmodule endselect endinterface end enddo endif if forall endforall only contains default return stop then block endblock endassociate ' +
			 'public subroutine|10 function program .and. .or. .not. .le. .eq. .ge. .gt. .lt. ' +
			 'goto save else use module select case ' +
			 'access blank direct exist file fmt form formatted iostat name named nextrec number opened rec recl sequential status unformatted unit ' +
			 'continue format pause cycle exit ' +
			 'c_null_char c_alert c_backspace c_form_feed flush wait decimal round iomsg ' +
			 'synchronous nopass non_overridable pass protected volatile abstract extends import ' +
			 'non_intrinsic value deferred generic final enumerator class associate bind enum ' +
			 'c_int c_short c_long c_long_long c_signed_char c_size_t c_int8_t c_int16_t c_int32_t c_int64_t c_int_least8_t c_int_least16_t ' +
			 'c_int_least32_t c_int_least64_t c_int_fast8_t c_int_fast16_t c_int_fast32_t c_int_fast64_t c_intmax_t C_intptr_t c_float c_double ' +
			 'c_long_double c_float_complex c_double_complex c_long_double_complex c_bool c_char c_null_ptr c_null_funptr ' +
			 'c_new_line c_carriage_return c_horizontal_tab c_vertical_tab iso_c_binding c_loc c_funloc c_associated  c_f_pointer ' +
			 'c_ptr c_funptr iso_fortran_env character_storage_size error_unit file_storage_size input_unit iostat_end iostat_eor ' +
			 'numeric_storage_size output_unit c_f_procpointer ieee_arithmetic ieee_support_underflow_control ' +
			 'ieee_get_underflow_mode ieee_set_underflow_mode newunit contiguous recursive ' +
			 'pad position action delim readwrite eor advance nml interface procedure namelist include sequence elemental pure impure ' +
			 'integer real character complex logical codimension dimension allocatable|10 parameter ' +
			 'external implicit|10 none double precision assign intent optional pointer ' +
			 'target in out common equivalence data',
		  built_in: 'alog alog10 amax0 amax1 amin0 amin1 amod cabs ccos cexp clog csin csqrt dabs dacos dasin datan datan2 dcos dcosh ddim dexp dint ' +
			 'dlog dlog10 dmax1 dmin1 dmod dnint dsign dsin dsinh dsqrt dtan dtanh float iabs idim idint idnint ifix isign max0 max1 min0 min1 sngl ' +
			 'algama cdabs cdcos cdexp cdlog cdsin cdsqrt cqabs cqcos cqexp cqlog cqsin cqsqrt dcmplx dconjg derf derfc dfloat dgamma dimag dlgama ' +
			 'iqint qabs qacos qasin qatan qatan2 qcmplx qconjg qcos qcosh qdim qerf qerfc qexp qgamma qimag qlgama qlog qlog10 qmax1 qmin1 qmod ' +
			 'qnint qsign qsin qsinh qsqrt qtan qtanh abs acos aimag aint anint asin atan atan2 char cmplx conjg cos cosh exp ichar index int log ' +
			 'log10 max min nint sign sin sinh sqrt tan tanh print write dim lge lgt lle llt mod nullify allocate deallocate ' +
			 'adjustl adjustr all allocated any associated bit_size btest ceiling count cshift date_and_time digits dot_product ' +
			 'eoshift epsilon exponent floor fraction huge iand ibclr ibits ibset ieor ior ishft ishftc lbound len_trim matmul ' +
			 'maxexponent maxloc maxval merge minexponent minloc minval modulo mvbits nearest pack present product ' +
			 'radix random_number random_seed range repeat reshape rrspacing scale scan selected_int_kind selected_real_kind ' +
			 'set_exponent shape size spacing spread sum system_clock tiny transpose trim ubound unpack verify achar iachar transfer ' +
			 'dble entry dprod cpu_time command_argument_count get_command get_command_argument get_environment_variable is_iostat_end ' +
			 'ieee_arithmetic ieee_support_underflow_control ieee_get_underflow_mode ieee_set_underflow_mode ' +
			 'is_iostat_eor move_alloc new_line selected_char_kind same_type_as extends_type_of ' +
			 'acosh asinh atanh bessel_j0 bessel_j1 bessel_jn bessel_y0 bessel_y1 bessel_yn erf erfc erfc_scaled gamma log_gamma hypot norm2 ' +
			 'atomic_define atomic_ref execute_command_line leadz trailz storage_size merge_bits ' +
			 'bge bgt ble blt dshiftl dshiftr findloc iall iany iparity image_index lcobound ucobound maskl maskr ' +
			 'num_images parity popcnt poppar shifta shiftl shiftr this_image sync change team co_broadcast co_max co_min co_sum co_reduce'
	   };
	   return {
		  name: 'Fortran',
		  case_insensitive: true,
		  aliases: ['f90', 'f95'],
		  keywords: KEYWORDS,
		  illegal: /\/\*/,
		  contains: [
			 STRING,
			 FUNCTION_DEF,
			 // allow `C = value` for assignments so they aren't misdetected
			 // as Fortran 77 style comments
			 {
				begin: /^C\s*=(?!=)/,
				relevance: 0,
			 },
			 COMMENT,
			 NUMBER
		  ]
	   };
	});
 
 registerLanguage('erlang-repl',
	/*
	Language: Erlang REPL
	Author: Sergey Ignatov <sergey@ignatov.spb.su>
	Website: https://www.erlang.org
	Category: functional
	*/
	function erlangRepl(_M0DE$) {
	   return {
		  name: 'Erlang REPL',
		  keywords: {
			 built_in:
				'spawn spawn_link self',
			 keyword:
				'after and andalso|10 band begin bnot bor bsl bsr bxor case catch cond div end fun if ' +
				'let not of or orelse|10 query receive rem try when xor'
		  },
		  contains: [
			 {
				className: 'meta', begin: '^[0-9]+> ',
				relevance: 10
			 },
			 _M0DE$.COMMENT('%', '$'),
			 {
				className: 'number',
				begin: '\\b(\\d+(_\\d+)*#[a-fA-F0-9]+(_[a-fA-F0-9]+)*|\\d+(_\\d+)*(\\.\\d+(_\\d+)*)?([eE][-+]?\\d+)?)',
				relevance: 0
			 },
			 _M0DE$.APOS_STRING_MODE,
			 _M0DE$.QUOTE_STRING_MODE,
			 { begin: '\\?(::)?([A-Z]\\w*(::)?)+' },
			 { begin: '->' },
			 { begin: 'ok' },
			 { begin: '!' },
			 { begin: '(\\b[a-z\'][a-zA-Z0-9_\']*:[a-z\'][a-zA-Z0-9_\']*)|(\\b[a-z\'][a-zA-Z0-9_\']*)', relevance: 0 },
			 { begin: '[A-Z][a-zA-Z0-9_\']*', relevance: 0 }
		  ]
	   };
	});
 }

function getHLJSStyle(n) {
	var  styles = HighlightJS.Styles;
	if( !styles ) {
		 styles = [
		{  "name": "LOR Default",
			"css": ''
		},
		{  "name": "Darcula",
			"css": ".code.lc{background:#2b2b2b}.lc code{color:#bababa}.lc .emphasis,.lc .strong{color:#a8a8a2}.lc .bullet,.lc .link,.lc .literal,.lc .number,.lc .quote,.lc .regexp{color:#6896ba}.lc .code,.lc .selector-class{color:#a6e22e}.lc .attribute,.lc .keyword,.lc .name,.lc .section,.lc .selector-tag,.lc .variable{color:#cb7832}.lc .params{color:#b9b9b9}.lc .string{color:#6a8759}.lc .addition,.lc .built_in,.lc .builtin-name,.lc .selector-attr,.lc .selector-id,.lc .selector-pseudo,.lc .subst,.lc .symbol,.lc .template-tag,.lc .template-variable,.lc .type{color:#e0c46c}.lc .comment,.lc .deletion,.lc .meta{color:#7f7f7f}"
		},
		{  "name": "Agate",
			"css": ".code.lc{background:#333}.lc code{color:#fff}.lc .name{font-weight:700}.lc .code{font-style:italic}.lc .tag{color:#62c8f3}.lc .selector-class,.lc .selector-id,.lc .template-variable,.lc .variable{color:#ade5fc}.lc .bullet,.lc .string{color:#a2fca2}.lc .attribute,.lc .built_in,.lc .builtin-name,.lc .quote,.lc .section,.lc .title,.lc .type{color:#ffa}.lc .bullet,.lc .number,.lc .symbol{color:#d36363}.lc .keyword,.lc .literal,.lc .selector-tag{color:#fcc28c}.lc .code,.lc .comment,.lc .deletion{color:#888}.lc .link,.lc .regexp{color:#c6b4f0}.lc .meta{color:#fc9b9b}.lc .deletion{background-color:#fc9b9b;color:#333}.lc .addition{background-color:#a2fca2;color:#333}"
		},
		{  "name": "Railscasts",
			"css": ".code.lc{background:#232323}.lc code{color:#e6e1dc}.lc .comment,.lc .quote{color:#bc9458;font-style:italic}.lc .keyword,.lc .selector-tag{color:#c26230}.lc .number,.lc .regexp,.lc .string,.lc .template-variable,.lc .variable{color:#a5c261}.lc .subst{color:#519f50}.lc .name,.lc .tag{color:#e8bf6a}.lc .type{color:#da4939}.lc .attr,.lc .built_in,.lc .builtin-name,.lc .bullet,.lc .link,.lc .symbol{color:#6d9cbe}.lc .params{color:#d0d0ff}.lc .attribute{color:#cda869}.lc .meta{color:#9b859d}.lc .section,.lc .title{color:#ffc66d}.lc .addition{background-color:#144212;color:#e6e1dc;display:inline-block;width:100%}.lc .deletion{background-color:#600;color:#e6e1dc;display:inline-block;width:100%}.lc .selector-class{color:#9b703f}.lc .selector-id{color:#8b98ab}"
		},
		{  "name": "Arduino Light",
			"css": ".code.lc{background:#fff}.lc code,.lc .subst{color:#434f54}.lc .attribute,.lc .doctag,.lc .keyword,.lc .name,.lc .selector-tag{color:#00979d}.lc .addition,.lc .built_in,.lc .bullet,.lc .code,.lc .literal{color:#d35400}.lc .link,.lc .regexp,.lc .selector-attr,.lc .selector-pseudo,.lc .symbol,.lc .template-variable,.lc .variable{color:#00979d}.lc .deletion,.lc .quote,.lc .selector-class,.lc .selector-id,.lc .string,.lc .template-tag,.lc .type{color:#005c5f}.lc .section,.lc .title{color:#800;font-weight:700}.lc .comment{color:rgba(149,165,166,.8)}.lc .meta-keyword{color:#728e00}.lc .meta{color:#434f54}.lc .function{color:#728e00}.lc .number{color:#8a7b52}"
		},
		{  "name": "Github",
			"css": ".code.lc{background:#f8f8f8}.lc code{color:#333}.lc .comment,.lc .quote{color:#998;font-style:italic}.lc .keyword,.lc .selector-tag,.lc .subst{color:#333;font-weight:700}.lc .literal,.lc .number,.lc .tag .lc .attr,.lc .template-variable,.lc .variable{color:teal}.lc .doctag,.lc .string{color:#d14}.lc .section,.lc .selector-id,.lc .title{color:#900;font-weight:700}.lc .subst{font-weight:400}.lc .class .lc .title,.lc .type{color:#458;font-weight:700}.lc .attribute,.lc .name,.lc .tag{color:navy;font-weight:400}.lc .link,.lc .regexp{color:#009926}.lc .bullet,.lc .symbol{color:#990073}.lc .built_in,.lc .builtin-name{color:#0086b3}.lc .meta{color:#999;font-weight:700}.lc .deletion{background:#fdd}.lc .addition{background:#dfd}"
		},
		{  "name": "Github Gist",
			"css": ".code.lc{background:#fff}.lc code{color:#333}.lc .comment,.lc .meta{color:#969896}.lc .emphasis,.lc .quote,.lc .strong,.lc .template-variable,.lc .variable{color:#df5000}.lc .keyword,.lc .selector-tag,.lc .type{color:#d73a49}.lc .attribute,.lc .bullet,.lc .literal,.lc .symbol{color:#0086b3}.lc .name,.lc .section{color:#63a35c}.lc .tag{color:#333}.lc .attr,.lc .selector-attr,.lc .selector-class,.lc .selector-id,.lc .selector-pseudo,.lc .title{color:#6f42c1}.lc .addition{color:#55a532;background-color:#eaffea}.lc .deletion{color:#bd2c00;background-color:#ffecec}.lc .number{color:#005cc5}.lc .string{color:#032f62}"
		},
		{  "name": "Docco",
			"css": ".code.lc{background:#f8f8ff}.lc code{color:#000}.lc .comment,.lc .quote{color:#408080;font-style:italic}.lc .keyword,.lc .literal,.lc .selector-tag,.lc .subst{color:#954121}.lc .number{color:#40a070}.lc .doctag,.lc .string{color:#219161}.lc .section,.lc .selector-class,.lc .selector-id,.lc .type{color:#19469d}.lc .params{color:#00f}.lc .title{color:#458;font-weight:700}.lc .attribute,.lc .name,.lc .tag{color:navy;font-weight:400}.lc .template-variable,.lc .variable{color:teal}.lc .link,.lc .regexp{color:#b68}.lc .bullet,.lc .symbol{color:#990073}.lc .built_in,.lc .builtin-name{color:#0086b3}.lc .meta{color:#999;font-weight:700}.lc .deletion{background:#fdd}.lc .addition{background:#dfd}"
		},
		{  "name": "Idea",
			"css": ".code.lc{background:#fff}.lc code{color:#000}.lc .subst,.lc .title{font-weight:400;color:#000}.lc .comment,.lc .quote{color:grey;font-style:italic}.lc .meta{color:olive}.lc .tag{background:#efefef}.lc .keyword,.lc .literal,.lc .name,.lc .section,.lc .selector-class,.lc .selector-id,.lc .selector-tag,.lc .type{font-weight:700;color:navy}.lc .attribute,.lc .link,.lc .number,.lc .regexp{font-weight:700;color:#00f}.lc .link,.lc .number,.lc .regexp{font-weight:400}.lc .string{color:green;font-weight:700}.lc .bullet,.lc .formula,.lc .symbol{color:#000;background:#d0eded;font-style:italic}.lc .doctag{text-decoration:underline}.lc .template-variable,.lc .variable{color:#660e7a}.lc .addition{background:#baeeba}.lc .deletion{background:#ffc8bd}"
		},
		{  "name": "Xcode",
			"css": ".code.lc{background:#fff}.lc code{color:#000}.xml .lc .meta{color:silver}.lc .comment,.lc .quote{color:#007400}.lc .attribute,.lc .keyword,.lc .literal,.lc .name,.lc .selector-tag,.lc .tag{color:#aa0d91}.lc .template-variable,.lc .variable{color:#3f6e74}.lc .code,.lc .meta-string,.lc .string{color:#c41a16}.lc .link,.lc .regexp{color:#0e0eff}.lc .bullet,.lc .number,.lc .symbol,.lc .title{color:#1c00cf}.lc .meta,.lc .section{color:#643820}.lc .built_in,.lc .builtin-name,.lc .class .lc .title,.lc .params,.lc .type{color:#5c2699}.lc .attr{color:#836c28}.lc .subst{color:#000}.lc .formula{background-color:#eee;font-style:italic}.lc .addition{background-color:#baeeba}.lc .deletion{background-color:#ffc8bd}.lc .selector-class,.lc .selector-id{color:#9b703f}.lc .doctag{font-weight:700}"
		},
		{  "name": "Night Owl",
			"css": ".code.lc{background:#011627}.lc code{color:#d6deeb}.lc .keyword{color:#c792ea;font-style:italic}.lc .built_in{color:#addb67;font-style:italic}.lc .type{color:#82aaff}.lc .literal{color:#ff5874}.lc .number{color:#f78c6c}.lc .regexp{color:#5ca7e4}.lc .string{color:#ecc48d}.lc .subst{color:#d3423e}.lc .symbol{color:#82aaff}.lc .class{color:#ffcb8b}.lc .function{color:#82aaff}.lc .title{color:#dcdcaa;font-style:italic}.lc .params{color:#7fdbca}.lc .comment{color:#637777;font-style:italic}.lc .doctag{color:#7fdbca}.lc .meta{color:#82aaff}.lc .meta-keyword{color:#82aaff}.lc .meta-string{color:#ecc48d}.lc .section{color:#82b1ff}.lc .builtin-name,.lc .name,.lc .tag{color:#7fdbca}.lc .attr{color:#7fdbca}.lc .attribute{color:#80cbc4}.lc .variable{color:#addb67}.lc .bullet{color:#d9f5dd}.lc .code{color:#80cbc4}.lc .emphasis{color:#c792ea}.lc .strong{color:#addb67}.lc .formula{color:#c792ea}.lc .link{color:#ff869a}.lc .quote{color:#697098;font-style:italic}.lc .selector-tag{color:#ff6363}.lc .selector-id{color:#fad430}.lc .selector-class{color:#addb67;font-style:italic}.lc .selector-attr,.lc .selector-pseudo{color:#c792ea;font-style:italic}.lc .template-tag{color:#c792ea}.lc .template-variable{color:#addb67}.lc .addition{color:#addb67ff;font-style:italic}.lc .deletion{color:#ef535090;font-style:italic}"
		},
		{  "name": "Brown Paper",
			"css": ".code.lc{background:#b7a68e}.lc .keyword,.lc .literal,.lc .selector-tag{color:#059;font-weight:700}.lc code,.lc .subst{color:#363c69}.lc .addition,.lc .attribute,.lc .built_in,.lc .bullet,.lc .link,.lc .name,.lc .section,.lc .string,.lc .symbol,.lc .template-tag,.lc .template-variable,.lc .title,.lc .type,.lc .variable{color:#2c009f}.lc .comment,.lc .deletion,.lc .meta,.lc .quote{color:#802022}.lc .doctag,.lc .keyword,.lc .literal,.lc .name,.lc .section,.lc .selector-tag,.lc .title,.lc .type{font-weight:700}"
		},
		{  "name": "Gradient Light",
			"css": ".code.lc{background:#fffd8d;background:linear-gradient(142deg,#fffd8d 0,#fcb7ff 35%,#90ecff 100%)}.lc code{color:#250482}.lc .subtr{color:#01958b}.lc .comment,.lc .doctag,.lc .meta,.lc .quote{color:#cb7200}.lc .attr,.lc .regexp,.lc .selector-id,.lc .selector-tag,.lc .tag,.lc .template-tag{color:#07bd5f}.lc .bullet,.lc .params,.lc .selector-class{color:#43449f}.lc .keyword,.lc .meta-keyword,.lc .section,.lc .symbol,.lc .type{color:#7d2801}.lc .addition,.lc .link,.lc .number{color:#7f0096}.lc .string{color:#38c0ff}.lc .addition,.lc .attribute{color:#296562}.lc .template-variable,.lc .variable{color:#025c8f}.lc .built_in,.lc .builtin-name,.lc .class,.lc .formula,.lc .function,.lc .name,.lc .title{color:#529117}.lc .deletion,.lc .literal,.lc .selector-pseudo{color:#ad13ff}.lc .quote{font-style:italic}.lc .keyword,.lc .params,.lc .section,.lc .selector-class,.lc .selector-id,.lc .selector-tag,.lc .template-tag{font-weight:700}"
		},
		{  "name": "Gradient Dark",
			"css": ".code.lc{background:#501f7a;background:linear-gradient(166deg,#501f7a 0,#2820b3 80%)}.lc code{color:#e7e4eb}.lc .subtr{color:#e7e4eb}.lc .comment,.lc .doctag,.lc .meta,.lc .quote{color:#af8dd9}.lc .attr,.lc .regexp,.lc .selector-id,.lc .selector-tag,.lc .tag,.lc .template-tag{color:#aefbff}.lc .bullet,.lc .params,.lc .selector-class{color:#f19fff}.lc .keyword,.lc .meta-keyword,.lc .section,.lc .symbol,.lc .type{color:#17fc95}.lc .addition,.lc .link,.lc .number{color:#c5fe00}.lc .string{color:#38c0ff}.lc .addition,.lc .attribute{color:#e7ff9f}.lc .template-variable,.lc .variable{color:#e447ff}.lc .built_in,.lc .builtin-name,.lc .class,.lc .formula,.lc .function,.lc .name,.lc .title{color:#ffc800}.lc .deletion,.lc .literal,.lc .selector-pseudo{color:#ff9e44}.lc .quote{font-style:italic}.lc .keyword,.lc .params,.lc .section,.lc .selector-class,.lc .selector-id,.lc .selector-tag,.lc .template-tag{font-weight:700}"
		},
		{  "name": "Tomorrow",
			"css": ".lc .comment,.lc .quote{color:#8e908c}.lc .deletion,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#c82829}.lc .built_in,.lc .builtin-name,.lc .link,.lc .literal,.lc .meta,.lc .number,.lc .params,.lc .type{color:#f5871f}.lc .attribute{color:#eab700}.lc .addition,.lc .bullet,.lc .string,.lc .symbol{color:#718c00}.lc .section,.lc .title{color:#4271ae}.lc .keyword,.lc .selector-tag{color:#8959a8}.code.lc{background:#fff}.lc code{color:#4d4d4c}"
		},
		{  "name": "Tomorrow Night",
			"css": ".lc .comment,.lc .quote{color:#969896}.lc .deletion,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#c66}.lc .built_in,.lc .builtin-name,.lc .link,.lc .literal,.lc .meta,.lc .number,.lc .params,.lc .type{color:#de935f}.lc .attribute{color:#f0c674}.lc .addition,.lc .bullet,.lc .string,.lc .symbol{color:#b5bd68}.lc .section,.lc .title{color:#81a2be}.lc .keyword,.lc .selector-tag{color:#b294bb}.code.lc{background:#1d1f21}.lc code{color:#c5c8c6}"
		},
		{  "name": "Tomorrow Night Blue",
			"css": ".lc .comment,.lc .quote{color:#7285b7}.lc .deletion,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#ff9da4}.lc .built_in,.lc .builtin-name,.lc .link,.lc .literal,.lc .meta,.lc .number,.lc .params,.lc .type{color:#ffc58f}.lc .attribute{color:#ffeead}.lc .addition,.lc .bullet,.lc .string,.lc .symbol{color:#d1f1a9}.lc .section,.lc .title{color:#bbdaff}.lc .keyword,.lc .selector-tag{color:#ebbbff}.code.lc{background:#002451}.lc code{color:#fff}"
		},
		{  "name": "Tomorrow Night Eighties",
			"css": ".lc .comment,.lc .quote{color:#999}.lc .deletion,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#f2777a}.lc .built_in,.lc .builtin-name,.lc .link,.lc .literal,.lc .meta,.lc .number,.lc .params,.lc .type{color:#f99157}.lc .attribute{color:#fc6}.lc .addition,.lc .bullet,.lc .string,.lc .symbol{color:#9c9}.lc .section,.lc .title{color:#69c}.lc .keyword,.lc .selector-tag{color:#c9c}.code.lc{background:#2d2d2d}.lc code{color:#ccc}"
		},
		{  "name": "Tomorrow Night Bright",
			"css": ".lc .comment,.lc .quote{color:#969896}.lc .deletion,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#d54e53}.lc .built_in,.lc .builtin-name,.lc .link,.lc .literal,.lc .meta,.lc .number,.lc .params,.lc .type{color:#e78c45}.lc .attribute{color:#e7c547}.lc .addition,.lc .bullet,.lc .string,.lc .symbol{color:#b9ca4a}.lc .section,.lc .title{color:#7aa6da}.lc .keyword,.lc .selector-tag{color:#c397d8}.code.lc{background:#000}.lc code{color:#eaeaea}"
		},
		{  "name": "Atelier Sulphurpool Light",
			"css": ".lc .comment,.lc .quote{color:#6b7394}.lc .attribute,.lc .link,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#c94922}.lc .built_in,.lc .builtin-name,.lc .literal,.lc .meta,.lc .number,.lc .params,.lc .type{color:#c76b29}.lc .bullet,.lc .string,.lc .symbol{color:#ac9739}.lc .section,.lc .title{color:#3d8fd1}.lc .keyword,.lc .selector-tag{color:#6679cc}.code.lc{background:#f5f7ff}.lc code{color:#5e6687}"
		},
		{  "name": "Atelier Lakeside Light",
			"css": ".lc .comment,.lc .quote{color:#5a7b8c}.lc .attribute,.lc .link,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#d22d72}.lc .built_in,.lc .builtin-name,.lc .literal,.lc .meta,.lc .number,.lc .params,.lc .type{color:#935c25}.lc .bullet,.lc .string,.lc .symbol{color:#568c3b}.lc .section,.lc .title{color:#257fad}.lc .keyword,.lc .selector-tag{color:#6b6bb8}.code.lc{background:#ebf8ff}.lc code{color:#516d7b}"
		},
		{  "name": "Atelier Seaside Light",
			"css": ".lc .comment,.lc .quote{color:#687d68}.lc .attribute,.lc .link,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#e6193c}.lc .built_in,.lc .builtin-name,.lc .literal,.lc .meta,.lc .number,.lc .params,.lc .type{color:#87711d}.lc .bullet,.lc .string,.lc .symbol{color:#29a329}.lc .section,.lc .title{color:#3d62f5}.lc .keyword,.lc .selector-tag{color:#ad2bee}.code.lc{background:#f4fbf4}.lc code{color:#5e6e5e}"
		},
		{  "name": "Atelier Estuary Light",
			"css": ".lc .comment,.lc .quote{color:#6c6b5a}.lc .attribute,.lc .link,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#ba6236}.lc .built_in,.lc .builtin-name,.lc .literal,.lc .meta,.lc .number,.lc .params,.lc .type{color:#ae7313}.lc .bullet,.lc .string,.lc .symbol{color:#7d9726}.lc .section,.lc .title{color:#36a166}.lc .keyword,.lc .selector-tag{color:#5f9182}.lc .addition,.lc .deletion{color:#22221b;display:inline-block;width:100%}.lc .deletion{background-color:#ba6236}.lc .addition{background-color:#7d9726}.code.lc{background:#f4f3ec}.lc code{color:#5f5e4e}"
		},
		{  "name": "Atelier Savanna Light",
			"css": ".lc .comment,.lc .quote{color:#5f6d64}.lc .attribute,.lc .link,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#b16139}.lc .built_in,.lc .builtin-name,.lc .literal,.lc .meta,.lc .number,.lc .params,.lc .type{color:#9f713c}.lc .bullet,.lc .string,.lc .symbol{color:#489963}.lc .section,.lc .title{color:#478c90}.lc .keyword,.lc .selector-tag{color:#55859b}.lc .addition,.lc .deletion{color:#171c19;display:inline-block;width:100%}.lc .deletion{background-color:#b16139}.lc .addition{background-color:#489963}.code.lc{background:#ecf4ee}.lc code{color:#526057}"
		},
		{  "name": "Atelier Plateau Light",
			"css": ".lc .comment,.lc .quote{color:#655d5d}.lc .attribute,.lc .link,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#ca4949}.lc .built_in,.lc .builtin-name,.lc .literal,.lc .meta,.lc .number,.lc .params,.lc .type{color:#b45a3c}.lc .bullet,.lc .string,.lc .symbol{color:#4b8b8b}.lc .section,.lc .title{color:#7272ca}.lc .keyword,.lc .selector-tag{color:#8464c4}.lc .addition,.lc .deletion{color:#1b1818;display:inline-block;width:100%}.lc .deletion{background-color:#ca4949}.lc .addition{background-color:#4b8b8b}.code.lc{background:#f4ecec}.lc code{color:#585050}"
		},
		{  "name": "Atelier Forest Light",
			"css": ".lc .comment,.lc .quote{color:#766e6b}.lc .attribute,.lc .link,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#f22c40}.lc .built_in,.lc .builtin-name,.lc .literal,.lc .meta,.lc .number,.lc .params,.lc .type{color:#df5320}.lc .bullet,.lc .string,.lc .symbol{color:#7b9726}.lc .section,.lc .title{color:#407ee7}.lc .keyword,.lc .selector-tag{color:#6666ea}.code.lc{background:#f1efee}.lc code{color:#68615e}"
		},
		{  "name": "Atelier Heath Light",
			"css": ".lc .comment,.lc .quote{color:#776977}.lc .attribute,.lc .link,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#ca402b}.lc .built_in,.lc .builtin-name,.lc .literal,.lc .meta,.lc .number,.lc .params,.lc .type{color:#a65926}.lc .bullet,.lc .string,.lc .symbol{color:#918b3b}.lc .section,.lc .title{color:#516aec}.lc .keyword,.lc .selector-tag{color:#7b59c0}.code.lc{background:#f7f3f7}.lc code{color:#695d69}"
		},
		{  "name": "Atelier Cave Light",
			"css": ".lc .comment,.lc .quote{color:#655f6d}.lc .attribute,.lc .link,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#be4678}.lc .built_in,.lc .builtin-name,.lc .literal,.lc .meta,.lc .number,.lc .params,.lc .type{color:#aa573c}.lc .bullet,.lc .string,.lc .symbol{color:#2a9292}.lc .section,.lc .title{color:#576ddb}.lc .keyword,.lc .selector-tag{color:#955ae7}.lc .addition,.lc .deletion{color:#19171c;display:inline-block;width:100%}.lc .deletion{background-color:#be4678}.lc .addition{background-color:#2a9292}.code.lc{background:#efecf4}.lc code{color:#585260}"
		},
		{  "name": "Atelier Dune Light",
			"css": ".lc .comment,.lc .quote{color:#7d7a68}.lc .attribute,.lc .link,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#d73737}.lc .built_in,.lc .builtin-name,.lc .literal,.lc .meta,.lc .number,.lc .params,.lc .type{color:#b65611}.lc .bullet,.lc .string,.lc .symbol{color:#60ac39}.lc .section,.lc .title{color:#6684e1}.lc .keyword,.lc .selector-tag{color:#b854d4}.code.lc{background:#fefbec}.lc code{color:#6e6b5e}"
		},
		{  "name": "Atelier Sulphurpool Dark",
			"css": ".lc .comment,.lc .quote{color:#898ea4}.lc .attribute,.lc .link,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#c94922}.lc .built_in,.lc .builtin-name,.lc .literal,.lc .meta,.lc .number,.lc .params,.lc .type{color:#c76b29}.lc .bullet,.lc .string,.lc .symbol{color:#ac9739}.lc .section,.lc .title{color:#3d8fd1}.lc .keyword,.lc .selector-tag{color:#6679cc}.code.lc{background:#202746}.lc code{color:#979db4}"
		},
		{  "name": "Atelier Lakeside Dark",
			"css": ".lc .comment,.lc .quote{color:#7195a8}.lc .attribute,.lc .link,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#d22d72}.lc .built_in,.lc .builtin-name,.lc .literal,.lc .meta,.lc .number,.lc .params,.lc .type{color:#935c25}.lc .bullet,.lc .string,.lc .symbol{color:#568c3b}.lc .section,.lc .title{color:#257fad}.lc .keyword,.lc .selector-tag{color:#6b6bb8}.code.lc{background:#161b1d}.lc code{color:#7ea2b4}"
		},
		{  "name": "Atelier Seaside Dark",
			"css": ".lc .comment,.lc .quote{color:#809980}.lc .attribute,.lc .link,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#e6193c}.lc .built_in,.lc .builtin-name,.lc .literal,.lc .meta,.lc .number,.lc .params,.lc .type{color:#87711d}.lc .bullet,.lc .string,.lc .symbol{color:#29a329}.lc .section,.lc .title{color:#3d62f5}.lc .keyword,.lc .selector-tag{color:#ad2bee}.code.lc{background:#131513}.lc code{color:#8ca68c}"
		},
		{  "name": "Atelier Estuary Dark",
			"css": ".lc .comment,.lc .quote{color:#878573}.lc .attribute,.lc .link,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#ba6236}.lc .built_in,.lc .builtin-name,.lc .literal,.lc .meta,.lc .number,.lc .params,.lc .type{color:#ae7313}.lc .bullet,.lc .string,.lc .symbol{color:#7d9726}.lc .section,.lc .title{color:#36a166}.lc .keyword,.lc .selector-tag{color:#5f9182}.lc .addition,.lc .deletion{color:#22221b;display:inline-block;width:100%}.lc .deletion{background-color:#ba6236}.lc .addition{background-color:#7d9726}.code.lc{background:#22221b}.lc code{color:#929181}"
		},
		{  "name": "Atelier Savanna Dark",
			"css": ".lc .comment,.lc .quote{color:#78877d}.lc .attribute,.lc .link,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#b16139}.lc .built_in,.lc .builtin-name,.lc .literal,.lc .meta,.lc .number,.lc .params,.lc .type{color:#9f713c}.lc .bullet,.lc .string,.lc .symbol{color:#489963}.lc .section,.lc .title{color:#478c90}.lc .keyword,.lc .selector-tag{color:#55859b}.lc .addition,.lc .deletion{color:#171c19;display:inline-block;width:100%}.lc .deletion{background-color:#b16139}.lc .addition{background-color:#489963}.code.lc{background:#171c19}.lc code{color:#87928a}"
		},
		{  "name": "Atelier Plateau Dark",
			"css": ".lc .comment,.lc .quote{color:#7e7777}.lc .attribute,.lc .link,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#ca4949}.lc .built_in,.lc .builtin-name,.lc .literal,.lc .meta,.lc .number,.lc .params,.lc .type{color:#b45a3c}.lc .bullet,.lc .string,.lc .symbol{color:#4b8b8b}.lc .section,.lc .title{color:#7272ca}.lc .keyword,.lc .selector-tag{color:#8464c4}.lc .addition,.lc .deletion{color:#1b1818;display:inline-block;width:100%}.lc .deletion{background-color:#ca4949}.lc .addition{background-color:#4b8b8b}.code.lc{background:#1b1818}.lc code{color:#8a8585}"
		},
		{  "name": "Atelier Forest Dark",
			"css": ".lc .comment,.lc .quote{color:#9c9491}.lc .attribute,.lc .link,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#f22c40}.lc .built_in,.lc .builtin-name,.lc .literal,.lc .meta,.lc .number,.lc .params,.lc .type{color:#df5320}.lc .bullet,.lc .string,.lc .symbol{color:#7b9726}.lc .section,.lc .title{color:#407ee7}.lc .keyword,.lc .selector-tag{color:#6666ea}.code.lc{background:#1b1918}.lc code{color:#a8a19f}"
		},
		{  "name": "Atelier Heath Dark",
			"css": ".lc .comment,.lc .quote{color:#9e8f9e}.lc .attribute,.lc .link,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#ca402b}.lc .built_in,.lc .builtin-name,.lc .literal,.lc .meta,.lc .number,.lc .params,.lc .type{color:#a65926}.lc .bullet,.lc .string,.lc .symbol{color:#918b3b}.lc .section,.lc .title{color:#516aec}.lc .keyword,.lc .selector-tag{color:#7b59c0}.code.lc{background:#1b181b}.lc code{color:#ab9bab}"
		},
		{  "name": "Atelier Cave Dark",
			"css": ".lc .comment,.lc .quote{color:#7e7887}.lc .attribute,.lc .link,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#be4678}.lc .built_in,.lc .builtin-name,.lc .literal,.lc .meta,.lc .number,.lc .params,.lc .type{color:#aa573c}.lc .bullet,.lc .string,.lc .symbol{color:#2a9292}.lc .section,.lc .title{color:#576ddb}.lc .keyword,.lc .selector-tag{color:#955ae7}.lc .addition,.lc .deletion{color:#19171c;display:inline-block;width:100%}.lc .deletion{background-color:#be4678}.lc .addition{background-color:#2a9292}.code.lc{background:#19171c}.lc code{color:#8b8792}"
		},
		{  "name": "Atelier Dune Dark",
			"css": ".lc .comment,.lc .quote{color:#999580}.lc .attribute,.lc .link,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#d73737}.lc .built_in,.lc .builtin-name,.lc .literal,.lc .meta,.lc .number,.lc .params,.lc .type{color:#b65611}.lc .bullet,.lc .string,.lc .symbol{color:#60ac39}.lc .section,.lc .title{color:#6684e1}.lc .keyword,.lc .selector-tag{color:#b854d4}.code.lc{background:#20201d}.lc code{color:#a6a28c}"
		},
		{  "name": "HLJS Default",
			"css": ".code.lc{background:#f0f0f0}.lc code,.lc .subst{color:#444}.lc .comment{color:#888}.lc .attribute,.lc .doctag,.lc .keyword,.lc .meta-keyword,.lc .name,.lc .selector-tag{font-weight:700}.lc .deletion,.lc .number,.lc .quote,.lc .selector-class,.lc .selector-id,.lc .string,.lc .template-tag,.lc .type{color:#800}.lc .section,.lc .title{color:#800;font-weight:700}.lc .link,.lc .regexp,.lc .selector-attr,.lc .selector-pseudo,.lc .symbol,.lc .template-variable,.lc .variable{color:#bc6060}.lc .literal{color:#78a960}.lc .addition,.lc .built_in,.lc .bullet,.lc .code{color:#397300}.lc .meta{color:#1f7199}.lc .meta-string{color:#4d99bf}"
		},
		{  "name": "HLJS Dark",
			"css": ".code.lc{background:#444}.lc .keyword,.lc .link,.lc .literal,.lc .section,.lc .selector-tag{color:#fff}.lc code,.lc .subst{color:#ddd}.lc .addition,.lc .attribute,.lc .built_in,.lc .bullet,.lc .name,.lc .string,.lc .symbol,.lc .template-tag,.lc .template-variable,.lc .title,.lc .type,.lc .variable{color:#d88}.lc .comment,.lc .deletion,.lc .meta,.lc .quote{color:#777}.lc .doctag,.lc .keyword,.lc .literal,.lc .name,.lc .section,.lc .selector-tag,.lc .title,.lc .type{font-weight:700}"
		},
		{  "name": "Foundation",
			"css": ".code.lc{background:#eee}.lc code{color:#000}.lc .addition,.lc .attribute,.lc .emphasis,.lc .link{color:#070}.lc .deletion,.lc .string,.lc .strong{color:#d14}.lc .comment,.lc .quote{color:#998;font-style:italic}.lc .section,.lc .title{color:#900}.lc .class .lc .title,.lc .type{color:#458}.lc .template-variable,.lc .variable{color:#369}.lc .bullet{color:#970}.lc .meta{color:#34b}.lc .code,.lc .keyword,.lc .literal,.lc .number,.lc .selector-tag{color:#099}.lc .regexp{background-color:#fff0ff;color:#808}.lc .symbol{color:#990073}.lc .name,.lc .selector-class,.lc .selector-id,.lc .tag{color:#070}"
		},
		{  "name": "Sunburst",
			"css": ".code.lc{background:#000}.lc code{color:#f8f8f8}.lc .comment,.lc .quote{color:#aeaeae;font-style:italic}.lc .keyword,.lc .selector-tag,.lc .type{color:#e28964}.lc .string{color:#65b042}.lc .subst{color:#daefa3}.lc .link,.lc .regexp{color:#e9c062}.lc .name,.lc .section,.lc .tag,.lc .title{color:#89bdff}.lc .class .lc .title,.lc .doctag{text-decoration:underline}.lc .bullet,.lc .number,.lc .symbol{color:#3387cc}.lc .params,.lc .template-variable,.lc .variable{color:#3e87e3}.lc .attribute{color:#cda869}.lc .meta{color:#8996a8}.lc .formula{background-color:#0e2231;color:#f8f8f8;font-style:italic}.lc .addition{background-color:#253b22;color:#f8f8f8}.lc .deletion{background-color:#420e09;color:#f8f8f8}.lc .selector-class{color:#9b703f}.lc .selector-id{color:#8b98ab}"
		},
		{  "name": "Nord",
			"css": ".code.lc{background:#2e3440}.lc code,.lc .subst{color:#d8dee9}.lc .selector-tag{color:#81a1c1}.lc .selector-id{color:#8fbcbb;font-weight:700}.lc .selector-class{color:#8fbcbb}.lc .selector-attr{color:#8fbcbb}.lc .selector-pseudo{color:#88c0d0}.lc .addition{background-color:rgba(163,190,140,.5)}.lc .deletion{background-color:rgba(191,97,106,.5)}.lc .built_in,.lc .type{color:#8fbcbb}.lc .class{color:#8fbcbb}.lc .function{color:#88c0d0}.lc .function>.lc .title{color:#88c0d0}.lc .keyword,.lc .literal,.lc .symbol{color:#81a1c1}.lc .number{color:#b48ead}.lc .regexp{color:#ebcb8b}.lc .string{color:#a3be8c}.lc .title{color:#8fbcbb}.lc .params{color:#d8dee9}.lc .bullet{color:#81a1c1}.lc .code{color:#8fbcbb}.lc .formula{color:#8fbcbb}.lc .quote{color:#4c566a}.lc .comment{color:#4c566a}.lc .doctag{color:#8fbcbb}.lc .meta,.lc .meta-keyword{color:#5e81ac}.lc .meta-string{color:#a3be8c}.lc .attr{color:#8fbcbb}.lc .attribute{color:#d8dee9}.lc .builtin-name{color:#81a1c1}.lc .name{color:#81a1c1}.lc .section{color:#88c0d0}.lc .tag{color:#81a1c1}.lc .variable{color:#d8dee9}.lc .template-variable{color:#d8dee9}.lc .template-tag{color:#5e81ac}.abnf .lc .attribute{color:#88c0d0}.abnf .lc .symbol{color:#ebcb8b}.apache .lc .attribute{color:#88c0d0}.apache .lc .section{color:#81a1c1}.arduino .lc .built_in{color:#88c0d0}.aspectj .lc .meta{color:#d08770}.aspectj>.lc .title{color:#88c0d0}.bnf .lc .attribute{color:#8fbcbb}.clojure .lc .name{color:#88c0d0}.clojure .lc .symbol{color:#ebcb8b}.coq .lc .built_in{color:#88c0d0}.cpp .lc .meta-string{color:#8fbcbb}.css .lc .built_in{color:#88c0d0}.css .lc .keyword{color:#d08770}.diff .lc .meta{color:#8fbcbb}.ebnf .lc .attribute{color:#8fbcbb}.glsl .lc .built_in{color:#88c0d0}.groovy .lc .meta:not(:first-child){color:#d08770}.haxe .lc .meta{color:#d08770}.java .lc .meta{color:#d08770}.ldif .lc .attribute{color:#8fbcbb}.lisp .lc .name{color:#88c0d0}.lua .lc .built_in{color:#88c0d0}.moonscript .lc .built_in{color:#88c0d0}.nginx .lc .attribute{color:#88c0d0}.nginx .lc .section{color:#5e81ac}.pf .lc .built_in{color:#88c0d0}.processing .lc .built_in{color:#88c0d0}.scss .lc .keyword{color:#81a1c1}.stylus .lc .keyword{color:#81a1c1}.swift .lc .meta{color:#d08770}.vim .lc .built_in{color:#88c0d0;font-style:italic}.yaml .lc .meta{color:#d08770}"
		},
		{  "name": "Ascetic",
			"css": ".code.lc{background:#fff}.lc code{color:#000}.lc .addition,.lc .attribute,.lc .bullet,.lc .link,.lc .section,.lc .string,.lc .symbol,.lc .template-variable,.lc .variable{color:#888}.lc .comment,.lc .deletion,.lc .meta,.lc .quote{color:#ccc}.lc .keyword,.lc .name,.lc .section,.lc .selector-tag,.lc .type{font-weight:700}"
		},
		{  "name": "IR-Black",
			"css": ".code.lc{background:#000}.lc code{color:#f8f8f8}.lc .comment,.lc .meta,.lc .quote{color:#7c7c7c}.lc .keyword,.lc .name,.lc .selector-tag,.lc .tag{color:#96cbfe}.lc .attribute,.lc .selector-id{color:#ffffb6}.lc .addition,.lc .selector-attr,.lc .selector-pseudo,.lc .string{color:#a8ff60}.lc .subst{color:#daefa3}.lc .link,.lc .regexp{color:#e9c062}.lc .doctag,.lc .section,.lc .title,.lc .type{color:#ffffb6}.lc .bullet,.lc .literal,.lc .symbol,.lc .template-variable,.lc .variable{color:#c6c5fe}.lc .deletion,.lc .number{color:#ff73fd}"
		},
		{  "name": "Hybrid",
			"css": ".code.lc{background:#1d1f21}.lc span::selection,.lc::selection{background:#373b41}.lc span::-moz-selection,.lc::-moz-selection{background:#373b41}.lc code{color:#c5c8c6}.lc .name,.lc .title{color:#f0c674}.lc .comment,.lc .meta,.lc .meta .lc .keyword{color:#707880}.lc .deletion,.lc .link,.lc .literal,.lc .number,.lc .symbol{color:#c66}.lc .addition,.lc .doctag,.lc .regexp,.lc .selector-attr,.lc .selector-pseudo,.lc .string{color:#b5bd68}.lc .attribute,.lc .code,.lc .selector-id{color:#b294bb}.lc .bullet,.lc .keyword,.lc .selector-tag,.lc .tag{color:#81a2be}.lc .subst,.lc .template-tag,.lc .template-variable,.lc .variable{color:#8abeb7}.lc .built_in,.lc .builtin-name,.lc .quote,.lc .section,.lc .selector-class,.lc .type{color:#de935f}"
		},
		{  "name": "Srcery",
			"css": ".code.lc{background:#1c1b19}.lc code{color:#fce8c3}.lc .emphasis,.lc .strong{color:#918175}.lc .bullet,.lc .link,.lc .literal,.lc .number,.lc .quote,.lc .regexp{color:#ff5c8f}.lc .code,.lc .selector-class{color:#68a8e4}.lc .attribute,.lc .keyword,.lc .section,.lc .selector-tag,.lc .variable{color:#ef2f27}.lc .name,.lc .title{color:#fbb829}.lc .params,.lc .type{color:#0aaeb3}.lc .string{color:#98bc37}.lc .addition,.lc .built_in,.lc .builtin-name,.lc .selector-attr,.lc .selector-id,.lc .selector-pseudo,.lc .subst,.lc .symbol,.lc .template-tag,.lc .template-variable{color:#c07abe}.lc .comment,.lc .deletion,.lc .meta{color:#918175}"
		},
		{  "name": "Mono Blue",
			"css": ".code.lc{background:#eaeef3}.lc code{color:#00193a}.lc .doctag,.lc .keyword,.lc .name,.lc .section,.lc .selector-tag,.lc .title{font-weight:700}.lc .comment{color:#738191}.lc .addition,.lc .built_in,.lc .literal,.lc .name,.lc .quote,.lc .section,.lc .selector-class,.lc .selector-id,.lc .string,.lc .tag,.lc .title,.lc .type{color:#0048ab}.lc .attribute,.lc .bullet,.lc .deletion,.lc .link,.lc .meta,.lc .regexp,.lc .subst,.lc .symbol,.lc .template-variable,.lc .variable{color:#4c81c9}"
		},
		{  "name": "Android Studio",
			"css": ".code.lc{background:#282b2e}.lc code{color:#a9b7c6}.lc .bullet,.lc .literal,.lc .number,.lc .symbol{color:#6897bb}.lc .deletion,.lc .keyword,.lc .selector-tag{color:#cc7832}.lc .link,.lc .template-variable,.lc .variable{color:#629755}.lc .comment,.lc .quote{color:grey}.lc .meta{color:#bbb529}.lc .addition,.lc .attribute,.lc .string{color:#6a8759}.lc .section,.lc .title,.lc .type{color:#ffc66d}.lc .name,.lc .selector-class,.lc .selector-id{color:#e8bf6a}"
		},
		{  "name": "Visual Studio",
			"css": ".code.lc{background:#fff}.lc code{color:#000}.lc .comment,.lc .quote,.lc .variable{color:green}.lc .built_in,.lc .keyword,.lc .name,.lc .selector-tag,.lc .tag{color:#00f}.lc .addition,.lc .attribute,.lc .literal,.lc .section,.lc .string,.lc .template-tag,.lc .template-variable,.lc .title,.lc .type{color:#a31515}.lc .deletion,.lc .meta,.lc .selector-attr,.lc .selector-pseudo{color:#2b91af}.lc .doctag{color:grey}.lc .attr{color:red}.lc .bullet,.lc .link,.lc .symbol{color:#00b0e8}"
		},
		{  "name": "Visual Studio 2015",
			"css": ".code.lc{background:#1e1e1e}.lc code{color:#dcdcdc}.lc .keyword,.lc .literal,.lc .name,.lc .symbol{color:#569cd6}.lc .link{color:#569cd6}.lc .built_in,.lc .type{color:#4ec9b0}.lc .class,.lc .number{color:#b8d7a3}.lc .meta-string,.lc .string{color:#d69d85}.lc .regexp,.lc .template-tag{color:#9a5334}.lc .formula,.lc .function,.lc .params,.lc .subst,.lc .title{color:#dcdcdc}.lc .comment,.lc .quote{color:#57a64a;font-style:italic}.lc .doctag{color:#608b4e}.lc .meta,.lc .meta-keyword,.lc .tag{color:#9b9b9b}.lc .template-variable,.lc .variable{color:#bd63c5}.lc .attr,.lc .attribute,.lc .builtin-name{color:#9cdcfe}.lc .section{color:gold}.lc .bullet,.lc .selector-attr,.lc .selector-class,.lc .selector-id,.lc .selector-pseudo,.lc .selector-tag{color:#d7ba7d}.lc .addition{background-color:#144212;display:inline-block;width:100%}.lc .deletion{background-color:#600;display:inline-block;width:100%}"
		},
		{  "name": "Far",
			"css": ".code.lc{background:navy}.lc code,.lc .subst{color:#0ff}.lc .addition,.lc .attribute,.lc .built_in,.lc .builtin-name,.lc .bullet,.lc .string,.lc .symbol,.lc .template-tag,.lc .template-variable{color:#ff0}.lc .keyword,.lc .name,.lc .section,.lc .selector-class,.lc .selector-id,.lc .selector-tag,.lc .type,.lc .variable{color:#fff}.lc .comment,.lc .deletion,.lc .doctag,.lc .quote{color:#888}.lc .link,.lc .literal,.lc .number,.lc .regexp{color:#0f0}.lc .meta{color:teal}.lc .keyword,.lc .name,.lc .section,.lc .selector-tag,.lc .title{font-weight:700}"
		},
		{  "name": "Pojoaque",
			"css": ".lc code{color:#dccf8f}.code.lc{background:url(pojoaque.jpg) repeat scroll left top #181914}.lc .comment,.lc .quote{color:#586e75;font-style:italic}.lc .addition,.lc .keyword,.lc .literal,.lc .selector-tag{color:#b64926}.lc .doctag,.lc .number,.lc .regexp,.lc .string{color:#468966}.lc .built_in,.lc .name,.lc .section,.lc .title{color:#ffb03b}.lc .class .lc .title,.lc .tag,.lc .template-variable,.lc .type,.lc .variable{color:#b58900}.lc .attribute{color:#b89859}.lc .bullet,.lc .link,.lc .meta,.lc .subst,.lc .symbol{color:#cb4b16}.lc .deletion{color:#dc322f}.lc .selector-class,.lc .selector-id{color:#d3a60c}.lc .formula{background:#073642}"
		},
		{  "name": "Purebasic",
			"css": ".code.lc{background:#ffffdf}.lc code,.lc .attr,.lc .function,.lc .name,.lc .number,.lc .params,.lc .subst,.lc .type{color:#000}.lc .addition,.lc .comment,.lc .regexp,.lc .section,.lc .selector-pseudo{color:#0aa}.lc .code,.lc .tag,.lc .title,.lc .variable{color:#066}.lc .built_in,.lc .builtin-name,.lc .class,.lc .keyword,.lc .meta-keyword,.lc .selector-class{color:#066;font-weight:700}.lc .selector-attr,.lc .string{color:#0080ff}.lc .attribute,.lc .deletion,.lc .link,.lc .symbol{color:#924b72}.lc .literal,.lc .meta,.lc .selector-id{color:#924b72;font-weight:700}.lc .name{font-weight:700}"
		},
		{  "name": "isbl Editor Light",
			"css": ".code.lc{background:#fff}.lc code{color:#000}.lc .subst{color:#000}.lc .comment{color:#555;font-style:italic}.lc .attribute,.lc .doctag,.lc .keyword,.lc .meta-keyword,.lc .name,.lc .selector-tag{color:#000;font-weight:700}.lc .string{color:navy}.lc .deletion,.lc .number,.lc .quote,.lc .selector-class,.lc .selector-id,.lc .template-tag,.lc .type{color:#000}.lc .section,.lc .title{color:#fb2c00}.lc .title>.lc .built_in{color:teal;font-weight:400}.lc .link,.lc .regexp,.lc .selector-attr,.lc .selector-pseudo,.lc .symbol,.lc .template-variable,.lc .variable{color:#5e1700}.lc .built_in,.lc .literal{color:navy;font-weight:700}.lc .addition,.lc .bullet,.lc .code{color:#397300}.lc .class{color:#6f1c00;font-weight:700}.lc .meta{color:#1f7199}.lc .meta-string{color:#4d99bf}"
		},
		{  "name": "isbl Editor Dark",
			"css": ".code.lc{background:#404040}.lc code,.lc .subst{color:#f0f0f0}.lc .comment{color:#b5b5b5;font-style:italic}.lc .attribute,.lc .doctag,.lc .keyword,.lc .meta-keyword,.lc .name,.lc .selector-tag{color:#f0f0f0;font-weight:700}.lc .string{color:#97bf0d}.lc .deletion,.lc .number,.lc .quote,.lc .selector-class,.lc .selector-id,.lc .template-tag,.lc .type{color:#f0f0f0}.lc .section,.lc .title{color:#df471e}.lc .title>.lc .built_in{color:#81bce9;font-weight:400}.lc .link,.lc .regexp,.lc .selector-attr,.lc .selector-pseudo,.lc .symbol,.lc .template-variable,.lc .variable{color:#e2c696}.lc .built_in,.lc .literal{color:#97bf0d;font-weight:700}.lc .addition,.lc .bullet,.lc .code{color:#397300}.lc .class{color:#ce9d4d;font-weight:700}.lc .meta{color:#1f7199}.lc .meta-string{color:#4d99bf}"
		},
		{  "name": "nnfx Light",
			"css": ".code.lc{background:#fff}.lc code{color:#000}.xml .lc .meta{font-style:italic;color:#48b}.lc .comment,.lc .quote{font-style:italic;color:#070}.lc .keyword,.lc .name{color:#808}.lc .attr,.lc .name,.lc .doctag,.xml .lc .meta{font-weight:700}.lc .string{font-weight:400}.lc .template-variable,.lc .variable{color:#477}.lc .code,.lc .link,.lc .meta-string,.lc .number,.lc .regexp,.lc .string{color:#00f}.lc .built_in,.lc .builtin-name,.lc .bullet,.lc .symbol,.lc .title{color:#f40}.lc .meta,.lc .section{color:#642}.lc .class .lc .title,.lc .type{color:#639}.lc .attr,.lc .function .lc .title,.lc .subst{color:#000}.lc .formula{background-color:#eee;font-style:italic}.lc .addition{background-color:#beb}.lc .deletion{background-color:#fbb}.lc .selector-class,.lc .selector-id{color:#964}"
		},
		{  "name": "nnfx Dark",
			"css": ".code.lc{background:#333}.lc code{color:#fff}.xml .lc .meta{font-weight:700;font-style:italic;color:#69f}.lc .comment,.lc .quote{font-style:italic;color:#9c6}.lc .keyword,.lc .name{color:#a7a}.lc .attr,.lc .name{font-weight:700}.lc .string{font-weight:400}.lc .template-variable,.lc .variable{color:#588}.lc .code,.lc .link,.lc .meta-string,.lc .number,.lc .regexp,.lc .string{color:#bce}.lc .built_in,.lc .builtin-name,.lc .bullet,.lc .symbol,.lc .title{color:#d40}.lc .meta,.lc .section{color:#a85}.lc .class .lc .title,.lc .type{color:#96c}.lc .attr,.lc .function .lc .title,.lc .subst{color:#fff}.lc .formula{background-color:#eee;font-style:italic}.lc .addition{background-color:#797}.lc .deletion{background-color:#c99}.lc .selector-class,.lc .selector-id{color:#964}.lc .doctag{font-weight:700}"
		},
		{  "name": "Gruvbox Light",
			"css": ".code.lc{background:#fbf1c7}.lc code,.lc .subst{color:#3c3836}.lc .deletion,.lc .formula,.lc .keyword,.lc .link,.lc .selector-tag{color:#9d0006}.lc .built_in,.lc .emphasis,.lc .name,.lc .quote,.lc .strong,.lc .title,.lc .variable{color:#076678}.lc .attr,.lc .params,.lc .template-tag,.lc .type{color:#b57614}.lc .builtin-name,.lc .doctag,.lc .literal,.lc .number{color:#8f3f71}.lc .code,.lc .meta,.lc .regexp,.lc .selector-id,.lc .template-variable{color:#af3a03}.lc .addition,.lc .meta-string,.lc .section,.lc .selector-attr,.lc .selector-class,.lc .string,.lc .symbol{color:#79740e}.lc .attribute,.lc .bullet,.lc .class,.lc .function,.lc .function .lc .keyword,.lc .meta-keyword,.lc .selector-pseudo,.lc .tag{color:#427b58}.lc .comment{color:#928374}.lc .link_label,.lc .literal,.lc .number{color:#8f3f71}.lc .comment{font-style:italic}.lc .section,.lc .tag{font-weight:700}"
		},
		{  "name": "Gruvbox Dark",
			"css": ".code.lc{background:#282828}.lc code,.lc .subst{color:#ebdbb2}.lc .deletion,.lc .formula,.lc .keyword,.lc .link,.lc .selector-tag{color:#fb4934}.lc .built_in,.lc .emphasis,.lc .name,.lc .quote,.lc .strong,.lc .title,.lc .variable{color:#83a598}.lc .attr,.lc .params,.lc .template-tag,.lc .type{color:#fabd2f}.lc .builtin-name,.lc .doctag,.lc .literal,.lc .number{color:#8f3f71}.lc .code,.lc .meta,.lc .regexp,.lc .selector-id,.lc .template-variable{color:#fe8019}.lc .addition,.lc .meta-string,.lc .section,.lc .selector-attr,.lc .selector-class,.lc .string,.lc .symbol{color:#b8bb26}.lc .attribute,.lc .bullet,.lc .class,.lc .function,.lc .function .lc .keyword,.lc .meta-keyword,.lc .selector-pseudo,.lc .tag{color:#8ec07c}.lc .comment{color:#928374}.lc .link_label,.lc .literal,.lc .number{color:#d3869b}.lc .comment{font-style:italic}.lc .section,.lc .tag{font-weight:700}"
		},
		{  "name": "Lightfair",
			"css": ".lc .name{color:#01a3a3}.lc .meta,.lc .tag{color:#789}.lc code,.lc .subst{color:#444}.lc .comment{color:#888}.lc .attribute,.lc .doctag,.lc .keyword,.lc .meta-keyword,.lc .name,.lc .selector-tag{font-weight:700}.lc .deletion,.lc .number,.lc .quote,.lc .selector-class,.lc .selector-id,.lc .string,.lc .template-tag,.lc .type{color:#4286f4}.lc .section,.lc .title{color:#4286f4;font-weight:700}.lc .link,.lc .regexp,.lc .selector-attr,.lc .selector-pseudo,.lc .symbol,.lc .template-variable,.lc .variable{color:#bc6060}.lc .literal{color:#62bcbc}.lc .addition,.lc .built_in,.lc .bullet,.lc .code{color:#25c6c6}.lc .meta-string{color:#4d99bf}"
		},
		{  "name": "Shades of Purple",
			"css": ".code.lc{background:#2d2b57;font-weight:400}.lc .title{color:#fad000;font-weight:400}.lc .name{color:#a1feff}.lc .tag{color:#fff}.lc .attr{color:#f8d000;font-style:italic}.lc .built_in,.lc .section,.lc .selector-tag{color:#fb9e00}.lc .keyword{color:#fb9e00}.lc code,.lc .subst{color:#e3dfff}.lc .addition,.lc .attribute,.lc .bullet,.lc .code,.lc .deletion,.lc .quote,.lc .regexp,.lc .selector-attr,.lc .selector-class,.lc .selector-pseudo,.lc .string,.lc .symbol,.lc .template-tag{color:#4cd213}.lc .meta,.lc .meta-string{color:#fb9e00}.lc .comment{color:#ac65ff}.lc .keyword,.lc .literal,.lc .name,.lc .selector-tag,.lc .strong{font-weight:400}.lc .literal,.lc .number{color:#fa658d}"
		},
		{  "name": "Lioshi",
			"css": ".lc .comment{color:#8d8d8d}.lc .quote{color:#b3c7d8}.lc .deletion,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#c66}.lc .built_in,.lc .builtin-name,.lc .literal,.lc .number,.lc .subst .lc .link,.lc .type{color:#de935f}.lc .attribute{color:#f0c674}.lc .addition,.lc .bullet,.lc .params,.lc .string{color:#b5bd68}.lc .meta,.lc .section,.lc .title{color:#81a2be}.lc .class,.lc .function,.lc .keyword,.lc .selector-tag{color:#be94bb}.lc .symbol{color:#dbc4d9}.code.lc{background:#303030}.lc code{color:#c5c8c6}"
		},
		{  "name": "Magula",
			"css": ".code.lc{background-color:#f4f4f4}.lc code{color:#000}.lc .subst{color:#000}.lc .addition,.lc .attribute,.lc .bullet,.lc .string,.lc .symbol,.lc .template-tag,.lc .template-variable,.lc .title,.lc .variable{color:#050}.lc .comment,.lc .quote{color:#777}.lc .link,.lc .literal,.lc .number,.lc .regexp,.lc .type{color:#800}.lc .deletion,.lc .meta{color:#00e}.lc .built_in,.lc .doctag,.lc .keyword,.lc .name,.lc .section,.lc .selector-tag,.lc .tag,.lc .title{font-weight:700;color:navy}"
		},
		{  "name": "Grayscale",
			"css": ".code.lc{background:#fff}.lc code{color:#333}.lc .comment,.lc .quote{color:#777;font-style:italic}.lc .keyword,.lc .selector-tag,.lc .subst{color:#333;font-weight:700}.lc .literal,.lc .number{color:#777}.lc .doctag,.lc .formula,.lc .string{color:#333;background:url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAJ0lEQVQIW2O8e/fufwYGBgZBQUEQxcCIIfDu3Tuwivfv30NUoAsAALHpFMMLqZlPAAAAAElFTkSuQmCC) repeat}.lc .section,.lc .selector-id,.lc .title{color:#000;font-weight:700}.lc .subst{font-weight:400}.lc .class .lc .title,.lc .name,.lc .type{color:#333;font-weight:700}.lc .tag{color:#333}.lc .regexp{color:#333;background:url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAICAYAAADA+m62AAAAPUlEQVQYV2NkQAN37979r6yszIgujiIAU4RNMVwhuiQ6H6wQl3XI4oy4FMHcCJPHcDS6J2A2EqUQpJhohQDexSef15DBCwAAAABJRU5ErkJggg==) repeat}.lc .bullet,.lc .link,.lc .symbol{color:#000;background:url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAKElEQVQIW2NkQAO7d+/+z4gsBhJwdXVlhAvCBECKwIIwAbhKZBUwBQA6hBpm5efZsgAAAABJRU5ErkJggg==) repeat}.lc .built_in,.lc .builtin-name{color:#000;text-decoration:underline}.lc .meta{color:#999;font-weight:700}.lc .deletion{color:#fff;background:url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAADCAYAAABS3WWCAAAAE0lEQVQIW2MMDQ39zzhz5kwIAQAyxweWgUHd1AAAAABJRU5ErkJggg==) repeat}.lc .addition{color:#000;background:url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAkAAAAJCAYAAADgkQYQAAAALUlEQVQYV2N89+7dfwYk8P79ewZBQUFkIQZGOiu6e/cuiptQHAPl0NtNxAQBAM97Oejj3Dg7AAAAAElFTkSuQmCC) repeat}"
		},
		{  "name": "Dracula",
			"css": ".code.lc{background:#282a36}.lc .keyword,.lc .link,.lc .literal,.lc .section,.lc .selector-tag{color:#8be9fd}.lc .function .lc .keyword{color:#ff79c6}.lc code,.lc .subst{color:#f8f8f2}.lc .addition,.lc .attribute,.lc .bullet,.lc .name,.lc .string,.lc .symbol,.lc .template-tag,.lc .template-variable,.lc .title,.lc .type,.lc .variable{color:#f1fa8c}.lc .comment,.lc .deletion,.lc .meta,.lc .quote{color:#6272a4}.lc .doctag,.lc .keyword,.lc .literal,.lc .name,.lc .section,.lc .selector-tag,.lc .title,.lc .type{font-weight:700}"
		},
		{  "name": "Paraiso Light",
			"css": ".lc .comment,.lc .quote{color:#776e71}.lc .link,.lc .meta,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#ef6155}.lc .built_in,.lc .builtin-name,.lc .deletion,.lc .literal,.lc .number,.lc .params,.lc .type{color:#f99b15}.lc .attribute,.lc .section,.lc .title{color:#fec418}.lc .addition,.lc .bullet,.lc .string,.lc .symbol{color:#48b685}.lc .keyword,.lc .selector-tag{color:#815ba4}.code.lc{background:#e7e9db}.lc code{color:#4f424c}"
		},
		{  "name": "Paraiso Dark",
			"css": ".lc .comment,.lc .quote{color:#8d8687}.lc .link,.lc .meta,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#ef6155}.lc .built_in,.lc .builtin-name,.lc .deletion,.lc .literal,.lc .number,.lc .params,.lc .type{color:#f99b15}.lc .attribute,.lc .section,.lc .title{color:#fec418}.lc .addition,.lc .bullet,.lc .string,.lc .symbol{color:#48b685}.lc .keyword,.lc .selector-tag{color:#815ba4}.code.lc{background:#2f1e2e}.lc code{color:#a39e9b}"
		},
		{  "name": "Arta",
			"css": ".code.lc{background:#222}.lc code,.lc .subst{color:#aaa}.lc .section{color:#fff}.lc .comment,.lc .meta,.lc .quote{color:#444}.lc .bullet,.lc .regexp,.lc .string,.lc .symbol{color:#fc3}.lc .addition,.lc .number{color:#0c6}.lc .attribute,.lc .built_in,.lc .builtin-name,.lc .link,.lc .literal,.lc .template-variable,.lc .type{color:#32aaee}.lc .keyword,.lc .name,.lc .selector-class,.lc .selector-id,.lc .selector-tag{color:#64a}.lc .deletion,.lc .template-tag,.lc .title,.lc .variable{color:#b16}.lc .doctag,.lc .section{font-weight:700}"
		},
		{  "name": "Obsidian",
			"css": ".code.lc{background:#282b2e}.lc .keyword,.lc .literal,.lc .selector-id,.lc .selector-tag{color:#93c763}.lc .number{color:#ffcd22}.lc code{color:#e0e2e4}.lc .attribute{color:#668bb0}.lc .class .lc .title,.lc .code,.lc .section{color:#fff}.lc .link,.lc .regexp{color:#d39745}.lc .meta{color:#557182}.lc .addition,.lc .built_in,.lc .bullet,.lc .emphasis,.lc .name,.lc .selector-attr,.lc .selector-pseudo,.lc .subst,.lc .tag,.lc .template-tag,.lc .template-variable,.lc .type,.lc .variable{color:#8cbbad}.lc .string,.lc .symbol{color:#ec7600}.lc .comment,.lc .deletion,.lc .quote{color:#818e96}.lc .selector-class{color:#a082bd}.lc .doctag,.lc .keyword,.lc .literal,.lc .name,.lc .section,.lc .selector-tag,.lc .title,.lc .type{font-weight:700}"
		},
		{  "name": "QtCreator Light",
			"css": ".code.lc{background:#fff}.lc code,.lc .subst,.lc .tag,.lc .title{color:#000}.lc .emphasis,.lc .strong{color:#000}.lc .bullet,.lc .literal,.lc .number,.lc .quote,.lc .regexp{color:navy}.lc .code .lc .selector-class{color:purple}.lc .type{font-style:italic}.lc .function,.lc .keyword,.lc .name,.lc .section,.lc .selector-tag,.lc .symbol{color:olive}.lc .attribute{color:maroon}.lc .class .lc .title,.lc .params,.lc .variable{color:#0055af}.lc .addition,.lc .built_in,.lc .builtin-name,.lc .link,.lc .selector-attr,.lc .selector-id,.lc .selector-pseudo,.lc .string,.lc .template-tag,.lc .template-variable,.lc .type{color:green}.lc .comment,.lc .deletion,.lc .meta{color:green}"
		},
		{  "name": "QtCreator Dark",
			"css": ".code.lc{background:#000}.lc code,.lc .subst,.lc .tag,.lc .title{color:#aaa}.lc .emphasis,.lc .strong{color:#a8a8a2}.lc .bullet,.lc .literal,.lc .number,.lc .quote,.lc .regexp{color:#f5f}.lc .code .lc .selector-class{color:#aaf}.lc .type{font-style:italic}.lc .function,.lc .keyword,.lc .name,.lc .section,.lc .selector-tag,.lc .symbol{color:#ff5}.lc .attribute{color:#f55}.lc .class .lc .title,.lc .params,.lc .variable{color:#88f}.lc .addition,.lc .built_in,.lc .builtin-name,.lc .link,.lc .selector-attr,.lc .selector-id,.lc .selector-pseudo,.lc .string,.lc .template-tag,.lc .template-variable,.lc .type{color:#f5f}.lc .comment,.lc .deletion,.lc .meta{color:#5ff}"
		},
		{  "name": "gml",
			"css": ".code.lc{background:#222}.lc code{color:silver}.lc .keyword{color:#ffb871;font-weight:700}.lc .built_in{color:#ffb871}.lc .literal{color:#ff8080}.lc .symbol{color:#58e55a}.lc .comment{color:#5b995b}.lc .string{color:#ff0}.lc .number{color:#ff8080}.lc .addition,.lc .attribute,.lc .bullet,.lc .code,.lc .deletion,.lc .doctag,.lc .function,.lc .link,.lc .meta,.lc .meta-keyword,.lc .name,.lc .quote,.lc .regexp,.lc .section,.lc .selector-attr,.lc .selector-class,.lc .selector-id,.lc .selector-pseudo,.lc .selector-tag,.lc .subst,.lc .template-tag,.lc .template-variable,.lc .title,.lc .type,.lc .variable{color:silver}"
		},
		{  "name": "Color Brewer",
			"css": ".code.lc{background:#fff}.lc code,.lc .subst{color:#000}.lc .addition,.lc .meta,.lc .string,.lc .symbol,.lc .template-tag,.lc .template-variable{color:#756bb1}.lc .comment,.lc .quote{color:#636363}.lc .bullet,.lc .link,.lc .literal,.lc .number,.lc .regexp{color:#31a354}.lc .deletion,.lc .variable{color:#88f}.lc .built_in,.lc .doctag,.lc .keyword,.lc .name,.lc .section,.lc .selector-class,.lc .selector-id,.lc .selector-tag,.lc .strong,.lc .tag,.lc .title,.lc .type{color:#3182bd}.lc .attribute{color:#e6550d}"
		},
		{  "name": "Zenburn",
			"css": ".code.lc{background:#3f3f3f}.lc code{color:#dcdcdc}.lc .keyword,.lc .selector-tag,.lc .tag{color:#e3ceab}.lc .template-tag{color:#dcdcdc}.lc .number{color:#8cd0d3}.lc .attribute,.lc .template-variable,.lc .variable{color:#efdcbc}.lc .literal{color:#efefaf}.lc .subst{color:#8f8f8f}.lc .name,.lc .section,.lc .selector-class,.lc .selector-id,.lc .title,.lc .type{color:#efef8f}.lc .bullet,.lc .link,.lc .symbol{color:#dca3a3}.lc .built_in,.lc .builtin-name,.lc .deletion,.lc .string{color:#cc9393}.lc .addition,.lc .comment,.lc .meta,.lc .quote{color:#7f9f7f}"
		},
		{  "name": "Monokai",
			"css": ".code.lc{background:#272822}.lc code{color:#ddd}.lc .keyword,.lc .literal,.lc .name,.lc .selector-tag,.lc .tag{color:#f92672}.lc .code{color:#66d9ef}.lc .class .lc .title{color:#fff}.lc .attribute,.lc .link,.lc .regexp,.lc .symbol{color:#bf79db}.lc .addition,.lc .built_in,.lc .builtin-name,.lc .bullet,.lc .emphasis,.lc .section,.lc .selector-attr,.lc .selector-pseudo,.lc .string,.lc .subst,.lc .template-tag,.lc .template-variable,.lc .title,.lc .type,.lc .variable{color:#a6e22e}.lc .comment,.lc .deletion,.lc .meta,.lc .quote{color:#75715e}.lc .doctag,.lc .keyword,.lc .literal,.lc .section,.lc .selector-id,.lc .selector-tag,.lc .title,.lc .type{font-weight:700}"
		},
		{  "name": "Monokai Sublime",
			"css": ".code.lc{background:#23241f}.lc code,.lc .subst,.lc .tag{color:#f8f8f2}.lc .emphasis,.lc .strong{color:#a8a8a2}.lc .bullet,.lc .link,.lc .literal,.lc .number,.lc .quote,.lc .regexp{color:#ae81ff}.lc .code,.lc .section,.lc .selector-class,.lc .title{color:#a6e22e}.lc .attr,.lc .keyword,.lc .name,.lc .selector-tag{color:#f92672}.lc .attribute,.lc .symbol{color:#66d9ef}.lc .class .lc .title,.lc .params{color:#f8f8f2}.lc .addition,.lc .built_in,.lc .builtin-name,.lc .selector-attr,.lc .selector-id,.lc .selector-pseudo,.lc .string,.lc .template-variable,.lc .type,.lc .variable{color:#e6db74}.lc .comment,.lc .deletion,.lc .meta{color:#75715e}"
		},
		{  "name": "Google Code",
			"css": ".code.lc{background:#fff}.lc code{color:#000}.lc .comment,.lc .quote{color:#800}.lc .keyword,.lc .name,.lc .section,.lc .selector-tag,.lc .title{color:#008}.lc .template-variable,.lc .variable{color:#660}.lc .regexp,.lc .selector-attr,.lc .selector-pseudo,.lc .string{color:#080}.lc .bullet,.lc .link,.lc .literal,.lc .meta,.lc .number,.lc .symbol{color:#066}.lc .attr,.lc .built_in,.lc .builtin-name,.lc .doctag,.lc .params,.lc .title,.lc .type{color:#606}.lc .attribute,.lc .subst{color:#000}.lc .formula{background-color:#eee;font-style:italic}.lc .selector-class,.lc .selector-id{color:#9b703f}.lc .addition{background-color:#baeeba}.lc .deletion{background-color:#ffc8bd}.lc .doctag{font-weight:700}"
		},
		{  "name": "A11y Light",
			"css": ".lc .comment,.lc .quote{color:#696969}.lc .deletion,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#d91e18}.lc .built_in,.lc .builtin-name,.lc .link,.lc .literal,.lc .meta,.lc .number,.lc .params,.lc .type{color:#aa5d00}.lc .attribute{color:#aa5d00}.lc .addition,.lc .bullet,.lc .string,.lc .symbol{color:green}.lc .section,.lc .title{color:#007faa}.lc .keyword,.lc .selector-tag{color:#7928a1}.code.lc{background:#fefefe}.lc code{color:#545454}\n"
		},
		{  "name": "A11y Dark",
			"css": ".lc .comment,.lc .quote{color:#d4d0ab}.lc .deletion,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#ffa07a}.lc .built_in,.lc .builtin-name,.lc .link,.lc .literal,.lc .meta,.lc .number,.lc .params,.lc .type{color:#f5ab35}.lc .attribute{color:gold}.lc .addition,.lc .bullet,.lc .string,.lc .symbol{color:#abe338}.lc .section,.lc .title{color:#00e0e0}.lc .keyword,.lc .selector-tag{color:#dcc6e0}.code.lc{background:#2b2b2b}.lc code{color:#f8f8f2}\n"
		},
		{  "name": "Solarized Light",
			"css": ".code.lc{background:#fdf6e3}.lc code{color:#657b83}.lc .comment,.lc .quote{color:#93a1a1}.lc .addition,.lc .keyword,.lc .selector-tag{color:#859900}.lc .doctag,.lc .literal,.lc .meta .lc .meta-string,.lc .number,.lc .regexp,.lc .string{color:#2aa198}.lc .name,.lc .section,.lc .selector-class,.lc .selector-id,.lc .title{color:#268bd2}.lc .attr,.lc .attribute,.lc .class .lc .title,.lc .template-variable,.lc .type,.lc .variable{color:#b58900}.lc .bullet,.lc .link,.lc .meta,.lc .meta .lc .keyword,.lc .selector-attr,.lc .selector-pseudo,.lc .subst,.lc .symbol{color:#cb4b16}.lc .built_in,.lc .deletion{color:#dc322f}.lc .formula{background:#eee8d5}"
		},
		{  "name": "Solarized Dark",
			"css": ".code.lc{background:#002b36}.lc code{color:#839496}.lc .comment,.lc .quote{color:#586e75}.lc .addition,.lc .keyword,.lc .selector-tag{color:#859900}.lc .doctag,.lc .literal,.lc .meta .lc .meta-string,.lc .number,.lc .regexp,.lc .string{color:#2aa198}.lc .name,.lc .section,.lc .selector-class,.lc .selector-id,.lc .title{color:#268bd2}.lc .attr,.lc .attribute,.lc .class .lc .title,.lc .template-variable,.lc .type,.lc .variable{color:#b58900}.lc .bullet,.lc .link,.lc .meta,.lc .meta .lc .keyword,.lc .selector-attr,.lc .selector-pseudo,.lc .subst,.lc .symbol{color:#cb4b16}.lc .built_in,.lc .deletion{color:#dc322f}.lc .formula{background:#073642}"
		},
		{  "name": "Atom one Light",
			"css": ".code.lc{background:#fafafa}.lc code{color:#383a42}.lc .comment,.lc .quote{color:#a0a1a7;font-style:italic}.lc .doctag,.lc .formula,.lc .keyword{color:#a626a4}.lc .deletion,.lc .name,.lc .section,.lc .selector-tag,.lc .subst{color:#e45649}.lc .literal{color:#0184bb}.lc .addition,.lc .attribute,.lc .meta-string,.lc .regexp,.lc .string{color:#50a14f}.lc .built_in,.lc .class .lc .title{color:#c18401}.lc .attr,.lc .number,.lc .selector-attr,.lc .selector-class,.lc .selector-pseudo,.lc .template-variable,.lc .type,.lc .variable{color:#986801}.lc .bullet,.lc .link,.lc .meta,.lc .selector-id,.lc .symbol,.lc .title{color:#4078f2}"
		},
		{  "name": "Atom one Dark",
			"css": ".code.lc{background:#282c34}.lc code{color:#abb2bf}.lc .comment,.lc .quote{color:#5c6370;font-style:italic}.lc .doctag,.lc .formula,.lc .keyword{color:#c678dd}.lc .deletion,.lc .name,.lc .section,.lc .selector-tag,.lc .subst{color:#e06c75}.lc .literal{color:#56b6c2}.lc .addition,.lc .attribute,.lc .meta-string,.lc .regexp,.lc .string{color:#98c379}.lc .built_in,.lc .class .lc .title{color:#e6c07b}.lc .attr,.lc .number,.lc .selector-attr,.lc .selector-class,.lc .selector-pseudo,.lc .template-variable,.lc .type,.lc .variable{color:#d19a66}.lc .bullet,.lc .link,.lc .meta,.lc .selector-id,.lc .symbol,.lc .title{color:#61aeee}"
		},
		{  "name": "Atom one Dark-Reasonable",
			"css": ".code.lc{background:#282c34}.lc code{color:#abb2bf}.lc .keyword,.lc .operator{color:#f92672}.lc .pattern-match{color:#f92672}.lc .pattern-match .lc .constructor{color:#61aeee}.lc .function{color:#61aeee}.lc .function .lc .params{color:#a6e22e}.lc .function .lc .params .lc .typing{color:#fd971f}.lc .module-access .lc .module{color:#7e57c2}.lc .constructor{color:#e2b93d}.lc .constructor .lc .string{color:#9ccc65}.lc .comment,.lc .quote{color:#b18eb1;font-style:italic}.lc .doctag,.lc .formula{color:#c678dd}.lc .deletion,.lc .name,.lc .section,.lc .selector-tag,.lc .subst{color:#e06c75}.lc .literal{color:#56b6c2}.lc .addition,.lc .attribute,.lc .meta-string,.lc .regexp,.lc .string{color:#98c379}.lc .built_in,.lc .class .lc .title{color:#e6c07b}.lc .attr,.lc .number,.lc .selector-attr,.lc .selector-class,.lc .selector-pseudo,.lc .template-variable,.lc .type,.lc .variable{color:#d19a66}.lc .bullet,.lc .link,.lc .meta,.lc .selector-id,.lc .symbol,.lc .title{color:#61aeee}"
		},
		{  "name": "Hopscotch",
			"css": ".lc .comment,.lc .quote{color:#989498}.lc .attribute,.lc .deletion,.lc .link,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#dd464c}.lc .built_in,.lc .builtin-name,.lc .literal,.lc .number,.lc .params,.lc .type{color:#fd8b19}.lc .class .lc .title{color:#fdcc59}.lc .addition,.lc .bullet,.lc .string,.lc .symbol{color:#8fc13e}.lc .meta{color:#149b93}.lc .function,.lc .section,.lc .title{color:#1290bf}.lc .keyword,.lc .selector-tag{color:#c85e7c}.code.lc{background:#322931}.lc code{color:#b9b5b8}"
		},
		{  "name": "xt256",
			"css": ".code.lc{background:#000}.lc code{color:#eaeaea}.lc .subst{color:#eaeaea}.lc .builtin-name,.lc .type{color:#eaeaea}.lc .params{color:#da0000}.lc .literal,.lc .name,.lc .number{color:red;font-weight:bolder}.lc .comment{color:#969896}.lc .quote,.lc .selector-id{color:#0ff}.lc .template-variable,.lc .title,.lc .variable{color:#0ff;font-weight:700}.lc .keyword,.lc .selector-class,.lc .symbol{color:#fff000}.lc .bullet,.lc .string{color:#0f0}.lc .section,.lc .tag{color:#000fff}.lc .selector-tag{color:#000fff;font-weight:700}.lc .attribute,.lc .built_in,.lc .link,.lc .regexp{color:#f0f}.lc .meta{color:#fff;font-weight:bolder}"
		},
		{  "name": "Kimbie.light",
			"css": ".lc .comment,.lc .quote{color:#a57a4c}.lc .meta,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#dc3958}.lc .built_in,.lc .builtin-name,.lc .deletion,.lc .link,.lc .literal,.lc .number,.lc .params,.lc .type{color:#f79a32}.lc .attribute,.lc .section,.lc .title{color:#f06431}.lc .addition,.lc .bullet,.lc .string,.lc .symbol{color:#889b4a}.lc .function,.lc .keyword,.lc .selector-tag{color:#98676a}.code.lc{background:#fbebd4}.lc code{color:#84613d}"
		},
		{  "name": "Kimbie.dark",
			"css": ".lc .comment,.lc .quote{color:#d6baad}.lc .meta,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#dc3958}.lc .built_in,.lc .builtin-name,.lc .deletion,.lc .link,.lc .literal,.lc .number,.lc .params,.lc .type{color:#f79a32}.lc .attribute,.lc .section,.lc .title{color:#f06431}.lc .addition,.lc .bullet,.lc .string,.lc .symbol{color:#889b4a}.lc .function,.lc .keyword,.lc .selector-tag{color:#98676a}.code.lc{background:#221a0f}.lc code{color:#d3af86}"
		},
		{  "name": "Codepen",
			"css": ".code.lc{background:#222}.lc code{color:#fff}.lc .comment,.lc .quote{color:#777}.lc .built_in,.lc .builtin-name,.lc .bullet,.lc .deletion,.lc .link,.lc .literal,.lc .meta,.lc .number,.lc .params,.lc .regexp,.lc .symbol,.lc .tag,.lc .template-variable,.lc .variable{color:#ab875d}.lc .attribute,.lc .name,.lc .section,.lc .selector-class,.lc .selector-id,.lc .title,.lc .type{color:#9b869b}.lc .addition,.lc .keyword,.lc .selector-tag,.lc .string{color:#8f9c6c}"
		},
		{  "name": "An old hope",
			"css": ".lc .comment,.lc .quote{color:#b6b18b}.lc .deletion,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#eb3c54}.lc .built_in,.lc .builtin-name,.lc .link,.lc .literal,.lc .meta,.lc .number,.lc .params,.lc .type{color:#e7ce56}.lc .attribute{color:#ee7c2b}.lc .addition,.lc .bullet,.lc .string,.lc .symbol{color:#4fb4d7}.lc .section,.lc .title{color:#78bb65}.lc .keyword,.lc .selector-tag{color:#b45ea4}.code.lc{background:#1c1d21}.lc code{color:#c0c5ce}"
		},
		{  "name": "Ocean",
			"css": ".lc .comment,.lc .quote{color:#65737e}.lc .deletion,.lc .name,.lc .regexp,.lc .selector-class,.lc .selector-id,.lc .tag,.lc .template-variable,.lc .variable{color:#bf616a}.lc .built_in,.lc .builtin-name,.lc .link,.lc .literal,.lc .meta,.lc .number,.lc .params,.lc .type{color:#d08770}.lc .attribute{color:#ebcb8b}.lc .addition,.lc .bullet,.lc .string,.lc .symbol{color:#a3be8c}.lc .section,.lc .title{color:#8fa1b3}.lc .keyword,.lc .selector-tag{color:#b48ead}.code.lc{background:#2b303b}.lc code{color:#c0c5ce}"
		},
		{  "name": "Rainbow",
			"css": ".code.lc{background:#474949}.lc code{color:#d1d9e1}.lc .comment,.lc .quote{color:#969896;font-style:italic}.lc .addition,.lc .keyword,.lc .literal,.lc .selector-tag,.lc .type{color:#c9c}.lc .number,.lc .selector-attr,.lc .selector-pseudo{color:#f99157}.lc .doctag,.lc .regexp,.lc .string{color:#8abeb7}.lc .built_in,.lc .name,.lc .section,.lc .title{color:#b5bd68}.lc .class .lc .title,.lc .selector-id,.lc .template-variable,.lc .variable{color:#fc6}.lc .name,.lc .section{font-weight:700}.lc .bullet,.lc .link,.lc .meta,.lc .subst,.lc .symbol{color:#f99157}.lc .deletion{color:#dc322f}.lc .formula{background:#eee8d5}.lc .attr,.lc .attribute{color:#81a2be}"
		},
		{  "name": "Routeros",
			"css": ".code.lc{background:#f0f0f0}.lc code,.lc .subst{color:#444}.lc .comment{color:#888}.lc .doctag,.lc .keyword,.lc .meta-keyword,.lc .name,.lc .selector-tag{font-weight:700}.lc .attribute{color:#0e9a00}.lc .function{color:#99069a}.lc .builtin-name{color:#99069a}.lc .deletion,.lc .number,.lc .quote,.lc .selector-class,.lc .selector-id,.lc .string,.lc .template-tag,.lc .type{color:#800}.lc .section,.lc .title{color:#800;font-weight:700}.lc .link,.lc .regexp,.lc .selector-attr,.lc .selector-pseudo,.lc .symbol,.lc .template-variable,.lc .variable{color:#bc6060}.lc .literal{color:#78a960}.lc .addition,.lc .built_in,.lc .bullet,.lc .code{color:#0c9a9a}.lc .meta{color:#1f7199}.lc .meta-string{color:#4d99bf}"
		},
		{  "name": "School Book",
			"css": ".code.lc{background:#f6f6ae}.lc .keyword,.lc .literal,.lc .selector-tag{color:#059;font-weight:700}.lc code,.lc .subst{color:#3e5915}.lc .addition,.lc .attribute,.lc .built_in,.lc .builtin-name,.lc .bullet,.lc .link,.lc .section,.lc .string,.lc .symbol,.lc .template-tag,.lc .template-variable,.lc .title,.lc .type,.lc .variable{color:#2c009f}.lc .comment,.lc .deletion,.lc .meta,.lc .quote{color:#e60415}.lc .doctag,.lc .keyword,.lc .literal,.lc .name,.lc .section,.lc .selector-id,.lc .selector-tag,.lc .title,.lc .type{font-weight:700}"
		}];
		Object.defineProperty((HighlightJS.Styles = styles), 'names', {
			get: () => new Promise(resolve => {
				resolve(styles.map(({ name }) => name));
			})
		});
	}
	return styles[n];
}
