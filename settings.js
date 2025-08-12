
const [ loryform ] = document.forms;
const { notes_count, notes_stack } = document.body.children;

let busy_id = -1, ld_open = true,
	anim_id = -1, my_port = null;

const notesReset = form => fetch('https://www.linux.org.ru/notifications-reset', {
	credentials: 'same-origin',
	method: 'POST',
	body: new FormData( form )
}).then(({ ok }) => {
	if (ok) {
		form.remove();
		notes_count.setAttribute('cnt-new', '0');
		sendCommand('set-notes', 0);
	}
});

if (location.hash === '#notifications')
	notes_count.classList.add('ns-show');

const showAnimBanner = () => {
	if (anim_id !== -1)
		clearTimeout(anim_id);
	anim_id = setTimeout(() => {
		anim_id = -1;
		loryform.classList.remove('show-msg');
	}, 1700);
	loryform.classList.add('show-msg');
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

loryform.elements.reset_all.addEventListener('click', () => sendCommand('reset-all'));
notes_count.addEventListener('click', e => {
	const el = e.target, rf = document.forms.reset_form;
	switch (el.id) {
	case 'notes_nlupd':
		if(!el.classList.contains('do-wait')) {
			el.classList.add('do-wait');
			updNotifications(true).then(() => el.classList.remove('do-wait'));
		}
		break;
	case 'notes_reset':
		if(!el.classList.contains('do-wait') && rf) {
			el.classList.add('do-wait');
			notesReset(rf).then(() => el.classList.remove('do-wait'));
		}
		break;
	case 'notes_count':
		if (notes_count.classList.contains('ns-show'))
			break;
	case 'setts_gback':
		if (notes_count.classList.toggle('ns-show')) {
			history.replaceState(null, null, '#notifications');
			updNotifications();
		} else
			history.replaceState(null, null, location.pathname);
	}
});

notes_stack.addEventListener('click', e => {
	for (const a of notes_stack.children) {
		if (a.contains(e.target)) {
			sendCommand('open-tab', 'lor:/'+ a.getAttribute('href'), false);
			break;
		}
	}
	e.preventDefault();
});

const createPort = () => new Promise(resolve => {
	const port = chrome.runtime.connect({ name: 'lory-menu' });
	port.onMessage.addListener(({ action, data }) => {
		switch (action) {
		case 'notes-show':
			if(!notes_count.classList.contains('ns-show')) {
				notes_count.classList.add('ns-show');
				history.replaceState(null, null, '#notifications');
				updNotifications();
			}
			break;
		case 'notes-count-update':
			notes_count.setAttribute('cnt-new', data);
			notes_count.classList.add('upd-need');
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

const updNotifications = (do_upd = false) => {
	const tr_lst = Array.from(notes_stack.children);
	let  cnt_new = Number(notes_count.getAttribute('cnt-new'))
	let is_empty = tr_lst.length === 0;

	if (do_upd && tr_lst.length !== 0) {
		for (const tr of tr_lst)
			tr.remove();
		is_empty = true;
	}
	if (is_empty && cnt_new > 0) {
		notes_count.classList.remove('upd-need');
		return fetch('https://www.linux.org.ru/notifications', {
			credentials: 'same-origin',
			method: 'GET'
		}).then(res => {
			if (res.ok)
			    res.text().then(h => pullNotes(h, cnt_new));
		});
	} else
		return Promise.resolve();
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

function pullNotes(html, cnt_new = 0) {
	const doc = new DOMParser().parseFromString(html, 'text/html'),
	    items = Array.from(doc.querySelector('.notifications').children),
	   do_clr = loryform.elements['Сlear Notifications'].checked,
	    limit = cnt_new > items.length ? items.length : cnt_new;

	const new_rf = doc.forms.reset_form;
	const old_rf = document.forms.reset_form;

	if (new_rf) {
		new_rf.style.display = 'none';
		if (old_rf) {
			document.body.replaceChild(new_rf, old_rf);
		} else
			document.body.appendChild(new_rf);
		if (do_clr)
			notesReset(new_rf);
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
		notes_stack.append(item);
	}
}
