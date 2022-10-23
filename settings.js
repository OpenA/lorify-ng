
const loryform = document.getElementById('loryform');
const n_count  = document.getElementById('note-count');
const note_lst = document.getElementById('note-list');
const rst_btn  = document.getElementById('reset-settings');

let busy_id    = -1, not_ld = true,
	cnt_new    =  0,
	my_connect = new Promise(createPort);

const showNotifications = () => {
	history.replaceState(null, null, location.pathname +'#notifications');
	note_lst.hidden = false;
	if (not_ld)
		updNotifications(cnt_new);
}

if (location.hash === '#notifications')
	note_lst.hidden = false;

loryform.addEventListener('animationend', () => {
	loryform.classList.remove('save-msg');
});
loryform.addEventListener('change', ({ target }) => {
	if (busy_id === -1)
		onValueChange(target);
});
loryform.addEventListener('input', ({ target }) => {
	clearTimeout(busy_id);
	busy_id = setTimeout(() => {
		busy_id = -1;
		onValueChange(target);
	}, 750);
});

rst_btn.addEventListener('click', () => applyAnim('l0rNG-setts-reset', null, true));
n_count.addEventListener('click', showNotifications);
note_lst.addEventListener('click', e => {
	let el = e.target;
	switch (el.id) {
	case 'go-back'    : note_lst.hidden = true; history.replaceState(null, null, location.pathname);
	case 'do-wait'    : break;
	case 'reset-notes':
		if ('reset_form' in document.forms) {
			el.id = 'do-wait';
			fetch('https://www.linux.org.ru/notifications-reset', {
				credentials: 'same-origin',
				method: 'POST',
				body: new FormData( document.forms.reset_form )
			}).then(({ ok }) => {
				if (ok) {
					applyAnim('l0rNG-notes-set', 0);
					document.forms.reset_form.remove();
				}
				el.id = 'reset-notes';
			});
		}
		break;
	default:
		while( el !== note_lst && el.classList[0] !== 'note-item' )
		       el  = el.parentNode;
		if(    el.hasAttribute('comment-link') ) {
			applyAnim('l0rNG-open-tab', el.getAttribute('comment-link'));
		}
	}
});

function createPort(resolve) {
	const port = chrome.runtime.connect();
	port.onMessage.addListener(({ action, data }) => {
		switch (action) {
		case 'notes-show':
			showNotifications();
			break;
		case 'code-styles-list':
			const input = loryform.elements['Code Highlight Style'];
			for (const cname of data) {
				input.appendChild( document.createElement('option') ).textContent = cname;
			}
			break;
		case 'notes-count-update':
			n_count.setAttribute('cnt-new', data);
			n_count.hidden = !(cnt_new = Number(data));
			if (!note_lst.hidden && not_ld)
				updNotifications(cnt_new);
			break;
		case 'connection-resolve':
			port.postMessage({ action: 'l0rNG-extra-sets', data: null })
			resolve(port);
		case 'settings-change':
			setValues(data);
		}
	});
	port.onDisconnect.addListener(() => {
		my_connect = null;
	});
}

function applyAnim(action = '', data = null, anim = false) {
	if (anim)
		loryform.classList.add('save-msg');
	if(!my_connect)
		my_connect = new Promise(createPort)
	my_connect.then(
		port => port.postMessage({ action, data })
	);
}

function updNotifications(count = 0) {
	let tr_lst = note_lst.lastElementChild.children,
	    do_upd = count > 0 && tr_lst.length < count;

	if (tr_lst.length) {
		for(let i = do_upd ? 0 : count; tr_lst[i];)
			tr_lst[i].remove();
	}
	if (do_upd) {
		not_ld = false;
		fetch('https://www.linux.org.ru/notifications', {
			credentials: 'same-origin',
			method: 'GET'
		}).then(res => {
			if (res.ok)
			    res.text().then(pullNotes);
			not_ld = true;
		});
	}
}

function onValueChange(input) {
	const changes = {};
	let { name, type, value, min, max } = input;
	if (min && Number(value) < Number(min)) input.value = value = min; else
	if (max && Number(value) > Number(max)) input.value = value = max;
	changes[name] = (
		type === 'select-one' ? input.selectedIndex :
		type === 'checkbox'   ? input.checked : Number(value)
	);
	applyAnim('l0rNG-setts-change', changes, true);
}

function setValues(items) {
	for (const name in items) {
		 const i_el = loryform.elements[name], type = i_el.type,
		      param = type === 'select-one' ? 'selectedIndex' :
			          type === 'checkbox' ? 'checked' : 'value';
		i_el[param] = type ? items[name] : Number(items[name]);
	}
}

function pullNotes(html) {

	const doc = new DOMParser().parseFromString(html, 'text/html'),
	      trs = doc.querySelectorAll('.message-table tr'),
	     list = note_lst.lastElementChild,
	    limit = cnt_new > trs.length ? trs.length : cnt_new;

	const new_rf = doc.forms.reset_form;
	const old_rf = document.forms.reset_form;

	if (new_rf) {
		new_rf.hidden = true;
		if (old_rf) {
			document.body.replaceChild(new_rf, old_rf);
		} else
			document.body.appendChild(new_rf);
	}

	for (let i = 0; i < limit; i++) {

		const CALL_TYPE = trs[i].children[0].firstElementChild;
		const LINK_ELEM = trs[i].children[1].firstElementChild;
		const TIME_ELEM = trs[i].children[2].firstElementChild;
		const USER_NAME = trs[i].children[2].lastChild;

		const item = document.createElement('div' ); item.className = 'note-item';
		const tags = document.createElement('div' ); tags.className = 'note-item-tags';
		const info = document.createElement('div' ); info.className = 'note-item-info';
		const op_c = document.createElement('div' ); op_c.className = 'note-item-topic';
		const user = document.createElement('span'); user.className = 'note-item-user';
		const time = document.createElement('span'); time.className = 'note-item-time';

		let secn = Math.floor((Date.now() - new Date( TIME_ELEM.dateTime )) * 0.001), chr;
			secn < 60   ? (chr = 'cек', secn %= 60)  :
			secn < 3600 ? (chr = 'мин', secn = Math.floor(secn / 60) % 60) :
			secn < 86400? (chr = 'ч'  , secn = Math.floor(secn / 3600)) :
			              (chr = 'дн' , secn = Math.floor(secn / 86400));

		time.setAttribute( 'chr', chr )  , time.textContent = secn;
		item.setAttribute( 'comment-link', 'lor:/'+ LINK_ELEM.pathname + LINK_ELEM.search );
		info.setAttribute( 'answer'      , CALL_TYPE && (
			CALL_TYPE.classList.contains('icon-user-color' ) ? 'пригл.' :
			CALL_TYPE.classList.contains('icon-reply-color') ? 'ответ'  : '') || 'новый'
		);
		if (/^[\s\n]*\d+[\s\n]*$/.test(USER_NAME.textContent))
			USER_NAME.insertData(1, '💬 ');
		tags.append( ...LINK_ELEM.children );
		op_c.append( LINK_ELEM.lastChild );
		item.append( tags, info, op_c );
		info.append( user, time );
		user.append( USER_NAME );
		list.append( item );
	}
}
