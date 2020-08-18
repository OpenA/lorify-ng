
const loryform = document.forms['loryform'];
const n_count  = document.getElementById('note-count');
const note_lst = document.getElementById('note-list');
const port     = chrome.runtime.connect();

var busy_id    = -1,
	cnt_new    =  0,
	empty_list = true,
	reset_form = null;
	
chrome.runtime.getBackgroundPage(({ notes }) => {
	
	if (notes > 0) {
		n_count.setAttribute('cnt-new', (cnt_new = notes));
		n_count.hidden = false;
		if (location.hash === '#notifications')
			showNotifications();
	}
});

loryform.addEventListener('animationend', () => loryform.classList.remove('save-msg'));
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

port.onMessage.addListener(({ name, data }) => {
	switch (name)
	{
	case 'notes-count-update':
		if (!empty_list) {
			for (const item of Array.from( note_lst.lastElementChild.children ))
				item.remove();
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
});
n_count.addEventListener('click', showNotifications);
note_lst.addEventListener('click', function(e) {
	switch (e.target.id)
	{
	case 'go-back'    : this.hidden = true; break;
	case 'reset-notes':
		if (reset_form && !e.target.disabled) {
			e.target.disabled = true;
			fetch('https://www.linux.org.ru/notifications-reset', {
				credentials: 'same-origin',
				method: 'POST',
				body: new FormData( reset_form )
			}).then(({ ok }) => {
				if (ok) {
					port.postMessage({ action: 'l0rNG-notes-reset' });
					reset_form = null;
				}
				e.target.disabled = false;
			});
		}
		break;
	default:
		var    el  = e.target;
		while( el != this && el.classList[0] !== 'note-item' )
		       el  = el.parentNode;
		if(    el.hasAttribute('comment-link') ) {
			port.postMessage({
				action : 'l0rNG-open-tab',
				data   : el.getAttribute('comment-link')
			});
		}
	}
});
document.getElementById('reset-settings').addEventListener('click', () => {
	port.postMessage({ action: 'l0rNG-setts-reset' });
	loryform.classList.add('save-msg');
});

function showNotifications() {
	if (empty_list) {
		empty_list = false;
		pullNotes(cnt_new);
	}
	note_lst.hidden = false;
}

function onValueChange(input) {
	const changes = {};
	switch (input.type) {
		case 'checkbox':
			changes[input.id] = input.checked;
			break;
		default:
			const min = Number (input.min || 0);
			const val = Number (input.value);
			changes[input.id] = val >= min ? val : (input.value = min);
	}
	port.postMessage({ action: 'l0rNG-setts-change', data: changes });
	loryform.classList.add('save-msg');
}

function setValues(items) {
	for (const name in items) {
		loryform.elements[name][
			loryform.elements[name].type === 'checkbox'
			? 'checked'
			: 'value'] = items[name];
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
