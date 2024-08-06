
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
	    items = Array.from(doc.querySelector('.notifications').children),
	     list = note_lst.lastElementChild,
	    limit = cnt_new > items.length ? items.length : cnt_new;

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
		const item = items[i],
		     title = item.children[1],
		      icon = item.children[0], type = icon.firstElementChild.firstElementChild,
		    detail = item.children[2], tags = detail.firstElementChild.firstElementChild,
		      info = item.children[3], time = info.firstElementChild.lastElementChild;

		let who = time.previousSibling,
			tip = '', chr = 'cек', usr,
			num = detail.innerText;
  
		if (tags && tags.className === 'reactions') {
			usr = time.parentNode.insertBefore(tags, time);
			usr.append(who);
		} else {
			if (!time.previousElementSibling){
				usr = time.parentNode.insertBefore(document.createElement('span'), time);
				usr.append(who);
			} else 
				usr = time.previousElementSibling;
			if (tags && tags.className === 'tag')
				usr.append(...detail.firstElementChild.children);
		}
		item.className  = 'note-item';
		info.className  = 'note-item-info';
		title.className = 'note-item-topic';
		usr.className   = 'note-item-user';
		time.className  = 'note-item-time';

		let sec = Math.floor((Date.now() - new Date( time.dateTime )) / 1000);
		if (sec >= 86400) chr = 'дн' , sec = Math.floor(sec / 86400); else
		if (sec >= 3600 ) chr = 'ч'  , sec = Math.floor(sec / 3600); else
		if (sec >= 60   ) chr = 'мин', sec = Math.floor(sec /  60) % 60;

		if (type) {
			tip = type.title;
			if (tip.endsWith('удалено')) {
				tip = 'Удалено';
				who.textContent = num;
				usr.classList.add('modmes');
			} else if (type.classList.contains('icon-user-color'))
				tip = 'Приглашён';
		} else if (num > 0) {
			tip = 'Новое';
			who.textContent = `${num}💬\n`;
		}
		time.textContent = sec,
		time.setAttribute('data-chr', chr);
		time.parentNode.setAttribute('data-tip', tip);

		icon.remove(), detail.remove();
		item.append(info, title);
		list.append(item);
		item.onclick = e => {
			e.preventDefault()
			e.stopPropagation();
			applyAnim('l0rNG-open-tab', 'lor:/'+ item.getAttribute('href'));
 		}
	}
}
