// ==UserScript==
// @name        lorify-ng
// @description Юзерскрипт для сайта linux.org.ru поддерживающий загрузку комментариев через технологию WebSocket, а так же уведомления об ответах через системные оповещения и многое другое.
// @namespace   https://github.com/OpenA
// @include     https://www.linux.org.ru/*
// @include     http://www.linux.org.ru/*
// @version     2.6.2
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
	'Scroll Top View': true
}

const pagesCache    = new Map;
const ResponsesMap  = new Object;
const CommentsCache = new Object;
const LoaderSTB     = _setup('div', { html: '<div class="page-loader"></div>' });
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
	_setup('script', { text: 'Object.defineProperty(window,"startRealtimeWS",{value:function(){}});', id: 'start-rws'}),
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
		#markup-panel {
			margin-left: 5px;
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
		.uc:after { content: "\xA0"; }
		.uc { font-variant: unicase; }
		
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
	
	gotoNode: null,
	pagesCount: 1,
	
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
		var elem     = this.gotoNode;
		var content, hash = '';
		
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
		
		const promise = new Promise(resolve => {
			if (pagesCache.has(num)) {
				Navigation.swapAnimateTo(comments, (
					content = pagesCache.get(num)
				), reverse, resolve );
			} else {
				comments.parentNode.replaceChild((
					content = LoaderSTB
				), comments );
			
				pagesPreload(num).then(comms => {
					Navigation.swapAnimateTo( content, comms, reverse, resolve );
				});
			}
		});
		
		if (elem) {
			hash = '#'+ elem.id;
			promise.then(() => elem.scrollIntoView({ block: 'start', behavior: 'smooth' }));
			this.gotoNode = null;
		}
		
		history.replaceState(null, document.title, LOR.path + (num ? '/page'+ num : '') + hash);
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
	// 0: imageload promise => write resolve fn in global variable
	imgReady : new Promise(resolve => { _ImgResolve = resolve }),
	
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
		let image = new Image;
		// allow cross origin resource requests if the image is not a data:uri
		if ( ! /^data:/.test(this.original)) {
			image.crossOrigin = 'anonymous';
		}
		Object.defineProperty(this, 'image', {
			value: _setup(image, {
				// 1: imageload promise => call resolve fn
				onload: _ImgResolve,
				src: this.original
			})
		});
		return image;
	},
	
	get icon() {
		let links = document.getElementsByTagName('link'),
		   length = links.length;
		
		for (var i = 0; i < length; i++) {
			if (links[i].rel && /\bicon\b/i.test(links[i].rel)) {
				this.original = links[i].href;
				Object.defineProperty(this, 'icon', { writable: true, value: links[i] });
				return links[i];
			}
		}
	},
	
	draw: function(label = '', color = '#48de3d') {
		
		const $this   = this;
		const context = this.canvas.getContext('2d');
		const icon    = this.icon;
		const size    = this.size;
		const image   = this.image;
		
		this.imgReady.then(e => {
			
			// clear canvas
			context.clearRect(0, 0, size, size);
			// draw the favicon
			context.drawImage(image, 0, 0, image.width, image.height, 0, 0, size, size);
			
			var href = image.src;
			
			if (label) {
				
				if (typeof label === 'number' && label > 99) {
					document.title = $this.tabname +' ('+ label +')';
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
				context.textAlign = "center";
				context.fillText(label, centerX, fontPix);
				href = $this.canvas.toDataURL();
			}
			
			icon.parentNode.replaceChild(
				($this.icon = _setup('link', { type: 'image/png', rel: 'icon', href })), icon
			);
		});
	}
}

let MARKDOWN_MODE = false;

_setup(document, null, {
	
	'DOMContentLoaded': function onDOMReady() {
		
		this.removeEventListener('DOMContentLoaded', onDOMReady);
		//this.getElementById('start-rws').remove();
		
		const init = App.init();
		
		LOR.user = ( this.getElementById('loginGreating') || anonymous ).innerText;
		
		if ((LOR.form = this.forms['commentForm'] || this.forms['messageForm'])) {
			
			const MARKUP_PANEL = _setup('div', {
				id   : 'markup-panel',
				class: (MARKDOWN_MODE = LOR.form.elements['mode'].selectedIndex === 1) ? 'markdown' : 'lorcode',
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
					e.stopPropagation();
					e.preventDefault();
					if (e.target.type === 'button') {
						if (MARKDOWN_MODE) {
							const mkdwn = e.target.getAttribute('markdown');
							if (mkdwn === '>' || mkdwn === '* ')
								lorcodeMarkup.call(LOR.form.elements['msg'], mkdwn, `\n${ mkdwn }`);
							else
								markdownMarkup.call(LOR.form.elements['msg'], mkdwn);
						} else {
							const bbtag = e.target.getAttribute('lorcode');
							lorcodeMarkup.call(
								LOR.form.elements['msg'],
								'['+ bbtag +']', '[/'+ bbtag +']');
						}
					}
				}
			});
			
			LOR.form.elements['csrf'].value = TOKEN;
			LOR.form.elements['mode'].onchange = ({ target }) => {
				MARKUP_PANEL.className = (MARKDOWN_MODE = target.selectedIndex === 1) ? 'markdown' : 'lorcode'
			};
			
			LOR.form.elements['msg'].parentNode.firstElementChild.appendChild(MARKUP_PANEL).previousSibling.remove();
			LOR.form.elements['msg'].addEventListener('click', e => e.target.classList.remove('select-break'));
			
			window.addEventListener('keypress', winKeyHandler);
		}
		
		if (!LOR.topic) {
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
		
		const ts = this.querySelector(`#topic-${ LOR.topic } a[itemprop="creator"]`);
		
		if (ts) {
			LOR.TS = ts.innerText;
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
		
		this.querySelectorAll('#topicMenu a[href^="comment-message.jsp?topic"], a[itemprop="replyToUrl"]').forEach(handleReplyToBtn);
		
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
		
		window.addEventListener('dblclick', () => {
			var newadded = document.querySelectorAll('.newadded');
			newadded.forEach(nwc => nwc.classList.remove('newadded'));
			document.querySelectorAll('#page_'+ LOR.page).forEach(pg => pg.removeAttribute('cnt-new'));
			Favicon.draw(
				(Favicon.index -= newadded.length)
			);
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

function winKeyHandler(e) {
	
	const $this = LOR.form.elements['msg'];
	const key   = e.key || String.fromCharCode(e.charCode);
	
	if (e.target === $this) {
		
		const val = $this.value;
		const end = $this.selectionEnd,
		    start = $this.selectionStart,
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
						/*if (before.substring(-1) == '\n') {
							lorcodeMarkup.call($this, '* ', '\n* ');
							break;
						}*/
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
		}
	}
}

function onWSData(dbCiD) {
	// Get an HTML containing the comment
	getDataResponse(LOR.path +'?cid='+ dbCiD[0] +'&skipdeleted=true',
		({ response, responseURL }) => { // => OK
			const { page } = parseLORUrl(responseURL);
			
			const comms = getCommentsContent(response);
			
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
			history.replaceState(null, document.title, location.pathname);
		});
}

function addToCommentsCache(els, attrs, jqfix) {
	
	var usr_refs = 0; 
	
	for (let el of els) {
		
		let cid = el.id.replace('comment-', '');
		
		el['last_modifed'] = el.querySelector('.sign_more > time');
		el['edit_comment'] = el.querySelector('.reply a[href^="/edit_comment"]');
		
		addPreviewHandler(
			(CommentsCache[cid] = el), attrs
		);
		
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
				usr_refs += new RegExp(LOR.user).test(acid.nextSibling.textContent);
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
				attrs['class' ] = 'link-pref'+ (attrs.text == LOR.TS ? ' ts' : '');
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
	doc.querySelectorAll('#topicMenu a[href^="comment-message.jsp?topic"], a[itemprop="replyToUrl"]').forEach(handleReplyToBtn);
	// update favorites and memories counter
	fav.children[  'favs_count'  ].textContent = newfv.children[  'favs_count'  ].textContent;
	fav.children['memories_count'].textContent = newfv.children['memories_count'].textContent;
	// stop watch if topic deleted
	if (isDel.booleanValue)
		RealtimeWatcher.terminate('Тема удалена');
	// Replace topic if modifed
	if (old.textContent !== topic.textContent) {
		const form = old.querySelector('#commentForm');
		old.parentNode.replaceChild(topic, old);
		form && topic.querySelector('.msg_body').appendChild( form.parentNode ).firstElementChild.elements['msg'].focus();
		_setup(newfv.children['memories_button'], { onclick: topMemories, watch: '&add=add&watch=true&msgid='+ LOR.topic, 
			class: fav.children['memories_button'].className });
		_setup(newfv.children['favs_button'], { onclick: topMemories, watch: '&add=add&watch=false&msgid='+ LOR.topic,
			class: fav.children['favs_button'].className });
	}
	return comms;
}

const openPreviews = document.getElementsByClassName('preview');
var _offset_ = 1, __view = () => void 0;

function removePreviews(comment) {
	var c = openPreviews.length - _offset_;
	while (openPreviews[c] !== comment) {
		openPreviews[c--].remove();
	}
}

function addPreviewHandler(comment, attrs) {
	
	comment.addEventListener('click', e => {
		if (e.target.classList[0] === 'link-pref') {
			var cid  = e.target.getAttribute('cid'),
				view = document.getElementById('comment-'+ cid);
			_offset_ = 1;
			['Close Preview', 'Open Preview', e.target.href].forEach(Timer.clear);
			removePreviews();
			if (view) {
				history.replaceState(null, document.title, location.pathname +'#comment-'+ cid);
				view.scrollIntoView({ block: 'start', behavior: 'smooth' });
			} else {
				view = () => {
					Navigation.page = pagesCache.get(
						( Navigation.gotoNode = CommentsCache[cid] ).parentNode
					);
				}
				if (cid in CommentsCache) {
					view();
				} else if (TOUCH_DEVICE) {
					getDataResponse(e.target.pathname + e.target.search,
						({ response, responseURL }) => { // => OK
							const { page } = parseLORUrl(responseURL);
							const comms    = getCommentsContent(response);
							
							pagesCache.set(page, comms);
							pagesCache.set(comms, page);
							
							addToCommentsCache(
								comms.querySelectorAll('.msg[id^="comment-"]')
							);
							
							view();
						});
				} else {
					new Promise(resolve => { __view = () => { __view = () => void 0; resolve() }}).then(view);
				}
			}
		}
		if (/replyComment|quoteComment|link\-pref/.test(e.target.classList[0]))
			e.preventDefault();
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
		getDataResponse(e.target.pathname + e.target.search,
			({ response, responseURL }) => { // => OK
				const { page } = parseLORUrl(responseURL);
				const comms    = getCommentsContent(response);
				
				pagesCache.set(page, comms);
				pagesCache.set(comms, page);
				
				addToCommentsCache(
					comms.querySelectorAll('.msg[id^="comment-"]')
				);
				
				if (commentEl.parentNode) {
					commentEl.remove();
					showCommentInternal(
						comms.children['comment-'+ commentID].cloneNode((e.isNew = true)),
						commentID,
						e
					);
				}
				__view();
			}, ({ status, statusText }) => { // => Error
				commentEl.textContent = status +' '+ statusText;
				commentEl.classList.add('msg-error');
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
	xhr.open('GET', location.origin + uri, true);
	xhr.onload = () => {
		xhr.status === 200 ? resolve(xhr) : reject(xhr)
	}
	xhr.send(null);
}

function topMemories(e) {
	(// приостановка действий по клику на кнопку до окончания текущего запроса
		this.onclick = o => o.preventDefault()
	)(e);
	
	const $this = this;
	const watch = this.id === 'memories_button';
	
	fetch('/memories.jsp?csrf='+ encodeURIComponent(TOKEN) + this.getAttribute('watch'), {
		credentials : 'same-origin',
		method      : 'POST'
	}).then(response => {
		if (response.ok) {
			response.json().then(data => {
				if (data.id) {
					$this.setAttribute('watch', '&id='+ data.id +'&remove=remove&watch='+ watch);
					$this.classList.add('selected');
					$this.parentNode.children[$this.id.replace('button', 'count')].textContent = data.count;
				} else {
					$this.setAttribute('watch', '&add=add&watch='+ watch +'&msgid='+ LOR.topic );
					$this.classList.remove('selected');
					$this.parentNode.children[$this.id.replace('button', 'count')].textContent = data;
				}
			})
		}
		$this.onclick = topMemories;
	});
}

function toggleForm(underc, parent, href) {
	const [, topic, replyto = 0 ] = href.match(/jsp\?topic=(\d+)(?:&replyto=(\d+))?$/);
	if (LOR.form.elements['replyto'].value != replyto) {
		parent.style['display'] = 'none';
	}
	if (parent.style['display'] == 'none') {
		parent.className = 'slide-down';
		parent.addEventListener('animationend', function(e, _) {
			_setup(parent, { class: _ }, { remove: { animationend: arguments.callee }});
			LOR.form.elements['msg'].focus();
		});
		underc.appendChild(parent).style['display'] = null;
		LOR.form.elements['replyto'].value = replyto;
		LOR.form.elements[ 'topic' ].value = topic;
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
	$this.innerHTML = '<a class="replyComment" href="javascript:void(0)">Ответить</a>\n.\n<a class="quoteComment" href="javascript:void(0)">с цитатой</a>';
	$this.addEventListener('click', e => {
		
		if (e.target.tagName === 'A') {
			e.stopPropagation();
			e.preventDefault();
			
			const parent = LOR.form.parentNode;
			const underc = $this.parentNode.parentNode;
			
			switch (e.target.classList[0]) {
				case 'replyComment':
					toggleForm(underc, parent, href);
					break;
				case 'quoteComment':
					let arg = ['>', '\n>'];
					let msg = underc.parentNode.querySelector('[itemprop="articleBody"]') || underc.parentNode;
					
					if (parent.parentNode != underc || parent.style.display == 'none')
						toggleForm(underc, parent, href);
					
					if (!MARKDOWN_MODE) { // lorcode, line-break
						let nobl = msg.querySelector('div.code,pre,ul,ol,table');
						if (nobl && (nobl = nobl.parentNode.className != 'reply'))
							arg[0] = '[quote]', arg[1] = '[/quote]';
						arg.push(domToLORCODE(msg.childNodes, !nobl).replace(/(?:[\n]+){3,}/g, '\n\n').trim());
					} else
						arg.push(domToMarkdown(msg.childNodes)); // markdown
					
					lorcodeMarkup.apply(LOR.form.elements['msg'], arg);
			}
		}
	}, false);
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
				} else if (el.id === 'cut') {
					text += `[cut]\n${ domToLORCODE(el.childNodes, nobl) }[/cut]\n`;
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
				} else if (el.id === 'cut') {
					text += `>>>\n${ domToLORCODE(el.childNodes, nobl) }\n>>>\n`;
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
				text += '\n';
				break;
			default:
				text += getRawText(el);
		}
	}
	
	return text;
}

const App = (() => {
	
	var main_events_count;
	
	if (typeof chrome !== 'undefined' && chrome.runtime.id) {
		
		const port = chrome.runtime.connect(chrome.runtime.id, { name: location.href });
		const sync = new Promise((resolve, reject) => {
			
			const onResponseHandler = items => {
				if (typeof items === 'object') {
					for (let name in items) {
						USER_SETTINGS[name] = items[name];
					}
					port.onMessage.removeListener(onResponseHandler);
					resolve();
				}
			};
			
			port.onMessage.addListener(onResponseHandler);
			chrome.runtime.sendMessage({ action : 'l0rNG-settings' });
			chrome.storage.onChanged.addListener(items => {
				for (let name in items) {
					USER_SETTINGS[name] = items[name].newValue;
				}
			});
		});
		
		return {
			checkNow : () => chrome.runtime.sendMessage({ action: 'l0rNG-checkNow' }),
			init     : () => {
				if ( (main_events_count = document.getElementById('main_events_count')) ) {
					// We can't show notification from the content script directly,
					// so let's send a corresponding message to the background script
					port.onMessage.addListener(text => { main_events_count.textContent = text });
					chrome.runtime.sendMessage({
						action : 'l0rNG-init',
						notes  : main_events_count.innerText.replace(/\((\d+)\)/, '$1')
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
				var text = '';
				if (response != 0) {
					text = '('+ response +')';
					if (notes != response) {
						localStorage.setItem('l0rNG-notes', (notes = response));
						USER_SETTINGS['Desktop Notification'] && sendNotify(response);
					}
				}
				main_events_count.textContent = lorynotify.textContent = text;
				Timer.set('Check Notifications', startWatch, delay);
			});
		
		const setValues = items => {
			for (let name in USER_SETTINGS) {
				let inp = loryform.elements[name];
				inp[inp.type === 'checkbox' ? 'checked' : 'value'] = (USER_SETTINGS[name] = items[name]);
			}
		}
		
		const onValueChange = ({ target }) => {
			Timer.clear('Settings on Changed');
			switch (target.type) {
				case 'checkbox':
					USER_SETTINGS[target.id] = target.checked;
					break;
				case 'number':
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
		
		const applymsg   = loryform.querySelector('#applymsg');
		const lorynotify = _setup( 'a' , { id: 'lorynotify', class: 'lory-btn', href: 'notifications' });
		const lorytoggle = _setup('div', { id: 'lorytoggle', class: 'lory-btn', html: `<style>
			#lorynotify {
				right: 60px;
				text-decoration: none;
				color: inherit;
				font: bold 1.2em "Open Sans";
			}
			#lorytoggle {
				width: 32px;
				height: 32px;
				right: 5px;
				cursor: pointer;
				opacity: .5;
				background: url(//github.com/OpenA/lorify-ng/blob/master/icons/penguin-32.png?raw=true) center / 100%;
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
			#lorytoggle:hover, #lorytoggle.pinet { opacity: 1; }
			.lory-btn { position: fixed; top: 5px; }
			.tab-row  { display: table-row; font-size: 85%; color: #666; }
			.tab-cell { display: table-cell;
				position: relative;
				padding: 4px 2px;
				vertical-align: middle;
				max-width: 180px;
			}
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
			click: () => { lorytoggle.classList.toggle('pinet') ? document.body.appendChild(loryform) : loryform.remove() }
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
				main_events_count.textContent = lorynotify.textContent = '('+ (notes = newValue) +')';
				Timer.set('Check Notifications', startWatch, delay);
			} else if (key === 'lorify-ng') {
				setValues( JSON.parse(newValue) );
			}
		});
		return {
			checkNow: () => void 0,
			init: function() {
				if ( (main_events_count = document.getElementById('main_events_count')) ) {
					const $1 = ( lorynotify.textContent = main_events_count.textContent ).replace(/\((\d+)\)/, '$1');
					if (notes != $1) {
						!!(notes = $1) && sendNotify( $1 );
						localStorage.setItem('l0rNG-notes', $1);
					}
					Timer.set('Check Notifications', (this.checkNow = startWatch), delay);
				}
				document.body.append(lorynotify, lorytoggle);
				return { then: c => c() }
			}
		}
	}
})();
