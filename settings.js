
const loryform = document.getElementById('loryform');
const n_count  = document.getElementById('note-count');
const note_lst = document.getElementById('note-list');
const rst_btn  = document.getElementById('reset-settings');

let busy_id = -1, not_ld  = true,
	anim_id = -1, cnt_new = 0, my_port = null;

const showNotifications = () => {
	history.replaceState(null, null, location.pathname +'#notifications');
	note_lst.hidden = false;
	if (not_ld)
		updNotifications(cnt_new);
}

if (location.hash === '#notifications')
	note_lst.hidden = false;

const showAnimBanner = () => {
	if (anim_id !== -1)
		clearTimeout(anim_id);
	anim_id = setTimeout(() => {
		anim_id = -1;
		loryform.classList.add('hide-msg');
	}, 2e3);
	loryform.classList.remove('hide-msg');
}

loryform.addEventListener('change', ({ target }) => {
	if (busy_id === -1)
		onValueChange(target);
});
loryform.addEventListener('input', ({ target }) => {
	if (busy_id !== -1)
		clearTimeout(busy_id);
	busy_id = setTimeout(() => {
		busy_id = -1;
		onValueChange(target);
	}, 750);
});

rst_btn.addEventListener('click', () => sendCommand('reset-all'));
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
					sendCommand('set-notes', 0);
					document.forms.reset_form.remove();
				}
				el.id = 'reset-notes';
			});
		}
		break;
	}
});

const createPort = () => new Promise(resolve => {
	const port = chrome.runtime.connect({ name: 'lory-menu' });
	port.onMessage.addListener(({ action, data }) => {
		switch (action) {
		case 'notes-show':
			showNotifications();
			break;
		case 'notes-count-update':
			n_count.setAttribute('cnt-new', data);
			n_count.hidden = !(cnt_new = Number(data));
			if (!note_lst.hidden && not_ld)
				updNotifications(cnt_new);
			break;
		case 'connection-resolve':
			my_port = port;
			resolve(data);
			break;
		case 'settings-change':
			showAnimBanner();
			setValues(data);
		}
	});
	port.onDisconnect.addListener(() => {
		my_port = null;
	});
});

// init settings
Promise.all([createPort(), chrome.storage.local.get()]).then(([defs, vals]) => {
	setValues( Object.assign(defs, vals) );
});

const sendCommand = (action = '', data = null) => {
	if (my_port)
		my_port.postMessage({ action, data });
	else
		createPort().then(() => my_port.postMessage({ action, data }));
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
	let { name:k, type, min, max } = input;

	switch (type) {
	case 'checkbox'  : changes[k] = input.checked; break;
	case 'select-one': changes[k] = input.selectedIndex; break;
	default          : changes[k] = Number(input.value);
		// check range
		if (min && (min = Number(min)) > changes[k]) input.value = changes[k] = min; else
		if (max && (max = Number(max)) < changes[k]) input.value = changes[k] = max;
	}
	showAnimBanner();
	sendCommand('upd-setts', changes);
}

function setValues(items) {
	for (const key in items) {
		const el = loryform.elements[key],
		     val = items[key];
		if (!el)
			continue;
		switch (el.type) {
		case 'checkbox'  : el.checked = val; break;
		case 'select-one': el.selectedIndex = val; break;
		default          : el.value = el.type ? val : Number(val);
		}
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
			sendCommand('open-tab', 'lor:/'+ item.getAttribute('href'), false);
 		}
	}
}
