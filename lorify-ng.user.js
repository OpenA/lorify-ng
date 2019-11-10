// ==UserScript==
// @name        lorify-ng
// @description Юзерскрипт для сайта linux.org.ru поддерживающий загрузку комментариев через технологию WebSocket, а так же уведомления об ответах через системные оповещения и многое другое.
// @namespace   https://github.com/OpenA
// @include     https://www.linux.org.ru/*
// @include     http://www.linux.org.ru/*
// @version     2.8.1
// @grant       none
// @homepageURL https://github.com/OpenA/lorify-ng
// @updateURL   https://rawgit.com/OpenA/lorify-ng/master/lorify-ng.user.js
// @icon        https://rawgit.com/OpenA/lorify-ng/master/icons/penguin-64.png
// @run-at      document-start
// ==/UserScript==

const USER_SETTINGS = {
	'Realtime Loader': true,
	'CSS3 Animation' : true,
	'Delay Open Preview': 50,
	'Delay Close Preview': 800,
	'Desktop Notification': true,
	'Preloaded Pages Count': 1,
	'Scroll Top View': true,
	'Upload Post Delay': 5,
	'Code Block Short Size': 512
}

const pagesCache    = new Map;
const ResponsesMap  = new Object;
const CommentsCache = new Object;
const LOR           = parseLORUrl(location.pathname);
const anonymous     = { innerText: 'anonymous' };
const TOUCH_DEVICE  = 'ontouchstart' in window;
const [,TOKEN = ''] = document.cookie.match(/CSRF_TOKEN="?([^;"]*)/);
const Timer         = {
	// clear timer by name
	clear: function(name) {
		clearTimeout(this[name]);
	},
	// set/replace timer by name
	set: function(name, func, t = 50) {
		this.clear(name);
		this[name] = setTimeout(func, USER_SETTINGS['Delay '+ name] || t);
	}
}
document.documentElement.append(
	_setup('script', { id: 'start-rws', text: `
		var _= { value: function(){} }; Object.defineProperties(window, { initStarPopovers: _, initNextPrevKeys: _, $script: _, define: { configurable: true, get: define_amd }});
		var tag_memories_form_setup = topic_memories_form_setup;
		$script.ready = function(name, call) {
			if (name == 'lorjs')
				document.addEventListener('DOMContentLoaded', call);
		}
		function topic_memories_form_setup(a,b,c,d) {
			window.dispatchEvent( new CustomEvent('memories_setup', { bubbles: true, detail: [a,b,c,d] }) );
		}
		function define_amd() {
			if (_.value.amd)
				Object.defineProperty(window, 'define', _);
			_.value.amd = true;
			return 'function';
		}
	`}),
	_setup('style' , { text: `
		.newadded  { border: 1px solid #006880; }
		.msg-error { color: red; font-weight: bold; }
		.broken    { color: inherit !important; cursor: default; }
		.select-break::selection { background: rgba(99,99,99,.3); }
		.response-block, .response-block > a { padding: 0 3px !important; }
		.page-number { position: relative; }
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
			margin: 500px auto;
		}
		.terminate {
			animation-duration: .4s;
			position: relative;
		}
		.preview {
			animation-duration: .3s;
			position: absolute;
			z-index: 300;
		}
		.preview #commentForm {
			display: none;
		}
		.slide-down {
			max-height: 9999px;
			overflow-y: hidden;
			animation: slideDown 1.5s ease-in-out;
		}
		.slide-up {
			max-height: 0;
			overflow-y: hidden;
			animation: slideUp 1s ease-out;
		}
		#markup-panel > .btn {
			font-size: smaller!important;
			padding: 3px 10px!important;
		}
		.lorcode > .btn:before {
			content: attr(lorcode);
		}
		.markdown > .btn:not([markdown]) {
			display: none!important;
		}
		.markdown > .btn:before {
			content: attr(markdown);
		}
		.markdown > .uc:after { content: "\xA0"; }
		.markdown > .uc { font-variant: unicase; font-variant: sub; }
		
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

		.scrolltop-btn {
			transform: rotate(90deg);
			position: fixed;
			cursor: pointer;
			right: 15px;
			bottom: 15px;
			padding: 6px;
			opacity: .3;
		}
		.scrolltop-btn:before {
			content: '\x52';
			font: bold 22px fontello;
		}
		.scrolltop-btn:hover {
			background-color: black;
			border-radius: 7px;
			filter: invert(100%);
			opacity: .5;
		}

		@-webkit-keyframes process { 0% { width: 0; } 100% { width: 20px; } }
		@keyframes process { 0% { width: 0; } 100% { width: 20px; } }
		
		@-webkit-keyframes slideDown { from { max-height: 0; } to { max-height: 3000px; } }
		@keyframes slideDown { from { max-height: 0; } to { max-height: 3000px; } }
		
		@-webkit-keyframes slideUp { from { max-height: 2000px; } to { max-height: 0; } }
		@keyframes slideUp { from { max-height: 2000px; } to { max-height: 0; } }
		
		@-webkit-keyframes toShow { from { opacity: 0; } to { opacity: 1; } }
		@keyframes toShow { from { opacity: 0; } to { opacity: 1; } }
		
		@-webkit-keyframes toHide { from { opacity: 1; } to { opacity: 0; } }
		@keyframes toHide { from { opacity: 1; } to { opacity: 0; } }
		
		@-webkit-keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
		@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
		
		@-webkit-keyframes slideToShow { 0% { right: 100%; opacity: 0; } 100% { right: 0%; opacity: 1; } }
		@keyframes slideToShow { 0% { right: 100%; opacity: 0; } 100% { right: 0%; opacity: 1; } }
		
		@-webkit-keyframes slideToShow-reverse { 0% { left: 100%; opacity: 0; } 100% { left: 0%; opacity: 1; } }
		@keyframes slideToShow-reverse { 0% { left: 100%; opacity: 0; } 100% { left: 0%; opacity: 1; } }
`}));

const Navigation = {
	
	complete: null,
	pagesCount: 1,
	
	stb: _setup('div', { html: '<div class="page-loader"></div>' }),
	bar: _setup('div', { class: 'nav', html: `
		<a class="page-number prev" href="#prev">←</a>
		<a id="page_0" class="page-number" href="${ LOR.path }#comments">1</a>
		<a class="page-number next" href="#next">→</a>
	`, onclick: navBarHandle }),
	
	get lastId () {
		const last = pagesCache.get(this.pagesCount - 1).querySelector('.msg[id^="comment-"]:last-child');
		return LOR.topic + (last ? ' '+ last.id.replace('comment-', '') : '');
	},
	
	get page () {
		return LOR.page;
	},
	
	set page (num) {
		var comments = pagesCache.get(LOR.page);
		var reverse  = num > LOR.page;
		var _loader_ = this.stb;
		
		this.bar.querySelectorAll('.broken').forEach(lnk => lnk.classList.remove('broken'));
		
		if (num <= 0) {
			// set prev button to inactive
			this.bar.firstElementChild.classList.add('broken');
		} else
		if (num >= this.pagesCount - 1) {
			// set next button to inactive
			this.bar.lastElementChild.classList.add('broken');
		}
		this.bar.children['page_'+ (LOR.page = num)].classList.add('broken');
		
		if (USER_SETTINGS['Scroll Top View']) {
			comments.querySelector('.nav').scrollIntoView({ block: 'start' });
		}
		
		this.complete = new Promise(resolve => {
			if (pagesCache.has(num)) {
				Navigation.swapAnimateTo( comments, pagesCache.get(num), reverse, resolve );
			} else {
				comments.parentNode.replaceChild( _loader_, comments );
				
				pagesPreload(num).then(comms => {
					Navigation.swapAnimateTo( _loader_, comms, reverse, resolve );
				});
			}
		});
	},
	
	addToBar: function(pNumEls) {
		
		this.pagesCount = pNumEls.length - 2;
		
		var i = this.bar.children.length - 2;
		var pageLinks = '';
		
		for (; i < this.pagesCount; i++) {
			pageLinks += `<a id="page_${ i }" class="page-number" href="${ LOR.path }/page${ i }#comments">${ i + 1 }</a>\n`;
		}
		this.bar.lastElementChild.insertAdjacentHTML('beforebegin', pageLinks);
		
		if (LOR.page === 0) {
			this.bar.firstElementChild.classList.add('broken');
			this.bar.lastElementChild.href = this.bar.children['page_'+ (LOR.page + 1)].href;
		} else 
		if (LOR.page === this.pagesCount - 1) {
			this.bar.lastElementChild.classList.add('broken');
			this.bar.firstElementChild.href = this.bar.children['page_'+ (LOR.page - 1)].href;
		}
		this.bar.children['page_'+ LOR.page].className = 'page-number broken';
		
		return this.bar;
	},
	
	swapAnimateTo: function(comments, content, reverse, resolve) {
		
		_setup(content.querySelector('.nav'), {
			html: this.bar.innerHTML, onclick: navBarHandle
		});
		
		if (USER_SETTINGS['CSS3 Animation']) {
		
			content.addEventListener('animationend', function(e) {
				this.removeEventListener(e.type, arguments.callee, true);
				this.style['animation-name'] = null;
				this.classList.remove('terminate');
				resolve();
			}, true);
			
			content.classList.add('terminate');
			content.style['animation-name'] = 'slideToShow'+ (reverse ? '-reverse' : '');
		} else {
			resolve();
		}
		
		comments.parentNode.replaceChild(content, comments);
	}
}

const Favicon = {
	
	original : '//www.linux.org.ru/favicon.ico',
	index    : 0,
	size     : 16 * ( Math.ceil(window.devicePixelRatio) || 1 ),
	
	get tabname() {
		let title = document.title;
		Object.defineProperty(this, 'tabname', { value: title });
		return title;
	},
	
	get canvas() {
		let canvas = document.createElement('canvas');
		canvas.width = canvas.height = this.size;
		Object.defineProperty(this, 'canvas', { value: canvas });
		return canvas;
	},
	
	get image() {
		let image  = new Image;
		let origin = this.original;
		// allow cross origin resource requests if the image is not a data:uri
		if ( ! /^data:/.test(origin)) {
			image.crossOrigin = 'anonymous';
		}
		image.onReady = new Promise(resolve => {
			// 1: imageload promise => call resolve fn
			image.onload = resolve;
			image.src    = origin;
		});
		Object.defineProperty(this, 'image', { value: image });
		return image;
	},
	
	get icon() {
		let links = document.getElementsByTagName('link'),
		   length = links.length;
		
		for (var i = 0; i < length; i++) {
			if (links[i].rel && /\bicon\b/i.test(links[i].rel)) {
				this.original = links[i].href;
				Object.defineProperty(this, 'icon', { configurable: true, value: links[i] });
				return links[i];
			}
		}
	},
	
	draw: function(label = '', color = '#48de3d') {
		
		const { icon, size, image, tabname, canvas } = this;
		const context = canvas.getContext('2d');
		
		image.onReady.then(e => {
			
			// clear canvas
			context.clearRect(0, 0, size, size);
			// draw the favicon
			context.drawImage(image, 0, 0, image.width, image.height, 0, 0, size, size);
			
			var href = image.src;
			
			if (label) {
				
				if (typeof label === 'number' && label > 99) {
					document.title = tabname +' ('+ label +')';
					label = '99+';
				}
				
				let radius = size / 100 * 38,
				   centerX = size - radius,
				   centerY = radius,
				   fontPix = radius * 1.5;
			
				// webkit seems to render fonts lighter than firefox
				context.font = 'bold '+ fontPix +'px arial';
				context.fillStyle = color;
				context.strokeStyle = 'rgba(0,0,0,.2)';
			
				// bubble
				context.beginPath();
				context.arc(centerX, centerY, radius, 0, 2 * Math.PI, false);
				context.fill();
				context.stroke();
			
				// label
				context.fillStyle = '#fff';
				context.textAlign = 'center';
				context.fillText(label, centerX, fontPix);
				href = canvas.toDataURL();
			}
			_setup(icon, { type: 'image/png', rel: 'icon', href });
		});
	}
}

let Highlight_Code = new HighlightJS;
let MARKDOWN_MODE = false;

_setup(document, null, {
	
	'DOMContentLoaded': location.pathname == '/notifications' ? function resetNotif() {
		
		this.removeEventListener('DOMContentLoaded', resetNotif);
		
		if ('reset_form' in this.forms) {
			sendFormData('notifications-reset', new FormData(
				_setup(this.forms['reset_form'], { style: 'display: none;' })
			), false).then( () => App.reset() );
		}
	} : function onDOMReady() {
		
		this.removeEventListener('DOMContentLoaded', onDOMReady);
		
		const [, s_top, replyto, s_cid] = location.search.match(/\?(?:topic=([0-9]+)(?:\&replyto=([0-9]+))?|cid=([0-9]+))/) || '';
		const top  = this.getElementById(`topic-${ LOR.topic || s_top }`);
		const user = this.querySelector('#loginGreating > a[href$="/profile"]');
		const form = this.forms['commentForm'] || this.forms['messageForm'];
		const init = App.init();

		if (user) {
			LOR.Login = new RegExp(user.innerText);
		} else {
			this.querySelectorAll('.fav-buttons > a').forEach(a => { a.href = 'javascript:void(0)' });
			LOR.Login = /(!^)/;
		}
		// add scroll top button
		this.body.appendChild(
			_setup('div', { class: 'scrolltop-btn' }, { click: () => document.documentElement.scrollIntoView({ block: 'start', behavior: 'smooth' }) })
		);
		
		if (form) {
			
			handleCommentForm((LOR.CommentForm = form));
			this.querySelectorAll('#topicMenu a[href^="comment-message.jsp?topic"], a[itemprop="replyToUrl"]').forEach(handleReplyToBtn);
			
			let bd_rep = this.querySelector('#bd > h2 > a[name="rep"], #bd #navPath');
			if (bd_rep) {
				bd_rep.append('\n(', _setup('a', {
					text : 'с цитатой',
					style: 'color: indianred!important;',
					href : 'javascript:void(0)'
				},{
					click: convMsgBody.bind(null, this.querySelector(`#topic-${ s_top } .msg_body > div:not([class]), #comment-${ replyto } .msg_body`))
				}), ')\n');
			}
		}
		
		const ts = top ? top.querySelector(`a[itemprop="creator"]`) : null;
		
		if (ts) {
			LOR.TopicStarter = ts.innerText;
			this.getElementById('start-rws').nextElementSibling.append(`\n
				a[itemprop="creator"][href="${ ts.pathname }"], .ts { color: indianred!important; }
				a[itemprop="creator"][href="${ ts.pathname }"]:after, .ts:after {
					content: "тс";
					font-size: 75%;
					color: dimgrey!important;
					display: inline-block;
					vertical-align: super;
				}`);
		}
		
		Highlight_Code.apply( top || this );
		
		if (!LOR.topic) {
			window.addEventListener('memories_setup', ({ detail }) => {
				_setup(document.getElementById('tagFavAdd'), { 'data-tag': detail[0], onclick: tagMemories });
				_setup(document.getElementById('tagIgnore'), { 'data-tag': detail[0], onclick: tagMemories });
			});
			return;
		}
		
		const pagesElements = this.querySelectorAll('.messages > .nav > .page-number');
		const comments      = this.getElementById('comments');
		
		if (pagesElements.length) {
			
			const bar = Navigation.addToBar(pagesElements);
			const nav = pagesElements[0].parentNode;
			
			nav.parentNode.replaceChild(bar, nav);
			
			_setup(comments.querySelector('.nav'), { html: bar.innerHTML, onclick: navBarHandle });
		}
		
		var history_state = LOR.path + (LOR.page ? '/page'+ LOR.page : '');
		
		if (s_cid) {
			this.getElementById('comment-'+ s_cid).scrollIntoView();
			history_state += '#comment-'+ s_cid;
		}
		history.replaceState(null, null, history_state);
		
		pagesCache.set(LOR.page, comments);
		pagesCache.set(comments, LOR.page);
		
		addToCommentsCache(
			comments.querySelectorAll('.msg[id^="comment-"]'), null, true
		);
		
		var   lastPage = Navigation.pagesCount;
		const topicArc = this.evaluate(
			'//*[@class="messages"]/*[@class="infoblock" and contains(., "Тема перемещена в архив")]', this.body, null, 3, null
		);
		const topicDel = this.evaluate(
			'//*[@class="messages"]/*[@class="infoblock" and contains(., "Тема удалена")]', this.body, null, 3, null
		);
		
		if (topicDel.booleanValue) {
			Favicon.draw('\u2013', '#F00');
		} else
		if (!topicArc.booleanValue) {
			if ((lastPage -= 1) > LOR.page) {
				pagesPreload(lastPage).then(RealtimeWatcher.start);
			} else {
				RealtimeWatcher.start();
			}
		}
		
		init.then(() => {
			for (var g = 1, num = LOR.page + 1; (g++) < USER_SETTINGS['Preloaded Pages Count']; num++) {
				if (num >= lastPage)
					break;
				pagesPreload(num);
			}
			for (num = LOR.page - 1; (g++) < USER_SETTINGS['Preloaded Pages Count']; num--) {
				if (num < 0)
					break;
				pagesPreload(num);
			}
		});
		
		_setup(window, null, {
			memories_setup: ({ detail: [rm_id, memories] }) => {
				var btn = top.querySelector(`#${ memories ? 'memories' : 'favs' }_button`);
				btn.onclick = topicMemories;
				if (rm_id) {
					btn.setAttribute('rm-id', rm_id);
					btn.className = 'selected';
					btn.title = memories ? 'Отслеживается' : 'В избранном';
				} else
					btn.title = memories ? 'Следить за темой' : 'Добавить в избранное';
			},
			dblclick: () => {
				var newadded = document.querySelectorAll('.newadded');
				newadded.forEach(nwc => nwc.classList.remove('newadded'));
				document.querySelectorAll('#page_'+ LOR.page).forEach(pg => pg.removeAttribute('cnt-new'));
				Favicon.draw(
					(Favicon.index -= newadded.length)
				);
			},
			popstate: e => {
				const { page } = parseLORUrl(location.pathname);
				const comment_id = location.hash.substring(1);
				if (LOR.page != page) {
					Navigation.page = page;
					Navigation.complete.then(() => comment_id && document.getElementById(comment_id).scrollIntoView());
				} else if (comment_id) {
					document.getElementById(comment_id).scrollIntoView();
				}
			}
		});
	}
});

const RealtimeWatcher = (() => {
	var wS, dbCiD = new Array(0);
	return class {
		static start() {
			var realtime = document.getElementById('realtime');
			wS = new WebSocket('wss://www.linux.org.ru:9000/ws');
			wS.onmessage =  e => {
				dbCiD.push( e.data );
				Timer.set('WebSocket Data', () => {
					if (USER_SETTINGS['Realtime Loader']) {
						onWSData(dbCiD);
						dbCiD = new Array(0);
						realtime.style.display = 'none';
					} else {
						realtime.innerHTML = 'Был добавлен новый комментарий.\n<a href="'+
							LOR.path + '?cid=' + dbCiD[0] +'">Обновить.</a>';
						realtime.style.display = null;
					}
				}, 2e3);
			}
			wS.onopen = e => {
				console.info('Установлено соединение c '+ wS.url);
				wS.send( Navigation.lastId );
			}
			wS.onclose = e => {
				console.warn(`Соединение c ${ wS.url } было прервано "${ e.reason }" [код: ${ e.code }]`);
				if(!e.wasClean || e.code == 1008) {
					Timer.set('WebSocket Data', RealtimeWatcher.start, 5e3);
				}
			}
			wS.onerror = e => console.error(e);
		}
		static terminate(reason) {
			wS.close(1000, reason);
			Favicon.draw('\u2013', '#F00');
		}
	}
})();

const isInsideATag = (str, sp, ep) => (str.split(sp).length - 1) > (str.split(ep).length - 1);
var _char_ = '';
var _sign_ = false;
var _ctrl_ = false;

function winKeyHandler(e) {
	
	const $this = LOR.CommentForm.elements['msg'];
	const key   = e.key || String.fromCharCode(e.charCode);
	
	if (e.keyCode === 13 && _ctrl_) {
		return simulateClick(
			LOR.CommentForm.querySelector('.form-actions > [do-upload]')
		);
	}
	
	if (e.target === $this) {
		
		const val = $this.value;
		const end = $this.selectionEnd;
		let start = $this.selectionStart,
		   before = val.substring(0, start);
		
		let _STOP_ = true;
		
		const validKeys = MARKDOWN_MODE ? '>*@`~' : '>*@';
		const codePlay  = MARKDOWN_MODE ?
			isInsideATag(before, /```[^\n]*\n/, '\n```') :
			isInsideATag(before, /\[code(?:=[^\]]*)?\]/, '[/code]');
		
		if (codePlay) {
			const C = '{[(\'"'.indexOf(key);
		
			if (C >= 0 && !_sign_) {
				_char_ = '}])\'"'[C];
				_sign_ = true;
				lorcodeMarkup.call($this, key, _char_);
			} else {
				switch (e.keyCode) {
					case 13:
						var ln = before.split('\n').pop();
							ln = '\n'+ ln.replace(/^([\s]*).*/, '$1');
						
						start += ln.length;
						
						if (_sign_) {
							ln    += '   '+ ln;
							start += 3;
						}
						
						$this.value = before + ln + val.substring(end);
						$this.setSelectionRange(start, start);
						break;
					case 9:
						lorcodeMarkup.call($this, '   ', '\n   ');
						break;
					case 8:
						if (_sign_) {
							$this.value = val.slice(0, (start -= 1)) + val.slice(end + 1);
							$this.setSelectionRange(start, start);
							break;
						}
					default:
						if ((_STOP_ = key === _char_)) {
							$this.setSelectionRange((start += 1), start);
						}
				}
				_char_ = '';
				_sign_ = false;
			}
		} else if ((_STOP_ = end !== start && validKeys.includes(key))) {
			
			if (key === '>') {
				lorcodeMarkup.call($this, '>', '\n>')
			} else if (MARKDOWN_MODE) {
				switch (key) {
					case '`':
						markdownMarkup.call($this, /\n/gm.test(val.substring(start, end)) ? '```' : key);
						break;
					case '*':
						if (start == 0 || val.substring(start - 1, start) == '\n') {
							lorcodeMarkup.call($this, '* ', '\n* ');
							break;
						}
					case '~': case '@':
						markdownMarkup.call($this, key);
				}
			} else {
				lorcodeMarkup.apply($this, key === '@' ? ['[user]', '[/user]'] : ['[*]','[/*]']);
			}
		}
		
		if (_STOP_) {
			e.preventDefault();
		} else if ($this.classList.contains('select-break') && e.keyCode != 8) {
			$this.setSelectionRange(end, end);
			$this.classList.remove('select-break');
		}
		
	} else if ('@>'.includes(key)) {
		
		const wSelect = window.getSelection().toString();
		
		if (wSelect.length) {
			e.preventDefault();
			lorcodeMarkup.apply($this,
				key === '>'   ? ['>', '\n>', wSelect] :
				MARKDOWN_MODE ? ['@',    '', wSelect] :
					   ['[user]', '[/user]', wSelect]);
		}
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

function lorcodeMarkup(open, close, blur) {
	
	var val    = this.value;
	var end    = this.selectionEnd;
	var start  = this.selectionStart;
	
	var wins, lorcText, select;
	var pins = start === end;
	
	if (blur) {
		select = blur;
		
		switch (open) {
			case '>':
				if ((wins = pins) && val.length) {
					start = end = val.length;
					open  = close;
				}
				break;
			default:
				pins = false;
		}
	} else {
		select = val.substring(start, end);
	}
	
	switch (open) {
		case '\n   ': case '   ': case '\n>': case '>': case '* ': case '\n* ':
			select = select.replace(/\n/gm, close);
			close = '';
			break;
		case '[br]':
			select = select.replace(/\n/gm, (close = open) +'\n' );
			open = '';
			break;
		case '[*]':
			select = select.replace(/\[\/?\*\]/g, '').replace(/\n/gm, '\n'+ open);
			break;
		case '[url]':
			const [ uri ] = /(?:ht|f)tps?:\/\/[^\s]+/.exec(select) || '';
			if (uri) {
				open = `[url=${ uri }]`;
				select = select.replace(uri, '');
			}
	}
	
	this.value = val.substring(0, start) + (lorcText = open + select + close) + val.substring(end);
	if (wins) {
		this.selectionStart = this.selectionEnd = this.value.length;
	} else {
		this.setSelectionRange(
			start + (pins ? open.length : 0),
			start + (pins ? open.length + select.length : lorcText.length)
		);
		this.classList.add('select-break');
		this.focus();
	}
	this.dispatchEvent( new InputEvent('input', { bubbles: true }) );
}

function navBarHandle(e) {
	const cL = e.target.classList;
	if (cL[0] === 'page-number') {
		e.preventDefault();
		if (!cL.contains('broken')) {
			switch (cL[1]) {
				case 'prev': Navigation.page--; break;
				case 'next': Navigation.page++; break;
				default    : Navigation.page = Number(e.target.id.substring(5));
			}
			history.pushState(null, null, LOR.path + (LOR.page ? '/page'+ LOR.page : ''));
		}
	}
}

function onWSData(dbCiD) {
	// Get an HTML containing the comment
	getDataResponse(`${LOR.path}?filter=list&cid=${dbCiD[0]}&skipdeleted=true`,
		({ response, responseURL }) => { // => OK

			const { page } = parseLORUrl(responseURL);
			const comms    = getCommentsContent(response);
			
			if (pagesCache.has(page)) {
			
				const parent = pagesCache.get(page);
				
				for (let msg of parent.querySelectorAll('.msg[id^="comment-"]')) {
					if (msg.id in comms.children) {
						var cand = comms.children[msg.id],
						    sign = cand.querySelector('.sign_more > time');
						if (sign && sign.dateTime !== (msg['last_modifed'] || {}).dateTime) {
							msg['last_modifed']    = sign;
							msg['edit_comment']    = cand.querySelector('.reply a[href^="/edit_comment"]');
							msg['response_block'] && cand.querySelector('.reply > ul')
								.appendChild(msg['response_block']);
							
							const form = msg.querySelector('#commentForm');
							for (var R = cand.children.length; 0 < (R--);) {
								msg.replaceChild(cand.children[R], msg.children[R]);
							}
							form && msg.querySelector('.msg_body').appendChild( form.parentNode ).firstElementChild.elements['msg'].focus();
							
						} else if (msg['edit_comment']) {
							msg['edit_comment'].parentNode.hidden = !cand.querySelector('.reply a[href^="/edit_comment"]');
						}
					} else {
						_setup(msg, { id: 'deleted'+ msg.id.substr(7), class: 'msg deleted' });
					}
				}
				
				for (var i = 0; i < dbCiD.length; i++) {
				
					let comment = comms.children['comment-'+ dbCiD[i]];
					
					if (!comment) {
						onWSData( dbCiD.splice(i) );
						break;
					}
					dbCiD[i] = parent.appendChild(comment);
				}
				addToCommentsCache( dbCiD, { class: 'msg newadded' } );
				let cnt_new = i + (
					Number ( Navigation.bar.children['page_'+ page].getAttribute('cnt-new') ) || 0
				);
				_setup(           Navigation.bar.children['page_'+ page], { 'cnt-new': cnt_new });
				_setup( document.querySelector('#comments #page_'+ page), { 'cnt-new': cnt_new });
				Favicon.index += i;
			} else {
				
				pagesCache.set(page, comms);
				pagesCache.set(comms, page);
				
				const nav = comms.querySelector('.nav');
				const bar = Navigation.addToBar(nav.children);
				const msg = comms.querySelectorAll('.msg[id^="comment-"]');
				const parent = pagesCache.get(LOR.page);
				
				bar.children['page_'+ page].setAttribute('cnt-new', msg.length);
				if (!bar.parentNode) {
					let rt = document.getElementById('realtime');
					rt.parentNode.insertBefore(bar, rt.nextSibling);
					parent.insertBefore(_setup(bar.cloneNode(true), { onclick: navBarHandle }),
						parent.firstElementChild.nextSibling);
				} else {
					_setup(parent.querySelector('.nav'), { html: bar.innerHTML, onclick: navBarHandle });
				}
				addToCommentsCache( msg, { class: 'msg newadded' } );
				Favicon.index += msg.length;
			}
			Favicon.draw(Favicon.index);
			history.replaceState(null, null, location.pathname + location.hash);
		});
}

function addToCommentsCache(els, attrs, jqfix) {
	
	const { path, Login, TopicStarter } = LOR;

	var usr_refs = 0;
	
	for (let el of els) {
		
		let cid = el.id.replace('comment-', '');
		
		el['last_modifed'] = el.querySelector('.sign_more > time');
		el['edit_comment'] = el.querySelector('.reply a[href^="/edit_comment"]');
		
		Highlight_Code.apply(el);
		
		addPreviewHandler(
			(CommentsCache[cid] = el), attrs
		);
		
		el.querySelectorAll(`.msg_body > *:not(.reply):not(.sign) a[href*="${ path }?cid="]`).forEach(a => {
			_setup(a, { class: 'link-navs', cid: a.search.replace('?cid=', '') })
		});
		
		let acid = el.querySelector('.title > a[href*="cid="]');
		
		if (acid) {
			// Extract reply comment ID from the 'search' string
			let num = acid.search.match(/cid=(\d+)/)[1];
			let url = el.ownerDocument.evaluate('//*[@class="reply"]/ul/li/a[contains(text(), "Ссылка")]/@href',el,null,2,null);
			// Write special attributes
			if (jqfix) {
				acid.parentNode.replaceChild(
					_setup('a', { class: 'link-pref', cid: num, href: acid.getAttribute('href'), text: acid.textContent }), acid
				);
			} else {
				_setup(acid, { class: 'link-pref', cid: num });
				usr_refs += Login.test(acid.nextSibling.textContent);
			}
			// Create new response-map for this comment
			if (!(num in ResponsesMap)) {
				ResponsesMap[num] = new Array;
			}
			ResponsesMap[num].push({
				text: ( el.querySelector('a[itemprop="creator"]') || anonymous ).innerText,
				href: url.stringValue,
				cid : cid
			});
		}
	}
	
	for (var cid in ResponsesMap) {
		if ( cid in CommentsCache ) {
			
			let comment = CommentsCache[cid];
			
			if(!comment['response_block']) {
				comment['response_block'] = comment.querySelector('.reply > ul')
				.appendChild( _setup('li', { class: 'response-block', text: 'Ответы:' }) );
			}
			
			ResponsesMap[cid].forEach(attrs => {
				attrs['class' ] = 'link-pref'+ (attrs.text == TopicStarter ? ' ts' : '');
				attrs['search'] = '?cid='+ attrs.cid;
				comment['response_block'].appendChild( _setup('a', attrs) );
			});
			
			delete ResponsesMap[cid];
		}
	}
	
	if (usr_refs > 0) {
		App.checkNow();
	}
}

function getCommentsContent(html) {
	// Create new DOM tree
	const old = document.getElementById('topic-'+ LOR.topic),
	      fav = old.querySelector('.fav-buttons');
	const doc = new DOMParser().parseFromString(html, 'text/html'),
	    topic = doc.getElementById('topic-'+ LOR.topic),
	    newfv = topic.querySelector('.fav-buttons'),
	    comms = doc.getElementById('comments'),
	    isDel = doc.evaluate('//*[@class="messages"]/*[@class="infoblock" and contains(., "Тема удалена")]', doc.body, null, 3, null);
	// Remove banner scripts
	comms.querySelectorAll('script').forEach(s => s.remove());
	// Add reply button action
	if (LOR.CommentForm)
		doc.querySelectorAll('a[itemprop="replyToUrl"]').forEach(handleReplyToBtn);
	// update favorites and memories counter
	fav.children[  'favs_count'  ].textContent = newfv.children[  'favs_count'  ].textContent;
	fav.children['memories_count'].textContent = newfv.children['memories_count'].textContent;
	// stop watch if topic deleted
	if (isDel.booleanValue)
		RealtimeWatcher.terminate('Тема удалена');
	// Replace topic if modifed
	for (let name of ['header', '.msg_body > [itemprop="articleBody"]', '.sign > .sign_more']) {
		const old_el = old.querySelector(name),
		      new_el = topic.querySelector(name);
		if (old_el.textContent != new_el.textContent) {
			old_el.parentNode.replaceChild(new_el, old_el);
			Highlight_Code.apply( new_el );
		}
	}
	return comms;
}

const openPreviews = document.getElementsByClassName('preview');
var _offset_ = 1, _loads_ = {};

function removePreviews(comment) {
	var c = openPreviews.length - _offset_;
	while (openPreviews[c] !== comment) {
		openPreviews[c--].remove();
	}
}

function goToCommentPage(cid) {
	return new Promise((resolve, reject) => {

		var comment = document.getElementById(`comment-${cid}`);

		if (comment) {
			comment.scrollIntoView({ block: 'start', behavior: 'smooth' });
			history.pushState(null, null, `${location.pathname}#comment-${cid}`);
			resolve(comment);
		} else if (cid in CommentsCache) {
			const num = pagesCache.get( CommentsCache[cid].parentNode );
			Navigation.page = num;
			Navigation.complete.then(() => {
				CommentsCache[cid].scrollIntoView({ block: 'start', behavior: 'smooth' })
				resolve(CommentsCache[cid]);
			});
			history.pushState(null, null, LOR.path + (num ? '/page'+ num : '') +'#comment-'+ cid);
		} else {
			reject();
		}
	});
}

function addPreviewHandler(comment, attrs) {
	
	comment.addEventListener('click', e => {
		
		const aClass = e.target.classList[0];
		
		switch (aClass) {
		case 'link-navs':
		case 'link-pref':
			var cid  = e.target.getAttribute('cid');
			_offset_ = 1;
			['Close Preview', 'Open Preview', e.target.href].forEach(Timer.clear);
			removePreviews();
			goToCommentPage(cid).catch(() => {
				const href = e.target.pathname + e.target.search;
				(_loads_[href] || loadFullPage(href)).then(() => {
					goToCommentPage(cid);
				});
			});
			e.preventDefault();
			break;
		case 'replyComment':
		case 'quoteComment':
			var cid = comment.id.replace('preview-', '');
			goToCommentPage(cid).then(target => {
				simulateClick(
					target.querySelector(`.${aClass}`)
				);
			});
			e.preventDefault();
		}
	});
	
	if ( ! TOUCH_DEVICE ) {
		
		comment.addEventListener('mouseover', e => {
			if (e.target.classList[0] === 'link-pref') {
				Timer.clear(e.target.href);
				Timer.set('Open Preview', () => {
					_offset_ = 2;
					showPreview(e);
				});
				e.preventDefault();
			}
		});
		
		comment.addEventListener('mouseout', e => {
			if (e.target.classList[0] === 'link-pref') {
				_offset_ = 1;
				Timer.clear('Open Preview');
			}
		});
	}
	
	_setup(comment, attrs);
}

function loadFullPage(href) {
	return new Promise((resolve, reject) => {
		getDataResponse(href, ({ response, responseURL }) => { // => OK
			const { page } = parseLORUrl(responseURL);
			const comms    = getCommentsContent(response);
			
			pagesCache.set(page, comms);
			pagesCache.set(comms, page);
			
			addToCommentsCache(
				comms.querySelectorAll('.msg[id^="comment-"]')
			);
			
			resolve(comms);
		}, reject);
	});
}

function showPreview(e) {
	
	// Get comment's ID from custom attribute 
	var commentID = e.target.getAttribute('cid'),
	    commentEl;

	// Let's reduce an amount of GET requests
	// by searching a cache of comments first
	if (commentID in CommentsCache) {
		commentEl = document.getElementById('preview-'+ commentID);
		if (!commentEl) {
			// Without the 'clone' call we'll just move the original comment
			commentEl = CommentsCache[commentID].cloneNode(
				(e.isNew = true)
			);
		}
	} else {
		// Add Loading Process stub
		commentEl = _setup('article', { class: 'msg preview', text: 'Загрузка...'});
		// Get an HTML containing the comment
		const href = e.target.pathname + e.target.search;
		(_loads_[href] = loadFullPage(href)).then(comms => {
			if (commentEl.parentNode) {
				commentEl.remove();
				showCommentInternal(
					comms.children['comment-'+ commentID].cloneNode((e.isNew = true)),
					commentID,
					e
				);
			}
		}).catch(({ status, statusText }) => { // => Error
			commentEl.textContent = status +' '+ statusText;
			commentEl.classList.add('msg-error');
			delete _loads_[href];
		});
	}
	showCommentInternal(
		commentEl,
		commentID,
		e
	);
}

function showCommentInternal(commentElement, commentID, e) {
	// From makaba
	const hoveredLink = e.target;
	const parentBlock = document.getElementById('comments');
	
	const { left, top, right, bottom } = hoveredLink.getBoundingClientRect();
	
	const visibleWidth  = innerWidth  / 2;
	const visibleHeight = innerHeight * 0.75;
	const offsetX       = pageXOffset + left + hoveredLink.offsetWidth / 2;
	const offsetY       = pageYOffset + bottom + 10;
	
	const postproc = () => {
		
		commentElement.style['left'] = Math.max(
			offsetX - (
				left < visibleWidth
				     ? 0
				     : commentElement.offsetWidth)
				, 5) + 'px';
		
		commentElement.style['top'] = pageYOffset + (
			top < visibleHeight
			    ? bottom + 10
			    : top - commentElement.offsetHeight - 10)
			+'px';
			
		if (!USER_SETTINGS['CSS3 Animation'])
			commentElement.style['animation-name'] = null;
	};
	
	if (e.isNew) {
		// If this comment contains link to another comment,
		// set the 'mouseover' hook to that 'a' tag
		addPreviewHandler( commentElement, {
		// Avoid duplicated IDs when the original comment was found on the same page
			id: 'preview-'+ commentID, 
			class: 'msg preview',
			style: 'animation-name: toShow; border: 1px solid grey; '+
				// There are no limitations for the 'z-index' in the CSS standard,
				// so it depends on the browser. Let's just set it to 300
				'max-width: '+ parentBlock.offsetWidth +
				'px; left: '+
				( left < visibleWidth
				       ? offsetX
				       : offsetX - visibleWidth ) +
				'px; top: '+
				( top < visibleHeight
				      ? offsetY
				      : 0 ) +'px;'
		});
		
		commentElement.addEventListener('animationstart', postproc, true);
	} else {
		commentElement.style['animation-name'] = null;
		postproc();
	}
	commentElement.onmouseleave = () => {
		// remove all preview's
		Timer.set('Close Preview', removePreviews)
	};
	commentElement.onmouseenter = () => {
		// remove all preview's after this one
		Timer.clear(hoveredLink.href);
		Timer.set('Close Preview', () => removePreviews(commentElement));
	};
	hoveredLink.onmouseleave = () => {
		// remove this preview
		Timer.set(hoveredLink.href, () => commentElement.remove(), USER_SETTINGS['Delay Close Preview']);
	};
	// Note that we append the comment to the '#comments' tag,
	// not the document's body
	// This is because we want to save the background-color and other styles
	// which can be customized by userscripts and themes
	parentBlock.appendChild(commentElement);
}

function _setup(el, _Attrs, _Events) {
	if (el) {
		if (typeof el === 'string') {
			el = document.createElement(el);
		}
		if (_Attrs) {
			for (var key in _Attrs) {
				_Attrs[key] === undefined ? el.removeAttribute(key) :
				key === 'html' ? el.innerHTML   = _Attrs[key] :
				key === 'text' ? el.textContent = _Attrs[key] :
				key in el    && (el[key]        = _Attrs[key] ) == _Attrs[key]
				             &&  el[key]       == _Attrs[key] || el.setAttribute(key, _Attrs[key]);
			}
		}
		if (_Events) {
			if ('remove' in _Events) {
				for (var type in _Events['remove']) {
					if (_Events['remove'][type].forEach) {
						_Events['remove'][type].forEach(function(fn) {
							el.removeEventListener(type, fn, false);
						});
					} else {
						el.removeEventListener(type, _Events['remove'][type], false);
					}
				}
				delete _Events['remove'];
			}
			for (var type in _Events) {
				el.addEventListener(type, _Events[type], false);
			}
		}
	}
	return el;
}

function pagesPreload(num) {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest;
		xhr.withCredentials = true;
		xhr.open('GET', location.origin + LOR.path +'/page'+ num, true);
		xhr.onload = () => {
			if (xhr.status === 200) {
				const comms = getCommentsContent(xhr.response);
				
				pagesCache.set(num, comms);
				pagesCache.set(comms, num);
				
				addToCommentsCache(
					comms.querySelectorAll('.msg[id^="comment-"]')
				);
				resolve(comms);
			} else
				reject(xhr);
		}
		xhr.send(null);
	});
}

function parseLORUrl(uri) {
	const out = new Object;
	var m = uri.match(/^(?:https?:\/\/www\.linux\.org\.ru)?(\/[^\/]+\/(?!archive)[^\/]+\/(\d+))(?:\/page(\d+))?/);
	if (m) {
		out.path  = m[1];
		out.topic = m[2];
		out.page  = Number(m[3]) || 0;
	}
	return out;
}

function getDataResponse(uri, resolve, reject = () => void 0) {
	const xhr = new XMLHttpRequest;
	xhr.withCredentials = true;
	xhr.open('GET', location.origin + uri, true);
	xhr.onload = () => {
		xhr.status === 200 ? resolve(xhr) : reject(xhr)
	}
	xhr.send(null);
}

function sendFormData(uri, formData, json = true) {
	
	const REQPARAMS = {
		credentials : 'same-origin',
		method      : 'POST',
		body        : formData,
		headers     : {
			'Accept': 'application/json'
		}
	}
	
	return fetch(location.origin +'/'+ uri, REQPARAMS).then(
		response => response.ok
			? (json ? response.json() : Promise.resolve(response))
			: Promise.reject(response)
	);
}

function simulateClick(el) {
	el && el.dispatchEvent(
		new MouseEvent('click', {
			cancelable: true,
			bubbles   : true,
			view      : window
		})
	);
}

function handleCommentForm(form) {
	
	const TEXT_AREA    = form.elements['msg'];
	const ACTION_JSP   = form.getAttribute('action').replace(/^\//, '');
	const FACT_PANNEL  = form.querySelector('.form-actions');
	const NODE_PREVIEW = _setup('div', { id: 'commentPreview', html: '<div class=error></div><h2></h2><span></span>' });
	const MARKUP_PANEL = _setup('div', {
		id   : 'markup-panel',
		class: 'lorcode',
		html : `
			<button type="button" class="btn btn-default" lorcode="b"></button>
			<button type="button" class="btn btn-default" lorcode="i" markdown="*"></button>
			<button type="button" class="btn btn-default" lorcode="u"></button>
			<button type="button" class="btn btn-default" lorcode="s" markdown="~~"></button>
			<button type="button" class="btn btn-default" lorcode="em"></button>
			<button type="button" class="btn btn-default" lorcode="br"></button>
			<button type="button" class="btn btn-default" lorcode="cut" markdown="&gt;&gt;&gt;"></button>
			<button type="button" class="btn btn-default" lorcode="list" markdown="1."></button>
			<button type="button" class="btn btn-default" lorcode="strong"></button>
			<button type="button" class="btn btn-default uc" lorcode="pre" markdown="* "></button>
			<button type="button" class="btn btn-default" lorcode="user" markdown="@"></button>
			<button type="button" class="btn btn-default" lorcode="code" markdown="&#96;&#96;&#96;"></button>
			<button type="button" class="btn btn-default" lorcode="inline" markdown="&#96;"></button>
			<button type="button" class="btn btn-default" lorcode="quote" markdown="&gt;"></button>
			<button type="button" class="btn btn-default" lorcode="url" markdown="http://"></button>`}, {
		click: e => {
			e.preventDefault();
			if (e.target.type === 'button') {
				if (MARKDOWN_MODE) {
					const mkdwn = e.target.getAttribute('markdown');
					if (mkdwn === '>' || mkdwn === '* ')
						lorcodeMarkup.call(TEXT_AREA, mkdwn, `\n${ mkdwn }`);
					else
						markdownMarkup.call(TEXT_AREA, mkdwn);
				} else {
					const bbtag = e.target.getAttribute('lorcode');
					lorcodeMarkup.call(TEXT_AREA, '['+ bbtag +']', '[/'+ bbtag +']');
				}
			}
		}
	});
	TEXT_AREA.parentNode.firstElementChild.appendChild(MARKUP_PANEL).previousSibling.remove();

	if (!form.elements[ 'cancel']) {
		form.elements['preview'].after(
			'\n', _setup('button', { name: 'cancel', class: 'btn btn-default', text: 'Отмена' })
		)
	}

	form.elements[ 'csrf' ].value = TOKEN;
	form.elements['preview'].type = 'button';
	form.elements[ 'cancel'].type = 'button';

	for (const submit_btn of FACT_PANNEL.querySelectorAll('[type="submit"]')) {
		submit_btn.type = 'button';
		submit_btn.setAttribute('do-upload', '');
	}

	const doSubmit = {

		UID: -1,

		refresh: () => {
				
			const formData = new FormData( form );
			
			formData.append('preview', '');

			if (form.elements['topic']) {
				sendFormData('add_comment_ajax', formData).then(
					({ errors, preview }) => {
						NODE_PREVIEW.children[0].innerHTML   = errors.join('\n<br>\n');
						NODE_PREVIEW.children[1].textContent = preview['title'] || '';
						NODE_PREVIEW.children[2].innerHTML   = preview['processedMessage'];
						Highlight_Code.apply( NODE_PREVIEW );
					}
				);
			} else {
				sendFormData(ACTION_JSP, formData, false).then(
					res => res.text().then(html => {
						const doc = new DOMParser().parseFromString(html, 'text/html'),
						      msg = doc.querySelector('.messages');
						NODE_PREVIEW.replaceChild(msg, NODE_PREVIEW.children[2]);
						Highlight_Code.apply( msg );
					})
				);
			}
		},

		process: (sbtn, y) => {
			form.elements[ 'cancel'].className = `btn btn-${ y ? 'danger' : 'default' }`;
			form.elements['preview'].disabled  = sbtn.disabled = y;
			sbtn.classList[y ? 'add' : 'remove']('process');
			for (const primary of FACT_PANNEL.querySelectorAll('.btn[do-upload]')) {
				primary.disabled = y;
			}
		},

		purge: (clry) => {

			simulateClick(
				form.parentNode.parentNode.querySelector('.replyComment')
			);

			if (clry) {
				form.elements[ 'msg' ].value = '';
				form.elements['title'].value = '';
				NODE_PREVIEW.children[0].innerHTML   = '';
				NODE_PREVIEW.children[1].textContent = '';
				NODE_PREVIEW.children[2].innerHTML   = '';
			}
		},

		handleEvent: function({ target }) {

			const { type, name } = target;

			if (type === 'button') {
				if (`do_${name}` in doSubmit) {
					this[`do_${name}`]();
				} else if (target.hasAttribute('do-upload')) {
					this[`do_upload`](target, name);
				}
			}
		},

		'do_upload': function(btn, param) {

			const { process, purge } = this;
			
			process(btn, true);

			this.UID = setTimeout(() => {

				const formData = new FormData( form );

				if (param)
					formData.append(param, '');

				sendFormData(ACTION_JSP, formData, false).then(({ url }) => {
					if (!USER_SETTINGS['Realtime Loader'] || parseLORUrl(url).topic != LOR.topic) {
						window.onbeforeunload = null;
						location.href         = url ;
						return;
					}
					process(btn, false);
					purge(true);
				}).catch(({ status, statusText }) => {
					form.appendChild( NODE_PREVIEW ).children[0].innerHTML = `Не удалось выполнить запрос, попробуйте повторить еще раз.\n(${ status +' '+ statusText })`;
					process(btn, false);
				});
			}, USER_SETTINGS['Upload Post Delay'] * 1e3);
		},

		'do_preview': function() {

			if (NODE_PREVIEW.hasAttribute('opened')) {
				NODE_PREVIEW.removeAttribute('opened', '');
				NODE_PREVIEW.remove();
				TEXT_AREA.oninput = null;
			} else {

				let t = -1, refresh = this.refresh; refresh();

				form.appendChild( NODE_PREVIEW ).setAttribute('opened', '');

				TEXT_AREA.oninput = () => {
					clearTimeout(t);
					t = setTimeout(refresh, 1e3);
				}
			}
		},

		'do_cancel': function() {

			if (form.elements['cancel'].classList.contains('btn-danger')) {
				clearTimeout(this.UID);
				this.process(FACT_PANNEL.querySelector('.process[do-upload]'), false);
				alert('Отправка прервана.');
			} else {
				const length = TEXT_AREA.textLength + form.elements['title'].value.length;
				const answer = length > 0 && confirm('Очистить форму?');
				this.purge(answer);
			}
		}
	}

	FACT_PANNEL.addEventListener('click', doSubmit);
	TEXT_AREA.addEventListener('click', ({ target }) => target.classList.remove('select-break'));
	
	window.addEventListener('keyup', () => { _ctrl_ = false });
	window.addEventListener('keydown', e => { _ctrl_ = e.ctrlKey });
	window.addEventListener('keypress', winKeyHandler);
	window.onbeforeunload = () => (
		TEXT_AREA.value != '' && form.parentNode.style['display'] != 'none'
			? 'Вы что-то напечатали в форме. Все введенные данные будут потеряны при закрытии страницы.'
			: void 0
	);
	
	const mode_change = ({ target }) => {
		MARKUP_PANEL.className = (MARKDOWN_MODE = /markdown/i.test(target.value)) ? 'markdown' : 'lorcode';
	};
	
	if ('mode' in form.elements) {
		form.elements['mode'].addEventListener('change', mode_change);
		mode_change({ target: form.elements['mode'] });
	} else {
		mode_change({
			target: form.querySelector('select[disabled]') || form.insertBefore(
				_setup('select', { style: 'display: block;', html: '<option>LORCODE</option><option>Markdown</option>' }, { change: mode_change }),
				form.firstElementChild
			)
		});
	}
}

function tagMemories(e) {
	
	e.preventDefault();
	
	if (this.disabled)
		return;
	// приостановка действий по клику на кнопку до окончания текущего запроса
	this.disabled = true;
	
	const $this = this;
	const  del  = this.classList.contains('selected');
	const fdata = new FormData;
	
	fdata.append(del ? 'del' : 'add', '');
	fdata.append('csrf'   , TOKEN);
	fdata.append('tagName', this.getAttribute('data-tag'));
	
	switch (this.id) {
	case 'tagFavAdd':
		var name = 'favorite';
		var attrs = del ? { title: 'В избранное', class: '' } : { title: 'Удалить из избранного', class: 'selected' };
		break;
	case 'tagIgnore':
		var name = 'ignore';
		var attrs = del ? { title: 'Игнорировать', class: '' } : { title: 'Перестать игнорировать', class: 'selected' };
	}
	
	sendFormData(`user-filter/${ name }-tag`, fdata).then(({ count }) => {
		_setup($this, attrs).parentNode.children[name.replace('orite', 's') +'Count'].textContent = count;
		$this.disabled = false;
	}).catch(() => {
		$this.disabled = false;
	});
}

function topicMemories(e) {
	
	e.preventDefault();
	
	if (this.disabled)
		return;
	// приостановка действий по клику на кнопку до окончания текущего запроса
	this.disabled = true;
	
	const $this = this;
	const rm_id = this.getAttribute('rm-id');
	const  name = this.id.split('_')[0];
	const watch = name === 'memories';
	const fdata = new FormData;

	fdata.append('csrf' , TOKEN);
	fdata.append('watch', watch);
	
	if (rm_id) {
		fdata.append('remove', '');
		fdata.append(  'id'  , rm_id);
	} else {
		fdata.append( 'add' , '');
		fdata.append('msgid', LOR.topic);
	}
	
	sendFormData('memories.jsp', fdata).then(data => {
		if (data.id) {
			$this.title = watch ? 'Отслеживается' : 'В избранном';
			$this.setAttribute('rm-id', data.id);
			$this.classList.add('selected');
			$this.parentNode.children[name +'_count'].textContent = data.count;
		} else {
			$this.title = watch ? 'Следить за темой' : 'Добавить в избранное';
			$this.removeAttribute('rm-id');
			$this.classList.remove('selected');
			$this.parentNode.children[name +'_count'].textContent = data;
		}
		$this.disabled = false;
	}).catch(() => {
		$this.disabled = false;
	});
}

function toggleForm(underc, parent, href) {
	const [, topic, replyto = 0 ] = href.match(/jsp\?topic=(\d+)(?:&replyto=(\d+))?$/);
	if (LOR.CommentForm.elements['replyto'].value != replyto) {
		parent.style['display'] = 'none';
	}
	if (parent.style['display'] == 'none') {
		parent.className = 'slide-down';
		parent.addEventListener('animationend', function(e, _) {
			_setup(parent, { class: _ }, { remove: { animationend: arguments.callee }});
			LOR.CommentForm.elements['msg'].focus();
		});
		underc.appendChild(parent).style['display'] = null;
		LOR.CommentForm.elements['replyto'].value = replyto;
		LOR.CommentForm.elements[ 'topic' ].value = topic;
	} else {
		parent.className = 'slide-up';
		parent.addEventListener('animationend', function(e, _) {
			_setup(parent, { class: _, style: 'display: none;'}, { remove: { animationend: arguments.callee }});
		});
	}
}

function handleReplyToBtn(btn) {
	const href  = btn.getAttribute('href');
	const $this = btn.parentNode;
	$this.innerHTML = '<a class="replyComment" href="'+ href +'">Ответить</a>\n.\n<a class="quoteComment" href="javascript:void(0)">с цитатой</a>';
	$this.addEventListener('click', e => {
		
		if (e.target.tagName === 'A') {
			e.stopPropagation();
			e.preventDefault();
			
			const parent = LOR.CommentForm.parentNode;
			const underc = $this.parentNode.parentNode.parentNode;
			
			switch (e.target.classList[0]) {
				case 'replyComment':
					toggleForm(underc, parent, href);
					break;
				case 'quoteComment':
					if (parent.parentNode != underc || parent.style.display == 'none')
						toggleForm(underc, parent, href);
					convMsgBody(
						underc.querySelector('[itemprop="articleBody"]') || underc
					);
			}
		}
	}, false);
}

function convMsgBody(msg) {
	let arg = ['>', '\n>'];
	if (!MARKDOWN_MODE) { // lorcode, line-break
		let nobl = msg.querySelector('div.code,pre,ul,ol,table');
		if (nobl && (nobl = nobl.parentNode.className != 'reply'))
			arg[0] = '[quote]', arg[1] = '[/quote]';
		arg.push(domToLORCODE(msg.childNodes, !nobl).replace(/(?:[\n]+){3,}/g, '\n\n').trim());
	} else
		arg.push(domToMarkdown(msg.childNodes)); // markdown
	
	lorcodeMarkup.apply(LOR.CommentForm.elements['msg'], arg);
}

function getRawText(el) {
	return el.textContent.replace(/^[\n\s\t]+\n|\n[\n\s\t]+$/g, '');
}

function listToLORCODE(listNodes, type) {
	
	var text = '';
	
	for (let li of listNodes) {
		switch (li.tagName) {
			case 'UL':
			case 'OL': text += listToLORCODE(li.children, li.type); break;
			case 'LI': text += '[*]'+ domToLORCODE(li.childNodes);
		}
	}
	return `[list${ type ? '='+ type : '' }]\n${ text }[/list]\n`;
}

function domToLORCODE(childNodes, nobl) {
	
	var text = '';
	
	for (let el of childNodes) {
		switch (el.tagName) {
			case 'B': case 'STRONG': text += `[b]${ domToLORCODE(el.childNodes, nobl) }[/b]`; break;
			case 'S': case 'DEL'   : text += `[s]${ domToLORCODE(el.childNodes, nobl) }[/s]`; break;
			case 'I': case 'EM'    : text += `[i]${ domToLORCODE(el.childNodes, nobl) }[/i]`; break;
			case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6':
				text += `[strong]${ getRawText(el) }[br][/strong]\n`;
				break;
			case 'A':
				let url = decodeURIComponent(el.href);
				let txt = getRawText(el);
				text += `[url${ txt !== url ? '='+ url : '' }]${ txt }[/url]`;
				break;
			case 'SPAN':
				if (el.className === 'code')
					text += `[inline]${ getRawText(el) }[/inline]`;
				else if (el.children.length && el.children[0].localName === 'img')
					text += `[user]${ el.children[1].innerText }[/user]`;
				break;
			case 'DIV':
				if (el.className === 'code') {
					let lng = el.firstElementChild.className.replace(/^.+\-(?:highlight|(.+))$/, '$1');
					text += `[code${ lng ? '='+ lng : '' }]\n${ el.innerText.replace(/[\n+]$|$/, '') }[/code]\n`;
				} else if (/^cut[0-9]+$/.test(el.id)) {
					text += '\n'+ domToLORCODE(el.childNodes, nobl); //`[cut]\n${ domToLORCODE(el.childNodes, nobl) }[/cut]\n`;
				}
				break;
			case 'UL': case 'OL':
				text += listToLORCODE(el.children, el.type);
				break;
			case 'U':
				text += `[${ el.localName }]${ domToLORCODE(el.childNodes, nobl) }[/${ el.localName }]`;
				break;
			case 'BLOCKQUOTE':
				let qtex = domToLORCODE(el.childNodes, nobl);
				let pass = nobl || (text && /\n|^/.test(text.slice(-1)));
				text += pass ? `>${ qtex.replace(/\n/g, '\n>').replace(/(?:[>]+(?:\n|$)){1,}/gm, '')}` : `[quote]${ qtex.trim() }[/quote]`;
				break;
			case 'PRE':
			case 'P':
				text += domToLORCODE(el.childNodes, nobl) + ((el.nextElementSibling || '').tagName == 'P' ? '\n' : '');
			case 'BR':
				text += '\n';
				break;
			default:
				text += getRawText(el);
		}
	}
	return text;
}

function listToMarkdown(listNodes, order) {
	
	var text = '', ln = order ? '%d. ' : '* ';
	
	for (let i = 0; i < listNodes.length;) {
		let li = listNodes[i++];
		switch (li.tagName) {
			case 'UL': text += listToMarkdown(li.children,false); break;
			case 'OL': text += listToMarkdown(li.children, true); break;
			case 'LI': text += ln.replace('%d', i) + domToMarkdown(li.childNodes);
		}
	}
	return `${ text }\n\n`;
}

function domToMarkdown(childNodes) {
	
	var text = '';
	
	for (let el of childNodes) {
		switch (el.tagName) {
			case 'B': case 'STRONG': text += `**${ domToMarkdown(el.childNodes) }**`; break;
			case 'S': case 'DEL'   : text += `~~${ domToMarkdown(el.childNodes) }~~`; break;
			case 'I': case 'EM'    : text +=  `*${ domToMarkdown(el.childNodes) }*` ; break;
			case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6':
				text += '#'.repeat(el.tagName.substring(1)) +` ${ getRawText(el) }\n\n`;
				break;
			case 'A':
				let url = decodeURIComponent(el.href);
				let txt = getRawText(el);
				text += txt !== url ? `[${ txt }](${ url })` : url;
				break;
			case 'SPAN':
				if (el.className === 'code')
					text += `\`${ getRawText(el) }\``;
				else if (el.children.length && el.children[0].localName === 'img')
					text += '@'+ el.children[1].innerText;
				break;
			case 'DIV':
				if (el.className === 'code') {
					let lng = el.firstElementChild.className.replace(/^.+\-(?:highlight|(.+))$/, '$1');
					text += '```'+ lng +'\n'+ el.innerText.replace(/[\n+]$|$/, '\n```\n');
				} else if (/^cut[0-9]+$/.test(el.id)) {
					text += domToMarkdown(el.childNodes); //`>>>\n${ domToMarkdown(el.childNodes) }\n>>>\n`;
				}
				break;
			case 'BLOCKQUOTE':
				text += '>'+ domToMarkdown(el.childNodes)
					.replace(/\n/g, '\n>')
					.replace(/([>]+(?:\n|$)){2,}/gm, '$1') +'\n';
				break;
			case 'UL': text += listToMarkdown(el.children,false); break;
			case 'OL': text += listToMarkdown(el.children, true); break;
			case 'PRE': case 'P':
				text += domToMarkdown(el.childNodes);
			case 'BR':
				text += '\n\n';
				break;
			default:
				text += getRawText(el);
		}
	}
	
	return text;
}

const App = (() => {
	
	var main_events_count, apply_set = {
		set 'Code Block Short Size' (v) {
			var length = document.createTextNode( v );
			document.getElementById('start-rws').nextElementSibling.append(
				'\n.spoiled { height: ', length, 'px!important; }'
			);
			Object.defineProperty(apply_set, 'Code Block Short Size', {
				set: function(v) { length.textContent = v.toString(); }
			});
		}
	}
	
	if (typeof chrome !== 'undefined' && chrome.runtime.id) {
		
		const port = chrome.runtime.connect(chrome.runtime.id, { name: location.href });
		const sync = new Promise((resolve, reject) => {
			
			const initSettings = items => {
				for (let name in items) {
					USER_SETTINGS[name] = apply_set[name] = items[name];
				}
				port.onMessage.removeListener(initSettings);
				resolve();
			};
			
			port.onMessage.addListener(initSettings);
			chrome.runtime.sendMessage({ action : 'l0rNG-settings' });
			chrome.storage.onChanged.addListener(items => {
				for (let name in items) {
					USER_SETTINGS[name] = apply_set[name] = items[name].newValue;
				}
			});
		});
		
		return {
			checkNow : () => chrome.runtime.sendMessage({ action: 'l0rNG-checkNow' }),
			reset    : () => chrome.runtime.sendMessage({ action: 'l0rNG-reset' }),
			init     : () => {
				if ( (main_events_count = document.getElementById('main_events_count')) ) {
					// We can't show notification from the content script directly,
					// so let's send a corresponding message to the background script
					sync.then(() => {
						port.onMessage.addListener(text => { main_events_count.textContent = text });
					});
				}
				return sync;
			}
		}
	} else {
		
		var notes      = localStorage.getItem('l0rNG-notes') || '';
		var delay      = 40e3 + Math.floor(Math.random() * 1e3);
		var sendNotify = count => new Notification('loryfy-ng', {
				icon: '//github.com/OpenA/lorify-ng/blob/master/icons/penguin-64.png?raw=true',
				body: 'Уведомлений: '+ count
			}).onclick = () => window.focus();
		
		const defaults   = Object.assign({}, USER_SETTINGS);
		const startWatch = getDataResponse.bind(null, '/notifications-count',
			({ response }) => {
				if (response != 0) {
					if (notes != response) {
						localStorage.setItem('l0rNG-notes', (notes = response));
						USER_SETTINGS['Desktop Notification'] && sendNotify(response);
					}
					main_events_count.textContent = '('+ response +')';
					lorypanel.children['lorynotify'].setAttribute('notes-cnt', response);
				} else {
					main_events_count.textContent = '';
					lorypanel.children['lorynotify'].removeAttribute('notes-cnt');
				}
				Timer.set('Check Notifications', startWatch, delay);
			});
		
		const setValues = items => {
			for (let name in USER_SETTINGS) {
				let inp = loryform.elements[name];
				inp[inp.type === 'checkbox' ? 'checked' : 'value'] = (USER_SETTINGS[name] = apply_set[name] = items[name]);
			}
		}
		
		const onValueChange = ({ target }) => {
			Timer.clear('Settings on Changed');
			switch (target.type) {
				case 'checkbox':
					USER_SETTINGS[target.id] = target.checked;
					break;
				default:
					const min = Number (target.min);
					USER_SETTINGS[target.id] = target.valueAsNumber >= min ? target.valueAsNumber : (target.value = min);
			}
			localStorage.setItem('lorify-ng', JSON.stringify(USER_SETTINGS));
			applymsg.classList.add('apply-anim');
			Timer.set('Apply Setting MSG', () => applymsg.classList.remove('apply-anim'), 2e3);
		}
		
		const loryform = _setup('form', { id: 'loryform', html: `
			<div class="tab-row">
				<span class="tab-cell">Автоподгрузка комментариев:</span>
				<span class="tab-cell" id="applymsg"><input type="checkbox" id="Realtime Loader"></span>
			</div>
			<div class="tab-row">
				<span class="tab-cell">Укорачивать блоки кода свыше:</span>
				<span class="tab-cell"><input type="number" id="Code Block Short Size" min="15" step="1">
				px
				</span>
			</div>
			<div class="tab-row">
				<span class="tab-cell">Задержка появления превью:</span>
				<span class="tab-cell"><input type="number" id="Delay Open Preview" min="50" step="25">
				мс
				</span>
			</div>
			<div class="tab-row">
				<span class="tab-cell">Задержка исчезания превью:</span>
				<span class="tab-cell"><input type="number" id="Delay Close Preview" min="50" step="25">
				мс
				</span>
			</div>
			<div class="tab-row">
				<span class="tab-cell">Предзагружаемых страниц:</span>
				<span class="tab-cell"><input type="number" id="Preloaded Pages Count" min="1" step="1">
				ст
				</span>
			</div>
			<div class="tab-row">
				<span class="tab-cell">Оповещения на рабочий стол:</span>
				<span class="tab-cell"><input type="checkbox" id="Desktop Notification">
				</span>
			</div>
			<div class="tab-row">
				<span class="tab-cell">Возвращать наверх:</span>
				<span class="tab-cell"><input type="checkbox" id="Scroll Top View">
				</span>
			</div>
			<div class="tab-row">
				<span class="tab-cell">Задержка перед отправкой:</span>
				<span class="tab-cell step-line">
					<input type="range" min="1" max="10" step="1" id="Upload Post Delay">
					<st></st><st></st><st></st><st></st><st></st><st></st><st></st><st></st><st></st><st></st>
				</span>
			</div>
			<div class="tab-row">
				<span class="tab-cell">CSS анимация:</span>
				<span class="tab-cell"><input type="checkbox" id="CSS3 Animation">
					<input type="button" id="resetSettings" value="сброс" title="вернуть настройки по умолчанию">
				</span>
			</div>`,
				onchange: onValueChange,
				oninput: e => Timer.set('Settings on Changed', () => {
					loryform.onchange = () => { loryform.onchange = onValueChange };
					onValueChange(e)
				}, 750)
			});
			
		setValues( JSON.parse(localStorage.getItem('lorify-ng')) || USER_SETTINGS );
		loryform.elements.resetSettings.onclick = () => {
			setValues( defaults );
			localStorage.setItem('lorify-ng', JSON.stringify(defaults));
			applymsg.classList.add('apply-anim');
			Timer.set('Apply Setting MSG', () => applymsg.classList.remove('apply-anim'), 2e3);
		}
		
		const applymsg  = loryform.querySelector('#applymsg');
		const lorypanel = _setup('div', { class: 'lorify-settings-panel', html: `
		<div id="lorynotify" class="lory-btn"></div>
		<div id="lorytoggle" class="lory-btn"></div>
		<style>
			#lorynotify {
				top: -4px;
				left: -2px;
				color: white;
				font: bold 16px "Open Sans";
				background-color: #3e85a8;
				border-radius: 5px;
				z-index: 1;
			}
			#lorynotify[notes-cnt]:before {
				content: attr(notes-cnt);
				padding: 0 4px;
			}
			#lorytoggle {
				left: 0;
				top: 0;
				right: 0;
				bottom: 0;
				background: url(//github.com/OpenA/lorify-ng/blob/master/icons/penguin-32.png?raw=true) center / 100%;
				opacity: .5;
			}
			#loryform {
				display: table;
				min-width: 360px;
				padding: 3px 6px;
				position: fixed;
				right: 5px;
				top: 40px;
				background: #eee;
				border-radius: 5px;
				box-shadow: -1px 2px 8px rgba(0,0,0,.3);
			}
			.lorify-settings-panel {
				position: fixed;
				top: 5px;
				right: 5px;
				padding: 16px;
			}
			.lorify-settings-panel:hover > *, .pushed { opacity: 1!important; }
			.lory-btn { position: absolute; cursor: pointer; }
			.tab-row  { display: table-row; font-size: 85%; color: #666; }
			.tab-cell { display: table-cell;
				position: relative;
				padding: 4px 2px;
				max-width: 180px;
				vertical-align: middle;
			}
			input[type="number"] {
				max-width: 50%;
				min-width: 50%;
			}
			.step-line, .step-line > input {
				width: 180px;
			}
			st:before, .step-line > input {
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
			#loginGreating { margin-right: 42px; }
			#resetSettings, .apply-anim:after { position: absolute; right: 0; }
			.apply-anim:after {
				content: 'Настройки сохранены.';
				-webkit-animation: apply 2s infinite;
				animation: apply 2s infinite;
				color: red;
			}
			@keyframes apply { 0% { opacity: .1; } 50% { opacity: 1; } 100% { opacity: 0; } }
			@-webkit-keyframes apply { 0% { opacity: .1; } 50% { opacity: 1; } 100% { opacity: 0; } }
		</style>`}, {
			click: ({ target }) => {
				if (target.classList[0] === 'lory-btn') {
					switch (target.id) {
						case 'lorynotify':
							window.open('/notifications', '_blank');
							break;
						case 'lorytoggle':
							target.classList.toggle('pushed') ? target.parentNode.after(loryform) : loryform.remove();
					}
				}
			}
		});
		// Определяем статус оповещений:
		switch (Notification.permission) {
			case 'granted': // - разрешены
				break;
			case 'denied':  // - отклонены
				sendNotify = () => void 0;
				break;
			case 'default': // - требуется подтверждение
				Notification.requestPermission(granted => {
					if (granted !== 'granted')
						sendNotify = () => void 0;
				});
		}
		window.addEventListener('storage', ({ key, newValue }) => {
			if (key === 'l0rNG-notes') {
				main_events_count.textContent = '('+ newValue +')';
				lorypanel.children['lorynotify'].setAttribute('notes-cnt', (notes = newValue));
				Timer.set('Check Notifications', startWatch, delay);
			} else if (key === 'lorify-ng') {
				setValues( JSON.parse(newValue) );
			}
		});
		return {
			checkNow: () => void 0,
			reset: () => localStorage.setItem('l0rNG-notes', (notes = '')),
			init: function() {
				if ( (main_events_count = document.getElementById('main_events_count')) ) {
					if (notes) {
						lorypanel.children['lorynotify'].setAttribute('notes-cnt', notes);
						main_events_count.textContent = '('+ notes +')';
					}
					(this.checkNow = startWatch)();
				}
				document.body.appendChild(lorypanel);
				return Promise.resolve();
			}
		}
	}
})();

function HighlightJS() {
	var hljs = this;
	function q(a) {
		return a.replace(/&/gm, "&amp;").replace(/</gm, "&lt;").replace(/>/gm, "&gt;")
	}
	function A(a) {
		for (var b = a.firstChild; b; b = b.nextSibling) {
			if (b.nodeName.toUpperCase() == "CODE") {
				return b
			}
			if (!(b.nodeType == 3 && b.nodeValue.match(/\s+/))) {
				break
			}
		}
	}
	function u(a, b) {
		return Array.prototype.map.call(a.childNodes, function(c) {
			if (c.nodeType == 3) {
				return b ? c.nodeValue.replace(/\n/g, "") : c.nodeValue
			}
			if (c.nodeName.toUpperCase() == "BR") {
				return "\n"
			}
			return u(c, b)
		}).join("")
	}
	function B(a) {
		var b = (a.className + " " + (a.parentNode ? a.parentNode.className : "")).split(/\s+/);
		b = b.map(function(d) {
			return d.replace(/^language-/, "")
		});
		for (var c = 0; c < b.length; c++) {
			if (x[b[c]] || b[c] == "no-highlight") {
				return b[c]
			}
		}
	}
	function z(a) {
		var c = [];
		(function b(f, e) {
			for (var d = f.firstChild; d; d = d.nextSibling) {
				if (d.nodeType == 3) {
					e += d.nodeValue.length
				} else {
					if (d.nodeName.toUpperCase() == "BR") {
						e += 1
					} else {
						if (d.nodeType == 1) {
							c.push({
								event: "start",
								offset: e,
								node: d
							});
							e = b(d, e);
							c.push({
								event: "stop",
								offset: e,
								node: d
							})
						}
					}
				}
			}
			return e
		})(a, 0);
		return c
	}
	function s(c, a, h) {
		var b = 0;
		var e = "";
		var k = [];
		function i() {
			if (!c.length || !a.length) {
				return c.length ? c : a
			}
			if (c[0].offset != a[0].offset) {
				return (c[0].offset < a[0].offset) ? c : a
			}
			return a[0].event == "start" ? c : a
		}
		function j(l) {
			function m(n) {
				return " " + n.nodeName + '="' + q(n.value) + '"'
			}
			e += "<" + l.nodeName.toLowerCase() + Array.prototype.map.call(l.attributes, m).join("") + ">"
		}
		function f(l) {
			e += "</" + l.nodeName.toLowerCase() + ">"
		}
		function d(l) {
			(l.event == "start" ? j : f)(l.node)
		}
		while (c.length || a.length) {
			var g = i();
			e += q(h.substr(b, g[0].offset - b));
			b = g[0].offset;
			if (g == c) {
				k.reverse().forEach(f);
				do {
					d(g.splice(0, 1)[0]);
					g = i()
				} while (g == c && g.length && g[0].offset == b);
				k.reverse().forEach(j)
			} else {
				if (g[0].event == "start") {
					k.push(g[0].node)
				} else {
					k.pop()
				}
				d(g.splice(0, 1)[0])
			}
		}
		return e + q(h.substr(b))
	}
	function w(a) {
		function d(e) {
			return (e && e.source) || e
		}
		function c(e, f) {
			return RegExp(d(e), "m" + (a.cI ? "i" : "") + (f ? "g" : ""))
		}
		function b(k, f) {
			if (k.compiled) {
				return
			}
			k.compiled = true;
			var i = [];
			if (k.k) {
				var j = {};
				function e(n, m) {
					if (a.cI) {
						m = m.toLowerCase()
					}
					m.split(" ").forEach(function(F) {
						var E = F.split("|");
						j[E[0]] = [n, E[1] ? Number(E[1]) : 1];
						i.push(E[0])
					})
				}
				k.lR = c(k.l || "\\b" + hljs.IR + "\\b(?!\\.)", true);
				if (typeof k.k == "string") {
					e("keyword", k.k)
				} else {
					for (var l in k.k) {
						if (!k.k.hasOwnProperty(l)) {
							continue
						}
						e(l, k.k[l])
					}
				}
				k.k = j
			}
			if (f) {
				if (k.bWK) {
					k.b = "\\b(" + i.join("|") + ")\\b(?!\\.)\\s*"
				}
				k.bR = c(k.b ? k.b : "\\B|\\b");
				if (!k.e && !k.eW) {
					k.e = "\\B|\\b"
				}
				if (k.e) {
					k.eR = c(k.e)
				}
				k.tE = d(k.e) || "";
				if (k.eW && f.tE) {
					k.tE += (k.e ? "|" : "") + f.tE
				}
			}
			if (k.i) {
				k.iR = c(k.i)
			}
			if (k.r === undefined) {
				k.r = 1
			}
			if (!k.c) {
				k.c = []
			}
			for (var g = 0; g < k.c.length; g++) {
				if (k.c[g] == "self") {
					k.c[g] = k
				}
				b(k.c[g], k)
			}
			if (k.starts) {
				b(k.starts, f)
			}
			var h = [];
			for (var g = 0; g < k.c.length; g++) {
				h.push(d(k.c[g].b))
			}
			if (k.tE) {
				h.push(d(k.tE))
			}
			if (k.i) {
				h.push(d(k.i))
			}
			k.t = h.length ? c(h.join("|"), true) : {
				exec: function(m) {
					return null
				}
			}
		}
		b(a)
	}
	function y(N, l, R, a) {
		function W(C, D) {
			for (var E = 0; E < D.c.length; E++) {
				var F = D.c[E].bR.exec(C);
				if (F && F.index == 0) {
					return D.c[E]
				}
			}
		}
		function P(D, C) {
			if (D.e && D.eR.test(C)) {
				return D
			}
			if (D.eW) {
				return P(D.parent, C)
			}
		}
		function O(C, D) {
			return !R && D.i && D.iR.test(C)
		}
		function f(D, C) {
			var E = j.cI ? C[0].toLowerCase() : C[0];
			return D.k.hasOwnProperty(E) && D.k[E]
		}
		function g() {
			var G = q(i);
			if (!T.k) {
				return G
			}
			var D = "";
			var C = 0;
			T.lR.lastIndex = 0;
			var F = T.lR.exec(G);
			while (F) {
				D += G.substr(C, F.index - C);
				var E = f(T, F);
				if (E) {
					k += E[1];
					D += '<span class="' + E[0] + '">' + F[0] + "</span>"
				} else {
					D += F[0]
				}
				C = T.lR.lastIndex;
				F = T.lR.exec(G)
			}
			return D + G.substr(C)
		}
		function d() {
			if (T.sL && !x[T.sL]) {
				return q(i)
			}
			var D = T.subLanguageMode == "continuous" ? T.top : undefined;
			var C = T.sL ? y(T.sL, i, true, D) : v(i);
			if (T.r > 0) {
				k += C.keyword_count;
				V += C.r
			}
			T.top = C.top;
			return '<span class="' + C.language + '">' + C.value + "</span>"
		}
		function b() {
			return T.sL !== undefined ? d() : g()
		}
		function c(D, C) {
			var E = D.cN ? '<span class="' + D.cN + '">' : "";
			if (D.rB) {
				h += E;
				i = ""
			} else {
				if (D.eB) {
					h += q(C) + E;
					i = ""
				} else {
					h += E;
					i = C
				}
			}
			T = Object.create(D, {
				parent: {
					value: T
				}
			})
		}
		function Q(G, D) {
			i += G;
			if (D === undefined) {
				h += b();
				return 0
			}
			var E = W(D, T);
			if (E) {
				h += b();
				c(E, D);
				return E.rB ? 0 : D.length
			}
			var C = P(T, D);
			if (C) {
				var F = T;
				if (!(F.rE || F.eE)) {
					i += D
				}
				h += b();
				do {
					if (T.cN) {
						h += "</span>"
					}
					V += T.r;
					T = T.parent
				} while (T != C.parent);
				if (F.eE) {
					h += q(D)
				}
				i = "";
				if (C.starts) {
					c(C.starts, "")
				}
				return F.rE ? 0 : D.length
			}
			if (O(D, T)) {
				throw new Error('Illegal lexem "' + D + '" for mode "' + (T.cN || "<unnamed>") + '"')
			}
			i += D;
			return D.length || 1
		}
		var j = x[N];
		if (!j) {
			throw new Error('Unknown language: "' + N + '"')
		}
		w(j);
		var T = a || j;
		var h = "";
		for (var n = T; n != j; n = n.parent) {
			if (n.cN) {
				h = '<span class="' + n.cN + '">' + h
			}
		}
		var i = "";
		var V = 0;
		var k = 0;
		try {
			var m, S, U = 0;
			while (true) {
				T.t.lastIndex = U;
				m = T.t.exec(l);
				if (!m) {
					break
				}
				S = Q(l.substr(U, m.index - U), m[0]);
				U = m.index + S
			}
			Q(l.substr(U));
			for (var n = T; n.parent; n = n.parent) {
				if (n.cN) {
					h += "</span>"
				}
			}
			return {
				r: V,
				keyword_count: k,
				value: h,
				language: N,
				top: T
			}
		} catch (e) {
			if (e.message.indexOf("Illegal") != -1) {
				return {
					r: 0,
					keyword_count: 0,
					value: q(l)
				}
			} else {
				throw e
			}
		}
	}
	function v(a) {
		var e = {
			keyword_count: 0,
			r: 0,
			value: q(a)
		};
		var c = e;
		for (var d in x) {
			if (!x.hasOwnProperty(d)) {
				continue
			}
			var b = y(d, a, false);
			b.language = d;
			if (b.keyword_count + b.r > c.keyword_count + c.r) {
				c = b
			}
			if (b.keyword_count + b.r > e.keyword_count + e.r) {
				c = e;
				e = b
			}
		}
		if (c.language) {
			e.second_best = c
		}
		return e
	}
	function t(a, b, c) {
		if (b) {
			a = a.replace(/^((<[^>]+>|\t)+)/gm, function(g, d, e, f) {
				return d.replace(/\t/g, b)
			})
		}
		if (c) {
			a = a.replace(/\n/g, "<br>")
		}
		return a
	}
	function p(a, g, c) {
		var f = u(a, c);
		var h = B(a);
		if (h == "no-highlight") {
			return
		}
		var e = h ? y(h, f, true) : v(f);
		h = e.language;
		var d = z(a);
		if (d.length) {
			var b = document.createElementNS("http://www.w3.org/1999/xhtml", "pre");
			b.innerHTML = e.value;
			e.value = s(d, z(b), f)
		}
		e.value = t(e.value, g, c);
		var i = a.className;
		if (!i.match("(\\s|^)(language-)?" + h + "(\\s|$)")) {
			i = i ? (i + " " + h) : h
		}
		a.innerHTML = e.value;
		a.className = i;
		a.result = {
			language: h,
			kw: e.keyword_count,
			re: e.r
		};
		if (e.second_best) {
			a.second_best = {
				language: e.second_best.language,
				kw: e.second_best.keyword_count,
				re: e.second_best.r
			}
		}
	}
	function o(parent) {
		Array.prototype.map.call(parent.getElementsByTagNameNS("http://www.w3.org/1999/xhtml", "pre"), A).filter(Boolean).forEach(function(a) {
			if (a.offsetHeight > USER_SETTINGS['Code Block Short Size']) {
				a.parentNode.parentNode.classList.add('spoiled');
				a.parentNode.parentNode.append( _setup('span', { class: 'spoiler-open', style: 'cursor: pointer;', text: 'Развернуть' }, {
					click: (e) => { e.target.textContent = e.target.parentNode.classList.toggle('spoiled') ? 'Развернуть' : 'Свернуть'; e.preventDefault(); }
				}))
			}
			p(a, hljs.tabReplace)
		})
	}
	var x = {};
	this.LANGUAGES = x;
	this.highlight = y;
	this.highlightAuto = v;
	this.fixMarkup = t;
	this.highlightBlock = p;
	this.apply = o;
	this.IR = "[a-zA-Z][a-zA-Z0-9_]*";
	this.UIR = "[a-zA-Z_][a-zA-Z0-9_]*";
	this.NR = "\\b\\d+(\\.\\d+)?";
	this.CNR = "(\\b0[xX][a-fA-F0-9]+|(\\b\\d+(\\.\\d*)?|\\.\\d+)([eE][-+]?\\d+)?)";
	this.BNR = "\\b(0b[01]+)";
	this.RSR = "!|!=|!==|%|%=|&|&&|&=|\\*|\\*=|\\+|\\+=|,|\\.|-|-=|/|/=|:|;|<<|<<=|<=|<|===|==|=|>>>=|>>=|>=|>>>|>>|>|\\?|\\[|\\{|\\(|\\^|\\^=|\\||\\|=|\\|\\||~";
	this.BE = {
		b: "\\\\[\\s\\S]",
		r: 0
	};
	this.ASM = {
		cN: "string",
		b: "'",
		e: "'",
		i: "\\n",
		c: [this.BE],
		r: 0
	};
	this.QSM = {
		cN: "string",
		b: '"',
		e: '"',
		i: "\\n",
		c: [this.BE],
		r: 0
	};
	this.CLCM = {
		cN: "comment",
		b: "//",
		e: "$"
	};
	this.CBLCLM = {
		cN: "comment",
		b: "/\\*",
		e: "\\*/"
	};
	this.HCM = {
		cN: "comment",
		b: "#",
		e: "$"
	};
	this.NM = {
		cN: "number",
		b: this.NR,
		r: 0
	};
	this.CNM = {
		cN: "number",
		b: this.CNR,
		r: 0
	};
	this.BNM = {
		cN: "number",
		b: this.BNR,
		r: 0
	};
	this.REGEXP_MODE = {
		cN: "regexp",
		b: /\//,
		e: /\/[gim]*/,
		i: /\n/,
		c: [this.BE, {
			b: /\[/,
			e: /\]/,
			r: 0,
			c: [this.BE]
		}]
	};
	this.inherit = function(b, a) {
		var d = {};
		for (var c in b) {
			d[c] = b[c]
		}
		if (a) {
			for (var c in a) {
				d[c] = a[c]
			}
		}
		return d
	}
hljs.LANGUAGES.bash=function(g){var j={cN:"variable",b:/\$[\w\d#@][\w\d_]*/};var f={cN:"variable",b:/\$\{(.*?)\}/};var h={cN:"string",b:/"/,e:/"/,c:[g.BE,j,f,{cN:"variable",b:/\$\(/,e:/\)/,c:g.BE}],r:0};var i={cN:"string",b:/'/,e:/'/,r:0};return{l:/-?[a-z]+/,k:{keyword:"if then else elif fi for break continue while in do done exit return set declare case esac export exec",literal:"true false",built_in:"printf echo read cd pwd pushd popd dirs let eval unset typeset readonly getopts source shopt caller type hash bind help sudo",operator:"-ne -eq -lt -gt -f -d -e -s -l -a"},c:[{cN:"shebang",b:/^#![^\n]+sh\s*$/,r:10},{cN:"function",b:/\w[\w\d_]*\s*\(\s*\)\s*\{/,rB:true,c:[{cN:"title",b:/\w[\w\d_]*/}],r:0},g.HCM,g.NM,h,i,j,f]}}(hljs);
hljs.LANGUAGES.clojure=function(r){var x={built_in:"def cond apply if-not if-let if not not= = &lt; < > &lt;= <= >= == + / * - rem quot neg? pos? delay? symbol? keyword? true? false? integer? empty? coll? list? set? ifn? fn? associative? sequential? sorted? counted? reversible? number? decimal? class? distinct? isa? float? rational? reduced? ratio? odd? even? char? seq? vector? string? map? nil? contains? zero? instance? not-every? not-any? libspec? -> ->> .. . inc compare do dotimes mapcat take remove take-while drop letfn drop-last take-last drop-while while intern condp case reduced cycle split-at split-with repeat replicate iterate range merge zipmap declare line-seq sort comparator sort-by dorun doall nthnext nthrest partition eval doseq await await-for let agent atom send send-off release-pending-sends add-watch mapv filterv remove-watch agent-error restart-agent set-error-handler error-handler set-error-mode! error-mode shutdown-agents quote var fn loop recur throw try monitor-enter monitor-exit defmacro defn defn- macroexpand macroexpand-1 for doseq dosync dotimes and or when when-not when-let comp juxt partial sequence memoize constantly complement identity assert peek pop doto proxy defstruct first rest cons defprotocol cast coll deftype defrecord last butlast sigs reify second ffirst fnext nfirst nnext defmulti defmethod meta with-meta ns in-ns create-ns import intern refer keys select-keys vals key val rseq name namespace promise into transient persistent! conj! assoc! dissoc! pop! disj! import use class type num float double short byte boolean bigint biginteger bigdec print-method print-dup throw-if throw printf format load compile get-in update-in pr pr-on newline flush read slurp read-line subvec with-open memfn time ns assert re-find re-groups rand-int rand mod locking assert-valid-fdecl alias namespace resolve ref deref refset swap! reset! set-validator! compare-and-set! alter-meta! reset-meta! commute get-validator alter ref-set ref-history-count ref-min-history ref-max-history ensure sync io! new next conj set! memfn to-array future future-call into-array aset gen-class reduce merge map filter find empty hash-map hash-set sorted-map sorted-map-by sorted-set sorted-set-by vec vector seq flatten reverse assoc dissoc list disj get union difference intersection extend extend-type extend-protocol int nth delay count concat chunk chunk-buffer chunk-append chunk-first chunk-rest max min dec unchecked-inc-int unchecked-inc unchecked-dec-inc unchecked-dec unchecked-negate unchecked-add-int unchecked-add unchecked-subtract-int unchecked-subtract chunk-next chunk-cons chunked-seq? prn vary-meta lazy-seq spread list* str find-keyword keyword symbol gensym force rationalize"};var w="[a-zA-Z_0-9\\!\\.\\?\\-\\+\\*\\/\\<\\=\\>\\&\\#\\$';]+";var B="[\\s:\\(\\{]+\\d+(\\.\\d+)?";var y={cN:"number",b:B,r:0};var s={cN:"string",b:'"',e:'"',c:[r.BE],r:0};var k={cN:"comment",b:";",e:"$",r:0};var p={cN:"collection",b:"[\\[\\{]",e:"[\\]\\}]"};var z={cN:"comment",b:"\\^"+w};var A={cN:"comment",b:"\\^\\{",e:"\\}"};var u={cN:"attribute",b:"[:]"+w};var q={cN:"list",b:"\\(",e:"\\)"};var v={eW:true,k:{literal:"true false nil"},r:0};var t={k:x,l:w,cN:"title",b:w,starts:v};q.c=[{cN:"comment",b:"comment"},t,v];v.c=[q,s,z,A,k,u,p,y];p.c=[q,s,z,k,u,p,y];return{i:/\S/,c:[k,q]}}(hljs);
hljs.LANGUAGES.cmake=function(b){return{cI:true,k:{keyword:"add_custom_command add_custom_target add_definitions add_dependencies add_executable add_library add_subdirectory add_test aux_source_directory break build_command cmake_minimum_required cmake_policy configure_file create_test_sourcelist define_property else elseif enable_language enable_testing endforeach endfunction endif endmacro endwhile execute_process export find_file find_library find_package find_path find_program fltk_wrap_ui foreach function get_cmake_property get_directory_property get_filename_component get_property get_source_file_property get_target_property get_test_property if include include_directories include_external_msproject include_regular_expression install link_directories load_cache load_command macro mark_as_advanced message option output_required_files project qt_wrap_cpp qt_wrap_ui remove_definitions return separate_arguments set set_directory_properties set_property set_source_files_properties set_target_properties set_tests_properties site_name source_group string target_link_libraries try_compile try_run unset variable_watch while build_name exec_program export_library_dependencies install_files install_programs install_targets link_libraries make_directory remove subdir_depends subdirs use_mangled_mesa utility_source variable_requires write_file qt5_use_modules qt5_use_package qt5_wrap_cpp on off true false and or",operator:"equal less greater strless strgreater strequal matches"},c:[{cN:"envvar",b:"\\${",e:"}"},b.HCM,b.QSM,b.NM]}}(hljs);
hljs.LANGUAGES.coffeescript=function(l){var g={keyword:"in if for while finally new do return else break catch instanceof throw try this switch continue typeof delete debugger super then unless until loop of by when and or is isnt not",literal:"true false null undefined yes no on off",reserved:"case default function var void with const let enum export import native __hasProp __extends __slice __bind __indexOf",built_in:"npm require console print module exports global window document"};var h="[A-Za-z$_][0-9A-Za-z$_]*";var i={cN:"title",b:h};var j={cN:"subst",b:"#\\{",e:"}",k:g,};var k=[l.BNM,l.inherit(l.CNM,{starts:{e:"(\\s*/)?",r:0}}),{cN:"string",b:"'''",e:"'''",c:[l.BE]},{cN:"string",b:"'",e:"'",c:[l.BE],r:0},{cN:"string",b:'"""',e:'"""',c:[l.BE,j]},{cN:"string",b:'"',e:'"',c:[l.BE,j],r:0},{cN:"regexp",b:"///",e:"///",c:[l.HCM]},{cN:"regexp",b:"//[gim]*",r:0},{cN:"regexp",b:"/\\S(\\\\.|[^\\n])*?/[gim]*(?=\\s|\\W|$)"},{cN:"property",b:"@"+h},{b:"`",e:"`",eB:true,eE:true,sL:"javascript"}];j.c=k;return{k:g,c:k.concat([{cN:"comment",b:"###",e:"###"},l.HCM,{cN:"function",b:"("+h+"\\s*=\\s*)?(\\(.*\\))?\\s*[-=]>",e:"[-=]>",rB:true,c:[i,{cN:"params",b:"\\(",rB:true,c:[{b:/\(/,e:/\)/,k:g,c:["self"].concat(k)}]}]},{cN:"class",bWK:true,k:"class",e:"$",i:"[:\\[\\]]",c:[{bWK:true,k:"extends",eW:true,i:":",c:[i]},i]},{cN:"attribute",b:h+":",e:":",rB:true,eE:true}])}}(hljs);
hljs.LANGUAGES.cpp=function(d){var c={keyword:"false int float while private char catch export virtual operator sizeof dynamic_cast|10 typedef const_cast|10 const struct for static_cast|10 union namespace unsigned long throw volatile static protected bool template mutable if public friend do return goto auto void enum else break new extern using true class asm case typeid short reinterpret_cast|10 default double register explicit signed typename try this switch continue wchar_t inline delete alignof char16_t char32_t constexpr decltype noexcept nullptr static_assert thread_local restrict _Bool complex",built_in:"std string cin cout cerr clog stringstream istringstream ostringstream auto_ptr deque list queue stack vector map set bitset multiset multimap unordered_set unordered_map unordered_multiset unordered_multimap array shared_ptr"};return{k:c,i:"</",c:[d.CLCM,d.CBLCLM,d.QSM,{cN:"string",b:"'\\\\?.",e:"'",i:"."},{cN:"number",b:"\\b(\\d+(\\.\\d*)?|\\.\\d+)(u|U|l|L|ul|UL|f|F)"},d.CNM,{cN:"preprocessor",b:"#",e:"$",c:[{b:"<",e:">",i:"\\n"},d.CLCM]},{cN:"stl_container",b:"\\b(deque|list|queue|stack|vector|map|set|bitset|multiset|multimap|unordered_map|unordered_set|unordered_multiset|unordered_multimap|array)\\s*<",e:">",k:c,r:10,c:["self"]}]}}(hljs);
hljs.LANGUAGES.cs=function(b){return{k:"abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual volatile void while async await ascending descending from get group into join let orderby partial select set value var where yield",c:[{cN:"comment",b:"///",e:"$",rB:true,c:[{cN:"xmlDocTag",b:"///|<!--|-->"},{cN:"xmlDocTag",b:"</?",e:">"}]},b.CLCM,b.CBLCLM,{cN:"preprocessor",b:"#",e:"$",k:"if else elif endif define undef warning error line region endregion pragma checksum"},{cN:"string",b:'@"',e:'"',c:[{b:'""'}]},b.ASM,b.QSM,b.CNM]}}(hljs);
hljs.LANGUAGES.css=function(e){var d="[a-zA-Z-][a-zA-Z0-9_-]*";var f={cN:"function",b:d+"\\(",e:"\\)",c:["self",e.NM,e.ASM,e.QSM]};return{cI:true,i:"[=/|']",c:[e.CBLCLM,{cN:"id",b:"\\#[A-Za-z0-9_-]+"},{cN:"class",b:"\\.[A-Za-z0-9_-]+",r:0},{cN:"attr_selector",b:"\\[",e:"\\]",i:"$"},{cN:"pseudo",b:":(:)?[a-zA-Z0-9\\_\\-\\+\\(\\)\\\"\\']+"},{cN:"at_rule",b:"@(font-face|page)",l:"[a-z-]+",k:"font-face page"},{cN:"at_rule",b:"@",e:"[{;]",c:[{cN:"keyword",b:/\S+/},{b:/\s/,eW:true,eE:true,r:0,c:[f,e.ASM,e.QSM,e.NM]}]},{cN:"tag",b:d,r:0},{cN:"rules",b:"{",e:"}",i:"[^\\s]",r:0,c:[e.CBLCLM,{cN:"rule",b:"[^\\s]",rB:true,e:";",eW:true,c:[{cN:"attribute",b:"[A-Z\\_\\.\\-]+",e:":",eE:true,i:"[^\\s]",starts:{cN:"value",eW:true,eE:true,c:[f,e.NM,e.QSM,e.ASM,e.CBLCLM,{cN:"hexcolor",b:"#[0-9A-Fa-f]+"},{cN:"important",b:"!important"}]}}]}]}]}}(hljs);
hljs.LANGUAGES.d=function(C){var Y={keyword:"abstract alias align asm assert auto body break byte case cast catch class const continue debug default delete deprecated do else enum export extern final finally for foreach foreach_reverse|10 goto if immutable import in inout int interface invariant is lazy macro mixin module new nothrow out override package pragma private protected public pure ref return scope shared static struct super switch synchronized template this throw try typedef typeid typeof union unittest version void volatile while with __FILE__ __LINE__ __gshared|10 __thread __traits __DATE__ __EOF__ __TIME__ __TIMESTAMP__ __VENDOR__ __VERSION__",built_in:"bool cdouble cent cfloat char creal dchar delegate double dstring float function idouble ifloat ireal long real short string ubyte ucent uint ulong ushort wchar wstring",literal:"false null true"};var X="(0|[1-9][\\d_]*)",J="(0|[1-9][\\d_]*|\\d[\\d_]*|[\\d_]+?\\d)",S="0[bB][01_]+",E="([\\da-fA-F][\\da-fA-F_]*|_[\\da-fA-F][\\da-fA-F_]*)",B="0[xX]"+E,K="([eE][+-]?"+J+")",L="("+J+"(\\.\\d*|"+K+")|\\d+\\."+J+J+"|\\."+X+K+"?)",P="(0[xX]("+E+"\\."+E+"|\\.?"+E+")[pP][+-]?"+J+")",O="("+X+"|"+S+"|"+B+")",M="("+P+"|"+L+")";var A="\\\\(['\"\\?\\\\abfnrtv]|u[\\dA-Fa-f]{4}|[0-7]{1,3}|x[\\dA-Fa-f]{2}|U[\\dA-Fa-f]{8})|&[a-zA-Z\\d]{2,};";var N={cN:"number",b:"\\b"+O+"(L|u|U|Lu|LU|uL|UL)?",r:0};var Q={cN:"number",b:"\\b("+M+"([fF]|L|i|[fF]i|Li)?|"+O+"(i|[fF]i|Li))",r:0};var H={cN:"string",b:"'("+A+"|.)",e:"'",i:"."};var I={b:A,r:0};var D={cN:"string",b:'"',c:[I],e:'"[cwd]?',r:0};var U={cN:"string",b:'[rq]"',e:'"[cwd]?',r:5};var F={cN:"string",b:"`",e:"`[cwd]?"};var R={cN:"string",b:'x"[\\da-fA-F\\s\\n\\r]*"[cwd]?',r:10};var G={cN:"string",b:'q"\\{',e:'\\}"'};var V={cN:"shebang",b:"^#!",e:"$",r:5};var T={cN:"preprocessor",b:"#(line)",e:"$",r:5};var W={cN:"keyword",b:"@[a-zA-Z_][a-zA-Z_\\d]*"};var Z={cN:"comment",b:"\\/\\+",c:["self"],e:"\\+\\/",r:10};return{l:C.UIR,k:Y,c:[C.CLCM,C.CBLCLM,Z,R,D,U,F,G,Q,N,H,V,T,W]}}(hljs);
hljs.LANGUAGES.delphi=function(i){var m="and safecall cdecl then string exports library not pascal set virtual file in array label packed end. index while const raise for to implementation with except overload destructor downto finally program exit unit inherited override if type until function do begin repeat goto nil far initialization object else var uses external resourcestring interface end finalization class asm mod case on shr shl of register xorwrite threadvar try record near stored constructor stdcall inline div out or procedure";var n="safecall stdcall pascal stored const implementation finalization except to finally program inherited override then exports string read not mod shr try div shl set library message packed index for near overload label downto exit public goto interface asm on of constructor or private array unit raise destructor var type until function else external with case default record while protected property procedure published and cdecl do threadvar file in if end virtual write far out begin repeat nil initialization object uses resourcestring class register xorwrite inline static";var j={cN:"comment",b:"{",e:"}",r:0};var l={cN:"comment",b:"\\(\\*",e:"\\*\\)",r:10};var p={cN:"string",b:"'",e:"'",c:[{b:"''"}],r:0};var o={cN:"string",b:"(#\\d+)+"};var k={cN:"function",bWK:true,e:"[:;]",k:"function constructor|10 destructor|10 procedure|10",c:[{cN:"title",b:i.IR},{cN:"params",b:"\\(",e:"\\)",k:m,c:[p,o]},j,l]};return{cI:true,k:m,i:'("|\\$[G-Zg-z]|\\/\\*|</)',c:[j,l,i.CLCM,p,o,i.NM,k,{cN:"class",b:"=\\bclass\\b",e:"end;",k:n,c:[p,o,j,l,i.CLCM,k]}]}}(hljs);
hljs.LANGUAGES.diff=function(b){return{c:[{cN:"chunk",b:"^\\@\\@ +\\-\\d+,\\d+ +\\+\\d+,\\d+ +\\@\\@$",r:10},{cN:"chunk",b:"^\\*\\*\\* +\\d+,\\d+ +\\*\\*\\*\\*$",r:10},{cN:"chunk",b:"^\\-\\-\\- +\\d+,\\d+ +\\-\\-\\-\\-$",r:10},{cN:"header",b:"Index: ",e:"$"},{cN:"header",b:"=====",e:"=====$"},{cN:"header",b:"^\\-\\-\\-",e:"$"},{cN:"header",b:"^\\*{3} ",e:"$"},{cN:"header",b:"^\\+\\+\\+",e:"$"},{cN:"header",b:"\\*{5}",e:"\\*{5}$"},{cN:"addition",b:"^\\+",e:"$"},{cN:"deletion",b:"^\\-",e:"$"},{cN:"change",b:"^\\!",e:"$"}]}}(hljs);
hljs.LANGUAGES.erlang=function(v){var B="[a-z'][a-zA-Z0-9_']*";var p="("+B+":"+B+"|"+B+")";var y={keyword:"after and andalso|10 band begin bnot bor bsl bzr bxor case catch cond div end fun let not of orelse|10 query receive rem try when xor",literal:"false true"};var s={cN:"comment",b:"%",e:"$",r:0};var z={cN:"number",b:"\\b(\\d+#[a-fA-F0-9]+|\\d+(\\.\\d+)?([eE][-+]?\\d+)?)",r:0};var x={b:"fun\\s+"+B+"/\\d+"};var q={b:p+"\\(",e:"\\)",rB:true,r:0,c:[{cN:"function_name",b:p,r:0},{b:"\\(",e:"\\)",eW:true,rE:true,r:0}]};var w={cN:"tuple",b:"{",e:"}",r:0};var D={cN:"variable",b:"\\b_([A-Z][A-Za-z0-9_]*)?",r:0};var r={cN:"variable",b:"[A-Z][a-zA-Z0-9_]*",r:0};var C={b:"#"+v.UIR,r:0,rB:true,c:[{cN:"record_name",b:"#"+v.UIR,r:0},{b:"{",e:"}",r:0}]};var t={k:y,b:"(fun|receive|if|try|case)",e:"end"};t.c=[s,x,v.inherit(v.ASM,{cN:""}),t,q,v.QSM,z,w,D,r,C];var u=[s,x,t,q,v.QSM,z,w,D,r,C];q.c[1].c=u;w.c=u;C.c[1].c=u;var A={cN:"params",b:"\\(",e:"\\)",c:u};return{k:y,i:"(</|\\*=|\\+=|-=|/=|/\\*|\\*/|\\(\\*|\\*\\))",c:[{cN:"function",b:"^"+B+"\\s*\\(",e:"->",rB:true,i:"\\(|#|//|/\\*|\\\\|:",c:[A,{cN:"title",b:B}],starts:{e:";|\\.",k:y,c:u}},s,{cN:"pp",b:"^-",e:"\\.",r:0,eE:true,rB:true,l:"-"+v.IR,k:"-module -record -undef -export -ifdef -ifndef -author -copyright -doc -vsn -import -include -include_lib -compile -define -else -endif -file -behaviour -behavior",c:[A]},z,v.QSM,C,D,r,w]}}(hljs);
hljs.LANGUAGES.fsharp=function(b){return{k:"abstract and as assert base begin class default delegate do done downcast downto elif else end exception extern false finally for fun function global if in inherit inline interface internal lazy let match member module mutable namespace new null of open or override private public rec return sig static struct then to true try type upcast use val void when while with yield",c:[{cN:"string",b:'@"',e:'"',c:[{b:'""'}]},{cN:"string",b:'"""',e:'"""'},{cN:"comment",b:"\\(\\*",e:"\\*\\)"},{cN:"class",bWK:true,e:"\\(|=|$",k:"type",c:[{cN:"title",b:b.UIR}]},{cN:"annotation",b:"\\[<",e:">\\]"},{cN:"attribute",b:"\\B('[A-Za-z])\\b",c:[b.BE]},b.CLCM,b.inherit(b.QSM,{i:null}),b.CNM]}}(hljs);
hljs.LANGUAGES.go=function(d){var c={keyword:"break default func interface select case map struct chan else goto package switch const fallthrough if range type continue for import return var go defer",constant:"true false iota nil",typename:"bool byte complex64 complex128 float32 float64 int8 int16 int32 int64 string uint8 uint16 uint32 uint64 int uint uintptr rune",built_in:"append cap close complex copy imag len make new panic print println real recover delete"};return{k:c,i:"</",c:[d.CLCM,d.CBLCLM,d.QSM,{cN:"string",b:"'",e:"[^\\\\]'",r:0},{cN:"string",b:"`",e:"`"},{cN:"number",b:"[^a-zA-Z_0-9](\\-|\\+)?\\d+(\\.\\d+|\\/\\d+)?((d|e|f|l|s)(\\+|\\-)?\\d+)?",r:0},d.CNM]}}(hljs);
hljs.LANGUAGES.haskell=function(m){var k={cN:"comment",b:"--",e:"$"};var l={cN:"comment",c:["self"],b:"{-",e:"-}"};var n={cN:"pragma",b:"{-#",e:"#-}"};var i={cN:"preprocessor",b:"^#",e:"$"};var o={cN:"type",b:"\\b[A-Z][\\w']*",r:0};var p={cN:"container",b:"\\(",e:"\\)",i:'"',c:[n,k,l,i,{cN:"type",b:"\\b[A-Z][\\w]*(\\((\\.\\.|,|\\w+)\\))?"},{cN:"title",b:"[_a-z][\\w']*"}]};var j={cN:"container",b:"{",e:"}",c:p.c};return{k:"let in if then else case of where do module import hiding qualified type data newtype deriving class instance as default infix infixl infixr foreign export ccall stdcall cplusplus jvm dotnet safe unsafe family forall mdo proc rec",c:[{cN:"module",b:"\\bmodule ",e:"where",k:"module where",c:[p,l],i:"\\W\\.|;"},{cN:"import",b:"\\bimport ",e:"$",k:"import qualified as hiding",c:[p,k,l],i:"\\W\\.|;"},{cN:"class",b:"\\b(class |instance )",e:"where",k:"class family instance where",c:[o,p,l]},{cN:"typedef",b:"\\b(data |(new)?type )",e:"$",k:"data family type newtype deriving",c:[n,k,l,o,p,j]},{cN:"default",b:"\\bdefault ",e:"$",k:"default",c:[o,p,k,l]},{cN:"infix",b:"\\b(infix |infixl |infixr )",e:"$",k:"infix infixl infixr",c:[m.CNM,k,l]},{cN:"foreign",b:"\\bforeign ",e:"$",k:"foreign import export ccall stdcall cplusplus jvm dotnet safe unsafe",c:[o,m.QSM,k,l]},{cN:"shebang",b:"#!\\/usr\\/bin\\/env runhaskell",e:"$"},n,k,l,i,m.QSM,m.CNM,o,{cN:"title",b:"^[_a-z][\\w']*"},{b:"->|<-"}]}}(hljs);
hljs.LANGUAGES.ini=function(b){return{cI:true,i:"[^\\s]",c:[{cN:"comment",b:";",e:"$"},{cN:"title",b:"^\\[",e:"\\]"},{cN:"setting",b:"^[a-z0-9\\[\\]_-]+[ \\t]*=[ \\t]*",e:"$",c:[{cN:"value",eW:true,k:"on off true false yes no",c:[b.QSM,b.NM],r:0}]}]}}(hljs);
hljs.LANGUAGES.java=function(b){return{k:"false synchronized int abstract float private char boolean static null if const for true while long throw strictfp finally protected import native final return void enum else break transient new catch instanceof byte super volatile case assert short package default double public try this switch continue throws",c:[{cN:"javadoc",b:"/\\*\\*",e:"\\*/",c:[{cN:"javadoctag",b:"(^|\\s)@[A-Za-z]+"}],r:10},b.CLCM,b.CBLCLM,b.ASM,b.QSM,{cN:"class",bWK:true,e:"{",k:"class interface",eE:true,i:":",c:[{bWK:true,k:"extends implements",r:10},{cN:"title",b:b.UIR}]},b.CNM,{cN:"annotation",b:"@[A-Za-z]+"}]}}(hljs);
hljs.LANGUAGES.javascript=function(b){return{k:{keyword:"in if for while finally var new function do return void else break catch instanceof with throw case default try this switch continue typeof delete let yield const",literal:"true false null undefined NaN Infinity"},c:[b.ASM,b.QSM,b.CLCM,b.CBLCLM,b.CNM,{b:"("+b.RSR+"|\\b(case|return|throw)\\b)\\s*",k:"return throw case",c:[b.CLCM,b.CBLCLM,b.REGEXP_MODE,{b:/</,e:/>;/,sL:"xml"}],r:0},{cN:"function",bWK:true,e:/{/,k:"function",c:[{cN:"title",b:/[A-Za-z$_][0-9A-Za-z$_]*/},{cN:"params",b:/\(/,e:/\)/,c:[b.CLCM,b.CBLCLM],i:/["'\(]/}],i:/\[|%/}]}}(hljs);
hljs.LANGUAGES.lisp=function(v){var s="[a-zA-Z_\\-\\+\\*\\/\\<\\=\\>\\&\\#][a-zA-Z0-9_\\-\\+\\*\\/\\<\\=\\>\\&\\#!]*";var r="(\\-|\\+)?\\d+(\\.\\d+|\\/\\d+)?((d|e|f|l|s)(\\+|\\-)?\\d+)?";var t={cN:"shebang",b:"^#!",e:"$"};var D={cN:"literal",b:"\\b(t{1}|nil)\\b"};var A=[{cN:"number",b:r,r:0},{cN:"number",b:"#b[0-1]+(/[0-1]+)?"},{cN:"number",b:"#o[0-7]+(/[0-7]+)?"},{cN:"number",b:"#x[0-9a-f]+(/[0-9a-f]+)?"},{cN:"number",b:"#c\\("+r+" +"+r,e:"\\)"}];var w={cN:"string",b:'"',e:'"',c:[v.BE],r:0};var q={cN:"comment",b:";",e:"$"};var x={cN:"variable",b:"\\*",e:"\\*"};var p={cN:"keyword",b:"[:&]"+s};var C={b:"\\(",e:"\\)",c:["self",D,w].concat(A)};var z={cN:"quoted",b:"['`]\\(",e:"\\)",c:A.concat([w,x,p,C])};var B={cN:"quoted",b:"\\(quote ",e:"\\)",k:{title:"quote"},c:A.concat([w,x,p,C])};var u={cN:"list",b:"\\(",e:"\\)"};var y={eW:true,r:0};u.c=[{cN:"title",b:s},y];y.c=[z,B,u,D].concat(A).concat([w,q,x,p]);return{i:/\S/,c:A.concat([t,D,w,q,z,B,u])}}(hljs);
hljs.LANGUAGES.lua=function(f){var g="\\[=*\\[";var h="\\]=*\\]";var j={b:g,e:h,c:["self"]};var i=[{cN:"comment",b:"--(?!"+g+")",e:"$"},{cN:"comment",b:"--"+g,e:h,c:[j],r:10}];return{l:f.UIR,k:{keyword:"and break do else elseif end false for if in local nil not or repeat return then true until while",built_in:"_G _VERSION assert collectgarbage dofile error getfenv getmetatable ipairs load loadfile loadstring module next pairs pcall print rawequal rawget rawset require select setfenv setmetatable tonumber tostring type unpack xpcall coroutine debug io math os package string table"},c:i.concat([{cN:"function",bWK:true,e:"\\)",k:"function",c:[{cN:"title",b:"([_a-zA-Z]\\w*\\.)*([_a-zA-Z]\\w*:)?[_a-zA-Z]\\w*"},{cN:"params",b:"\\(",eW:true,c:i}].concat(i)},f.CNM,f.ASM,f.QSM,{cN:"string",b:g,e:h,c:[j],r:10}])}}(hljs);
hljs.LANGUAGES.objectivec=function(d){var c={keyword:"int float while private char catch export sizeof typedef const struct for union unsigned long volatile static protected bool mutable if public do return goto void enum else break extern asm case short default double throw register explicit signed typename try this switch continue wchar_t inline readonly assign property self synchronized end synthesize id optional required nonatomic super unichar finally dynamic IBOutlet IBAction selector strong weak readonly",literal:"false true FALSE TRUE nil YES NO NULL",built_in:"NSString NSDictionary CGRect CGPoint UIButton UILabel UITextView UIWebView MKMapView UISegmentedControl NSObject UITableViewDelegate UITableViewDataSource NSThread UIActivityIndicator UITabbar UIToolBar UIBarButtonItem UIImageView NSAutoreleasePool UITableView BOOL NSInteger CGFloat NSException NSLog NSMutableString NSMutableArray NSMutableDictionary NSURL NSIndexPath CGSize UITableViewCell UIView UIViewController UINavigationBar UINavigationController UITabBarController UIPopoverController UIPopoverControllerDelegate UIImage NSNumber UISearchBar NSFetchedResultsController NSFetchedResultsChangeType UIScrollView UIScrollViewDelegate UIEdgeInsets UIColor UIFont UIApplication NSNotFound NSNotificationCenter NSNotification UILocalNotification NSBundle NSFileManager NSTimeInterval NSDate NSCalendar NSUserDefaults UIWindow NSRange NSArray NSError NSURLRequest NSURLConnection UIInterfaceOrientation MPMoviePlayerController dispatch_once_t dispatch_queue_t dispatch_sync dispatch_async dispatch_once"};return{k:c,i:"</",c:[d.CLCM,d.CBLCLM,d.CNM,d.QSM,{cN:"string",b:"'",e:"[^\\\\]'",i:"[^\\\\][^']"},{cN:"preprocessor",b:"#import",e:"$",c:[{cN:"title",b:'"',e:'"'},{cN:"title",b:"<",e:">"}]},{cN:"preprocessor",b:"#",e:"$"},{cN:"class",bWK:true,e:"({|$)",k:"interface class protocol implementation",c:[{cN:"id",b:d.UIR}]},{cN:"variable",b:"\\."+d.UIR,r:0}]}}(hljs);
hljs.LANGUAGES.perl=function(n){var r="getpwent getservent quotemeta msgrcv scalar kill dbmclose undef lc ma syswrite tr send umask sysopen shmwrite vec qx utime local oct semctl localtime readpipe do return format read sprintf dbmopen pop getpgrp not getpwnam rewinddir qqfileno qw endprotoent wait sethostent bless s|0 opendir continue each sleep endgrent shutdown dump chomp connect getsockname die socketpair close flock exists index shmgetsub for endpwent redo lstat msgctl setpgrp abs exit select print ref gethostbyaddr unshift fcntl syscall goto getnetbyaddr join gmtime symlink semget splice x|0 getpeername recv log setsockopt cos last reverse gethostbyname getgrnam study formline endhostent times chop length gethostent getnetent pack getprotoent getservbyname rand mkdir pos chmod y|0 substr endnetent printf next open msgsnd readdir use unlink getsockopt getpriority rindex wantarray hex system getservbyport endservent int chr untie rmdir prototype tell listen fork shmread ucfirst setprotoent else sysseek link getgrgid shmctl waitpid unpack getnetbyname reset chdir grep split require caller lcfirst until warn while values shift telldir getpwuid my getprotobynumber delete and sort uc defined srand accept package seekdir getprotobyname semop our rename seek if q|0 chroot sysread setpwent no crypt getc chown sqrt write setnetent setpriority foreach tie sin msgget map stat getlogin unless elsif truncate exec keys glob tied closedirioctl socket readlink eval xor readline binmode setservent eof ord bind alarm pipe atan2 getgrent exp time push setgrent gt lt or ne m|0 break given say state when";var o={cN:"subst",b:"[$@]\\{",e:"\\}",k:r,r:10};var q={cN:"variable",b:"\\$\\d"};var j={cN:"variable",b:"[\\$\\%\\@\\*](\\^\\w\\b|#\\w+(\\:\\:\\w+)*|[^\\s\\w{]|{\\w+}|\\w+(\\:\\:\\w*)*)"};var m=[n.BE,o,q,j];var k={b:"->",c:[{b:n.IR},{b:"{",e:"}"}]};var l={cN:"comment",b:"^(__END__|__DATA__)",e:"\\n$",r:5};var p=[q,j,n.HCM,l,{cN:"comment",b:"^\\=\\w",e:"\\=cut",eW:true},k,{cN:"string",b:"q[qwxr]?\\s*\\(",e:"\\)",c:m,r:5},{cN:"string",b:"q[qwxr]?\\s*\\[",e:"\\]",c:m,r:5},{cN:"string",b:"q[qwxr]?\\s*\\{",e:"\\}",c:m,r:5},{cN:"string",b:"q[qwxr]?\\s*\\|",e:"\\|",c:m,r:5},{cN:"string",b:"q[qwxr]?\\s*\\<",e:"\\>",c:m,r:5},{cN:"string",b:"qw\\s+q",e:"q",c:m,r:5},{cN:"string",b:"'",e:"'",c:[n.BE],r:0},{cN:"string",b:'"',e:'"',c:m,r:0},{cN:"string",b:"`",e:"`",c:[n.BE]},{cN:"string",b:"{\\w+}",r:0},{cN:"string",b:"-?\\w+\\s*\\=\\>",r:0},{cN:"number",b:"(\\b0[0-7_]+)|(\\b0x[0-9a-fA-F_]+)|(\\b[1-9][0-9_]*(\\.[0-9_]+)?)|[0_]\\b",r:0},{b:"("+n.RSR+"|\\b(split|return|print|reverse|grep)\\b)\\s*",k:"split return print reverse grep",r:0,c:[n.HCM,l,{cN:"regexp",b:"(s|tr|y)/(\\\\.|[^/])*/(\\\\.|[^/])*/[a-z]*",r:10},{cN:"regexp",b:"(m|qr)?/",e:"/[a-z]*",c:[n.BE],r:0}]},{cN:"sub",bWK:true,e:"(\\s*\\(.*?\\))?[;{]",k:"sub",r:5},{cN:"operator",b:"-\\w\\b",r:0}];o.c=p;k.c[1].c=p;return{k:r,c:p}}(hljs);
hljs.LANGUAGES.php=function(g){var h={cN:"variable",b:"\\$+[a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*"};var f=[g.inherit(g.ASM,{i:null}),g.inherit(g.QSM,{i:null}),{cN:"string",b:'b"',e:'"',c:[g.BE]},{cN:"string",b:"b'",e:"'",c:[g.BE]}];var j=[g.BNM,g.CNM];var i={cN:"title",b:g.UIR};return{cI:true,l:g.UIR,k:"and include_once list abstract global private echo interface as static endswitch array null if endwhile or const for endforeach self var while isset public protected exit foreach throw elseif include __FILE__ empty require_once do xor return implements parent clone use __CLASS__ __LINE__ else break print eval new catch __METHOD__ case exception default die require __FUNCTION__ enddeclare final try this switch continue endfor endif declare unset true false namespace trait goto instanceof insteadof __DIR__ __NAMESPACE__ yield finally",c:[g.CLCM,g.HCM,{cN:"comment",b:"/\\*",e:"\\*/",c:[{cN:"phpdoc",b:"\\s@[A-Za-z]+"}]},{cN:"comment",b:"__halt_compiler.+?;",eW:true,k:"__halt_compiler",l:g.UIR},{cN:"string",b:"<<<['\"]?\\w+['\"]?$",e:"^\\w+;",c:[g.BE]},{cN:"preprocessor",b:"<\\?php",r:10},{cN:"preprocessor",b:"\\?>"},h,{cN:"function",bWK:true,e:"{",k:"function",i:"\\$|\\[|%",c:[i,{cN:"params",b:"\\(",e:"\\)",c:["self",h,g.CBLCLM].concat(f).concat(j)}]},{cN:"class",bWK:true,e:"{",k:"class",i:"[:\\(\\$]",c:[{bWK:true,eW:true,k:"extends",c:[i]},i]},{b:"=>"}].concat(f).concat(j)}}(hljs);
hljs.LANGUAGES.python=function(h){var i={cN:"prompt",b:/^(>>>|\.\.\.) /};var l=[{cN:"string",b:/(u|b)?r?'''/,e:/'''/,c:[i],r:10},{cN:"string",b:/(u|b)?r?"""/,e:/"""/,c:[i],r:10},{cN:"string",b:/(u|r|ur)'/,e:/'/,c:[h.BE],r:10},{cN:"string",b:/(u|r|ur)"/,e:/"/,c:[h.BE],r:10},{cN:"string",b:/(b|br)'/,e:/'/,c:[h.BE]},{cN:"string",b:/(b|br)"/,e:/"/,c:[h.BE]}].concat([h.ASM,h.QSM]);var j={cN:"title",b:h.UIR};var k={cN:"params",b:/\(/,e:/\)/,c:["self",h.CNM,i].concat(l)};var g={bWK:true,e:/:/,i:/[${=;\n]/,c:[j,k],r:10};return{k:{keyword:"and elif is global as in if from raise for except finally print import pass return exec else break not with class assert yield try while continue del or def lambda nonlocal|10 None True False",built_in:"Ellipsis NotImplemented"},i:/(<\/|->|\?)/,c:l.concat([i,h.HCM,h.inherit(g,{cN:"function",k:"def"}),h.inherit(g,{cN:"class",k:"class"}),h.CNM,{cN:"decorator",b:/@/,e:/$/},{b:/\b(print|exec)\(/}])}}(hljs);
hljs.LANGUAGES.ruby=function(r){var v="[a-zA-Z_][a-zA-Z0-9_]*(\\!|\\?)?";var m="[a-zA-Z_]\\w*[!?=]?|[-+~]\\@|<<|>>|=~|===?|<=>|[<>]=?|\\*\\*|[-/+%^&*~`|]|\\[\\]=?";var p={keyword:"and false then defined module in return redo if BEGIN retry end for true self when next until do begin unless END rescue nil else break undef not super class case require yield alias while ensure elsif or include"};var t={cN:"yardoctag",b:"@[A-Za-z]+"};var l=[{cN:"comment",b:"#",e:"$",c:[t]},{cN:"comment",b:"^\\=begin",e:"^\\=end",c:[t],r:10},{cN:"comment",b:"^__END__",e:"\\n$"}];var s={cN:"subst",b:"#\\{",e:"}",l:v,k:p};var n=[r.BE,s];var u=[{cN:"string",b:"'",e:"'",c:n,r:0},{cN:"string",b:'"',e:'"',c:n,r:0},{cN:"string",b:"%[qw]?\\(",e:"\\)",c:n},{cN:"string",b:"%[qw]?\\[",e:"\\]",c:n},{cN:"string",b:"%[qw]?{",e:"}",c:n},{cN:"string",b:"%[qw]?<",e:">",c:n,r:10},{cN:"string",b:"%[qw]?/",e:"/",c:n,r:10},{cN:"string",b:"%[qw]?%",e:"%",c:n,r:10},{cN:"string",b:"%[qw]?-",e:"-",c:n,r:10},{cN:"string",b:"%[qw]?\\|",e:"\\|",c:n,r:10},{cN:"string",b:/\B\?(\\\d{1,3}|\\x[A-Fa-f0-9]{1,2}|\\u[A-Fa-f0-9]{4}|\\?\S)\b/}];var o={cN:"function",bWK:true,e:" |$|;",k:"def",c:[{cN:"title",b:m,l:v,k:p},{cN:"params",b:"\\(",e:"\\)",l:v,k:p}].concat(l)};var q=l.concat(u.concat([{cN:"class",bWK:true,e:"$|;",k:"class module",c:[{cN:"title",b:"[A-Za-z_]\\w*(::\\w+)*(\\?|\\!)?",r:0},{cN:"inheritance",b:"<\\s*",c:[{cN:"parent",b:"("+r.IR+"::)?"+r.IR}]}].concat(l)},o,{cN:"constant",b:"(::)?(\\b[A-Z]\\w*(::)?)+",r:0},{cN:"symbol",b:":",c:u.concat([{b:m}]),r:0},{cN:"symbol",b:v+":",r:0},{cN:"number",b:"(\\b0[0-7_]+)|(\\b0x[0-9a-fA-F_]+)|(\\b[1-9][0-9_]*(\\.[0-9_]+)?)|[0_]\\b",r:0},{cN:"variable",b:"(\\$\\W)|((\\$|\\@\\@?)(\\w+))"},{b:"("+r.RSR+")\\s*",c:l.concat([{cN:"regexp",b:"/",e:"/[a-z]*",i:"\\n",c:[r.BE,s]},{cN:"regexp",b:"%r{",e:"}[a-z]*",i:"\\n",c:[r.BE,s]},{cN:"regexp",b:"%r\\(",e:"\\)[a-z]*",i:"\\n",c:[r.BE,s]},{cN:"regexp",b:"%r!",e:"![a-z]*",i:"\\n",c:[r.BE,s]},{cN:"regexp",b:"%r\\[",e:"\\][a-z]*",i:"\\n",c:[r.BE,s]}]),r:0}]));s.c=q;o.c[1].c=q;return{l:v,k:p,c:q}}(hljs);
hljs.LANGUAGES.rust=function(e){var g={cN:"title",b:e.UIR};var h={cN:"number",b:"\\b(0[xb][A-Za-z0-9_]+|[0-9_]+(\\.[0-9_]+)?([uif](8|16|32|64)?)?)",r:0};var f="assert bool break char check claim comm const cont copy dir do drop else enum extern export f32 f64 fail false float fn for i16 i32 i64 i8 if impl int let log loop match mod move mut priv pub pure ref return self static str struct task true trait type u16 u32 u64 u8 uint unsafe use vec while";return{k:f,i:"</",c:[e.CLCM,e.CBLCLM,e.inherit(e.QSM,{i:null}),e.ASM,h,{cN:"function",bWK:true,e:"(\\(|<)",k:"fn",c:[g]},{cN:"preprocessor",b:"#\\[",e:"\\]"},{bWK:true,e:"(=|<)",k:"type",c:[g],i:"\\S"},{bWK:true,e:"({|<)",k:"trait enum",c:[g],i:"\\S"}]}}(hljs);
hljs.LANGUAGES.scala=function(e){var f={cN:"annotation",b:"@[A-Za-z]+"};var d={cN:"string",b:'u?r?"""',e:'"""',r:10};return{k:"type yield lazy override def with val var false true sealed abstract private trait object null if for while throw finally protected extends import final return else break new catch super class case package default try this match continue throws",c:[{cN:"javadoc",b:"/\\*\\*",e:"\\*/",c:[{cN:"javadoctag",b:"@[A-Za-z]+"}],r:10},e.CLCM,e.CBLCLM,d,e.ASM,e.QSM,{cN:"class",b:"((case )?class |object |trait )",e:"({|$)",i:":",k:"case class trait object",c:[{bWK:true,k:"extends with",r:10},{cN:"title",b:e.UIR},{cN:"params",b:"\\(",e:"\\)",c:[e.ASM,e.QSM,d,f]}]},e.CNM,f]}}(hljs);
hljs.LANGUAGES.smalltalk=function(f){var e="[a-z][a-zA-Z0-9_]*";var g={cN:"char",b:"\\$.{1}"};var h={cN:"symbol",b:"#"+f.UIR};return{k:"self super nil true false thisContext",c:[{cN:"comment",b:'"',e:'"',r:0},f.ASM,{cN:"class",b:"\\b[A-Z][A-Za-z0-9_]*",r:0},{cN:"method",b:e+":"},f.CNM,h,g,{cN:"localvars",b:"\\|\\s*"+e+"(\\s+"+e+")*\\s*\\|"},{cN:"array",b:"\\#\\(",e:"\\)",c:[f.ASM,g,f.CNM,h]}]}}(hljs);
hljs.LANGUAGES.sql=function(b){return{cI:true,c:[{cN:"operator",b:"(begin|end|start|commit|rollback|savepoint|lock|alter|create|drop|rename|call|delete|do|handler|insert|load|replace|select|truncate|update|set|show|pragma|grant)\\b(?!:)",e:";",eW:true,k:{keyword:"all partial global month current_timestamp using go revoke smallint indicator end-exec disconnect zone with character assertion to add current_user usage input local alter match collate real then rollback get read timestamp session_user not integer bit unique day minute desc insert execute like ilike|2 level decimal drop continue isolation found where constraints domain right national some module transaction relative second connect escape close system_user for deferred section cast current sqlstate allocate intersect deallocate numeric public preserve full goto initially asc no key output collation group by union session both last language constraint column of space foreign deferrable prior connection unknown action commit view or first into float year primary cascaded except restrict set references names table outer open select size are rows from prepare distinct leading create only next inner authorization schema corresponding option declare precision immediate else timezone_minute external varying translation true case exception join hour default double scroll value cursor descriptor values dec fetch procedure delete and false int is describe char as at in varchar null trailing any absolute current_time end grant privileges when cross check write current_date pad begin temporary exec time update catalog user sql date on identity timezone_hour natural whenever interval work order cascade diagnostics nchar having left call do handler load replace truncate start lock show pragma exists number trigger if before after each row",aggregate:"count sum min max avg"},c:[{cN:"string",b:"'",e:"'",c:[b.BE,{b:"''"}],r:0},{cN:"string",b:'"',e:'"',c:[b.BE,{b:'""'}],r:0},{cN:"string",b:"`",e:"`",c:[b.BE]},b.CNM]},b.CBLCLM,{cN:"comment",b:"--",e:"$"}]}}(hljs);
hljs.LANGUAGES.tex=function(f){var g={cN:"command",b:"\\\\[a-zA-Zа-яА-я]+[\\*]?"};var h={cN:"command",b:"\\\\[^a-zA-Zа-яА-я0-9]"};var e={cN:"special",b:"[{}\\[\\]\\&#~]",r:0};return{c:[{b:"\\\\[a-zA-Zа-яА-я]+[\\*]? *= *-?\\d*\\.?\\d+(pt|pc|mm|cm|in|dd|cc|ex|em)?",rB:true,c:[g,h,{cN:"number",b:" *=",e:"-?\\d*\\.?\\d+(pt|pc|mm|cm|in|dd|cc|ex|em)?",eB:true}],r:10},g,h,e,{cN:"formula",b:"\\$\\$",e:"\\$\\$",c:[g,h,e],r:0},{cN:"formula",b:"\\$",e:"\\$",c:[g,h,e],r:0},{cN:"comment",b:"%",e:"$",r:0}]}}(hljs);
hljs.LANGUAGES.vala=function(b){return{k:{keyword:"char uchar unichar int uint long ulong short ushort int8 int16 int32 int64 uint8 uint16 uint32 uint64 float double bool struct enum string void weak unowned owned async signal static abstract interface override while do for foreach else switch case break default return try catch public private protected internal using new this get set const stdout stdin stderr var",built_in:"DBus GLib CCode Gee Object",literal:"false true null"},c:[{cN:"class",bWK:true,e:"{",k:"class interface delegate namespace",i:"[^,:\\n\\s\\.]",c:[{cN:"title",b:b.UIR}]},b.CLCM,b.CBLCLM,{cN:"string",b:'"""',e:'"""',r:5},b.ASM,b.QSM,b.CNM,{cN:"preprocessor",b:"^#",e:"$",r:2},{cN:"constant",b:" [A-Z_]+ ",r:0}]}}(hljs);
hljs.LANGUAGES.xml=function(e){var f="[A-Za-z0-9\\._:-]+";var d={eW:true,r:0,c:[{cN:"attribute",b:f,r:0},{b:'="',rB:true,e:'"',c:[{cN:"value",b:'"',eW:true}]},{b:"='",rB:true,e:"'",c:[{cN:"value",b:"'",eW:true}]},{b:"=",c:[{cN:"value",b:"[^\\s/>]+"}]}]};return{cI:true,c:[{cN:"pi",b:"<\\?",e:"\\?>",r:10},{cN:"doctype",b:"<!DOCTYPE",e:">",r:10,c:[{b:"\\[",e:"\\]"}]},{cN:"comment",b:"<!--",e:"-->",r:10},{cN:"cdata",b:"<\\!\\[CDATA\\[",e:"\\]\\]>",r:10},{cN:"tag",b:"<style(?=\\s|>|$)",e:">",k:{title:"style"},c:[d],starts:{e:"</style>",rE:true,sL:"css"}},{cN:"tag",b:"<script(?=\\s|>|$)",e:">",k:{title:"script"},c:[d],starts:{e:"<\/script>",rE:true,sL:"javascript"}},{b:"<%",e:"%>",sL:"vbscript"},{cN:"tag",b:"</?",e:"/?>",r:0,c:[{cN:"title",b:"[^ /><]+"},d]}]}}(hljs);
}
