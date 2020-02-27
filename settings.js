
const loryform = document.forms['loryform'];
const savemsg  = () => loryform.classList.add('save-msg');
const notify   = document.getElementById('notifications');

chrome.runtime.getBackgroundPage( ({ notes, openTab, settings, defaults }) => {

	notify.hidden = !notes;
	notify.firstElementChild.textContent = notes;
	notify.firstElementChild.onclick = e => {
		e.preventDefault();
		notify.hidden = true;
		openTab();
	}
	setValues(settings);
	
	loryform.elements.resetSettings.addEventListener('click', () => {
		chrome.storage.sync.set(defaults, savemsg);
		setValues(defaults);
	});

	var busy_id = -1;
	loryform.addEventListener('animationend', () => loryform.classList.remove('save-msg'));
	loryform.addEventListener('change', ({ target }) => {
		if (busy_id == -1)
			onValueChange(target);
	});
	loryform.addEventListener('input', ({ target }) => {
		clearTimeout(busy_id);
		busy_id = setTimeout(() => {
			busy_id = -1;
			onValueChange(target);
		}, 750);
	});
});

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
	chrome.storage.sync.set(changes, savemsg);
}

function setValues(items) {
	for (const name in items) {
		loryform.elements[name][
			loryform.elements[name].type === 'checkbox'
			? 'checked'
			: 'value'] = items[name];
	}
}
