// ==UserScript==
// @name        lorify-ng
// @description Юзерскрипт для сайта linux.org.ru поддерживающий загрузку комментариев через технологию WebSocket, а так же уведомления об ответах через системные оповещения и многое другое.
// @namespace   https://github.com/OpenA
// @include     https://www.linux.org.ru/*
// @include     http://www.linux.org.ru/*
// @version     2.9.1
// @grant       none
// @homepageURL https://github.com/OpenA/lorify-ng
// @updateURL   https://github.com/OpenA/lorify-ng/blob/master/lorify-ng.user.js?raw=true
// @icon        https://github.com/OpenA/lorify-ng/blob/master/icons/penguin-64.png?raw=true
// @run-at      document-start
// ==/UserScript==

const USER_SETTINGS = {
	'Realtime Loader': true,
	'CSS3 Animation' : true,
	'Delay Open Preview': 50,
	'Delay Close Preview': 800,
	'Desktop Notification': true,
	'Preloaded Pages Count': 1,
	'Picture Viewer': 2,
	'Scroll Top View': true,
	'Upload Post Delay': 5,
	'Code Block Short Size': 255
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
const Dynamic_Style = (() => {

	const style_el = document.createElement('style');

	const max_shrink_val    = document.createTextNode(USER_SETTINGS['Code Block Short Size'].toString());
	const img_center_scale  = document.createTextNode('1'); // scale XY size 100%
	const img_center_rotate = document.createTextNode('0'); // rotate angle 0/deg

	style_el.append(
		'.shrinked { max-height: ', max_shrink_val, 'px!important; overflow-y: hidden!important; }',
		'.central-pic-img { transform: scale(', img_center_scale, ') rotate(', img_center_rotate,'deg); }'
	)

	return {
		0: style_el,

		set 'Code Block Short Size' (v) { max_shrink_val.textContent    = v.toString(); },
		set 'Center Image Scale'    (v) { img_center_scale.textContent  = v.toFixed(2); },
		set 'Center Image Rotate'   (v) { img_center_rotate.textContent = v.toString(); }
	}
})();
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
		.page-number { position: relative; margin-right: 5px; }
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
		.preview #commentForm, .hidden {
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
			font-variant: small-caps;
			margin: 0 5px 5px 0;
			border: 0;
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
		.shrink-line {
			position: absolute;
			bottom: 0;
			left: 25%;
			right: 25%;
			border-radius: 15px 15px 0 0;
			background: rgba(0,0,0,.5);
			text-align: center;
			color: white;
			cursor: pointer;
			opacity: .5;
		}
		.shrink-line:hover {
			opacity: 1;
		}
		.shrink-text {
			padding: 5px 8px;
		}
		*:not(.cutted) > .shrink-text:after, .cutted > .shrink-text:before {
			color: #689b19;
		}
		*:not(.cutted) > .shrink-text:before, .cutted > .shrink-text:after {
			font: bold 12px monospace;
		}
		.cutted {
			display: table;
		}
		.cutted > *:not(.shrink-text) {
			display: none;
		}
		.cutted > .shrink-text:after {
			content: '\x20\x20>>>';
		}
		.cutted > .shrink-text:before {
			content: 'показать код';
		}
		*:not(.cutted) > .shrink-text {
			border-radius: 0 0 5px;
			background: rgba(0,0,0,.2);
		}
		*:not(.cutted) > .shrink-text:before {
			content: '<<<\x20\x20';
		}
		*:not(.cutted) > .shrink-text:after {
			content: 'убрать код';
		}
		.suplied:after {
			content: '';
			-webkit-animation: toHide 3s;
			animation: toHide 3s;
		}
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
		}
		@media screen and (max-width: 460px) {
			.title > [datetime] { display: none !important; }
			.sign > [datetime], .sign > .sign_more { font-size: 12px; }
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
`}), Dynamic_Style[0]);

class TopicNavigation {

	constructor(pages_count) {

		this.wait = _setup('div', { html: '<div class="page-loader"></div>' });
		this.bar  = _setup('div', {
			html  : '<a class="page-number prev" href="#prev">←</a><a class="page-number next" href="#next">→</a>',
			id    : 'bottom-nav',
			class : 'nav'
		},{ click : this });

		this.mir = _setup(this.extendBar(pages_count).cloneNode(true), { id: 'top-nav' }, { click: this });
	}

	gotoPage(num) {

		const { wait, bar, mir } = this;

		const  _this = this,
			currpage = LOR.page,
			comments = pagesCache.get(currpage),
			reverse  = (LOR.page = num) > currpage;

		for (var i = 0; i < bar.children.length; i++) {
			bar.children[i].classList.remove('broken');
			mir.children[i].classList.remove('broken');
		}
		if (num <= 0) {
			// set prev button to inactive
			bar.firstElementChild.classList.add('broken');
			mir.firstElementChild.classList.add('broken');
		} else
		if (num >= i - 3) {
			// set next button to inactive
			bar.lastElementChild.classList.add('broken');
			mir.lastElementChild.classList.add('broken');
		}
		bar.children[`page_${ num }`].classList.add('broken');
		mir.children[`page_${ num }`].classList.add('broken');

		if (USER_SETTINGS['Scroll Top View']) {
			comments.scrollIntoView({ block: 'start' });
		}
		return new Promise(resolve => {
			if (pagesCache.has(num)) {
				_this.swapAnimateTo( comments, pagesCache.get(num), reverse, resolve );
			} else {
				comments.parentNode.replaceChild( wait, comments );
				pagesPreload(num).then(comms => {
					_this.swapAnimateTo( wait, comms, reverse, resolve );
				});
			}
		});
	}

	extendBar(pages_count) {

		const { page, path } = LOR;

		const { bar } = this,
		      prevBtn = bar.firstElementChild,
		      nextBtn = bar.lastElementChild;

		for (var i = bar.children.length - 2; i < pages_count; i++) {
			nextBtn.before(
				_setup('a', { id: `page_${ i }`, class: 'page-number', href: `${ path }/page${ i }#comments`, text: `${ i + 1 }` })
			);
		}
		if (page === 0) {
			prevBtn.classList.add('broken');
		} else
		if (page === i - 1) {
			nextBtn.classList.add('broken');
		}
		bar.children[`page_${ page }`].classList.add('broken');

		return bar;
	}

	handleEvent(e) {

		const { id, classList } = e.target;

		if (classList[0] === 'page-number') {

			if (!classList.contains('broken')) {

				let { page, path } = LOR;

				switch (classList[1]) {
					case 'prev': page--; break;
					case 'next': page++; break;
					default    : page = Number(id.substring(5));
				}
				this.gotoPage(page);
				history.pushState(null, null, (page ? `${ path }/page${ page }`: path));
			}
			e.preventDefault();
		}
	}

	swapAnimateTo(comments, content, reverse, resolve) {
		
		let old_nav = content.querySelector('.nav');
		if (old_nav) {
			content.replaceChild(this.mir, old_nav);
		} else
			content.querySelector('.msg[id^="comment-"]').before(this.mir);

		if (USER_SETTINGS['CSS3 Animation']) {

			const termHandler = () => {
				content.removeEventListener('animationend', termHandler, true);
				content.style['animation-name'] = null;
				content.classList.remove('terminate');
				resolve();
			}
			content.addEventListener('animationend', termHandler, true);
			content.style['animation-name'] = 'slideToShow'+ (reverse ? '-reverse' : '');
			content.classList.add('terminate');
		} else {
			resolve();
		}
		comments.parentNode.replaceChild(content, comments);
	}

	addBouble(pagenum, cnt_new) {
		const btn = this.bar.children[`page_${pagenum}`];
		cnt_new += Number( btn.getAttribute('cnt-new') );
		btn.setAttribute('cnt-new', cnt_new);
		this.mir.children[`page_${pagenum}`].setAttribute('cnt-new', cnt_new);
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

let Navigation = null;
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
		
		const top  = this.getElementById(`topic-${ LOR.topic }`);
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
			
			let { topic, replyto } = parseReplyUrl(location.search);
			let bd_rep = this.querySelector('#bd > h2 > a[name="rep"], #bd #navPath');
			if (bd_rep) {
				bd_rep.append('\n(', _setup('a', {
					text : 'с цитатой',
					style: 'color: indianred!important;',
					href : 'javascript:void(0)'
				},{
					click: convMsgBody.bind(null, this.querySelector(`#topic-${ topic } .msg_body > div:not([class]), #comment-${ replyto } .msg_body`))
				}), ')\n');
			}
		}
		
		if (top) {

			const ts = top.querySelector(`a[itemprop="creator"]`);

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

			Highlight_Code.apply( top );
			addPreviewHandler( top );

		} else {

			for (const tps of this.querySelectorAll('[id^="topic-"]')) {

				Highlight_Code.apply( tps );
				addPreviewHandler( tps );
			}
			window.addEventListener('memories_setup', ({ detail }) => {
				_setup(document.getElementById('tagFavAdd'), { 'data-tag': detail[0], onclick: tagMemories });
				_setup(document.getElementById('tagIgnore'), { 'data-tag': detail[0], onclick: tagMemories });
			});
			return;
		}

		const navPages = this.querySelectorAll('.messages > .nav > .page-number');
		const comments = this.getElementById('comments');

		let lastPageIdx = 0;

		if (navPages.length) {

			const { bar, mir } = (Navigation = new TopicNavigation(navPages.length - 2));
			const nav = navPages[0].parentNode;
			lastPageIdx = navPages.length - 3;

			nav.parentNode.replaceChild(bar, nav);
			comments.replaceChild(mir, comments.querySelector('.nav'));
		}
		
		var history_state = LOR.path + (LOR.page ? '/page'+ LOR.page : '');
		var target_cid    = (location.hash.match(/^#comment\-(\w+)$/) || location.search.match(/(?:\?|&)cid=(\d+)/) || '')[1]
		
		if (target_cid) {
			if (/(?:fir|la)st/.test(target_cid)) {
				let targ = comments.querySelector(`.msg[id^="comment-"]:${ target_cid }-of-type`);
				if (targ) {
					targ.scrollIntoView();
					history_state += '#'+ targ.id;
				}
			} else {
				this.getElementById('comment-'+ target_cid).scrollIntoView();
				history_state += '#comment-'+ target_cid;
			}
		}
		history.replaceState(null, null, history_state);
		
		pagesCache.set(LOR.page, comments);
		pagesCache.set(comments, LOR.page);
		
		addToCommentsCache(
			comments.querySelectorAll('.msg[id^="comment-"]'), null, true
		);
		
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
			if (LOR.page != lastPageIdx) {
				pagesPreload(lastPageIdx).then(RealtimeWatcher.start);
			} else {
				RealtimeWatcher.start(comments);
			}
		}
		
		init.then(() => {
			const PL_COUNT = USER_SETTINGS['Preloaded Pages Count'];
			let g = 1 + (LOR.page != lastPageIdx);

			for (let i = LOR.page + 1; g < PL_COUNT && i < lastPageIdx; i++, g++) {
				pagesPreload(i);
			}
			for (let i = LOR.page - 1; g < PL_COUNT && i >= 0; i--, g++) {
				pagesPreload(i);
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
					Navigation.gotoPage(page).then(() => {
						comment_id && document.getElementById(comment_id).scrollIntoView()
					});
				} else if (comment_id) {
					document.getElementById(comment_id).scrollIntoView();
				}
			}
		});
	},
	animationstart: ({ target }) => {
		if (target.className === 'code suplied') {
			target.classList.remove('suplied');
			if (target.offsetHeight > USER_SETTINGS['Code Block Short Size']) {
				target.classList.add('shrinked');
				target.prepend( _setup('div', { class: 'shrink-line', text: 'Развернуть' }) );
			}
		}
	}
});

const RealtimeWatcher = {

	start: (comms) => {

		const last_id  = comms.querySelector('.msg[id^="comment-"]:last-child').id.replace('comment-', '');
		const realtime = document.getElementById('realtime');
		const wS       = (RealtimeWatcher.wS = new WebSocket('wss://www.linux.org.ru:9000/ws'));

		var dbCiD = [];

		wS.onmessage =  e => {
			dbCiD.push( e.data );
			Timer.set('WebSocket Data', () => {
				if (USER_SETTINGS['Realtime Loader']) {
					realtime.style.display = 'none';
					onWSData(dbCiD);
					dbCiD = [];
				} else {
					(realtime.lastElementChild || _setup(realtime, {
						text: 'Был добавлен новый комментарий.\n'
					}).appendChild(
						_setup('a', { text: 'Обновить.' })
					)).setAttribute(
						'href', LOR.path +'?cid='+ dbCiD[0]
					);
					realtime.style.display = null;
				}
			}, 2e3);
		}
		wS.onopen = () => {
			console.info(`Установлено соединение c ${ wS.url }`);
			wS.send( LOR.topic +' '+ last_id );
		}
		wS.onclose = ({ code, reason, wasClean }) => {
			console.warn(`Соединение c ${ wS.url } было прервано "${ reason }" [код: ${ code }]`);
			if(!wasClean || code == 1008) {
				Timer.set('WebSocket Data', () => {
					Favicon.draw(Favicon.index);
					RealtimeWatcher.start(comms);
				}, 5e3);
			}
			if (code != 1000)
				Favicon.draw(Favicon.index || '!', '#ae911c');
		}
		wS.onerror = e => console.error(e);
	},
	terminate: (reason) => {
		RealtimeWatcher.wS.close(1000, reason);
		Favicon.draw('\u2013', '#F00');
	}
}

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
						msg.classList.add('deleted');
						msg.id = 'deleted'+ msg.id.substr(7);
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
				if (Navigation) {
					Navigation.addBouble(page, i);
				}
				Favicon.index += i;
			} else {
				
				pagesCache.set(page, comms);
				pagesCache.set(comms, page);
				
				const nav = comms.querySelectorAll('.nav > .page-number'),
				  nav_cnt = nav.length - 2;
				const msg = comms.querySelectorAll('.msg[id^="comment-"]'),
				  msg_cnt = msg.length;
				
				if (!Navigation) {
					const { bar, mir } = (Navigation = new TopicNavigation(nav_cnt));
					document.getElementById('realtime').after(bar);
					document.querySelector('#comments > .msg[id^="comment-"]').before(mir);
				} else {
					const mir = Navigation.mir;
					const bar = Navigation.extendBar(nav_cnt);
					
					mir.parentNode.replaceChild((
						Navigation.mir = _setup(bar.cloneNode(true), { id: 'top-nav' }, { click: Navigation })
					), mir);
				}
				Navigation.addBouble(page, msg_cnt);
				addToCommentsCache( msg, { class: 'msg newadded' } );
				Favicon.index += msg_cnt;
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
			(CommentsCache[cid] = el), attrs, !TOUCH_DEVICE
		);
		
		el.querySelectorAll(`.msg_body > *:not(.reply):not(.sign) a[href*="${ path }?cid="]`).forEach(a => {
			_setup(a, { class: 'link-navs', cid: a.search.replace('?cid=', '') })
		});
		
		let acid = _setup(el.querySelector(`.title > a[href^="${ path }?cid="]`), { class: 'link-pref' });
		let self = _setup(el.querySelector(`.reply > ul > li > a[href="${ path }?cid=${ cid }"]`), { class: 'link-self', cid });
		
		if (acid) {
			// Extract reply comment ID from the 'search' string
			let num = acid.search.match(/cid=(\d+)/)[1];
			// Write special attributes
			acid.setAttribute('cid', num);
			if (!jqfix) {
				usr_refs += Login.test(acid.nextSibling.textContent);
			}
			// Create new response-map for this comment
			if (!(num in ResponsesMap)) {
				ResponsesMap[num] = new Array;
			}
			ResponsesMap[num].push({
				text: ( el.querySelector('a[itemprop="creator"]') || anonymous ).innerText,
				href: self.href,
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
	comms.querySelectorAll('script, style').forEach(s => s.remove());
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
			Navigation.gotoPage(num).then(() => {
				CommentsCache[cid].scrollIntoView({ block: 'start', behavior: 'smooth' })
				resolve(CommentsCache[cid]);
			});
			history.pushState(null, null, LOR.path + (num ? '/page'+ num : '') +'#comment-'+ cid);
		} else {
			reject();
		}
	});
}

class CentralPicture {

	static expose(s,w,h) {
		const pic = new CentralPicture;
		Object.defineProperty(CentralPicture, 'expose', {
			value: (s,w,h) => pic.expose(s,w,h)
		});
		pic.expose(s,w,h);
	}

	constructor() {

		var _Scale = 1.0;
		var _Rdeg  = 0;
		var _X     = 0;
		var _Y     = 0;

		const self = this;

		const _IMG = _setup('img', {
			class: 'central-pic-img',
			style: 'left: 0; top: 0;'
		}, { load: this,
			error: ({ target: { style } }) => {
				style.visibility = 'visible';
			}
		});

		const _Overlay = _setup('div', {
			class : 'central-pic-overlay',
			html  : `<div style="left: 50%; top: 50%;"></div>
				<svg class="central-pic-rotate" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
					<path class="svg-circle-arrow" d="m31 20c-0.6 4.5-3.7 8.6-8 10.5-2 1.25-5 1.6-7.7 1.5l-1.7-0.15c-2.5-0.6-5-1.7-7-3.5-4.3-3.6-6-10-4-15 1.6-4.55 6-8.1 11-9 1.2-0.25 2.45-0.3 3.7-0.25l0.6-4.1h0.1c2.1 2.7 4.15 5.34 6.3 8-2.8 2-5.6 4.1-8.4 6 0.2-1.4 0.4-2.7 0.56-4.1-2.5-0.025-5.1 1.1-6.6 3.1-2.5 2.75-2.5 7.1-0.13 10 1.8 2.5 5.25 3.6 8.4 3 2.156-0.3 4.1-1.6 5.3-3.4 0.8-1 1.1-2.25 1.5-3.4 2 0.25 3.9592 0.5 7 0.8l0.1-0.05z"></path>
				</svg>`
		});

		const cleanUp = () => {
			_Overlay.remove();
			_IMG.src = '';
			_IMG.style.left = _X = 0;
			_IMG.style.top  = _Y = 0;
			Dynamic_Style['Center Image Scale'] = _Scale = 1;
			Dynamic_Style['Center Image Rotate'] = _Rdeg = 0;
			window.removeEventListener('resize', self, false);
		}
		const handler = e => {
			switch (e.target.classList[0]) {
				case 'central-pic-rotate':
				case 'svg-circle-arrow':
					Dynamic_Style['Center Image Rotate'] = _Rdeg === 270 ? (_Rdeg = 0) : (_Rdeg += 90);
					break;
				case 'central-pic-overlay':
					cleanUp();
			}
			e.preventDefault();
		}

		if (TOUCH_DEVICE) {

			let start2D = -1;
			let startX  = 0;
			let startY  = 0;
			let startS  = 1;

			const getPoint2D = ([a, b]) => Math.sqrt(
				(a.clientX - b.clientX) * (a.clientX - b.clientX) + (a.clientY - b.clientY) * (a.clientY - b.clientY)
			);

			_IMG.addEventListener('touchstart', e => {

				start2D = e.touches.length > 1 ? getPoint2D(e.touches) : -1;
				startX  = e.touches[0].clientX - _X;
				startY  = e.touches[0].clientY - _Y;
				startS  = _Scale;

				e.preventDefault();
			});
			_IMG.addEventListener('touchmove', ({ touches, changedTouches }) => {
				if (start2D != -1) {
					const scale = getPoint2D(touches) / start2D * startS;
					Dynamic_Style['Center Image Scale'] = _Scale = Math.min(
						(scale < 0.5 ? 0.5 : scale >= 0.9 && scale <= 1.1 ? 1 : scale), 9
					);
				} else if (_Scale > 1) {
					_IMG.style.left = (_X = touches[0].clientX - startX) +'px';
					_IMG.style.top  = (_Y = touches[0].clientY - startY) +'px';
				} else {
					_IMG.style.top  = (/**/ touches[0].clientY - startY) +'px';
				}
			});
			_IMG.addEventListener('touchend', ({ touches, changedTouches }) => {
				if (!touches.length && _Scale <= 1) {
					if (changedTouches[0].clientY >= 25) {
						self.setImagePos( _IMG.width, _IMG.height );
					} else
						cleanUp();
				}
			});
			_Overlay.addEventListener('touchstart', handler);
		} else {

			_IMG.addEventListener('mousedown', e => {

				if ( e.button != 0 ) return;

				const style  = e.target.style;
				const startX = e.clientX - _X;
				const startY = e.clientY - _Y;
				const dragIMG = ({ clientX, clientY }) => {
					style.left = (_X = clientX - startX) +'px';
					style.top  = (_Y = clientY - startY) +'px';
				}
				const rmHandle = () => {
					window.removeEventListener('mousemove', dragIMG);
					window.removeEventListener('mouseup', rmHandle);
				}
				window.addEventListener('mousemove', dragIMG);
				window.addEventListener('mouseup', rmHandle);
				e.preventDefault();
			});
			_IMG.addEventListener('wheel', e => {

				const delta = e.deltaX || e.deltaY;
				const ratio = _Scale / 7.4;

				if (delta > 0 && (_Scale - ratio ) > 0.1) {
					Dynamic_Style['Center Image Scale'] = (_Scale -= ratio);
				} else if (delta < 0) {
					Dynamic_Style['Center Image Scale'] = (_Scale += ratio);
				}
				e.preventDefault();
			});
			_Overlay.addEventListener('click', handler);
		}
		this._Overlay = _Overlay;
		this._IMG     = _Overlay.firstElementChild.appendChild( _IMG );

		this.setImagePos = (w, h) => {
			_IMG.style.left = `${ (_X = 0 - w / 2) }px`;
			_IMG.style.top  = `${ (_Y = 0 - h / 2) }px`;
		}
	}
	handleEvent() {

		const { naturalWidth, naturalHeight } = this._IMG;
		const {   innerWidth,   innerHeight } = window;

		var iW = naturalWidth, iH = naturalHeight, iS = innerWidth < 960 ? 1 : 0.85;

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
		this._IMG.style.visibility = 'visible';
		this.setImagePos(
			(this._IMG.width  = iW),
			(this._IMG.height = iH)
		);
	}
	expose(src) {

		this._IMG.style.visibility = 'hidden';
		this._IMG.src = src;

		window.addEventListener('resize', this, false);

		document.body.append( this._Overlay );
	}
}

function addPreviewHandler(comment, attrs, _MOUSE_ = false) {

	_setup(comment, attrs, { click: e => {

		const el     = e.target,
		      aClass = el.classList[0],
		      parent = el.parentNode;

		let alter = true;

		switch (aClass) {
		case 'shrink-line':
			el.textContent = `${ parent.classList.toggle('shrinked') ? 'Раз' : 'С' }вернуть`;
			parent.scrollIntoView();
			break;
		case 'shrink-text':
			parent.classList.toggle('cutted');
			break;
		case 'link-self':
		case 'link-navs':
		case 'link-pref':
			var cid  = el.getAttribute('cid');
			_offset_ = 1;
			['Close Preview', 'Open Preview', el.href].forEach(Timer.clear);
			removePreviews();
			goToCommentPage(cid).catch(() => {
				const href = el.pathname + el.search;
				(_loads_[href] || loadFullPage(href)).then(() => {
					goToCommentPage(cid);
				});
			});
			break;
		case 'quoteComment':
			alter = false;
		case 'replyComment':
			var [ name, cid ] = comment.id.split('-');
			var href = el.getAttribute('href');
			if (name === 'preview') {
				goToCommentPage(cid).then(target => {
					toggleForm(target.lastElementChild.lastElementChild, href, !alter);
				});
			} else {
				toggleForm(comment.lastElementChild.lastElementChild, href, !alter);
			}
			break;
		case 'medium-image':
			alter = false;
		case 'link-image':
			if (USER_SETTINGS['Picture Viewer'] > alter) {
				CentralPicture.expose((alter ? el : parent).href);
				break;
			}
		default:
			return;
		}
		e.preventDefault();
	}});
	
	if (_MOUSE_) {
		
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
		}, !TOUCH_DEVICE);
		
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
			for (var type in _Events) {
				if (Array.isArray(_Events[type])) {
					_Events[type].forEach(fn => el.addEventListener(type, fn, false))
				} else
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
	var m = uri.match(/^(?:https?:\/\/www\.linux\.org\.ru)?(\/[^\/]+\/(?!archive)[^\/]+\/(\d+))(?:\/page([0-9]+))?/);
	if (m) {
		out.path  = m[1];
		out.topic = m[2];
		out.page  = Number(m[3]) || 0;
	}
	return out;
}

function parseReplyUrl(uri) {
	const [, topic = '0', replyto = '0'] = uri.match(/\?topic=(\d+)(?:\&replyto=(\d+))?/) || '';
	return {
		topic, replyto
	};
}

function getDataResponse(uri, resolve, reject = () => void 0) {
	const xhr = new XMLHttpRequest;
	xhr.withCredentials = true;
	xhr.open('GET', location.origin + uri, true);
	xhr.onreadystatechange = () => {
		if (xhr.readyState !== 4)
			return;
		xhr.status === 200 ? resolve(xhr) : reject(xhr);
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
		html : ''+
			'<button type="button" class="btn btn-default" lorcode="b"></button>'+
			'<button type="button" class="btn btn-default" lorcode="i" markdown="*"></button>'+
			'<button type="button" class="btn btn-default" lorcode="u"></button>'+
			'<button type="button" class="btn btn-default" lorcode="s" markdown="~~"></button>'+
			'<button type="button" class="btn btn-default" lorcode="em"></button>'+
			'<button type="button" class="btn btn-default" lorcode="br"></button>'+
			'<button type="button" class="btn btn-default" lorcode="cut" markdown="&gt;&gt;&gt;"></button>'+
			'<button type="button" class="btn btn-default" lorcode="list" markdown="1."></button>'+
			'<button type="button" class="btn btn-default" lorcode="strong"></button>'+
			'<button type="button" class="btn btn-default" lorcode="pre" markdown="* "></button>'+
			'<button type="button" class="btn btn-default" lorcode="user" markdown="@"></button>'+
			'<button type="button" class="btn btn-default" lorcode="code" markdown="&#96;&#96;&#96;"></button>'+
			'<button type="button" class="btn btn-default" lorcode="inline" markdown="&#96;"></button>'+
			'<button type="button" class="btn btn-default" lorcode="quote" markdown="&gt;"></button>'+
			'<button type="button" class="btn btn-default" lorcode="url" markdown="http://"></button>'}, {
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

	if (!form.elements['cancel']) {
		form.elements['preview'].after(
			'\n', _setup('button', { type: 'button', class: 'btn btn-default', id: 'cancel', text: 'Отмена' })
		)
	} else
		_setup(form.elements['cancel'], { type: 'button', name: void 0, id:  'cancel' });

	form.elements['csrf'].value = TOKEN;

	for (const submit_btn of FACT_PANNEL.querySelectorAll('[type="submit"]')) {
		_setup(submit_btn, { type: 'button', name: void 0, id: submit_btn.name, 'do-upload': '' });
	}

		const refresh_preview = () => {

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
		}

		const submit_process = (sbtn, y) => {
			form.elements[ 'cancel'].className = `btn btn-${ y ? 'danger' : 'default' }`;
			form.elements['preview'].disabled  = sbtn.disabled = y;
			sbtn.classList[y ? 'add' : 'remove']('process');
			for (const primary of FACT_PANNEL.querySelectorAll('.btn[do-upload]')) {
				primary.disabled = y;
			}
		}

		const purge_form = (clry) => {

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
		}

	const doSubmit = {

		handleEvent: function({ target }) {

			const { type, id } = target;

			if (type === 'button') {
				if (`do_${id}` in this) {
					this[`do_${id}`]();
				} else if (target.hasAttribute('do-upload')) {
					this.do_upload(target, id);
				}
			}
		},

		'do_upload': function(btn, param) {

			submit_process(btn, true);

			Timer.set('Upload Post Delay', () => {

				const formData = new FormData( form );
				const targetId = (form.elements['original'] || { value: 'last' }).value

				if (param)
					formData.append(param, '');

				sendFormData(ACTION_JSP, formData, false).then(({ url }) => {
					if (!USER_SETTINGS['Realtime Loader'] || parseLORUrl(url).topic != LOR.topic) {
						window.onbeforeunload = null;
						location.href         = url + (
							/(?:#comment-|(?:\?|&)cid=)\d+$/.test(url) ? '' : '#comment-'+ targetId
						);
						return;
					}
					submit_process(btn, false);
					purge_form(true);
				}).catch(({ status, statusText }) => {
					form.appendChild( NODE_PREVIEW ).children[0].innerHTML = `Не удалось выполнить запрос, попробуйте повторить еще раз.\n(${ status +' '+ statusText })`;
					submit_process(btn, false);
				});
			}, USER_SETTINGS['Upload Post Delay'] * 1e3);
		},

		'do_preview': function() {

			if (NODE_PREVIEW.hasAttribute('opened')) {
				NODE_PREVIEW.removeAttribute('opened', '');
				NODE_PREVIEW.remove();
				TEXT_AREA.oninput = null;
			} else {
				refresh_preview();
				form.appendChild( NODE_PREVIEW ).setAttribute('opened', '');
				TEXT_AREA.oninput = () => Timer.set('Refresh Preview', refresh_preview, 1e3);
			}
		},

		'do_cancel': function() {

			if (form.elements['cancel'].classList.contains('btn-danger')) {
				Timer.clear('Upload Post Delay');
				submit_process(FACT_PANNEL.querySelector('.process[do-upload]'), false);
				alert('Отправка прервана.');
			} else {
				const length = TEXT_AREA.textLength + form.elements['title'].value.length;
				const answer = length > 0 && confirm('Очистить форму?');
				purge_form(answer);
			}
		}
	}

	FACT_PANNEL.addEventListener('click', doSubmit);
	TEXT_AREA.addEventListener('click', ({ target }) => target.classList.remove('select-break'));
	
	window.addEventListener('keyup', () => { _ctrl_ = false });
	window.addEventListener('keydown', e => {
		if (!(_ctrl_ = e.ctrlKey) && e.keyCode == 9 && e.target === TEXT_AREA) {
			e.preventDefault();
			lorcodeMarkup.call(e.target, '   ', '\n   ');
		}
	});
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
				_setup('select', { style: 'display: block;', html: '<option>Markdown</option><option>LORCODE</option>' }, { change: mode_change }),
				form.firstElementChild
			)
		});
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
			getDataResponse(`/tags?term=${(keywd = term)}`, ({ responseText }) => {

				const possibleTags = JSON.parse(responseText);
				
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

function toggleForm(underc, href, quote) {

	const { topic, replyto } = parseReplyUrl(href);

	const formel = LOR.CommentForm.elements;
	const parent = LOR.CommentForm.parentNode;

	let toshow = (parent.style['display'] == 'none');

	if (quote) {
		convMsgBody(
			underc.querySelector('[itemprop="articleBody"]') || underc
		);
		if (parent.parentNode === underc && !toshow)
			return;
	}
	if (formel.replyto.value != replyto) {
		parent.style['display'] = 'none';
		toshow = true;
	}

	const slideCompl = () => {
		if (!toshow) {
			parent.style['display'] = 'none';
		} else
			formel.msg.focus();
		parent.className = 'form-container';
		parent.removeEventListener('animationend', slideCompl);
	}
	if (toshow) {
		_setup(parent, { class: 'form-container slide-down' }, { 'animationend': slideCompl });
		underc.appendChild(parent).style['display'] = null;
		formel['replyto'].value = replyto;
		formel[ 'topic' ].value = topic;
	} else {
		_setup(parent, { class: 'form-container slide-up' }, { 'animationend': slideCompl });
	}
}

function handleReplyToBtn(btn) {

	const href   = btn.getAttribute('href');
	const parent = btn.parentNode;

	btn.remove(), parent.append(
		_setup('a', { class: 'replyComment', href, text: 'Ответить'}),
		'\n.\n',
		_setup('a', { class: 'quoteComment', href, text: 'с цитатой'})
	);
}

function convMsgBody(msg) {

	let open = '>',
	   close = '\n>',
	    text = '';
	
	if (!MARKDOWN_MODE) { // lorcode, line-break
		let nobl = msg.querySelector('div.code,pre,ul,ol,table');
		if (nobl && (nobl = nobl.parentNode.className != 'reply'))
			open = '[quote]', close = '[/quote]';
		text = domToLORCODE(msg.childNodes, !nobl);
	} else
		text = domToMarkdown(msg.childNodes); // markdown
	
	lorcodeMarkup.call(LOR.CommentForm.elements['msg'], open, close, text.replace(/(?:[\n]+){3,}/g, '\n\n').trim());
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
				if (el.classList[0] === 'code')
					text += `[inline]${ getRawText(el) }[/inline]`;
				else if (el.children.length && el.children[0].localName === 'img')
					text += `[user]${ el.children[1].innerText }[/user]`;
				break;
			case 'DIV':
				if (el.classList[0] === 'code') {
					let lng = el.lastElementChild.className.replace(/^.+\-(?:highlight|(.+))$/, '$1');
					text += `[code${ lng ? '='+ lng : '' }]\n${ el.lastElementChild.innerText.replace(/[\n+]$|$/, '') }[/code]\n`;
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

function listToMarkdown(listNodes, order = false, deep = 0) {
	
	var text = '', ln = ' '.repeat(deep) + (order ? '%d. ' : '* ');

	deep += 3;
	
	for (let i = 0; i < listNodes.length;) {
		let li = listNodes[i++];
		switch (li.tagName) {
			case 'UL': text += listToMarkdown(li.children,false, deep); break;
			case 'OL': text += listToMarkdown(li.children, true, deep); break;
			case 'LI': text += ln.replace('%d', i) + domToMarkdown(li.childNodes, deep) +'\n';
		}
	}
	return `${ text }\n\n`;
}

function domToMarkdown(childNodes, deep = 0) {
	
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
				if (el.classList[0] === 'code')
					text += `\`${ getRawText(el) }\``;
				else if (el.children.length && el.children[0].localName === 'img')
					text += '@'+ el.children[1].innerText;
				break;
			case 'DIV':
				if (el.classList[0] === 'code') {
					let lng = el.lastElementChild.className.replace(/^.+\-(?:highlight|(.+))$/, '$1');
					text += '```'+ lng +'\n'+ el.lastElementChild.innerText.replace(/[\n+]$|$/, '\n```\n');
				} else if (/^cut[0-9]+$/.test(el.id)) {
					text += domToMarkdown(el.childNodes); //`>>>\n${ domToMarkdown(el.childNodes) }\n>>>\n`;
				}
				break;
			case 'BLOCKQUOTE':
				text += '>'+ domToMarkdown(el.childNodes)
					.replace(/\n/g, '\n>')
					.replace(/([>]+(?:\n|$)){2,}/gm, '$1') +'\n';
				break;
			case 'UL': text += listToMarkdown(el.children,false, deep); break;
			case 'OL': text += listToMarkdown(el.children, true, deep); break;
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
	
	var main_events_count;
	var opened = true;
	
	if (typeof chrome !== 'undefined' && chrome.runtime) {

		const portConnect = resolve => {
			const port = chrome.runtime.connect();
			port.onMessage.addListener(({ name, data }) => {
				switch (name) {
					case 'new-notes':
						if (main_events_count)
							main_events_count.textContent = data;
						break;
					case 'connection-resolve':
						console.info('WebExt Runtime Connected!');
						resolve((opened = true));
					case 'settings-change':
						for (const key in data) {
							Dynamic_Style[key] = USER_SETTINGS[key] = data[key];
						}
				}
			});
			port.onDisconnect.addListener(() => {
				console.warn('WebExt Runtime Disconnected!');
				opened = false;
			});
		}

		const sendMessage = action => {
			if (opened) {
				chrome.runtime.sendMessage({ action });
			} else {
				new Promise(portConnect).then(() => chrome.runtime.sendMessage({ action }));
			}
		}

		const sync = new Promise(portConnect);

		return {
			checkNow : () => sendMessage( 'l0rNG-checkNow' ),
			reset    : () => sendMessage( 'l0rNG-reset' ),
			init     : () => {
				if ( (main_events_count = document.getElementById('main_events_count')) ) {
					// We can't show notification from the content script directly,
					// so let's send a corresponding message to the background script
					sync.then(() => sendMessage( 'l0rNG-reval' ));
				}
				return sync;
			}
		}
	} else {

		let notes = localStorage.getItem('l0rNG-notes') || '';
		let delay = 55e3 + Math.floor(Math.random() * 1765);

		const sendNotify = (permission => {
			// Определяем статус оповещений:
			var granted = (permission === 'granted'); // - разрешены

			switch (permission) {
				case 'denied':  // - отклонены
					return () => void 0;
				case 'default': // - требуется подтверждение
					Notification.requestPermission(p => { granted = (p === 'granted'); });
			}
			return count => {
				if (USER_SETTINGS['Desktop Notification'] && granted) {
					const notif = new Notification('LINUX.ORG.RU', {
						icon: '/tango/img/linux-logo.png',
						body: `\n${ count } новых ответов`,
					});
					notif.onclick = () => { window.focus() };
				}
			}
		})( window.Notification ? Notification.permission : 'denied' );
		
		const defaults   = Object.assign({}, USER_SETTINGS);
		const startWatch = getDataResponse.bind(null, '/notifications-count',
			({ response }) => {
				if (response != 0) {
					if (notes != response) {
						localStorage.setItem('l0rNG-notes', (notes = response));
						sendNotify(response);
					}
					main_events_count.textContent = '('+ response +')';
					lorypanel.children['lorynotify'].setAttribute('notes-cnt', response);
				} else {
					main_events_count.textContent = '';
					lorypanel.children['lorynotify'].removeAttribute('notes-cnt');
					notes != '' && App.reset();
				}
				Timer.set('Check Notifications', startWatch, delay);
			}, ({ status }) => {
				if (status < 400 || status >= 500)
					Timer.set('Check Notifications', startWatch, delay * (status >= 500 ? 5 : 1));
			});
		
		const setValues = items => {
			for (const name in Object.assign(USER_SETTINGS, items)) {
				 const input   = loryform.elements[name],
				       param   = input.type === 'checkbox' ? 'checked' : 'value';
				input[ param ] = Dynamic_Style[name] = USER_SETTINGS[name];
			}
		}

		const onValueChange = input => {
			switch (input.type) {
				case 'checkbox':
					USER_SETTINGS[input.id] = input.checked;
					break;
				default:
					const min = Number (input.min || 0);
					const val = Number (input.value);
					Dynamic_Style[input.id] = USER_SETTINGS[input.id] = val >= min ? val : (input.value = min);
			}
			localStorage.setItem('lorify-ng', JSON.stringify(USER_SETTINGS));
			loryform.classList.add('save-msg');
		}
		
		const loryform = _setup('form', { id: 'loryform', class: 'info-line', html: `
			<div class="tab-row">
				<span class="tab-cell">Автоподгрузка комментариев:</span>
				<span class="tab-cell"><input type="checkbox" id="Realtime Loader"></span>
			</div>
			<div class="tab-row">
				<span class="tab-cell">Укорачивать блоки кода свыше:</span>
				<span class="tab-cell"><input type="number" id="Code Block Short Size" min="0" step="1">
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
				<span class="tab-cell">Просмотр картинок:</span>
				<span class="tab-cell">
					<select id="Picture Viewer">
						<option value="0">Откл.</option>
						<option value="1">Только для превью</option>
						<option value="2">Для превью и ссылок</option>
					</select>
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
				<span class="tab-cell">Перемещать в начало страницы:</span>
				<span class="tab-cell"><input type="checkbox" id="Scroll Top View">
				</span>
			</div>
			<div class="tab-row">
				<span class="tab-cell">CSS анимация:</span>
				<span class="tab-cell"><input type="checkbox" id="CSS3 Animation">
					<input type="button" id="resetSettings" value="сброс" title="вернуть настройки по умолчанию">
				</span>
			</div>`}, {
				animationend: () => loryform.classList.remove('save-msg'),
				change: ({ target }) => {
					opened && onValueChange(target);
				},
				input : ({ target }) => {
					opened = false;
					Timer.set('Settings on Changed', () => {
						opened = true;
						onValueChange(target);
					}, 750)
				}
			});
			
		setValues( JSON.parse(localStorage.getItem('lorify-ng')) );
		loryform.elements.resetSettings.onclick = () => {
			setValues( defaults );
			localStorage.setItem('lorify-ng', JSON.stringify(defaults));
			loryform.classList.add('save-msg');
		}

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
			.tab-cell input[type="number"] {
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
			#loginGreating { margin-right: 42px!important; }
			#resetSettings, .info-line:before { position: absolute; right: 0; }
			.info-line:before {
				-webkit-animation: apply 2s linear 1;
				animation: apply 2s linear 1;
				color: red;
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
				#loryform { right: 0; }
			}
			@keyframes apply {
				0% { opacity: .2; } 50% { opacity: 1; } 100% { opacity: 0; }
			}
			@-webkit-keyframes apply {
				0% { opacity: .2; } 50% { opacity: 1; } 100% { opacity: 0; }
			}
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
		window.addEventListener('storage', ({ key, newValue }) => {
			if (key === 'l0rNG-notes') {
				main_events_count.textContent = newValue ? '('+ newValue +')' : '';
				lorypanel.children['lorynotify'][`${newValue ? 'set' : 'remove'}Attribute`]('notes-cnt', (notes = newValue));
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
	function o(comment) {

		const shrink_size = USER_SETTINGS['Code Block Short Size'];
		const addSpoiler  = shrink_size < 20 ? block => {
			block.classList.add('cutted');
			block.prepend( _setup('span', { class: 'shrink-text' }) );
		} : (block, height) => {
			if (!height) {
				block.classList.add('suplied');
			} else if (height > shrink_size) {
				block.classList.add('shrinked');
				block.prepend(
					_setup('div', { class: 'shrink-line', text: 'Развернуть' })
				);
			}
		}
		Array.prototype.map.call(comment.getElementsByTagNameNS("http://www.w3.org/1999/xhtml", "pre"), A).filter(Boolean).forEach(
			code => {
				addSpoiler(
					code.parentNode.parentNode.classList[0] === 'code' ? code.parentNode.parentNode : code.parentNode,
					code.offsetHeight
				);
				p(code, hljs.tabReplace);
			}
		);
		comment.querySelectorAll(
			['jpg','jpeg','png','gif','svg','webp'].map(ext => `a[href*=".${ext}?"],a[href$=".${ext}"]`).join(',')
		).forEach(a => {
			a.className = 'link-image';
		});
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
