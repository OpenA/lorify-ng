
const loryform = document.forms['loryform'];
const n_count  = document.getElementById('note-count');
const note_lst = document.getElementById('note-list');

var busy_id    = -1,
	iterate    =  2,
	cnt_new    =  0,
	empty_list = true,
	reset_form = null;

Object.defineProperty(loryform, '_port_', {
	configurable: true, value: createPort()
});

chrome.runtime.getBackgroundPage(({ notes, codestyles }) => {
	
	if (notes > 0) {
		n_count.setAttribute('cnt-new', (cnt_new = notes));
		n_count.hidden = false;
	}
	if (location.hash === '#notifications')
		showNotifications();
	if (codestyles) {
		const input = loryform.elements['Code Highlight Style'];
		for(const name of codestyles) {
			input.appendChild( document.createElement('option') ).textContent = name;
		}
	}
});

loryform.addEventListener('animationiteration', () => {
	if ((iterate--) > 0)
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

document.getElementById('reset-settings').addEventListener('click', applyAnim.bind(null, { action: 'l0rNG-setts-reset' }));
n_count.addEventListener('click', showNotifications);
note_lst.addEventListener('click', navClickHandler);

function msgPortHadler({ name, data }) {
	switch (name)
	{
	case 'notes-count-update':
		if (!empty_list) {
			while (note_lst.lastElementChild.children[0])
				   note_lst.lastElementChild.children[0].remove();
			if (data > 0)
				pullNotes(data);
		}
		n_count.setAttribute('cnt-new', (cnt_new = data));
		n_count.hidden = data === 0;
		break;
	case 'connection-resolve':
	case 'settings-change':
		setValues(data);
	}
}

function navClickHandler(e) {
	switch (e.target.id)
	{
	case 'go-back'    : this.hidden = true; history.replaceState(null, null, location.pathname);
	case 'do-wait'    : break;
	case 'reset-notes':
		if (reset_form) {
			e.target.id = 'do-wait';
			fetch('https://www.linux.org.ru/notifications-reset', {
				credentials: 'same-origin',
				method: 'POST',
				body: new FormData( reset_form )
			}).then(({ ok }) => {
				if (ok) {
					loryform._port_.postMessage({ action: 'l0rNG-notes-reset' });
					reset_form = null;
				}
				e.target.id = 'reset-notes';
			});
		}
		break;
	default:
		var    el  = e.target;
		while( el != this && el.classList[0] !== 'note-item' )
		       el  = el.parentNode;
		if(    el.hasAttribute('comment-link') ) {
			loryform._port_.postMessage({
				action : 'l0rNG-open-tab',
				data   : el.getAttribute('comment-link')
			});
		}
	}
}

function createPort() {
	const port = chrome.runtime.connect();
	port.onMessage.addListener(msgPortHadler);
	port.onDisconnect.addListener(() => {
		Object.defineProperty(loryform, '_port_', {
			configurable: true,
			get: () => {
				const value = createPort();
				Object.defineProperty(loryform, '_port_', { configurable: true, value });
				return value;
			}
		});
	});
	return port;
}

function applyAnim(changes) {
	iterate = 2;
	loryform.classList.add('save-msg');
	loryform._port_.postMessage(changes);
}

function showNotifications() {
	if (empty_list) {
		empty_list = false;
		if (cnt_new > 0)
			pullNotes(cnt_new);
	}
	history.replaceState(null, null, location.pathname +'#notifications');
	note_lst.hidden = false;
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
	applyAnim({ action: 'l0rNG-setts-change', data: changes });
}

function setValues(items) {
	for (const name in items) {
		 const i_el = loryform.elements[name], type = i_el.type,
		      param = type === 'select-one' ? 'selectedIndex' :
			          type === 'checkbox' ? 'checked' : 'value';
		i_el[param] = type ? items[name] : Number(items[name]);
	}
}

function pullNotes(limit) {

	fetch('https://www.linux.org.ru/notifications', {
		credentials: 'same-origin',
		method: 'GET'
	}).then(response => {
		if (response.ok) {
			response.text().then(html => {
				const doc = new DOMParser().parseFromString(html, 'text/html'),
					  trs = doc.querySelectorAll('.message-table tr'),
					 list = note_lst.lastElementChild;
				if (limit > trs.length)
					limit = trs.length;

				reset_form = doc.forms.reset_form;

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

					let secn = Math.floor((Date.now() - new Date( TIME_ELEM.dateTime )) * 0.001);
						secn < 60   ? (time.setAttribute('chr','cек'), time.textContent =            secn % 60      ) :
						secn < 3600 ? (time.setAttribute('chr','мин'), time.textContent = Math.floor(secn / 60) % 60) :
									  (time.setAttribute('chr','ч'  ), time.textContent = Math.floor(secn / 3600)   ) ;

					item.setAttribute( 'comment-link', LINK_ELEM.pathname + LINK_ELEM.search );
					info.setAttribute( 'answer'      , CALL_TYPE && (
						CALL_TYPE.classList.contains('icon-user-color' ) ? 'пригл.' :
						CALL_TYPE.classList.contains('icon-reply-color') ? 'ответ'  : '') || 'новый'
					);
					tags.append( ...LINK_ELEM.children );
					op_c.append( LINK_ELEM.lastChild );
					item.append( tags, info, op_c );
					info.append( user, time );
					user.append( USER_NAME );
					list.append( item );
				}
			});
		}
	});
}
