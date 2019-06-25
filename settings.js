
const loryform = document.forms['loryform'];
const applymsg = document.getElementById('applymsg');
const notify   = document.getElementById('notifications');

applymsg.addEventListener('animationend', () => applymsg.classList.remove('apply-anim'));

chrome.runtime.getBackgroundPage( ({ notes, openTab, settings, defaults }) => {
	
	var timer = null;
	
	notify.hidden = !notes;
	notify.firstElementChild.textContent = notes;
	notify.firstElementChild.onclick = () => {
		notify.hidden = true;
		openTab();
	}
	setValues(settings);
	
	loryform.elements.resetSettings.addEventListener('click', () => {
		chrome.storage.sync.set(defaults, () => applymsg.classList.add('apply-anim'));
		setValues(defaults);
	});
	
	loryform.onchange = onValueChange;
	loryform.addEventListener('input', evt => {
		clearTimeout(timer);
		timer = setTimeout(() => {
			loryform.onchange = () => { loryform.onchange = onValueChange };
			onValueChange(evt);
		}, 750);
	});

	function onValueChange({ target }) {
		clearTimeout(timer);
		switch (target.type) {
			case 'checkbox':
				settings[target.id] = target.checked;
				break;
			case 'number':
				const min = Number (target.min);
				settings[target.id] = target.valueAsNumber >= min ? target.valueAsNumber : (target.value = min);
		}
		chrome.storage.sync.set(settings, () => applymsg.classList.add('apply-anim'));
	}
});

function setValues(items) {
	for (let name in items) {
		loryform.elements[name][
			loryform.elements[name].type === 'checkbox'
			? 'checked'
			: 'value'] = items[name];
	}
}
